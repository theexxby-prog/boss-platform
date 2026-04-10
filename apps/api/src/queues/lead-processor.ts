// REF: boss-hq/worker/src/services/leadService.ts — lead processing pipeline, adapted for Cloudflare Queues
import type { MessageBatch } from "@cloudflare/workers-types";
import type { EnrichedLead, IcpProfile, ScoringResult, CustomQuestion, CustomAnswer } from "@boss/types";
import type { EnvBindings } from "../types";
import { dbFirst, dbRun } from "../db/client";
import { qualifyBant, type BantLead, type BantCriteria, type BantQualificationResult } from "../services/bant-qualifier";
import { ScoringError, BantQualificationError } from "../services/errors";

// ─── Message contract ─────────────────────────────────────────────────────────

export interface LeadProcessorMessage {
  lead_id: string;
  campaign_id: string;
  tenant_id: string;
}

// ─── DB row types (inline until Task 8 query layer exists in db/queries/) ──────

interface LeadRow {
  id: string;
  tenant_id: string;
  campaign_id: string;
  email: string;
  first_name: string | null;
  last_name: string | null;
  title: string | null;
  company: string | null;
  company_domain: string | null;
  linkedin_url: string | null;
  industry: string | null;
  company_size: string | null;
  country: string | null;
  state: string | null;
  seniority: string | null;
  tech_stack: string | null;       // JSON string
  email_status: string | null;
  email_score: number | null;
  dedup_hash: string;
  status: string;
  icp_score: number | null;
  icp_score_breakdown: string | null;
  icp_reasons: string | null;
  custom_answers: string | null;   // JSON string
}

interface CampaignRow {
  id: string;
  tenant_id: string;
  icp_profile_id: string;
  product_tier: string;
  leads_ordered: number;
  leads_delivered: number;
  daily_cap: number | null;
  status: string;
  bant_budget_min: string | null;
  bant_timeline: string | null;
  bant_need_desc: string | null;
  custom_questions: string | null; // JSON string
}

interface IcpProfileRow {
  id: string;
  client_id: string;
  industries: string;         // JSON
  company_sizes: string;      // JSON
  geographies: string;        // JSON
  titles_include: string;     // JSON
  titles_exclude: string;     // JSON
  seniorities: string;        // JSON
  tech_include: string;       // JSON
  tech_exclude: string;       // JSON
  weight_industry: number;
  weight_seniority: number;
  weight_company_size: number;
  weight_geography: number;
  weight_tech: number;
  min_score_accept: number;
  min_score_review: number;
}

// ─── CC-GATE stubs — implemented by Claude Code in their respective services ──

/**
 * ICP scorer stub — CC-GATE implemented in services/icp-scorer.ts.
 * Import the real implementation once Sprint 2 is merged:
 *   import { scoreLeadIcp } from "../services/icp-scorer";
 */
async function scoreLeadIcp(
  _lead: EnrichedLead,
  _profile: IcpProfile,
  _options: { minReviewScore: number; maxAutoAcceptScore: number; anthropicApiKey: string },
): Promise<ScoringResult> {
  // CC-GATE: real implementation lives in services/icp-scorer.ts
  // TODO: replace stub with: import { scoreLeadIcp } from "../services/icp-scorer"
  throw new ScoringError("CC_GATE_STUB", "CC-GATE: icp-scorer not yet wired into lead-processor");
}

/**
 * Custom question answering stub — CC-GATE (not yet implemented).
 */
async function answerCustomQuestions(
  _lead: EnrichedLead,
  _questions: CustomQuestion[],
): Promise<CustomAnswer[]> {
  // CC-GATE: Claude Code implements this using Claude API
  throw new ScoringError("CC_GATE_STUB", "CC-GATE: custom-Q answerer not yet implemented");
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function parseJsonField<T>(raw: string | null, fallback: T): T {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function rowToEnrichedLead(row: LeadRow): EnrichedLead {
  return {
    email: row.email,
    first_name: row.first_name ?? undefined,
    last_name: row.last_name ?? undefined,
    title: row.title ?? undefined,
    company: row.company ?? undefined,
    company_domain: row.company_domain ?? undefined,
    linkedin_url: row.linkedin_url ?? undefined,
    industry: row.industry ?? undefined,
    company_size: (row.company_size as EnrichedLead["company_size"]) ?? undefined,
    country: row.country ?? undefined,
    state: row.state ?? undefined,
    seniority: (row.seniority as EnrichedLead["seniority"]) ?? undefined,
    tech_stack: parseJsonField<string[]>(row.tech_stack, []),
    email_status: (row.email_status as EnrichedLead["email_status"]) ?? undefined,
    email_score: row.email_score ?? undefined,
  };
}

function rowToIcpProfile(row: IcpProfileRow): IcpProfile {
  return {
    id: row.id,
    client_id: row.client_id,
    industries: parseJsonField<string[]>(row.industries, []),
    company_sizes: parseJsonField<IcpProfile["company_sizes"]>(row.company_sizes, []),
    geographies: parseJsonField<string[]>(row.geographies, []),
    titles_include: parseJsonField<string[]>(row.titles_include, []),
    titles_exclude: parseJsonField<string[]>(row.titles_exclude, []),
    seniorities: parseJsonField<IcpProfile["seniorities"]>(row.seniorities, []),
    tech_include: parseJsonField<string[]>(row.tech_include, []),
    tech_exclude: parseJsonField<string[]>(row.tech_exclude, []),
    weight_industry: row.weight_industry,
    weight_seniority: row.weight_seniority,
    weight_company_size: row.weight_company_size,
    weight_geography: row.weight_geography,
    weight_tech: row.weight_tech,
    min_score_accept: row.min_score_accept,
    min_score_review: row.min_score_review,
  };
}

async function setLeadStatus(
  env: EnvBindings,
  tenantId: string,
  leadId: string,
  status: string,
  extra: Record<string, unknown> = {},
): Promise<void> {
  const fields = Object.keys(extra);
  if (fields.length === 0) {
    await dbRun(env.DB, "UPDATE leads SET status = ?, updated_at = ? WHERE tenant_id = ? AND id = ?", [
      status,
      Date.now(),
      tenantId,
      leadId,
    ]);
    return;
  }
  const setClauses = ["status = ?", "updated_at = ?", ...fields.map((f) => `${f} = ?`)].join(", ");
  const values = [status, Date.now(), ...fields.map((f) => extra[f]), tenantId, leadId];
  await dbRun(env.DB, `UPDATE leads SET ${setClauses} WHERE tenant_id = ? AND id = ?`, values);
}

async function createOpsQueueItem(
  env: EnvBindings,
  tenantId: string,
  leadId: string,
  taskType: string,
  description: string,
  priority = "normal",
): Promise<void> {
  const id = crypto.randomUUID();
  const now = Date.now();
  const slaDeadline = now + 24 * 60 * 60 * 1_000; // 24h SLA
  await dbRun(
    env.DB,
    `INSERT INTO ops_queue (id, tenant_id, lead_id, task_type, priority, description, status, sla_deadline, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, 'open', ?, ?, ?)`,
    [id, tenantId, leadId, taskType, priority, description, slaDeadline, now, now],
  );
}

// ─── Pipeline steps ───────────────────────────────────────────────────────────

async function stepEnrich(env: EnvBindings, lead: LeadRow): Promise<void> {
  await setLeadStatus(env, lead.tenant_id, lead.id, "enriching");
  // TODO: Sprint 2 Task 9 — call enrichment service here and save enriched fields
  // For now: status transitions are wired; enrichment fields updated by enrichment service
}

async function stepDedup(env: EnvBindings, lead: LeadRow): Promise<boolean> {
  const ninetyDaysAgo = Date.now() - 90 * 24 * 60 * 60 * 1_000;
  const existing = await dbFirst<{ id: string }>(
    env.DB,
    `SELECT id FROM leads
     WHERE tenant_id = ? AND dedup_hash = ? AND status != 'ingested'
       AND created_at >= ? AND id != ?
     LIMIT 1`,
    [lead.tenant_id, lead.dedup_hash, ninetyDaysAgo, lead.id],
  );
  if (existing) {
    await setLeadStatus(env, lead.tenant_id, lead.id, "duplicate");
    return true; // is duplicate
  }
  return false;
}

async function stepScore(
  env: EnvBindings,
  lead: LeadRow,
  enrichedLead: EnrichedLead,
  profile: IcpProfile,
): Promise<"accept" | "review" | "reject"> {
  await setLeadStatus(env, lead.tenant_id, lead.id, "scoring");
  try {
    const result = await scoreLeadIcp(enrichedLead, profile, {
      minReviewScore: profile.min_score_review,
      maxAutoAcceptScore: profile.min_score_accept,
      anthropicApiKey: env.ANTHROPIC_API_KEY ?? "",
    });
    await setLeadStatus(env, lead.tenant_id, lead.id, "scoring", {
      icp_score: result.score,
      icp_score_breakdown: JSON.stringify(result.breakdown),
      icp_reasons: JSON.stringify(result.reasons),
    });
    return result.decision;
  } catch (err) {
    await createOpsQueueItem(
      env,
      lead.tenant_id,
      lead.id,
      "icp_score_error",
      `ICP scoring failed: ${err instanceof Error ? err.message : String(err)}`,
      "high",
    );
    await setLeadStatus(env, lead.tenant_id, lead.id, "reviewing");
    return "review";
  }
}

async function stepCustomQ(
  env: EnvBindings,
  lead: LeadRow,
  enrichedLead: EnrichedLead,
  questions: CustomQuestion[],
): Promise<void> {
  if (questions.length === 0) return;
  try {
    const answers = await answerCustomQuestions(enrichedLead, questions);
    await setLeadStatus(env, lead.tenant_id, lead.id, lead.status, {
      custom_answers: JSON.stringify(answers),
    });
  } catch (err) {
    await createOpsQueueItem(
      env,
      lead.tenant_id,
      lead.id,
      "custom_q_error",
      `Custom Q answering failed: ${err instanceof Error ? err.message : String(err)}`,
    );
    await setLeadStatus(env, lead.tenant_id, lead.id, "reviewing");
    throw err; // stop processing
  }
}

async function stepBant(
  env: EnvBindings,
  lead: LeadRow,
  enrichedLead: EnrichedLead,
  campaign: CampaignRow,
): Promise<BantQualificationResult | null> {
  const bantLead: BantLead = { ...enrichedLead, lead_id: lead.id };
  const criteria: BantCriteria = {
    budget_signals: ["budget", "funding", "investment", "allocated"],
    authority_titles: ["CEO", "CTO", "CFO", "VP", "Director", "Head of", "Owner", "Founder"],
    need_industries: campaign.bant_need_desc ? [campaign.bant_need_desc] : [],
    timeline_signals: campaign.bant_timeline
      ? [campaign.bant_timeline, "ASAP", "urgent", "this quarter"]
      : ["ASAP", "urgent", "this quarter"],
  };

  let bantResult: BantQualificationResult;
  try {
    bantResult = await qualifyBant(bantLead, criteria, {
      qualificationThreshold: 50,
      anthropicApiKey: env.ANTHROPIC_API_KEY ?? "",
    });
  } catch (err) {
    await createOpsQueueItem(
      env,
      lead.tenant_id,
      lead.id,
      "bant_error",
      `BANT qualification failed: ${err instanceof Error ? err.message : String(err)}`,
      "high",
    );
    await setLeadStatus(env, lead.tenant_id, lead.id, "reviewing");
    return null;
  }

  // Save BANT results
  await setLeadStatus(env, lead.tenant_id, lead.id, lead.status, {
    bant_budget: String(bantResult.bant_breakdown.budget),
    bant_authority: String(bantResult.bant_breakdown.authority),
    bant_need: String(bantResult.bant_breakdown.need),
    bant_timeline: String(bantResult.bant_breakdown.timeline),
    bant_score: bantResult.bant_score,
    bant_notes: bantResult.bant_breakdown.reasoning,
    bant_confidence: bantResult.bant_score >= 75 ? "high" : bantResult.bant_score >= 50 ? "medium" : "low",
  });

  if (!bantResult.qualified) {
    await createOpsQueueItem(
      env,
      lead.tenant_id,
      lead.id,
      "bant_review",
      `BANT score ${bantResult.bant_score}/100 is below threshold (50). Manual review required.`,
    );
    await setLeadStatus(env, lead.tenant_id, lead.id, "reviewing");
    return null;
  }

  return bantResult;
}

async function stepDailyCapCheck(
  env: EnvBindings,
  lead: LeadRow,
  campaign: CampaignRow,
  batch: MessageBatch<LeadProcessorMessage>,
  message: { retry: (opts?: { delaySeconds?: number }) => void },
): Promise<boolean> {
  if (!campaign.daily_cap) return false; // no cap configured

  const todayStart = new Date();
  todayStart.setUTCHours(0, 0, 0, 0);

  const row = await dbFirst<{ cnt: number }>(
    env.DB,
    `SELECT COUNT(*) as cnt FROM leads
     WHERE tenant_id = ? AND campaign_id = ? AND delivered_at >= ?`,
    [lead.tenant_id, lead.campaign_id, todayStart.getTime()],
  );
  const todayCount = row?.cnt ?? 0;

  if (todayCount >= campaign.daily_cap) {
    // Re-queue with 1-hour delay — do not drop
    message.retry({ delaySeconds: 3_600 });
    return true; // at cap
  }
  return false;
}

// ─── Queue handler ────────────────────────────────────────────────────────────

/**
 * Processes lead-processor queue messages.
 * Export this as the `queue` handler on the Worker default export.
 *
 * Pipeline (from CODEX_MASTER_PROMPT_v2.md Part 8):
 *   1. Fetch lead + campaign from D1
 *   2. Enrich (status → 'enriching')
 *   3. Dedup check (90 days)
 *   4. ICP score (CC-GATE stub → status → 'scoring')
 *   5. Custom Q (CC-GATE stub, custom_q tier+)
 *   6. BANT qualification (real — this CC-GATE module)
 *   7. Daily cap check (re-queue with 1h delay if at cap)
 *   8. Accept (status → 'accepted')
 */
export async function processLeadQueue(
  batch: MessageBatch<LeadProcessorMessage>,
  env: EnvBindings,
): Promise<void> {
  for (const message of batch.messages) {
    const { lead_id, campaign_id, tenant_id } = message.body;

    // ── Step 1: Fetch lead + campaign ──────────────────────────────────────
    const leadRow = await dbFirst<LeadRow>(
      env.DB,
      "SELECT * FROM leads WHERE tenant_id = ? AND id = ? LIMIT 1",
      [tenant_id, lead_id],
    );

    if (!leadRow) {
      // Lead doesn't exist — ack and skip (can't recover)
      message.ack();
      continue;
    }

    if (leadRow.campaign_id !== campaign_id) {
      // Campaign mismatch — ack to prevent infinite retry
      message.ack();
      continue;
    }

    const campaignRow = await dbFirst<CampaignRow>(
      env.DB,
      "SELECT * FROM campaigns WHERE tenant_id = ? AND id = ? LIMIT 1",
      [tenant_id, campaign_id],
    );

    if (!campaignRow || campaignRow.status === "cancelled") {
      message.ack();
      continue;
    }

    const icpProfileRow = await dbFirst<IcpProfileRow>(
      env.DB,
      "SELECT * FROM icp_profiles WHERE id = ? LIMIT 1",
      [campaignRow.icp_profile_id],
    );

    if (!icpProfileRow) {
      await createOpsQueueItem(env, tenant_id, lead_id, "missing_icp", "ICP profile not found", "high");
      await setLeadStatus(env, tenant_id, lead_id, "reviewing");
      message.ack();
      continue;
    }

    try {
      const enrichedLead = rowToEnrichedLead(leadRow);
      const icpProfile = rowToIcpProfile(icpProfileRow);

      // ── Step 2: Enrich ───────────────────────────────────────────────────
      await stepEnrich(env, leadRow);

      // ── Step 3: Dedup check ──────────────────────────────────────────────
      const isDuplicate = await stepDedup(env, leadRow);
      if (isDuplicate) {
        message.ack();
        continue;
      }

      // ── Step 4: ICP score ────────────────────────────────────────────────
      const scoreDecision = await stepScore(env, leadRow, enrichedLead, icpProfile);

      if (scoreDecision === "reject") {
        await setLeadStatus(env, tenant_id, lead_id, "rejected", {
          rejection_reason: "ICP score below threshold",
        });
        message.ack();
        continue;
      }

      if (scoreDecision === "review") {
        // ops_queue already created in stepScore
        message.ack();
        continue;
      }

      // ── Step 5: Custom Q (custom_q, bant, bant_appt tiers) ───────────────
      const tier = campaignRow.product_tier;
      const isCustomQTier = tier === "custom_q" || tier === "bant" || tier === "bant_appt";
      if (isCustomQTier) {
        const questions = parseJsonField<CustomQuestion[]>(campaignRow.custom_questions, []);
        try {
          await stepCustomQ(env, leadRow, enrichedLead, questions);
        } catch {
          // stepCustomQ already set status → 'reviewing' and created ops_queue
          message.ack();
          continue;
        }
      }

      // ── Step 6: BANT qualification (bant, bant_appt tiers) ───────────────
      const isBantTier = tier === "bant" || tier === "bant_appt";
      if (isBantTier) {
        const bantResult = await stepBant(env, leadRow, enrichedLead, campaignRow);
        if (!bantResult) {
          // stepBant set status → 'reviewing' or 'rejected'
          message.ack();
          continue;
        }
      }

      // ── Step 7: Daily cap check ───────────────────────────────────────────
      const atCap = await stepDailyCapCheck(env, leadRow, campaignRow, batch, message);
      if (atCap) {
        // message.retry() already called — do not ack
        continue;
      }

      // ── Step 8: Accept ────────────────────────────────────────────────────
      await setLeadStatus(env, tenant_id, lead_id, "accepted");
      message.ack();
    } catch (err) {
      // Unhandled error — create ops_queue record, set to reviewing
      // Cloudflare Queues will retry automatically (up to max_retries config)
      // On max retries exceeded, message goes to DLQ (configured in wrangler.toml)
      await createOpsQueueItem(
        env,
        tenant_id,
        lead_id,
        "pipeline_error",
        `Unhandled pipeline error: ${err instanceof Error ? err.message : String(err)}`,
        "high",
      ).catch(() => undefined); // never throw from error handler

      await setLeadStatus(env, tenant_id, lead_id, "reviewing").catch(() => undefined);

      // Do NOT ack — let Cloudflare retry
      message.retry();
    }
  }
}

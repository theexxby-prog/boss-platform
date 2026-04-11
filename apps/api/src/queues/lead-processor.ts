// REF: boss-hq/worker/src/services/leadService.ts — state-machine style lifecycle transitions
// CC-GATE 2: qualifyBant stub replaced with real implementation from services/bant-qualifier

import type { EnrichedLead, IcpProfile, RawLead, ScoringResult } from "@boss/types";
import type { D1Database, KVNamespace, Queue } from "@cloudflare/workers-types";

import {
  checkDuplicateEmail,
  createOpsQueueEntry,
  getCampaignById,
  getCampaignDailyDeliveryCount,
  getCustomQuestionsByCampaign,
  getIcpProfileByCampaign,
  getLeadById,
  updateLeadBant,
  updateLeadScore,
  updateLeadStatus,
} from "../db/queries/index";
import { scoreLeadIcp } from "../services/icp-scorer";
import { enrichLead } from "../services/enrichment";
import { ProcessingError } from "../services/errors";
import { qualifyBant, type BantLead, type BantCriteria } from "../services/bant-qualifier";
import { answerCustomQuestions } from "../services/custom-q-answerer";

export interface LeadProcessorMessage {
  lead_id: string;
  campaign_id: string;
  tenant_id: string;
  retry_count?: number;
}

export interface ProcessLeadEnv {
  DB: D1Database;
  KV: KVNamespace;
  QUEUE: Queue;
  ANTHROPIC_API_KEY: string;
  ZEROBOUNCE_API_KEY: string;
  APOLLO_API_KEY: string;
  CLEARBIT_API_KEY: string;
}

async function enqueueOpsReview(env: ProcessLeadEnv, message: LeadProcessorMessage, description: string): Promise<void> {
  await createOpsQueueEntry(env.DB, message.tenant_id, {
    lead_id: message.lead_id,
    task_type: "lead_review",
    priority: "high",
    description,
    assigned_to: null,
    status: "open",
    resolution: null,
    resolved_at: null,
    sla_deadline: Date.now() + 24 * 60 * 60 * 1000,
    updated_at: Date.now(),
  });
}

function toRawLead(record: Awaited<ReturnType<typeof getLeadById>>): RawLead {
  if (!record) {
    throw new ProcessingError("LEAD_NOT_FOUND", "Lead not found for processing");
  }
  return {
    first_name: record.first_name ?? undefined,
    last_name: record.last_name ?? undefined,
    email: record.email,
    phone: record.phone ?? undefined,
    title: record.title ?? undefined,
    company: record.company ?? undefined,
    company_domain: record.company_domain ?? undefined,
    linkedin_url: record.linkedin_url ?? undefined,
  };
}

async function handleFailure(env: ProcessLeadEnv, message: LeadProcessorMessage, error: unknown): Promise<void> {
  const retries = message.retry_count ?? 0;
  if (retries >= 3) {
    await env.KV.put(
      `alerts:dlq:${message.tenant_id}:${message.lead_id}`,
      JSON.stringify({
        error: error instanceof Error ? error.message : String(error),
        message,
        at: Date.now(),
      }),
      { expirationTtl: 7 * 24 * 60 * 60 },
    );
    await updateLeadStatus(env.DB, message.tenant_id, message.lead_id, "reviewing", "Moved to DLQ after max retries");
    await enqueueOpsReview(env, message, "Lead moved to DLQ after 3 retries");
    return;
  }

  await updateLeadStatus(env.DB, message.tenant_id, message.lead_id, "reviewing", "Processing error — sent to ops queue");
  await enqueueOpsReview(
    env,
    message,
    `Processing error: ${error instanceof Error ? error.message : String(error)}`,
  );
}

export async function processLead(message: LeadProcessorMessage, env: ProcessLeadEnv): Promise<void> {
  try {
    await updateLeadStatus(env.DB, message.tenant_id, message.lead_id, "enriching");
    const leadRecord = await getLeadById(env.DB, message.tenant_id, message.lead_id);
    if (!leadRecord) {
      throw new ProcessingError("LEAD_NOT_FOUND", "Lead not found");
    }

    // ── Step 2: Dedup check (90 days of delivered leads) ─────────────────────
    const duplicate = await checkDuplicateEmail(env.DB, message.tenant_id, leadRecord.email, 90);
    if (duplicate) {
      await updateLeadStatus(env.DB, message.tenant_id, message.lead_id, "duplicate", "Duplicate delivered email");
      return;
    }

    // ── Step 1 continued: Enrich ──────────────────────────────────────────────
    let enrichedLead: EnrichedLead;
    try {
      enrichedLead = await enrichLead(toRawLead(leadRecord), message.tenant_id, {
        zeroBouncerApiKey: env.ZEROBOUNCE_API_KEY,
        apolloApiKey: env.APOLLO_API_KEY,
        clearbitApiKey: env.CLEARBIT_API_KEY,
      });
    } catch (error) {
      await updateLeadStatus(env.DB, message.tenant_id, message.lead_id, "reviewing", "Enrichment failed");
      await enqueueOpsReview(
        env,
        message,
        `Enrichment failed: ${error instanceof Error ? error.message : String(error)}`,
      );
      return;
    }

    // ── Step 3: ICP score ─────────────────────────────────────────────────────
    await updateLeadStatus(env.DB, message.tenant_id, message.lead_id, "scoring");
    const icpProfile = await getIcpProfileByCampaign(env.DB, message.tenant_id, message.campaign_id);
    if (!icpProfile) {
      throw new ProcessingError("ICP_PROFILE_NOT_FOUND", "No ICP profile associated with campaign");
    }

    const scoring: ScoringResult = await scoreLeadIcp(enrichedLead, icpProfile as IcpProfile, {
      anthropicApiKey: env.ANTHROPIC_API_KEY,
      minReviewScore: icpProfile.min_score_review,
      maxAutoAcceptScore: icpProfile.min_score_accept,
    });
    await updateLeadScore(env.DB, message.tenant_id, message.lead_id, scoring.score, scoring.breakdown);

    // ── Step 4: Route by score ────────────────────────────────────────────────
    if (scoring.score < icpProfile.min_score_review) {
      await updateLeadStatus(env.DB, message.tenant_id, message.lead_id, "rejected", "ICP score below threshold");
      return;
    }

    if (scoring.score < icpProfile.min_score_accept) {
      await updateLeadStatus(env.DB, message.tenant_id, message.lead_id, "reviewing", "Needs manual review");
      await enqueueOpsReview(env, message, "Score in review band");
      return;
    }

    const campaign = await getCampaignById(env.DB, message.tenant_id, message.campaign_id);
    if (!campaign) throw new ProcessingError("CAMPAIGN_NOT_FOUND", "Campaign not found");

    // ── Step 5: Custom Q (custom_q, bant, bant_appt tiers) ───────────────────
    if (campaign.product_tier !== "mql") {
      const questions = await getCustomQuestionsByCampaign(env.DB, message.tenant_id, message.campaign_id);
      if (questions.length > 0) {
        let customAnswers;
        try {
          customAnswers = await answerCustomQuestions(enrichedLead, questions, {
            anthropicApiKey: env.ANTHROPIC_API_KEY,
          });
        } catch (error) {
          await updateLeadStatus(
            env.DB,
            message.tenant_id,
            message.lead_id,
            "reviewing",
            "Custom Q answering failed",
          );
          await enqueueOpsReview(
            env,
            message,
            `Custom Q error: ${error instanceof Error ? error.message : String(error)}`,
          );
          return;
        }
        // Persist answers as JSON to the leads row
        await env.DB.prepare(
          `UPDATE leads SET custom_answers = ?, updated_at = ? WHERE id = ? AND tenant_id = ?`,
        ).bind(
          JSON.stringify(customAnswers),
          Date.now(),
          message.lead_id,
          message.tenant_id,
        ).run();
      }
    }

    // ── Step 6: BANT qualification (bant, bant_appt tiers) ───────────────────
    // CC-GATE 2: real implementation — replaces stub from Sprint 2
    if (campaign.product_tier === "bant" || campaign.product_tier === "bant_appt") {
      const bantLead: BantLead = { ...enrichedLead, lead_id: message.lead_id };
      const bantCriteria: BantCriteria = {
        budget_signals: ["budget", "funding", "investment", "allocated", "approved"],
        authority_titles: ["CEO", "CTO", "CFO", "VP", "Director", "Head of", "Owner", "Founder"],
        need_industries: [], // TODO: Sprint 3 — derive from campaign.bant_need_desc
        timeline_signals: ["ASAP", "urgent", "this quarter", "Q2", "Q3", "Q4", "end of year"],
      };

      let bantResult;
      try {
        bantResult = await qualifyBant(bantLead, bantCriteria, {
          qualificationThreshold: 50,
          anthropicApiKey: env.ANTHROPIC_API_KEY,
        });
      } catch (error) {
        await updateLeadStatus(
          env.DB,
          message.tenant_id,
          message.lead_id,
          "reviewing",
          "BANT qualification error",
        );
        await enqueueOpsReview(
          env,
          message,
          `BANT error: ${error instanceof Error ? error.message : String(error)}`,
        );
        return;
      }

      // Persist BANT dimension scores and reasoning to D1
      await updateLeadBant(env.DB, message.tenant_id, message.lead_id, {
        bant_budget: String(bantResult.bant_breakdown.budget),
        bant_authority: String(bantResult.bant_breakdown.authority),
        bant_need: String(bantResult.bant_breakdown.need),
        bant_timeline: String(bantResult.bant_breakdown.timeline),
        bant_score: bantResult.bant_score,
        bant_notes: bantResult.bant_breakdown.reasoning,
        bant_confidence: bantResult.bant_score >= 75 ? "high" : bantResult.bant_score >= 50 ? "medium" : "low",
      });

      if (!bantResult.qualified) {
        await updateLeadStatus(
          env.DB,
          message.tenant_id,
          message.lead_id,
          "reviewing",
          `BANT score ${bantResult.bant_score}/100 below threshold`,
        );
        await enqueueOpsReview(
          env,
          message,
          `BANT score ${bantResult.bant_score}/100 is below qualification threshold (50). Manual review required.`,
        );
        return;
      }
    }

    // ── Step 7: Daily cap check (re-queue with 1h delay if at cap) ────────────
    if (campaign.daily_cap !== null) {
      const todayIso = new Date().toISOString().slice(0, 10);
      const dailyCount = await getCampaignDailyDeliveryCount(env.DB, message.tenant_id, message.campaign_id, todayIso);
      if (dailyCount >= campaign.daily_cap) {
        await (env.QUEUE as Queue).send(
          { ...message, retry_count: (message.retry_count ?? 0) + 1 },
          { delaySeconds: 3600 } as unknown as undefined,
        );
        await enqueueOpsReview(env, message, "Daily cap reached, lead re-queued with 1h delay");
        return;
      }
    }

    // ── Step 8: Accept ────────────────────────────────────────────────────────
    await updateLeadStatus(env.DB, message.tenant_id, message.lead_id, "accepted");
  } catch (error) {
    await handleFailure(env, message, error);
  }
}

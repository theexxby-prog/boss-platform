// REF: boss-hq/worker/src/services/leadService.ts — state-machine style lifecycle transitions

import type { BantResult, CustomAnswer, CustomQuestion, EnrichedLead, IcpProfile, RawLead, ScoringResult } from "@boss/types";
import type { D1Database, KVNamespace, Queue } from "@cloudflare/workers-types";

import {
  checkDuplicateEmail,
  createOpsQueueEntry,
  getCampaignById,
  getCampaignDailyDeliveryCount,
  getCustomQuestionsByCampaign,
  getIcpProfileByCampaign,
  getLeadById,
  updateLeadScore,
  updateLeadStatus,
} from "../db/queries/index";
import { scoreLeadIcp } from "../services/icp-scorer";
import { enrichLead } from "../services/enrichment";
import { ProcessingError } from "../services/errors";

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

interface BantCriteria {
  min_budget?: string;
  timeline?: string;
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

// CC-GATE: custom Q answerer stub
async function answerCustomQuestions(_lead: EnrichedLead, _questions: CustomQuestion[]): Promise<CustomAnswer[]> {
  // CC-GATE: Claude Code implements this using Claude API
  throw new Error("CC-GATE: custom-Q answerer not yet implemented");
}

// CC-GATE: BANT qualifier stub
async function qualifyBant(_lead: EnrichedLead, _criteria: BantCriteria): Promise<BantResult> {
  // CC-GATE: Claude Code implements this using Claude API
  throw new Error("CC-GATE: bant-qualifier not yet implemented");
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

    const duplicate = await checkDuplicateEmail(env.DB, message.tenant_id, leadRecord.email, 90);
    if (duplicate) {
      await updateLeadStatus(env.DB, message.tenant_id, message.lead_id, "duplicate", "Duplicate delivered email");
      return;
    }

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

    if (campaign.product_tier !== "mql") {
      const questions = await getCustomQuestionsByCampaign(env.DB, message.tenant_id, message.campaign_id);
      if (questions.length > 0) {
        try {
          await answerCustomQuestions(enrichedLead, questions);
        } catch (error) {
          await updateLeadStatus(
            env.DB,
            message.tenant_id,
            message.lead_id,
            "reviewing",
            "Custom question answerer requires CC-GATE implementation",
          );
          await enqueueOpsReview(
            env,
            message,
            `Custom Q gate: ${error instanceof Error ? error.message : String(error)}`,
          );
          return;
        }
      }
    }

    if (campaign.product_tier === "bant" || campaign.product_tier === "bant_appt") {
      try {
        await qualifyBant(enrichedLead, {});
      } catch (error) {
        await updateLeadStatus(
          env.DB,
          message.tenant_id,
          message.lead_id,
          "reviewing",
          "BANT qualifier requires CC-GATE implementation",
        );
        await enqueueOpsReview(env, message, `BANT gate: ${error instanceof Error ? error.message : String(error)}`);
        return;
      }
    }

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

    await updateLeadStatus(env.DB, message.tenant_id, message.lead_id, "accepted");
  } catch (error) {
    await handleFailure(env, message, error);
  }
}

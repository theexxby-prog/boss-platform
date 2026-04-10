// REF: boss-hq/worker/src/db.ts — thin typed D1 helper pattern

import type { D1Database } from "@cloudflare/workers-types";
import type { CustomQuestion, IcpProfile, IcpScoreBreakdown, LeadStatus, ProductTier } from "@boss/types";

import { dbAll, dbFirst, dbRun } from "../client";
import { QueryError } from "../../services/errors";

export interface Lead {
  lead_id: string;
  tenant_id: string;
  campaign_id: string;
  first_name: string | null;
  last_name: string | null;
  email: string;
  phone: string | null;
  title: string | null;
  company: string | null;
  company_domain: string | null;
  linkedin_url: string | null;
  industry: string | null;
  company_size: string | null;
  country: string | null;
  state: string | null;
  seniority: string | null;
  tech_stack: string;
  email_status: string | null;
  email_score: number | null;
  icp_score: number | null;
  icp_score_breakdown: string | null;
  icp_reasons: string;
  custom_answers: string;
  bant_budget: string | null;
  bant_authority: string | null;
  bant_need: string | null;
  bant_timeline: string | null;
  bant_score: number | null;
  bant_confidence: string | null;
  bant_notes: string | null;
  appt_scheduled_at: number | null;
  appt_calendar_link: string | null;
  appt_status: string | null;
  status: string;
  rejection_reason: string | null;
  ops_reviewer_id: string | null;
  delivered_at: number | null;
  delivery_batch_id: string | null;
  client_rejected: number;
  client_rejected_reason: string | null;
  client_rejected_at: number | null;
  replacement_lead_id: string | null;
  dedup_hash: string;
  source_domain: string | null;
  created_at: number;
  updated_at: number;
}

export interface Campaign {
  campaign_id: string;
  tenant_id: string;
  client_id: string;
  icp_profile_id: string;
  name: string;
  product_tier: ProductTier;
  leads_ordered: number;
  leads_delivered: number;
  cpl: number;
  daily_cap: number | null;
  status: string;
  custom_questions: string;
}

export interface OpsQueueEntry {
  queue_id: string;
  tenant_id: string;
  lead_id: string | null;
  task_type: string;
  priority: string;
  description: string;
  assigned_to: string | null;
  status: string;
  resolution: string | null;
  resolved_at: number | null;
  sla_deadline: number;
  created_at: number;
  updated_at: number;
}

interface IcpProfileRow {
  id: string;
  client_id: string;
  industries: string;
  company_sizes: string;
  geographies: string;
  titles_include: string;
  titles_exclude: string;
  seniorities: string;
  tech_include: string;
  tech_exclude: string;
  weight_industry: number;
  weight_seniority: number;
  weight_company_size: number;
  weight_geography: number;
  weight_tech: number;
  min_score_accept: number;
  min_score_review: number;
}

function parseJsonArray<T>(value: string | null | undefined, fallback: T[]): T[] {
  if (!value) return fallback;
  try {
    const parsed = JSON.parse(value) as T[];
    return Array.isArray(parsed) ? parsed : fallback;
  } catch {
    return fallback;
  }
}

function toLead(row: Record<string, unknown>): Lead {
  return row as unknown as Lead;
}

function toIcpProfile(row: IcpProfileRow): IcpProfile {
  return {
    id: row.id,
    client_id: row.client_id,
    industries: parseJsonArray(row.industries, []),
    company_sizes: parseJsonArray(row.company_sizes, []),
    geographies: parseJsonArray(row.geographies, []),
    titles_include: parseJsonArray(row.titles_include, []),
    titles_exclude: parseJsonArray(row.titles_exclude, []),
    seniorities: parseJsonArray(row.seniorities, []),
    tech_include: parseJsonArray(row.tech_include, []),
    tech_exclude: parseJsonArray(row.tech_exclude, []),
    weight_industry: row.weight_industry,
    weight_seniority: row.weight_seniority,
    weight_company_size: row.weight_company_size,
    weight_geography: row.weight_geography,
    weight_tech: row.weight_tech,
    min_score_accept: row.min_score_accept,
    min_score_review: row.min_score_review,
  };
}

function queryError(functionName: string, tenantId: string, error: unknown): QueryError {
  return new QueryError("QUERY_FAILED", `${functionName} failed`, {
    tenant_id: tenantId,
    error: error instanceof Error ? error.message : String(error),
  });
}

function selectLeadColumns(): string {
  return `
    id AS lead_id,
    tenant_id,
    campaign_id,
    first_name,
    last_name,
    email,
    phone,
    title,
    company,
    company_domain,
    linkedin_url,
    industry,
    company_size,
    country,
    state,
    seniority,
    tech_stack,
    email_status,
    email_score,
    icp_score,
    icp_score_breakdown,
    icp_reasons,
    custom_answers,
    bant_budget,
    bant_authority,
    bant_need,
    bant_timeline,
    bant_score,
    bant_confidence,
    bant_notes,
    appt_scheduled_at,
    appt_calendar_link,
    appt_status,
    status,
    rejection_reason,
    ops_reviewer_id,
    delivered_at,
    delivery_batch_id,
    client_rejected,
    client_rejected_reason,
    client_rejected_at,
    replacement_lead_id,
    dedup_hash,
    source_domain,
    created_at,
    updated_at
  `;
}

// Leads queries
export async function getLeadById(db: D1Database, tenantId: string, leadId: string): Promise<Lead | null> {
  try {
    const row = await dbFirst<Record<string, unknown>>(
      db,
      `SELECT ${selectLeadColumns()} FROM leads WHERE tenant_id = ? AND id = ? LIMIT 1`,
      [tenantId, leadId],
    );
    return row ? toLead(row) : null;
  } catch (error) {
    throw queryError("getLeadById", tenantId, error);
  }
}

export async function getLeadsByEmail(db: D1Database, tenantId: string, email: string): Promise<Lead[]> {
  try {
    const rows = await dbAll<Record<string, unknown>>(
      db,
      `SELECT ${selectLeadColumns()} FROM leads WHERE tenant_id = ? AND email = ? ORDER BY created_at DESC`,
      [tenantId, email.toLowerCase()],
    );
    return rows.map(toLead);
  } catch (error) {
    throw queryError("getLeadsByEmail", tenantId, error);
  }
}

export async function getLeadsByStatus(db: D1Database, tenantId: string, status: LeadStatus): Promise<Lead[]> {
  try {
    const rows = await dbAll<Record<string, unknown>>(
      db,
      `SELECT ${selectLeadColumns()} FROM leads WHERE tenant_id = ? AND status = ? ORDER BY created_at DESC`,
      [tenantId, status],
    );
    return rows.map(toLead);
  } catch (error) {
    throw queryError("getLeadsByStatus", tenantId, error);
  }
}

export async function createLead(
  db: D1Database,
  tenantId: string,
  data: Omit<Lead, "lead_id" | "tenant_id" | "created_at" | "updated_at">,
): Promise<Lead> {
  try {
    const leadId = crypto.randomUUID();
    const now = Date.now();
    await dbRun(
      db,
      `INSERT INTO leads (
        id, tenant_id, campaign_id, first_name, last_name, email, phone, title, company, company_domain, linkedin_url,
        industry, company_size, country, state, seniority, tech_stack, email_status, email_score, icp_score, icp_score_breakdown,
        icp_reasons, custom_answers, bant_budget, bant_authority, bant_need, bant_timeline, bant_score, bant_confidence, bant_notes,
        appt_scheduled_at, appt_calendar_link, appt_status, status, rejection_reason, ops_reviewer_id, delivered_at, delivery_batch_id,
        client_rejected, client_rejected_reason, client_rejected_at, replacement_lead_id, dedup_hash, source_domain, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        leadId,
        tenantId,
        data.campaign_id,
        data.first_name,
        data.last_name,
        data.email.toLowerCase(),
        data.phone,
        data.title,
        data.company,
        data.company_domain,
        data.linkedin_url,
        data.industry,
        data.company_size,
        data.country,
        data.state,
        data.seniority,
        data.tech_stack,
        data.email_status,
        data.email_score,
        data.icp_score,
        data.icp_score_breakdown,
        data.icp_reasons,
        data.custom_answers,
        data.bant_budget,
        data.bant_authority,
        data.bant_need,
        data.bant_timeline,
        data.bant_score,
        data.bant_confidence,
        data.bant_notes,
        data.appt_scheduled_at,
        data.appt_calendar_link,
        data.appt_status,
        data.status,
        data.rejection_reason,
        data.ops_reviewer_id,
        data.delivered_at,
        data.delivery_batch_id,
        data.client_rejected,
        data.client_rejected_reason,
        data.client_rejected_at,
        data.replacement_lead_id,
        data.dedup_hash,
        data.source_domain,
        now,
        now,
      ],
    );

    const created = await getLeadById(db, tenantId, leadId);
    if (!created) throw new Error("lead insert succeeded but read-back failed");
    return created;
  } catch (error) {
    throw queryError("createLead", tenantId, error);
  }
}

export async function updateLeadStatus(
  db: D1Database,
  tenantId: string,
  leadId: string,
  status: LeadStatus,
  reason?: string,
): Promise<void> {
  try {
    const now = Date.now();
    await dbRun(
      db,
      "UPDATE leads SET status = ?, rejection_reason = ?, updated_at = ? WHERE tenant_id = ? AND id = ?",
      [status, reason ?? null, now, tenantId, leadId],
    );
  } catch (error) {
    throw queryError("updateLeadStatus", tenantId, error);
  }
}

export async function updateLeadScore(
  db: D1Database,
  tenantId: string,
  leadId: string,
  icp_score: number,
  breakdown: IcpScoreBreakdown,
): Promise<void> {
  try {
    await dbRun(
      db,
      "UPDATE leads SET icp_score = ?, icp_score_breakdown = ?, updated_at = ? WHERE tenant_id = ? AND id = ?",
      [icp_score, JSON.stringify(breakdown), Date.now(), tenantId, leadId],
    );
  } catch (error) {
    throw queryError("updateLeadScore", tenantId, error);
  }
}

export interface LeadBantUpdate {
  bant_budget: string;
  bant_authority: string;
  bant_need: string;
  bant_timeline: string;
  bant_score: number;
  bant_notes: string;
  bant_confidence: "high" | "medium" | "low";
}

export async function updateLeadBant(
  db: D1Database,
  tenantId: string,
  leadId: string,
  data: LeadBantUpdate,
): Promise<void> {
  try {
    await dbRun(
      db,
      `UPDATE leads
         SET bant_budget = ?, bant_authority = ?, bant_need = ?, bant_timeline = ?,
             bant_score = ?, bant_notes = ?, bant_confidence = ?, updated_at = ?
       WHERE tenant_id = ? AND id = ?`,
      [
        data.bant_budget,
        data.bant_authority,
        data.bant_need,
        data.bant_timeline,
        data.bant_score,
        data.bant_notes,
        data.bant_confidence,
        Date.now(),
        tenantId,
        leadId,
      ],
    );
  } catch (error) {
    throw queryError("updateLeadBant", tenantId, error);
  }
}

export async function checkDuplicateEmail(
  db: D1Database,
  tenantId: string,
  email: string,
  daysSince = 90,
): Promise<boolean> {
  try {
    const cutoff = Date.now() - daysSince * 24 * 60 * 60 * 1000;
    const row = await dbFirst<{ count: number }>(
      db,
      "SELECT COUNT(1) AS count FROM leads WHERE tenant_id = ? AND email = ? AND delivered_at IS NOT NULL AND delivered_at >= ?",
      [tenantId, email.toLowerCase(), cutoff],
    );
    return (row?.count ?? 0) > 0;
  } catch (error) {
    throw queryError("checkDuplicateEmail", tenantId, error);
  }
}

export async function getLeadsByIds(db: D1Database, tenantId: string, leadIds: string[]): Promise<Lead[]> {
  try {
    if (!leadIds.length) return [];
    const placeholders = leadIds.map(() => "?").join(", ");
    const rows = await dbAll<Record<string, unknown>>(
      db,
      `SELECT ${selectLeadColumns()} FROM leads WHERE tenant_id = ? AND id IN (${placeholders})`,
      [tenantId, ...leadIds],
    );
    return rows.map(toLead);
  } catch (error) {
    throw queryError("getLeadsByIds", tenantId, error);
  }
}

// Campaign queries
export async function getCampaignById(
  db: D1Database,
  tenantId: string,
  campaignId: string,
): Promise<Campaign | null> {
  try {
    return dbFirst<Campaign>(
      db,
      `SELECT
        id AS campaign_id,
        tenant_id,
        client_id,
        icp_profile_id,
        name,
        product_tier,
        leads_ordered,
        leads_delivered,
        cpl,
        daily_cap,
        status,
        custom_questions
      FROM campaigns
      WHERE tenant_id = ? AND id = ?
      LIMIT 1`,
      [tenantId, campaignId],
    );
  } catch (error) {
    throw queryError("getCampaignById", tenantId, error);
  }
}

export async function getCampaignsByStatus(
  db: D1Database,
  tenantId: string,
  status: string,
): Promise<Campaign[]> {
  try {
    return dbAll<Campaign>(
      db,
      `SELECT
        id AS campaign_id,
        tenant_id,
        client_id,
        icp_profile_id,
        name,
        product_tier,
        leads_ordered,
        leads_delivered,
        cpl,
        daily_cap,
        status,
        custom_questions
      FROM campaigns
      WHERE tenant_id = ? AND status = ?`,
      [tenantId, status],
    );
  } catch (error) {
    throw queryError("getCampaignsByStatus", tenantId, error);
  }
}

export async function getCampaignDailyDeliveryCount(
  db: D1Database,
  tenantId: string,
  campaignId: string,
  date: string,
): Promise<number> {
  try {
    const start = new Date(`${date}T00:00:00.000Z`).getTime();
    const end = new Date(`${date}T23:59:59.999Z`).getTime();
    const row = await dbFirst<{ count: number }>(
      db,
      `SELECT COUNT(1) AS count
       FROM leads
       WHERE tenant_id = ? AND campaign_id = ? AND delivered_at IS NOT NULL AND delivered_at BETWEEN ? AND ?`,
      [tenantId, campaignId, start, end],
    );
    return row?.count ?? 0;
  } catch (error) {
    throw queryError("getCampaignDailyDeliveryCount", tenantId, error);
  }
}

// ICP Profile queries
export async function getIcpProfileById(
  db: D1Database,
  tenantId: string,
  profileId: string,
): Promise<IcpProfile | null> {
  try {
    const row = await dbFirst<IcpProfileRow>(
      db,
      `SELECT
        p.id,
        p.client_id,
        p.industries,
        p.company_sizes,
        p.geographies,
        p.titles_include,
        p.titles_exclude,
        p.seniorities,
        p.tech_include,
        p.tech_exclude,
        p.weight_industry,
        p.weight_seniority,
        p.weight_company_size,
        p.weight_geography,
        p.weight_tech,
        p.min_score_accept,
        p.min_score_review
      FROM icp_profiles p
      INNER JOIN clients c ON c.id = p.client_id
      WHERE c.tenant_id = ? AND p.id = ?
      LIMIT 1`,
      [tenantId, profileId],
    );
    return row ? toIcpProfile(row) : null;
  } catch (error) {
    throw queryError("getIcpProfileById", tenantId, error);
  }
}

export async function getIcpProfileByCampaign(
  db: D1Database,
  tenantId: string,
  campaignId: string,
): Promise<IcpProfile | null> {
  try {
    const row = await dbFirst<IcpProfileRow>(
      db,
      `SELECT
        p.id,
        p.client_id,
        p.industries,
        p.company_sizes,
        p.geographies,
        p.titles_include,
        p.titles_exclude,
        p.seniorities,
        p.tech_include,
        p.tech_exclude,
        p.weight_industry,
        p.weight_seniority,
        p.weight_company_size,
        p.weight_geography,
        p.weight_tech,
        p.min_score_accept,
        p.min_score_review
      FROM campaigns cm
      INNER JOIN icp_profiles p ON p.id = cm.icp_profile_id
      WHERE cm.tenant_id = ? AND cm.id = ?
      LIMIT 1`,
      [tenantId, campaignId],
    );
    return row ? toIcpProfile(row) : null;
  } catch (error) {
    throw queryError("getIcpProfileByCampaign", tenantId, error);
  }
}

// Custom Question queries
export async function getCustomQuestionsByCampaign(
  db: D1Database,
  tenantId: string,
  campaignId: string,
): Promise<CustomQuestion[]> {
  try {
    const row = await dbFirst<{ custom_questions: string | null }>(
      db,
      "SELECT custom_questions FROM campaigns WHERE tenant_id = ? AND id = ? LIMIT 1",
      [tenantId, campaignId],
    );
    return parseJsonArray<CustomQuestion>(row?.custom_questions, []);
  } catch (error) {
    throw queryError("getCustomQuestionsByCampaign", tenantId, error);
  }
}

// Ops queue queries
export async function createOpsQueueEntry(
  db: D1Database,
  tenantId: string,
  data: Omit<OpsQueueEntry, "queue_id" | "tenant_id" | "created_at">,
): Promise<string> {
  try {
    const now = Date.now();
    const id = crypto.randomUUID();
    await dbRun(
      db,
      `INSERT INTO ops_queue (
        id, tenant_id, lead_id, task_type, priority, description, assigned_to, status, resolution,
        resolved_at, sla_deadline, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        tenantId,
        data.lead_id,
        data.task_type,
        data.priority,
        data.description,
        data.assigned_to,
        data.status,
        data.resolution,
        data.resolved_at,
        data.sla_deadline,
        now,
        data.updated_at ?? now,
      ],
    );
    return id;
  } catch (error) {
    throw queryError("createOpsQueueEntry", tenantId, error);
  }
}

export async function getOpsQueueByLeadId(
  db: D1Database,
  tenantId: string,
  leadId: string,
): Promise<OpsQueueEntry | null> {
  try {
    return dbFirst<OpsQueueEntry>(
      db,
      `SELECT
        id AS queue_id,
        tenant_id,
        lead_id,
        task_type,
        priority,
        description,
        assigned_to,
        status,
        resolution,
        resolved_at,
        sla_deadline,
        created_at,
        updated_at
      FROM ops_queue
      WHERE tenant_id = ? AND lead_id = ?
      ORDER BY created_at DESC
      LIMIT 1`,
      [tenantId, leadId],
    );
  } catch (error) {
    throw queryError("getOpsQueueByLeadId", tenantId, error);
  }
}

export async function getLeadsByCampaign(
  db: D1Database,
  tenantId: string,
  campaignId: string,
  status?: string,
): Promise<Lead[]> {
  try {
    if (status) {
      const rows = await dbAll<Record<string, unknown>>(
        db,
        `SELECT ${selectLeadColumns()} FROM leads WHERE tenant_id = ? AND campaign_id = ? AND status = ? ORDER BY created_at DESC`,
        [tenantId, campaignId, status],
      );
      return rows.map(toLead);
    }
    const rows = await dbAll<Record<string, unknown>>(
      db,
      `SELECT ${selectLeadColumns()} FROM leads WHERE tenant_id = ? AND campaign_id = ? ORDER BY created_at DESC`,
      [tenantId, campaignId],
    );
    return rows.map(toLead);
  } catch (error) {
    throw queryError("getLeadsByCampaign", tenantId, error);
  }
}

export interface CampaignCreateInput {
  client_id: string;
  icp_profile_id: string;
  name: string;
  product_tier: ProductTier;
  leads_ordered: number;
  cpl: number;
  min_review_score?: number;
}

export async function createCampaign(db: D1Database, tenantId: string, input: CampaignCreateInput): Promise<Campaign> {
  try {
    const id = crypto.randomUUID();
    const now = Date.now();
    await dbRun(
      db,
      `INSERT INTO campaigns (
        id, tenant_id, client_id, icp_profile_id, name, product_tier, leads_ordered, cpl, status, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'active', ?, ?)`,
      [id, tenantId, input.client_id, input.icp_profile_id, input.name, input.product_tier, input.leads_ordered, input.cpl, now, now],
    );
    const row = await getCampaignById(db, tenantId, id);
    if (!row) throw new Error("campaign insert failed");
    return row;
  } catch (error) {
    throw queryError("createCampaign", tenantId, error);
  }
}

export async function listCampaigns(
  db: D1Database,
  tenantId: string,
  filters: { status?: string; tier?: ProductTier },
): Promise<Campaign[]> {
  try {
    const clauses = ["tenant_id = ?"];
    const params: unknown[] = [tenantId];
    if (filters.status) {
      clauses.push("status = ?");
      params.push(filters.status);
    }
    if (filters.tier) {
      clauses.push("product_tier = ?");
      params.push(filters.tier);
    }
    return dbAll<Campaign>(
      db,
      `SELECT
        id AS campaign_id,
        tenant_id,
        client_id,
        icp_profile_id,
        name,
        product_tier,
        leads_ordered,
        leads_delivered,
        cpl,
        daily_cap,
        status,
        custom_questions
      FROM campaigns
      WHERE ${clauses.join(" AND ")}
      ORDER BY created_at DESC`,
      params,
    );
  } catch (error) {
    throw queryError("listCampaigns", tenantId, error);
  }
}

export async function updateCampaign(
  db: D1Database,
  tenantId: string,
  campaignId: string,
  patch: Partial<Pick<Campaign, "name" | "product_tier" | "status">>,
): Promise<Campaign | null> {
  try {
    const fields: string[] = [];
    const values: unknown[] = [];
    if (patch.name !== undefined) {
      fields.push("name = ?");
      values.push(patch.name);
    }
    if (patch.product_tier !== undefined) {
      fields.push("product_tier = ?");
      values.push(patch.product_tier);
    }
    if (patch.status !== undefined) {
      fields.push("status = ?");
      values.push(patch.status);
    }
    if (!fields.length) return getCampaignById(db, tenantId, campaignId);
    fields.push("updated_at = ?");
    values.push(Date.now(), tenantId, campaignId);
    await dbRun(db, `UPDATE campaigns SET ${fields.join(", ")} WHERE tenant_id = ? AND id = ?`, values);
    return getCampaignById(db, tenantId, campaignId);
  } catch (error) {
    throw queryError("updateCampaign", tenantId, error);
  }
}

export interface CampaignStats {
  ordered: number;
  delivered: number;
  rejected: number;
  reviewing: number;
  rate: number;
}

export async function getCampaignLeadStats(
  db: D1Database,
  tenantId: string,
  campaignId: string,
): Promise<CampaignStats> {
  try {
    const rows = await dbAll<{ status: string; count: number }>(
      db,
      `SELECT status, COUNT(1) as count
       FROM leads
       WHERE tenant_id = ? AND campaign_id = ?
       GROUP BY status`,
      [tenantId, campaignId],
    );
    const delivered = rows.find((row) => row.status === "accepted")?.count ?? 0;
    const rejected = rows.find((row) => row.status === "rejected")?.count ?? 0;
    const reviewing = rows.find((row) => row.status === "reviewing")?.count ?? 0;
    const campaign = await getCampaignById(db, tenantId, campaignId);
    const ordered = campaign?.leads_ordered ?? 0;
    return {
      ordered,
      delivered,
      rejected,
      reviewing,
      rate: ordered > 0 ? rejected / ordered : 0,
    };
  } catch (error) {
    throw queryError("getCampaignLeadStats", tenantId, error);
  }
}

export interface CampaignDistributionStats {
  ordered: number;
  delivered: number;
  rejected: number;
  reviewing: number;
  icp_score_distribution: Record<string, number>;
  rejection_reasons: Record<string, number>;
}

export async function getCampaignDistributionStats(
  db: D1Database,
  tenantId: string,
  campaignId: string,
): Promise<CampaignDistributionStats> {
  try {
    const campaign = await getCampaignById(db, tenantId, campaignId);
    const ordered = campaign?.leads_ordered ?? 0;

    const statusRows = await dbAll<{ status: string; count: number }>(
      db,
      "SELECT status, COUNT(1) as count FROM leads WHERE tenant_id = ? AND campaign_id = ? GROUP BY status",
      [tenantId, campaignId],
    );
    const bucketRows = await dbAll<{ bucket: string; count: number }>(
      db,
      `SELECT
         CASE
           WHEN icp_score < 20 THEN 'score_0_20'
           WHEN icp_score < 40 THEN 'score_20_40'
           WHEN icp_score < 60 THEN 'score_40_60'
           WHEN icp_score < 80 THEN 'score_60_80'
           ELSE 'score_80_100'
         END as bucket,
         COUNT(1) as count
       FROM leads
       WHERE tenant_id = ? AND campaign_id = ? AND icp_score IS NOT NULL
       GROUP BY bucket`,
      [tenantId, campaignId],
    );
    const reasonRows = await dbAll<{ reason: string | null; count: number }>(
      db,
      `SELECT rejection_reason as reason, COUNT(1) as count
       FROM leads
       WHERE tenant_id = ? AND campaign_id = ? AND status = 'rejected'
       GROUP BY rejection_reason`,
      [tenantId, campaignId],
    );

    const distribution: Record<string, number> = {
      score_0_20: 0,
      score_20_40: 0,
      score_40_60: 0,
      score_60_80: 0,
      score_80_100: 0,
    };
    for (const row of bucketRows) distribution[row.bucket] = row.count;

    const reasons: Record<string, number> = {};
    for (const row of reasonRows) reasons[row.reason ?? "unknown"] = row.count;

    return {
      ordered,
      delivered: statusRows.find((row) => row.status === "accepted")?.count ?? 0,
      rejected: statusRows.find((row) => row.status === "rejected")?.count ?? 0,
      reviewing: statusRows.find((row) => row.status === "reviewing")?.count ?? 0,
      icp_score_distribution: distribution,
      rejection_reasons: reasons,
    };
  } catch (error) {
    throw queryError("getCampaignDistributionStats", tenantId, error);
  }
}

export async function getCampaignLeadsFiltered(
  db: D1Database,
  tenantId: string,
  campaignId: string,
  filters: { status?: string; score_min?: number; score_max?: number; country?: string },
): Promise<Lead[]> {
  try {
    const clauses = ["tenant_id = ?", "campaign_id = ?"];
    const params: unknown[] = [tenantId, campaignId];
    if (filters.status) {
      clauses.push("status = ?");
      params.push(filters.status);
    }
    if (filters.score_min !== undefined) {
      clauses.push("icp_score >= ?");
      params.push(filters.score_min);
    }
    if (filters.score_max !== undefined) {
      clauses.push("icp_score <= ?");
      params.push(filters.score_max);
    }
    if (filters.country) {
      clauses.push("country = ?");
      params.push(filters.country);
    }
    const rows = await dbAll<Record<string, unknown>>(
      db,
      `SELECT ${selectLeadColumns()} FROM leads WHERE ${clauses.join(" AND ")} ORDER BY created_at DESC`,
      params,
    );
    return rows.map(toLead);
  } catch (error) {
    throw queryError("getCampaignLeadsFiltered", tenantId, error);
  }
}

export interface ClientRecord {
  client_id: string;
  tenant_id: string;
  name: string;
  type: string;
  status: string;
  billing_email: string;
  notes: string | null;
  payment_terms: number;
  created_at: number;
  updated_at: number;
}

export async function createClient(
  db: D1Database,
  tenantId: string,
  data: { name: string; type: "direct" | "aggregator"; billing_email: string; notes?: string },
): Promise<ClientRecord> {
  try {
    const id = crypto.randomUUID();
    const now = Date.now();
    await dbRun(
      db,
      `INSERT INTO clients (id, tenant_id, name, type, status, billing_email, notes, created_at, updated_at)
       VALUES (?, ?, ?, ?, 'active', ?, ?, ?, ?)`,
      [id, tenantId, data.name, data.type, data.billing_email.toLowerCase(), data.notes ?? null, now, now],
    );
    const row = await getClientById(db, tenantId, id);
    if (!row) throw new Error("client create failed");
    return row;
  } catch (error) {
    throw queryError("createClient", tenantId, error);
  }
}

export async function listClients(db: D1Database, tenantId: string, type?: "direct" | "aggregator"): Promise<ClientRecord[]> {
  try {
    if (type) {
      return dbAll<ClientRecord>(
        db,
        `SELECT id as client_id, tenant_id, name, type, status, billing_email, notes, payment_terms, created_at, updated_at
         FROM clients
         WHERE tenant_id = ? AND type = ?
         ORDER BY created_at DESC`,
        [tenantId, type],
      );
    }
    return dbAll<ClientRecord>(
      db,
      `SELECT id as client_id, tenant_id, name, type, status, billing_email, notes, payment_terms, created_at, updated_at
       FROM clients
       WHERE tenant_id = ?
       ORDER BY created_at DESC`,
      [tenantId],
    );
  } catch (error) {
    throw queryError("listClients", tenantId, error);
  }
}

export async function getClientById(db: D1Database, tenantId: string, clientId: string): Promise<ClientRecord | null> {
  try {
    return dbFirst<ClientRecord>(
      db,
      `SELECT id as client_id, tenant_id, name, type, status, billing_email, notes, payment_terms, created_at, updated_at
       FROM clients
       WHERE tenant_id = ? AND id = ?
       LIMIT 1`,
      [tenantId, clientId],
    );
  } catch (error) {
    throw queryError("getClientById", tenantId, error);
  }
}

export async function updateClient(
  db: D1Database,
  tenantId: string,
  clientId: string,
  patch: Partial<{ name: string; billing_email: string; notes: string; status: string }>,
): Promise<ClientRecord | null> {
  try {
    const fields: string[] = [];
    const values: unknown[] = [];
    if (patch.name !== undefined) {
      fields.push("name = ?");
      values.push(patch.name);
    }
    if (patch.billing_email !== undefined) {
      fields.push("billing_email = ?");
      values.push(patch.billing_email.toLowerCase());
    }
    if (patch.notes !== undefined) {
      fields.push("notes = ?");
      values.push(patch.notes);
    }
    if (patch.status !== undefined) {
      fields.push("status = ?");
      values.push(patch.status);
    }
    if (!fields.length) return getClientById(db, tenantId, clientId);
    fields.push("updated_at = ?");
    values.push(Date.now(), tenantId, clientId);
    await dbRun(db, `UPDATE clients SET ${fields.join(", ")} WHERE tenant_id = ? AND id = ?`, values);
    return getClientById(db, tenantId, clientId);
  } catch (error) {
    throw queryError("updateClient", tenantId, error);
  }
}

export async function getClientActiveCampaigns(db: D1Database, tenantId: string, clientId: string): Promise<Campaign[]> {
  try {
    return dbAll<Campaign>(
      db,
      `SELECT
        id AS campaign_id,
        tenant_id,
        client_id,
        icp_profile_id,
        name,
        product_tier,
        leads_ordered,
        leads_delivered,
        cpl,
        daily_cap,
        status,
        custom_questions
      FROM campaigns
      WHERE tenant_id = ? AND client_id = ? AND status = 'active'`,
      [tenantId, clientId],
    );
  } catch (error) {
    throw queryError("getClientActiveCampaigns", tenantId, error);
  }
}

export async function getClientTotalSpend(db: D1Database, tenantId: string, clientId: string): Promise<number> {
  try {
    const row = await dbFirst<{ total: number | null }>(
      db,
      "SELECT SUM(total) as total FROM invoices WHERE tenant_id = ? AND client_id = ?",
      [tenantId, clientId],
    );
    return row?.total ?? 0;
  } catch (error) {
    throw queryError("getClientTotalSpend", tenantId, error);
  }
}

export interface DeliveryBatchRecord {
  batch_id: string;
  tenant_id: string;
  campaign_id: string;
  lead_count: number;
  r2_key: string;
  delivery_status: string;
  sent_at: number | null;
  acknowledged_at: number | null;
  invoice_id: string | null;
  created_at: number;
}

export async function createDeliveryBatchRecord(
  db: D1Database,
  tenantId: string,
  data: { campaign_id: string; lead_count: number; r2_key: string },
): Promise<DeliveryBatchRecord> {
  try {
    const id = crypto.randomUUID();
    const now = Date.now();
    await dbRun(
      db,
      `INSERT INTO delivery_batches (id, tenant_id, campaign_id, lead_count, r2_key, status, created_at)
       VALUES (?, ?, ?, ?, ?, 'pending', ?)`,
      [id, tenantId, data.campaign_id, data.lead_count, data.r2_key, now],
    );
    const created = await getDeliveryBatchById(db, tenantId, id);
    if (!created) throw new Error("delivery batch create failed");
    return created;
  } catch (error) {
    throw queryError("createDeliveryBatchRecord", tenantId, error);
  }
}

export async function updateDeliveryBatch(
  db: D1Database,
  tenantId: string,
  batchId: string,
  patch: { delivery_status?: "pending" | "sent" | "failed"; r2_key?: string; invoice_id?: string | null },
): Promise<DeliveryBatchRecord | null> {
  try {
    const fields: string[] = [];
    const values: unknown[] = [];
    if (patch.delivery_status !== undefined) {
      fields.push("status = ?");
      values.push(patch.delivery_status);
      if (patch.delivery_status === "sent") {
        fields.push("sent_at = ?");
        values.push(Date.now());
      }
    }
    if (patch.r2_key !== undefined) {
      fields.push("r2_key = ?");
      values.push(patch.r2_key);
    }
    if (patch.invoice_id !== undefined) {
      fields.push("invoice_id = ?");
      values.push(patch.invoice_id);
    }
    if (!fields.length) return getDeliveryBatchById(db, tenantId, batchId);
    values.push(tenantId, batchId);
    await dbRun(db, `UPDATE delivery_batches SET ${fields.join(", ")} WHERE tenant_id = ? AND id = ?`, values);
    return getDeliveryBatchById(db, tenantId, batchId);
  } catch (error) {
    throw queryError("updateDeliveryBatch", tenantId, error);
  }
}

export async function listDeliveryBatches(
  db: D1Database,
  tenantId: string,
  filters: { campaign_id?: string; status?: string },
): Promise<DeliveryBatchRecord[]> {
  try {
    const clauses = ["tenant_id = ?"];
    const params: unknown[] = [tenantId];
    if (filters.campaign_id) {
      clauses.push("campaign_id = ?");
      params.push(filters.campaign_id);
    }
    if (filters.status) {
      clauses.push("status = ?");
      params.push(filters.status);
    }
    return dbAll<DeliveryBatchRecord>(
      db,
      `SELECT id as batch_id, tenant_id, campaign_id, lead_count, r2_key, status as delivery_status, sent_at, acknowledged_at, invoice_id, created_at
       FROM delivery_batches
       WHERE ${clauses.join(" AND ")}
       ORDER BY created_at DESC`,
      params,
    );
  } catch (error) {
    throw queryError("listDeliveryBatches", tenantId, error);
  }
}

export async function getDeliveryBatchById(
  db: D1Database,
  tenantId: string,
  batchId: string,
): Promise<DeliveryBatchRecord | null> {
  try {
    return dbFirst<DeliveryBatchRecord>(
      db,
      `SELECT id as batch_id, tenant_id, campaign_id, lead_count, r2_key, status as delivery_status, sent_at, acknowledged_at, invoice_id, created_at
       FROM delivery_batches
       WHERE tenant_id = ? AND id = ?
       LIMIT 1`,
      [tenantId, batchId],
    );
  } catch (error) {
    throw queryError("getDeliveryBatchById", tenantId, error);
  }
}

export async function incrementCampaignDeliveredCount(
  db: D1Database,
  tenantId: string,
  campaignId: string,
  amount: number,
): Promise<void> {
  try {
    await dbRun(
      db,
      "UPDATE campaigns SET leads_delivered = leads_delivered + ?, updated_at = ? WHERE tenant_id = ? AND id = ?",
      [amount, Date.now(), tenantId, campaignId],
    );
  } catch (error) {
    throw queryError("incrementCampaignDeliveredCount", tenantId, error);
  }
}

export async function markLeadsDelivered(
  db: D1Database,
  tenantId: string,
  campaignId: string,
  leadIds: string[],
  batchId: string,
): Promise<void> {
  try {
    if (!leadIds.length) return;
    const placeholders = leadIds.map(() => "?").join(", ");
    await dbRun(
      db,
      `UPDATE leads
         SET delivered_at = ?, delivery_batch_id = ?, status = CASE WHEN status = 'accepted' THEN status ELSE 'accepted' END, updated_at = ?
       WHERE tenant_id = ? AND campaign_id = ? AND id IN (${placeholders})`,
      [Date.now(), batchId, Date.now(), tenantId, campaignId, ...leadIds],
    );
  } catch (error) {
    throw queryError("markLeadsDelivered", tenantId, error);
  }
}

export interface InvoiceRecord {
  invoice_id: string;
  tenant_id: string;
  client_id: string;
  line_items: string;
  subtotal: number;
  tax_rate: number;
  tax_amount: number;
  total: number;
  status: string;
  due_date: number;
  created_at: number;
  updated_at: number;
}

export async function createInvoiceRecord(
  db: D1Database,
  tenantId: string,
  data: {
    client_id: string;
    line_items: string;
    subtotal: number;
    tax_rate: number;
    tax_amount: number;
    total: number;
    status?: string;
    due_date: number;
  },
): Promise<InvoiceRecord> {
  try {
    const id = crypto.randomUUID();
    const now = Date.now();
    await dbRun(
      db,
      `INSERT INTO invoices (
         id, tenant_id, client_id, line_items, subtotal, tax_rate, tax_amount, total, status, due_date, created_at, updated_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        tenantId,
        data.client_id,
        data.line_items,
        data.subtotal,
        data.tax_rate,
        data.tax_amount,
        data.total,
        data.status ?? "draft",
        data.due_date,
        now,
        now,
      ],
    );
    const created = await getInvoiceById(db, tenantId, id);
    if (!created) throw new Error("invoice create failed");
    return created;
  } catch (error) {
    throw queryError("createInvoiceRecord", tenantId, error);
  }
}

export async function listInvoices(
  db: D1Database,
  tenantId: string,
  filters: { client_id?: string; status?: string; start_date?: number; end_date?: number },
): Promise<InvoiceRecord[]> {
  try {
    const clauses = ["tenant_id = ?"];
    const params: unknown[] = [tenantId];
    if (filters.client_id) {
      clauses.push("client_id = ?");
      params.push(filters.client_id);
    }
    if (filters.status) {
      clauses.push("status = ?");
      params.push(filters.status);
    }
    if (filters.start_date !== undefined) {
      clauses.push("created_at >= ?");
      params.push(filters.start_date);
    }
    if (filters.end_date !== undefined) {
      clauses.push("created_at <= ?");
      params.push(filters.end_date);
    }
    return dbAll<InvoiceRecord>(
      db,
      `SELECT id as invoice_id, tenant_id, client_id, line_items, subtotal, tax_rate, tax_amount, total, status, due_date, created_at, updated_at
       FROM invoices
       WHERE ${clauses.join(" AND ")}
       ORDER BY created_at DESC`,
      params,
    );
  } catch (error) {
    throw queryError("listInvoices", tenantId, error);
  }
}

export async function getInvoiceById(
  db: D1Database,
  tenantId: string,
  invoiceId: string,
): Promise<InvoiceRecord | null> {
  try {
    return dbFirst<InvoiceRecord>(
      db,
      `SELECT id as invoice_id, tenant_id, client_id, line_items, subtotal, tax_rate, tax_amount, total, status, due_date, created_at, updated_at
       FROM invoices WHERE tenant_id = ? AND id = ? LIMIT 1`,
      [tenantId, invoiceId],
    );
  } catch (error) {
    throw queryError("getInvoiceById", tenantId, error);
  }
}

export async function updateInvoiceStatus(
  db: D1Database,
  tenantId: string,
  invoiceId: string,
  status: "paid" | "overdue" | "sent",
): Promise<InvoiceRecord | null> {
  try {
    await dbRun(
      db,
      "UPDATE invoices SET status = ?, updated_at = ?, paid_at = CASE WHEN ? = 'paid' THEN ? ELSE paid_at END WHERE tenant_id = ? AND id = ?",
      [status, Date.now(), status, Date.now(), tenantId, invoiceId],
    );
    return getInvoiceById(db, tenantId, invoiceId);
  } catch (error) {
    throw queryError("updateInvoiceStatus", tenantId, error);
  }
}

export interface DomainRecord {
  domain_id: string;
  tenant_id: string;
  domain: string;
  reputation_score: number | null;
  bounce_rate: number | null;
  spam_rate: number | null;
  is_active: number;
  is_warming: number;
  daily_send_count: number;
  daily_send_limit: number;
  spf_valid: number | null;
  dkim_valid: number | null;
  dmarc_valid: number | null;
  created_at: number;
  updated_at: number;
}

export async function createDomain(
  db: D1Database,
  tenantId: string,
  input: { domain: string; dkim_valid: boolean; spf_valid: boolean },
): Promise<DomainRecord> {
  try {
    const id = crypto.randomUUID();
    const now = Date.now();
    await dbRun(
      db,
      `INSERT INTO sending_domains (
         id, tenant_id, domain, reputation_score, bounce_rate, spam_rate, is_active, is_warming,
         daily_send_count, daily_send_limit, spf_valid, dkim_valid, dmarc_valid, created_at, updated_at
       ) VALUES (?, ?, ?, 50, 0, 0, 1, 0, 0, 50, ?, ?, 0, ?, ?)`,
      [id, tenantId, input.domain, input.spf_valid ? 1 : 0, input.dkim_valid ? 1 : 0, now, now],
    );
    const row = await getDomainByName(db, tenantId, input.domain);
    if (!row) throw new Error("domain create failed");
    return row;
  } catch (error) {
    throw queryError("createDomain", tenantId, error);
  }
}

export async function listDomains(db: D1Database, tenantId: string): Promise<DomainRecord[]> {
  try {
    return dbAll<DomainRecord>(
      db,
      `SELECT
         id as domain_id, tenant_id, domain, reputation_score, bounce_rate, spam_rate, is_active, is_warming,
         daily_send_count, daily_send_limit, spf_valid, dkim_valid, dmarc_valid, created_at, updated_at
       FROM sending_domains
       WHERE tenant_id = ?
       ORDER BY created_at DESC`,
      [tenantId],
    );
  } catch (error) {
    throw queryError("listDomains", tenantId, error);
  }
}

export async function getDomainByName(db: D1Database, tenantId: string, domain: string): Promise<DomainRecord | null> {
  try {
    return dbFirst<DomainRecord>(
      db,
      `SELECT
         id as domain_id, tenant_id, domain, reputation_score, bounce_rate, spam_rate, is_active, is_warming,
         daily_send_count, daily_send_limit, spf_valid, dkim_valid, dmarc_valid, created_at, updated_at
       FROM sending_domains
       WHERE tenant_id = ? AND domain = ?
       LIMIT 1`,
      [tenantId, domain],
    );
  } catch (error) {
    throw queryError("getDomainByName", tenantId, error);
  }
}

export async function updateDomainActiveStatus(
  db: D1Database,
  tenantId: string,
  domain: string,
  active: boolean,
): Promise<DomainRecord | null> {
  try {
    await dbRun(
      db,
      "UPDATE sending_domains SET is_active = ?, updated_at = ? WHERE tenant_id = ? AND domain = ?",
      [active ? 1 : 0, Date.now(), tenantId, domain],
    );
    return getDomainByName(db, tenantId, domain);
  } catch (error) {
    throw queryError("updateDomainActiveStatus", tenantId, error);
  }
}

export async function deleteDomain(db: D1Database, tenantId: string, domain: string): Promise<void> {
  try {
    await dbRun(db, "DELETE FROM sending_domains WHERE tenant_id = ? AND domain = ?", [tenantId, domain]);
  } catch (error) {
    throw queryError("deleteDomain", tenantId, error);
  }
}

export async function countLeadsForClient(db: D1Database, tenantId: string, clientId: string): Promise<number> {
  try {
    const row = await dbFirst<{ count: number }>(
      db,
      `SELECT COUNT(1) as count
       FROM leads l
       INNER JOIN campaigns c ON c.id = l.campaign_id
       WHERE l.tenant_id = ? AND c.tenant_id = ? AND c.client_id = ?`,
      [tenantId, tenantId, clientId],
    );
    return row?.count ?? 0;
  } catch (error) {
    throw queryError("countLeadsForClient", tenantId, error);
  }
}

export async function findLeadByEmail(db: D1Database, tenantId: string, email: string): Promise<Lead | null> {
  try {
    const row = await dbFirst<Record<string, unknown>>(
      db,
      `SELECT ${selectLeadColumns()}
       FROM leads
       WHERE tenant_id = ? AND email = ?
       ORDER BY created_at DESC
       LIMIT 1`,
      [tenantId, email.toLowerCase()],
    );
    return row ? toLead(row) : null;
  } catch (error) {
    throw queryError("findLeadByEmail", tenantId, error);
  }
}

export async function updateLeadStatusText(
  db: D1Database,
  tenantId: string,
  leadId: string,
  status: string,
): Promise<void> {
  try {
    await dbRun(
      db,
      "UPDATE leads SET status = ?, updated_at = ? WHERE tenant_id = ? AND id = ?",
      [status, Date.now(), tenantId, leadId],
    );
  } catch (error) {
    throw queryError("updateLeadStatusText", tenantId, error);
  }
}

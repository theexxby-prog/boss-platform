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
): Promise<void> {
  try {
    const now = Date.now();
    await dbRun(
      db,
      `INSERT INTO ops_queue (
        id, tenant_id, lead_id, task_type, priority, description, assigned_to, status, resolution,
        resolved_at, sla_deadline, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        crypto.randomUUID(),
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

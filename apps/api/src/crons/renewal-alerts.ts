// REF: boss-hq/worker/src/services/campaignRequestService.ts — campaign state detection
// Schedule: 0 8 * * * (daily at 08:00 UTC)

import type { D1Database, KVNamespace } from "@cloudflare/workers-types";

export interface RenewalAlertsEnv {
  DB: D1Database;
  KV: KVNamespace;
  SLACK_WEBHOOK_URL?: string;
}

interface NearCompleteCampaign {
  id: string;
  tenant_id: string;
  client_id: string;
  name: string;
  product_tier: string;
  leads_ordered: number;
  leads_delivered: number;
  cpl: number;
}

interface ClientRow {
  name: string;
  billing_email: string;
}

const RENEWAL_ALERT_DEDUP_TTL_SECONDS = 14 * 24 * 60 * 60; // 14 days
const DELIVERY_THRESHOLD = 0.8; // 80%

function kvKey(campaignId: string): string {
  return `renewal-alert:${campaignId}`;
}

async function createOpsQueueRecord(
  db: D1Database,
  tenantId: string,
  campaignId: string,
  campaignName: string,
  leadsDelivered: number,
  leadsOrdered: number,
): Promise<void> {
  // REF: boss-hq/worker/src/services/campaignRequestService.ts — ops queue creation
  const id = crypto.randomUUID();
  const now = Date.now();
  const slaDeadline = now + 48 * 60 * 60 * 1000; // 48-hour SLA for renewal outreach

  await db.prepare(
    `INSERT INTO ops_queue
       (id, tenant_id, lead_id, task_type, priority, description,
        assigned_to, status, resolution, resolved_at, sla_deadline, created_at, updated_at)
     VALUES (?, ?, NULL, 'renewal_alert', 'normal', ?, NULL, 'open', NULL, NULL, ?, ?, ?)`,
  ).bind(
    id,
    tenantId,
    `Campaign "${campaignName}" is at ${leadsDelivered}/${leadsOrdered} leads (${Math.round((leadsDelivered / leadsOrdered) * 100)}% delivered). Initiate renewal conversation.`,
    slaDeadline,
    now,
    now,
  ).run();
}

async function notifySlack(webhookUrl: string, message: string): Promise<void> {
  try {
    await fetch(webhookUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ text: message }),
    });
  } catch {
    // Slack notification failure must never crash the cron
  }
}

export async function runRenewalAlerts(env: RenewalAlertsEnv): Promise<void> {
  // Fetch active campaigns at or above 80% delivery
  const { results: campaigns } = await env.DB.prepare(
    `SELECT id, tenant_id, client_id, name, product_tier,
            leads_ordered, leads_delivered, cpl
     FROM campaigns
     WHERE status = 'active'
       AND leads_ordered > 0
       AND CAST(leads_delivered AS REAL) / CAST(leads_ordered AS REAL) >= ?`,
  ).bind(DELIVERY_THRESHOLD).all<NearCompleteCampaign>();

  if (!campaigns?.length) {
    console.log(JSON.stringify({ event: "renewal_alerts_run", checked: 0, alerted: 0 }));
    return;
  }

  let alerted = 0;

  for (const campaign of campaigns) {
    try {
      // 14-day dedup via KV — skip if already alerted recently
      const dedupKey = kvKey(campaign.id);
      const existing = await env.KV.get(dedupKey);
      if (existing) continue;

      // Fetch client info
      const clientRow = await env.DB.prepare(
        `SELECT name, billing_email FROM clients WHERE id = ? AND tenant_id = ?`,
      ).bind(campaign.client_id, campaign.tenant_id).first<ClientRow>();

      if (!clientRow) continue;

      const pctComplete = Math.round((campaign.leads_delivered / campaign.leads_ordered) * 100);
      const totalValue = campaign.leads_ordered * campaign.cpl;

      // Create ops_queue record for BD team
      await createOpsQueueRecord(
        env.DB,
        campaign.tenant_id,
        campaign.id,
        campaign.name,
        campaign.leads_delivered,
        campaign.leads_ordered,
      );

      // Slack notification
      if (env.SLACK_WEBHOOK_URL) {
        await notifySlack(
          env.SLACK_WEBHOOK_URL,
          `🔔 Renewal Alert: "${campaign.name}" (${clientRow.name}) is ${pctComplete}% delivered — ${campaign.leads_delivered}/${campaign.leads_ordered} leads. Campaign value: $${totalValue.toLocaleString()}. Start renewal conversation now.`,
        );
      }

      // Set 14-day KV dedup flag
      await env.KV.put(dedupKey, "1", { expirationTtl: RENEWAL_ALERT_DEDUP_TTL_SECONDS });

      console.log(JSON.stringify({
        event: "renewal_alert_sent",
        campaign_id: campaign.id,
        campaign_name: campaign.name,
        client: clientRow.name,
        pct_complete: pctComplete,
        leads_delivered: campaign.leads_delivered,
        leads_ordered: campaign.leads_ordered,
      }));

      alerted++;
    } catch (err) {
      console.error(JSON.stringify({
        event: "renewal_alert_error",
        campaign_id: campaign.id,
        error: String(err),
      }));
    }
  }

  console.log(JSON.stringify({
    event: "renewal_alerts_run",
    checked: campaigns.length,
    alerted,
    ran_at: new Date().toISOString(),
  }));
}

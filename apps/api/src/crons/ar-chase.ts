// REF: boss-hq/worker/src/services/invoiceService.ts — payment terms and overdue detection logic
// Schedule: 0 9 * * * (daily at 09:00 UTC)

import type { D1Database, KVNamespace } from "@cloudflare/workers-types";

export interface ArChaseEnv {
  DB: D1Database;
  KV: KVNamespace;
  SLACK_WEBHOOK_URL?: string;
}

interface OverdueInvoice {
  id: string;
  tenant_id: string;
  client_id: string;
  total: number;
  due_date: number;
  chase_level: number;
  last_chase_at: number | null;
}

interface ClientRow {
  billing_email: string;
  name: string;
}

const ONE_DAY_MS = 86_400_000;

// ─── Escalation thresholds ────────────────────────────────────────────────────

function getTargetLevel(daysOverdue: number): 1 | 2 | 3 | null {
  if (daysOverdue >= 45) return 3;
  if (daysOverdue >= 35) return 2;
  if (daysOverdue >= 22) return 1;
  return null;
}

// ─── Notification helpers ─────────────────────────────────────────────────────

async function sendChaseEmail(
  billingEmail: string,
  clientName: string,
  invoiceId: string,
  total: number,
  daysOverdue: number,
  level: 1 | 2 | 3,
): Promise<void> {
  // In production: integrate with tenant SMTP / SendGrid
  // For now: structured log that n8n / external mailer picks up
  console.log(JSON.stringify({
    event: "ar_chase_email",
    level,
    to: billingEmail,
    client: clientName,
    invoice_id: invoiceId,
    total,
    days_overdue: daysOverdue,
    subject: level === 1
      ? `Payment reminder: Invoice ${invoiceId} is overdue`
      : level === 2
        ? `URGENT: Invoice ${invoiceId} — ${daysOverdue} days overdue`
        : `FINAL NOTICE: Invoice ${invoiceId} — campaigns paused pending payment`,
    sent_at: new Date().toISOString(),
  }));
}

async function pauseClientCampaigns(db: D1Database, tenantId: string, clientId: string, invoiceId: string): Promise<void> {
  // REF: boss-hq/worker/src/services/invoiceService.ts — campaign pause on non-payment
  await db.prepare(
    `UPDATE campaigns SET status = 'paused', updated_at = ?
     WHERE client_id = ? AND tenant_id = ? AND status = 'active'`,
  ).bind(Date.now(), clientId, tenantId).run();

  console.log(JSON.stringify({
    event: "campaigns_paused_for_ar",
    tenant_id: tenantId,
    client_id: clientId,
    invoice_id: invoiceId,
    paused_at: new Date().toISOString(),
  }));
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

// ─── Idempotency guard ────────────────────────────────────────────────────────

function alreadyChasedToday(lastChaseAt: number | null): boolean {
  if (!lastChaseAt) return false;
  const msSinceLast = Date.now() - lastChaseAt;
  return msSinceLast < ONE_DAY_MS;
}

// ─── Main handler ─────────────────────────────────────────────────────────────

export async function runArChase(env: ArChaseEnv): Promise<void> {
  const now = Date.now();

  // Fetch all sent invoices that are overdue (due_date < now)
  const { results: overdueInvoices } = await env.DB.prepare(
    `SELECT id, tenant_id, client_id, total, due_date, chase_level, last_chase_at
     FROM invoices
     WHERE status = 'sent' AND due_date < ?
     ORDER BY due_date ASC`,
  ).bind(now).all<OverdueInvoice>();

  if (!overdueInvoices?.length) {
    console.log(JSON.stringify({ event: "ar_chase_run", invoices_checked: 0, escalated: 0 }));
    return;
  }

  let escalated = 0;

  for (const invoice of overdueInvoices) {
    try {
      // Idempotency: skip if already chased today
      if (alreadyChasedToday(invoice.last_chase_at)) continue;

      const daysOverdue = Math.floor((now - invoice.due_date) / ONE_DAY_MS);
      const targetLevel = getTargetLevel(daysOverdue);

      // No escalation needed yet
      if (!targetLevel) continue;

      // Already at or above target — skip (one level per run maximum)
      if (invoice.chase_level >= targetLevel) continue;

      // The next level to apply is exactly one above current
      const newLevel = (invoice.chase_level + 1) as 1 | 2 | 3;
      if (newLevel > targetLevel) continue;

      // Fetch client info for notification
      const clientRow = await env.DB.prepare(
        `SELECT billing_email, name FROM clients WHERE id = ? AND tenant_id = ?`,
      ).bind(invoice.client_id, invoice.tenant_id).first<ClientRow>();

      if (!clientRow) continue;

      // Send chase email
      await sendChaseEmail(
        clientRow.billing_email,
        clientRow.name,
        invoice.id,
        invoice.total,
        daysOverdue,
        newLevel,
      );

      // Level 3: pause active campaigns
      if (newLevel === 3) {
        await pauseClientCampaigns(env.DB, invoice.tenant_id, invoice.client_id, invoice.id);
      }

      // Update chase_level and last_chase_at atomically
      await env.DB.prepare(
        `UPDATE invoices SET chase_level = ?, last_chase_at = ?, updated_at = ?
         WHERE id = ? AND tenant_id = ?`,
      ).bind(newLevel, now, now, invoice.id, invoice.tenant_id).run();

      // Slack alert for level 2+
      if (env.SLACK_WEBHOOK_URL && newLevel >= 2) {
        await notifySlack(
          env.SLACK_WEBHOOK_URL,
          `⚠️ AR Chase Level ${newLevel}: ${clientRow.name} — Invoice ${invoice.id} is ${daysOverdue} days overdue ($${invoice.total.toFixed(2)})${newLevel === 3 ? " — campaigns PAUSED" : ""}`,
        );
      }

      escalated++;
    } catch (err) {
      // Log per-invoice errors without crashing the entire run
      console.error(JSON.stringify({
        event: "ar_chase_error",
        invoice_id: invoice.id,
        error: String(err),
      }));
    }
  }

  console.log(JSON.stringify({
    event: "ar_chase_run",
    invoices_checked: overdueInvoices.length,
    escalated,
    ran_at: new Date().toISOString(),
  }));
}

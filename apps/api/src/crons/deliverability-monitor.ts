// Schedule: 0 */6 * * * (every 6 hours)
// Also resets daily_send_count at midnight UTC

import type { D1Database, KVNamespace } from "@cloudflare/workers-types";

export interface DeliverabilityMonitorEnv {
  DB: D1Database;
  KV: KVNamespace;
  SLACK_WEBHOOK_URL?: string;
  LEMWARM_API_KEY?: string; // warmup tool API key
}

interface SendingDomain {
  id: string;
  tenant_id: string;
  domain: string;
  spam_rate: number | null;
  bounce_rate: number | null;
  reputation_score: number | null;
  is_active: number;
  is_warming: number;
}

interface WarmupHealthData {
  spam_rate: number;
  bounce_rate: number;
  reputation_score: number;
}

const SPAM_RATE_AUTO_SUSPEND = 0.02; // 2%
const MIDNIGHT_RESET_KV_KEY = "deliverability:last_midnight_reset";

// ─── Warmup tool API ──────────────────────────────────────────────────────────

async function fetchDomainHealthFromWarmupTool(
  domain: string,
  apiKey: string,
): Promise<WarmupHealthData | null> {
  try {
    // REF: Lemwarm/Mailreach API — domain health endpoint
    // Adjust endpoint to match actual warmup tool API
    const response = await fetch(`https://api.lemwarm.com/v1/domains/${encodeURIComponent(domain)}/health`, {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      signal: AbortSignal.timeout(10_000),
    });

    if (!response.ok) return null;

    const data = await response.json() as {
      spam_rate?: number;
      bounce_rate?: number;
      reputation_score?: number;
    };

    return {
      spam_rate: data.spam_rate ?? 0,
      bounce_rate: data.bounce_rate ?? 0,
      reputation_score: data.reputation_score ?? 50,
    };
  } catch {
    return null;
  }
}

// ─── Midnight reset ───────────────────────────────────────────────────────────

async function shouldResetDailyCounts(kv: KVNamespace): Promise<boolean> {
  const now = new Date();
  const todayKey = `${now.getUTCFullYear()}-${now.getUTCMonth()}-${now.getUTCDate()}`;
  const lastReset = await kv.get(MIDNIGHT_RESET_KV_KEY);
  return lastReset !== todayKey;
}

async function resetDailySendCounts(db: D1Database, kv: KVNamespace): Promise<void> {
  await db.prepare(
    `UPDATE sending_domains SET daily_send_count = 0, updated_at = ? WHERE is_active = 1`,
  ).bind(Date.now()).run();

  const now = new Date();
  const todayKey = `${now.getUTCFullYear()}-${now.getUTCMonth()}-${now.getUTCDate()}`;
  // TTL 25 hours — ensures next midnight always triggers reset
  await kv.put(MIDNIGHT_RESET_KV_KEY, todayKey, { expirationTtl: 25 * 60 * 60 });

  console.log(JSON.stringify({
    event: "daily_send_counts_reset",
    reset_at: new Date().toISOString(),
  }));
}

// ─── Domain suspend ───────────────────────────────────────────────────────────

async function suspendDomain(db: D1Database, domainId: string, tenantId: string, reason: string): Promise<void> {
  await db.prepare(
    `UPDATE sending_domains SET is_active = 0, updated_at = ? WHERE id = ? AND tenant_id = ?`,
  ).bind(Date.now(), domainId, tenantId).run();

  console.log(JSON.stringify({
    event: "domain_auto_suspended",
    domain_id: domainId,
    tenant_id: tenantId,
    reason,
    suspended_at: new Date().toISOString(),
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
    // Never crash cron on Slack failure
  }
}

// ─── Main handler ─────────────────────────────────────────────────────────────

export async function runDeliverabilityMonitor(env: DeliverabilityMonitorEnv): Promise<void> {
  // 1. Midnight UTC reset of daily send counts
  if (await shouldResetDailyCounts(env.KV)) {
    await resetDailySendCounts(env.DB, env.KV);
  }

  // 2. Fetch all active domains across all tenants
  const { results: domains } = await env.DB.prepare(
    `SELECT id, tenant_id, domain, spam_rate, bounce_rate, reputation_score,
            is_active, is_warming
     FROM sending_domains
     WHERE is_active = 1`,
  ).all<SendingDomain>();

  if (!domains?.length) {
    console.log(JSON.stringify({ event: "deliverability_monitor_run", domains_checked: 0 }));
    return;
  }

  let suspended = 0;
  let updated = 0;

  for (const domain of domains) {
    try {
      // Fetch fresh health data from warmup tool if API key configured
      let health: WarmupHealthData | null = null;
      if (env.LEMWARM_API_KEY) {
        health = await fetchDomainHealthFromWarmupTool(domain.domain, env.LEMWARM_API_KEY);
      }

      if (health) {
        // Update health metrics in D1
        await env.DB.prepare(
          `UPDATE sending_domains
           SET spam_rate = ?, bounce_rate = ?, reputation_score = ?,
               last_health_check = ?, updated_at = ?
           WHERE id = ? AND tenant_id = ?`,
        ).bind(
          health.spam_rate,
          health.bounce_rate,
          health.reputation_score,
          Date.now(),
          Date.now(),
          domain.id,
          domain.tenant_id,
        ).run();

        updated++;

        // Auto-suspend if spam rate exceeds threshold
        if (health.spam_rate > SPAM_RATE_AUTO_SUSPEND) {
          await suspendDomain(
            env.DB,
            domain.id,
            domain.tenant_id,
            `spam_rate ${(health.spam_rate * 100).toFixed(2)}% exceeds ${SPAM_RATE_AUTO_SUSPEND * 100}% threshold`,
          );

          if (env.SLACK_WEBHOOK_URL) {
            await notifySlack(
              env.SLACK_WEBHOOK_URL,
              `🚨 Domain auto-suspended: \`${domain.domain}\` — spam rate ${(health.spam_rate * 100).toFixed(2)}% (threshold: ${SPAM_RATE_AUTO_SUSPEND * 100}%). Check immediately.`,
            );
          }

          suspended++;
        }
      } else {
        // No API key or fetch failed — just update last_health_check timestamp
        await env.DB.prepare(
          `UPDATE sending_domains SET last_health_check = ?, updated_at = ?
           WHERE id = ? AND tenant_id = ?`,
        ).bind(Date.now(), Date.now(), domain.id, domain.tenant_id).run();
      }
    } catch (err) {
      console.error(JSON.stringify({
        event: "deliverability_monitor_domain_error",
        domain_id: domain.id,
        domain: domain.domain,
        error: String(err),
      }));
    }
  }

  console.log(JSON.stringify({
    event: "deliverability_monitor_run",
    domains_checked: domains.length,
    domains_updated: updated,
    domains_suspended: suspended,
    ran_at: new Date().toISOString(),
  }));
}

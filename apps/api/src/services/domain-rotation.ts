import type { D1Database, KVNamespace } from "@cloudflare/workers-types";

import { listDomains } from "../db/queries/index";
import { DomainRotationError } from "./errors";

interface DomainReputation {
  score: number;
  bounce_rate: number;
  spam_rate: number;
  daily_sends: number;
}

function scoreDomain(value: DomainReputation): number {
  return value.score - value.bounce_rate * 100 - value.spam_rate * 100;
}

export async function selectSendingDomain(
  _campaignId: string,
  tenantId: string,
  options: {
    db: D1Database;
    kv: KVNamespace;
  },
): Promise<{ domain: string; reputation_score: number }> {
  const activeDomains = (await listDomains(options.db, tenantId)).filter((domain) => domain.is_active === 1);
  if (!activeDomains.length) {
    throw new DomainRotationError("NO_DOMAIN_AVAILABLE", "No active sending domains available", { tenant_id: tenantId });
  }

  const candidates: Array<{ domain: string; reputation_score: number; daily_sends: number }> = [];

  for (const domain of activeDomains) {
    const key = `domain_reputation:${domain.domain}`;
    const raw = await options.kv.get(key);
    const parsed = raw
      ? (JSON.parse(raw) as DomainReputation)
      : {
          score: domain.reputation_score ?? 50,
          bounce_rate: domain.bounce_rate ?? 0,
          spam_rate: domain.spam_rate ?? 0,
          daily_sends: domain.daily_send_count ?? 0,
        };
    candidates.push({
      domain: domain.domain,
      reputation_score: scoreDomain(parsed),
      daily_sends: parsed.daily_sends,
    });
  }

  candidates.sort((left, right) => {
    if (right.reputation_score !== left.reputation_score) return right.reputation_score - left.reputation_score;
    return left.daily_sends - right.daily_sends;
  });

  const selected = candidates[0];
  if (!selected) {
    throw new DomainRotationError("NO_DOMAIN_AVAILABLE", "No domain could be selected", { tenant_id: tenantId });
  }

  const kvKey = `domain_reputation:${selected.domain}`;
  const previousRaw = await options.kv.get(kvKey);
  const previous = previousRaw
    ? (JSON.parse(previousRaw) as DomainReputation)
    : { score: selected.reputation_score, bounce_rate: 0, spam_rate: 0, daily_sends: 0 };
  const next: DomainReputation = {
    ...previous,
    daily_sends: previous.daily_sends + 1,
  };
  await options.kv.put(kvKey, JSON.stringify(next), { expirationTtl: 24 * 60 * 60 });

  return {
    domain: selected.domain,
    reputation_score: selected.reputation_score,
  };
}

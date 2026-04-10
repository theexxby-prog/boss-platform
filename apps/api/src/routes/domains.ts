import { Hono } from "hono";
import { z } from "zod";

import {
  createDomain,
  deleteDomain,
  getDomainByName,
  listDomains,
  updateDomainActiveStatus,
} from "../db/queries/index";
import { created, fail, noContent, ok } from "../http";
import { requireAuth } from "../middleware/auth";
import { requireTenant } from "../middleware/tenant";
import type { AppVariables, EnvBindings } from "../types";

const createDomainSchema = z.object({
  domain: z.string().min(3),
  dkim_verified: z.boolean(),
  spf_verified: z.boolean(),
});

const statusSchema = z.object({
  status: z.enum(["active", "suspended"]),
  reason: z.string().optional(),
});

interface DomainHealth {
  score: number;
  bounce_rate: number;
  spam_rate: number;
  daily_sends: number;
}

async function getDomainHealth(kv: EnvBindings["KV"], domain: string): Promise<DomainHealth> {
  const raw = await kv.get(`domain_reputation:${domain}`);
  if (!raw) return { score: 50, bounce_rate: 0, spam_rate: 0, daily_sends: 0 };
  return JSON.parse(raw) as DomainHealth;
}

function toStatus(score: number): "healthy" | "warning" | "suspended" {
  if (score < 35) return "suspended";
  if (score < 60) return "warning";
  return "healthy";
}

export const domainsRouter = new Hono<{ Bindings: EnvBindings; Variables: AppVariables }>();
domainsRouter.use("*", requireAuth, requireTenant);

domainsRouter.post("/", async (c) => {
  const parsed = createDomainSchema.safeParse(await c.req.json());
  if (!parsed.success) return fail(c, 400, "VALIDATION_ERROR", "Invalid domain payload", { issues: parsed.error.issues });
  const tenantId = c.get("tenantId");
  const domain = await createDomain(c.env.DB, tenantId, {
    domain: parsed.data.domain.toLowerCase(),
    dkim_valid: parsed.data.dkim_verified,
    spf_valid: parsed.data.spf_verified,
  });
  await c.env.KV.put(
    `domain_reputation:${domain.domain}`,
    JSON.stringify({ score: 50, bounce_rate: 0, spam_rate: 0, daily_sends: 0 }),
    { expirationTtl: 24 * 60 * 60 },
  );
  return created(c, { domain });
});

domainsRouter.get("/", async (c) => {
  const tenantId = c.get("tenantId");
  const domains = await listDomains(c.env.DB, tenantId);
  const hydrated = await Promise.all(
    domains.map(async (domain) => ({
      ...domain,
      health: await getDomainHealth(c.env.KV, domain.domain),
    })),
  );
  return ok(c, { domains: hydrated });
});

domainsRouter.get("/:domain", async (c) => {
  const tenantId = c.get("tenantId");
  const record = await getDomainByName(c.env.DB, tenantId, c.req.param("domain").toLowerCase());
  if (!record) return fail(c, 404, "NOT_FOUND", "Domain not found");
  const health = await getDomainHealth(c.env.KV, record.domain);
  return ok(c, {
    domain: record,
    reputation_score: health.score,
    bounce_rate: health.bounce_rate,
    spam_rate: health.spam_rate,
    daily_sends_today: health.daily_sends,
    status: record.is_active === 0 ? "suspended" : toStatus(health.score),
  });
});

domainsRouter.put("/:domain/status", async (c) => {
  const parsed = statusSchema.safeParse(await c.req.json());
  if (!parsed.success) return fail(c, 400, "VALIDATION_ERROR", "Invalid status payload", { issues: parsed.error.issues });
  const tenantId = c.get("tenantId");
  const domain = await updateDomainActiveStatus(
    c.env.DB,
    tenantId,
    c.req.param("domain").toLowerCase(),
    parsed.data.status === "active",
  );
  if (!domain) return fail(c, 404, "NOT_FOUND", "Domain not found");
  return ok(c, { domain });
});

domainsRouter.delete("/:domain", async (c) => {
  const tenantId = c.get("tenantId");
  const existing = await getDomainByName(c.env.DB, tenantId, c.req.param("domain").toLowerCase());
  if (!existing) return fail(c, 404, "NOT_FOUND", "Domain not found");
  await deleteDomain(c.env.DB, tenantId, existing.domain);
  return noContent(c);
});

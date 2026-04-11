import { createMiddleware } from "hono/factory";

import { ApiError } from "../http";
import type { AppVariables, EnvBindings } from "../types";

interface RateLimitOptions {
  requests: number;
  windowSeconds: number;
}

export function rateLimit(options: RateLimitOptions) {
  return createMiddleware<{ Bindings: EnvBindings; Variables: AppVariables }>(async (c, next) => {
    if (!c.env.KV) {
      return next();
    }

    const window = Math.floor(Date.now() / 1000 / options.windowSeconds);

    // Use auth context if available, fall back to IP for public routes like /login
    const auth = c.get("auth");
    const actor = auth
      ? (auth.userId ?? auth.apiKeyId ?? "anon")
      : (c.req.header("cf-connecting-ip") ?? c.req.header("x-forwarded-for") ?? "unknown");
    const scope = auth ? `${auth.tenantId}:${actor}` : `ip:${actor}`;
    const key = `rl:${scope}:${window}`;

    const currentRaw = await c.env.KV.get(key);
    const current = Number(currentRaw ?? "0");

    if (current >= options.requests) {
      c.header("Retry-After", String(options.windowSeconds));
      throw new ApiError(429, "RATE_LIMITED", "Rate limit exceeded");
    }

    const nextValue = current + 1;
    await c.env.KV.put(key, String(nextValue), { expirationTtl: options.windowSeconds + 5 });
    c.header("X-RateLimit-Limit", String(options.requests));
    c.header("X-RateLimit-Remaining", String(Math.max(options.requests - nextValue, 0)));
    return next();
  });
}

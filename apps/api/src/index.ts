// REF: boss-hq/worker/src/index.ts — centralized entrypoint + request id + top-level error handling

import { Hono } from "hono";
import { cors } from "hono/cors";

import { authRouter } from "./routes/auth";
import { leadsRouter } from "./routes/leads";
import { corsHeaders } from "./cors";
import { ApiError, fail, makeRequestId, ok } from "./http";
import type { AppVariables, EnvBindings } from "./types";

const app = new Hono<{ Bindings: EnvBindings; Variables: AppVariables }>().basePath("/api/v1");

app.use("*", async (c, next) => {
  c.set("requestId", makeRequestId());
  return next();
});

app.use(
  "*",
  cors({
    origin: (origin) => {
      const headers = corsHeaders(origin);
      const value = headers["Access-Control-Allow-Origin"];
      return typeof value === "string" ? value : "http://localhost:3000";
    },
    allowMethods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowHeaders: ["Content-Type", "Authorization", "X-API-Key", "X-Tenant-ID"],
  }),
);

app.get("/health", (c) => ok(c, { status: "ok", ts: new Date().toISOString() }));
app.route("/auth", authRouter);
app.route("/leads", leadsRouter);

app.notFound((c) => fail(c, 404, "NOT_FOUND", "Route not found"));

app.onError((error, c) => {
  if (error instanceof ApiError) {
    return fail(c, error.status, error.code, error.message, error.details);
  }
  const message = error instanceof Error ? error.message : "Unexpected server error";
  return fail(c, 500, "INTERNAL_SERVER_ERROR", message);
});

export default app;

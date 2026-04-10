// REF: boss-hq/worker/src/index.ts — centralized entrypoint + request id + top-level error handling

import { Hono } from "hono";
import { cors } from "hono/cors";

import { authRouter } from "./routes/auth";
import { aggregatorsRouter } from "./routes/aggregators";
import { campaignsRouter } from "./routes/campaigns";
import { clientsRouter } from "./routes/clients";
import { deliveryRouter } from "./routes/delivery";
import { domainsRouter } from "./routes/domains";
import { invoicesRouter } from "./routes/invoices";
import { leadsRouter } from "./routes/leads";
import { webhooksRouter } from "./routes/webhooks";
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
app.route("/campaigns", campaignsRouter);
app.route("/clients", clientsRouter);
app.route("/aggregators", aggregatorsRouter);
app.route("/delivery", deliveryRouter);
app.route("/invoices", invoicesRouter);
app.route("/domains", domainsRouter);
app.route("/webhooks", webhooksRouter);

app.notFound((c) => fail(c, 404, "NOT_FOUND", "Route not found"));

app.onError((error, c) => {
  if (error instanceof ApiError) {
    return fail(c, error.status, error.code, error.message, error.details);
  }
  const message = error instanceof Error ? error.message : "Unexpected server error";
  return fail(c, 500, "INTERNAL_SERVER_ERROR", message);
});

export default app;

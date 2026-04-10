// REF: boss-hq/worker/src/http.ts — request id + typed API error envelope pattern

import type { Context } from "hono";

export interface ApiErrorEnvelope {
  code: string;
  message: string;
  details?: Record<string, unknown>;
  request_id: string;
}

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details?: Record<string, unknown>;

  constructor(status: number, code: string, message: string, details?: Record<string, unknown>) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export function makeRequestId(): string {
  return crypto.randomUUID();
}

export function ok<T>(c: Context, data: T, meta?: Record<string, unknown>): Response {
  return c.json(meta ? { data, meta } : { data }, 200);
}

export function created<T>(c: Context, data: T, meta?: Record<string, unknown>): Response {
  return c.json(meta ? { data, meta } : { data }, 201);
}

export function noContent(c: Context): Response {
  return c.body(null, 204);
}

export function fail(
  c: Context,
  status: number,
  code: string,
  message: string,
  details?: Record<string, unknown>,
): Response {
  const requestId = c.get("requestId") ?? "unknown";
  const error: ApiErrorEnvelope = { code, message, details, request_id: requestId };
  return new Response(JSON.stringify({ error }), {
    status,
    headers: {
      "Content-Type": "application/json",
    },
  });
}

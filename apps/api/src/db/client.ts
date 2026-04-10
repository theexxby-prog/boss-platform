// REF: boss-hq/worker/src/db.ts — thin typed D1 helper pattern

import type { D1Database } from "@cloudflare/workers-types";

export async function dbAll<T>(db: D1Database, query: string, params: unknown[] = []): Promise<T[]> {
  const result = await db.prepare(query).bind(...params).all<T>();
  return result.results;
}

export async function dbFirst<T>(
  db: D1Database,
  query: string,
  params: unknown[] = [],
): Promise<T | null> {
  return db.prepare(query).bind(...params).first<T>();
}

export async function dbRun(
  db: D1Database,
  query: string,
  params: unknown[] = [],
): Promise<{ success: boolean; lastRowId: number | null; rowsAffected: number }> {
  const result = await db.prepare(query).bind(...params).run();
  return {
    success: result.success,
    lastRowId: result.meta?.last_row_id ?? null,
    rowsAffected: result.meta?.changes ?? 0,
  };
}

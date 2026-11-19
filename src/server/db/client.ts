/* eslint-disable @typescript-eslint/no-explicit-any */
import { createAdminClient } from "@/server/db/runtime";
import { getLocalClient } from "@/server/db/local";

export type DatabaseMode = "supabase" | "local";

export type DbError = { message: string; code?: string };
export type DbResult<T = any> = { data: T; error: DbError | null };

/**
 * The chainable query surface PlatePilot uses from Supabase. The local
 * database implements exactly the same shape, so no caller needs to know which
 * database is in use.
 */
export interface DbQuery {
  select(columns?: string, options?: { count?: string; head?: boolean }): DbQuery;
  insert(values: Record<string, unknown> | Record<string, unknown>[]): DbQuery;
  update(values: Record<string, unknown>): DbQuery;
  delete(): DbQuery;
  eq(column: string, value: unknown): DbQuery;
  limit(count: number): DbQuery;
  single(): Promise<DbResult>;
  maybeSingle(): Promise<DbResult>;
  then<TResult1 = DbResult, TResult2 = never>(
    onfulfilled?: ((value: DbResult) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): PromiseLike<TResult1 | TResult2>;
}

export interface DbClient {
  rpc(name: string, params?: Record<string, unknown>): Promise<DbResult>;
  from(table: string): DbQuery;
}

/**
 * Returns the database client for this request.
 *
 * When Supabase is configured the project client is used. Otherwise PlatePilot
 * falls back to its own local, file-backed PostgreSQL so the product works
 * without a hosted project. Both clients expose the same `rpc` and `from`
 * surface, so no caller needs to know which one is in use.
 */
export async function getDbClient(): Promise<DbClient> {
  if (process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return createAdminClient() as unknown as DbClient;
  }
  return (await getLocalClient()) as unknown as DbClient;
}

export function getDatabaseMode(): DatabaseMode {
  return process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY
    ? "supabase"
    : "local";
}

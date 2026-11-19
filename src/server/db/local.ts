import { PGlite } from "@electric-sql/pglite";
import { mkdir, readFile, readdir } from "node:fs/promises";
import { resolve } from "node:path";

/**
 * Local persistent database.
 *
 * PlatePilot must be usable without a hosted Supabase project, otherwise the
 * product cannot be set up, ordered against, or demonstrated at all. This
 * adapter runs the exact same migrations against a file-backed PostgreSQL
 * (PGlite), so the schema, the transactional functions and the tenant rules
 * are identical in both modes.
 *
 * It exposes the small slice of the Supabase surface the application uses:
 * `rpc(name, params)` and `from(table)` with `select`, `insert`, `update`,
 * `eq`, `limit` and `single`.
 */

type Row = Record<string, unknown>;
type DbError = { message: string; code?: string } | null;
type DbResult = { data: unknown; error: DbError };

const IDENTIFIER = /^[a-z_][a-z0-9_]*$/;

function assertIdentifier(value: string, kind: string) {
  if (!IDENTIFIER.test(value)) throw new Error(`INVALID_${kind.toUpperCase()}`);
}

function cleanMessage(message: string) {
  const match = /^(?:error:\s*)?(?:[A-Z0-9_]+:\s*)?([\s\S]*)$/.exec(message);
  return (match?.[1] ?? message).trim();
}

let instance: Promise<PGlite> | null = null;
const setReturning = new Map<string, boolean>();

async function applyMigrations(db: PGlite) {
  await db.exec(`
    -- Supabase provides these roles; the local database has to create them
    -- itself before the migrations grant privileges on them.
    do $$ begin create role anon; exception when duplicate_object then null; end $$;
    do $$ begin create role authenticated; exception when duplicate_object then null; end $$;
    do $$ begin create role service_role; exception when duplicate_object then null; end $$;
    create schema if not exists auth;
    create or replace function auth.uid() returns uuid language sql stable as $$
      select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    create table if not exists schema_migrations (
      name text primary key,
      applied_at timestamptz not null default now()
    );
  `);
  const directory = resolve(process.cwd(), "supabase/migrations");
  let files: string[];
  try {
    files = (await readdir(directory)).filter((name) => name.endsWith(".sql")).sort();
  } catch {
    // No migrations on disk (a bundled production build). The database stays as it is.
    return;
  }
  for (const file of files) {
    const applied = await db.query<{ name: string }>("select name from schema_migrations where name = $1", [file]);
    if (applied.rows.length > 0) continue;
    await db.exec(await readFile(resolve(directory, file), "utf8"));
    await db.query("insert into schema_migrations(name) values ($1) on conflict (name) do nothing", [file]);
  }
}

async function openDatabase() {
  const dataDir = process.env.LOCAL_DB_DIR || resolve(process.cwd(), ".data/platepilot");
  await mkdir(dataDir, { recursive: true });
  const db = await PGlite.create({ dataDir });
  await applyMigrations(db);
  return db;
}

export function getLocalDatabase() {
  if (!instance) instance = openDatabase();
  return instance;
}

/**
 * The acting user for this request. The local database resolves `auth.uid()`
 * from a transaction-local setting, so every authorisation check inside the
 * database functions behaves exactly as it does under Supabase Auth.
 */
async function currentUserId() {
  try {
    // Imported lazily: the session helpers depend on the Next.js request
    // context, which a plain Node worker does not have.
    const { readLocalSessionUserId } = await import("@/server/auth/local-session");
    return await readLocalSessionUserId();
  } catch {
    return null;
  }
}

/* -------------------------------------------------------------------------- */
/* Query builder                                                              */
/* -------------------------------------------------------------------------- */

class LocalQuery {
  private readonly db: PGlite;
  private readonly table: string;
  private readonly action: "select" | "insert" | "update" | "delete";
  private columns: string | null = null;
  private payload: Row | Row[] | null = null;
  private readonly filters: { column: string; value: unknown }[] = [];
  private limitCount: number | null = null;
  private headOnly = false;
  private wantsSingle = false;

  constructor(db: PGlite, table: string, action: "select" | "insert" | "update" | "delete") {
    assertIdentifier(table, "table");
    this.db = db;
    this.table = table;
    this.action = action;
  }

  select(columns?: string, options?: { count?: string; head?: boolean }) {
    if (columns) this.columns = columns;
    if (options?.head) this.headOnly = true;
    return this;
  }

  insert(values: Row | Row[]) {
    this.payload = values;
    return this;
  }

  update(values: Row) {
    this.payload = values;
    return this;
  }

  delete() {
    return this;
  }

  eq(column: string, value: unknown) {
    assertIdentifier(column, "column");
    this.filters.push({ column, value });
    return this;
  }

  limit(count: number) {
    this.limitCount = Math.max(0, Math.trunc(count));
    return this;
  }

  single() {
    this.wantsSingle = true;
    return this;
  }

  maybeSingle() {
    this.wantsSingle = false;
    this.limitCount = 1;
    return this;
  }

  private whereClause(values: unknown[]) {
    if (this.filters.length === 0) return { sql: "", values };
    const parts = this.filters.map((filter) => {
      values.push(filter.value);
      return `${filter.column} = $${values.length}`;
    });
    return { sql: ` where ${parts.join(" and ")}`, values };
  }

  private async run(): Promise<DbResult> {
    try {
      if (this.action === "insert") {
        const rows = Array.isArray(this.payload) ? this.payload : [this.payload ?? {}];
        const columns = Object.keys(rows[0] ?? {});
        const values: unknown[] = [];
        const tuples = rows.map((row) => {
          const placeholders = columns.map((column) => {
            values.push(row[column] ?? null);
            return `$${values.length}`;
          });
          return `(${placeholders.join(", ")})`;
        });
        let sql = `insert into ${this.table} (${columns.join(", ")}) values ${tuples.join(", ")}`;
        if (this.columns) sql += ` returning ${this.columns}`;
        const result = await this.db.query<Row>(sql, values);
        if (!this.columns) return { data: null, error: null };
        return { data: result.rows[0] ?? null, error: null };
      }

      if (this.action === "update") {
        const rows = Array.isArray(this.payload) ? this.payload : [this.payload ?? {}];
        const values: unknown[] = [];
        const assignments = Object.keys(rows[0] ?? {}).map((column) => {
          values.push(rows[0][column] ?? null);
          return `${column} = $${values.length}`;
        });
        const where = this.whereClause(values);
        const sql = `update ${this.table} set ${assignments.join(", ")}${where.sql}`;
        const result = await this.db.query<Row>(sql, values);
        if (!this.columns) return { data: null, error: null };
        return { data: result.rows[0] ?? null, error: null };
      }

      if (this.action === "delete") {
        const values: unknown[] = [];
        const where = this.whereClause(values);
        await this.db.query(`delete from ${this.table}${where.sql}`, values);
        return { data: null, error: null };
      }

      const values: unknown[] = [];
      const where = this.whereClause(values);
      const columns = this.columns ?? "*";
      let sql = `select ${columns} from ${this.table}${where.sql}`;
      if (this.limitCount !== null) sql += ` limit ${this.limitCount}`;
      const result = await this.db.query<Row>(sql, values);
      if (this.headOnly) return { data: null, error: null };
      if (this.wantsSingle) {
        if (result.rows.length !== 1) {
          return { data: null, error: { message: "JSON object requested, multiple (or no) rows returned", code: "PGRST116" } };
        }
        return { data: result.rows[0], error: null };
      }
      return { data: result.rows, error: null };
    } catch (error) {
      const failure = error as { message?: string; code?: string };
      return { data: null, error: { message: cleanMessage(failure.message ?? "QUERY_FAILED"), code: failure.code } };
    }
  }

  then<TResult1 = DbResult, TResult2 = never>(
    onfulfilled?: ((value: DbResult) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ) {
    return this.run().then(onfulfilled, onrejected);
  }
}

/* -------------------------------------------------------------------------- */
/* Client                                                                     */
/* -------------------------------------------------------------------------- */

class LocalClient {
  private readonly db: PGlite;

  constructor(db: PGlite) {
    this.db = db;
  }

  from(table: string) {
    return new LocalQuery(this.db, table, "select");
  }

  async rpc(name: string, params: Record<string, unknown> = {}): Promise<DbResult> {
    assertIdentifier(name, "function");
    try {
      const entries = Object.entries(params);
      const values = entries.map((entry) => entry[1]);
      const named = entries.map((entry, index) => `${entry[0]} => $${index + 1}`).join(", ");

      let returnsSet = setReturning.get(name);
      if (returnsSet === undefined) {
        const lookup = await this.db.query<{ proretset: boolean }>(
          "select proretset from pg_proc where proname = $1 and pronamespace = 'public'::regnamespace limit 1",
          [name],
        );
        returnsSet = lookup.rows[0]?.proretset ?? false;
        setReturning.set(name, returnsSet);
      }

      const sql = returnsSet
        ? `select * from ${name}(${named})`
        : `select ${name}(${named})`;

      const userId = await currentUserId();
      const run = async (tx: PGlite) => {
        if (userId) await tx.query("select set_config('request.jwt.claim.sub', $1, true)", [userId]);
        return tx.query<Row>(sql, values);
      };

      const result = userId
        ? await this.db.transaction(async (tx) => run(tx as unknown as PGlite))
        : await run(this.db);

      if (returnsSet) return { data: result.rows, error: null };
      const first = result.rows[0];
      if (!first) return { data: null, error: null };
      const key = Object.keys(first)[0];
      return { data: first[key], error: null };
    } catch (error) {
      const failure = error as { message?: string; code?: string };
      return { data: null, error: { message: cleanMessage(failure.message ?? "RPC_FAILED"), code: failure.code } };
    }
  }
}

let client: Promise<LocalClient> | null = null;

export function getLocalClient() {
  if (!client) {
    client = getLocalDatabase().then(async (db) => {
      // The embedded database allows a single writer, so the job loop lives in
      // this process. The import is dynamic so the standalone worker, which
      // does not share this directory, never loads the Next-only module.
      try {
        const { startLocalJobRunner } = await import("@/server/worker/local");
        startLocalJobRunner();
      } catch { /* not a Next.js request context */ }
      return new LocalClient(db);
    });
  }
  return client;
}

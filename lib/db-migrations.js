"use strict";

const MIGRATIONS = [
  {
    version: 1,
    name: "core_operational_tables",
    statements: [
      "CREATE TABLE IF NOT EXISTS ultron_state (id smallint PRIMARY KEY CHECK (id=1), payload jsonb NOT NULL, updated_at timestamptz NOT NULL DEFAULT NOW())",
      "CREATE TABLE IF NOT EXISTS ultron_sessions (session_hash char(64) PRIMARY KEY, expires_at timestamptz NOT NULL, created_at timestamptz NOT NULL DEFAULT NOW())",
      "CREATE INDEX IF NOT EXISTS ultron_sessions_expires_idx ON ultron_sessions (expires_at)",
      "CREATE TABLE IF NOT EXISTS ultron_approvals (id text PRIMARY KEY, payload jsonb NOT NULL, status text NOT NULL, risk text NOT NULL, created_at timestamptz NOT NULL)",
      "CREATE INDEX IF NOT EXISTS ultron_approvals_status_created_idx ON ultron_approvals (status, created_at DESC)",
      "CREATE TABLE IF NOT EXISTS ultron_tasks (id text PRIMARY KEY, payload jsonb NOT NULL, status text NOT NULL, priority text NOT NULL, created_at timestamptz NOT NULL, updated_at timestamptz NOT NULL)",
      "CREATE INDEX IF NOT EXISTS ultron_tasks_status_priority_idx ON ultron_tasks (status, priority, created_at DESC)",
      "CREATE TABLE IF NOT EXISTS ultron_memories (id text PRIMARY KEY, payload jsonb NOT NULL, category text NOT NULL, created_at timestamptz NOT NULL)",
      "CREATE INDEX IF NOT EXISTS ultron_memories_category_created_idx ON ultron_memories (category, created_at DESC)",
      "CREATE TABLE IF NOT EXISTS ultron_audit (id text PRIMARY KEY, payload jsonb NOT NULL, event text NOT NULL, created_at timestamptz NOT NULL)",
      "CREATE INDEX IF NOT EXISTS ultron_audit_event_created_idx ON ultron_audit (event, created_at DESC)"
    ]
  },
  {
    version: 2,
    name: "durable_background_job_queue",
    statements: [
      "CREATE TABLE IF NOT EXISTS ultron_jobs (id text PRIMARY KEY, job_type text NOT NULL, payload jsonb NOT NULL DEFAULT '{}'::jsonb, status text NOT NULL CHECK (status IN ('queued','running','completed','failed')), attempts integer NOT NULL DEFAULT 0, max_attempts integer NOT NULL DEFAULT 4, available_at timestamptz NOT NULL DEFAULT NOW(), locked_at timestamptz, locked_by text, last_error text, result jsonb, created_at timestamptz NOT NULL DEFAULT NOW(), updated_at timestamptz NOT NULL DEFAULT NOW())",
      "CREATE INDEX IF NOT EXISTS ultron_jobs_claim_idx ON ultron_jobs (status, available_at, created_at)",
      "CREATE INDEX IF NOT EXISTS ultron_jobs_lease_idx ON ultron_jobs (locked_at) WHERE status='running'"
    ]
  }
];

async function runMigrations(pool) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock($1)", [74190826]);
    await client.query("CREATE TABLE IF NOT EXISTS ultron_schema_migrations (version integer PRIMARY KEY, name text NOT NULL, applied_at timestamptz NOT NULL DEFAULT NOW())");
    const result = await client.query("SELECT version FROM ultron_schema_migrations");
    const applied = new Set(result.rows.map(row => Number(row.version)));
    for (const migration of MIGRATIONS) {
      if (applied.has(migration.version)) continue;
      for (const statement of migration.statements) await client.query(statement);
      await client.query("INSERT INTO ultron_schema_migrations (version,name) VALUES ($1,$2)", [migration.version, migration.name]);
    }
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

function asDate(value) {
  const date = value ? new Date(value) : new Date();
  return Number.isNaN(date.getTime()) ? new Date() : date;
}

async function replaceRows(client, table, rows, columns, valuesFor) {
  await client.query("DELETE FROM " + table);
  for (const item of rows) {
    const values = valuesFor(item);
    const placeholders = values.map((_, index) => "$" + (index + 1)).join(",");
    await client.query(
      "INSERT INTO " + table + " (" + columns.join(",") + ") VALUES (" + placeholders + ") ON CONFLICT (id) DO UPDATE SET " + columns.slice(1).map(column => column + "=EXCLUDED." + column).join(","),
      values
    );
  }
}

async function syncProjection(client, state) {
  await replaceRows(client, "ultron_approvals", state.approvals || [], ["id","payload","status","risk","created_at"],
    item => [String(item.id), JSON.stringify(item), String(item.status || "pending"), String(item.risk || "low"), asDate(item.createdAt)]);
  await replaceRows(client, "ultron_tasks", state.tasks || [], ["id","payload","status","priority","created_at","updated_at"],
    item => [String(item.id), JSON.stringify(item), String(item.status || "queued"), String(item.priority || "normal"), asDate(item.createdAt), asDate(item.updatedAt || item.createdAt)]);
  await replaceRows(client, "ultron_memories", state.memories || [], ["id","payload","category","created_at"],
    item => [String(item.id), JSON.stringify(item), String(item.category || "fact"), asDate(item.createdAt)]);
  await replaceRows(client, "ultron_audit", state.audit || [], ["id","payload","event","created_at"],
    item => [String(item.id), JSON.stringify(item), String(item.event || "unknown"), asDate(item.at)]);
}

module.exports = { runMigrations, syncProjection, MIGRATIONS };

"use strict";

const { randomUUID } = require("node:crypto");

const JOB_TYPES = Object.freeze({
  "maintenance.session_cleanup": async client => {
    const result = await client.query("DELETE FROM ultron_sessions WHERE expires_at <= NOW()");
    return { removedExpiredSessions: result.rowCount };
  },
  "maintenance.database_health": async client => {
    const result = await client.query(
      "SELECT (SELECT COUNT(*)::int FROM ultron_jobs) AS jobs, " +
      "(SELECT COUNT(*)::int FROM ultron_sessions WHERE expires_at > NOW()) AS active_sessions, " +
      "(SELECT COUNT(*)::int FROM ultron_approvals WHERE status='pending') AS pending_approvals"
    );
    return result.rows[0];
  }
});

function createJobWorker({ pool, pollMs = 2000, concurrency = 2, leaseMs = 300000, workerId = randomUUID() }) {
  if (!pool) throw new Error("A PostgreSQL pool is required for the job worker");
  let stopping = true;
  let timer = null;
  let active = 0;
  const running = new Set();

  async function claim() {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(
        "UPDATE ultron_jobs SET status='queued', locked_at=NULL, locked_by=NULL, updated_at=NOW(), " +
        "available_at=NOW() WHERE status='running' AND locked_at < NOW() - ($1::int * INTERVAL '1 millisecond')",
        [leaseMs]
      );
      const selected = await client.query(
        "SELECT id, job_type, payload, attempts, max_attempts FROM ultron_jobs " +
        "WHERE status='queued' AND available_at <= NOW() ORDER BY created_at ASC " +
        "FOR UPDATE SKIP LOCKED LIMIT 1"
      );
      if (!selected.rowCount) {
        await client.query("COMMIT");
        return null;
      }
      const job = selected.rows[0];
      const claimed = await client.query(
        "UPDATE ultron_jobs SET status='running', attempts=attempts+1, locked_at=NOW(), " +
        "locked_by=$2, updated_at=NOW() WHERE id=$1 RETURNING *",
        [job.id, workerId]
      );
      await client.query("COMMIT");
      return claimed.rows[0];
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async function execute(job) {
    const handler = JOB_TYPES[job.job_type];
    if (!handler) throw new Error("Unsupported job type");
    const client = await pool.connect();
    try {
      const result = await handler(client, job.payload || {});
      await client.query(
        "UPDATE ultron_jobs SET status='completed', result=$2::jsonb, last_error=NULL, " +
        "locked_at=NULL, locked_by=NULL, updated_at=NOW() WHERE id=$1 AND locked_by=$3",
        [job.id, JSON.stringify(result), workerId]
      );
    } finally {
      client.release();
    }
  }

  async function fail(job, error) {
    const terminal = Number(job.attempts) >= Number(job.max_attempts);
    const delaySeconds = Math.min(300, 2 ** Math.min(Number(job.attempts), 8) * 5);
    await pool.query(
      "UPDATE ultron_jobs SET status=$2, available_at=NOW()+($3::int * INTERVAL '1 second'), " +
      "last_error=$4, locked_at=NULL, locked_by=NULL, updated_at=NOW() WHERE id=$1 AND locked_by=$5",
      [job.id, terminal ? "failed" : "queued", delaySeconds, String(error && error.message || error).slice(0, 500), workerId]
    );
  }

  async function processOne() {
    const job = await claim();
    if (!job) return;
    try {
      await execute(job);
    } catch (error) {
      await fail(job, error);
    }
  }

  function schedule() {
    if (stopping) return;
    while (active < concurrency) {
      active += 1;
      const task = processOne()
        .catch(error => console.error("ULTRON worker cycle failed:", error.message))
        .finally(() => {
          active -= 1;
          running.delete(task);
        });
      running.add(task);
    }
    timer = setTimeout(schedule, pollMs);
  }

  return {
    workerId,
    start() {
      if (!stopping) return;
      stopping = false;
      schedule();
    },
    async stop() {
      stopping = true;
      if (timer) clearTimeout(timer);
      timer = null;
      await Promise.allSettled([...running]);
    }
  };
}

module.exports = { createJobWorker, JOB_TYPES };

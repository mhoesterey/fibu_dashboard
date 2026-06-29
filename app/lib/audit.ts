import { env } from "cloudflare:workers";
import type { RefreshRun, WorkspaceUser } from "./types";

type AuditInput = {
  user: WorkspaceUser;
  action: "dashboard_refresh" | "mandate_view" | "mandate_validate";
  targetType: "dashboard" | "client";
  targetRef?: string;
  metadata?: Record<string, unknown>;
};

export async function recordAuditEvent(input: AuditInput) {
  try {
    if (!env.DB) return { stored: false, reason: "D1 binding unavailable" };
    await ensureAuditTables();
    await env.DB.prepare(
      `INSERT INTO audit_log (
        id, occurred_at, actor_email, action, target_type, target_ref, metadata_json
      ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
      .bind(
        crypto.randomUUID(),
        new Date().toISOString(),
        input.user.email,
        input.action,
        input.targetType,
        input.targetRef ?? null,
        JSON.stringify(input.metadata ?? {}),
      )
      .run();
    return { stored: true };
  } catch (error) {
    return {
      stored: false,
      reason: error instanceof Error ? error.message : "Audit failed",
    };
  }
}

export async function recordRefreshRun(run: RefreshRun) {
  try {
    if (!env.DB) return { stored: false, reason: "D1 binding unavailable" };
    await ensureAuditTables();
    await env.DB.prepare(
      `INSERT INTO refresh_runs (
        id, started_at, finished_at, status, triggered_by, log_json, error_message,
        checked_clients, average_score
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
      .bind(
        run.id,
        run.startedAt,
        run.finishedAt,
        run.status,
        run.triggeredBy,
        JSON.stringify(run.log),
        run.errorMessage ?? null,
        Number(run.log.length > 0),
        0,
      )
      .run();
    return { stored: true };
  } catch (error) {
    return {
      stored: false,
      reason: error instanceof Error ? error.message : "Refresh log failed",
    };
  }
}

async function ensureAuditTables() {
  await env.DB.batch([
    env.DB.prepare(
      `CREATE TABLE IF NOT EXISTS audit_log (
        id TEXT PRIMARY KEY,
        occurred_at TEXT NOT NULL,
        actor_email TEXT NOT NULL,
        action TEXT NOT NULL,
        target_type TEXT NOT NULL,
        target_ref TEXT,
        metadata_json TEXT NOT NULL DEFAULT '{}'
      )`,
    ),
    env.DB.prepare(
      `CREATE TABLE IF NOT EXISTS refresh_runs (
        id TEXT PRIMARY KEY,
        started_at TEXT NOT NULL,
        finished_at TEXT,
        status TEXT NOT NULL,
        triggered_by TEXT NOT NULL,
        log_json TEXT NOT NULL DEFAULT '[]',
        error_message TEXT,
        checked_clients INTEGER NOT NULL DEFAULT 0,
        average_score REAL NOT NULL DEFAULT 0
      )`,
    ),
    env.DB.prepare(
      "CREATE INDEX IF NOT EXISTS audit_log_actor_idx ON audit_log (actor_email, occurred_at)",
    ),
    env.DB.prepare(
      "CREATE INDEX IF NOT EXISTS refresh_runs_status_idx ON refresh_runs (status, started_at)",
    ),
  ]);
}

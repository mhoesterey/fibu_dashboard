import { integer, real, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const clients = sqliteTable("clients", {
  id: text("id").primaryKey(),
  mandatsnummer: text("mandatsnummer").notNull().unique(),
  mandantenname: text("mandantenname").notNull(),
  zeitraum: text("zeitraum").notNull(),
  verantwortlicherMitarbeiter: text("verantwortlicher_mitarbeiter").notNull(),
  datenstand: text("datenstand").notNull(),
  qsRegelversion: text("qs_regelversion").notNull(),
  authorizedUsersJson: text("authorized_users_json").notNull().default("[]"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const qsChecks = sqliteTable("qs_checks", {
  id: text("id").primaryKey(),
  category: text("category").notNull(),
  title: text("title").notNull(),
  defaultSeverity: text("default_severity").notNull(),
  active: integer("active", { mode: "boolean" }).notNull().default(true),
  sortOrder: integer("sort_order").notNull(),
});

export const qsResults = sqliteTable("qs_results", {
  id: text("id").primaryKey(),
  clientId: text("client_id").notNull(),
  checkId: text("check_id").notNull(),
  status: text("status").notNull(),
  severity: text("severity").notNull(),
  finding: text("finding").notNull(),
  evidence: text("evidence").notNull(),
  recommendation: text("recommendation").notNull(),
  ownerRole: text("owner_role").notNull(),
  dueDate: text("due_date"),
  calculatedAt: text("calculated_at").notNull(),
});

export const refreshRuns = sqliteTable("refresh_runs", {
  id: text("id").primaryKey(),
  startedAt: text("started_at").notNull(),
  finishedAt: text("finished_at"),
  status: text("status").notNull(),
  triggeredBy: text("triggered_by").notNull(),
  logJson: text("log_json").notNull().default("[]"),
  errorMessage: text("error_message"),
  checkedClients: integer("checked_clients").notNull().default(0),
  averageScore: real("average_score").notNull().default(0),
});

export const auditLog = sqliteTable("audit_log", {
  id: text("id").primaryKey(),
  occurredAt: text("occurred_at").notNull(),
  actorEmail: text("actor_email").notNull(),
  action: text("action").notNull(),
  targetType: text("target_type").notNull(),
  targetRef: text("target_ref"),
  metadataJson: text("metadata_json").notNull().default("{}"),
});

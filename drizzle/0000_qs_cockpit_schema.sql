CREATE TABLE `clients` (
  `id` text PRIMARY KEY NOT NULL,
  `mandatsnummer` text NOT NULL,
  `mandantenname` text NOT NULL,
  `zeitraum` text NOT NULL,
  `verantwortlicher_mitarbeiter` text NOT NULL,
  `datenstand` text NOT NULL,
  `qs_regelversion` text NOT NULL,
  `authorized_users_json` text DEFAULT '[]' NOT NULL,
  `created_at` text NOT NULL,
  `updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `clients_mandatsnummer_unique` ON `clients` (`mandatsnummer`);
--> statement-breakpoint
CREATE TABLE `qs_checks` (
  `id` text PRIMARY KEY NOT NULL,
  `category` text NOT NULL,
  `title` text NOT NULL,
  `default_severity` text NOT NULL,
  `active` integer DEFAULT true NOT NULL,
  `sort_order` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `qs_results` (
  `id` text PRIMARY KEY NOT NULL,
  `client_id` text NOT NULL,
  `check_id` text NOT NULL,
  `status` text NOT NULL,
  `severity` text NOT NULL,
  `finding` text NOT NULL,
  `evidence` text NOT NULL,
  `recommendation` text NOT NULL,
  `owner_role` text NOT NULL,
  `due_date` text,
  `calculated_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `refresh_runs` (
  `id` text PRIMARY KEY NOT NULL,
  `started_at` text NOT NULL,
  `finished_at` text,
  `status` text NOT NULL,
  `triggered_by` text NOT NULL,
  `log_json` text DEFAULT '[]' NOT NULL,
  `error_message` text,
  `checked_clients` integer DEFAULT 0 NOT NULL,
  `average_score` real DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE `audit_log` (
  `id` text PRIMARY KEY NOT NULL,
  `occurred_at` text NOT NULL,
  `actor_email` text NOT NULL,
  `action` text NOT NULL,
  `target_type` text NOT NULL,
  `target_ref` text,
  `metadata_json` text DEFAULT '{}' NOT NULL
);
--> statement-breakpoint
CREATE INDEX `audit_log_actor_idx` ON `audit_log` (`actor_email`, `occurred_at`);
--> statement-breakpoint
CREATE INDEX `refresh_runs_status_idx` ON `refresh_runs` (`status`, `started_at`);

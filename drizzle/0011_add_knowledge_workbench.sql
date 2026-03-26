-- Create session_runtime_stats table for session-level usage and lifecycle tracking
CREATE TABLE `session_runtime_stats` (
	`id` text PRIMARY KEY NOT NULL,
	`task_id` text NOT NULL,
	`session_id` text NOT NULL,
	`provider` text,
	`status` text NOT NULL,
	`started_at` integer NOT NULL,
	`ended_at` integer,
	`active_duration_ms` integer DEFAULT 0 NOT NULL,
	`idle_duration_ms` integer DEFAULT 0 NOT NULL,
	`input_tokens` integer DEFAULT 0 NOT NULL,
	`output_tokens` integer DEFAULT 0 NOT NULL,
	`usage_metadata_json` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`task_id`) REFERENCES `tasks`(`id`) ON DELETE CASCADE
);

CREATE UNIQUE INDEX `idx_session_runtime_stats_session_id` ON `session_runtime_stats` (`session_id`);
CREATE INDEX `idx_session_runtime_stats_task_id` ON `session_runtime_stats` (`task_id`);
CREATE INDEX `idx_session_runtime_stats_status` ON `session_runtime_stats` (`status`);
CREATE INDEX `idx_session_runtime_stats_created_at` ON `session_runtime_stats` (`created_at`);

-- Create session_distillations table for session summarization runs
CREATE TABLE `session_distillations` (
	`id` text PRIMARY KEY NOT NULL,
	`task_id` text NOT NULL,
	`session_id` text NOT NULL,
	`provider` text,
	`status` text NOT NULL,
	`prompt_version` text,
	`started_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`finished_at` integer,
	`error_message` text,
	`raw_response` text,
	`summary_markdown` text,
	`final_conclusion` text,
	`evidence_refs_json` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`task_id`) REFERENCES `tasks`(`id`) ON DELETE CASCADE
);

CREATE INDEX `idx_session_distillations_task_id` ON `session_distillations` (`task_id`);
CREATE INDEX `idx_session_distillations_session_id` ON `session_distillations` (`session_id`);
CREATE INDEX `idx_session_distillations_status` ON `session_distillations` (`status`);
CREATE INDEX `idx_session_distillations_created_at` ON `session_distillations` (`created_at`);

-- Create knowledge_candidates table for reviewable distillation outputs
CREATE TABLE `knowledge_candidates` (
	`id` text PRIMARY KEY NOT NULL,
	`task_id` text NOT NULL,
	`session_id` text NOT NULL,
	`distillation_id` text,
	`title` text NOT NULL,
	`card_kind` text NOT NULL,
	`summary` text NOT NULL,
	`body_markdown` text,
	`source_count` integer DEFAULT 0 NOT NULL,
	`confidence` integer,
	`status` text NOT NULL,
	`evidence_refs_json` text,
	`tags_json` text,
	`reviewed_at` integer,
	`reviewed_by` text,
	`promoted_card_id` text,
	`archived_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`task_id`) REFERENCES `tasks`(`id`) ON DELETE CASCADE,
	FOREIGN KEY (`distillation_id`) REFERENCES `session_distillations`(`id`) ON DELETE SET NULL
);

CREATE INDEX `idx_knowledge_candidates_task_id` ON `knowledge_candidates` (`task_id`);
CREATE INDEX `idx_knowledge_candidates_session_id` ON `knowledge_candidates` (`session_id`);
CREATE INDEX `idx_knowledge_candidates_status` ON `knowledge_candidates` (`status`);
CREATE INDEX `idx_knowledge_candidates_card_kind` ON `knowledge_candidates` (`card_kind`);
CREATE INDEX `idx_knowledge_candidates_created_at` ON `knowledge_candidates` (`created_at`);

-- Create knowledge_cards table for promoted knowledge artifacts
CREATE TABLE `knowledge_cards` (
	`id` text PRIMARY KEY NOT NULL,
	`candidate_id` text,
	`task_id` text NOT NULL,
	`session_id` text NOT NULL,
	`title` text NOT NULL,
	`card_kind` text NOT NULL,
	`summary` text NOT NULL,
	`content` text NOT NULL,
	`status` text NOT NULL,
	`evidence_refs_json` text,
	`tags_json` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`archived_at` integer,
	FOREIGN KEY (`candidate_id`) REFERENCES `knowledge_candidates`(`id`) ON DELETE SET NULL,
	FOREIGN KEY (`task_id`) REFERENCES `tasks`(`id`) ON DELETE CASCADE
);

CREATE INDEX `idx_knowledge_cards_candidate_id` ON `knowledge_cards` (`candidate_id`);
CREATE INDEX `idx_knowledge_cards_task_id` ON `knowledge_cards` (`task_id`);
CREATE INDEX `idx_knowledge_cards_session_id` ON `knowledge_cards` (`session_id`);
CREATE INDEX `idx_knowledge_cards_status` ON `knowledge_cards` (`status`);
CREATE INDEX `idx_knowledge_cards_card_kind` ON `knowledge_cards` (`card_kind`);
CREATE INDEX `idx_knowledge_cards_created_at` ON `knowledge_cards` (`created_at`);

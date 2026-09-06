CREATE TABLE `attempts` (
	`id` bigint unsigned AUTO_INCREMENT NOT NULL,
	`question_id` bigint unsigned,
	`session_id` bigint unsigned,
	`question_version` int NOT NULL,
	`subject_name` varchar(160) NOT NULL,
	`topic_name` varchar(160) NOT NULL,
	`subtopic_name` varchar(160) NOT NULL,
	`question_statement` text NOT NULL,
	`question_type` enum('single','multiple') NOT NULL,
	`difficulty` enum('easy','medium','hard') NOT NULL,
	`presented_options` json NOT NULL,
	`selected_option_ids` json NOT NULL,
	`is_correct` boolean NOT NULL,
	`answered_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `attempts_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `question_options` (
	`id` bigint unsigned AUTO_INCREMENT NOT NULL,
	`question_id` bigint unsigned NOT NULL,
	`text` text NOT NULL,
	`is_correct` boolean NOT NULL DEFAULT false,
	`position` int NOT NULL DEFAULT 0,
	CONSTRAINT `question_options_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `question_resources` (
	`id` bigint unsigned AUTO_INCREMENT NOT NULL,
	`question_id` bigint unsigned NOT NULL,
	`kind` enum('image','video','page','document') NOT NULL,
	`url` varchar(2048) NOT NULL,
	`label` varchar(160),
	`storage_kind` enum('external','upload') NOT NULL DEFAULT 'external',
	`position` int NOT NULL DEFAULT 0,
	CONSTRAINT `question_resources_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `question_tag` (
	`question_id` bigint unsigned NOT NULL,
	`tag_id` bigint unsigned NOT NULL,
	CONSTRAINT `question_tag_pk` PRIMARY KEY(`question_id`,`tag_id`)
);
--> statement-breakpoint
CREATE TABLE `questions` (
	`id` bigint unsigned AUTO_INCREMENT NOT NULL,
	`subtopic_id` bigint unsigned NOT NULL,
	`type` enum('single','multiple') NOT NULL,
	`statement` text NOT NULL,
	`explanation` text,
	`difficulty` enum('easy','medium','hard') NOT NULL DEFAULT 'medium',
	`status` enum('draft','published','archived') NOT NULL DEFAULT 'draft',
	`visible_options` tinyint unsigned,
	`version` int NOT NULL DEFAULT 1,
	`content_hash` char(64) NOT NULL,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `questions_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `sessions` (
	`id` bigint unsigned AUTO_INCREMENT NOT NULL,
	`agent` varchar(60) NOT NULL,
	`external_ref` varchar(190),
	`started_at` timestamp NOT NULL DEFAULT (now()),
	`last_seen_at` timestamp NOT NULL DEFAULT (now()),
	`asked_count` int NOT NULL DEFAULT 0,
	`paused_until` timestamp,
	`paused_for_questions` int,
	CONSTRAINT `sessions_id` PRIMARY KEY(`id`),
	CONSTRAINT `sessions_agent_ref_unq` UNIQUE(`agent`,`external_ref`)
);
--> statement-breakpoint
CREATE TABLE `settings` (
	`key` varchar(120) NOT NULL,
	`value` text NOT NULL,
	`type` enum('string','number','boolean','json') NOT NULL,
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `settings_key` PRIMARY KEY(`key`)
);
--> statement-breakpoint
CREATE TABLE `subjects` (
	`id` bigint unsigned AUTO_INCREMENT NOT NULL,
	`slug` varchar(120) NOT NULL,
	`name` varchar(160) NOT NULL,
	`description` text,
	`status` enum('draft','published','archived') NOT NULL DEFAULT 'draft',
	`position` int NOT NULL DEFAULT 0,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `subjects_id` PRIMARY KEY(`id`),
	CONSTRAINT `subjects_slug_unq` UNIQUE(`slug`)
);
--> statement-breakpoint
CREATE TABLE `subtopics` (
	`id` bigint unsigned AUTO_INCREMENT NOT NULL,
	`topic_id` bigint unsigned NOT NULL,
	`slug` varchar(120) NOT NULL,
	`name` varchar(160) NOT NULL,
	`description` text,
	`status` enum('draft','published','archived') NOT NULL DEFAULT 'draft',
	`position` int NOT NULL DEFAULT 0,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `subtopics_id` PRIMARY KEY(`id`),
	CONSTRAINT `subtopics_topic_slug_unq` UNIQUE(`topic_id`,`slug`)
);
--> statement-breakpoint
CREATE TABLE `tags` (
	`id` bigint unsigned AUTO_INCREMENT NOT NULL,
	`slug` varchar(120) NOT NULL,
	`name` varchar(160) NOT NULL,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `tags_id` PRIMARY KEY(`id`),
	CONSTRAINT `tags_slug_unq` UNIQUE(`slug`)
);
--> statement-breakpoint
CREATE TABLE `topics` (
	`id` bigint unsigned AUTO_INCREMENT NOT NULL,
	`subject_id` bigint unsigned NOT NULL,
	`slug` varchar(120) NOT NULL,
	`name` varchar(160) NOT NULL,
	`description` text,
	`status` enum('draft','published','archived') NOT NULL DEFAULT 'draft',
	`position` int NOT NULL DEFAULT 0,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `topics_id` PRIMARY KEY(`id`),
	CONSTRAINT `topics_subject_slug_unq` UNIQUE(`subject_id`,`slug`)
);
--> statement-breakpoint
ALTER TABLE `attempts` ADD CONSTRAINT `attempts_question_id_questions_id_fk` FOREIGN KEY (`question_id`) REFERENCES `questions`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `attempts` ADD CONSTRAINT `attempts_session_id_sessions_id_fk` FOREIGN KEY (`session_id`) REFERENCES `sessions`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `question_options` ADD CONSTRAINT `question_options_question_id_questions_id_fk` FOREIGN KEY (`question_id`) REFERENCES `questions`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `question_resources` ADD CONSTRAINT `question_resources_question_id_questions_id_fk` FOREIGN KEY (`question_id`) REFERENCES `questions`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `question_tag` ADD CONSTRAINT `question_tag_question_id_questions_id_fk` FOREIGN KEY (`question_id`) REFERENCES `questions`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `question_tag` ADD CONSTRAINT `question_tag_tag_id_tags_id_fk` FOREIGN KEY (`tag_id`) REFERENCES `tags`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `questions` ADD CONSTRAINT `questions_subtopic_id_subtopics_id_fk` FOREIGN KEY (`subtopic_id`) REFERENCES `subtopics`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `subtopics` ADD CONSTRAINT `subtopics_topic_id_topics_id_fk` FOREIGN KEY (`topic_id`) REFERENCES `topics`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `topics` ADD CONSTRAINT `topics_subject_id_subjects_id_fk` FOREIGN KEY (`subject_id`) REFERENCES `subjects`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `attempts_question_answered_idx` ON `attempts` (`question_id`,`answered_at`);--> statement-breakpoint
CREATE INDEX `attempts_answered_at_idx` ON `attempts` (`answered_at`);--> statement-breakpoint
CREATE INDEX `attempts_content_idx` ON `attempts` (`subject_name`,`topic_name`,`subtopic_name`);--> statement-breakpoint
CREATE INDEX `attempts_difficulty_idx` ON `attempts` (`difficulty`);--> statement-breakpoint
CREATE INDEX `question_tag_tag_idx` ON `question_tag` (`tag_id`);--> statement-breakpoint
CREATE INDEX `questions_status_subtopic_idx` ON `questions` (`status`,`subtopic_id`);--> statement-breakpoint
CREATE INDEX `questions_subtopic_hash_idx` ON `questions` (`subtopic_id`,`content_hash`);--> statement-breakpoint
CREATE INDEX `subjects_status_idx` ON `subjects` (`status`,`position`);--> statement-breakpoint
CREATE INDEX `subtopics_status_idx` ON `subtopics` (`status`,`position`);--> statement-breakpoint
CREATE INDEX `topics_status_idx` ON `topics` (`status`,`position`);
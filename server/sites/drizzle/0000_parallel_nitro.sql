CREATE TABLE `arcade_records` (
	`id` text PRIMARY KEY NOT NULL,
	`fingerprint` text NOT NULL,
	`record_json` text NOT NULL,
	`received_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `rate_buckets` (
	`key` text PRIMARY KEY NOT NULL,
	`count` integer NOT NULL,
	`expires_at` integer NOT NULL
);

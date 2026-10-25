CREATE TABLE `online_rooms` (
	`code` text PRIMARY KEY NOT NULL,
	`mode` text NOT NULL,
	`public` integer NOT NULL,
	`protocol` integer NOT NULL,
	`status` text NOT NULL,
	`revision` integer NOT NULL,
	`created_at` integer NOT NULL,
	`expires_at` integer NOT NULL,
	`host_token` text NOT NULL,
	`host_name` text NOT NULL,
	`host_fighter` text NOT NULL,
	`host_ready` integer NOT NULL,
	`host_seen` integer NOT NULL,
	`host_poll` integer NOT NULL,
	`guest_token` text,
	`guest_name` text,
	`guest_fighter` text,
	`guest_ready` integer NOT NULL,
	`guest_seen` integer,
	`guest_poll` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `online_rooms_match_idx` ON `online_rooms` (`public`,`mode`,`status`,`created_at`);--> statement-breakpoint
CREATE INDEX `online_rooms_expiry_idx` ON `online_rooms` (`expires_at`);--> statement-breakpoint
CREATE TABLE `online_signals` (
	`seq` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`room_code` text NOT NULL,
	`sender` integer NOT NULL,
	`type` text NOT NULL,
	`payload` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`room_code`) REFERENCES `online_rooms`(`code`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `online_signals_room_seq_idx` ON `online_signals` (`room_code`,`seq`);
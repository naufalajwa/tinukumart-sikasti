PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_users` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`nama` text NOT NULL,
	`pin` text NOT NULL,
	`role` text DEFAULT 'kasir' NOT NULL
);
--> statement-breakpoint
INSERT INTO `__new_users`("id", "nama", "pin", "role") SELECT "id", "nama", "pin", "role" FROM `users`;--> statement-breakpoint
DROP TABLE `users`;--> statement-breakpoint
ALTER TABLE `__new_users` RENAME TO `users`;--> statement-breakpoint
PRAGMA foreign_keys=ON;
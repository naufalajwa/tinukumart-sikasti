CREATE TABLE `konsinyasi` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`tanggal` text NOT NULL,
	`penitip` text NOT NULL,
	`nama_produk` text NOT NULL,
	`qty_masuk` integer DEFAULT 0 NOT NULL,
	`qty_terjual` integer DEFAULT 0 NOT NULL,
	`qty_sisa` integer DEFAULT 0 NOT NULL,
	`harga_awal` integer DEFAULT 0 NOT NULL,
	`status` text DEFAULT 'OPEN' NOT NULL
);
--> statement-breakpoint
CREATE TABLE `produk` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`nama` text NOT NULL,
	`tipe` text DEFAULT 'tinuku' NOT NULL,
	`harga_jual` integer NOT NULL,
	`harga_modal` integer NOT NULL,
	`is_active` integer DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE `shift_handovers` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`shift_id` integer NOT NULL,
	`penjaga_serah_id` integer NOT NULL,
	`penjaga_terima_id` integer NOT NULL,
	`kas_seharusnya` integer DEFAULT 0 NOT NULL,
	`kas_aktual` integer DEFAULT 0 NOT NULL,
	`selisih` integer DEFAULT 0 NOT NULL,
	`waktu` text DEFAULT (datetime('now', 'localtime')) NOT NULL,
	FOREIGN KEY (`shift_id`) REFERENCES `shifts`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`penjaga_serah_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`penjaga_terima_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `shift_penjaga` (
	`shift_id` integer NOT NULL,
	`user_id` integer NOT NULL,
	FOREIGN KEY (`shift_id`) REFERENCES `shifts`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `shifts` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`tanggal` text NOT NULL,
	`shift_ke` integer NOT NULL,
	`status` text DEFAULT 'OPEN' NOT NULL,
	`modal_awal` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE `transaction_items` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`transaction_id` integer NOT NULL,
	`item_ref_id` integer NOT NULL,
	`tipe_item` text DEFAULT 'tinuku' NOT NULL,
	`nama_snapshot` text NOT NULL,
	`harga_satuan_snapshot` integer NOT NULL,
	`harga_modal_snapshot` integer NOT NULL,
	`qty` integer DEFAULT 1 NOT NULL,
	`subtotal` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`transaction_id`) REFERENCES `transactions`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `transactions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`shift_id` integer NOT NULL,
	`metode` text DEFAULT 'TUNAI' NOT NULL,
	`total` integer DEFAULT 0 NOT NULL,
	`cash_diterima` integer DEFAULT 0 NOT NULL,
	`kembalian` integer DEFAULT 0 NOT NULL,
	`waktu` text DEFAULT (datetime('now', 'localtime')) NOT NULL,
	FOREIGN KEY (`shift_id`) REFERENCES `shifts`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `users` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`nama` text NOT NULL,
	`pin` text NOT NULL,
	`role` text DEFAULT 'kasir' NOT NULL
);

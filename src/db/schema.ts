import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';

// ==========================================
// USERS
// ==========================================
export const users = sqliteTable('users', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  nama: text('nama').notNull(),
  pin: text('pin'),
  password: text('password'),
  role: text('role', { enum: ['kasir', 'admin'] }).notNull().default('kasir'),
});

// ==========================================
// PRODUK
// ==========================================
export const produk = sqliteTable('produk', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  nama: text('nama').notNull(),
  tipe: text('tipe', { enum: ['tinuku', 'konsinyasi'] }).notNull().default('tinuku'),
  harga_jual: integer('harga_jual').notNull(),
  harga_modal: integer('harga_modal').notNull(),
  is_active: integer('is_active', { mode: 'boolean' }).notNull().default(true),
});

// ==========================================
// SHIFTS
// ==========================================
export const shifts = sqliteTable('shifts', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  tanggal: text('tanggal').notNull(),
  shift_ke: integer('shift_ke').notNull(),
  status: text('status', { enum: ['OPEN', 'CLOSED'] }).notNull().default('OPEN'),
  modal_awal: integer('modal_awal').notNull().default(0),
});

// ==========================================
// SHIFT_PENJAGA (Pivot: 1-3 penjaga per shift)
// ==========================================
export const shiftPenjaga = sqliteTable('shift_penjaga', {
  shift_id: integer('shift_id').notNull().references(() => shifts.id),
  user_id: integer('user_id').notNull().references(() => users.id),
});

// ==========================================
// SHIFT_HANDOVERS (Estafet shift)
// ==========================================
export const shiftHandovers = sqliteTable('shift_handovers', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  shift_id: integer('shift_id').notNull().references(() => shifts.id),
  penjaga_serah_id: integer('penjaga_serah_id').notNull().references(() => users.id),
  penjaga_terima_id: integer('penjaga_terima_id').notNull().references(() => users.id),
  kas_seharusnya: integer('kas_seharusnya').notNull().default(0),
  kas_aktual: integer('kas_aktual').notNull().default(0),
  selisih: integer('selisih').notNull().default(0),
  waktu: text('waktu').notNull().default(sql`(datetime('now', 'localtime'))`),
});

// ==========================================
// TRANSACTIONS
// ==========================================
export const transactions = sqliteTable('transactions', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  shift_id: integer('shift_id').notNull().references(() => shifts.id),
  metode: text('metode', { enum: ['TUNAI', 'QRIS'] }).notNull().default('TUNAI'),
  total: integer('total').notNull().default(0),
  cash_diterima: integer('cash_diterima').notNull().default(0),
  kembalian: integer('kembalian').notNull().default(0),
  waktu: text('waktu').notNull().default(sql`(datetime('now', 'localtime'))`),
});

// ==========================================
// TRANSACTION_ITEMS (Snapshot harga)
// Menggunakan item_ref_id + tipe_item agar bisa mereferensi
// barang dari tabel produk MAUPUN konsinyasi.
// ==========================================
export const transactionItems = sqliteTable('transaction_items', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  transaction_id: integer('transaction_id').notNull().references(() => transactions.id),
  item_ref_id: integer('item_ref_id').notNull(),
  tipe_item: text('tipe_item', { enum: ['tinuku', 'konsinyasi'] }).notNull().default('tinuku'),
  nama_snapshot: text('nama_snapshot').notNull(),
  harga_satuan_snapshot: integer('harga_satuan_snapshot').notNull(),
  harga_modal_snapshot: integer('harga_modal_snapshot').notNull(),
  qty: integer('qty').notNull().default(1),
  subtotal: integer('subtotal').notNull().default(0),
});

// ==========================================
// KONSINYASI (Titipan)
// ==========================================
export const konsinyasi = sqliteTable('konsinyasi', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  tanggal: text('tanggal').notNull(),
  penitip: text('penitip').notNull(),
  nama_produk: text('nama_produk').notNull(),
  qty_masuk: integer('qty_masuk').notNull().default(0),
  qty_terjual: integer('qty_terjual').notNull().default(0),
  qty_sisa: integer('qty_sisa').notNull().default(0),
  harga_awal: integer('harga_awal').notNull().default(0),
  status: text('status', { enum: ['OPEN', 'CLOSED'] }).notNull().default('OPEN'),
});

import type { APIRoute } from 'astro';
import { createDb } from '@db/index';
import { transactions, transactionItems, produk, konsinyasi } from '@db/schema';
import { eq, sql } from 'drizzle-orm';

/**
 * POST /api/transaksi
 * Checkout POS (UC04).
 * Body: {
 *   shift_id: number,
 *   metode: 'TUNAI' | 'QRIS',
 *   total: number,
 *   cash_diterima?: number,
 *   kembalian?: number,
 *   items: Array<{
 *     item_ref_id: number,
 *     tipe_item: 'tinuku' | 'konsinyasi',
 *     nama_snapshot: string,
 *     harga_satuan_snapshot: number,
 *     harga_modal_snapshot: number,
 *     qty: number,
 *     subtotal: number
 *   }>
 * }
 */
export const POST: APIRoute = async ({ request, locals, cookies }) => {
  try {
    const userRole = cookies.get('user_role')?.value;
    if (!userRole || userRole !== 'kasir') {
      return new Response(JSON.stringify({ error: 'Akses tidak diizinkan. Hanya kasir yang dapat membuat transaksi.' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const dbBinding = locals?.runtime?.env?.DB;
    if (!dbBinding) {
      return new Response(JSON.stringify({ error: 'Koneksi database D1 tidak tersedia.' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const body = await request.json();
    const { shift_id, metode, total, cash_diterima, kembalian, items } = body;

    if (!shift_id || !metode || total === undefined || !Array.isArray(items) || items.length === 0) {
      return new Response(JSON.stringify({ error: 'Data transaksi tidak lengkap.' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const db = createDb(dbBinding);
    const totalNum = Math.round(Number(total));
    const metodeValid = metode === 'QRIS' ? 'QRIS' : 'TUNAI';
    const cashDiterimaNum = metodeValid === 'TUNAI'
      ? Math.round(Number(cash_diterima ?? 0))
      : totalNum;

    if (metodeValid === 'TUNAI' && cashDiterimaNum < totalNum) {
      return new Response(JSON.stringify({ error: 'Uang diterima kurang dari total belanja.' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const kembalianNum = metodeValid === 'TUNAI'
      ? Math.max(0, cashDiterimaNum - totalNum)
      : 0;

    // 1. Simpan Transaksi Utama
    const nowIso = new Date().toISOString();
    const [insertedTx] = await db
      .insert(transactions)
      .values({
        shift_id: Number(shift_id),
        metode: metodeValid,
        total: totalNum,
        cash_diterima: cashDiterimaNum,
        kembalian: kembalianNum,
        waktu: nowIso,
      })
      .returning({ id: transactions.id });

    // 2. Simpan Transaction Items dengan Snapshot Harga
    for (const item of items) {
      await db.insert(transactionItems).values({
        transaction_id: insertedTx.id,
        item_ref_id: Number(item.item_ref_id || 0),
        tipe_item: item.tipe_item === 'konsinyasi' ? 'konsinyasi' : 'tinuku',
        nama_snapshot: String(item.nama_snapshot || 'Produk'),
        harga_satuan_snapshot: Math.round(Number(item.harga_satuan_snapshot || 0)),
        harga_modal_snapshot: Math.round(Number(item.harga_modal_snapshot || 0)),
        qty: Math.max(1, Math.round(Number(item.qty || 1))),
        subtotal: Math.round(Number(item.subtotal || 0)),
      });

      // Update kuantitas terjual jika konsinyasi
      if (item.tipe_item === 'konsinyasi' && item.item_ref_id) {
        await db
          .update(konsinyasi)
          .set({
            qty_terjual: sql`${konsinyasi.qty_terjual} + ${Number(item.qty)}`,
            qty_sisa: sql`${konsinyasi.qty_masuk} - (${konsinyasi.qty_terjual} + ${Number(item.qty)})`,
          })
          .where(eq(konsinyasi.id, Number(item.item_ref_id)));
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        transactionId: insertedTx.id,
        waktu: nowIso,
        total: totalNum,
        cash_diterima: cashDiterimaNum,
        kembalian: kembalianNum,
        metode: metodeValid,
        message: 'Transaksi berhasil disimpan ke database.',
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  } catch (error: any) {
    console.error('POS Checkout Error:', error);
    return new Response(
      JSON.stringify({ error: 'Gagal memproses transaksi.', detail: error?.message }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
};

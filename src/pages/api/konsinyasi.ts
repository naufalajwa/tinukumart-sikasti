import type { APIRoute } from 'astro';
import { createDb } from '@db/index';
import { konsinyasi } from '@db/schema';
import { eq, and } from 'drizzle-orm';

function getTodayDateStr(): string {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Jakarta',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  return formatter.format(new Date());
}

/**
 * POST /api/konsinyasi
 * Input Titipan (UC03) & Retur Konsinyasi (UC06)
 */
export const POST: APIRoute = async ({ request, locals, cookies }) => {
  try {
    const userRole = cookies.get('user_role')?.value;
    if (!userRole) {
      return new Response(JSON.stringify({ error: 'Sesi tidak valid.' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const dbBinding = locals?.runtime?.env?.DB;
    if (!dbBinding) {
      return new Response(JSON.stringify({ error: 'Database binding tidak tersedia.' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const body = await request.json();
    const db = createDb(dbBinding);
    const action = String(body.action || 'input').toLowerCase();

    // ==========================================
    // AKSI 1: INPUT TITIPAN PAGI (UC03)
    // ==========================================
    if (action === 'input') {
      const { penitip, nama_produk, qty_masuk, harga_awal } = body;

      if (!penitip || !nama_produk || !qty_masuk || !harga_awal) {
        return new Response(JSON.stringify({ error: 'Form input titipan belum lengkap.' }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      const today = getTodayDateStr();
      const qty = parseInt(String(qty_masuk), 10);
      const harga = parseInt(String(harga_awal), 10);

      const [newKonsinyasi] = await db
        .insert(konsinyasi)
        .values({
          tanggal: today,
          penitip: String(penitip).trim(),
          nama_produk: String(nama_produk).trim(),
          qty_masuk: qty,
          qty_terjual: 0,
          qty_sisa: qty,
          harga_awal: harga,
          status: 'OPEN',
        })
        .returning({ id: konsinyasi.id });

      return new Response(
        JSON.stringify({
          success: true,
          id: newKonsinyasi.id,
          message: `Barang titipan ${nama_produk} berhasil dicatat.`,
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // ==========================================
    // AKSI 2: RETUR SISA TITIPAN (UC06)
    // ==========================================
    if (action === 'retur') {
      const { id, qty_sisa_aktual } = body;
      if (!id) {
        return new Response(JSON.stringify({ error: 'ID konsinyasi wajib disertakan.' }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      const sisaAktual = parseInt(String(qty_sisa_aktual || 0), 10);

      // Ambil data konsinyasi
      const [item] = await db.select().from(konsinyasi).where(eq(konsinyasi.id, Number(id))).limit(1);
      if (!item) {
        return new Response(JSON.stringify({ error: 'Data konsinyasi tidak ditemukan.' }), {
          status: 404,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      const terjual = Math.max(0, item.qty_masuk - sisaAktual);
      const hakPenitip = terjual * item.harga_awal;

      await db
        .update(konsinyasi)
        .set({
          qty_sisa: sisaAktual,
          qty_terjual: terjual,
          status: 'CLOSED',
        })
        .where(eq(konsinyasi.id, Number(id)));

      return new Response(
        JSON.stringify({
          success: true,
          message: `Retur ${item.nama_produk} berhasil diproses. Hak penitip: Rp ${hakPenitip.toLocaleString('id-ID')}`,
          terjual,
          sisa: sisaAktual,
          hakPenitip,
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }

    return new Response(JSON.stringify({ error: 'Aksi konsinyasi tidak dikenali.' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error: any) {
    console.error('Konsinyasi API Error:', error);
    return new Response(
      JSON.stringify({ error: 'Gagal memproses data konsinyasi.', detail: error?.message }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
};

import type { APIRoute } from 'astro';
import { createDb } from '@db/index';
import { shifts, shiftPenjaga, shiftHandovers, transactions } from '@db/schema';
import { eq, and, sql } from 'drizzle-orm';

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
 * POST /api/shift
 * Handler untuk Buka Shift (UC02), Estafet Shift (UC05), Tutup Shift (UC07).
 */
export const POST: APIRoute = async ({ request, locals, cookies, redirect }) => {
  try {
    const contentType = request.headers.get('content-type') || '';
    const acceptsJson = (request.headers.get('accept') || '').includes('application/json');
    let body: Record<string, any> = {};

    if (contentType.includes('application/json')) {
      body = await request.json();
    } else if (
      contentType.includes('application/x-www-form-urlencoded') ||
      contentType.includes('multipart/form-data')
    ) {
      const formData = await request.formData();
      body = Object.fromEntries(formData.entries());
    }

    // Validasi session kasir
    const userRole = cookies.get('user_role')?.value;
    const userIdStr = cookies.get('user_id')?.value;

    if (!userRole || userRole !== 'kasir' || !userIdStr) {
      const errMsg = 'Sesi Anda telah kedaluwarsa. Silakan login kembali.';
      if (acceptsJson) {
        return new Response(JSON.stringify({ error: errMsg }), {
          status: 401,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      return redirect(`/?error=${encodeURIComponent(errMsg)}&tab=kasir`);
    }

    const currentUserId = parseInt(userIdStr, 10);

    // Validasi Database D1
    const dbBinding = locals?.runtime?.env?.DB;
    if (!dbBinding) {
      const errMsg = 'Koneksi database D1 tidak ditemukan pada runtime.';
      if (acceptsJson) {
        return new Response(JSON.stringify({ error: errMsg }), {
          status: 500,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      return redirect(`/kasir/dashboard?error=${encodeURIComponent(errMsg)}`);
    }

    const db = createDb(dbBinding);
    const action = String(body.action || 'open').trim().toLowerCase();

    // ==========================================
    // AKSI 1: BUKA SHIFT BARU (UC02)
    // ==========================================
    if (action === 'open') {
      const shiftKe = parseInt(String(body.shift_ke || 1), 10);
      const rawModalAwal = String(body.modal_awal || '0').replace(/[^0-9]/g, '');
      const modalAwal = parseInt(rawModalAwal, 10);

      if (isNaN(shiftKe) || shiftKe < 1 || shiftKe > 5) {
        const errMsg = 'Pilihan giliran shift harus antara Shift 1 sampai Shift 5.';
        if (acceptsJson) {
          return new Response(JSON.stringify({ error: errMsg }), {
            status: 400,
            headers: { 'Content-Type': 'application/json' },
          });
        }
        return redirect(`/kasir/dashboard?error=${encodeURIComponent(errMsg)}`);
      }

      if (isNaN(modalAwal) || modalAwal < 0) {
        const errMsg = 'Modal awal harus berupa nominal angka positif yang valid.';
        if (acceptsJson) {
          return new Response(JSON.stringify({ error: errMsg }), {
            status: 400,
            headers: { 'Content-Type': 'application/json' },
          });
        }
        return redirect(`/kasir/dashboard?error=${encodeURIComponent(errMsg)}`);
      }

      const todayDate = getTodayDateStr();

      // Cek apakah sudah ada shift OPEN hari ini
      const [existingOpen] = await db
        .select()
        .from(shifts)
        .where(and(eq(shifts.status, 'OPEN'), eq(shifts.tanggal, todayDate)))
        .limit(1);

      if (existingOpen) {
        const errMsg = `Shift ${existingOpen.shift_ke} masih berstatus OPEN untuk hari ini. Tutup shift terlebih dahulu sebelum membuka yang baru.`;
        if (acceptsJson) {
          return new Response(JSON.stringify({ error: errMsg }), {
            status: 400,
            headers: { 'Content-Type': 'application/json' },
          });
        }
        return redirect(`/kasir/dashboard?error=${encodeURIComponent(errMsg)}`);
      }

      // Simpan data shift baru
      const [newShift] = await db
        .insert(shifts)
        .values({
          tanggal: todayDate,
          shift_ke: shiftKe,
          status: 'OPEN',
          modal_awal: modalAwal,
        })
        .returning({ id: shifts.id });

      // Simpan pivot penjaga
      await db.insert(shiftPenjaga).values({
        shift_id: newShift.id,
        user_id: currentUserId,
      });

      const successMsg = `Shift ${shiftKe} berhasil dibuka dengan modal awal Rp ${modalAwal.toLocaleString('id-ID')}!`;

      if (acceptsJson) {
        return new Response(
          JSON.stringify({
            success: true,
            message: successMsg,
            shiftId: newShift.id,
            redirect: '/kasir/pos',
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }

      return redirect(`/kasir/pos`);
    }

    // ==========================================
    // AKSI 2: ESTAFET SHIFT (UC05)
    // ==========================================
    if (action === 'handover') {
      const shiftId = Number(body.shift_id);
      const kasSeharusnya = Number(body.kas_seharusnya || 0);
      const kasAktual = Number(body.kas_aktual || 0);
      const selisih = kasAktual - kasSeharusnya;
      const nextCrewId = Number(body.next_crew_id || currentUserId);

      if (!shiftId) {
        return new Response(JSON.stringify({ error: 'Shift ID wajib disertakan.' }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      const nowIso = new Date().toISOString();

      // Catat Handover Log
      await db.insert(shiftHandovers).values({
        shift_id: shiftId,
        penjaga_serah_id: currentUserId,
        penjaga_terima_id: nextCrewId,
        kas_seharusnya: Math.round(kasSeharusnya),
        kas_aktual: Math.round(kasAktual),
        selisih: Math.round(selisih),
        waktu: nowIso,
      });

      // Tambahkan pengganti ke shift_penjaga jika belum ada
      if (nextCrewId !== currentUserId) {
        try {
          await db.insert(shiftPenjaga).values({
            shift_id: shiftId,
            user_id: nextCrewId,
          });
        } catch (e) {
          // ignore duplicate
        }
      }

      return new Response(
        JSON.stringify({
          success: true,
          message: 'Estafet shift berhasil dicatat. Selisih kas: Rp ' + selisih.toLocaleString('id-ID'),
          selisih,
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // ==========================================
    // AKSI 3: TUTUP SHIFT (UC07)
    // ==========================================
    if (action === 'close') {
      const shiftId = Number(body.shift_id);
      const kasAktual = Number(body.kas_aktual || 0);

      if (!shiftId) {
        return new Response(JSON.stringify({ error: 'Shift ID wajib disertakan.' }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      // Ambil data shift
      const [curShift] = await db.select().from(shifts).where(eq(shifts.id, shiftId)).limit(1);
      if (!curShift) {
        return new Response(JSON.stringify({ error: 'Shift tidak ditemukan.' }), {
          status: 404,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      // Hitung total uang tunai masuk dari transaksi di shift ini
      const cashTx = await db
        .select({ totalCash: sql<number>`coalesce(sum(${transactions.total}), 0)` })
        .from(transactions)
        .where(and(eq(transactions.shift_id, shiftId), eq(transactions.metode, 'TUNAI')));

      const totalCashIn = Number(cashTx[0]?.totalCash || 0);
      const kasSeharusnya = curShift.modal_awal + totalCashIn;
      const selisih = kasAktual - kasSeharusnya;

      // Update status shift menjadi CLOSED
      await db
        .update(shifts)
        .set({ status: 'CLOSED' })
        .where(eq(shifts.id, shiftId));

      // Catat log serah terima / tutup shift
      const nowIso = new Date().toISOString();
      await db.insert(shiftHandovers).values({
        shift_id: shiftId,
        penjaga_serah_id: currentUserId,
        penjaga_terima_id: currentUserId,
        kas_seharusnya: Math.round(kasSeharusnya),
        kas_aktual: Math.round(kasAktual),
        selisih: Math.round(selisih),
        waktu: nowIso,
      });

      return new Response(
        JSON.stringify({
          success: true,
          message: `Shift #${shiftId} resmi ditutup. Status kas: ${selisih === 0 ? 'Sesuai/Balance' : 'Selisih Rp ' + selisih.toLocaleString('id-ID')}`,
          kasSeharusnya,
          kasAktual,
          selisih,
          redirect: '/kasir/dashboard',
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }

    return new Response(JSON.stringify({ error: 'Aksi shift tidak valid.' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error: any) {
    console.error('Shift Error:', error);
    const errMsg = 'Terjadi kesalahan sistem saat memproses data shift.';
    if ((request.headers.get('accept') || '').includes('application/json')) {
      return new Response(JSON.stringify({ error: errMsg, detail: error?.message }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    return redirect(`/kasir/dashboard?error=${encodeURIComponent(errMsg)}`);
  }
};

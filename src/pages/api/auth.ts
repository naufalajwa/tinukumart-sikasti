import type { APIRoute } from 'astro';
import { createDb } from '@db/index';
import { users } from '@db/schema';
import { eq, and, sql } from 'drizzle-orm';

/**
 * Helper untuk set cookies session auth
 */
function setAuthCookies(
  cookies: any,
  user: { id: number; nama: string; role: 'kasir' | 'admin' }
) {
  const cookieOptions = {
    path: '/',
    httpOnly: true,
    secure: import.meta.env.PROD,
    sameSite: 'lax' as const,
    maxAge: 60 * 60 * 12, // Berlaku 12 jam (durasi operasional shift)
  };

  cookies.set('user_id', String(user.id), cookieOptions);
  cookies.set('user_role', user.role, cookieOptions);
  cookies.set('user_nama', user.nama, { ...cookieOptions, httpOnly: false });
  cookies.set(
    'user_session',
    JSON.stringify({
      id: user.id,
      nama: user.nama,
      role: user.role,
      loginAt: new Date().toISOString(),
    }),
    cookieOptions
  );
}

/**
 * Helper untuk menghapus cookies saat logout
 */
function clearAuthCookies(cookies: any) {
  const clearOptions = { path: '/' };
  cookies.delete('user_id', clearOptions);
  cookies.delete('user_role', clearOptions);
  cookies.delete('user_nama', clearOptions);
  cookies.delete('user_session', clearOptions);
}

/**
 * GET /api/auth?action=logout
 * Memudahkan logout via link anchor standar
 */
export const GET: APIRoute = async ({ url, cookies, redirect }) => {
  const action = url.searchParams.get('action');
  if (action === 'logout') {
    clearAuthCookies(cookies);
    return redirect('/?logout=success');
  }
  return new Response(JSON.stringify({ status: 'ok' }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
};

/**
 * POST /api/auth
 * Login handler untuk Kasir (PIN) dan Admin (Username + Password).
 * Mendukung form POST standar maupun fetch JSON.
 */
export const POST: APIRoute = async ({ request, locals, cookies, redirect, url }) => {
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

    // Aksi Logout
    if (body.action === 'logout' || url.searchParams.get('action') === 'logout') {
      clearAuthCookies(cookies);
      if (acceptsJson) {
        return new Response(JSON.stringify({ success: true, redirect: '/' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      return redirect('/?logout=success');
    }

    // Validasi Database binding
    const dbBinding = locals?.runtime?.env?.DB;
    if (!dbBinding) {
      const errMsg = 'Koneksi database D1 tidak tersedia pada server runtime.';
      if (acceptsJson) {
        return new Response(JSON.stringify({ error: errMsg }), {
          status: 500,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      return redirect(`/?error=${encodeURIComponent(errMsg)}`);
    }

    const db = createDb(dbBinding);
    const loginType = String(body.type || '').trim().toLowerCase();

    // ==========================================
    // 1. LOGIN KASIR (Menggunakan PIN)
    // ==========================================
    if (loginType === 'pin' || loginType === 'kasir') {
      const pin = String(body.pin || '').trim();

      if (!pin) {
        const errMsg = 'Silakan masukkan PIN kasir Anda.';
        if (acceptsJson) {
          return new Response(JSON.stringify({ error: errMsg }), {
            status: 400,
            headers: { 'Content-Type': 'application/json' },
          });
        }
        return redirect(`/?error=${encodeURIComponent(errMsg)}&tab=kasir`);
      }

      // Cari user kasir dengan PIN yang cocok
      const [kasir] = await db
        .select()
        .from(users)
        .where(and(eq(users.pin, pin), eq(users.role, 'kasir')))
        .limit(1);

      if (!kasir) {
        const errMsg = 'PIN kasir tidak ditemukan atau salah. Silakan coba lagi.';
        if (acceptsJson) {
          return new Response(JSON.stringify({ error: errMsg }), {
            status: 401,
            headers: { 'Content-Type': 'application/json' },
          });
        }
        return redirect(`/?error=${encodeURIComponent(errMsg)}&tab=kasir`);
      }

      // Set cookie session
      setAuthCookies(cookies, {
        id: kasir.id,
        nama: kasir.nama,
        role: 'kasir',
      });

      if (acceptsJson) {
        return new Response(
          JSON.stringify({
            success: true,
            redirect: '/kasir/dashboard',
            user: { id: kasir.id, nama: kasir.nama, role: kasir.role },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }

      return redirect('/kasir/dashboard');
    }

    // ==========================================
    // 2. LOGIN ADMIN (Nama Pengguna & Password)
    // ==========================================
    if (loginType === 'admin') {
      const username = String(body.username || body.nama || '').trim();
      const password = String(body.password || '').trim();

      if (!username || !password) {
        const errMsg = 'Nama pengguna dan kata sandi admin wajib diisi.';
        if (acceptsJson) {
          return new Response(JSON.stringify({ error: errMsg }), {
            status: 400,
            headers: { 'Content-Type': 'application/json' },
          });
        }
        return redirect(`/?error=${encodeURIComponent(errMsg)}&tab=admin`);
      }

      // Cari user admin berdasarkan nama (case-insensitive) dan role admin
      const [admin] = await db
        .select()
        .from(users)
        .where(and(sql`lower(${users.nama}) = lower(${username})`, eq(users.role, 'admin')))
        .limit(1);

      if (!admin || admin.password !== password) {
        const errMsg = 'Nama pengguna atau kata sandi admin salah.';
        if (acceptsJson) {
          return new Response(JSON.stringify({ error: errMsg }), {
            status: 401,
            headers: { 'Content-Type': 'application/json' },
          });
        }
        return redirect(`/?error=${encodeURIComponent(errMsg)}&tab=admin`);
      }

      // Set cookie session
      setAuthCookies(cookies, {
        id: admin.id,
        nama: admin.nama,
        role: 'admin',
      });

      if (acceptsJson) {
        return new Response(
          JSON.stringify({
            success: true,
            redirect: '/admin/dashboard',
            user: { id: admin.id, nama: admin.nama, role: admin.role },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }

      return redirect('/admin/dashboard');
    }

    // Tipe request tidak dikenali
    const errMsg = 'Tipe autentikasi tidak valid. Pilih kasir atau admin.';
    if (acceptsJson) {
      return new Response(JSON.stringify({ error: errMsg }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    return redirect(`/?error=${encodeURIComponent(errMsg)}`);
  } catch (error: any) {
    console.error('Auth Error:', error);
    const errMsg = 'Terjadi kesalahan sistem saat proses autentikasi.';
    if ((request.headers.get('accept') || '').includes('application/json')) {
      return new Response(JSON.stringify({ error: errMsg, detail: error?.message }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    return redirect(`/?error=${encodeURIComponent(errMsg)}`);
  }
};

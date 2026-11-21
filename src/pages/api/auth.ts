import type { APIRoute } from 'astro';
import { createDb } from '@db/index';
import { users } from '@db/schema';
import { eq, and, sql } from 'drizzle-orm';

/**
 * Helper untuk set cookies session auth
 */
function setAuthCookies(
  cookies: any,
  user: { id: number; nama: string; role: 'kasir' | 'admin' },
  isSecure: boolean = false
) {
  const cookieOptions = {
    path: '/',
    httpOnly: true,
    secure: isSecure,
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
 * Login handler terpadu untuk Kasir dan Admin (Username + PIN).
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
    const username = String(body.username || body.nama || '').trim();
    const pin = String(body.pin || '').trim();

    if (!username || !pin) {
      const errMsg = 'Username dan PIN wajib diisi.';
      if (acceptsJson) {
        return new Response(JSON.stringify({ error: errMsg }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      return redirect(`/?error=${encodeURIComponent(errMsg)}`);
    }

    // Cari user berdasarkan username (case-insensitive) dan PIN yang cocok
    const [user] = await db
      .select()
      .from(users)
      .where(
        and(
          sql`lower(${users.nama}) = lower(${username})`,
          eq(users.pin, pin)
        )
      )
      .limit(1);

    if (!user) {
      const errMsg = 'Username atau PIN salah.';
      if (acceptsJson) {
        return new Response(JSON.stringify({ error: errMsg }), {
          status: 401,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      return redirect(`/?error=${encodeURIComponent(errMsg)}`);
    }

    const isHttps = request.url.startsWith('https://') || request.headers.get('x-forwarded-proto') === 'https';

    // Set cookie session autentikasi
    setAuthCookies(
      cookies,
      {
        id: user.id,
        nama: user.nama,
        role: user.role,
      },
      isHttps
    );

    const targetRedirect = user.role === 'admin' ? '/admin/dashboard' : '/kasir/dashboard';

    if (acceptsJson) {
      return new Response(
        JSON.stringify({
          success: true,
          redirect: targetRedirect,
          user: { id: user.id, nama: user.nama, role: user.role },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }

    return redirect(targetRedirect);
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

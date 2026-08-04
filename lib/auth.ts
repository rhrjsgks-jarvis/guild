import 'server-only';
import { cookies } from 'next/headers';

/**
 * 관리자 세션 — PIN 을 맞히면 HMAC 서명된 httpOnly 쿠키를 발급한다.
 * 쿠키에는 만료시각만 들어가고, 서명은 SESSION_SECRET 없이는 위조할 수 없다.
 */

const COOKIE_NAME = 'gm_admin';
const MAX_AGE_SEC = 60 * 60 * 24 * 30; // 30일

const encoder = new TextEncoder();

function b64url(buf: ArrayBuffer): string {
  return Buffer.from(buf).toString('base64url');
}

async function sign(data: string): Promise<string> {
  const secret = process.env.SESSION_SECRET;
  if (!secret) throw new Error('SESSION_SECRET 환경변수가 없습니다.');
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  return b64url(await crypto.subtle.sign('HMAC', key, encoder.encode(data)));
}

/** 길이가 달라도 정보가 새지 않도록, 해시를 떠서 상수시간 비교한다 */
async function safeEqual(a: string, b: string): Promise<boolean> {
  const [ha, hb] = await Promise.all([
    crypto.subtle.digest('SHA-256', encoder.encode(a)),
    crypto.subtle.digest('SHA-256', encoder.encode(b)),
  ]);
  const va = new Uint8Array(ha);
  const vb = new Uint8Array(hb);
  let diff = 0;
  for (let i = 0; i < va.length; i++) diff |= va[i] ^ vb[i];
  return diff === 0;
}

export function adminConfigured(): boolean {
  return Boolean(process.env.ADMIN_PIN && process.env.SESSION_SECRET);
}

export async function verifyPin(pin: string): Promise<boolean> {
  const expected = process.env.ADMIN_PIN;
  if (!expected) return false;
  return safeEqual(pin, expected);
}

export async function startAdminSession(): Promise<void> {
  const exp = Date.now() + MAX_AGE_SEC * 1000;
  const value = `${exp}.${await sign(`admin.${exp}`)}`;
  (await cookies()).set(COOKIE_NAME, value, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: MAX_AGE_SEC,
  });
}

export async function endAdminSession(): Promise<void> {
  (await cookies()).delete(COOKIE_NAME);
}

export async function isAdmin(): Promise<boolean> {
  if (!process.env.SESSION_SECRET) return false;
  const raw = (await cookies()).get(COOKIE_NAME)?.value;
  if (!raw) return false;

  const dot = raw.indexOf('.');
  if (dot < 0) return false;
  const exp = Number(raw.slice(0, dot));
  const sig = raw.slice(dot + 1);
  if (!Number.isFinite(exp) || exp < Date.now()) return false;

  try {
    return await safeEqual(sig, await sign(`admin.${exp}`));
  } catch {
    return false;
  }
}

/** 관리자 전용 라우트의 첫 줄에서 부른다 */
export async function requireAdmin(): Promise<Response | null> {
  if (await isAdmin()) return null;
  return Response.json(
    { ok: false, msg: '관리자 인증이 필요합니다. [관리] 탭에서 PIN을 입력해주세요.' },
    { status: 401 },
  );
}

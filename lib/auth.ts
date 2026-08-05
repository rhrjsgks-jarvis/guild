import 'server-only';
import { cookies } from 'next/headers';

/**
 * 관리자 세션 — PIN 을 맞히면 HMAC 서명된 httpOnly 쿠키를 발급한다.
 * 쿠키에는 만료시각만 들어가고, 서명은 SESSION_SECRET 없이는 위조할 수 없다.
 */

const COOKIE_NAME = 'gm_admin';
const MAX_AGE_SEC = 60 * 60 * 24 * 30; // 30일

/**
 * 권한 등급 (v10.0)
 *   admin  — 기존 관리자. 정산 업무 전부.
 *   master — 마스터관리자(개발자). admin 이 할 수 있는 것 전부 + 앱 명칭 변경·관리자 PIN 교체.
 * 마스터 여부는 MASTER_PIN 환경변수로만 판정한다. 시트에는 저장하지 않는다.
 */
export type Role = 'admin' | 'master';

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

export function masterConfigured(): boolean {
  return Boolean(process.env.MASTER_PIN && process.env.SESSION_SECRET);
}

/** 환경변수 MASTER_PIN 과 일치하는가. 관리자 PIN 과 같은 값이면 마스터로 치지 않는다. */
export async function verifyMasterPin(pin: string): Promise<boolean> {
  const expected = process.env.MASTER_PIN;
  if (!expected) return false;
  if (expected === process.env.ADMIN_PIN) return false;
  return safeEqual(pin, expected);
}

/** 환경변수 ADMIN_PIN 과 일치하는가. 시트에 저장된 PIN 은 로그인 라우트가 따로 확인한다. */
export async function verifyPin(pin: string): Promise<boolean> {
  const expected = process.env.ADMIN_PIN;
  if (!expected) return false;
  return safeEqual(pin, expected);
}

export async function startAdminSession(role: Role = 'admin'): Promise<void> {
  const exp = Date.now() + MAX_AGE_SEC * 1000;
  const value = `${role}.${exp}.${await sign(`${role}.${exp}`)}`;
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

/** 쿠키에서 권한 등급을 꺼낸다. 위조·만료된 쿠키는 null. */
export async function currentRole(): Promise<Role | null> {
  if (!process.env.SESSION_SECRET) return null;
  const raw = (await cookies()).get(COOKIE_NAME)?.value;
  if (!raw) return null;

  const parts = raw.split('.');
  // v10.0: "role.exp.sig" · v9 이하: "exp.sig" (관리자 등급으로 본다)
  const role: Role = parts.length === 3 && parts[0] === 'master' ? 'master' : 'admin';
  const [expRaw, sig] = parts.length === 3 ? [parts[1], parts[2]] : [parts[0], parts[1]];

  const exp = Number(expRaw);
  if (!sig || !Number.isFinite(exp) || exp < Date.now()) return null;

  try {
    const payload = parts.length === 3 ? `${role}.${exp}` : `admin.${exp}`;
    return (await safeEqual(sig, await sign(payload))) ? role : null;
  } catch {
    return null;
  }
}

export async function isAdmin(): Promise<boolean> {
  return (await currentRole()) !== null;
}

/** 마스터관리자만 통과 */
export async function isMaster(): Promise<boolean> {
  return (await currentRole()) === 'master';
}

/** 관리자 전용 라우트의 첫 줄에서 부른다 */
export async function requireAdmin(): Promise<Response | null> {
  if (await isAdmin()) return null;
  return Response.json(
    { ok: false, msg: '관리자 인증이 필요합니다. [관리] 탭에서 PIN을 입력해주세요.' },
    { status: 401 },
  );
}

/** 마스터관리자 전용 라우트의 첫 줄에서 부른다 */
export async function requireMaster(): Promise<Response | null> {
  if (await isMaster()) return null;
  return Response.json(
    { ok: false, msg: '마스터관리자(개발자) 권한이 필요합니다.' },
    { status: 401 },
  );
}

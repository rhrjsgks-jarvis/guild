import 'server-only';

/**
 * PIN 을 되돌릴 수 없는 형태로 바꾼다 (v10.9).
 *
 * 왜 필요한가:
 *   v10.8 까지 PIN 은 Vercel 환경변수(또는 시트의 평문 override)에 **그대로**
 *   들어 있었다. 즉 앱을 세팅해 준 사람이 길드의 마스터 PIN 을 알고 시작한다.
 *   기능은 멀쩡했지만, 쓰는 쪽에서는 그 사실 자체가 불안 요소였다.
 *
 *   이제 PIN 은 길드가 앱에서 직접 정하고, 저장되는 것은 여기서 만든 해시뿐이다.
 *   시트를 열 수 있는 사람도, 이 코드를 배포한 사람도 PIN 자체는 알 수 없다.
 *
 * ★ 평문 PIN 은 이 파일 밖으로 나가지 않는다. 시트로도 보내지 않는다 —
 *   시트가 받는 것은 언제나 `derive()` 의 결과다.
 */

/**
 * PBKDF2 반복 횟수.
 *
 * PIN 은 6자부터 허용하는 짧은 비밀번호다. 단순 SHA-256 한 번이면
 * 숫자 6자리(100만 가지)는 해시를 손에 넣은 사람이 몇 초 만에 되짚는다.
 * 반복을 크게 걸어야 그 계산이 의미 있게 비싸진다 (OWASP 2023 권고치).
 *
 * ⚠️ 내리지 말 것. `npm run verify:gs` 가 하한을 강제한다.
 * 값을 올리는 것은 안전하다 — 저장된 해시는 자기가 만들어진 횟수를
 * 같이 들고 있어서, 기존 PIN 은 계속 그대로 통한다.
 */
export const PIN_ROUNDS = 210_000;

/** 시트에 저장된 값이 이 아래면 형식이 깨진 것으로 본다 (.gs 의 AUTH_HASH_MIN 과 같은 값) */
export const HASH_MIN_LEN = 32;

/** PIN 형식 — 공백이 섞이면 폰 키보드가 붙인 것인지 의도한 것인지 알 수 없다 */
export const PIN_RE = /^[0-9A-Za-z!@#$%^&*_-]{6,32}$/;

const encoder = new TextEncoder();

function toHex(buf: ArrayBuffer): string {
  return Buffer.from(buf).toString('hex');
}

/** 이 설치 전용 소금값. 같은 PIN 이라도 설치마다 다른 해시가 되게 한다. */
export function newSalt(): string {
  return toHex(crypto.getRandomValues(new Uint8Array(32)).buffer);
}

/**
 * PIN → 해시. 소금값과 반복 횟수가 같으면 언제나 같은 결과가 나온다.
 * 앞뒤 공백은 항상 털어낸다 — 폰 키보드·비밀번호 관리자가 붙이는 공백은
 * 어떤 경우에도 의도된 값이 아니다 (lib/auth.ts 의 envPin 과 같은 이유).
 */
export async function derive(pin: string, salt: string, rounds: number = PIN_ROUNDS): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(String(pin ?? '').trim()),
    'PBKDF2',
    false,
    ['deriveBits'],
  );
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt: encoder.encode(salt), iterations: rounds },
    key,
    256,
  );
  return toHex(bits);
}

/** 길이가 달라도 정보가 새지 않도록 상수시간으로 비교한다 */
export function hashEqual(a: string, b: string): boolean {
  const va = encoder.encode(String(a ?? ''));
  const vb = encoder.encode(String(b ?? ''));
  // 길이가 다르면 어차피 다르지만, 그 사실만으로 조기 반환하지 않는다
  let diff = va.length ^ vb.length;
  const n = Math.max(va.length, vb.length);
  for (let i = 0; i < n; i++) diff |= (va[i] ?? 0) ^ (vb[i] ?? 0);
  return diff === 0;
}

/** 시트가 돌려주는 인증 레코드 */
export type AuthRecord = {
  configured: boolean;
  salt: string;
  rounds: number;
  master: string;
  admin: string;
  resetOpen: boolean;
};

/**
 * 시트 응답을 레코드로 다듬는다.
 *
 * ★ 하나라도 모자라면 `configured: false` 다. 반쯤 채워진 레코드를
 *   "설정됨"으로 보면, 비교할 해시가 없는데도 환경변수 경로로 돌아가지 않아
 *   아무도 로그인할 수 없는 상태가 된다.
 */
export function toAuthRecord(res: Record<string, unknown>): AuthRecord {
  const salt = String(res.salt ?? '');
  const master = String(res.master ?? '');
  const admin = String(res.admin ?? '');
  const rounds = Number(res.rounds ?? 0);
  const complete =
    res.ok === true &&
    salt.length >= HASH_MIN_LEN &&
    master.length >= HASH_MIN_LEN &&
    admin.length >= HASH_MIN_LEN &&
    Number.isFinite(rounds) &&
    rounds >= 1000;
  return {
    configured: complete,
    salt,
    rounds: complete ? rounds : PIN_ROUNDS,
    master,
    admin,
    resetOpen: res.resetOpen === true,
  };
}

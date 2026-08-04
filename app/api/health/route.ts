import { callGas, gasConfigured } from '@/lib/gas';
import { adminConfigured } from '@/lib/auth';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

/**
 * 설정 점검용. 값 자체는 절대 돌려주지 않고 "채워졌는지"만 알려준다.
 * 배포 직후 https://<앱주소>/api/health 를 열어보면 어디가 비었는지 바로 보인다.
 */
export async function GET() {
  const env = {
    GAS_URL: Boolean(process.env.GAS_URL),
    GAS_TOKEN: Boolean(process.env.GAS_TOKEN),
    ADMIN_PIN: Boolean(process.env.ADMIN_PIN),
    SESSION_SECRET: Boolean(process.env.SESSION_SECRET),
  };

  if (!gasConfigured()) {
    return Response.json({
      ok: false,
      env,
      sheet: null,
      msg: 'GAS_URL / GAS_TOKEN 환경변수를 채운 뒤 Redeploy 해주세요.',
    });
  }

  const ping = await callGas('ping', {}, { timeoutMs: 15_000 });

  return Response.json({
    ok: ping.ok && adminConfigured(),
    env,
    sheet: ping.ok ? { connected: true, version: ping.version, unit: ping.unit } : { connected: false, msg: ping.msg },
    msg: !ping.ok
      ? '구글시트 연결 실패 — ' + ping.msg
      : !adminConfigured()
        ? '시트 연결은 정상입니다. ADMIN_PIN / SESSION_SECRET 을 마저 채워주세요.'
        : '모든 설정이 정상입니다. 🎉',
  });
}

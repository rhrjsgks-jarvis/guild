import { callGas, gasConfigured } from '@/lib/gas';
import { adminConfigured, masterConfigured, masterDiagnosis } from '@/lib/auth';

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
    ADMIN_PIN: adminConfigured(),
    SESSION_SECRET: Boolean(process.env.SESSION_SECRET),
    // 선택 항목 — 없으면 마스터관리자 기능만 잠기고 나머지는 그대로 동작한다
    MASTER_PIN: masterConfigured(),
  };

  /**
   * "MASTER_PIN 을 넣었는데 로그인이 안 된다" 를 스스로 진단할 수 있게 한다.
   * 값은 절대 내보내지 않고, 무엇이 잘못됐는지만 알려준다.
   */
  const md = masterDiagnosis();
  const master = {
    set: md.set,
    // 관리자 PIN 과 같으면 마스터로 치지 않는다 — 등급을 나눈 의미가 없어지므로
    sameAsAdmin: md.sameAsAdmin,
    // 붙여넣을 때 딸려 들어간 공백·줄바꿈 (이제 서버가 털어내지만 대시보드도 고치는 편이 낫다)
    hadWhitespace: md.hadSpace,
    usable: md.set && !md.sameAsAdmin,
    msg: !md.set
      ? 'MASTER_PIN 이 비어 있습니다. Vercel → Settings → Environment Variables 에 넣고 Redeploy 해주세요.'
      : md.sameAsAdmin
        ? '⚠️ MASTER_PIN 이 ADMIN_PIN 과 같은 값입니다. 마스터로 인정하지 않습니다 — 서로 다른 값으로 바꿔주세요.'
        : md.hadSpace
          ? 'MASTER_PIN 앞뒤에 공백이 들어가 있습니다. 서버가 무시하고 처리하지만, 대시보드에서 지워두시는 편이 좋습니다.'
          : '마스터관리자 PIN 이 정상입니다.',
  };

  if (!gasConfigured()) {
    return Response.json({
      ok: false,
      env,
      master,
      sheet: null,
      msg: 'GAS_URL / GAS_TOKEN 환경변수를 채운 뒤 Redeploy 해주세요.',
    });
  }

  const ping = await callGas('ping', {}, { timeoutMs: 15_000 });

  return Response.json({
    ok: ping.ok && adminConfigured(),
    env,
    master,
    sheet: ping.ok ? { connected: true, version: ping.version, unit: ping.unit } : { connected: false, msg: ping.msg },
    msg: !ping.ok
      ? '구글시트 연결 실패 — ' + ping.msg
      : !adminConfigured()
        ? '시트 연결은 정상입니다. ADMIN_PIN / SESSION_SECRET 을 마저 채워주세요.'
        : md.sameAsAdmin
          ? '⚠️ MASTER_PIN 이 ADMIN_PIN 과 같습니다 — 마스터관리자로 로그인되지 않습니다. 서로 다른 값으로 바꿔주세요.'
          : masterConfigured()
            ? '모든 설정이 정상입니다. 🎉'
            : '모든 설정이 정상입니다. 🎉 (MASTER_PIN 을 넣으면 앱 이름·관리자 PIN 을 앱에서 바꿀 수 있습니다)',
  });
}

import { callGas, gasConfigured } from '@/lib/gas';
import { adminConfigured, masterConfigured, masterDiagnosis } from '@/lib/auth';
import { toAuthRecord } from '@/lib/pin';

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
    // v10.9 최초 설정용 1회 코드. 설정을 마친 뒤에는 없어도 된다
    SETUP_CODE: Boolean(String(process.env.SETUP_CODE ?? '').trim()),
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

  const [ping, rawAuth] = await Promise.all([
    callGas('ping', {}, { timeoutMs: 15_000 }),
    callGas('getAuth', {}, { timeoutMs: 15_000 }),
  ]);

  /**
   * 최초 설정 상태 (v10.9). PIN 은 물론이고 해시도 내보내지 않는다 —
   * "정했는지"와 "지금 정할 수 있는지"만 알려준다.
   */
  const rec = rawAuth.ok === true ? toAuthRecord(rawAuth) : null;
  const setup = {
    done: rec?.configured === true,
    resetOpen: rec?.resetOpen === true,
    codeReady: env.SETUP_CODE,
    msg:
      rec === null
        ? '시트에서 설정 상태를 읽지 못했습니다. .gs 가 v10.9 이상인지 확인해주세요.'
        : rec.configured
          ? rec.resetOpen
            ? '⚠️ 재설정 창이 열려 있습니다 — 지금 앱의 [최초 설정] 화면에서 누구나 PIN 을 다시 정할 수 있습니다. 10분 뒤 자동으로 닫힙니다.'
            : 'PIN 이 앱에서 설정돼 있습니다. 환경변수 ADMIN_PIN·MASTER_PIN 은 더 이상 로그인에 쓰이지 않습니다.'
          : env.SETUP_CODE
            ? '아직 PIN 을 정하지 않았습니다. 앱 [⚙️ 관리] 탭의 [최초 설정] 에서 설치 코드를 넣고 PIN 을 정해주세요.'
            : '아직 PIN 을 정하지 않았고 SETUP_CODE 도 비어 있습니다. 지금은 환경변수 PIN 으로 동작합니다.',
  };

  // 설정을 마쳤으면 환경변수 PIN 은 쓰이지 않으므로, 그쪽 경고는 의미가 없다
  const envPinsInUse = !setup.done;

  return Response.json({
    ok: ping.ok && (setup.done || adminConfigured()),
    env,
    master,
    setup,
    sheet: ping.ok ? { connected: true, version: ping.version, unit: ping.unit } : { connected: false, msg: ping.msg },
    msg: !ping.ok
      ? '구글시트 연결 실패 — ' + ping.msg
      : setup.done
        ? setup.msg
        : !adminConfigured()
          ? '시트 연결은 정상입니다. ADMIN_PIN / SESSION_SECRET 을 마저 채워주세요.'
          : envPinsInUse && md.sameAsAdmin
            ? '⚠️ MASTER_PIN 이 ADMIN_PIN 과 같습니다 — 마스터관리자로 로그인되지 않습니다. 서로 다른 값으로 바꿔주세요.'
            : masterConfigured()
              ? '모든 설정이 정상입니다. 🎉 ' + setup.msg
              : '모든 설정이 정상입니다. 🎉 (MASTER_PIN 을 넣으면 앱 이름·관리자 PIN 을 앱에서 바꿀 수 있습니다)',
  });
}

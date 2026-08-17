/**
 * 앱(Vercel) 버전.
 *
 * 앞 두 자리(major.minor)는 세 곳과 항상 같아야 한다 — `npm run verify:gs` 가 강제한다:
 *   · `package.json` 의 version
 *   · `apps-script/GuildManager_v*.gs` 의 VERSION 상수
 *   · 파일명 (GuildManager_v10_8.gs)
 *
 * 세 번째 자리는 **앱에만 있다.** 시트를 건드리지 않는 화면 수정은 여기만 올린다
 * (10.8 → 10.8.1). 사용자가 시트를 다시 붙여넣지 않아도 되고, 그러면서도
 * "앱이 실제로 갱신됐는지"를 헤더에서 눈으로 확인할 수 있다.
 *
 * 화면 상단에 이 값을 띄우고, 구글시트가 돌려준 버전과 다르면 경고를 붙인다.
 * Vercel 은 push 하면 1~2분 뒤 자동 반영되지만 `.gs` 는 사용자가 직접
 * 붙여넣고 재배포해야 해서, 둘이 어긋난 채로 지내기 쉽기 때문이다.
 */
export const APP_VERSION = '11.6.9';

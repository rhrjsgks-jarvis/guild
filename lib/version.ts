/**
 * 앱(Vercel) 버전.
 *
 * 이 값은 세 곳과 항상 같아야 한다 — `npm run verify:gs` 가 강제한다:
 *   · `package.json` 의 version
 *   · `apps-script/GuildManager_v*.gs` 의 VERSION 상수
 *   · 파일명 (GuildManager_v10_4.gs)
 *
 * 화면 상단에 이 값을 띄우고, 구글시트가 돌려준 버전과 다르면 경고를 붙인다.
 * Vercel 은 push 하면 1~2분 뒤 자동 반영되지만 `.gs` 는 사용자가 직접
 * 붙여넣고 재배포해야 해서, 둘이 어긋난 채로 지내기 쉽기 때문이다.
 */
export const APP_VERSION = '10.4';

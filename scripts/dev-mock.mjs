/**
 * 로컬 개발 — `npm run dev:mock`
 *
 * 모의 시트와 Next 개발 서버를 함께 띄운다. 진짜 스프레드시트도,
 * Apps Script 배포도, 환경변수 설정도 필요 없다. 화면만 고칠 때는 이걸 쓴다.
 *
 *   http://localhost:3000   ← 앱
 *   관리자 PIN: 1234
 */
import { spawn } from 'node:child_process';

const MOCK_PORT = 8787;
const PIN = '1234';

const children = [];
const run = (cmd, args, env) => {
  const child = spawn(cmd, args, { env: { ...process.env, ...env }, stdio: 'inherit' });
  children.push(child);
  child.on('exit', (code) => {
    // 한쪽이 죽으면 나머지도 같이 정리한다 (좀비 프로세스 방지)
    stop();
    process.exit(code ?? 0);
  });
};

function stop() {
  children.forEach((c) => {
    try {
      c.kill('SIGTERM');
    } catch {
      /* 이미 죽었으면 그만 */
    }
  });
}
process.on('SIGINT', () => {
  stop();
  process.exit(130);
});

run('node', ['scripts/mock-sheet.mjs'], { MOCK_PORT: String(MOCK_PORT) });

setTimeout(() => {
  console.log(`\n🔑 관리자 PIN: ${PIN}\n`);
  run('npx', ['next', 'dev'], {
    GAS_URL: `http://127.0.0.1:${MOCK_PORT}/exec`,
    GAS_TOKEN: 'TESTTOKEN',
    ADMIN_PIN: PIN,
    SESSION_SECRET: 'local-dev-only-not-a-real-secret',
  });
}, 500);

#!/usr/bin/env node
/**
 * 시트(.gs) 자동 배포 — "편집기에 붙여넣기 → [배포 관리] → 편집 → 새 버전" 을 대신한다.
 *
 *   npm run deploy:gs            검사 → 올리기 → 새 버전 → 운영 확인 (실패하면 되돌림)
 *   npm run deploy:gs -- --dry   원격과 무엇이 다른지만 보고 아무것도 바꾸지 않는다
 *
 * 설정은 저장소 루트의 `.gas-deploy.local.json` (git 에 올리지 않는다 — 길드마다 다르다):
 *   { "scriptId": "...", "deploymentId": "AKfycb...", "appUrl": "https://....vercel.app" }
 *
 * ★ 이 스크립트가 지키는 것
 *   1. `verify:gs` 를 통과하지 못하면 아무것도 올리지 않는다 (CLAUDE.md — 마지막 방어선)
 *   2. **배포 ID 없이는 배포하지 않는다.** clasp 는 ID 가 없으면 새 배포를 만들고,
 *      그러면 /exec 주소가 바뀌어 앱이 시트를 잃는다 ([새 배포]를 누른 것과 같다)
 *   3. 원격 프로젝트를 먼저 받아서 **코드 파일 하나만** 갈아끼운다. 매니페스트
 *      (Drive 고급 서비스·웹앱 액세스 설정)와 다른 파일은 원격 그대로 다시 올린다 —
 *      여기서 매니페스트를 새로 만들면 OCR 이 꺼지거나 앱이 로그인 화면을 받는다
 *   4. 원격이 더 새 버전이면 멈춘다 (누군가 편집기에서 직접 고친 것을 덮지 않는다)
 *   5. 올린 뒤 운영 앱의 /api/health 로 **시트 버전이 실제로 바뀌었는지** 확인하고,
 *      안 바뀌었거나 연결이 끊겼으면 **직전 버전으로 되돌린다**
 */
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '..');
const CONFIG = join(ROOT, '.gas-deploy.local.json');
// npx 는 윈도우에서 spawn ENOENT 로 죽는다 — node 로 직접 부른다
const CLASP = join(ROOT, 'node_modules/@google/clasp/build/src/index.js');
const DRY = process.argv.includes('--dry');

const say = (s = '') => console.log(s);
class Stop extends Error {
  constructor(msg, code) {
    super(msg);
    this.code = code;
  }
}
/** 멈춘다 — 아래 finally 가 임시 폴더를 치운 뒤 종료 코드를 낸다 */
function die(msg) {
  throw new Stop(msg, 1);
}
function done(msg) {
  throw new Stop(msg, 0);
}
// 임시 폴더를 만들기 전(설정·검사 단계)에 멈춘 경우 — 스택 대신 문장만 보여준다
process.on('uncaughtException', (e) => {
  if (!(e instanceof Stop)) throw e;
  if (e.code === 0) say('\n' + e.message);
  else console.error('\n❌ ' + e.message);
  process.exit(e.code);
});

/* ── 설정 ──
 * GitHub Actions(.github/workflows/deploy-gs.yml)는 파일이 없으니 환경변수로 받는다.
 * 로컬은 .gas-deploy.local.json. 둘 다 있으면 환경변수가 이긴다.
 */
const fromEnv = {
  scriptId: process.env.GAS_SCRIPT_ID,
  deploymentId: process.env.GAS_DEPLOYMENT_ID,
  appUrl: process.env.APP_URL,
};
const useEnv = Boolean(fromEnv.scriptId || fromEnv.deploymentId || fromEnv.appUrl);
if (!useEnv && !existsSync(CONFIG)) {
  die(
    '.gas-deploy.local.json 이 없습니다. 저장소 루트에 만들어 주세요:\n\n' +
      '  { "scriptId": "<Apps Script → 프로젝트 설정 → 스크립트 ID>",\n' +
      '    "deploymentId": "<운영 GAS_URL 의 /s/ 와 /exec 사이 값>",\n' +
      '    "appUrl": "https://<앱주소>" }\n\n' +
      '(GitHub Actions 에서는 GAS_SCRIPT_ID · GAS_DEPLOYMENT_ID · APP_URL 변수)',
  );
}
const cfg = useEnv ? fromEnv : JSON.parse(readFileSync(CONFIG, 'utf8'));
for (const k of ['scriptId', 'deploymentId', 'appUrl']) {
  if (!cfg[k] || typeof cfg[k] !== 'string') die(`.gas-deploy.local.json 에 ${k} 가 비어 있습니다.`);
}
if (!/^AKfycb/.test(cfg.deploymentId)) die('deploymentId 는 AKfycb 로 시작해야 합니다 (웹앱 배포 ID).');
const appUrl = cfg.appUrl.replace(/\/+$/, '');

/* ── 올릴 파일 ── */
const gsFiles = readdirSync(join(ROOT, 'apps-script')).filter((f) => /^GuildManager_v[\d_]+\.gs$/.test(f));
if (gsFiles.length !== 1) die(`apps-script/ 에 GuildManager_v*.gs 가 ${gsFiles.length}개입니다 — 하나여야 합니다.`);
const gsName = gsFiles[0];
const source = readFileSync(join(ROOT, 'apps-script', gsName), 'utf8').replace(/\r\n/g, '\n');
const verOf = (src) => (src.match(/^const VERSION = '([\d.]+)';/m) ?? [])[1] ?? '';
const localVer = verOf(source);
if (!localVer) die(`${gsName} 에서 VERSION 상수를 찾지 못했습니다.`);

say(`📄 ${gsName} (v${localVer})`);

/* ── 1. 검사 ── */
say('\n① verify:gs');
const v = spawnSync(process.execPath, [join(ROOT, 'scripts/verify-gs.mjs')], { cwd: ROOT, encoding: 'utf8' });
const last = (v.stdout || '').trim().split('\n').pop();
if (v.status !== 0) {
  console.error((v.stdout || '') + (v.stderr || ''));
  die('verify:gs 실패 — 올리지 않습니다.');
}
say('   ' + last);

/* ── clasp ── */
function clasp(args, cwd) {
  try {
    return execFileSync(process.execPath, [CLASP, ...args], { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  } catch (e) {
    const out = String(e.stdout || '') + String(e.stderr || '');
    if (/login|credential|auth/i.test(out) && /not|no |invalid|expired/i.test(out)) {
      die(
        (process.env.CI
          ? 'GitHub Secret CLASPRC_JSON 이 없거나 만료됐습니다. 로컬에서 clasp login 후 다시 넣어 주세요.\n'
          : 'clasp 로그인이 필요합니다. 프롬프트에 `! node node_modules/@google/clasp/build/src/index.js login` 을 입력해 주세요.\n') + out,
      );
    }
    if (/User has not enabled the Apps Script API/i.test(out)) {
      die('Apps Script API 가 꺼져 있습니다. https://script.google.com/home/usersettings 에서 켜 주세요.');
    }
    throw new Error(`clasp ${args[0]} 실패:\n${out}`);
  }
}

/** 지금 운영 배포가 가리키는 버전 번호 — 실패하면 여기로 되돌린다 */
function deployedVersion(cwd) {
  const out = clasp(['--json', 'list-deployments'], cwd);
  const list = JSON.parse(out.slice(out.indexOf('[')));
  const d = list.find((x) => x.deploymentId === cfg.deploymentId);
  if (!d) die(`배포 ${cfg.deploymentId.slice(0, 12)}… 가 이 스크립트에 없습니다 — scriptId/deploymentId 를 확인해 주세요.`);
  return d.versionNumber ?? null;
}

async function health() {
  try {
    const r = await fetch(`${appUrl}/api/health`, { signal: AbortSignal.timeout(30_000), cache: 'no-store' });
    const j = await r.json();
    return { connected: Boolean(j.sheet?.connected), version: String(j.sheet?.version ?? '') };
  } catch (e) {
    return { connected: false, version: '', err: String(e.message || e) };
  }
}

/* ── 2. 원격 받기 ── */
const stage = mkdtempSync(join(tmpdir(), 'guild-gas-'));
try {
  writeFileSync(join(stage, '.clasp.json'), JSON.stringify({ scriptId: cfg.scriptId, rootDir: '.' }));
  say('\n② 원격 프로젝트 받기');
  clasp(['pull'], stage);

  const code = readdirSync(stage).filter((f) => /\.(js|gs)$/.test(f));
  const mains = code.filter((f) => /function doPost\(/.test(readFileSync(join(stage, f), 'utf8')));
  if (mains.length !== 1) {
    die(`원격에서 doPost 를 가진 파일이 ${mains.length}개입니다 (${code.join(', ') || '코드 없음'}) — 어느 것을 바꿀지 정할 수 없습니다.`);
  }
  const main = mains[0];

  const manifest = JSON.parse(readFileSync(join(stage, 'appsscript.json'), 'utf8'));
  const access = manifest.webapp?.access;
  if (access !== 'ANYONE_ANONYMOUS') {
    die(`원격 매니페스트의 웹앱 액세스가 "${access ?? '없음'}" 입니다. "모든 사용자"(ANYONE_ANONYMOUS)가 아니면 앱이 시트를 못 부릅니다 — 편집기에서 먼저 확인해 주세요.`);
  }

  const remoteSrc = readFileSync(join(stage, main), 'utf8').replace(/\r\n/g, '\n');
  const remoteVer = verOf(remoteSrc);
  const num = (s) => s.split('.').map(Number);
  const [rM, rm] = num(remoteVer || '0.0');
  const [lM, lm] = num(localVer);
  say(`   원격 ${main} v${remoteVer || '?'} · 다른 파일 ${code.length - 1}개 · 매니페스트 보존`);
  if (rM > lM || (rM === lM && rm > lm)) {
    die(`원격(v${remoteVer})이 저장소(v${localVer})보다 새 버전입니다 — 편집기에서 직접 고친 것을 덮지 않도록 멈춥니다.`);
  }
  if (remoteSrc.trim() === source.trim()) {
    done('✅ 원격 코드가 이미 저장소와 같습니다. 배포할 것이 없습니다.');
  }

  const prevVersion = deployedVersion(stage);
  say(`   운영 배포는 지금 버전 #${prevVersion ?? 'HEAD'}`);

  if (DRY) {
    const a = remoteSrc.split('\n').length;
    const b = source.split('\n').length;
    done(`🔎 --dry: ${main} 을 v${remoteVer} (${a}줄) → v${localVer} (${b}줄) 로 바꿉니다. 아무것도 올리지 않았습니다.`);
  }

  /* ── 3. 올리기 ── */
  writeFileSync(join(stage, main), source);
  say('\n③ 코드 올리기');
  clasp(['push', '--force'], stage);

  /* ── 4. 새 버전으로 운영 배포 갱신 (주소 그대로) ── */
  say('\n④ 새 버전 → 운영 배포');
  const desc = `v${localVer} (deploy-gs ${new Date().toISOString().slice(0, 16).replace('T', ' ')})`;
  const out = clasp(['--json', 'update-deployment', cfg.deploymentId, '-d', desc], stage);
  const newVersion = (out.match(/"versionNumber"\s*:\s*(\d+)/) ?? out.match(/"version"\s*:\s*(\d+)/) ?? [])[1];
  say(`   버전 #${newVersion ?? '?'} 배포됨 — 주소는 그대로입니다`);

  /* ── 5. 운영 확인 ── */
  say('\n⑤ 운영 앱에서 시트 버전 확인');
  let h = { connected: false, version: '' };
  for (let i = 0; i < 8; i++) {
    h = await health();
    if (h.connected && h.version === localVer) break;
    await new Promise((r) => setTimeout(r, 5000));
  }
  if (h.connected && h.version === localVer) {
    say(`   ${appUrl} → 시트 v${h.version} ✅`);
    done(`✅ v${localVer} 배포 완료 (버전 #${prevVersion ?? 'HEAD'} → #${newVersion ?? '?'})`);
  }

  // 새 버전이 운영에서 확인되지 않았다 — 직전 버전으로 되돌린다
  console.error(`\n⚠️ 확인 실패: connected=${h.connected} version=${h.version || '-'} ${h.err ?? ''}`);
  if (prevVersion) {
    say(`↩️ 운영 배포를 직전 버전 #${prevVersion} 로 되돌립니다`);
    clasp(['update-deployment', cfg.deploymentId, '-V', String(prevVersion), '-d', `rollback from v${localVer}`], stage);
    const back = await health();
    die(`되돌림 완료 (지금 시트 v${back.version || '?'}, 연결 ${back.connected ? '정상' : '안 됨'}). 편집기 코드는 v${localVer} 로 바뀌어 있습니다 — 원인을 확인한 뒤 다시 실행해 주세요.`);
  }
  die('직전 버전 번호를 몰라 되돌리지 못했습니다. 편집기 [배포 관리]에서 직접 확인해 주세요.');
} catch (e) {
  if (!(e instanceof Stop)) throw e;
  if (e.code === 0) say('\n' + e.message);
  else console.error('\n❌ ' + e.message);
  process.exitCode = e.code;
} finally {
  rmSync(stage, { recursive: true, force: true });
}

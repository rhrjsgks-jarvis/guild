/**
 * 중국어 화면 문구를 **대만 번체**로 — `npm run zh:tw`
 *
 * 이 앱을 쓰는 혈맹은 대만 서버다. 아이템·보스 이름은 대만 공식 자료에서
 * 가져와 처음부터 번체인데, 화면 문구만 간체였다 — 같은 화면에서 두 서체가
 * 섞여 보였다.
 *
 * ★ **손으로 바꾸지 않는다.** 한 글자가 여러 번체로 갈리는 것이 많다
 *   (发 → 發/髮, 干 → 乾/幹, 后 → 後/后). 사람이 훑으면 반드시 몇 개를 놓친다.
 *   OpenCC 의 `cn → twp`(대만 표준 + 대만 어휘)를 쓴다 — 服务器→伺服器,
 *   设置→設定 처럼 **대만에서 실제로 쓰는 말**까지 바꿔준다.
 * ★ **세 언어 배열의 두 번째 칸만** 건드린다. 자리로 찾고, 글자 모양으로
 *   짐작하지 않는다 — 한국어 문구에 한자가 섞여 있어도 안전하다.
 * ★ `{n}`·`{item}` 같은 자리표시자는 ASCII 라 변환기가 손대지 않는다.
 *   그래도 바뀐 게 없는지 **하나씩 대조**한다 (하나만 깨져도 그 문장이 통째로 망가진다).
 */
import { readFileSync, writeFileSync } from 'node:fs';
import * as OpenCC from 'opencc-js';

const convert = OpenCC.Converter({ from: 'cn', to: 'twp' });
const FILE = 'lib/i18n.tsx';
const apply = process.argv.includes('--apply');

let src = readFileSync(FILE, 'utf8');

/** 따옴표 문자열 하나를 읽는다 (이스케이프 포함). 없으면 null */
function readString(s, from) {
  let i = from;
  while (i < s.length && /\s/.test(s[i])) i++;
  if (s[i] !== "'") return null;
  const start = i;
  i++;
  let out = '';
  while (i < s.length) {
    if (s[i] === '\\') {
      out += s[i] + s[i + 1];
      i += 2;
      continue;
    }
    if (s[i] === "'") return { value: out, start, end: i + 1 };
    out += s[i++];
  }
  return null;
}

const PH = /\{[a-zA-Z]\w*\}/g;
const edits = [];
const entry = /'([\w.]+)':\s*\[/g;
let m;

while ((m = entry.exec(src))) {
  let pos = m.index + m[0].length;
  const parts = [];
  for (let k = 0; k < 3; k++) {
    const r = readString(src, pos);
    if (!r) break;
    parts.push(r);
    pos = r.end;
    while (pos < src.length && /[\s,]/.test(src[pos])) pos++;
  }
  if (parts.length < 2) continue;

  const zh = parts[1];
  const next = convert(zh.value);
  if (next === zh.value) continue;

  // 자리표시자가 하나라도 달라지면 그 문장은 값을 못 채운다 — 통째로 건너뛴다
  const before = (zh.value.match(PH) ?? []).join(',');
  const after = (next.match(PH) ?? []).join(',');
  if (before !== after) {
    console.log(`  ⚠️ 자리표시자가 달라져 건너뜀: ${m[1]}  ${before} → ${after}`);
    continue;
  }
  edits.push({ key: m[1], start: zh.start + 1, end: zh.end - 1, from: zh.value, to: next });
}

/* 뒤에서부터 갈아끼운다 — 앞에서 하면 뒤쪽 위치가 밀린다 */
let out = src;
for (const e of [...edits].reverse()) out = out.slice(0, e.start) + e.to + out.slice(e.end);

console.log(`\n바뀌는 문구 ${edits.length}개`);
for (const e of edits.slice(0, 12)) console.log(`  ${e.key.padEnd(20)} ${e.from}  →  ${e.to}`);
if (edits.length > 12) console.log(`  … 그 밖에 ${edits.length - 12}개`);

if (apply) {
  writeFileSync(FILE, out, 'utf8');
  console.log(`\n${FILE} 에 반영했습니다.`);
} else {
  console.log('\n(미리보기입니다 — 반영하려면 --apply)');
}

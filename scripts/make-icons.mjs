/**
 * 앱 아이콘 생성기 — 의존성 없이 PNG를 직접 써낸다.
 *
 *   npm run icons
 *
 * 색이나 모양을 바꾸고 싶으면 아래 BRAND / GEM 만 고치고 다시 실행하면 된다.
 * (생성물은 저장소에 커밋되어 있으므로 배포할 때 이 스크립트가 돌지는 않는다)
 */
import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/* ─────────────────────────────────────────────────────────
   문장(紋章) 아이콘 — 리니지W 느낌의 어두운 방패 + 금색 'W'.
   게임 로고를 베끼지 않고, 같은 분위기(흑금·각진 방패·W 이니셜)로
   처음부터 그린 도형이다. 색·굵기는 아래 상수만 고치면 된다.
   ───────────────────────────────────────────────────────── */

const BG_TOP = [0x0d, 0x11, 0x1f];      // 배경 그라데이션 위
const BG_BOTTOM = [0x1c, 0x24, 0x44];   // 배경 그라데이션 아래
const SHIELD_TOP = [0x22, 0x2b, 0x4e];  // 방패 면 위
const SHIELD_BOTTOM = [0x11, 0x16, 0x2c];
const GOLD_TOP = [0xf6, 0xdd, 0x93];    // 금색 위 (밝은 쪽)
const GOLD_BOTTOM = [0xc8, 0x91, 0x2e]; // 금색 아래

/** 각진 방패 실루엣 (0~1 정규화) — 위는 넓고 아래로 뾰족하게 */
const SHIELD = (() => {
  const pts = [
    [0.16, 0.11],
    [0.84, 0.11],
    [0.84, 0.44],
  ];
  // 오른쪽 아래 → 꼭짓점 → 왼쪽 위로 곡선을 근사한다
  for (let i = 1; i <= 16; i++) {
    const t = i / 16;
    pts.push([0.84 - 0.34 * t * t, 0.44 + 0.46 * Math.sin((t * Math.PI) / 2)]);
  }
  for (let i = 16; i >= 1; i--) {
    const t = i / 16;
    pts.push([0.16 + 0.34 * t * t, 0.44 + 0.46 * Math.sin((t * Math.PI) / 2)]);
  }
  pts.push([0.16, 0.44]);
  return pts;
})();

/** 금색 'W' 획 — 방패 가운데를 가로지르는 네 개의 선분 */
const W_STROKES = [
  [[0.28, 0.29], [0.37, 0.62]],
  [[0.37, 0.62], [0.5, 0.40]],
  [[0.5, 0.40], [0.63, 0.62]],
  [[0.63, 0.62], [0.72, 0.29]],
];
const W_WIDTH = 0.052;

/** 아래쪽 칼날 — 'W' 밑에서 방패 꼭짓점을 향해 좁아지는 삼각형 */
const BLADE = [
  [0.468, 0.615],
  [0.532, 0.615],
  [0.5, 0.855],
];

/* ── 기하 헬퍼 ── */

function mix(a, b, t) {
  return a.map((c, i) => Math.round(c + (b[i] - c) * Math.max(0, Math.min(1, t))));
}

function inPolygon(px, py, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i];
    const [xj, yj] = poly[j];
    if (yi > py !== yj > py && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

function distToSegment(px, py, [ax, ay], [bx, by]) {
  const dx = bx - ax;
  const dy = by - ay;
  const len2 = dx * dx + dy * dy;
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len2));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

/** 다각형 경계까지의 거리 — 테두리를 그리는 데 쓴다 */
function distToPolygon(px, py, poly) {
  let best = Infinity;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    best = Math.min(best, distToSegment(px, py, poly[j], poly[i]));
  }
  return best;
}

/** 한 점의 색 — 3x3 슈퍼샘플링으로 계단현상을 없앤다 */
function sample(nx, ny) {
  const gold = mix(GOLD_TOP, GOLD_BOTTOM, (ny - 0.25) / 0.5);

  // ① 'W' 와 칼날이 가장 위 — 방패 밖으로 새어나가지 않도록 방패 안에서만 그린다
  const insideShield = inPolygon(nx, ny, SHIELD);
  if (insideShield) {
    for (const [a, b] of W_STROKES) {
      if (distToSegment(nx, ny, a, b) < W_WIDTH) return gold;
    }
    if (inPolygon(nx, ny, BLADE)) return gold;
  }

  // ② 방패 테두리 (금색)
  const edge = distToPolygon(nx, ny, SHIELD);
  if (edge < 0.022 && (insideShield || edge < 0.012)) return gold;

  // ③ 방패 면
  if (insideShield) return mix(SHIELD_TOP, SHIELD_BOTTOM, (ny - 0.1) / 0.8);

  // ④ 배경
  return mix(BG_TOP, BG_BOTTOM, ny);
}

function renderPixel(x, y, size) {
  let r = 0;
  let g = 0;
  let b = 0;
  const N = 3;
  for (let sy = 0; sy < N; sy++) {
    for (let sx = 0; sx < N; sx++) {
      const [pr, pg, pb] = sample((x + (sx + 0.5) / N) / size, (y + (sy + 0.5) / N) / size);
      r += pr;
      g += pg;
      b += pb;
    }
  }
  const n = N * N;
  return [Math.round(r / n), Math.round(g / n), Math.round(b / n), 255];
}

/* ── PNG 인코더 ── */

const CRC_TABLE = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();

function crc32(buf) {
  let c = -1;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const typed = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(typed));
  return Buffer.concat([len, typed, crc]);
}

function encodePng(size) {
  const stride = size * 4 + 1; // 스캔라인마다 필터 바이트 1개
  const raw = Buffer.alloc(size * stride);
  for (let y = 0; y < size; y++) {
    raw[y * stride] = 0; // filter: none
    for (let x = 0; x < size; x++) {
      const [r, g, b, a] = renderPixel(x, y, size);
      const o = y * stride + 1 + x * 4;
      raw[o] = r;
      raw[o + 1] = g;
      raw[o + 2] = b;
      raw[o + 3] = a;
    }
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type: RGBA
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/* ── 출력 ── */

const targets = [
  ['public/icon-192.png', 192],
  ['public/icon-512.png', 512],
  ['app/icon.png', 192],
  ['app/apple-icon.png', 180],
];

for (const [rel, size] of targets) {
  const out = resolve(ROOT, rel);
  mkdirSync(dirname(out), { recursive: true });
  const png = encodePng(size);
  writeFileSync(out, png);
  console.log(`${rel.padEnd(24)} ${size}x${size}  ${(png.length / 1024).toFixed(1)}KB`);
}

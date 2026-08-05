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
   아이콘 — 어두운 돌 질감 위에 각진 금색 'W'.

   게임의 공식 로고는 상표라서 그대로 쓰지 않는다. 대신 같은 분위기
   (흑금 · 거친 돌 바탕 · 뾰족하게 뻗은 획)를 좌표로 직접 그린다.

   ▸ 색을 바꾸려면      → STONE_* / GOLD_*
   ▸ 글자 모양을 바꾸려면 → W_STROKES (각 획은 "시작점·시작두께 → 끝점·끝두께")
   ───────────────────────────────────────────────────────── */

const STONE_DARK = [0x07, 0x08, 0x0c];   // 돌 바탕 어두운 쪽
const STONE_LIGHT = [0x2a, 0x2d, 0x36];  // 돌 바탕 밝은 쪽
const GOLD_TOP = [0xf3, 0xdd, 0xb2];     // 금색 위 (빛 받는 쪽)
const GOLD_BOTTOM = [0xa9, 0x76, 0x36];  // 금색 아래 (그늘)

/**
 * 'W' 획 — [시작점, 끝점, 시작 반두께, 끝 반두께].
 *
 * 캡슐(둥근 끝)이 아니라 **사다리꼴 다각형**으로 찍는다. 끝이 직선으로
 * 잘려야 붓으로 그은 듯 각진 인상이 나오고, 아래로 갈수록 두께를 0에
 * 가깝게 줄이면 칼끝처럼 뾰족해진다.
 */
const W_STROKES = [
  [[0.186, 0.232], [0.396, 0.778], 0.068, 0.008],  // ＼ 왼쪽 큰 획
  [[0.396, 0.778], [0.500, 0.398], 0.008, 0.036],  // ／ 가운데로 올라가는 획
  [[0.500, 0.398], [0.604, 0.778], 0.036, 0.008],  // ＼ 가운데에서 내려오는 획
  [[0.604, 0.778], [0.814, 0.232], 0.008, 0.068],  // ／ 오른쪽 큰 획
];

/**
 * 뾰족하게 뻗어나가는 끝 — 위쪽 두 뿔과 가운데 봉우리.
 * 좌표를 손으로 찍으면 획과 어긋나 떠 보이므로, **획의 실제 모서리에서**
 * 삼각형을 세운다. 획 두께를 바꿔도 항상 붙어 있다.
 */
const HORN_LEFT = [0.076, 0.126];
const HORN_RIGHT = [0.924, 0.126];
const PEAK = [0.500, 0.312];

/* ── 기하 · 색 헬퍼 ── */

function mix(a, b, t) {
  const k = Math.max(0, Math.min(1, t));
  return a.map((c, i) => Math.round(c + (b[i] - c) * k));
}

/** 결정적 의사난수 — 같은 좌표면 항상 같은 값 (돌 얼룩용) */
function hash2(x, y) {
  const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
  return s - Math.floor(s);
}

/** 값 노이즈 — 격자에서 뽑아 부드럽게 섞는다 */
function valueNoise(x, y) {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const xf = x - xi;
  const yf = y - yi;
  const u = xf * xf * (3 - 2 * xf);
  const v = yf * yf * (3 - 2 * yf);
  const a = hash2(xi, yi);
  const b = hash2(xi + 1, yi);
  const c = hash2(xi, yi + 1);
  const d = hash2(xi + 1, yi + 1);
  return a * (1 - u) * (1 - v) + b * u * (1 - v) + c * (1 - u) * v + d * u * v;
}

/** 여러 배율을 겹쳐 거친 돌 표면을 만든다 */
function stoneNoise(nx, ny) {
  let sum = 0;
  let amp = 0.5;
  let freq = 6;
  for (let i = 0; i < 4; i++) {
    sum += valueNoise(nx * freq, ny * freq) * amp;
    freq *= 2.1;
    amp *= 0.5;
  }
  return sum; // 대략 0~1
}

/** 획 [A,B,wA,wB] → 사다리꼴 네 점 (끝이 직선으로 잘린다) */
function strokeQuad([a, b, wa, wb]) {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const len = Math.hypot(dx, dy) || 1;
  const nx = -dy / len;
  const ny = dx / len;
  return [
    [a[0] + nx * wa, a[1] + ny * wa],
    [b[0] + nx * wb, b[1] + ny * wb],
    [b[0] - nx * wb, b[1] - ny * wb],
    [a[0] - nx * wa, a[1] - ny * wa],
  ];
}

const QUADS = W_STROKES.map(strokeQuad);

const lerp = (p, q, t) => [p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t];

// strokeQuad 가 돌려주는 순서: [A쪽 모서리1, B쪽 모서리1, B쪽 모서리2, A쪽 모서리2]
const [LEFT, , , RIGHT] = QUADS;

// 뿔의 밑변을 획 안쪽으로 조금 밀어넣는다. 모서리에 딱 맞추면 두 도형이
// 맞닿기만 해서 이음매가 선처럼 비친다 — 겹쳐야 하나로 보인다.
const OVERLAP = 0.12;
const SHARDS = [
  [lerp(LEFT[0], LEFT[1], OVERLAP), lerp(LEFT[3], LEFT[2], OVERLAP), HORN_LEFT],
  [lerp(RIGHT[1], RIGHT[0], OVERLAP), lerp(RIGHT[2], RIGHT[3], OVERLAP), HORN_RIGHT],
  [[0.458, 0.470], [0.542, 0.470], PEAK],
];

const GOLD_SHAPES = QUADS.concat(SHARDS);

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

/** 다각형 경계까지의 거리 — 가장자리에 광택을 얹는 데 쓴다 */
function edgeDistance(px, py, poly) {
  let best = Infinity;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    best = Math.min(best, distToSegment(px, py, poly[j], poly[i]));
  }
  return best;
}

/** 한 점의 색 */
function sample(nx, ny) {
  // ── 금색 획 ──
  let inside = false;
  let edge = Infinity;
  for (const poly of GOLD_SHAPES) {
    if (inPolygon(nx, ny, poly)) {
      // 겹친 부분에서는 "가장 안쪽" 값을 쓴다 — 도형 경계가 광택 선으로 드러나지 않게
      edge = inside ? Math.max(edge, edgeDistance(nx, ny, poly)) : edgeDistance(nx, ny, poly);
      inside = true;
    }
  }

  if (inside) {
    // 위→아래 금색 그라데이션 + 안쪽일수록 밝은 금속 광택 + 미세한 결
    const base = mix(GOLD_TOP, GOLD_BOTTOM, (ny - 0.19) / 0.60);
    const sheen = 0.70 + 0.30 * Math.min(1, Math.pow(edge / 0.030, 0.55));
    const grain = (stoneNoise(nx * 2.4 + 9, ny * 2.4 + 4) - 0.5) * 24;
    return base.map((c) => Math.max(0, Math.min(255, Math.round(c * sheen + grain))));
  }

  // ── 돌 바탕 ──
  const n = stoneNoise(nx, ny);
  const stone = mix(STONE_DARK, STONE_LIGHT, n * 0.9);
  // 가운데가 밝고 가장자리로 갈수록 어두워지게 (비네팅)
  const d = Math.hypot(nx - 0.5, ny - 0.46) / 0.72;
  return mix(stone, STONE_DARK, d * d * 0.85);
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

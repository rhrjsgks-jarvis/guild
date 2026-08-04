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

const BRAND_TOP = [0x26, 0x2a, 0x9e];
const BRAND_BOTTOM = [0x4b, 0x50, 0xf0];

// 다이아몬드 실루엣 (0~1 정규화 좌표)
const GEM = [
  [0.34, 0.24],
  [0.66, 0.24],
  [0.84, 0.38],
  [0.5, 0.79],
  [0.16, 0.38],
];
const FACETS = [
  [[0.16, 0.38], [0.84, 0.38]],
  [[0.34, 0.24], [0.28, 0.38]],
  [[0.66, 0.24], [0.72, 0.38]],
  [[0.28, 0.38], [0.5, 0.79]],
  [[0.72, 0.38], [0.5, 0.79]],
];

/* ── 기하 헬퍼 ── */

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

/** 한 점의 색 — 3x3 슈퍼샘플링으로 계단현상을 없앤다 */
function sample(nx, ny) {
  const bg = BRAND_TOP.map((c, i) => Math.round(c + (BRAND_BOTTOM[i] - c) * ny));
  if (!inPolygon(nx, ny, GEM)) return bg;

  // 보석 안 — 흰색, 단, 면 경계선은 배경색으로 얇게 판다
  for (const [a, b] of FACETS) {
    if (distToSegment(nx, ny, a, b) < 0.011) return bg;
  }
  return [0xff, 0xff, 0xff];
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

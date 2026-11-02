// Draws the PNG app icons (no dependencies): a placeholder launch-arrow badge in the theme colours.
// Run with `npm run icons`. Replace with real artwork once the logo exists.
import { deflateSync } from 'node:zlib';
import { mkdirSync, writeFileSync } from 'node:fs';

const C = { blue: [0x14, 0x40, 0xc4], sun: [0xff, 0xd2, 0x1f], ink: [0x0b, 0x1a, 0x4d], flame: [0xff, 0x7a, 0x1a], red: [0xe8, 0x23, 0x1c] };

function segDist(px, py, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay, t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}
function inTri(px, py, [a, b, c]) {
  const s = (p, q, r) => (p[0] - r[0]) * (q[1] - r[1]) - (q[0] - r[0]) * (p[1] - r[1]);
  const p = [px, py], d1 = s(p, a, b), d2 = s(p, b, c), d3 = s(p, c, a);
  return !((d1 < 0 || d2 < 0 || d3 < 0) && (d1 > 0 || d2 > 0 || d3 > 0));
}
// same design as public/icons/icon.svg, in 512-unit space; full-bleed so it also works as maskable / iOS
function colourAt(x, y) {
  const tri = [[300, 150], [410, 172], [356, 270]];
  if (inTri(x, y, tri)) return C.red;
  if (Math.min(segDist(x, y, ...tri[0], ...tri[1]), segDist(x, y, ...tri[1], ...tri[2]), segDist(x, y, ...tri[2], ...tri[0])) < 7) return C.ink;
  const d = segDist(x, y, 120, 330, 392, 182);
  if (d < 10) return C.flame;
  if (d < 20) return C.ink;
  if (Math.hypot(x - 256, y - 256) < 196) return C.sun;
  return C.blue;
}

function png(size) {
  const ss = 3, raw = Buffer.alloc((size * 3 + 1) * size);
  for (let y = 0; y < size; y++) {
    raw[y * (size * 3 + 1)] = 0;
    for (let x = 0; x < size; x++) {
      const acc = [0, 0, 0];
      for (let j = 0; j < ss; j++) for (let i = 0; i < ss; i++) {
        const c = colourAt((x + (i + .5) / ss) * 512 / size, (y + (j + .5) / ss) * 512 / size);
        acc[0] += c[0]; acc[1] += c[1]; acc[2] += c[2];
      }
      const o = y * (size * 3 + 1) + 1 + x * 3;
      for (let k = 0; k < 3; k++) raw[o + k] = Math.round(acc[k] / (ss * ss));
    }
  }
  const crcTable = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
  const crc = buf => { let c = 0xffffffff; for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
  const chunk = (type, data) => {
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(type), data]), c = Buffer.alloc(4); c.writeUInt32BE(crc(td));
    return Buffer.concat([len, td, c]);
  };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4); ihdr[8] = 8; ihdr[9] = 2;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}

mkdirSync('public/icons', { recursive: true });
for (const [name, size] of [['icon-192.png', 192], ['icon-512.png', 512], ['apple-touch-icon.png', 180]]) {
  writeFileSync(`public/icons/${name}`, png(size));
  console.log('wrote public/icons/' + name);
}

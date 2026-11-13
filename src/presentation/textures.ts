import * as THREE from 'three';
import { THEME } from '../content/theme';

/* Small canvas-drawn textures for the city. */
let maxAniso = 4;
export const setMaxAnisotropy = (n: number) => { maxAniso = n; };

export function canvasTex(w: number, h: number, draw: (c: CanvasRenderingContext2D, w: number, h: number) => void, repeat = false) {
  const cv = document.createElement('canvas'); cv.width = w; cv.height = h; draw(cv.getContext('2d')!, w, h);
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = maxAniso;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

export const roadTexture = () => canvasTex(256, 256, (c, w, h) => {
  c.fillStyle = '#41464f'; c.fillRect(0, 0, w, h);
  for (let i = 0; i < 1400; i++) { c.fillStyle = `rgba(${Math.random() < .5 ? 255 : 0},${Math.random() < .5 ? 255 : 0},${Math.random() < .5 ? 255 : 0},.05)`; c.fillRect(Math.random() * w, Math.random() * h, 2, 2); }
  c.fillStyle = '#f4f4f0'; c.fillRect(10, 0, 6, h); c.fillRect(w - 16, 0, 6, h);
  c.fillStyle = '#ffcf1f'; c.fillRect(w / 2 - 7, 0, 5, h); c.fillRect(w / 2 + 2, 0, 5, h);
  c.fillStyle = 'rgba(255,255,255,.85)'; c.fillRect(w * .27 - 3, 20, 6, 90); c.fillRect(w * .73 - 3, 20, 6, 90);
}, true);

export const walkTexture = () => canvasTex(128, 128, (c, w, h) => {
  c.fillStyle = '#d9d6cf'; c.fillRect(0, 0, w, h);
  c.strokeStyle = '#bdb8ae'; c.lineWidth = 3;
  for (let i = 0; i <= 4; i++) { c.beginPath(); c.moveTo(0, i * 32); c.lineTo(w, i * 32); c.stroke(); c.beginPath(); c.moveTo(i * 32, 0); c.lineTo(i * 32, h); c.stroke(); }
}, true);

/* A colour texture plus a matching wall mask (white = wall, black = glass and frames), drawn by the
   same function. tintWalls() uses the mask so only the wall takes the building colour: the glass
   stays sky blue on a red building instead of going muddy. */
export interface MaskedTex { map: THREE.Texture; mask: THREE.Texture }
function masked(w: number, h: number, draw: (c: CanvasRenderingContext2D, w: number, h: number, mask: boolean) => void): MaskedTex {
  const map = canvasTex(w, h, (c, w, h) => draw(c, w, h, false), true);
  const mask = canvasTex(w, h, (c, w, h) => draw(c, w, h, true), true);
  mask.colorSpace = THREE.NoColorSpace;
  return { map, mask };
}

/* Material tint applies to the wall only (mask in alphaMap's green channel, not used for opacity). */
export function tintWalls(m: THREE.MeshStandardMaterial) {
  m.onBeforeCompile = sh => {
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <map_fragment>', `
        vec4 tx = texture2D( map, vMapUv );
        float wall = texture2D( alphaMap, vAlphaMapUv ).g;
        diffuseColor.rgb = mix( tx.rgb, diffuseColor.rgb * tx.rgb, wall );`)
      .replace('#include <alphamap_fragment>', '');
  };
  m.customProgramCacheKey = () => 'tintWalls';
  return m;
}

function glass(c: CanvasRenderingContext2D, x: number, y: number, w: number, h: number) {
  const g = c.createLinearGradient(x, y, x + w * .5, y + h);
  g.addColorStop(0, '#d4f0ff'); g.addColorStop(.45, '#6cc0ff'); g.addColorStop(1, '#2f86e6');
  c.fillStyle = g; c.fillRect(x, y, w, h);
  c.fillStyle = 'rgba(255,255,255,.55)';                                     // glossy diagonal reflections
  c.beginPath(); c.moveTo(x + w * .08, y + h * .62); c.lineTo(x + w * .62, y); c.lineTo(x + w * .86, y); c.lineTo(x + w * .08, y + h * .9); c.fill();
  c.fillStyle = 'rgba(255,255,255,.3)';
  c.beginPath(); c.moveTo(x + w * .5, y + h); c.lineTo(x + w, y + h * .35); c.lineTo(x + w, y + h * .5); c.lineTo(x + w * .64, y + h); c.fill();
}
function roundRect(c: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  c.beginPath(); c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r);
  c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath();
}

/* Two windows per tile in the toy-town style: chunky rounded grey frames, cross bars, glossy blue
   glass and a fat sill. White wall so the building colour tints it. */
export const windowTextures = () => {
  return masked(512, 512, (c, w, h, mask) => {
    const frame = mask ? '#000' : '#d5dae3', shade = mask ? '#000' : '#a9b1bf';
    c.fillStyle = '#ffffff'; c.fillRect(0, 0, w, h);
    if (!mask) {
      c.fillStyle = 'rgba(0,0,0,.035)'; for (let y = 14; y < h; y += 28) c.fillRect(0, y, w, 3);   // faint siding lines
      c.fillStyle = 'rgba(0,0,0,.08)'; c.fillRect(0, h - 30, w, 30);                              // floor band
      c.fillStyle = 'rgba(255,255,255,.6)'; c.fillRect(0, h - 30, w, 5);
    }
    for (let i = 0; i < 2; i++) {
      const x = 60 + i * 236, y = 70, ww = 156, wh = 300;
      if (!mask) { c.fillStyle = 'rgba(20,30,60,.16)'; roundRect(c, x - 14, y - 6, ww + 34, wh + 34, 30); c.fill(); }  // drop shadow
      c.fillStyle = shade; roundRect(c, x - 18, y - 18, ww + 36, wh + 36, 30); c.fill();
      c.fillStyle = frame; roundRect(c, x - 18, y - 22, ww + 36, wh + 34, 30); c.fill();
      if (!mask) {
        c.save(); roundRect(c, x, y, ww, wh, 14); c.clip(); glass(c, x, y, ww, wh); c.restore();
        c.fillStyle = 'rgba(0,0,0,.18)'; c.fillRect(x, y, ww, 8);                          // inner shadow under the top frame
      }
      c.fillStyle = frame; c.fillRect(x + ww / 2 - 8, y, 16, wh); c.fillRect(x, y + wh * .42 - 8, ww, 16);   // cross bars
      c.fillStyle = shade; roundRect(c, x - 30, y + wh + 12, ww + 60, 26, 10); c.fill();                     // sill
      c.fillStyle = frame; roundRect(c, x - 30, y + wh + 8, ww + 60, 22, 10); c.fill();
    }
  });
};

/* Shop front, 4 m wide: frame (takes the shop colour), a big window and a glass door. */
export const shopTextures = () => masked(512, 384, (c, w, h, mask) => {
  const frame = mask ? '#000' : '#e4e8ef';
  c.fillStyle = '#ffffff'; c.fillRect(0, 0, w, h);
  const pane = (x: number, y: number, pw: number, ph: number) => {
    c.fillStyle = mask ? '#000' : '#aab3c2'; roundRect(c, x - 16, y - 14, pw + 32, ph + 30, 18); c.fill();
    c.fillStyle = frame; roundRect(c, x - 16, y - 18, pw + 32, ph + 30, 18); c.fill();
    if (mask) { c.fillStyle = '#000'; c.fillRect(x, y, pw, ph); return; }
    c.save(); roundRect(c, x, y, pw, ph, 10); c.clip(); glass(c, x, y, pw, ph); c.restore();
  };
  pane(36, 70, 290, 232);
  pane(370, 70, 106, 296);
  c.fillStyle = mask ? '#000' : '#ffd21f'; roundRect(c, 450, 200, 14, 44, 6); c.fill();      // door handle
  c.fillStyle = mask ? '#000' : '#2b2f3a'; roundRect(c, 20, 318, 322, 52, 10); c.fill();       // kick plate
});

/* Striped canvas awning in one colour plus white. */
export const awningTexture = (col: string) => canvasTex(128, 32, (c, w, h) => {
  for (let i = 0; i < 8; i++) { c.fillStyle = i % 2 ? '#ffffff' : col; c.fillRect(i * w / 8, 0, w / 8, h); }
  c.fillStyle = 'rgba(0,0,0,.12)'; c.fillRect(0, h - 5, w, 5);
}, true);

export const signTexture = (text: string, bg: string, fg: string) => canvasTex(512, 128, (c, w, h) => {
  c.fillStyle = bg; c.fillRect(0, 0, w, h);
  c.strokeStyle = '#ffffff'; c.lineWidth = 10; c.strokeRect(5, 5, w - 10, h - 10);
  c.fillStyle = fg; c.font = `900 84px ${THEME.fonts.display}`; c.textAlign = 'center'; c.textBaseline = 'middle';
  c.fillText(text, w / 2, h / 2 + 6);
});

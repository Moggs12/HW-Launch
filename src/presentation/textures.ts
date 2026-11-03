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

/* Two windows per tile: recessed frame, sill, sky reflection, some lit or with curtains.
   White wall so the building colour tints it. */
export const windowTexture = () => canvasTex(256, 256, (c, w, h) => {
  c.fillStyle = '#ffffff'; c.fillRect(0, 0, w, h);
  c.fillStyle = '#eeeeee'; c.fillRect(0, h - 22, w, 22);
  c.fillStyle = 'rgba(0,0,0,.05)'; for (let y = 8; y < h - 22; y += 16) c.fillRect(0, y, w, 2);
  for (let i = 0; i < 2; i++) {
    const x = 28 + i * 120, y = 40, ww = 84, wh = 136;
    c.fillStyle = '#c9c9c9'; c.fillRect(x - 6, y - 6, ww + 12, wh + 12);         // recess
    const lit = Math.random() < .25, g = c.createLinearGradient(x, y, x + ww * .6, y + wh);
    if (lit) { g.addColorStop(0, '#fff6c8'); g.addColorStop(1, '#ffd77a'); }
    else { g.addColorStop(0, '#9fd0ff'); g.addColorStop(.55, '#4f86c6'); g.addColorStop(1, '#2d4f86'); }
    c.fillStyle = g; c.fillRect(x, y, ww, wh);
    if (!lit && Math.random() < .35) { c.fillStyle = ['#ff9fc4', '#ffd21f', '#9ad66b'][i % 3]; c.fillRect(x, y, ww * .22, wh); c.fillRect(x + ww * .78, y, ww * .22, wh); }
    c.fillStyle = 'rgba(255,255,255,.45)';                                          // reflection streak
    c.beginPath(); c.moveTo(x + 10, y + wh); c.lineTo(x + 34, y); c.lineTo(x + 48, y); c.lineTo(x + 24, y + wh); c.fill();
    c.fillStyle = '#ffffff'; c.fillRect(x + ww / 2 - 4, y, 8, wh); c.fillRect(x, y + wh * .42, ww, 7);   // frame bars
    c.fillStyle = '#ffffff'; c.fillRect(x - 12, y + wh + 6, ww + 24, 10);            // sill
    c.fillStyle = 'rgba(0,0,0,.18)'; c.fillRect(x - 12, y + wh + 16, ww + 24, 4);
  }
}, true);

/* Shop front, 4 m wide: tinted frame, a big window and a glass door. */
export const shopTexture = () => canvasTex(256, 192, (c, w, h) => {
  c.fillStyle = '#ffffff'; c.fillRect(0, 0, w, h);
  c.fillStyle = 'rgba(255,255,255,.8)'; c.fillRect(0, 0, w, 30);
  const pane = (x: number, y: number, pw: number, ph: number) => {
    const g = c.createLinearGradient(x, y, x + pw, y + ph);
    g.addColorStop(0, '#bfe3ff'); g.addColorStop(.5, '#5d8fcf'); g.addColorStop(1, '#2a3f6e');
    c.fillStyle = g; c.fillRect(x, y, pw, ph);
    c.fillStyle = 'rgba(255,255,255,.35)'; c.beginPath(); c.moveTo(x + pw * .15, y + ph); c.lineTo(x + pw * .45, y); c.lineTo(x + pw * .6, y); c.lineTo(x + pw * .3, y + ph); c.fill();
  };
  pane(14, 40, 150, 120);
  pane(182, 40, 60, 146);
  c.fillStyle = '#ffd21f'; c.fillRect(230, 108, 6, 16);                        // door handle
  c.fillStyle = 'rgba(0,0,0,.25)'; c.fillRect(14, 160, 150, 26);               // kick plate
}, true);

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

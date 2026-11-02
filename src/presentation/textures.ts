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

export const windowTexture = () => canvasTex(128, 128, (c, w, h) => {
  c.fillStyle = '#ffffff'; c.fillRect(0, 0, w, h);
  c.fillStyle = '#e6e6e6'; c.fillRect(0, h - 10, w, 10);
  for (let i = 0; i < 2; i++) {
    const x = 14 + i * 60;
    c.fillStyle = '#2b4a78'; c.fillRect(x, 22, 44, 66);
    c.fillStyle = Math.random() < .3 ? '#ffe9a8' : '#6fa3d8'; c.fillRect(x + 4, 26, 36, 58);
    c.fillStyle = 'rgba(255,255,255,.55)'; c.fillRect(x + 6, 28, 10, 54);
    c.fillStyle = '#ffffff'; c.fillRect(x + 20, 26, 4, 58);
    c.fillStyle = '#cfcfcf'; c.fillRect(x - 4, 88, 52, 6);
  }
}, true);

export const signTexture = (text: string, bg: string, fg: string) => canvasTex(512, 128, (c, w, h) => {
  c.fillStyle = bg; c.fillRect(0, 0, w, h);
  c.strokeStyle = '#ffffff'; c.lineWidth = 10; c.strokeRect(5, 5, w - 10, h - 10);
  c.fillStyle = fg; c.font = `900 84px ${THEME.fonts.display}`; c.textAlign = 'center'; c.textBaseline = 'middle';
  c.fillText(text, w / 2, h / 2 + 6);
});

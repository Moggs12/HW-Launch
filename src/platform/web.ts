import type { Storage } from '../rules/save';

/* Web platform: saves in localStorage, offline support through a service worker.
   An iPhone (Capacitor) build would swap this file for one using native storage. */

export const webStorage: Storage = {
  get(key) { try { return localStorage.getItem(key); } catch { return null; } },
  set(key, value) { try { localStorage.setItem(key, value); } catch { /* private mode: play on without saving */ } },
};

export function registerServiceWorker() {
  if (!import.meta.env.PROD || !('serviceWorker' in navigator)) return;
  addEventListener('load', () => { navigator.serviceWorker.register('./sw.js').catch(() => {}); });
}

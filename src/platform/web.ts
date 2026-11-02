import type { Storage } from '../rules/save';
import type { Buzz, Platform } from './platform';

/* Web platform: saves in localStorage, buzz on the phone, offline support through a service worker.
   An iPhone (Capacitor) build would swap this file for one using native storage and haptics. */

export const webStorage: Storage = {
  get(key) { try { return localStorage.getItem(key); } catch { return null; } },
  set(key, value) { try { localStorage.setItem(key, value); } catch { /* private mode: play on without saving */ } },
};

/* Android: navigator.vibrate. iPhone Safari has no vibrate, but since iOS 18 flipping a
   switch-style checkbox gives a small haptic tap, so we flip a hidden one. */
let iosSwitch: HTMLLabelElement | null = null;
function haptic(kind: Buzz) {
  try {
    if ('vibrate' in navigator && typeof navigator.vibrate === 'function') {
      navigator.vibrate(kind === 'light' ? 12 : kind === 'medium' ? 30 : [40, 30, 60]);
      return;
    }
    if (!iosSwitch) {
      iosSwitch = document.createElement('label');
      iosSwitch.setAttribute('aria-hidden', 'true');
      iosSwitch.style.cssText = 'position:fixed;left:-200px;top:0;width:1px;height:1px;opacity:0;pointer-events:none';
      const input = document.createElement('input');
      input.type = 'checkbox'; input.setAttribute('switch', ''); input.tabIndex = -1;
      iosSwitch.appendChild(input); document.body.appendChild(iosSwitch);
    }
    const taps = kind === 'heavy' ? 3 : kind === 'medium' ? 2 : 1;
    for (let i = 0; i < taps; i++) setTimeout(() => iosSwitch?.click(), i * 70);
  } catch { /* no haptics here */ }
}

export const webPlatform: Platform = { storage: webStorage, haptic };

/* Offline support. A new version installs in the background; when it takes over we reload once
   so the phone never gets stuck on an old copy. */
export function registerServiceWorker() {
  if (!import.meta.env.PROD || !('serviceWorker' in navigator)) return;
  const hadController = !!navigator.serviceWorker.controller;
  let reloaded = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (hadController && !reloaded) { reloaded = true; location.reload(); }
  });
  addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').then(reg => {
      reg.update().catch(() => {});
      document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') reg.update().catch(() => {}); });
    }).catch(() => {});
  });
}

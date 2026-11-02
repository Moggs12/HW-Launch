import type { Storage } from '../rules/save';

/* What the game needs from the device. web.ts now; a Capacitor version for the iPhone app later. */
export type Buzz = 'light' | 'medium' | 'heavy';

export interface Platform {
  storage: Storage;
  haptic(kind: Buzz): void;
}

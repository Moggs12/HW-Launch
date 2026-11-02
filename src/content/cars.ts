import type { SpecialId } from './specials';

/* Cars in unlock order. model names a builder in presentation/cars.
   upgradePrices: coins for upgrade level 1, 2 and 3 (same for every upgrade on that car). */
export interface CarDef {
  key: string;          // also the image file in public/cars/<key>.webp
  name: string;
  card: string;
  model: string;
  accent: number;       // wing colour
  baseSpeed: number;    // launch speed at full pull, engine level 0
  halfWidth: number;    // for collisions
  special: SpecialId;
  upgradePrices: readonly [number, number, number];
}

export const CARS: readonly CarDef[] = [
  { key: '04-banana-buggy',   name: 'Banana Buggy',   card: '04', model: 'banana', accent: 0xffd51f, baseSpeed: 22, halfWidth: .75, special: 'swerve',      upgradePrices: [30, 60, 90] },
  { key: '01-flame-racer',    name: 'Flame Racer',    card: '01', model: 'flame',  accent: 0xe3221a, baseSpeed: 30, halfWidth: .93, special: 'flameBoost',  upgradePrices: [55, 105, 160] },
  { key: '03-shark-chomper',  name: 'Shark Chomper',  card: '03', model: 'shark',  accent: 0x2676e0, baseSpeed: 38, halfWidth: .95, special: 'chomp',       upgradePrices: [75, 150, 225] },
  { key: '02-dino-stomper',   name: 'Dino Stomper',   card: '02', model: 'dino',   accent: 0x7b3fd1, baseSpeed: 47, halfWidth: 1.05, special: 'stomp',      upgradePrices: [100, 195, 295] },
  { key: '05-rocket-rider',   name: 'Rocket Rider',   card: '05', model: 'rocket', accent: 0xff7417, baseSpeed: 56, halfWidth: .7,  special: 'rocketBoost', upgradePrices: [120, 240, 360] },
  { key: '25-lightning-bolt', name: 'Lightning Bolt', card: '25', model: 'bolt',   accent: 0x1d57d6, baseSpeed: 66, halfWidth: .65, special: 'lightning',   upgradePrices: [145, 285, 430] },
];

export const carImage = (car: CarDef) => `cars/${car.key}.webp`;

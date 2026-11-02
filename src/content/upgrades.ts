/* The four upgrades every car has. Prices live on each car in cars.ts. */
export type UpgradeKey = 'engine' | 'wheels' | 'wings' | 'boost';

export interface UpgradeDef {
  key: UpgradeKey;
  name: string;
  text: string;
}

export const MAX_LEVEL = 3;

export const UPGRADES: readonly UpgradeDef[] = [
  { key: 'engine', name: 'Engine', text: 'Launch faster and higher.' },
  { key: 'wheels', name: 'Wheels', text: 'Bigger tyres. Bounce and roll further.' },
  { key: 'wings',  name: 'Wings',  text: 'Glide longer on the way down.' },
  { key: 'boost',  name: 'Boost',  text: 'Hold BOOST in the air for a push.' },
];

/* Coins earned per launch */
export const REWARDS = {
  perMetre: 1,
  perCoin: 5,
  minimum: 5,   // every launch earns something, even a crash at the start
};

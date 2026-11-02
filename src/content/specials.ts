/* The one-use action button each car has.
   effect is what the game rules do with it; the rest is what the player sees. */
export type SpecialEffect =
  | { kind: 'swerve' }                 // curve round the next bus/building through its gap
  | { kind: 'burn'; seconds: number }  // flames push the car forward for a while
  | { kind: 'smash' }                  // break through the next obstacle you hit
  | { kind: 'zap' };                   // lightning destroys the obstacle ahead

export interface Special {
  id: string;
  name: string;
  text: string;
  effect: SpecialEffect;
}

export const SPECIALS = {
  swerve:      { id: 'swerve',      name: 'Swerve',           text: 'Tap in the air to curve round the next building.', effect: { kind: 'swerve' } },
  flameBoost:  { id: 'flameBoost',  name: 'Flame Boost',      text: 'Tap in the air for a short blast of flames.',      effect: { kind: 'burn', seconds: 1.3 } },
  chomp:       { id: 'chomp',       name: 'Chomp',            text: 'Bites straight through one building, then carries on.', effect: { kind: 'smash' } },
  stomp:       { id: 'stomp',       name: 'Stomp',            text: 'Stomps straight through one building, then carries on.', effect: { kind: 'smash' } },
  rocketBoost: { id: 'rocketBoost', name: 'Rocket Boost',     text: 'Tap in the air for a two-second rocket blast.',    effect: { kind: 'burn', seconds: 2.0 } },
  lightning:   { id: 'lightning',   name: 'Lightning Strike', text: 'Zaps the next building out of the way.',           effect: { kind: 'zap' } },
} satisfies Record<string, Special>;

export type SpecialId = keyof typeof SPECIALS;

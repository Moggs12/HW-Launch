/* Seeded random numbers (Park–Miller), so the city is the same every time. */
export function makeRng(seed: number) {
  let s = seed;
  return () => (s = (s * 16807) % 2147483647) / 2147483647;
}
export type Rng = ReturnType<typeof makeRng>;

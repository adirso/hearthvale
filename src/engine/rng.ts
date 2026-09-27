// Small seeded PRNG (mulberry32). The generator state is stored in the game
// state so that saved games replay deterministically after a reload.

export interface RngHolder {
  rngState: number;
}

export function nextRandom(holder: RngHolder): number {
  let t = (holder.rngState = (holder.rngState + 0x6d2b79f5) | 0);
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

export function randomInt(holder: RngHolder, maxExclusive: number): number {
  return Math.floor(nextRandom(holder) * maxExclusive);
}

export function shuffle<T>(holder: RngHolder, items: T[]): T[] {
  const out = items.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = randomInt(holder, i + 1);
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

export function randomSeed(): number {
  return (Math.random() * 0xffffffff) >>> 0;
}

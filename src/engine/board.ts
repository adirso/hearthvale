import { PORT_DECK, TERRAIN_DECK, TOKEN_DECK } from './constants';
import { TOPOLOGY } from './geometry';
import { randomInt, shuffle, type RngHolder } from './rng';
import type { Hex, Port } from './types';

/** Tokens that may not sit next to each other (the two most frequent rolls). */
const HOT_TOKENS = new Set([6, 8]);

export function isValidLayout(hexes: Hex[]): boolean {
  if (hexes.length !== 19) return false;
  if (hexes.filter((h) => h.terrain === 'waste').length !== 1) return false;
  for (const h of hexes) {
    if ((h.terrain === 'waste') !== (h.token === null)) return false;
    if (h.token !== null && HOT_TOKENS.has(h.token)) {
      for (const n of TOPOLOGY.hexNeighbors[h.id]) {
        const t = hexes[n].token;
        if (t !== null && HOT_TOKENS.has(t)) return false;
      }
    }
  }
  return true;
}

export function generateHexes(rng: RngHolder): Hex[] {
  for (let attempt = 0; attempt < 1000; attempt++) {
    const terrains = shuffle(rng, TERRAIN_DECK);
    const tokens = shuffle(rng, TOKEN_DECK);
    let t = 0;
    const hexes: Hex[] = TOPOLOGY.hexCoords.map(({ q, r }, id) => {
      const terrain = terrains[id];
      return { id, q, r, terrain, token: terrain === 'waste' ? null : tokens[t++] };
    });
    if (isValidLayout(hexes)) return hexes;
  }
  throw new Error('Could not generate a valid island layout');
}

/**
 * Nine harbors spread around the 30 coastal edges. Offsets are spaced so that
 * no two harbors share an intersection.
 */
const PORT_OFFSETS = [0, 3, 7, 10, 13, 17, 20, 23, 27];

export function generatePorts(rng: RngHolder): Port[] {
  const coast = TOPOLOGY.coastEdges;
  const rotation = randomInt(rng, coast.length);
  const kinds = shuffle(rng, PORT_DECK);
  return PORT_OFFSETS.map((offset, i) => ({
    edge: coast[(offset + rotation) % coast.length],
    resource: kinds[i],
  }));
}

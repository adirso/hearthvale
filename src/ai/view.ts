// What a player may legitimately know. The AI decides only from this view,
// so it cannot peek at rivals' hands, their development cards or the deck,
// even by accident.

import { bag, pips, RESOURCES, totalCards, TOPOLOGY, type GameState, type ResourceBag } from '../engine';

/**
 * A rival's likely hand from public information only: the exact hand size
 * (public), split by how much of each resource that rival produces.
 */
export function estimateHand(state: GameState, player: number): ResourceBag {
  const size = totalCards(state.players[player].resources);
  const weight = bag();
  state.buildings.forEach((b, v) => {
    if (!b || b.owner !== player) return;
    for (const h of TOPOLOGY.vertexHexes[v]) {
      const hex = state.hexes[h];
      if (hex.terrain !== 'waste') weight[hex.terrain] += pips(hex.token) * (b.kind === 'city' ? 2 : 1);
    }
  });
  const total = totalCards(weight);
  const shares = RESOURCES.map((r) => (total > 0 ? (weight[r] / total) * size : size / RESOURCES.length));
  // Largest-remainder rounding keeps the estimate's size equal to the real one.
  const out = bag();
  RESOURCES.forEach((r, i) => (out[r] = Math.floor(shares[i])));
  let left = size - totalCards(out);
  const byRemainder = RESOURCES.map((r, i) => ({ r, rem: shares[i] - Math.floor(shares[i]) })).sort((a, b) => b.rem - a.rem);
  for (let i = 0; left > 0; i++, left--) out[byRemainder[i % byRemainder.length].r]++;
  return out;
}

/** A copy of `state` with everything hidden from `viewer` replaced by public estimates. */
export function playerView(state: GameState, viewer: number): GameState {
  const view: GameState = structuredClone(state);
  view.players = view.players.map((p) => {
    if (p.id === viewer) return p;
    return {
      ...p,
      resources: estimateHand(state, p.id),
      // Only the number of cards is public; the placeholder is never read as a real card.
      devCards: p.devCards.map(() => 'warden' as const),
      newDevCards: p.newDevCards.map(() => 'warden' as const),
    };
  });
  view.devDeck = view.devDeck.map(() => 'warden' as const);
  // The dice generator's state would reveal future rolls.
  view.rngState = 0;
  const steal = view.lastSteal;
  if (steal && steal.thief !== viewer && steal.victim !== viewer) view.lastSteal = { ...steal, resource: 'timber' };
  return view;
}

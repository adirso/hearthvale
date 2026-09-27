import { describe, expect, it } from 'vitest';
import { acceptsTrade, chooseAction } from '../src/ai/ai';
import { simulateGame } from '../src/ai/simulate';
import {
  actingPlayers,
  applyAction,
  bag,
  createGame,
  legalSetupSettlementVertices,
  pips,
  TOPOLOGY,
  type GameState,
} from '../src/engine';
import { give, mainPhaseGame, placeSettlement, TEST_PLAYERS } from './helpers';

const vertexPips = (s: GameState, v: number) => TOPOLOGY.vertexHexes[v].reduce((t, h) => t + pips(s.hexes[h].token), 0);

describe('AI opponents', () => {
  it('opens on a high-yield intersection', () => {
    for (let seed = 1; seed <= 20; seed++) {
      const s = createGame({
        seed,
        firstPlayer: 0,
        players: TEST_PLAYERS.map((p) => ({ ...p, isHuman: false, difficulty: 'intermediate' as const })),
      });
      const action = chooseAction(s, 0);
      expect(action.type).toBe('placeSetupSettlement');
      const all = legalSetupSettlementVertices(s).map((v) => vertexPips(s, v)).sort((a, b) => b - a);
      const chosen = vertexPips(s, (action as { vertex: number }).vertex);
      // Within the top quarter of all openings by production probability.
      expect(chosen).toBeGreaterThanOrEqual(all[Math.floor(all.length / 4)]);
    }
  });

  it('never sends the raider onto its own buildings when it has a choice', () => {
    const s = mainPhaseGame();
    s.players[0].isHuman = false;
    s.players[0].difficulty = 'intermediate';
    s.phase = 'moveRaider';
    const target = s.hexes.find((h) => h.token === 8 || h.token === 6)!;
    placeSettlement(s, 0, TOPOLOGY.hexVertices[target.id][0]);
    placeSettlement(s, 1, TOPOLOGY.hexVertices[target.id][3]);
    const action = chooseAction(s, 0);
    expect(action.type).toBe('moveRaider');
    const hex = (action as { hex: number }).hex;
    expect(TOPOLOGY.hexVertices[hex].some((v) => s.buildings[v]?.owner === 0)).toBe(false);
  });

  it('refuses trades that do not help, and anyone about to win', () => {
    const s = mainPhaseGame();
    s.players[1].difficulty = 'intermediate';
    give(s, 1, { stone: 3, clay: 1 });
    // With no board presence Bram saves for a development card; fleece helps, stone is surplus.
    expect(acceptsTrade(s, 1, bag({ timber: 1, fleece: 1 }), bag({ stone: 1 }))).toBe(true);
    // A swap that brings it no closer to its goal is refused.
    expect(acceptsTrade(s, 1, bag({ stone: 1 }), bag({ clay: 1 }))).toBe(false);
    // Cannot pay what it does not have.
    expect(acceptsTrade(s, 1, bag({ timber: 3 }), bag({ harvest: 1 }))).toBe(false);
    for (let v = 0, n = 0; n < 8; v += 7, n++) placeSettlement(s, 0, v);
    expect(acceptsTrade(s, 1, bag({ timber: 1, fleece: 1 }), bag({ stone: 1 }))).toBe(false);
  });

  it('resumes deterministically from a serialized save at every step', () => {
    const reference = simulateGame(77, ['intermediate', 'basic', 'intermediate']);
    let state = createGame({
      seed: 77,
      players: ['intermediate', 'basic', 'intermediate'].map((difficulty, i) => ({
        name: `AI ${i + 1}`,
        isHuman: false,
        difficulty: difficulty as 'basic' | 'intermediate',
        color: ['#b03a2e', '#1f618d', '#b7950b'][i],
      })),
    });
    let steps = 0;
    while (state.phase !== 'gameOver' && steps++ < 20000) {
      state = JSON.parse(JSON.stringify(state)) as GameState; // what localStorage does
      const actor = actingPlayers(state)[0];
      state = applyAction(state, actor, chooseAction(state, actor));
    }
    expect(state.winner).toBe(reference.winner);
    expect(state.turn).toBe(reference.turns);
  });
});

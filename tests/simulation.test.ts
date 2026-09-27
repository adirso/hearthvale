import { describe, expect, it } from 'vitest';
import { simulateGame } from '../src/ai/simulate';
import { victoryPoints, type Difficulty } from '../src/engine';

const LINEUPS: Difficulty[][] = [
  ['intermediate', 'intermediate', 'intermediate'],
  ['basic', 'basic', 'basic'],
  ['basic', 'intermediate', 'intermediate'],
  ['intermediate', 'basic', 'basic'],
];

describe('full AI games', () => {
  it('always reach a winner with 10+ points without getting stuck', () => {
    const turns: number[] = [];
    const wins: Record<Difficulty, number> = { basic: 0, intermediate: 0 };
    const totals: Record<string, number> = {};
    for (let seed = 1; seed <= 60; seed++) {
      const lineup = LINEUPS[seed % LINEUPS.length];
      const result = simulateGame(seed, lineup);
      expect(result.state.phase, `seed ${seed} did not finish`).toBe('gameOver');
      expect(result.winner).not.toBeNull();
      expect(victoryPoints(result.state, result.winner!)).toBeGreaterThanOrEqual(10);
      turns.push(result.turns);
      for (const [k, v] of Object.entries(result.actionCounts)) totals[k] = (totals[k] ?? 0) + v;
      if (lineup[0] !== lineup[1] || lineup[1] !== lineup[2]) wins[lineup[result.winner!]]++;
    }
    const avg = turns.reduce((a, b) => a + b, 0) / turns.length;
    console.log(`avg turns ${avg.toFixed(1)}, max ${Math.max(...turns)}, mixed-lineup wins`, wins);
    console.log(totals);
    // The opponents exercise every part of the game, not just a subset.
    for (const type of [
      "buildRoad", "buildSettlement", "buildCity", "buyDevCard", "playWarden", "playEmbargo",
      "playBounty", "playSurveyor", "placeFreeRoad", "bankTrade", "moveRaider", "steal", "discard",
    ]) expect(totals[type] ?? 0, type).toBeGreaterThan(0);
  }, 120_000);
});

// Headless full-game runner used by tests to prove AI games reach a winner.

import { actingPlayers, applyAction, createGame, type Difficulty, type GameState } from '../engine';
import { chooseAction } from './ai';

export interface SimulationResult {
  state: GameState;
  actions: number;
  turns: number;
  actionCounts: Record<string, number>;
  winner: number | null;
}

export function simulateGame(seed: number, difficulties: Difficulty[], maxActions = 20000): SimulationResult {
  let state = createGame({
    seed,
    players: difficulties.map((difficulty, i) => ({
      name: `AI ${i + 1}`,
      isHuman: false,
      difficulty,
      color: ['#b03a2e', '#1f618d', '#b7950b'][i % 3],
    })),
  });
  let actions = 0;
  const actionCounts: Record<string, number> = {};
  while (state.phase !== 'gameOver' && actions < maxActions) {
    const actor = actingPlayers(state)[0];
    const action = chooseAction(state, actor);
    actionCounts[action.type] = (actionCounts[action.type] ?? 0) + 1;
    state = applyAction(state, actor, action);
    actions++;
  }
  return { state, actions, turns: state.turn, actionCounts, winner: state.winner };
}

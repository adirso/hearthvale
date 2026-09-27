import { createGame, type Difficulty, type GameState } from '../engine';
import type { Prefs } from './storage';

/** Player colours chosen to stand out against every terrain. */
export const PLAYER_COLORS = [
  { id: 'crimson', label: 'Crimson', hex: '#d64541' },
  { id: 'azure', label: 'Azure', hex: '#2e86de' },
  { id: 'violet', label: 'Violet', hex: '#8e44ad' },
  { id: 'amber', label: 'Amber', hex: '#e67e22' },
  { id: 'ivory', label: 'Ivory', hex: '#f4f1e8' },
  { id: 'slate', label: 'Slate', hex: '#34495e' },
] as const;

export const RIVAL_NAMES = ['Maren', 'Tobin'] as const;

export function colorHex(id: string): string {
  return (PLAYER_COLORS.find((c) => c.id === id) ?? PLAYER_COLORS[0]).hex;
}

/** Seat order is fixed (you, Maren, Tobin); `firstPlayer` picks who places first. */
export function newGameFrom(prefs: Prefs, seed?: number): GameState {
  const rivalDifficulty: [Difficulty, Difficulty] =
    prefs.difficulty === 'mixed' ? ['basic', 'intermediate'] : [prefs.difficulty, prefs.difficulty];
  const humanColor = colorHex(prefs.color);
  const rivalColors = PLAYER_COLORS.map((c) => c.hex).filter((h) => h !== humanColor);
  const first = { random: undefined, you: 0, maren: 1, tobin: 2 }[prefs.firstPlayer];
  return createGame({
    seed,
    firstPlayer: first,
    players: [
      { name: prefs.name, isHuman: true, difficulty: 'intermediate', color: humanColor },
      { name: RIVAL_NAMES[0], isHuman: false, difficulty: rivalDifficulty[0], color: rivalColors[0] },
      { name: RIVAL_NAMES[1], isHuman: false, difficulty: rivalDifficulty[1], color: rivalColors[1] },
    ],
  });
}

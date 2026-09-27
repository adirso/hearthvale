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

export const RIVAL_NAMES = ['Maren', 'Tobin', 'Ilsa'] as const;

export function colorHex(id: string): string {
  return (PLAYER_COLORS.find((c) => c.id === id) ?? PLAYER_COLORS[0]).hex;
}

/** Seat 0 is you, then rivals in RIVAL_NAMES order; `firstPlayer` picks who places first. */
export function newGameFrom(prefs: Prefs, seed?: number): GameState {
  const rivals = prefs.playerCount - 1;
  // "Mixed" alternates basic and intermediate rivals.
  const rivalDifficulty = (i: number): Difficulty =>
    prefs.difficulty === 'mixed' ? (i % 2 === 0 ? 'basic' : 'intermediate') : prefs.difficulty;
  const humanColor = colorHex(prefs.color);
  const rivalColors = PLAYER_COLORS.map((c) => c.hex).filter((h) => h !== humanColor);
  return createGame({
    seed,
    firstPlayer: firstSeat(prefs),
    players: [
      { name: prefs.name, isHuman: true, difficulty: 'intermediate', color: humanColor },
      ...Array.from({ length: rivals }, (_, i) => ({
        name: RIVAL_NAMES[i],
        isHuman: false,
        difficulty: rivalDifficulty(i),
        color: rivalColors[i],
      })),
    ],
  });
}

/** Seat index of the first player, or undefined for random. */
export function firstSeat(prefs: Prefs): number | undefined {
  if (prefs.firstPlayer === 'random') return undefined;
  const seat = prefs.firstPlayer === 'you' ? 0 : Number(prefs.firstPlayer.replace('rival', ''));
  return seat < prefs.playerCount ? seat : undefined;
}

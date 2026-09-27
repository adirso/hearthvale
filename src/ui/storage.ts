import type { GameState } from '../engine';

const SAVE_KEY = 'hearthvale.save.v1';
const PREFS_KEY = 'hearthvale.prefs.v1';

export interface Prefs {
  name: string;
  difficulty: 'basic' | 'intermediate' | 'mixed';
  speed: 'relaxed' | 'normal' | 'fast';
  sound: boolean;
  /** Id from PLAYER_COLORS. */
  color: string;
  playerCount: 3 | 4;
  firstPlayer: 'random' | 'you' | 'rival1' | 'rival2' | 'rival3';
}

export const DEFAULT_PREFS: Prefs = { name: 'You', difficulty: 'intermediate', speed: 'normal', sound: true, color: 'crimson', playerCount: 3, firstPlayer: 'random' };

export function saveGame(state: GameState) {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(state));
  } catch {
    // Storage may be full or unavailable (private mode); the game still runs.
  }
}

export function loadGame(): GameState | null {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const state = JSON.parse(raw) as GameState;
    if (state?.version !== 1 || !Array.isArray(state.hexes) || state.hexes.length !== 19) return null;
    return state;
  } catch {
    return null;
  }
}

export function clearGame() {
  try {
    localStorage.removeItem(SAVE_KEY);
  } catch {
    /* ignore */
  }
}

export function loadPrefs(): Prefs {
  try {
    const raw = localStorage.getItem(PREFS_KEY);
    if (!raw) return DEFAULT_PREFS;
    const prefs = { ...DEFAULT_PREFS, ...(JSON.parse(raw) as Partial<Prefs>) };
    // Older saves named rivals directly.
    const legacy: Record<string, Prefs['firstPlayer']> = { maren: 'rival1', tobin: 'rival2' };
    prefs.firstPlayer = legacy[prefs.firstPlayer] ?? prefs.firstPlayer;
    if (prefs.playerCount !== 3 && prefs.playerCount !== 4) prefs.playerCount = 3;
    return prefs;
  } catch {
    return DEFAULT_PREFS;
  }
}

export function savePrefs(prefs: Prefs) {
  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
  } catch {
    /* ignore */
  }
}

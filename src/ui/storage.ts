import type { GameState } from '../engine';

const SAVE_KEY = 'hearthvale.save.v1';
const PREFS_KEY = 'hearthvale.prefs.v1';

export interface Prefs {
  name: string;
  difficulty: 'basic' | 'intermediate' | 'mixed';
  speed: 'relaxed' | 'normal' | 'fast';
}

export const DEFAULT_PREFS: Prefs = { name: 'You', difficulty: 'intermediate', speed: 'normal' };

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
    return raw ? { ...DEFAULT_PREFS, ...(JSON.parse(raw) as Partial<Prefs>) } : DEFAULT_PREFS;
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

import { useCallback, useEffect, useRef, useState } from 'react';
import { chooseAction } from '../ai/ai';
import { actingPlayers, applyAction, IllegalActionError, type Action, type GameState } from '../engine';
import { saveGame, type Prefs } from './storage';

const SPEED_FACTOR: Record<Prefs['speed'], number> = { relaxed: 1.6, normal: 1, fast: 0.35 };

/** How long a development card reveal stays on screen. */
export function revealDuration(speed: Prefs['speed']): number {
  return Math.min(4200, Math.max(1800, 3200 * SPEED_FACTOR[speed]));
}

function delayFor(action: Action): number {
  switch (action.type) {
    case 'rollDice':
      return 900;
    case 'endTurn':
      return 700;
    case 'placeSetupSettlement':
    case 'placeSetupRoad':
      return 800;
    case 'discard':
      return 500;
    case 'respondToOffer':
      return 650;
    case 'confirmTrade':
    case 'cancelOffer':
      return 850;
    default:
      return 1000;
  }
}

export interface Controller {
  state: GameState;
  humanId: number;
  error: string | null;
  notice: string | null;
  dispatch: (action: Action) => boolean;
  /** Show a short message to the player. */
  announce: (message: string) => void;
  clearMessages: () => void;
}

export function useGameController(initial: GameState, speed: Prefs['speed']): Controller {
  const [state, setState] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const humanId = Math.max(0, state.players.findIndex((p) => p.isHuman));

  useEffect(() => saveGame(state), [state]);

  // The last card play whose reveal rivals have already waited for.
  const revealedCard = useRef(initial.lastCardPlay?.id ?? 0);

  // Drive computer opponents one action at a time, with a pause between steps.
  useEffect(() => {
    if (state.phase === 'gameOver') return;
    const actor = actingPlayers(state).find((p) => !state.players[p].isHuman);
    if (actor === undefined) return;
    const action = chooseAction(state, actor);
    const cardId = state.lastCardPlay?.id ?? 0;
    // Let a freshly played card's reveal finish before the next move.
    const wait = cardId !== revealedCard.current ? revealDuration(speed) : 0;
    const timer = setTimeout(() => {
      revealedCard.current = cardId;
      setState((current) => (current === state ? applyAction(current, actor, action) : current));
    }, wait + delayFor(action) * SPEED_FACTOR[speed]);
    return () => clearTimeout(timer);
  }, [state, speed]);

  const dispatch = useCallback(
    (action: Action) => {
      try {
        setState(applyAction(state, humanId, action));
        setError(null);
        return true;
      } catch (e) {
        if (e instanceof IllegalActionError) {
          setError(e.message);
          return false;
        }
        throw e;
      }
    },
    [state, humanId],
  );

  const clearMessages = useCallback(() => {
    setError(null);
    setNotice(null);
  }, []);

  return { state, humanId, error, notice, dispatch, announce: setNotice, clearMessages };
}

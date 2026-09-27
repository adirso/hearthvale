import { useCallback, useEffect, useState } from 'react';
import { chooseAction, tradeResponse, type TradeResponse } from '../ai/ai';
import { actingPlayers, applyAction, IllegalActionError, type Action, type GameState, type ResourceBag } from '../engine';
import { saveGame, type Prefs } from './storage';

const SPEED_FACTOR: Record<Prefs['speed'], number> = { relaxed: 1.6, normal: 1, fast: 0.35 };

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
  /** Every rival's answer to an offer, keyed by player id. Nothing changes hands yet. */
  askRivals: (give: ResourceBag, get: ResourceBag) => Record<number, TradeResponse>;
  /** Complete the trade with one rival who accepted. */
  tradeWith: (partner: number, give: ResourceBag, get: ResourceBag) => boolean;
  clearMessages: () => void;
}

export function useGameController(initial: GameState, speed: Prefs['speed']): Controller {
  const [state, setState] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const humanId = Math.max(0, state.players.findIndex((p) => p.isHuman));

  useEffect(() => saveGame(state), [state]);

  // Drive computer opponents one action at a time, with a pause between steps.
  useEffect(() => {
    if (state.phase === 'gameOver') return;
    const actor = actingPlayers(state).find((p) => !state.players[p].isHuman);
    if (actor === undefined) return;
    const action = chooseAction(state, actor);
    const timer = setTimeout(() => {
      setState((current) => (current === state ? applyAction(current, actor, action) : current));
    }, delayFor(action) * SPEED_FACTOR[speed]);
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

  const askRivals = useCallback(
    (give: ResourceBag, get: ResourceBag) => {
      const answers: Record<number, TradeResponse> = {};
      for (const p of state.players) if (p.id !== humanId) answers[p.id] = tradeResponse(state, p.id, give, get);
      return answers;
    },
    [state, humanId],
  );

  const tradeWith = useCallback(
    (partner: number, give: ResourceBag, get: ResourceBag) => {
      const name = state.players[partner].name;
      // Re-check against the current state in case anything changed since asking.
      if (!tradeResponse(state, partner, give, get).accept) {
        setNotice(`${name} no longer accepts that offer.`);
        return false;
      }
      const ok = dispatch({ type: 'playerTrade', partner, give, get });
      if (ok) setNotice(`Traded with ${name}.`);
      return ok;
    },
    [state, dispatch],
  );

  const clearMessages = useCallback(() => {
    setError(null);
    setNotice(null);
  }, []);

  return { state, humanId, error, notice, dispatch, askRivals, tradeWith, clearMessages };
}

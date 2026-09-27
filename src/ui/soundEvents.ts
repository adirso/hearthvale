import { totalCards, type GameState } from '../engine';
import type { SoundName } from './sound';

export interface SoundCue {
  name: SoundName;
  delay: number;
}

const count = (s: GameState, kind: 'settlement' | 'city') => s.buildings.filter((b) => b?.kind === kind).length;
const roads = (s: GameState) => s.roads.filter((r) => r !== null).length;

/** Sounds describing what changed between two consecutive states. Works for every player's moves. */
export function soundCues(prev: GameState, next: GameState, humanId: number): SoundCue[] {
  const cues: SoundCue[] = [];
  const add = (name: SoundName, delay = 0) => cues.push({ name, delay });

  if (!prev.hasRolled && next.hasRolled && next.dice) {
    add('dice');
    const sum = next.dice[0] + next.dice[1];
    if (sum !== 7 && totalCards(next.players[humanId].resources) > totalCards(prev.players[humanId].resources)) {
      add('gather', 0.6);
    }
  }

  if (count(next, 'city') > count(prev, 'city')) add('city');
  else if (count(next, 'settlement') > count(prev, 'settlement')) add('settlement');
  if (roads(next) > roads(prev)) add('road');

  if (next.devDeck.length < prev.devDeck.length) add('buyCard');
  const play = next.lastCardPlay;
  if (play && play.id !== (prev.lastCardPlay?.id ?? 0)) {
    add('playCard');
    add(play.card, 0.35);
  } else if (!prev.devCardPlayedThisTurn && next.devCardPlayedThisTurn) add('playCard');
  if (next.tradesThisTurn > prev.tradesThisTurn) add('trade');
  const offer = next.tradeOffer;
  if (offer && offer.id !== prev.tradeOffer?.id && offer.from !== humanId) add('offer');

  if (next.raiderHex !== prev.raiderHex) add('raider');
  if (prev.phase === 'moveRaider' || prev.phase === 'steal') {
    const thief = prev.currentPlayer;
    const robbed = prev.players.some(
      (p) => p.id !== thief && totalCards(next.players[p.id].resources) < totalCards(p.resources),
    );
    if (robbed) add('steal', 0.35);
  }
  if (prev.phase === 'discard' && Object.keys(next.pendingDiscards).length < Object.keys(prev.pendingDiscards).length) {
    add('discard');
  }

  if (next.phase === 'gameOver' && prev.phase !== 'gameOver') {
    add(next.winner === humanId ? 'victory' : 'defeat', 0.3);
  } else if (next.currentPlayer === humanId && prev.currentPlayer !== humanId) {
    add('yourTurn', cues.length ? 0.4 : 0);
  }
  return cues;
}

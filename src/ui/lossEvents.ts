import { bag, RESOURCE_LABEL, RESOURCES, totalCards, type GameState, type Resource, type ResourceBag } from '../engine';

export interface Loss {
  cards: ResourceBag;
  /** Who received the cards: a player id, or the bank. */
  to: number | 'bank';
  message: string;
}

/** Cards the human lost between two consecutive states, and where they went. */
export function lossesFor(prev: GameState, next: GameState, humanId: number): Loss[] {
  const out: Loss[] = [];
  const name = (id: number) => next.players[id].name;

  const steal = next.lastSteal;
  if (steal && steal.id !== (prev.lastSteal?.id ?? 0) && steal.victim === humanId) {
    const cards = bag({ [steal.resource]: 1 });
    out.push({ cards, to: steal.thief, message: `${name(steal.thief)} robbed you of 1 ${label(steal.resource)}.` });
  }

  const play = next.lastCardPlay;
  if (play && play.id !== (prev.lastCardPlay?.id ?? 0) && play.card === 'embargo' && play.resource) {
    const n = play.taken?.[humanId] ?? 0;
    if (n > 0 && play.player !== humanId) {
      out.push({
        cards: bag({ [play.resource]: n }),
        to: play.player,
        message: `${name(play.player)}'s Embargo took ${n} ${label(play.resource)} from you.`,
      });
    }
  }

  if (prev.pendingDiscards[humanId] !== undefined && next.pendingDiscards[humanId] === undefined) {
    const cards = bag();
    for (const r of RESOURCES) cards[r] = Math.max(0, prev.players[humanId].resources[r] - next.players[humanId].resources[r]);
    if (totalCards(cards) > 0) out.push({ cards, to: 'bank', message: `You gave up ${totalCards(cards)} cards to the raider.` });
  }
  return out;
}

function label(r: Resource) {
  return RESOURCE_LABEL[r];
}

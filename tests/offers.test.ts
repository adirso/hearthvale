import { describe, expect, it } from 'vitest';
import { chooseAction } from '../src/ai/ai';
import { actingPlayers, applyAction, bag, canPlayDevCard, IllegalActionError, type GameState } from '../src/engine';
import { give, mainPhaseGame } from './helpers';

const offer = (s: GameState) => applyAction(s, 0, { type: 'offerTrade', give: bag({ timber: 1 }), get: bag({ stone: 1 }) });

describe('trade offers', () => {
  it('goes to everyone, who answer before the proposer chooses', () => {
    const s = mainPhaseGame();
    give(s, 0, { timber: 2 });
    give(s, 1, { stone: 1 });
    give(s, 2, { stone: 1 });
    let n = offer(s);
    expect(n.tradeOffer).toMatchObject({ id: 1, from: 0, responses: { 1: 'pending', 2: 'pending' } });
    expect(actingPlayers(n)).toEqual([1, 2]);
    n = applyAction(n, 1, { type: 'respondToOffer', player: 1, accept: true, reason: 'Sure.' });
    n = applyAction(n, 2, { type: 'respondToOffer', player: 2, accept: true });
    expect(actingPlayers(n)).toEqual([0]);
    n = applyAction(n, 0, { type: 'confirmTrade', partner: 2 });
    expect(n.tradeOffer).toBeNull();
    expect(n.players[0].resources).toEqual(bag({ timber: 1, stone: 1 }));
    expect(n.players[2].resources).toEqual(bag({ timber: 1 }));
    expect(n.players[1].resources).toEqual(bag({ stone: 1 })); // the other acceptor is untouched
  });

  it('blocks everything else until the offer is settled', () => {
    const s = mainPhaseGame();
    give(s, 0, { timber: 2, clay: 1 });
    s.players[0].devCards = ['bounty'];
    const n = offer(s);
    expect(() => applyAction(n, 0, { type: 'endTurn' })).toThrow(/Settle the open trade offer/);
    expect(() => applyAction(n, 0, { type: 'offerTrade', give: bag({ clay: 1 }), get: bag({ stone: 1 }) })).toThrow(
      IllegalActionError,
    );
    expect(canPlayDevCard(n, 0, 'bounty')).toBe(false);
    const withdrawn = applyAction(n, 0, { type: 'cancelOffer' });
    expect(withdrawn.tradeOffer).toBeNull();
    expect(applyAction(withdrawn, 0, { type: 'endTurn' }).phase).toBe('roll');
  });

  it('rejects impossible answers and partners', () => {
    const s = mainPhaseGame();
    give(s, 0, { timber: 1 });
    let n = offer(s);
    // Player 1 has no stone, so it cannot accept.
    expect(() => applyAction(n, 1, { type: 'respondToOffer', player: 1, accept: true })).toThrow(/do not have/);
    expect(() => applyAction(n, 0, { type: 'respondToOffer', player: 1, accept: false })).toThrow(/themselves/);
    n = applyAction(n, 1, { type: 'respondToOffer', player: 1, accept: false });
    expect(() => applyAction(n, 1, { type: 'respondToOffer', player: 1, accept: false })).toThrow(/already/);
    expect(() => applyAction(n, 0, { type: 'confirmTrade', partner: 1 })).toThrow(/not accepted/);
    expect(() => applyAction(s, 0, { type: 'offerTrade', give: bag({ stone: 1 }), get: bag({ clay: 1 }) })).toThrow(
      /do not have/,
    );
  });

  it('rivals answer offers and settle their own, never stalling', () => {
    const s = mainPhaseGame();
    for (const p of s.players) p.isHuman = false;
    s.players.forEach((p) => (p.difficulty = 'intermediate'));
    give(s, 0, { timber: 2 });
    give(s, 1, { stone: 2 });
    let n = offer(s);
    let guard = 0;
    while (n.tradeOffer && guard++ < 10) {
      const actor = actingPlayers(n)[0];
      n = applyAction(n, actor, chooseAction(n, actor));
    }
    expect(n.tradeOffer).toBeNull();
    expect(n.log.some((l) => /accepts|declines/.test(l.text))).toBe(true);
  });

  it('rivals propose trades when one card short', () => {
    const s = mainPhaseGame();
    s.players[0].isHuman = false;
    s.players[0].difficulty = 'intermediate';
    // No board presence: the goal is a development card (fleece, harvest, stone).
    give(s, 0, { fleece: 1, harvest: 1, clay: 2 });
    const action = chooseAction(s, 0);
    expect(action).toEqual({ type: 'offerTrade', give: bag({ clay: 1 }), get: bag({ stone: 1 }) });
  });
});

import { describe, expect, it } from 'vitest';
import { applyAction, bag, resolveRoll, TOPOLOGY } from '../src/engine';
import { lossesFor } from '../src/ui/lossEvents';
import { give, hexWithToken, mainPhaseGame, placeSettlement } from './helpers';

describe('cards taken from the human', () => {
  it('records the robbery and reports the stolen card to the victim', () => {
    const s = mainPhaseGame();
    s.currentPlayer = 1;
    s.phase = 'moveRaider';
    const hex = hexWithToken(s);
    placeSettlement(s, 0, TOPOLOGY.hexVertices[hex.id][0]);
    give(s, 0, { clay: 1 });
    const next = applyAction(s, 1, { type: 'moveRaider', hex: hex.id });
    expect(next.lastSteal).toEqual({ id: 1, thief: 1, victim: 0, resource: 'clay' });
    expect(lossesFor(s, next, 0)).toEqual([
      { cards: bag({ clay: 1 }), to: 1, message: 'Bram robbed you of 1 Clay.' },
    ]);
    // A robbery between two rivals is not the human's loss.
    expect(lossesFor(s, next, 2)).toEqual([]);
  });

  it('reports what a rival Embargo took, and nothing when you were not hit', () => {
    const s = mainPhaseGame();
    s.currentPlayer = 2;
    s.players[2].devCards = ['embargo'];
    give(s, 0, { stone: 3 });
    const next = applyAction(s, 2, { type: 'playEmbargo', resource: 'stone' });
    expect(lossesFor(s, next, 0)).toEqual([
      { cards: bag({ stone: 3 }), to: 2, message: "Cleo's Embargo took 3 Stone from you." },
    ]);
    const other = applyAction({ ...s, players: s.players.map((p) => ({ ...p, resources: { ...p.resources, stone: 0 } })) }, 2, {
      type: 'playEmbargo',
      resource: 'stone',
    });
    expect(lossesFor(s, other, 1)).toEqual([]);
  });

  it('reports cards you discarded to the bank', () => {
    const s = mainPhaseGame();
    give(s, 0, { timber: 5, fleece: 3 });
    resolveRoll(s, 3, 4);
    const next = applyAction(s, 0, { type: 'discard', player: 0, cards: bag({ timber: 3, fleece: 1 }) });
    expect(lossesFor(s, next, 0)).toEqual([
      { cards: bag({ timber: 3, fleece: 1 }), to: 'bank', message: 'You gave up 4 cards to the raider.' },
    ]);
  });
});

import { describe, expect, it } from 'vitest';
import { chooseAction } from '../src/ai/ai';
import { estimateHand, playerView } from '../src/ai/view';
import { bag, totalCards } from '../src/engine';
import { give, mainPhaseGame, placeSettlement } from './helpers';

describe('AI plays fair', () => {
  function table(rivalHand: Parameters<typeof give>[2]) {
    const s = mainPhaseGame(21);
    s.players.forEach((p) => (p.isHuman = false));
    s.players[0].difficulty = 'intermediate';
    s.players[0].devCards = ['embargo'];
    placeSettlement(s, 1, 10);
    give(s, 1, rivalHand);
    s.players[2].devCards = ['monument', 'monument'];
    // The bank's piles are public; keep them identical so only hidden hands differ.
    s.bank = bag({ timber: 15, clay: 19, fleece: 19, harvest: 19, stone: 15 });
    return s;
  }

  it('hides rivals’ hands, cards, the deck and the dice generator', () => {
    const s = table({ stone: 5 });
    const view = playerView(s, 0);
    expect(totalCards(view.players[1].resources)).toBe(5); // hand size is public
    expect(view.players[1].resources).toEqual(estimateHand(s, 1));
    expect(view.players[2].devCards).toEqual(['warden', 'warden']); // count only
    expect(new Set(view.devDeck)).toEqual(new Set(['warden']));
    expect(view.devDeck).toHaveLength(s.devDeck.length);
    expect(view.rngState).toBe(0);
    expect(view.players[0]).toEqual(s.players[0]); // own information is intact
  });

  it('makes the same decision whatever rivals really hold', () => {
    // Same hand size, completely different contents.
    const a = table({ stone: 5 });
    const b = table({ timber: 5 });
    expect(playerView(a, 0)).toEqual(playerView(b, 0));
    expect(chooseAction(a, 0)).toEqual(chooseAction(b, 0));
  });

  it('hides what was stolen between two other players', () => {
    const s = table({ stone: 1 });
    s.lastSteal = { id: 1, thief: 1, victim: 2, resource: 'stone' };
    expect(playerView(s, 0).lastSteal?.resource).toBe('timber');
    expect(playerView(s, 1).lastSteal?.resource).toBe('stone');
    expect(playerView(s, 2).lastSteal?.resource).toBe('stone');
  });

  it('estimates hands from production, keeping the exact size', () => {
    const s = mainPhaseGame(21);
    placeSettlement(s, 1, 10);
    give(s, 1, { clay: 7 });
    const est = estimateHand(s, 1);
    expect(totalCards(est)).toBe(7);
    expect(estimateHand({ ...s, buildings: s.buildings.map(() => null) }, 1)).toEqual(
      bag({ timber: 2, clay: 2, fleece: 1, harvest: 1, stone: 1 }),
    );
  });
});

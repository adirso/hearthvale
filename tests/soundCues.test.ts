import { describe, expect, it } from 'vitest';
import { applyAction, legalSetupRoadEdges, resolveRoll, TOPOLOGY } from '../src/engine';
import { soundCues } from '../src/ui/soundEvents';
import { give, hexWithToken, mainPhaseGame, newGame, placeSettlement } from './helpers';

const names = (cues: { name: string }[]) => cues.map((c) => c.name);

describe('sound cues', () => {
  it('plays placement sounds during setup, for any player', () => {
    const s0 = newGame(3);
    const s1 = applyAction(s0, 0, { type: 'placeSetupSettlement', vertex: 10 });
    expect(names(soundCues(s0, s1, 0))).toEqual(['settlement']);
    const s2 = applyAction(s1, 0, { type: 'placeSetupRoad', edge: legalSetupRoadEdges(s1)[0] });
    // Road placed, and play passes to the next (non-human) settler: no turn chime.
    expect(names(soundCues(s1, s2, 0))).toEqual(['road']);
  });

  it('plays dice and a gather chime when the human collects', () => {
    const s = mainPhaseGame();
    s.phase = 'roll';
    s.hasRolled = false;
    const hex = hexWithToken(s, (t) => t !== 7);
    placeSettlement(s, 0, TOPOLOGY.hexVertices[hex.id][0]);
    const next = structuredClone(s);
    const d1 = Math.min(6, hex.token! - 1);
    resolveRoll(next, d1, hex.token! - d1);
    expect(names(soundCues(s, next, 0))).toEqual(['dice', 'gather']);
  });

  it('plays city, card, trade and raider sounds', () => {
    const s = mainPhaseGame();
    placeSettlement(s, 0, 20);
    give(s, 0, { harvest: 3, stone: 8, fleece: 1 });
    const city = applyAction(s, 0, { type: 'buildCity', vertex: 20 });
    expect(names(soundCues(s, city, 0))).toEqual(['city']);
    const card = applyAction(city, 0, { type: 'buyDevCard' });
    expect(names(soundCues(city, card, 0))).toEqual(['buyCard']);
    const trade = applyAction(card, 0, { type: 'bankTrade', give: 'stone', get: 'clay' });
    expect(names(soundCues(card, trade, 0))).toEqual(['trade']);

    const robbing = structuredClone(trade);
    robbing.phase = 'moveRaider';
    const target = hexWithToken(robbing);
    placeSettlement(robbing, 1, TOPOLOGY.hexVertices[target.id][2]);
    give(robbing, 1, { timber: 1 });
    const moved = applyAction(robbing, 0, { type: 'moveRaider', hex: target.id });
    expect(names(soundCues(robbing, moved, 0))).toEqual(['raider', 'steal']);
  });

  it('chimes when the turn comes back to the human, and marks the end', () => {
    const s = mainPhaseGame();
    s.currentPlayer = 2;
    const next = applyAction(s, 2, { type: 'endTurn' });
    expect(names(soundCues(s, next, 0))).toEqual(['yourTurn']);

    const win = structuredClone(next);
    win.phase = 'gameOver';
    win.winner = 1;
    expect(names(soundCues(next, win, 0))).toEqual(['defeat']);
    win.winner = 0;
    expect(names(soundCues(next, win, 0))).toEqual(['victory']);
  });

  it('announces each development card with its own sound', () => {
    const s = mainPhaseGame();
    s.players[0].devCards = ['surveyor'];
    placeSettlement(s, 0, 20);
    const next = applyAction(s, 0, { type: 'playSurveyor' });
    expect(names(soundCues(s, next, 0))).toEqual(['playCard', 'surveyor']);
  });
});

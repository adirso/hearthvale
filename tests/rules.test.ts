import { describe, expect, it } from 'vitest';
import {
  applyAction,
  bag,
  EDGE_COUNT,
  IllegalActionError,
  isValidLayout,
  legalRoadEdges,
  legalSettlementVertices,
  legalSetupRoadEdges,
  legalSetupSettlementVertices,
  longestRoadLength,
  produceResources,
  resolveRoll,
  RESOURCES,
  totalCards,
  TOPOLOGY,
  tradeRatio,
  VERTEX_COUNT,
  victoryPoints,
  type GameState,
  type Resource,
  type ResourceBag,
} from '../src/engine';
import { findPath, give, hexWithToken, mainPhaseGame, newGame, placeRoad, placeSettlement } from './helpers';

function expectIllegal(fn: () => unknown, message?: RegExp) {
  expect(fn).toThrow(IllegalActionError);
  if (message) expect(fn).toThrow(message);
}

function expectedProduction(state: GameState, vertex: number, roll: number, multiplier: number): ResourceBag {
  const out = bag();
  for (const h of TOPOLOGY.vertexHexes[vertex]) {
    const hex = state.hexes[h];
    if (hex.token === roll && hex.id !== state.raiderHex && hex.terrain !== 'waste') out[hex.terrain] += multiplier;
  }
  return out;
}

describe('board generation', () => {
  it('builds the classic 19-tile island with correct counts', () => {
    const s = newGame(1);
    expect(s.hexes).toHaveLength(19);
    expect(VERTEX_COUNT).toBe(54);
    expect(EDGE_COUNT).toBe(72);
    const count = (t: string) => s.hexes.filter((h) => h.terrain === t).length;
    expect([count('timber'), count('clay'), count('fleece'), count('harvest'), count('stone'), count('waste')]).toEqual([
      4, 3, 4, 4, 3, 1,
    ]);
    const tokens = s.hexes.map((h) => h.token).filter((t): t is number => t !== null).sort((a, b) => a - b);
    expect(tokens).toEqual([2, 3, 3, 4, 4, 5, 5, 6, 6, 8, 8, 9, 9, 10, 10, 11, 11, 12]);
    expect(s.hexes[s.raiderHex].terrain).toBe('waste');
  });

  it('places nine harbors on the coast without sharing intersections', () => {
    for (let seed = 1; seed <= 30; seed++) {
      const s = newGame(seed);
      expect(s.ports).toHaveLength(9);
      expect(s.ports.filter((p) => p.resource === null)).toHaveLength(4);
      const vertices = s.ports.flatMap((p) => TOPOLOGY.edgeVertices[p.edge]);
      expect(new Set(vertices).size).toBe(18);
      s.ports.forEach((p) => expect(TOPOLOGY.edgeHexes[p.edge]).toHaveLength(1));
    }
  });

  it('randomizes each new game and never puts 6 and 8 next to each other', () => {
    const layouts = new Set<string>();
    for (let seed = 1; seed <= 50; seed++) {
      const s = newGame(seed);
      expect(isValidLayout(s.hexes)).toBe(true);
      layouts.add(s.hexes.map((h) => `${h.terrain}${h.token}`).join());
    }
    expect(layouts.size).toBeGreaterThan(45);
  });
});

describe('initial placement', () => {
  it('snakes the order (reversed in round two) and pays out only for the second settlement', () => {
    let s = newGame(7);
    const order: number[] = [];
    const secondSettlements: number[] = [];
    for (let i = 0; i < 6; i++) {
      order.push(s.currentPlayer);
      const v = legalSetupSettlementVertices(s)[i * 7];
      const before = totalCards(s.players[s.currentPlayer].resources);
      s = applyAction(s, s.currentPlayer, { type: 'placeSetupSettlement', vertex: v });
      const after = totalCards(s.players[s.currentPlayer].resources);
      const producing = TOPOLOGY.vertexHexes[v].filter((h) => s.hexes[h].terrain !== 'waste').length;
      if (i < 3) expect(after).toBe(before);
      else {
        expect(after - before).toBe(producing);
        secondSettlements.push(v);
      }
      s = applyAction(s, s.currentPlayer, { type: 'placeSetupRoad', edge: legalSetupRoadEdges(s)[0] });
    }
    expect(order).toEqual([0, 1, 2, 2, 1, 0]);
    expect(s.phase).toBe('roll');
    expect(s.currentPlayer).toBe(0);
    expect(secondSettlements).toHaveLength(3);
  });

  it('requires the setup road to touch the settlement just placed', () => {
    let s = newGame(3);
    const v = legalSetupSettlementVertices(s)[0];
    s = applyAction(s, 0, { type: 'placeSetupSettlement', vertex: v });
    const far = [...Array(EDGE_COUNT).keys()].find((e) => !TOPOLOGY.edgeVertices[e].includes(v))!;
    expectIllegal(() => applyAction(s, 0, { type: 'placeSetupRoad', edge: far }), /touch/);
    expectIllegal(() => applyAction(s, 0, { type: 'placeSetupSettlement', vertex: 30 }), /road next/);
  });

  it('enforces the distance rule during setup', () => {
    let s = newGame(3);
    const v = 10;
    s = applyAction(s, 0, { type: 'placeSetupSettlement', vertex: v });
    s = applyAction(s, 0, { type: 'placeSetupRoad', edge: legalSetupRoadEdges(s)[0] });
    for (const n of TOPOLOGY.vertexNeighbors[v]) {
      expect(legalSetupSettlementVertices(s)).not.toContain(n);
      expectIllegal(() => applyAction(s, 1, { type: 'placeSetupSettlement', vertex: n }), /Too close/);
    }
    expectIllegal(() => applyAction(s, 1, { type: 'placeSetupSettlement', vertex: v }));
  });
});

describe('resource production', () => {
  it('gives 1 per settlement and 2 per city on matching tiles', () => {
    const s = mainPhaseGame(11);
    const hex = hexWithToken(s, (t) => t !== 7);
    const [v0, , , v3] = TOPOLOGY.hexVertices[hex.id];
    placeSettlement(s, 0, v0);
    placeSettlement(s, 1, v3, 'city');
    const exp0 = expectedProduction(s, v0, hex.token!, 1);
    const exp1 = expectedProduction(s, v3, hex.token!, 2);
    const got = produceResources(s, hex.token!);
    expect(got[0]).toEqual(exp0);
    expect(got[1]).toEqual(exp1);
    expect(got[1][hex.terrain as Resource]).toBeGreaterThanOrEqual(2);
    expect(s.players[0].resources).toEqual(exp0);
    expect(totalCards(got[2])).toBe(0);
  });

  it('produces nothing from the tile holding the raider', () => {
    const s = mainPhaseGame(11);
    const hex = hexWithToken(s);
    const v = TOPOLOGY.hexVertices[hex.id][0];
    placeSettlement(s, 0, v);
    s.raiderHex = hex.id;
    const got = produceResources(s, hex.token!);
    expect(got[0]).toEqual(expectedProduction(s, v, hex.token!, 1));
    expect(got[0][hex.terrain as Resource]).toBe(
      expectedProduction(s, v, hex.token!, 1)[hex.terrain as Resource],
    );
    // The blocked tile itself contributes nothing.
    const withoutRaider = { ...s, raiderHex: -1 };
    expect(totalCards(expectedProduction(withoutRaider as GameState, v, hex.token!, 1))).toBeGreaterThan(
      totalCards(got[0]),
    );
  });

  it('applies the bank shortage rule', () => {
    const s = mainPhaseGame(11);
    const hex = hexWithToken(s);
    const r = hex.terrain as Resource;
    const [v0, , , v3] = TOPOLOGY.hexVertices[hex.id];
    placeSettlement(s, 0, v0);
    placeSettlement(s, 1, v3);
    const need = expectedProduction(s, v0, hex.token!, 1)[r] + expectedProduction(s, v3, hex.token!, 1)[r];
    s.bank[r] = need - 1;
    const got = produceResources(s, hex.token!);
    expect(got[0][r]).toBe(0);
    expect(got[1][r]).toBe(0);

    // A single claimant takes what is left.
    const s2 = mainPhaseGame(11);
    placeSettlement(s2, 0, v0, 'city');
    s2.bank[r] = 1;
    expect(produceResources(s2, hex.token!)[0][r]).toBe(1);
  });

  it('rolls two dice in the valid range and moves to the main phase', () => {
    let s = mainPhaseGame(5);
    s.phase = 'roll';
    s.hasRolled = false;
    for (let i = 0; i < 20; i++) {
      const next = applyAction({ ...s, rngState: s.rngState + i }, 0, { type: 'rollDice' });
      const [a, b] = next.dice!;
      expect(a).toBeGreaterThanOrEqual(1);
      expect(a).toBeLessThanOrEqual(6);
      expect(b).toBeGreaterThanOrEqual(1);
      expect(b).toBeLessThanOrEqual(6);
      expect(['main', 'moveRaider', 'discard']).toContain(next.phase);
    }
    s = applyAction(s, 0, { type: 'rollDice' });
    expectIllegal(() => applyAction(s, 0, { type: 'rollDice' }));
  });
});

describe('building rules', () => {
  it('requires a connecting road and respects the distance rule for settlements', () => {
    const s = mainPhaseGame();
    const path = findPath(2);
    const [a, b, c] = path.vertices;
    placeSettlement(s, 0, a);
    placeRoad(s, 0, path.edges[0]);
    placeRoad(s, 0, path.edges[1]);
    give(s, 0, { timber: 2, clay: 2, fleece: 2, harvest: 2 });
    const legal = legalSettlementVertices(s, 0);
    expect(legal).not.toContain(b); // next to own settlement
    expect(legal).toContain(c);
    expectIllegal(() => applyAction(s, 0, { type: 'buildSettlement', vertex: b }));
    const unconnected = [...Array(VERTEX_COUNT).keys()].find(
      (v) => !TOPOLOGY.vertexEdges[v].some((e) => s.roads[e] === 0) && !s.buildings[v],
    )!;
    expectIllegal(() => applyAction(s, 0, { type: 'buildSettlement', vertex: unconnected }));
    const next = applyAction(s, 0, { type: 'buildSettlement', vertex: c });
    expect(next.buildings[c]).toEqual({ owner: 0, kind: 'settlement' });
    expect(next.players[0].resources).toEqual(bag({ timber: 1, clay: 1, fleece: 1, harvest: 1 }));
  });

  it('charges the correct costs and rejects unaffordable builds', () => {
    const s = mainPhaseGame();
    const v = 20;
    placeSettlement(s, 0, v);
    const edge = TOPOLOGY.vertexEdges[v][0];
    expectIllegal(() => applyAction(s, 0, { type: 'buildRoad', edge }), /Not enough/);
    expectIllegal(() => applyAction(s, 0, { type: 'buildCity', vertex: v }), /Not enough/);
    expectIllegal(() => applyAction(s, 0, { type: 'buyDevCard' }), /Not enough/);

    give(s, 0, { timber: 1, clay: 1, harvest: 3, stone: 4, fleece: 1 });
    let n = applyAction(s, 0, { type: 'buildRoad', edge });
    expect(n.players[0].resources).toEqual(bag({ harvest: 3, stone: 4, fleece: 1 }));
    n = applyAction(n, 0, { type: 'buildCity', vertex: v });
    expect(n.buildings[v]).toEqual({ owner: 0, kind: 'city' });
    expect(n.players[0].resources).toEqual(bag({ harvest: 1, stone: 1, fleece: 1 }));
    n = applyAction(n, 0, { type: 'buyDevCard' });
    expect(totalCards(n.players[0].resources)).toBe(0);
    expect(n.players[0].newDevCards).toHaveLength(1);
  });

  it('only upgrades your own settlements to cities', () => {
    const s = mainPhaseGame();
    placeSettlement(s, 1, 20);
    give(s, 0, { harvest: 2, stone: 3 });
    expectIllegal(() => applyAction(s, 0, { type: 'buildCity', vertex: 20 }));
  });

  it('does not let roads pass through a rival building', () => {
    const s = mainPhaseGame();
    const path = findPath(2);
    const [a, b] = path.vertices;
    placeSettlement(s, 0, a);
    placeRoad(s, 0, path.edges[0]);
    placeSettlement(s, 1, b);
    const beyond = TOPOLOGY.vertexEdges[b].filter((e) => e !== path.edges[0]);
    for (const e of beyond) expect(legalRoadEdges(s, 0)).not.toContain(e);
  });

  it('rejects actions from a player whose turn it is not', () => {
    const s = mainPhaseGame();
    expectIllegal(() => applyAction(s, 1, { type: 'endTurn' }), /not this player/);
  });
});

describe('longest road (Grand Highway)', () => {
  it('measures the longest continuous road and awards it at five', () => {
    const s = mainPhaseGame();
    const path = findPath(5);
    placeSettlement(s, 0, path.vertices[0]);
    path.edges.slice(0, 4).forEach((e) => placeRoad(s, 0, e));
    expect(longestRoadLength(s, 0)).toBe(4);
    give(s, 0, { timber: 1, clay: 1 });
    const n = applyAction(s, 0, { type: 'buildRoad', edge: path.edges[4] });
    expect(longestRoadLength(n, 0)).toBe(5);
    expect(n.longestRoadHolder).toBe(0);
    expect(victoryPoints(n, 0)).toBe(3);
  });

  it('counts the longest branch, not the total number of roads', () => {
    const s = mainPhaseGame();
    // A path of 4 with an extra spur of 1 at the middle vertex.
    const path = findPath(4, (vs) => TOPOLOGY.vertexEdges[vs[2]].length === 3);
    path.edges.forEach((e) => placeRoad(s, 0, e));
    const spur = TOPOLOGY.vertexEdges[path.vertices[2]].find((e) => !path.edges.includes(e))!;
    placeRoad(s, 0, spur);
    expect(longestRoadLength(s, 0)).toBe(4);
  });

  it('is broken by a rival settlement and transfers correctly', () => {
    const s = mainPhaseGame();
    const path = findPath(5, (vs) => TOPOLOGY.vertexEdges[vs[2]].length === 3);
    path.edges.forEach((e) => placeRoad(s, 0, e));
    s.longestRoadHolder = 0;
    const cut = path.vertices[2];
    const side = TOPOLOGY.vertexEdges[cut].find((e) => !path.edges.includes(e))!;
    placeRoad(s, 1, side);
    s.currentPlayer = 1;
    give(s, 1, { timber: 1, clay: 1, fleece: 1, harvest: 1 });
    const n = applyAction(s, 1, { type: 'buildSettlement', vertex: cut });
    expect(longestRoadLength(n, 0)).toBe(3);
    expect(n.longestRoadHolder).toBeNull();
  });

  it('keeps the title with the holder on a tie', () => {
    const s = mainPhaseGame();
    const p0 = findPath(5);
    p0.edges.forEach((e) => placeRoad(s, 0, e));
    s.longestRoadHolder = 0;
    const p1 = findPath(5, (vs) => vs.every((v) => !p0.vertices.includes(v)));
    p1.edges.slice(0, 4).forEach((e) => placeRoad(s, 1, e));
    s.currentPlayer = 1;
    give(s, 1, { timber: 2, clay: 2 });
    let n = applyAction(s, 1, { type: 'buildRoad', edge: p1.edges[4] });
    expect(longestRoadLength(n, 1)).toBe(5);
    expect(n.longestRoadHolder).toBe(0);
    // A strictly longer road takes it.
    const extend = legalRoadEdges(n, 1).find((e) => {
      const trial = structuredClone(n);
      trial.roads[e] = 1;
      return longestRoadLength(trial, 1) === 6;
    })!;
    n = applyAction(n, 1, { type: 'buildRoad', edge: extend });
    expect(n.longestRoadHolder).toBe(1);
  });
});

describe('the raider', () => {
  function rollSeven(s: GameState) {
    resolveRoll(s, 3, 4);
    return s;
  }

  it('makes hands over seven discard half, rounded down', () => {
    const s = mainPhaseGame();
    give(s, 1, { timber: 5, stone: 4 }); // 9 cards -> discard 4
    give(s, 2, { fleece: 7 }); // exactly 7 -> safe
    give(s, 0, { clay: 8 }); // 8 -> discard 4
    rollSeven(s);
    expect(s.phase).toBe('discard');
    expect(s.pendingDiscards).toEqual({ 0: 4, 1: 4 });
    expectIllegal(() => applyAction(s, 1, { type: 'discard', player: 1, cards: bag({ timber: 3 }) }), /exactly 4/);
    expectIllegal(() => applyAction(s, 2, { type: 'discard', player: 2, cards: bag({ fleece: 3 }) }));
    expectIllegal(() => applyAction(s, 0, { type: 'discard', player: 1, cards: bag({ timber: 4 }) }));
    expectIllegal(() => applyAction(s, 0, { type: 'endTurn' }));
    expectIllegal(() => applyAction(s, 1, { type: 'discard', player: 1, cards: bag({ clay: 4 }) }), /do not have/);
    let n = applyAction(s, 1, { type: 'discard', player: 1, cards: bag({ timber: 2, stone: 2 }) });
    expect(n.phase).toBe('discard');
    n = applyAction(n, 0, { type: 'discard', player: 0, cards: bag({ clay: 4 }) });
    expect(n.phase).toBe('moveRaider');
    expect(totalCards(n.players[1].resources)).toBe(5);
    expect(totalCards(n.players[0].resources)).toBe(4);
  });

  it('must move to a new tile and steals from an eligible rival only', () => {
    const s = rollSeven(mainPhaseGame());
    expect(s.phase).toBe('moveRaider');
    expectIllegal(() => applyAction(s, 0, { type: 'moveRaider', hex: s.raiderHex }));
    const hex = hexWithToken(s);
    const [v0, , v2, , v4] = TOPOLOGY.hexVertices[hex.id];
    placeSettlement(s, 1, v0);
    placeSettlement(s, 2, v2); // rival with no cards: not eligible
    placeSettlement(s, 0, v4); // own settlement: never a victim
    give(s, 1, { stone: 1 });
    const n = applyAction(s, 0, { type: 'moveRaider', hex: hex.id });
    expect(n.raiderHex).toBe(hex.id);
    expect(n.phase).toBe('main');
    expect(n.players[0].resources.stone).toBe(1);
    expect(n.players[1].resources.stone).toBe(0);
  });

  it('asks the thief to choose when several rivals are eligible', () => {
    const s = rollSeven(mainPhaseGame());
    const hex = hexWithToken(s);
    const [v0, , v2] = TOPOLOGY.hexVertices[hex.id];
    placeSettlement(s, 1, v0);
    placeSettlement(s, 2, v2);
    give(s, 1, { stone: 2 });
    give(s, 2, { clay: 1 });
    let n = applyAction(s, 0, { type: 'moveRaider', hex: hex.id });
    expect(n.phase).toBe('steal');
    expect(n.stealCandidates).toEqual([1, 2]);
    expectIllegal(() => applyAction(n, 0, { type: 'steal', victim: 0 }));
    n = applyAction(n, 0, { type: 'steal', victim: 2 });
    expect(n.players[0].resources.clay).toBe(1);
    expect(n.phase).toBe('main');
  });

  it('skips stealing when nobody eligible touches the tile', () => {
    const s = rollSeven(mainPhaseGame());
    const hex = hexWithToken(s);
    const n = applyAction(s, 0, { type: 'moveRaider', hex: hex.id });
    expect(n.phase).toBe('main');
  });
});

describe('development cards', () => {
  it('cannot play a card on the turn it was bought', () => {
    const s = mainPhaseGame();
    s.devDeck.push('warden');
    give(s, 0, { fleece: 1, harvest: 1, stone: 1 });
    let n = applyAction(s, 0, { type: 'buyDevCard' });
    expect(n.players[0].newDevCards).toEqual(['warden']);
    expectIllegal(() => applyAction(n, 0, { type: 'playWarden' }), /bought this turn/);
    n = applyAction(n, 0, { type: 'endTurn' });
    expect(n.players[0].devCards).toEqual(['warden']);
    expect(n.players[0].newDevCards).toEqual([]);
    n.currentPlayer = 0; // jump back to player 0's next turn
    n = applyAction(n, 0, { type: 'playWarden' });
    expect(n.phase).toBe('moveRaider');
    expect(n.resumePhase).toBe('roll');
  });

  it('allows only one development card per turn', () => {
    const s = mainPhaseGame();
    s.players[0].devCards = ['bounty', 'warden'];
    const n = applyAction(s, 0, { type: 'playBounty', resources: ['stone', 'clay'] });
    expect(n.players[0].resources).toEqual(bag({ stone: 1, clay: 1 }));
    expectIllegal(() => applyAction(n, 0, { type: 'playWarden' }), /one development card/);
  });

  it('counts monuments as hidden victory points', () => {
    const s = mainPhaseGame();
    placeSettlement(s, 0, 5);
    s.players[0].devCards = ['monument'];
    s.players[0].newDevCards = ['monument'];
    expect(victoryPoints(s, 0)).toBe(3);
    expect(victoryPoints(s, 0, false)).toBe(1);
    expectIllegal(() => applyAction(s, 0, { type: 'playWarden' }));
  });

  it('awards the Strongest Guard at three wardens and transfers only when exceeded', () => {
    let s = mainPhaseGame();
    s.players[0].wardensPlayed = 2;
    s.players[0].devCards = ['warden'];
    s = applyAction(s, 0, { type: 'playWarden' });
    expect(s.largestArmyHolder).toBe(0);
    expect(victoryPoints(s, 0)).toBe(2);

    s = applyAction(s, 0, { type: 'moveRaider', hex: hexWithToken(s).id });
    s = applyAction(s, 0, { type: 'endTurn' });
    s.phase = 'main';
    s.players[1].wardensPlayed = 2;
    s.players[1].devCards = ['warden'];
    s = applyAction(s, 1, { type: 'playWarden' });
    expect(s.largestArmyHolder).toBe(0); // 3 vs 3: holder keeps it
    s = applyAction(s, 1, { type: 'moveRaider', hex: hexWithToken(s).id });
    s.devCardPlayedThisTurn = false;
    s.players[1].devCards = ['warden'];
    s = applyAction(s, 1, { type: 'playWarden' });
    expect(s.largestArmyHolder).toBe(1);
  });

  it('embargo collects the named resource from every rival', () => {
    const s = mainPhaseGame();
    s.players[0].devCards = ['embargo'];
    give(s, 1, { stone: 3, clay: 1 });
    give(s, 2, { stone: 2 });
    const n = applyAction(s, 0, { type: 'playEmbargo', resource: 'stone' });
    expect(n.players[0].resources.stone).toBe(5);
    expect(n.players[1].resources).toEqual(bag({ clay: 1 }));
    expect(n.players[2].resources.stone).toBe(0);
  });

  it('bounty takes two resources, limited by the bank', () => {
    const s = mainPhaseGame();
    s.players[0].devCards = ['bounty'];
    s.bank.harvest = 1;
    expectIllegal(() => applyAction(s, 0, { type: 'playBounty', resources: ['harvest', 'harvest'] }), /bank/);
    const n = applyAction(s, 0, { type: 'playBounty', resources: ['harvest', 'timber'] });
    expect(n.players[0].resources).toEqual(bag({ harvest: 1, timber: 1 }));
  });

  it('surveyor lays two free connected roads', () => {
    const s = mainPhaseGame();
    placeSettlement(s, 0, 20);
    s.players[0].devCards = ['surveyor'];
    let n = applyAction(s, 0, { type: 'playSurveyor' });
    expect(n.phase).toBe('roadBuilding');
    expect(n.freeRoadsLeft).toBe(2);
    expectIllegal(() => applyAction(n, 0, { type: 'endTurn' }));
    const far = [...Array(EDGE_COUNT).keys()].find((e) => !legalRoadEdges(n, 0).includes(e) && n.roads[e] === null)!;
    expectIllegal(() => applyAction(n, 0, { type: 'placeFreeRoad', edge: far }));
    n = applyAction(n, 0, { type: 'placeFreeRoad', edge: legalRoadEdges(n, 0)[0] });
    n = applyAction(n, 0, { type: 'placeFreeRoad', edge: legalRoadEdges(n, 0)[0] });
    expect(n.phase).toBe('main');
    expect(n.roads.filter((r) => r === 0)).toHaveLength(2);
    expect(totalCards(n.players[0].resources)).toBe(0);
  });

  it('can play a warden before rolling and then still roll', () => {
    let s = mainPhaseGame();
    s.phase = 'roll';
    s.hasRolled = false;
    s.players[0].devCards = ['warden'];
    s = applyAction(s, 0, { type: 'playWarden' });
    s = applyAction(s, 0, { type: 'moveRaider', hex: hexWithToken(s).id });
    expect(s.phase).toBe('roll');
    s = applyAction(s, 0, { type: 'rollDice' });
    expect(s.hasRolled).toBe(true);
  });
});

describe('trading', () => {
  it('trades 4:1 with the bank by default', () => {
    const s = mainPhaseGame();
    give(s, 0, { timber: 4 });
    const n = applyAction(s, 0, { type: 'bankTrade', give: 'timber', get: 'stone' });
    expect(n.players[0].resources).toEqual(bag({ stone: 1 }));
    give(s, 0, { timber: -1 });
    expectIllegal(() => applyAction(s, 0, { type: 'bankTrade', give: 'timber', get: 'stone' }), /need 4/);
  });

  it('uses 3:1 and 2:1 harbors when a building touches them', () => {
    const s = mainPhaseGame(9);
    const generic = s.ports.find((p) => p.resource === null)!;
    const special = s.ports.find((p) => p.resource !== null)!;
    placeSettlement(s, 0, TOPOLOGY.edgeVertices[generic.edge][0]);
    expect(tradeRatio(s, 0, 'fleece')).toBe(3);
    placeSettlement(s, 0, TOPOLOGY.edgeVertices[special.edge][1]);
    const r = special.resource!;
    expect(tradeRatio(s, 0, r)).toBe(2);
    const other = RESOURCES.find((x) => x !== r)!;
    expect(tradeRatio(s, 0, other)).toBe(3);
    give(s, 0, { [r]: 2 });
    const n = applyAction(s, 0, { type: 'bankTrade', give: r, get: other });
    expect(n.players[0].resources).toEqual(bag({ [other]: 1 }));
  });

  it('exchanges cards between players when both can pay', () => {
    const s = mainPhaseGame();
    give(s, 0, { timber: 2 });
    give(s, 1, { stone: 1 });
    const n = applyAction(s, 0, { type: 'playerTrade', partner: 1, give: bag({ timber: 2 }), get: bag({ stone: 1 }) });
    expect(n.players[0].resources).toEqual(bag({ stone: 1 }));
    expect(n.players[1].resources).toEqual(bag({ timber: 2 }));
    expectIllegal(() =>
      applyAction(s, 0, { type: 'playerTrade', partner: 1, give: bag({ timber: 2 }), get: bag({ stone: 2 }) }),
    );
  });
});

describe('victory', () => {
  function spreadVertices(count: number): number[] {
    const chosen: number[] = [];
    for (let v = 0; v < VERTEX_COUNT && chosen.length < count; v++) {
      if (chosen.every((c) => c !== v && !TOPOLOGY.vertexNeighbors[v].includes(c))) chosen.push(v);
    }
    return chosen;
  }

  it('ends the game when the current player reaches 10 points', () => {
    const s = mainPhaseGame();
    const vs = spreadVertices(6);
    vs.slice(0, 3).forEach((v) => placeSettlement(s, 0, v, 'city'));
    vs.slice(3).forEach((v) => placeSettlement(s, 0, v));
    expect(victoryPoints(s, 0)).toBe(9);
    give(s, 0, { harvest: 2, stone: 3 });
    const n = applyAction(s, 0, { type: 'buildCity', vertex: vs[3] });
    expect(n.phase).toBe('gameOver');
    expect(n.winner).toBe(0);
    expect(victoryPoints(n, 0)).toBe(10);
    expectIllegal(() => applyAction(n, 0, { type: 'endTurn' }), /over/);
  });

  it('counts a monument bought this turn toward victory', () => {
    const s = mainPhaseGame();
    const vs = spreadVertices(5);
    vs.slice(0, 4).forEach((v) => placeSettlement(s, 0, v, 'city'));
    placeSettlement(s, 0, vs[4]);
    s.devDeck.push('monument');
    give(s, 0, { fleece: 1, harvest: 1, stone: 1 });
    const n = applyAction(s, 0, { type: 'buyDevCard' });
    expect(n.winner).toBe(0);
  });

  it('does not end the game at 9 points', () => {
    const s = mainPhaseGame();
    const vs = spreadVertices(5);
    vs.slice(0, 4).forEach((v) => placeSettlement(s, 0, v, 'city'));
    placeSettlement(s, 0, vs[4]);
    const n = applyAction(s, 0, { type: 'endTurn' });
    expect(n.phase).toBe('roll');
    expect(n.winner).toBeNull();
  });
});

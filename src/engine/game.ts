// The Hearthvale rules engine. `applyAction` is a pure function: it validates
// an action against the current state, throws IllegalActionError for anything
// the rules forbid, and returns a new state. All randomness comes from the
// seeded generator stored in the state.

import { generateHexes, generatePorts } from './board';
import {
  bag,
  BANK_SUPPLY_PER_RESOURCE,
  COSTS,
  DEV_DECK,
  DEV_LABEL,
  MAX_HAND_BEFORE_DISCARD,
  MIN_LARGEST_ARMY,
  MIN_LONGEST_ROAD,
  PIECES,
  RESOURCE_LABEL,
  VICTORY_POINTS_TO_WIN,
} from './constants';
import { EDGE_COUNT, TOPOLOGY, VERTEX_COUNT } from './geometry';
import { randomInt, randomSeed, shuffle } from './rng';
import {
  IllegalActionError,
  RESOURCES,
  type Action,
  type DevCard,
  type Difficulty,
  type GameState,
  type Player,
  type Resource,
  type ResourceBag,
} from './types';

// ---------------------------------------------------------------------------
// Setup

export interface PlayerConfig {
  name: string;
  isHuman: boolean;
  difficulty: Difficulty;
  color: string;
}

export interface NewGameOptions {
  seed?: number;
  players: PlayerConfig[];
  /** Index of the player who places first. Random when omitted. */
  firstPlayer?: number;
}

export function createGame(options: NewGameOptions): GameState {
  const rng = { rngState: (options.seed ?? randomSeed()) | 0 };
  const hexes = generateHexes(rng);
  const ports = generatePorts(rng);
  const devDeck = shuffle(rng, DEV_DECK);
  const n = options.players.length;
  const first = options.firstPlayer ?? randomInt(rng, n);
  const round1 = Array.from({ length: n }, (_, i) => (first + i) % n);
  const order = [...round1, ...round1.slice().reverse()];

  const players: Player[] = options.players.map((cfg, id) => ({
    id,
    name: cfg.name,
    color: cfg.color,
    isHuman: cfg.isHuman,
    difficulty: cfg.difficulty,
    resources: bag(),
    devCards: [],
    newDevCards: [],
    wardensPlayed: 0,
    roadsLeft: PIECES.roads,
    settlementsLeft: PIECES.settlements,
    citiesLeft: PIECES.cities,
  }));

  const state: GameState = {
    version: 1,
    rngState: rng.rngState,
    hexes,
    ports,
    buildings: Array(VERTEX_COUNT).fill(null),
    roads: Array(EDGE_COUNT).fill(null),
    raiderHex: hexes.findIndex((h) => h.terrain === 'waste'),
    players,
    currentPlayer: order[0],
    phase: 'setup',
    turn: 0,
    setup: { round: 1, index: 0, order, step: 'settlement', lastSettlement: null },
    dice: null,
    hasRolled: false,
    bank: bag({
      timber: BANK_SUPPLY_PER_RESOURCE,
      clay: BANK_SUPPLY_PER_RESOURCE,
      fleece: BANK_SUPPLY_PER_RESOURCE,
      harvest: BANK_SUPPLY_PER_RESOURCE,
      stone: BANK_SUPPLY_PER_RESOURCE,
    }),
    devDeck,
    devCardPlayedThisTurn: false,
    pendingDiscards: {},
    resumePhase: 'main',
    stealCandidates: [],
    freeRoadsLeft: 0,
    longestRoadHolder: null,
    largestArmyHolder: null,
    winner: null,
    log: [],
    tradesThisTurn: 0,
    lastChange: null,
  };
  log(state, null, `A new island rises. ${players[first].name} places first.`);
  return state;
}

// ---------------------------------------------------------------------------
// Resource helpers

export function totalCards(b: ResourceBag): number {
  return RESOURCES.reduce((s, r) => s + b[r], 0);
}

export function hasResources(have: ResourceBag, need: ResourceBag): boolean {
  return RESOURCES.every((r) => have[r] >= need[r]);
}

function moveResources(from: ResourceBag, to: ResourceBag, amount: ResourceBag) {
  for (const r of RESOURCES) {
    from[r] -= amount[r];
    to[r] += amount[r];
  }
}

export function describeBag(b: ResourceBag): string {
  const parts = RESOURCES.filter((r) => b[r] > 0).map((r) => `${b[r]} ${RESOURCE_LABEL[r]}`);
  return parts.length ? parts.join(', ') : 'nothing';
}

// ---------------------------------------------------------------------------
// Board queries

export function isVertexFreeByDistance(state: GameState, vertex: number): boolean {
  if (state.buildings[vertex]) return false;
  return TOPOLOGY.vertexNeighbors[vertex].every((n) => !state.buildings[n]);
}

function playerTouchesVertexByRoad(state: GameState, player: number, vertex: number): boolean {
  return TOPOLOGY.vertexEdges[vertex].some((e) => state.roads[e] === player);
}

export function legalSetupSettlementVertices(state: GameState): number[] {
  const out: number[] = [];
  for (let v = 0; v < VERTEX_COUNT; v++) if (isVertexFreeByDistance(state, v)) out.push(v);
  return out;
}

export function legalSetupRoadEdges(state: GameState): number[] {
  const v = state.setup?.lastSettlement;
  if (v === null || v === undefined) return [];
  return TOPOLOGY.vertexEdges[v].filter((e) => state.roads[e] === null);
}

/** Edges where `player` may build a road right now (ignores cost). */
export function legalRoadEdges(state: GameState, player: number): number[] {
  if (state.players[player].roadsLeft <= 0) return [];
  const out: number[] = [];
  for (let e = 0; e < EDGE_COUNT; e++) {
    if (state.roads[e] !== null) continue;
    if (TOPOLOGY.edgeVertices[e].some((v) => roadConnectsAt(state, player, v))) out.push(e);
  }
  return out;
}

function roadConnectsAt(state: GameState, player: number, vertex: number): boolean {
  const b = state.buildings[vertex];
  if (b) return b.owner === player;
  // An opponent's building at the vertex breaks the connection.
  return playerTouchesVertexByRoad(state, player, vertex);
}

/** Vertices where `player` may build a settlement right now (ignores cost). */
export function legalSettlementVertices(state: GameState, player: number): number[] {
  if (state.players[player].settlementsLeft <= 0) return [];
  const out: number[] = [];
  for (let v = 0; v < VERTEX_COUNT; v++) {
    if (isVertexFreeByDistance(state, v) && playerTouchesVertexByRoad(state, player, v)) out.push(v);
  }
  return out;
}

export function legalCityVertices(state: GameState, player: number): number[] {
  if (state.players[player].citiesLeft <= 0) return [];
  const out: number[] = [];
  state.buildings.forEach((b, v) => {
    if (b && b.owner === player && b.kind === 'settlement') out.push(v);
  });
  return out;
}

/** Best bank exchange rate for giving `resource`, considering harbors. */
export function tradeRatio(state: GameState, player: number, resource: Resource): number {
  let ratio = 4;
  for (const port of state.ports) {
    const touches = TOPOLOGY.edgeVertices[port.edge].some((v) => state.buildings[v]?.owner === player);
    if (!touches) continue;
    if (port.resource === resource) ratio = Math.min(ratio, 2);
    else if (port.resource === null) ratio = Math.min(ratio, 3);
  }
  return ratio;
}

export function legalRaiderHexes(state: GameState): number[] {
  return state.hexes.map((h) => h.id).filter((id) => id !== state.raiderHex);
}

/** Rivals of `player` with a building on `hex` and at least one card. */
export function stealCandidatesFor(state: GameState, player: number, hex: number): number[] {
  const out = new Set<number>();
  for (const v of TOPOLOGY.hexVertices[hex]) {
    const b = state.buildings[v];
    if (b && b.owner !== player && totalCards(state.players[b.owner].resources) > 0) out.add(b.owner);
  }
  return [...out].sort();
}

// ---------------------------------------------------------------------------
// Longest road & largest army

export function longestRoadLength(state: GameState, player: number): number {
  const owned = new Set<number>();
  state.roads.forEach((owner, e) => {
    if (owner === player) owned.add(e);
  });
  if (owned.size === 0) return 0;

  const used = new Set<number>();
  const blocked = (v: number) => {
    const b = state.buildings[v];
    return !!b && b.owner !== player;
  };
  const dfs = (v: number): number => {
    let best = 0;
    for (const e of TOPOLOGY.vertexEdges[v]) {
      if (!owned.has(e) || used.has(e)) continue;
      const [a, b] = TOPOLOGY.edgeVertices[e];
      const next = a === v ? b : a;
      used.add(e);
      // A rival's building ends the road: we can reach it but not pass through.
      const len = 1 + (blocked(next) ? 0 : dfs(next));
      used.delete(e);
      if (len > best) best = len;
    }
    return best;
  };

  let best = 0;
  const starts = new Set<number>();
  for (const e of owned) TOPOLOGY.edgeVertices[e].forEach((v) => starts.add(v));
  for (const v of starts) best = Math.max(best, dfs(v));
  return best;
}

function updateLongestRoad(state: GameState) {
  const lengths = state.players.map((p) => longestRoadLength(state, p.id));
  const max = Math.max(...lengths);
  const holder = state.longestRoadHolder;
  let next: number | null;
  if (holder !== null && lengths[holder] >= MIN_LONGEST_ROAD && lengths[holder] === max) {
    next = holder;
  } else if (max >= MIN_LONGEST_ROAD && lengths.filter((l) => l === max).length === 1) {
    next = lengths.indexOf(max);
  } else {
    // Nobody qualifies, or the title was lost and several rivals tie: it is set aside.
    next = null;
  }
  if (next !== holder) {
    state.longestRoadHolder = next;
    if (next !== null) log(state, next, `${state.players[next].name} now holds the Grand Highway (${max} roads).`);
    else if (holder !== null) log(state, holder, `${state.players[holder].name} loses the Grand Highway.`);
  }
}

function updateLargestArmy(state: GameState, player: number) {
  const count = state.players[player].wardensPlayed;
  const holder = state.largestArmyHolder;
  if (holder === player || count < MIN_LARGEST_ARMY) return;
  if (holder === null || count > state.players[holder].wardensPlayed) {
    state.largestArmyHolder = player;
    log(state, player, `${state.players[player].name} now commands the Strongest Guard (${count} wardens).`);
  }
}

// ---------------------------------------------------------------------------
// Scoring

export function victoryPoints(state: GameState, player: number, includeHidden = true): number {
  let vp = 0;
  for (const b of state.buildings) {
    if (b && b.owner === player) vp += b.kind === 'city' ? 2 : 1;
  }
  if (state.longestRoadHolder === player) vp += 2;
  if (state.largestArmyHolder === player) vp += 2;
  if (includeHidden) {
    const p = state.players[player];
    vp += [...p.devCards, ...p.newDevCards].filter((c) => c === 'monument').length;
  }
  return vp;
}

function checkVictory(state: GameState) {
  if (state.phase === 'gameOver' || state.phase === 'setup') return;
  const p = state.currentPlayer;
  if (victoryPoints(state, p) >= VICTORY_POINTS_TO_WIN) {
    state.phase = 'gameOver';
    state.winner = p;
    log(state, p, `${state.players[p].name} reaches ${victoryPoints(state, p)} points and wins!`);
  }
}

// ---------------------------------------------------------------------------
// Turn helpers

/** Players who are expected to act next. */
export function actingPlayers(state: GameState): number[] {
  if (state.phase === 'gameOver') return [];
  if (state.phase === 'discard') return Object.keys(state.pendingDiscards).map(Number);
  return [state.currentPlayer];
}

export function canAfford(state: GameState, player: number, kind: keyof typeof COSTS): boolean {
  return hasResources(state.players[player].resources, COSTS[kind]);
}

export function canPlayDevCard(state: GameState, player: number, card: DevCard): boolean {
  if (card === 'monument') return false;
  if (player !== state.currentPlayer) return false;
  if (state.phase !== 'roll' && state.phase !== 'main') return false;
  if (state.devCardPlayedThisTurn) return false;
  return state.players[player].devCards.includes(card);
}

function log(state: GameState, player: number | null, text: string) {
  state.log.push({ turn: state.turn, player, text });
  if (state.log.length > 300) state.log.splice(0, state.log.length - 300);
}

function fail(message: string): never {
  throw new IllegalActionError(message);
}

function ensure(condition: unknown, message: string): asserts condition {
  if (!condition) fail(message);
}

function requirePhase(state: GameState, ...phases: GameState['phase'][]) {
  ensure(phases.includes(state.phase), `Not allowed during the ${state.phase} phase`);
}

function isBag(value: unknown): value is ResourceBag {
  if (!value || typeof value !== 'object') return false;
  return RESOURCES.every((r) => {
    const n = (value as Record<string, unknown>)[r];
    return typeof n === 'number' && Number.isInteger(n) && n >= 0;
  });
}

// ---------------------------------------------------------------------------
// Production

export function produceResources(state: GameState, roll: number): Record<number, ResourceBag> {
  const owed: Record<Resource, number[]> = {
    timber: [],
    clay: [],
    fleece: [],
    harvest: [],
    stone: [],
  };
  for (const p of state.players) RESOURCES.forEach((r) => (owed[r][p.id] = 0));

  for (const hex of state.hexes) {
    if (hex.token !== roll || hex.id === state.raiderHex || hex.terrain === 'waste') continue;
    for (const v of TOPOLOGY.hexVertices[hex.id]) {
      const b = state.buildings[v];
      if (b) owed[hex.terrain][b.owner] += b.kind === 'city' ? 2 : 1;
    }
  }

  const received: Record<number, ResourceBag> = {};
  state.players.forEach((p) => (received[p.id] = bag()));
  for (const r of RESOURCES) {
    const claims = owed[r];
    const total = claims.reduce((s, n) => s + n, 0);
    if (total === 0) continue;
    const claimants = claims.filter((n) => n > 0).length;
    if (total <= state.bank[r]) {
      claims.forEach((n, pid) => (received[pid][r] += n));
    } else if (claimants === 1) {
      // A lone claimant takes whatever the bank has left.
      const pid = claims.findIndex((n) => n > 0);
      received[pid][r] += state.bank[r];
    } else {
      log(state, null, `The bank is short of ${RESOURCE_LABEL[r]}; nobody receives any.`);
    }
  }

  for (const p of state.players) {
    moveResources(state.bank, p.resources, received[p.id]);
    if (totalCards(received[p.id]) > 0) log(state, p.id, `${p.name} gathers ${describeBag(received[p.id])}.`);
  }
  return received;
}

// ---------------------------------------------------------------------------
// Main reducer

export function applyAction(prev: GameState, actor: number, action: Action): GameState {
  const state: GameState = structuredClone(prev);
  ensure(state.players[actor], 'Unknown player');
  ensure(state.phase !== 'gameOver', 'The game is over');

  if (action.type === 'discard') {
    handleDiscard(state, actor, action.player, action.cards);
    return state;
  }
  ensure(actor === state.currentPlayer, "It is not this player's turn");

  const me = state.players[actor];
  switch (action.type) {
    case 'placeSetupSettlement': {
      requirePhase(state, 'setup');
      const setup = state.setup!;
      ensure(setup.step === 'settlement', 'Place a road next');
      ensure(Number.isInteger(action.vertex) && action.vertex >= 0 && action.vertex < VERTEX_COUNT, 'Bad vertex');
      ensure(isVertexFreeByDistance(state, action.vertex), 'Too close to another building');
      state.buildings[action.vertex] = { owner: actor, kind: 'settlement' };
      me.settlementsLeft--;
      setup.step = 'road';
      setup.lastSettlement = action.vertex;
      state.lastChange = { kind: 'vertex', id: action.vertex };
      log(state, actor, `${me.name} founds a settlement.`);
      if (setup.round === 2) {
        const gained = bag();
        for (const h of TOPOLOGY.vertexHexes[action.vertex]) {
          const terrain = state.hexes[h].terrain;
          if (terrain !== 'waste' && state.bank[terrain] > 0) gained[terrain]++;
        }
        moveResources(state.bank, me.resources, gained);
        log(state, actor, `${me.name} receives starting resources: ${describeBag(gained)}.`);
      }
      break;
    }

    case 'placeSetupRoad': {
      requirePhase(state, 'setup');
      const setup = state.setup!;
      ensure(setup.step === 'road', 'Place a settlement first');
      ensure(legalSetupRoadEdges(state).includes(action.edge), 'The road must touch the new settlement');
      state.roads[action.edge] = actor;
      me.roadsLeft--;
      state.lastChange = { kind: 'edge', id: action.edge };
      updateLongestRoad(state);
      setup.index++;
      if (setup.index >= setup.order.length) {
        state.setup = null;
        state.phase = 'roll';
        state.currentPlayer = setup.order[0];
        state.turn = 1;
        log(state, null, `Settling is complete. ${state.players[state.currentPlayer].name} takes the first turn.`);
      } else {
        setup.step = 'settlement';
        setup.lastSettlement = null;
        setup.round = setup.index >= setup.order.length / 2 ? 2 : 1;
        state.currentPlayer = setup.order[setup.index];
      }
      break;
    }

    case 'rollDice': {
      requirePhase(state, 'roll');
      const d1 = 1 + randomInt(state, 6);
      const d2 = 1 + randomInt(state, 6);
      resolveRoll(state, d1, d2);
      break;
    }

    case 'moveRaider': {
      requirePhase(state, 'moveRaider');
      ensure(legalRaiderHexes(state).includes(action.hex), 'The raider must move to a different tile');
      state.raiderHex = action.hex;
      state.lastChange = { kind: 'hex', id: action.hex };
      log(state, actor, `${me.name} sends the raider to a ${terrainName(state, action.hex)} tile.`);
      const candidates = stealCandidatesFor(state, actor, action.hex);
      if (candidates.length === 0) {
        state.phase = state.resumePhase;
      } else if (candidates.length === 1) {
        stealFrom(state, actor, candidates[0]);
        state.phase = state.resumePhase;
      } else {
        state.stealCandidates = candidates;
        state.phase = 'steal';
      }
      break;
    }

    case 'steal': {
      requirePhase(state, 'steal');
      ensure(state.stealCandidates.includes(action.victim), 'That player cannot be robbed');
      stealFrom(state, actor, action.victim);
      state.stealCandidates = [];
      state.phase = state.resumePhase;
      break;
    }

    case 'buildRoad': {
      requirePhase(state, 'main');
      ensure(canAfford(state, actor, 'road'), 'Not enough resources for a road');
      ensure(legalRoadEdges(state, actor).includes(action.edge), 'A road cannot go there');
      moveResources(me.resources, state.bank, COSTS.road);
      state.roads[action.edge] = actor;
      me.roadsLeft--;
      state.lastChange = { kind: 'edge', id: action.edge };
      log(state, actor, `${me.name} builds a road.`);
      updateLongestRoad(state);
      break;
    }

    case 'buildSettlement': {
      requirePhase(state, 'main');
      ensure(canAfford(state, actor, 'settlement'), 'Not enough resources for a settlement');
      ensure(legalSettlementVertices(state, actor).includes(action.vertex), 'A settlement cannot go there');
      moveResources(me.resources, state.bank, COSTS.settlement);
      state.buildings[action.vertex] = { owner: actor, kind: 'settlement' };
      me.settlementsLeft--;
      state.lastChange = { kind: 'vertex', id: action.vertex };
      log(state, actor, `${me.name} founds a settlement.`);
      // A new settlement can cut a rival's road.
      updateLongestRoad(state);
      break;
    }

    case 'buildCity': {
      requirePhase(state, 'main');
      ensure(canAfford(state, actor, 'city'), 'Not enough resources for a city');
      ensure(legalCityVertices(state, actor).includes(action.vertex), 'Only your own settlement can become a city');
      moveResources(me.resources, state.bank, COSTS.city);
      state.buildings[action.vertex] = { owner: actor, kind: 'city' };
      me.citiesLeft--;
      me.settlementsLeft++;
      state.lastChange = { kind: 'vertex', id: action.vertex };
      log(state, actor, `${me.name} raises a city.`);
      break;
    }

    case 'buyDevCard': {
      requirePhase(state, 'main');
      ensure(state.devDeck.length > 0, 'The development deck is empty');
      ensure(canAfford(state, actor, 'devCard'), 'Not enough resources for a development card');
      moveResources(me.resources, state.bank, COSTS.devCard);
      me.newDevCards.push(state.devDeck.pop()!);
      log(state, actor, `${me.name} buys a development card.`);
      break;
    }

    case 'playWarden': {
      startDevCard(state, actor, 'warden');
      me.wardensPlayed++;
      updateLargestArmy(state, actor);
      state.resumePhase = state.phase as 'roll' | 'main';
      state.phase = 'moveRaider';
      break;
    }

    case 'playEmbargo': {
      ensure(RESOURCES.includes(action.resource), 'Unknown resource');
      startDevCard(state, actor, 'embargo');
      let taken = 0;
      for (const p of state.players) {
        if (p.id === actor) continue;
        taken += p.resources[action.resource];
        me.resources[action.resource] += p.resources[action.resource];
        p.resources[action.resource] = 0;
      }
      log(state, actor, `${me.name} collects ${taken} ${RESOURCE_LABEL[action.resource]} from rivals.`);
      break;
    }

    case 'playBounty': {
      const [a, b] = action.resources ?? [];
      ensure(RESOURCES.includes(a) && RESOURCES.includes(b), 'Choose two resources');
      const want = bag();
      want[a]++;
      want[b]++;
      ensure(hasResources(state.bank, want), 'The bank cannot supply that');
      startDevCard(state, actor, 'bounty');
      moveResources(state.bank, me.resources, want);
      log(state, actor, `${me.name} takes ${describeBag(want)} from the bank.`);
      break;
    }

    case 'playSurveyor': {
      startDevCard(state, actor, 'surveyor');
      state.resumePhase = state.phase as 'roll' | 'main';
      state.freeRoadsLeft = Math.min(2, me.roadsLeft);
      if (state.freeRoadsLeft > 0 && legalRoadEdges(state, actor).length > 0) state.phase = 'roadBuilding';
      else state.freeRoadsLeft = 0;
      break;
    }

    case 'placeFreeRoad': {
      requirePhase(state, 'roadBuilding');
      ensure(legalRoadEdges(state, actor).includes(action.edge), 'A road cannot go there');
      state.roads[action.edge] = actor;
      me.roadsLeft--;
      state.freeRoadsLeft--;
      state.lastChange = { kind: 'edge', id: action.edge };
      log(state, actor, `${me.name} lays a free road.`);
      updateLongestRoad(state);
      if (state.freeRoadsLeft <= 0 || legalRoadEdges(state, actor).length === 0) {
        state.freeRoadsLeft = 0;
        state.phase = state.resumePhase;
      }
      break;
    }

    case 'bankTrade': {
      requirePhase(state, 'main');
      ensure(RESOURCES.includes(action.give) && RESOURCES.includes(action.get), 'Unknown resource');
      ensure(action.give !== action.get, 'Trade for a different resource');
      const ratio = tradeRatio(state, actor, action.give);
      ensure(me.resources[action.give] >= ratio, `You need ${ratio} ${RESOURCE_LABEL[action.give]}`);
      ensure(state.bank[action.get] > 0, 'The bank has none of that left');
      me.resources[action.give] -= ratio;
      state.bank[action.give] += ratio;
      me.resources[action.get]++;
      state.bank[action.get]--;
      state.tradesThisTurn++;
      log(
        state,
        actor,
        `${me.name} trades ${ratio} ${RESOURCE_LABEL[action.give]} for 1 ${RESOURCE_LABEL[action.get]}.`,
      );
      break;
    }

    case 'playerTrade': {
      // Consent is gathered by the caller (the partner's controller) before
      // this action is dispatched; the engine checks that both sides can pay.
      requirePhase(state, 'main');
      const partner = state.players[action.partner];
      ensure(partner && partner.id !== actor, 'Choose another player to trade with');
      ensure(isBag(action.give) && isBag(action.get), 'Malformed trade');
      ensure(totalCards(action.give) > 0 && totalCards(action.get) > 0, 'Both sides must offer something');
      ensure(RESOURCES.every((r) => action.give[r] === 0 || action.get[r] === 0), 'Cannot trade a resource for itself');
      ensure(hasResources(me.resources, action.give), 'You do not have those cards');
      ensure(hasResources(partner.resources, action.get), `${partner.name} does not have those cards`);
      moveResources(me.resources, partner.resources, action.give);
      moveResources(partner.resources, me.resources, action.get);
      state.tradesThisTurn++;
      log(state, actor, `${me.name} trades ${describeBag(action.give)} to ${partner.name} for ${describeBag(action.get)}.`);
      break;
    }

    case 'endTurn': {
      requirePhase(state, 'main');
      me.devCards.push(...me.newDevCards);
      me.newDevCards = [];
      state.devCardPlayedThisTurn = false;
      state.hasRolled = false;
      state.tradesThisTurn = 0;
      state.currentPlayer = (state.currentPlayer + 1) % state.players.length;
      state.turn++;
      state.phase = 'roll';
      log(state, state.currentPlayer, `${state.players[state.currentPlayer].name}'s turn begins.`);
      break;
    }

    default:
      fail('Unknown action');
  }

  checkVictory(state);
  return state;
}

/** Apply a specific dice result. Exposed for tests; normal play uses rollDice. */
export function resolveRoll(state: GameState, d1: number, d2: number) {
  const sum = d1 + d2;
  state.dice = [d1, d2];
  state.hasRolled = true;
  state.phase = 'main';
  log(state, state.currentPlayer, `${state.players[state.currentPlayer].name} rolls ${sum}.`);
  if (sum !== 7) {
    produceResources(state, sum);
    return;
  }
  state.resumePhase = 'main';
  const pending: Record<number, number> = {};
  for (const p of state.players) {
    const n = totalCards(p.resources);
    if (n > MAX_HAND_BEFORE_DISCARD) pending[p.id] = Math.floor(n / 2);
  }
  state.pendingDiscards = pending;
  if (Object.keys(pending).length > 0) {
    state.phase = 'discard';
    log(state, null, 'A 7! Anyone holding more than 7 cards must give up half.');
  } else {
    state.phase = 'moveRaider';
  }
}

function handleDiscard(state: GameState, actor: number, player: number, cards: ResourceBag) {
  requirePhase(state, 'discard');
  ensure(actor === player, 'Players discard only their own cards');
  const owed = state.pendingDiscards[player];
  ensure(owed !== undefined, 'This player does not need to discard');
  ensure(isBag(cards), 'Malformed discard');
  ensure(totalCards(cards) === owed, `Discard exactly ${owed} cards`);
  const p = state.players[player];
  ensure(hasResources(p.resources, cards), 'You do not have those cards');
  moveResources(p.resources, state.bank, cards);
  delete state.pendingDiscards[player];
  log(state, player, `${p.name} discards ${owed} cards.`);
  if (Object.keys(state.pendingDiscards).length === 0) state.phase = 'moveRaider';
}

function startDevCard(state: GameState, actor: number, card: DevCard) {
  ensure(canPlayDevCard(state, actor, card), cardRestrictionMessage(state, actor, card));
  const me = state.players[actor];
  me.devCards.splice(me.devCards.indexOf(card), 1);
  state.devCardPlayedThisTurn = true;
  log(state, actor, `${me.name} plays ${DEV_LABEL[card]}.`);
}

function cardRestrictionMessage(state: GameState, actor: number, card: DevCard): string {
  const me = state.players[actor];
  if (state.devCardPlayedThisTurn) return 'Only one development card may be played per turn';
  if (!me.devCards.includes(card) && me.newDevCards.includes(card)) return 'Cards bought this turn cannot be played yet';
  if (!me.devCards.includes(card)) return 'You do not hold that card';
  return 'That card cannot be played now';
}

function stealFrom(state: GameState, thief: number, victim: number) {
  const v = state.players[victim];
  const pool: Resource[] = [];
  for (const r of RESOURCES) for (let i = 0; i < v.resources[r]; i++) pool.push(r);
  if (pool.length === 0) return;
  const r = pool[randomInt(state, pool.length)];
  v.resources[r]--;
  state.players[thief].resources[r]++;
  log(state, thief, `${state.players[thief].name} steals a card from ${v.name}.`);
}

function terrainName(state: GameState, hex: number): string {
  const t = state.hexes[hex].terrain;
  return t === 'waste' ? 'wasteland' : RESOURCE_LABEL[t].toLowerCase();
}

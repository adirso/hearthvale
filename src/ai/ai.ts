// Local, rule-based opponents. `chooseAction` returns exactly one legal action
// for the given player; controllers call it repeatedly until the player's turn
// (or pending decision) is done. Everything here uses the engine's public
// queries, so the AI can never cheat past the rules engine.

import {
  bag,
  canAfford,
  canPlayDevCard,
  COSTS,
  hasResources,
  legalCityVertices,
  legalRaiderHexes,
  legalRoadEdges,
  legalSettlementVertices,
  legalSetupRoadEdges,
  legalSetupSettlementVertices,
  longestRoadLength,
  pips,
  RESOURCES,
  stealCandidatesFor,
  totalCards,
  TOPOLOGY,
  tradeRatio,
  VERTEX_COUNT,
  victoryPoints,
  type Action,
  type BuildKind,
  type Difficulty,
  type GameState,
  type Resource,
  type ResourceBag,
} from '../engine';
import { nextRandom, type RngHolder } from '../engine/rng';

const MAX_TRADES_PER_TURN = 6;

// ---------------------------------------------------------------------------
// Evaluation helpers

function aiRng(state: GameState, player: number): RngHolder {
  return { rngState: (state.rngState ^ Math.imul(player + 1, 0x9e3779b1) ^ (state.log.length * 7919)) | 0 };
}

/** Total pips per resource over the whole island — scarce resources are worth more. */
function resourceWeights(state: GameState): Record<Resource, number> {
  const totals = bag();
  for (const h of state.hexes) if (h.terrain !== 'waste') totals[h.terrain] += pips(h.token);
  const avg = RESOURCES.reduce((s, r) => s + totals[r], 0) / RESOURCES.length;
  const w = {} as Record<Resource, number>;
  for (const r of RESOURCES) w[r] = Math.min(1.5, Math.max(0.75, avg / Math.max(1, totals[r])));
  return w;
}

/** Pips per resource that `player` currently collects. */
export function productionOf(state: GameState, player: number): ResourceBag {
  const out = bag();
  state.buildings.forEach((b, v) => {
    if (!b || b.owner !== player) return;
    for (const h of TOPOLOGY.vertexHexes[v]) {
      const hex = state.hexes[h];
      if (hex.terrain === 'waste' || h === state.raiderHex) continue;
      out[hex.terrain] += pips(hex.token) * (b.kind === 'city' ? 2 : 1);
    }
  });
  return out;
}

function portAt(state: GameState, vertex: number) {
  return state.ports.find((p) => TOPOLOGY.edgeVertices[p.edge].includes(vertex)) ?? null;
}

/** How attractive a settlement at `vertex` is for `player`. */
export function vertexValue(state: GameState, player: number, vertex: number, difficulty: Difficulty): number {
  const hexes = TOPOLOGY.vertexHexes[vertex].map((h) => state.hexes[h]);
  if (difficulty === 'basic') return hexes.reduce((s, h) => s + pips(h.token), 0);

  const weights = resourceWeights(state);
  const current = productionOf(state, player);
  let score = 0;
  const seen = new Set<Resource>();
  for (const h of hexes) {
    if (h.terrain === 'waste') continue;
    const p = pips(h.token) * weights[h.terrain];
    score += h.id === state.raiderHex ? p * 0.4 : p;
    // Diversity: a resource we do not produce yet (or only a little) is worth extra.
    if (!seen.has(h.terrain)) {
      seen.add(h.terrain);
      if (current[h.terrain] === 0) score += 2.5;
      else if (current[h.terrain] < 4) score += 1;
    }
  }
  const port = portAt(state, vertex);
  if (port) {
    if (port.resource === null) score += 1.5;
    else score += Math.min(3, (current[port.resource] + (seen.has(port.resource) ? 3 : 0)) / 2);
  }
  return score;
}

/** Room to grow: the value of open spots two steps away. */
function expansionValue(state: GameState, player: number, vertex: number): number {
  let best = 0;
  let count = 0;
  for (const n of TOPOLOGY.vertexNeighbors[vertex]) {
    for (const m of TOPOLOGY.vertexNeighbors[n]) {
      if (m === vertex || state.buildings[m]) continue;
      if (TOPOLOGY.vertexNeighbors[m].some((x) => state.buildings[x] || x === vertex)) continue;
      const v = vertexValue(state, player, m, 'intermediate');
      best = Math.max(best, v);
      count++;
    }
  }
  return best * 0.25 + Math.min(count, 4) * 0.3;
}

function missing(have: ResourceBag, cost: ResourceBag): ResourceBag {
  const out = bag();
  for (const r of RESOURCES) out[r] = Math.max(0, cost[r] - have[r]);
  return out;
}

interface RoadTarget {
  vertex: number;
  firstEdge: number;
  distance: number;
  score: number;
}

/**
 * Shortest routes over open paths from the player's network to open settlement
 * spots. Returns candidates sorted by value.
 */
function roadTargets(state: GameState, player: number, difficulty: Difficulty, maxDistance = 3): RoadTarget[] {
  const blocked = (v: number) => {
    const b = state.buildings[v];
    return !!b && b.owner !== player;
  };
  const dist = new Map<number, number>();
  const first = new Map<number, number>();
  const queue: number[] = [];
  for (let v = 0; v < VERTEX_COUNT; v++) {
    const own = state.buildings[v]?.owner === player || TOPOLOGY.vertexEdges[v].some((e) => state.roads[e] === player);
    if (own && !blocked(v)) {
      dist.set(v, 0);
      queue.push(v);
    }
  }
  while (queue.length) {
    const v = queue.shift()!;
    const d = dist.get(v)!;
    if (d >= maxDistance) continue;
    for (const e of TOPOLOGY.vertexEdges[v]) {
      if (state.roads[e] !== null) continue;
      const [a, b] = TOPOLOGY.edgeVertices[e];
      const next = a === v ? b : a;
      if (dist.has(next)) continue;
      dist.set(next, d + 1);
      first.set(next, d === 0 ? e : first.get(v)!);
      if (!blocked(next)) queue.push(next);
    }
  }
  const out: RoadTarget[] = [];
  for (const [v, d] of dist) {
    if (d === 0 || state.buildings[v]) continue;
    if (TOPOLOGY.vertexNeighbors[v].some((n) => state.buildings[n])) continue;
    const value = vertexValue(state, player, v, difficulty);
    out.push({ vertex: v, firstEdge: first.get(v)!, distance: d, score: value / (0.6 + d * 0.7) });
  }
  return out.sort((x, y) => y.score - x.score);
}

// ---------------------------------------------------------------------------
// Planning

interface Plan {
  kind: BuildKind;
  target: number | null;
}

/** What the player is saving for right now. */
function primaryGoal(state: GameState, player: number, difficulty: Difficulty): Plan | null {
  const me = state.players[player];
  const have = me.resources;
  const options: { plan: Plan; score: number }[] = [];

  const spots = legalSettlementVertices(state, player);
  if (spots.length) {
    const best = spots.reduce((a, b) =>
      vertexValue(state, player, a, difficulty) >= vertexValue(state, player, b, difficulty) ? a : b,
    );
    options.push({ plan: { kind: 'settlement', target: best }, score: 10 - totalCards(missing(have, COSTS.settlement)) });
  }
  const cities = legalCityVertices(state, player);
  if (cities.length) {
    const best = cities.reduce((a, b) =>
      vertexValue(state, player, a, 'basic') >= vertexValue(state, player, b, 'basic') ? a : b,
    );
    options.push({ plan: { kind: 'city', target: best }, score: 9.5 - totalCards(missing(have, COSTS.city)) });
  }
  if (!spots.length && me.settlementsLeft > 0 && me.roadsLeft > 0) {
    const targets = roadTargets(state, player, difficulty);
    if (targets.length) options.push({ plan: { kind: 'road', target: targets[0].firstEdge }, score: 8.5 - totalCards(missing(have, COSTS.road)) });
  }
  if (state.devDeck.length > 0) {
    options.push({ plan: { kind: 'devCard', target: null }, score: 6 - totalCards(missing(have, COSTS.devCard)) });
  }
  if (!options.length) return null;
  if (difficulty === 'basic') return options[0].plan;
  options.sort((a, b) => b.score - a.score);
  return options[0].plan;
}

function planToAction(plan: Plan): Action {
  switch (plan.kind) {
    case 'settlement':
      return { type: 'buildSettlement', vertex: plan.target! };
    case 'city':
      return { type: 'buildCity', vertex: plan.target! };
    case 'road':
      return { type: 'buildRoad', edge: plan.target! };
    case 'devCard':
      return { type: 'buyDevCard' };
  }
}

/** A bank trade that makes `cost` affordable, if surplus allows it. */
function tradeToward(state: GameState, player: number, cost: ResourceBag): Extract<Action, { type: "bankTrade" }> | null {
  if (state.tradesThisTurn >= MAX_TRADES_PER_TURN) return null;
  const have = state.players[player].resources;
  const need = missing(have, cost);
  const needTotal = totalCards(need);
  if (needTotal === 0) return null;
  let capacity = 0;
  const surplus = bag();
  for (const r of RESOURCES) {
    surplus[r] = Math.max(0, have[r] - cost[r]);
    capacity += Math.floor(surplus[r] / tradeRatio(state, player, r));
  }
  if (capacity < needTotal) return null;
  const get = RESOURCES.find((r) => need[r] > 0 && state.bank[r] > 0);
  if (!get) return null;
  const give = RESOURCES.filter((r) => surplus[r] >= tradeRatio(state, player, r)).sort(
    (a, b) => tradeRatio(state, player, a) - tradeRatio(state, player, b) || surplus[b] - surplus[a],
  )[0];
  return give ? { type: 'bankTrade', give, get } : null;
}

// ---------------------------------------------------------------------------
// Decisions

function chooseSetupSettlement(state: GameState, player: number, difficulty: Difficulty, rng: RngHolder): Action {
  const legal = legalSetupSettlementVertices(state);
  const scored = legal
    .map((v) => {
      let score = vertexValue(state, player, v, difficulty);
      if (difficulty === 'intermediate') score += expansionValue(state, player, v);
      else score += nextRandom(rng) * 3;
      return { v, score };
    })
    .sort((a, b) => b.score - a.score);
  const pick = difficulty === 'basic' ? scored[Math.floor(nextRandom(rng) * Math.min(4, scored.length))] : scored[0];
  return { type: 'placeSetupSettlement', vertex: pick.v };
}

function chooseSetupRoad(state: GameState, player: number, difficulty: Difficulty, rng: RngHolder): Action {
  const edges = legalSetupRoadEdges(state);
  if (difficulty === 'basic') return { type: 'placeSetupRoad', edge: edges[Math.floor(nextRandom(rng) * edges.length)] };
  const from = state.setup!.lastSettlement!;
  let best = edges[0];
  let bestScore = -Infinity;
  for (const e of edges) {
    const [a, b] = TOPOLOGY.edgeVertices[e];
    const mid = a === from ? b : a;
    let score = 0;
    for (const m of TOPOLOGY.vertexNeighbors[mid]) {
      if (m === from || state.buildings[m]) continue;
      if (TOPOLOGY.vertexNeighbors[m].some((x) => state.buildings[x])) continue;
      score = Math.max(score, vertexValue(state, player, m, difficulty));
    }
    if (score > bestScore) {
      bestScore = score;
      best = e;
    }
  }
  return { type: 'placeSetupRoad', edge: best };
}

export function chooseDiscard(state: GameState, player: number, difficulty: Difficulty): ResourceBag {
  const count = state.pendingDiscards[player] ?? 0;
  const hand = { ...state.players[player].resources };
  const goal = primaryGoal(state, player, difficulty);
  const keep = goal ? COSTS[goal.kind] : bag();
  const out = bag();
  for (let i = 0; i < count; i++) {
    const r = RESOURCES.filter((x) => hand[x] > 0).sort(
      (a, b) => hand[b] - keep[b] - (hand[a] - keep[a]) || hand[b] - hand[a],
    )[0];
    hand[r]--;
    out[r]++;
  }
  return out;
}

function hexThreat(state: GameState, player: number, hex: number): { enemy: number; own: number; victims: number[] } {
  let enemy = 0;
  let own = 0;
  const p = pips(state.hexes[hex].token);
  const victims = new Set<number>();
  for (const v of TOPOLOGY.hexVertices[hex]) {
    const b = state.buildings[v];
    if (!b) continue;
    const weight = p * (b.kind === 'city' ? 2 : 1);
    if (b.owner === player) own += weight;
    else {
      // Focus on whoever is ahead.
      enemy += weight * (1 + victoryPoints(state, b.owner, false) / 5);
      victims.add(b.owner);
    }
  }
  return { enemy, own, victims: [...victims] };
}

function chooseRaiderHex(state: GameState, player: number, difficulty: Difficulty, rng: RngHolder): number {
  const hexes = legalRaiderHexes(state);
  const scored = hexes.map((h) => {
    const t = hexThreat(state, player, h);
    const stealable = stealCandidatesFor(state, player, h).length > 0 ? 2 : 0;
    const score =
      difficulty === 'basic' ? t.enemy + (t.own > 0 ? -5 : 0) + nextRandom(rng) * 6 : t.enemy - t.own * 3 + stealable;
    return { h, score };
  });
  scored.sort((a, b) => b.score - a.score);
  return scored[0].h;
}

function chooseVictim(state: GameState, player: number, difficulty: Difficulty, rng: RngHolder): number {
  const c = state.stealCandidates.filter((p) => p !== player);
  if (difficulty === 'basic') return c[Math.floor(nextRandom(rng) * c.length)];
  return c.sort(
    (a, b) =>
      victoryPoints(state, b, false) * 2 +
      totalCards(state.players[b].resources) -
      (victoryPoints(state, a, false) * 2 + totalCards(state.players[a].resources)),
  )[0];
}

function raiderHurtsMe(state: GameState, player: number): boolean {
  return TOPOLOGY.hexVertices[state.raiderHex].some((v) => state.buildings[v]?.owner === player) &&
    pips(state.hexes[state.raiderHex].token) >= 3;
}

function shouldPlayWarden(state: GameState, player: number, difficulty: Difficulty): boolean {
  if (!canPlayDevCard(state, player, 'warden')) return false;
  if (raiderHurtsMe(state, player)) return true;
  if (difficulty === 'basic') return false;
  const me = state.players[player];
  const holder = state.largestArmyHolder;
  const needed = holder === null ? 3 : state.players[holder].wardensPlayed + 1;
  if (holder !== player && me.wardensPlayed + 1 >= needed - 1) return true;
  return state.phase === 'main';
}

function chooseDevCardPlay(state: GameState, player: number, difficulty: Difficulty): Action | null {
  if (state.devCardPlayedThisTurn) return null;
  const me = state.players[player];
  const goal = primaryGoal(state, player, difficulty);

  if (shouldPlayWarden(state, player, difficulty)) return { type: 'playWarden' };

  if (canPlayDevCard(state, player, 'embargo')) {
    let best: Resource = 'timber';
    let bestCount = -1;
    for (const r of RESOURCES) {
      const held = state.players.filter((p) => p.id !== player).reduce((s, p) => s + p.resources[r], 0);
      const bonus = goal && COSTS[goal.kind][r] > me.resources[r] ? 1 : 0;
      if (held + bonus > bestCount) {
        bestCount = held + bonus;
        best = r;
      }
    }
    if (bestCount >= (difficulty === 'basic' ? 4 : 3)) return { type: 'playEmbargo', resource: best };
  }

  if (canPlayDevCard(state, player, 'bounty')) {
    const cost = goal ? COSTS[goal.kind] : COSTS.city;
    const need = missing(me.resources, cost);
    const picks: Resource[] = [];
    const bank = { ...state.bank };
    for (const r of RESOURCES) {
      while (need[r] > 0 && picks.length < 2 && bank[r] > 0) {
        picks.push(r);
        need[r]--;
        bank[r]--;
      }
    }
    for (const r of RESOURCES) if (picks.length < 2 && bank[r] > 0) {
      picks.push(r);
      bank[r]--;
    }
    if (picks.length === 2 && (difficulty === 'basic' || totalCards(missing(me.resources, cost)) <= 3))
      return { type: 'playBounty', resources: [picks[0], picks[1]] };
  }

  if (canPlayDevCard(state, player, 'surveyor') && me.roadsLeft >= 1) {
    const useful = legalSettlementVertices(state, player).length === 0 && roadTargets(state, player, difficulty).length > 0;
    const racing = difficulty === 'intermediate' && longestRoadLength(state, player) >= 3;
    if (useful || racing || difficulty === 'basic') return { type: 'playSurveyor' };
  }
  return null;
}

function chooseRoadEdge(state: GameState, player: number, difficulty: Difficulty, rng: RngHolder): number | null {
  const legal = legalRoadEdges(state, player);
  if (!legal.length) return null;
  const targets = roadTargets(state, player, difficulty).filter((t) => legal.includes(t.firstEdge));
  if (targets.length) return targets[0].firstEdge;
  // No settlement to aim for: extend the longest road instead.
  let best = legal[0];
  let bestLen = -1;
  for (const e of legal) {
    const trial = structuredClone(state);
    trial.roads[e] = player;
    const len = longestRoadLength(trial, player) + nextRandom(rng) * 0.1;
    if (len > bestLen) {
      bestLen = len;
      best = e;
    }
  }
  return best;
}

function chooseMainAction(state: GameState, player: number, difficulty: Difficulty, rng: RngHolder): Action {
  const me = state.players[player];

  const dev = chooseDevCardPlay(state, player, difficulty);
  if (dev) return dev;

  // Build anything worthwhile we can afford, best first.
  const cities = legalCityVertices(state, player);
  if (cities.length && canAfford(state, player, 'city')) {
    const best = cities.reduce((a, b) =>
      vertexValue(state, player, a, 'basic') >= vertexValue(state, player, b, 'basic') ? a : b,
    );
    return { type: 'buildCity', vertex: best };
  }
  const spots = legalSettlementVertices(state, player);
  if (spots.length && canAfford(state, player, 'settlement')) {
    const best = spots.reduce((a, b) =>
      vertexValue(state, player, a, difficulty) >= vertexValue(state, player, b, difficulty) ? a : b,
    );
    return { type: 'buildSettlement', vertex: best };
  }

  const goal = primaryGoal(state, player, difficulty);

  if (canAfford(state, player, 'road') && me.roadsLeft > 0) {
    const wantRoad =
      (spots.length === 0 && me.settlementsLeft > 0) ||
      (difficulty === 'intermediate' && roadRaceWorthIt(state, player)) ||
      (difficulty === 'basic' && nextRandom(rng) < 0.3);
    // Do not spend settlement materials on a road when a spot is waiting.
    const savingForSettlement = goal?.kind === 'settlement';
    if (wantRoad && !savingForSettlement) {
      const edge = chooseRoadEdge(state, player, difficulty, rng);
      if (edge !== null) return { type: 'buildRoad', edge };
    }
  }

  if (canAfford(state, player, 'devCard') && state.devDeck.length > 0) {
    const after = { ...me.resources };
    for (const r of RESOURCES) after[r] -= COSTS.devCard[r];
    const hurtsGoal =
      goal && goal.kind !== 'devCard' &&
      totalCards(missing(after, COSTS[goal.kind])) > totalCards(missing(me.resources, COSTS[goal.kind]));
    if (!hurtsGoal || totalCards(me.resources) > 7 || goal?.kind === 'devCard') return { type: 'buyDevCard' };
  }

  if (goal) {
    if (hasResources(me.resources, COSTS[goal.kind])) {
      const action = planToAction(goal);
      if (goal.kind !== 'road' || legalRoadEdges(state, player).includes(goal.target!)) return action;
    }
    const trade = tradeToward(state, player, COSTS[goal.kind]);
    if (trade && (difficulty === 'intermediate' || me.resources[trade.give] >= 5 || totalCards(me.resources) > 7))
      return trade;
  }

  // Too many cards risk losing half to a 7: try converting some.
  if (totalCards(me.resources) > 7 && state.tradesThisTurn < MAX_TRADES_PER_TURN) {
    for (const kind of ['city', 'settlement', 'devCard', 'road'] as BuildKind[]) {
      const trade = tradeToward(state, player, COSTS[kind]);
      if (trade) return trade;
    }
  }
  return { type: 'endTurn' };
}

function roadRaceWorthIt(state: GameState, player: number): boolean {
  const mine = longestRoadLength(state, player);
  if (state.longestRoadHolder === player) {
    const best = Math.max(...state.players.filter((p) => p.id !== player).map((p) => longestRoadLength(state, p.id)));
    return best >= mine - 1;
  }
  const holderLen = state.longestRoadHolder === null ? 4 : longestRoadLength(state, state.longestRoadHolder);
  return mine >= holderLen - 1 && mine >= 3;
}

/** Choose the next action for `player`. Must only be called when that player is due to act. */
export function chooseAction(state: GameState, player: number): Action {
  const difficulty = state.players[player].difficulty;
  const rng = aiRng(state, player);
  switch (state.phase) {
    case 'setup':
      return state.setup!.step === 'settlement'
        ? chooseSetupSettlement(state, player, difficulty, rng)
        : chooseSetupRoad(state, player, difficulty, rng);
    case 'roll':
      if (shouldPlayWarden(state, player, difficulty) && raiderHurtsMe(state, player)) return { type: 'playWarden' };
      return { type: 'rollDice' };
    case 'discard':
      return { type: 'discard', player, cards: chooseDiscard(state, player, difficulty) };
    case 'moveRaider':
      return { type: 'moveRaider', hex: chooseRaiderHex(state, player, difficulty, rng) };
    case 'steal':
      return { type: 'steal', victim: chooseVictim(state, player, difficulty, rng) };
    case 'roadBuilding': {
      const edge = chooseRoadEdge(state, player, difficulty, rng);
      return { type: 'placeFreeRoad', edge: edge ?? legalRoadEdges(state, player)[0] };
    }
    case 'main':
      return chooseMainAction(state, player, difficulty, rng);
    case 'gameOver':
      throw new Error('The game is over');
  }
}

export interface TradeResponse {
  accept: boolean;
  /** Short in-character explanation shown to the proposer. */
  reason: string;
}

/**
 * How an AI player answers a trade proposed by the current player.
 * `receive` is what the AI would get, `pay` what it would hand over.
 */
export function tradeResponse(state: GameState, player: number, receive: ResourceBag, pay: ResourceBag): TradeResponse {
  const me = state.players[player];
  if (totalCards(receive) === 0 || totalCards(pay) === 0) return { accept: false, reason: 'An offer needs both sides.' };
  // Checked before hand contents so a refusal never reveals what the rival holds.
  if (victoryPoints(state, state.currentPlayer, false) >= 8) {
    return { accept: false, reason: "You're too close to winning." };
  }
  if (!hasResources(me.resources, pay)) return { accept: false, reason: "Can't spare those cards." };
  const goal = primaryGoal(state, player, me.difficulty);
  const cost = goal ? COSTS[goal.kind] : COSTS.city;
  const before = totalCards(missing(me.resources, cost));
  const after = { ...me.resources };
  for (const r of RESOURCES) after[r] += receive[r] - pay[r];
  const afterMissing = totalCards(missing(after, cost));
  const netCards = totalCards(receive) - totalCards(pay);
  const accept =
    me.difficulty === 'basic'
      ? afterMissing <= before && netCards >= 0
      : afterMissing < before || (afterMissing === before && netCards > 0);
  if (accept) {
    const goalName = goal ? { road: 'a road', settlement: 'a settlement', city: 'a city', devCard: 'a development card' }[goal.kind] : null;
    return { accept, reason: afterMissing < before && goalName ? `Helps me toward ${goalName}.` : 'Fair enough.' };
  }
  return { accept, reason: afterMissing > before ? 'I need those cards myself.' : 'Not worth it for me.' };
}

export function acceptsTrade(state: GameState, player: number, receive: ResourceBag, pay: ResourceBag): boolean {
  return tradeResponse(state, player, receive, pay).accept;
}

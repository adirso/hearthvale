import { bag, createGame, TOPOLOGY, type GameState, type ResourceBag } from '../src/engine';

export const TEST_PLAYERS = [
  { name: 'Ada', isHuman: true, difficulty: 'basic' as const, color: '#c0392b' },
  { name: 'Bram', isHuman: false, difficulty: 'basic' as const, color: '#2e86c1' },
  { name: 'Cleo', isHuman: false, difficulty: 'basic' as const, color: '#e2b007' },
];

export function newGame(seed = 42): GameState {
  return createGame({ seed, players: TEST_PLAYERS, firstPlayer: 0 });
}

/** A game with setup skipped: player 0 to act in the main phase, empty board. */
export function mainPhaseGame(seed = 42): GameState {
  const s = newGame(seed);
  s.setup = null;
  s.phase = 'main';
  s.turn = 1;
  s.currentPlayer = 0;
  s.hasRolled = true;
  return s;
}

export function give(state: GameState, player: number, resources: Partial<ResourceBag>) {
  const b = bag(resources);
  for (const r of Object.keys(b) as (keyof ResourceBag)[]) {
    state.players[player].resources[r] += b[r];
    state.bank[r] -= b[r];
  }
}

export function placeSettlement(state: GameState, player: number, vertex: number, kind: 'settlement' | 'city' = 'settlement') {
  state.buildings[vertex] = { owner: player, kind };
  if (kind === 'settlement') state.players[player].settlementsLeft--;
  else state.players[player].citiesLeft--;
}

export function placeRoad(state: GameState, player: number, edge: number) {
  state.roads[edge] = player;
  state.players[player].roadsLeft--;
}

/**
 * Finds a simple path of `length` edges. Returns the vertices along it
 * (length + 1 entries) and the edges between them.
 */
export function findPath(length: number, accept: (vertices: number[]) => boolean = () => true) {
  const search = (vertices: number[], edges: number[]): { vertices: number[]; edges: number[] } | null => {
    if (edges.length === length) return accept(vertices) ? { vertices, edges } : null;
    const last = vertices[vertices.length - 1];
    for (const e of TOPOLOGY.vertexEdges[last]) {
      const [a, b] = TOPOLOGY.edgeVertices[e];
      const next = a === last ? b : a;
      if (vertices.includes(next)) continue;
      const found = search([...vertices, next], [...edges, e]);
      if (found) return found;
    }
    return null;
  };
  for (let start = 0; start < TOPOLOGY.vertexPoints.length; start++) {
    const found = search([start], []);
    if (found) return found;
  }
  throw new Error('no path found');
}

export function hexWithToken(state: GameState, predicate: (token: number) => boolean = () => true) {
  const hex = state.hexes.find((h) => h.token !== null && predicate(h.token) && h.id !== state.raiderHex);
  if (!hex) throw new Error('no hex found');
  return hex;
}

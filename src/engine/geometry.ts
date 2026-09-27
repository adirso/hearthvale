// Fixed topology of the 19-hex island: hexes, intersections (vertices) and
// paths (edges), plus adjacency tables. Terrain is assigned separately, so
// this topology is shared by every game.

export interface Point {
  x: number;
  y: number;
}

export interface Topology {
  hexCoords: { q: number; r: number }[];
  hexCenters: Point[];
  /** Six vertex ids per hex, clockwise from the top. */
  hexVertices: number[][];
  vertexPoints: Point[];
  vertexHexes: number[][];
  vertexNeighbors: number[][];
  vertexEdges: number[][];
  edgeVertices: [number, number][];
  edgeHexes: number[][];
  /** Coastal edges (touching only one hex), ordered clockwise around the island. */
  coastEdges: number[];
  hexNeighbors: number[][];
}

const SQRT3 = Math.sqrt(3);

function buildTopology(): Topology {
  const hexCoords: { q: number; r: number }[] = [];
  for (let r = -2; r <= 2; r++) {
    for (let q = -2; q <= 2; q++) {
      if (Math.abs(q + r) <= 2) hexCoords.push({ q, r });
    }
  }

  const hexCenters = hexCoords.map(({ q, r }) => ({ x: SQRT3 * (q + r / 2), y: 1.5 * r }));

  const vertexPoints: Point[] = [];
  const vertexKey = new Map<string, number>();
  const keyOf = (p: Point) => `${Math.round(p.x * 1000)},${Math.round(p.y * 1000)}`;

  const hexVertices = hexCenters.map((c) => {
    const ids: number[] = [];
    for (let i = 0; i < 6; i++) {
      // Pointy-top hex: corner 0 at the top, then clockwise.
      const angle = (Math.PI / 180) * (60 * i - 90);
      const p = { x: c.x + Math.cos(angle), y: c.y + Math.sin(angle) };
      const key = keyOf(p);
      let id = vertexKey.get(key);
      if (id === undefined) {
        id = vertexPoints.length;
        vertexPoints.push(p);
        vertexKey.set(key, id);
      }
      ids.push(id);
    }
    return ids;
  });

  const vertexHexes: number[][] = vertexPoints.map(() => []);
  hexVertices.forEach((vs, h) => vs.forEach((v) => vertexHexes[v].push(h)));

  const edgeVertices: [number, number][] = [];
  const edgeKey = new Map<string, number>();
  const edgeHexes: number[][] = [];
  hexVertices.forEach((vs, h) => {
    for (let i = 0; i < 6; i++) {
      const a = vs[i];
      const b = vs[(i + 1) % 6];
      const key = a < b ? `${a}-${b}` : `${b}-${a}`;
      let id = edgeKey.get(key);
      if (id === undefined) {
        id = edgeVertices.length;
        edgeVertices.push(a < b ? [a, b] : [b, a]);
        edgeHexes.push([]);
        edgeKey.set(key, id);
      }
      edgeHexes[id].push(h);
    }
  });

  const vertexEdges: number[][] = vertexPoints.map(() => []);
  const vertexNeighbors: number[][] = vertexPoints.map(() => []);
  edgeVertices.forEach(([a, b], e) => {
    vertexEdges[a].push(e);
    vertexEdges[b].push(e);
    vertexNeighbors[a].push(b);
    vertexNeighbors[b].push(a);
  });

  const coastEdges = edgeVertices
    .map((_, e) => e)
    .filter((e) => edgeHexes[e].length === 1)
    .sort((e1, e2) => angleOfEdge(e1) - angleOfEdge(e2));

  function angleOfEdge(e: number): number {
    const [a, b] = edgeVertices[e];
    const mx = (vertexPoints[a].x + vertexPoints[b].x) / 2;
    const my = (vertexPoints[a].y + vertexPoints[b].y) / 2;
    return Math.atan2(my, mx);
  }

  const hexNeighbors = hexCoords.map(({ q, r }) =>
    hexCoords
      .map((o, i) => ({ o, i }))
      .filter(({ o }) => {
        const dq = o.q - q;
        const dr = o.r - r;
        return (Math.abs(dq) + Math.abs(dr) + Math.abs(dq + dr)) / 2 === 1;
      })
      .map(({ i }) => i),
  );

  return {
    hexCoords,
    hexCenters,
    hexVertices,
    vertexPoints,
    vertexHexes,
    vertexNeighbors,
    vertexEdges,
    edgeVertices,
    edgeHexes,
    coastEdges,
    hexNeighbors,
  };
}

export const TOPOLOGY: Topology = buildTopology();
export const VERTEX_COUNT = TOPOLOGY.vertexPoints.length;
export const EDGE_COUNT = TOPOLOGY.edgeVertices.length;
export const HEX_COUNT = TOPOLOGY.hexCoords.length;

/** The edge connecting two vertices, or -1. */
export function edgeBetween(a: number, b: number): number {
  for (const e of TOPOLOGY.vertexEdges[a]) {
    const [x, y] = TOPOLOGY.edgeVertices[e];
    if ((x === a && y === b) || (x === b && y === a)) return e;
  }
  return -1;
}

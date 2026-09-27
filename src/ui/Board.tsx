import { useMemo, useRef, useState, type PointerEvent } from 'react';
import { RESOURCE_LABEL, TOPOLOGY, type GameState } from '../engine';
import {
  CityShape,
  NumberToken,
  RaiderFigure,
  RESOURCE_COLOR,
  ResourceGlyph,
  SettlementShape,
  TERRAIN_FILL,
  TerrainArt,
} from './art';

const S = 60;

export type VertexBuild = 'settlement' | 'city';

export interface BoardTargets {
  /** Glowing targets for the decision at hand (setup, a chosen build mode, the raider…). */
  vertices: Set<number>;
  edges: Set<number>;
  hexes: Set<number>;
  /** Piece to preview on a glowing vertex target. */
  vertexGhost?: VertexBuild;
  /** Builds available without choosing a mode: invisible until hovered. */
  quickEdges?: Set<number>;
  quickVertices?: Map<number, VertexBuild>;
  /** Colour of the player who would build. */
  ghostColor?: string;
}

export const NO_TARGETS: BoardTargets = { vertices: new Set(), edges: new Set(), hexes: new Set() };

type Preview = { kind: 'edge'; id: number } | { kind: 'vertex'; id: number; build: VertexBuild } | null;

interface BoardProps {
  state: GameState;
  targets: BoardTargets;
  focusVertex: number | null;
  onFocusVertex: (v: number | null) => void;
  onVertex: (v: number) => void;
  onEdge: (e: number) => void;
  onHex: (h: number) => void;
}

const px = (v: number) => ({ x: TOPOLOGY.vertexPoints[v].x * S, y: TOPOLOGY.vertexPoints[v].y * S });

export function Board({ state, targets, focusVertex, onFocusVertex, onVertex, onEdge, onHex }: BoardProps) {
  const viewBox = useMemo(() => {
    const xs = TOPOLOGY.vertexPoints.map((p) => p.x * S);
    const ys = TOPOLOGY.vertexPoints.map((p) => p.y * S);
    const m = S * 1.05;
    const minX = Math.min(...xs) - m;
    const minY = Math.min(...ys) - m;
    return `${minX} ${minY} ${Math.max(...xs) - minX + m} ${Math.max(...ys) - minY + m}`;
  }, []);

  const [preview, setPreview] = useState<Preview>(null);
  const pointerType = useRef<string>('mouse');
  const quickEdges = targets.quickEdges ?? new Set<number>();
  const quickVertices = targets.quickVertices ?? new Map<number, VertexBuild>();
  const ghostColor = targets.ghostColor ?? '#ffffff';

  // Drop a preview that is no longer offered (after building, end of turn…).
  const livePreview: Preview =
    preview &&
    ((preview.kind === 'edge' && (targets.edges.has(preview.id) || quickEdges.has(preview.id))) ||
      (preview.kind === 'vertex' && (targets.vertices.has(preview.id) || quickVertices.has(preview.id))))
      ? preview
      : null;

  const vertexBuild = (v: number): VertexBuild | null =>
    targets.vertices.has(v) && targets.vertexGhost ? targets.vertexGhost : (quickVertices.get(v) ?? null);

  // A tap fires pointerenter before pointerdown, so read the type from the event itself.
  const hoverEdge = (e: number, ev: PointerEvent) => {
    pointerType.current = ev.pointerType;
    if (ev.pointerType === 'mouse') setPreview({ kind: 'edge', id: e });
  };
  const hoverVertex = (v: number, ev: PointerEvent) => {
    pointerType.current = ev.pointerType;
    onFocusVertex(v);
    const build = vertexBuild(v);
    if (build && ev.pointerType === 'mouse') setPreview({ kind: 'vertex', id: v, build });
  };
  const leave = () => {
    if (pointerType.current === 'mouse') setPreview(null);
  };
  /** Quick builds on touch screens need two taps: the first one previews. */
  const clickEdge = (e: number) => {
    const quick = !targets.edges.has(e);
    if (quick && pointerType.current !== 'mouse' && !(livePreview?.kind === 'edge' && livePreview.id === e)) {
      setPreview({ kind: 'edge', id: e });
      return;
    }
    setPreview(null);
    onEdge(e);
  };
  const clickVertex = (v: number) => {
    const build = vertexBuild(v);
    if (!targets.vertices.has(v) && !build) {
      onFocusVertex(focusVertex === v ? null : v);
      return;
    }
    const quick = !targets.vertices.has(v);
    if (quick && pointerType.current !== 'mouse' && !(livePreview?.kind === 'vertex' && livePreview.id === v)) {
      onFocusVertex(v);
      setPreview({ kind: 'vertex', id: v, build: build! });
      return;
    }
    setPreview(null);
    onVertex(v);
  };

  const focusHexes = new Set(focusVertex === null ? [] : TOPOLOGY.vertexHexes[focusVertex]);
  const change = state.lastChange;
  const changeKey = state.log.length;

  return (
    <svg
      className="board"
      viewBox={viewBox}
      role="img"
      aria-label="Island board"
      onPointerDown={(e) => (pointerType.current = e.pointerType)}
      onPointerMove={(e) => (pointerType.current = e.pointerType)}
    >
      <defs>
        <radialGradient id="sea" cx="50%" cy="50%" r="65%">
          <stop offset="0%" stopColor="#3b8bb8" />
          <stop offset="100%" stopColor="#1d4f75" />
        </radialGradient>
      </defs>
      <rect x="-1000" y="-1000" width="2000" height="2000" fill="url(#sea)" />

      {/* Coastline */}
      {TOPOLOGY.coastEdges.map((e) => {
        const [a, b] = TOPOLOGY.edgeVertices[e];
        const p = px(a);
        const q = px(b);
        return <line key={e} x1={p.x} y1={p.y} x2={q.x} y2={q.y} stroke="#e9dcb4" strokeWidth={S * 0.22} strokeLinecap="round" />;
      })}

      {/* Harbors */}
      {state.ports.map((port) => {
        const [a, b] = TOPOLOGY.edgeVertices[port.edge];
        const p = px(a);
        const q = px(b);
        const mx = (p.x + q.x) / 2;
        const my = (p.y + q.y) / 2;
        const len = Math.hypot(mx, my);
        const ox = mx + (mx / len) * S * 0.62;
        const oy = my + (my / len) * S * 0.62;
        const label = port.resource ? `2:1 ${RESOURCE_LABEL[port.resource]} harbor` : '3:1 harbor (any resource)';
        return (
          <g key={port.edge} className="harbor">
            <title>{label}</title>
            <line x1={p.x} y1={p.y} x2={ox} y2={oy} stroke="#7a5230" strokeWidth={S * 0.07} />
            <line x1={q.x} y1={q.y} x2={ox} y2={oy} stroke="#7a5230" strokeWidth={S * 0.07} />
            <circle cx={ox} cy={oy} r={S * 0.3} fill={port.resource ? RESOURCE_COLOR[port.resource] : '#f3ecd9'} stroke="#4a3219" strokeWidth={S * 0.04} />
            {port.resource ? (
              <g transform={`translate(${ox - S * 0.15},${oy - S * 0.24})`}>
                <ResourceGlyph resource={port.resource} size={S * 0.3} />
              </g>
            ) : null}
            <text x={ox} y={oy + (port.resource ? S * 0.2 : S * 0.07)} textAnchor="middle" fontSize={S * (port.resource ? 0.15 : 0.2)} fontWeight={800} fill={port.resource ? '#fff' : '#3a2a15'}>
              {port.resource ? '2:1' : '3:1'}
            </text>
          </g>
        );
      })}

      {/* Tiles */}
      {state.hexes.map((hex) => {
        const c = TOPOLOGY.hexCenters[hex.id];
        const cx = c.x * S;
        const cy = c.y * S;
        const pts = TOPOLOGY.hexVertices[hex.id].map((v) => `${px(v).x},${px(v).y}`).join(' ');
        const isTarget = targets.hexes.has(hex.id);
        return (
          <g
            key={hex.id}
            className={`tile ${isTarget ? 'target' : ''} ${focusHexes.has(hex.id) ? 'focus' : ''}`}
            onClick={isTarget ? () => onHex(hex.id) : undefined}
          >
            <polygon points={pts} fill={TERRAIN_FILL[hex.terrain]} stroke="#5b4a2c" strokeWidth={S * 0.04} />
            <TerrainArt terrain={hex.terrain} cx={cx} cy={cy} s={S} />
            {hex.token !== null && <NumberToken token={hex.token} cx={cx} cy={cy} s={S} />}
            {focusHexes.has(hex.id) && <polygon points={pts} className="focus-ring" />}
            {isTarget && <polygon points={pts} className="target-ring" />}
          </g>
        );
      })}

      {/* Roads */}
      {state.roads.map((owner, e) => {
        if (owner === null) return null;
        const [a, b] = TOPOLOGY.edgeVertices[e];
        const p = px(a);
        const q = px(b);
        const fresh = change?.kind === 'edge' && change.id === e;
        return (
          <g key={fresh ? `${e}-${changeKey}` : e} className={fresh ? 'fresh' : ''}>
            <line x1={p.x} y1={p.y} x2={q.x} y2={q.y} stroke="#1b1b1b" strokeWidth={S * 0.2} strokeLinecap="round" />
            <line x1={p.x} y1={p.y} x2={q.x} y2={q.y} stroke={state.players[owner].color} strokeWidth={S * 0.13} strokeLinecap="round" />
          </g>
        );
      })}

      {/* Edge targets: glowing ones for the current decision, invisible quick builds */}
      {[...targets.edges, ...[...quickEdges].filter((e) => !targets.edges.has(e))].map((e) => {
        const [a, b] = TOPOLOGY.edgeVertices[e];
        const p = px(a);
        const q = px(b);
        const glowing = targets.edges.has(e);
        return (
          <g
            key={`t${e}`}
            className={glowing ? 'edge-target' : 'edge-target quick'}
            onPointerEnter={(ev) => hoverEdge(e, ev)}
            onPointerLeave={leave}
            onClick={() => clickEdge(e)}
          >
            <title>Build a road here</title>
            <line x1={p.x} y1={p.y} x2={q.x} y2={q.y} className="edge-hit" strokeWidth={S * 0.42} />
            {glowing && <line x1={p.x} y1={p.y} x2={q.x} y2={q.y} className="edge-glow" strokeWidth={S * 0.12} />}
          </g>
        );
      })}

      {livePreview?.kind === 'edge' &&
        (() => {
          const [a, b] = TOPOLOGY.edgeVertices[livePreview.id];
          const p = px(a);
          const q = px(b);
          return (
            <g className="build-ghost" pointerEvents="none">
              <line x1={p.x} y1={p.y} x2={q.x} y2={q.y} stroke="#1b1b1b" strokeWidth={S * 0.2} strokeLinecap="round" />
              <line x1={p.x} y1={p.y} x2={q.x} y2={q.y} stroke={ghostColor} strokeWidth={S * 0.13} strokeLinecap="round" />
            </g>
          );
        })()}

      {/* Buildings */}
      {state.buildings.map((b, v) => {
        if (!b) return null;
        const { x, y } = px(v);
        const color = state.players[b.owner].color;
        const fresh = change?.kind === 'vertex' && change.id === v;
        return (
          <g
            key={fresh ? `${v}-${changeKey}` : v}
            className={`building ${fresh ? 'fresh' : ''} ${vertexBuild(v) ? 'buildable' : ''}`}
            onPointerEnter={(ev) => hoverVertex(v, ev)}
            onPointerLeave={() => {
              onFocusVertex(null);
              leave();
            }}
            onClick={() => clickVertex(v)}
          >
            {vertexBuild(v) === 'city' && <title>Raise a city here</title>}
            {b.kind === 'city' ? <CityShape x={x} y={y} s={S} color={color} /> : <SettlementShape x={x} y={y} s={S} color={color} />}
          </g>
        );
      })}

      {/* Vertex targets & focus handles */}
      {TOPOLOGY.vertexPoints.map((_, v) => {
        const isTarget = targets.vertices.has(v);
        if (state.buildings[v] && !isTarget) return null;
        const quick = !isTarget && quickVertices.has(v);
        const { x, y } = px(v);
        return (
          <g
            key={`v${v}`}
            className={isTarget ? 'vertex target' : quick ? 'vertex quick' : 'vertex'}
            onPointerEnter={(ev) => hoverVertex(v, ev)}
            onPointerLeave={() => {
              onFocusVertex(null);
              leave();
            }}
            onClick={() => clickVertex(v)}
          >
            {quick && <title>Found a settlement here</title>}
            {/* Generous invisible hit area for touch screens. */}
            <circle cx={x} cy={y} r={S * (isTarget || quick ? 0.34 : 0.2)} className="vertex-hit" />
            {isTarget && <circle cx={x} cy={y} r={S * 0.16} className="vertex-target" pointerEvents="none" />}
          </g>
        );
      })}

      {livePreview?.kind === 'vertex' &&
        (() => {
          const { x, y } = px(livePreview.id);
          return (
            <g className="build-ghost" pointerEvents="none">
              {livePreview.build === 'city' ? (
                <CityShape x={x} y={y} s={S} color={ghostColor} />
              ) : (
                <SettlementShape x={x} y={y} s={S} color={ghostColor} />
              )}
            </g>
          );
        })()}

      {(() => {
        const c = TOPOLOGY.hexCenters[state.raiderHex];
        const fresh = change?.kind === 'hex';
        return (
          <g key={fresh ? `r${changeKey}` : 'r'} className={fresh ? 'fresh' : ''}>
            <RaiderFigure cx={c.x * S - S * 0.5} cy={c.y * S + S * 0.05} s={S} />
          </g>
        );
      })()}
    </svg>
  );
}

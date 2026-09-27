// Original vector artwork for Hearthvale: terrain vignettes, tokens, pieces
// and resource glyphs. Everything is drawn with simple SVG primitives.

import type { ReactElement } from 'react';
import type { DevCard, Resource, Terrain } from '../engine';

export const TERRAIN_FILL: Record<Terrain, string> = {
  timber: '#3f7d45',
  clay: '#c46a3c',
  fleece: '#9fcf6e',
  harvest: '#e8c65a',
  stone: '#8d93a0',
  waste: '#dcc99a',
};

export const RESOURCE_COLOR: Record<Resource, string> = {
  timber: '#2f6b36',
  clay: '#b4532a',
  fleece: '#7fb850',
  harvest: '#d8ad2c',
  stone: '#6d7482',
};

interface ArtProps {
  cx: number;
  cy: number;
  s: number;
}

const SPOTS: [number, number][] = [
  [0, -0.6],
  [-0.5, -0.28],
  [0.5, -0.28],
  [-0.48, 0.38],
  [0.48, 0.38],
];

function Pine({ x, y, k }: { x: number; y: number; k: number }) {
  return (
    <g>
      <rect x={x - k * 0.08} y={y + k * 0.35} width={k * 0.16} height={k * 0.3} fill="#5a3b1f" />
      <polygon points={`${x},${y - k * 0.7} ${x - k * 0.42},${y + 0.05 * k} ${x + k * 0.42},${y + 0.05 * k}`} fill="#1f4f28" />
      <polygon points={`${x},${y - k * 0.35} ${x - k * 0.5},${y + 0.42 * k} ${x + k * 0.5},${y + 0.42 * k}`} fill="#245c2e" />
    </g>
  );
}

function Bricks({ x, y, k }: { x: number; y: number; k: number }) {
  const w = k * 0.38;
  const h = k * 0.18;
  return (
    <g stroke="#7a3217" strokeWidth={k * 0.03} fill="#d9804f">
      <rect x={x - w} y={y} width={w} height={h} rx={k * 0.03} />
      <rect x={x} y={y} width={w} height={h} rx={k * 0.03} />
      <rect x={x - w / 2} y={y - h} width={w} height={h} rx={k * 0.03} />
    </g>
  );
}

function Flock({ x, y, k }: { x: number; y: number; k: number }) {
  return (
    <g>
      <circle cx={x - k * 0.18} cy={y} r={k * 0.2} fill="#f7f5ee" />
      <circle cx={x + k * 0.05} cy={y - k * 0.08} r={k * 0.22} fill="#fbfaf5" />
      <circle cx={x + k * 0.24} cy={y + k * 0.02} r={k * 0.18} fill="#f1efe6" />
      <ellipse cx={x + k * 0.46} cy={y - k * 0.02} rx={k * 0.1} ry={k * 0.12} fill="#3b3a36" />
      <rect x={x - k * 0.15} y={y + k * 0.14} width={k * 0.05} height={k * 0.16} fill="#3b3a36" />
      <rect x={x + k * 0.18} y={y + k * 0.14} width={k * 0.05} height={k * 0.16} fill="#3b3a36" />
    </g>
  );
}

function Sheaf({ x, y, k }: { x: number; y: number; k: number }) {
  return (
    <g stroke="#8a6414" strokeWidth={k * 0.05} strokeLinecap="round">
      {[-0.2, 0, 0.2].map((dx) => (
        <g key={dx}>
          <line x1={x + dx * k} y1={y + k * 0.35} x2={x + dx * k * 0.4} y2={y - k * 0.3} />
          <ellipse cx={x + dx * k * 0.4} cy={y - k * 0.38} rx={k * 0.07} ry={k * 0.16} fill="#f4dc84" stroke="#a37a1c" />
        </g>
      ))}
      <line x1={x - k * 0.2} y1={y + k * 0.1} x2={x + k * 0.2} y2={y + k * 0.1} stroke="#6b4c0e" />
    </g>
  );
}

function Peak({ x, y, k }: { x: number; y: number; k: number }) {
  return (
    <g>
      <polygon points={`${x},${y - k * 0.55} ${x - k * 0.5},${y + k * 0.35} ${x + k * 0.5},${y + k * 0.35}`} fill="#5d6370" />
      <polygon points={`${x},${y - k * 0.55} ${x - k * 0.17},${y - k * 0.24} ${x + k * 0.02},${y - k * 0.3} ${x + k * 0.17},${y - k * 0.22}`} fill="#eef0f4" />
    </g>
  );
}

function Dune({ x, y, k }: { x: number; y: number; k: number }) {
  return (
    <path
      d={`M ${x - k * 0.5} ${y + k * 0.2} Q ${x - k * 0.15} ${y - k * 0.25} ${x + k * 0.2} ${y + k * 0.2} Q ${x + k * 0.4} ${y} ${x + k * 0.55} ${y + k * 0.2}`}
      fill="none"
      stroke="#b89c5f"
      strokeWidth={k * 0.07}
      strokeLinecap="round"
    />
  );
}

const ART: Record<Terrain, (p: { x: number; y: number; k: number }) => ReactElement> = {
  timber: Pine,
  clay: Bricks,
  fleece: Flock,
  harvest: Sheaf,
  stone: Peak,
  waste: Dune,
};

export function TerrainArt({ terrain, cx, cy, s }: ArtProps & { terrain: Terrain }) {
  const Piece = ART[terrain];
  const k = s * 0.42;
  const spots = terrain === 'waste' ? SPOTS.slice(0, 4) : SPOTS;
  return (
    <g pointerEvents="none">
      {spots.map(([dx, dy], i) => (
        <Piece key={i} x={cx + dx * s} y={cy + dy * s} k={k * (i === 0 ? 1.05 : 0.9)} />
      ))}
    </g>
  );
}

export function NumberToken({ token, cx, cy, s }: ArtProps & { token: number }) {
  const hot = token === 6 || token === 8;
  const dots = 6 - Math.abs(7 - token);
  const r = s * 0.3;
  return (
    <g pointerEvents="none">
      <circle cx={cx} cy={cy} r={r} fill="#f6ecd4" stroke="#6e5a37" strokeWidth={s * 0.03} />
      <text
        x={cx}
        y={cy + s * 0.04}
        textAnchor="middle"
        fontSize={s * (hot ? 0.3 : 0.27)}
        fontWeight={800}
        fill={hot ? '#b3261e' : '#2f2618'}
        fontFamily="Georgia, 'Times New Roman', serif"
      >
        {token}
      </text>
      {Array.from({ length: dots }, (_, i) => (
        <circle
          key={i}
          cx={cx + (i - (dots - 1) / 2) * s * 0.065}
          cy={cy + s * 0.17}
          r={s * 0.024}
          fill={hot ? '#b3261e' : '#2f2618'}
        />
      ))}
    </g>
  );
}

export function RaiderFigure({ cx, cy, s }: ArtProps) {
  const k = s * 0.8;
  return (
    <g className="raider" pointerEvents="none">
      <ellipse cx={cx} cy={cy + k * 0.45} rx={k * 0.38} ry={k * 0.1} fill="rgba(0,0,0,0.35)" />
      <path
        d={`M ${cx - k * 0.32} ${cy + k * 0.45} Q ${cx - k * 0.3} ${cy - k * 0.1} ${cx} ${cy - k * 0.5} Q ${cx + k * 0.3} ${cy - k * 0.1} ${cx + k * 0.32} ${cy + k * 0.45} Z`}
        fill="#22202b"
        stroke="#0d0c12"
        strokeWidth={k * 0.04}
      />
      <circle cx={cx} cy={cy - k * 0.2} r={k * 0.14} fill="#3a3646" />
      <circle cx={cx - k * 0.05} cy={cy - k * 0.21} r={k * 0.025} fill="#ffcf5c" />
      <circle cx={cx + k * 0.05} cy={cy - k * 0.21} r={k * 0.025} fill="#ffcf5c" />
    </g>
  );
}

export function SettlementShape({ x, y, s, color }: { x: number; y: number; s: number; color: string }) {
  const k = s * 0.17;
  const pts = [
    [-1, 0.8],
    [-1, -0.2],
    [0, -1.05],
    [1, -0.2],
    [1, 0.8],
  ]
    .map(([a, b]) => `${x + a * k},${y + b * k}`)
    .join(' ');
  return <polygon points={pts} fill={color} stroke="#1b1b1b" strokeWidth={s * 0.035} strokeLinejoin="round" />;
}

export function CityShape({ x, y, s, color }: { x: number; y: number; s: number; color: string }) {
  const k = s * 0.17;
  const pts = [
    [-1.3, 0.9],
    [-1.3, -0.2],
    [-0.6, -0.8],
    [0.05, -0.2],
    [0.05, -0.9],
    [0.65, -1.45],
    [1.25, -0.9],
    [1.25, 0.9],
  ]
    .map(([a, b]) => `${x + a * k},${y + b * k}`)
    .join(' ');
  return (
    <g>
      <polygon points={pts} fill={color} stroke="#1b1b1b" strokeWidth={s * 0.04} strokeLinejoin="round" />
      <rect x={x + 0.45 * k} y={y - 0.55 * k} width={0.4 * k} height={0.4 * k} fill="rgba(255,240,190,0.85)" />
    </g>
  );
}

/** Small resource glyph used on cards, harbors and buttons. */
export function ResourceGlyph({ resource, size = 22 }: { resource: Resource; size?: number }) {
  const Piece = ART[resource];
  return (
    <svg width={size} height={size} viewBox="-1 -1 2 2" aria-hidden="true" className="glyph">
      <circle r={0.98} fill={TERRAIN_FILL[resource]} />
      <Piece x={resource === 'fleece' ? -0.12 : 0} y={resource === 'clay' ? 0.05 : 0.08} k={1.25} />
    </svg>
  );
}

export function DevGlyph({ card, size = 22 }: { card: DevCard; size?: number }) {
  const common = { width: size, height: size, viewBox: '-1 -1 2 2', 'aria-hidden': true, className: 'glyph' } as const;
  switch (card) {
    case 'warden':
      return (
        <svg {...common}>
          <circle r={0.98} fill="#5b3f8c" />
          <path d="M 0 -0.65 L 0.5 -0.4 L 0.45 0.15 Q 0.3 0.55 0 0.7 Q -0.3 0.55 -0.45 0.15 L -0.5 -0.4 Z" fill="#e8dcc0" />
          <path d="M 0 -0.4 L 0 0.45 M -0.28 -0.05 L 0.28 -0.05" stroke="#5b3f8c" strokeWidth={0.12} />
        </svg>
      );
    case 'monument':
      return (
        <svg {...common}>
          <circle r={0.98} fill="#2f6f73" />
          <polygon points="0,-0.7 0.22,0.45 -0.22,0.45" fill="#f0e6c8" />
          <rect x={-0.45} y={0.45} width={0.9} height={0.18} fill="#f0e6c8" />
        </svg>
      );
    case 'embargo':
      return (
        <svg {...common}>
          <circle r={0.98} fill="#8c3b3b" />
          <circle r={0.5} fill="none" stroke="#f3e2c4" strokeWidth={0.14} />
          <path d="M -0.36 0.36 L 0.36 -0.36" stroke="#f3e2c4" strokeWidth={0.14} />
        </svg>
      );
    case 'bounty':
      return (
        <svg {...common}>
          <circle r={0.98} fill="#9a7b1f" />
          <path d="M -0.5 -0.1 Q 0 -0.75 0.5 -0.1 L 0.4 0.55 L -0.4 0.55 Z" fill="#f7e3a3" />
          <circle cx={0} cy={0.15} r={0.16} fill="#9a7b1f" />
        </svg>
      );
    case 'surveyor':
      return (
        <svg {...common}>
          <circle r={0.98} fill="#3c6e3c" />
          <path d="M -0.55 0.5 L -0.1 -0.5 M 0.1 0.5 L 0.55 -0.5" stroke="#f0e2c0" strokeWidth={0.16} strokeLinecap="round" />
        </svg>
      );
  }
}

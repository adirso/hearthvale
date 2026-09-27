// Animated announcement shown to everyone when a development card is played.
// It never blocks input: the board stays clickable underneath.

import type { CSSProperties } from 'react';
import { DEV_DESCRIPTION, DEV_LABEL, RESOURCE_LABEL, type CardPlay, type GameState } from '../engine';
import { DevGlyph, RaiderFigure, ResourceGlyph } from './art';

interface Props {
  play: CardPlay;
  state: GameState;
  humanId: number;
  /** Total time on screen, in ms. The scene animations scale to fit. */
  duration: number;
}

function Knight({ color }: { color: string }) {
  return (
    <g>
      {/* Horse */}
      <ellipse cx={0} cy={18} rx={26} ry={12} fill="#8a5a33" stroke="#3b2413" strokeWidth={2} />
      <path d="M 20 12 Q 34 -4 38 4 Q 40 10 30 16 Z" fill="#8a5a33" stroke="#3b2413" strokeWidth={2} />
      <g className="legs">
        <rect x={-20} y={26} width={5} height={16} fill="#5e3b1f" />
        <rect x={14} y={26} width={5} height={16} fill="#5e3b1f" />
      </g>
      <g className="legs alt">
        <rect x={-10} y={26} width={5} height={16} fill="#5e3b1f" />
        <rect x={4} y={26} width={5} height={16} fill="#5e3b1f" />
      </g>
      {/* Rider */}
      <rect x={-6} y={-16} width={14} height={24} rx={3} fill={color} stroke="#1b1b1b" strokeWidth={2} />
      <circle cx={1} cy={-23} r={8} fill="#c9ccd3" stroke="#1b1b1b" strokeWidth={2} />
      <rect x={-5} y={-25} width={12} height={3} fill="#1b1b1b" />
      {/* Lance and shield */}
      <line x1={6} y1={-6} x2={54} y2={-16} stroke="#e8dcc0" strokeWidth={3} strokeLinecap="round" />
      <path d="M -16 -10 L -4 -10 L -4 4 Q -10 12 -16 4 Z" fill="#f0e6c8" stroke="#1b1b1b" strokeWidth={2} />
      <path d="M -10 -8 L -10 6 M -15 -2 L -5 -2" stroke={color} strokeWidth={2.5} />
    </g>
  );
}

function WardenScene({ play, state }: { play: CardPlay; state: GameState }) {
  const color = state.players[play.player].color;
  return (
    <div className="scene">
      <svg viewBox="0 0 320 110" className="scene-svg" aria-hidden="true">
        <line x1={0} y1={100} x2={320} y2={100} stroke="#b89a66" strokeWidth={2} strokeDasharray="6 5" />
        <g className="anim-flee">
          <RaiderFigure cx={200} cy={62} s={80} />
        </g>
        <g className="anim-dust">
          <circle cx={170} cy={96} r={6} fill="#d8c79a" />
          <circle cx={182} cy={92} r={4} fill="#d8c79a" />
        </g>
        <g className="anim-charge">
          <g transform="translate(60 56)">
            <Knight color={color} />
          </g>
        </g>
      </svg>
      <div className="scene-caption">
        <span>The raider is driven off!</span>
        <span className="pill">Wardens: {play.wardens ?? '?'}</span>
        {play.gainedArmy && <span className="pill gold anim-pop-late">Strongest Guard +2</span>}
      </div>
    </div>
  );
}

function EmbargoScene({ play, state, humanId }: { play: CardPlay; state: GameState; humanId: number }) {
  const r = play.resource!;
  const taken = play.taken ?? {};
  const victims = state.players.filter((p) => p.id !== play.player);
  const total = Object.values(taken).reduce((a, b) => a + b, 0);
  const thief = state.players[play.player];
  let delay = 0;
  return (
    <div className="scene">
      <div className="embargo-victims">
        {victims.map((p) => {
          const n = taken[p.id] ?? 0;
          return (
            <div key={p.id} className={`victim ${p.id === humanId && n > 0 ? 'hurt' : ''}`}>
              <span className="victim-name">
                <span className="swatch" style={{ background: p.color }} /> {p.id === humanId ? 'You' : p.name}
              </span>
              <span className="victim-cards">
                {n === 0 ? (
                  <span className="muted">none</span>
                ) : (
                  Array.from({ length: n }, (_, i) => {
                    const style = { animationDelay: `calc(var(--beat) * ${0.35 + (delay++) * 0.12})` } as CSSProperties;
                    return (
                      <span key={i} className="flying-card" style={style}>
                        <ResourceGlyph resource={r} size={26} />
                      </span>
                    );
                  })
                )}
              </span>
              <span className="victim-loss">{n > 0 ? `−${n}` : ''}</span>
            </div>
          );
        })}
      </div>
      <div className="embargo-sink anim-pop-late">
        <span className="swatch" style={{ background: thief.color }} />
        {play.player === humanId ? 'You collect' : `${thief.name} collects`} <strong>{total}</strong>{' '}
        <ResourceGlyph resource={r} size={22} /> {RESOURCE_LABEL[r]}
      </div>
    </div>
  );
}

function BountyScene({ play }: { play: CardPlay }) {
  const picks = play.resources ?? [];
  return (
    <div className="scene bounty-scene">
      <svg viewBox="0 0 90 60" className="bank-icon" aria-hidden="true">
        <polygon points="45,4 86,22 4,22" fill="#e8dcc0" stroke="#5b4a2c" strokeWidth={2} />
        {[14, 30, 46, 62, 76].map((x) => (
          <rect key={x} x={x - 3} y={24} width={6} height={24} fill="#f3ecd9" stroke="#5b4a2c" strokeWidth={1.5} />
        ))}
        <rect x={4} y={48} width={82} height={8} fill="#e8dcc0" stroke="#5b4a2c" strokeWidth={2} />
      </svg>
      <div className="bounty-drop">
        {picks.map((r, i) => (
          <span key={i} className="dropping-card" style={{ animationDelay: `calc(var(--beat) * ${0.3 + i * 0.25})` }}>
            <ResourceGlyph resource={r} size={40} />
            <small>{RESOURCE_LABEL[r]}</small>
          </span>
        ))}
      </div>
      <div className="scene-caption">
        <span>Two free resources from the bank</span>
      </div>
    </div>
  );
}

function SurveyorScene({ play, state }: { play: CardPlay; state: GameState }) {
  const color = state.players[play.player].color;
  return (
    <div className="scene">
      <svg viewBox="0 0 320 110" className="scene-svg" aria-hidden="true">
        {[
          [30, 80, 150, 40],
          [150, 40, 280, 76],
        ].map(([x1, y1, x2, y2], i) => (
          <g key={i}>
            <line x1={x1} y1={y1} x2={x2} y2={y2} stroke="#1b1b1b" strokeWidth={14} strokeLinecap="round" className={`anim-lay lay-${i}`} pathLength={1} />
            <line x1={x1} y1={y1} x2={x2} y2={y2} stroke={color} strokeWidth={9} strokeLinecap="round" className={`anim-lay lay-${i}`} pathLength={1} />
          </g>
        ))}
        {[30, 150, 280].map((x, i) => (
          <circle key={x} cx={x} cy={[80, 40, 76][i]} r={7} fill="#f6ecd4" stroke="#5b4a2c" strokeWidth={2} />
        ))}
        <g className="anim-stake">
          <line x1={150} y1={40} x2={150} y2={6} stroke="#5a3b1f" strokeWidth={3} />
          <polygon points="150,6 172,12 150,18" fill={color} stroke="#1b1b1b" strokeWidth={1.5} />
        </g>
      </svg>
      <div className="scene-caption">
        <span>Two roads laid at no cost</span>
      </div>
    </div>
  );
}

export function CardReveal({ play, state, humanId, duration }: Props) {
  const player = state.players[play.player];
  const who = play.player === humanId ? 'You play' : `${player.name} plays`;
  const style = { '--beat': `${duration}ms`, '--accent-color': player.color } as CSSProperties;
  return (
    <div className="reveal-shell" style={style}>
    <div className="reveal" role="status" aria-live="polite">
      <div className="reveal-head">
        <span className="swatch" style={{ background: player.color }} /> {who}
      </div>
      <div className="reveal-body">
        <div className="reveal-card">
          <div className="reveal-card-inner">
            <div className="reveal-face back" />
            <div className="reveal-face front" style={{ borderColor: player.color }}>
              <DevGlyph card={play.card} size={54} />
              <strong>{DEV_LABEL[play.card]}</strong>
              <small>{DEV_DESCRIPTION[play.card]}</small>
            </div>
          </div>
        </div>
        {play.card === 'warden' && <WardenScene play={play} state={state} />}
        {play.card === 'embargo' && <EmbargoScene play={play} state={state} humanId={humanId} />}
        {play.card === 'bounty' && <BountyScene play={play} />}
        {play.card === 'surveyor' && <SurveyorScene play={play} state={state} />}
      </div>
    </div>
    </div>
  );
}

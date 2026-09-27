import { useEffect, useRef } from 'react';
import {
  canPlayDevCard,
  COSTS,
  DEV_DESCRIPTION,
  DEV_LABEL,
  longestRoadLength,
  RESOURCE_LABEL,
  RESOURCES,
  totalCards,
  victoryPoints,
  type DevCard,
  type GameState,
  type ResourceBag,
} from '../engine';
import { DevGlyph, ResourceGlyph } from './art';

export function BagView({ value, size = 18 }: { value: ResourceBag; size?: number }) {
  return (
    <span className="bag">
      {RESOURCES.filter((r) => value[r] > 0).map((r) => (
        <span key={r} className="bag-item" title={RESOURCE_LABEL[r]}>
          {Array.from({ length: value[r] }, (_, i) => (
            <ResourceGlyph key={i} resource={r} size={size} />
          ))}
        </span>
      ))}
    </span>
  );
}

const DIE_PIPS: Record<number, [number, number][]> = {
  1: [[0, 0]],
  2: [[-1, -1], [1, 1]],
  3: [[-1, -1], [0, 0], [1, 1]],
  4: [[-1, -1], [1, -1], [-1, 1], [1, 1]],
  5: [[-1, -1], [1, -1], [0, 0], [-1, 1], [1, 1]],
  6: [[-1, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [1, 1]],
};

function Die({ value }: { value: number }) {
  return (
    <svg className="die" viewBox="-1.2 -1.2 2.4 2.4" width={34} height={34} aria-label={`Die showing ${value}`}>
      <rect x={-1.1} y={-1.1} width={2.2} height={2.2} rx={0.4} fill="#fbf7ec" stroke="#3a2e1e" strokeWidth={0.08} />
      {DIE_PIPS[value].map(([x, y], i) => (
        <circle key={i} cx={x * 0.55} cy={y * 0.55} r={0.2} fill="#2b2115" />
      ))}
    </svg>
  );
}

export function Dice({ state }: { state: GameState }) {
  if (!state.dice) return <div className="dice empty">No roll yet</div>;
  const [a, b] = state.dice;
  const rollIndex = state.log.filter((l) => l.text.includes(' rolls ')).length;
  return (
    <div className="dice" key={rollIndex}>
      <Die value={a} />
      <Die value={b} />
      <span className={`dice-sum ${a + b === 7 ? 'seven' : ''}`}>{a + b}</span>
    </div>
  );
}

export function PlayersPanel({ state, humanId }: { state: GameState; humanId: number }) {
  return (
    <section className="panel players">
      <h2>Settlers</h2>
      {state.players.map((p) => {
        const isMe = p.id === humanId;
        const publicVp = victoryPoints(state, p.id, false);
        const hiddenVp = victoryPoints(state, p.id) - publicVp;
        const active = state.currentPlayer === p.id && state.phase !== 'gameOver';
        return (
          <div key={p.id} className={`player-row ${active ? 'active' : ''}`} style={{ borderColor: p.color }}>
            <span className="swatch" style={{ background: p.color }} />
            <div className="player-main">
              <div className="player-name">
                {p.name}
                {isMe ? ' (you)' : ` · ${p.difficulty}`}
                {active && <span className="turn-dot" title="Current turn" />}
              </div>
              <div className="player-stats">
                <span title="Resource cards in hand">🂠 {totalCards(p.resources)}</span>
                <span title="Development cards held">✦ {p.devCards.length + p.newDevCards.length}</span>
                <span title="Wardens played">⚔ {p.wardensPlayed}</span>
                <span title="Longest continuous road">⟿ {longestRoadLength(state, p.id)}</span>
              </div>
              <div className="badges">
                {state.longestRoadHolder === p.id && <span className="badge">Grand Highway +2</span>}
                {state.largestArmyHolder === p.id && <span className="badge">Strongest Guard +2</span>}
              </div>
            </div>
            <div className="vp" title="Victory points">
              <strong>{publicVp + (isMe ? hiddenVp : 0)}</strong>
              <small>{isMe && hiddenVp > 0 ? `incl. ${hiddenVp} hidden` : 'VP'}</small>
            </div>
          </div>
        );
      })}
      <p className="hint">First to 10 victory points on their own turn wins.</p>
    </section>
  );
}

export function HandPanel({ state, humanId }: { state: GameState; humanId: number }) {
  const me = state.players[humanId];
  return (
    <section className="panel hand">
      <h2>Your cards</h2>
      <div className="cards">
        {RESOURCES.map((r) => (
          <div key={r} className={`card ${me.resources[r] === 0 ? 'none' : ''}`} title={RESOURCE_LABEL[r]}>
            <ResourceGlyph resource={r} size={30} />
            <span className="card-name">{RESOURCE_LABEL[r]}</span>
            <span className="card-count">{me.resources[r]}</span>
          </div>
        ))}
      </div>
      <div className="pieces">
        Pieces left: {me.roadsLeft} roads · {me.settlementsLeft} settlements · {me.citiesLeft} cities
      </div>
    </section>
  );
}

export function DevCardsPanel({
  state,
  humanId,
  onPlay,
}: {
  state: GameState;
  humanId: number;
  onPlay: (card: DevCard) => void;
}) {
  const me = state.players[humanId];
  const cards = [...me.devCards.map((c) => ({ c, fresh: false })), ...me.newDevCards.map((c) => ({ c, fresh: true }))];
  if (!cards.length) return null;
  return (
    <section className="panel dev">
      <h2>Development cards</h2>
      {state.devCardPlayedThisTurn && state.currentPlayer === humanId && (
        <p className="hint">You have already played a card this turn.</p>
      )}
      <ul>
        {cards.map(({ c, fresh }, i) => (
          <li key={i} className="dev-card">
            <DevGlyph card={c} size={28} />
            <div>
              <strong>{DEV_LABEL[c]}</strong>
              <small>{DEV_DESCRIPTION[c]}</small>
            </div>
            {c === 'monument' ? (
              <span className="tag">+1 VP</span>
            ) : fresh ? (
              <span className="tag">Next turn</span>
            ) : canPlayDevCard(state, humanId, c) ? (
              <button className="small" onClick={() => onPlay(c)}>
                Play
              </button>
            ) : null}
          </li>
        ))}
      </ul>
    </section>
  );
}

export function CostsPanel({ state, humanId }: { state: GameState; humanId: number }) {
  const rows: { label: string; cost: ResourceBag; points: string }[] = [
    { label: 'Road', cost: COSTS.road, points: '—' },
    { label: 'Settlement', cost: COSTS.settlement, points: '1 VP' },
    { label: 'City (upgrade)', cost: COSTS.city, points: '2 VP' },
    { label: 'Development card', cost: COSTS.devCard, points: '?' },
  ];
  const have = state.players[humanId].resources;
  return (
    <section className="panel costs">
      <h2>Building costs</h2>
      <table>
        <tbody>
          {rows.map((row) => {
            const ok = RESOURCES.every((r) => have[r] >= row.cost[r]);
            return (
              <tr key={row.label} className={ok ? 'affordable' : ''}>
                <td>{row.label}</td>
                <td>
                  <BagView value={row.cost} size={16} />
                </td>
                <td className="pts">{row.points}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <p className="hint">Deck: {state.devDeck.length} development cards left.</p>
    </section>
  );
}

export function LogPanel({ state }: { state: GameState }) {
  const ref = useRef<HTMLOListElement>(null);
  useEffect(() => {
    if (ref.current) ref.current.scrollTop = ref.current.scrollHeight;
  }, [state.log.length]);
  const entries = state.log.slice(-80);
  const offset = state.log.length - entries.length;
  return (
    <section className="panel log">
      <h2>Chronicle</h2>
      <ol ref={ref}>
        {entries.map((entry, i) => (
          <li key={offset + i} className={i === entries.length - 1 ? 'latest' : ''}>
            {entry.player !== null && <span className="swatch" style={{ background: state.players[entry.player].color }} />}
            {entry.text}
          </li>
        ))}
      </ol>
    </section>
  );
}

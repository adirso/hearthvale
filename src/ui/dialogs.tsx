import { useState, type ReactNode } from 'react';
import {
  bag,
  RESOURCE_LABEL,
  RESOURCES,
  totalCards,
  tradeRatio,
  type GameState,
  type Resource,
  type ResourceBag,
} from '../engine';
import type { TradeResponse } from '../ai/ai';
import { ResourceGlyph } from './art';

function BagEditor({
  value,
  onChange,
  max,
  totalLimit,
}: {
  value: ResourceBag;
  onChange: (b: ResourceBag) => void;
  max?: ResourceBag;
  totalLimit?: number;
}) {
  const total = totalCards(value);
  return (
    <div className="bag-editor">
      {RESOURCES.map((r) => {
        const canAdd = (max ? value[r] < max[r] : true) && (totalLimit === undefined || total < totalLimit);
        return (
          <div key={r} className="bag-editor-row">
            <ResourceGlyph resource={r} size={24} />
            <span className="name">{RESOURCE_LABEL[r]}</span>
            {max && <span className="muted">/{max[r]}</span>}
            <button className="step" disabled={value[r] === 0} onClick={() => onChange({ ...value, [r]: value[r] - 1 })} aria-label={`Remove ${RESOURCE_LABEL[r]}`}>
              −
            </button>
            <span className="qty">{value[r]}</span>
            <button className="step" disabled={!canAdd} onClick={() => onChange({ ...value, [r]: value[r] + 1 })} aria-label={`Add ${RESOURCE_LABEL[r]}`}>
              +
            </button>
          </div>
        );
      })}
    </div>
  );
}

function Modal({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="modal-backdrop">
      <div className="modal" role="dialog" aria-modal="true" aria-label={title}>
        <h2>{title}</h2>
        {children}
      </div>
    </div>
  );
}

export function DiscardDialog({ state, humanId, onConfirm }: { state: GameState; humanId: number; onConfirm: (b: ResourceBag) => void }) {
  const owed = state.pendingDiscards[humanId];
  const [choice, setChoice] = useState(bag());
  const picked = totalCards(choice);
  return (
    <Modal title="The raider strikes">
      <p>
        A 7 was rolled and you hold more than 7 cards. Choose <strong>{owed}</strong> to give up.
      </p>
      <BagEditor value={choice} onChange={setChoice} max={state.players[humanId].resources} totalLimit={owed} />
      <button className="primary" disabled={picked !== owed} onClick={() => onConfirm(choice)}>
        Discard {picked}/{owed}
      </button>
    </Modal>
  );
}

export function StealDialog({ state, onPick }: { state: GameState; onPick: (victim: number) => void }) {
  return (
    <Modal title="Choose whom to rob">
      <p>Several rivals border this tile. Take one random card from:</p>
      <div className="choice-list">
        {state.stealCandidates.map((pid) => {
          const p = state.players[pid];
          return (
            <button key={pid} className="choice" onClick={() => onPick(pid)} style={{ borderColor: p.color }}>
              <span className="swatch" style={{ background: p.color }} /> {p.name} · {totalCards(p.resources)} cards
            </button>
          );
        })}
      </div>
    </Modal>
  );
}

export function ResourcePickDialog({
  title,
  prompt,
  count,
  bank,
  onConfirm,
  onCancel,
}: {
  title: string;
  prompt: string;
  count: 1 | 2;
  bank?: ResourceBag;
  onConfirm: (picks: Resource[]) => void;
  onCancel: () => void;
}) {
  const [choice, setChoice] = useState(bag());
  const picks = RESOURCES.flatMap((r) => Array<Resource>(choice[r]).fill(r));
  return (
    <Modal title={title}>
      <p>{prompt}</p>
      {count === 1 ? (
        <div className="choice-list">
          {RESOURCES.map((r) => (
            <button key={r} className="choice" onClick={() => onConfirm([r])}>
              <ResourceGlyph resource={r} size={24} /> {RESOURCE_LABEL[r]}
            </button>
          ))}
        </div>
      ) : (
        <>
          <BagEditor value={choice} onChange={setChoice} max={bank} totalLimit={count} />
          <button className="primary" disabled={picks.length !== count} onClick={() => onConfirm(picks)}>
            Take {picks.length}/{count}
          </button>
        </>
      )}
      <button className="ghost" onClick={onCancel}>
        Cancel
      </button>
    </Modal>
  );
}

export function BankTradePanel({
  state,
  humanId,
  onTrade,
  onClose,
}: {
  state: GameState;
  humanId: number;
  onTrade: (give: Resource, get: Resource) => void;
  onClose: () => void;
}) {
  const me = state.players[humanId];
  const giveable = RESOURCES.filter((r) => me.resources[r] >= tradeRatio(state, humanId, r));
  const [give, setGive] = useState<Resource | null>(giveable[0] ?? null);
  const effectiveGive = give && giveable.includes(give) ? give : (giveable[0] ?? null);
  return (
    <section className="panel trade">
      <div className="panel-head">
        <h2>Trade with the bank</h2>
        <button className="ghost small" onClick={onClose}>
          Close
        </button>
      </div>
      {giveable.length === 0 ? (
        <p className="hint">You need 4 of a kind (or fewer with a harbor) to trade.</p>
      ) : (
        <>
          <p className="label">Give</p>
          <div className="chip-row">
            {giveable.map((r) => (
              <button key={r} className={`chip ${effectiveGive === r ? 'selected' : ''}`} onClick={() => setGive(r)}>
                <ResourceGlyph resource={r} size={20} /> {tradeRatio(state, humanId, r)} {RESOURCE_LABEL[r]}
              </button>
            ))}
          </div>
          <p className="label">Receive 1</p>
          <div className="chip-row">
            {RESOURCES.filter((r) => r !== effectiveGive && state.bank[r] > 0).map((r) => (
              <button key={r} className="chip" onClick={() => effectiveGive && onTrade(effectiveGive, r)}>
                <ResourceGlyph resource={r} size={20} /> {RESOURCE_LABEL[r]}
              </button>
            ))}
          </div>
        </>
      )}
    </section>
  );
}

export function PlayerTradePanel({
  state,
  humanId,
  onAsk,
  onTrade,
  onClose,
}: {
  state: GameState;
  humanId: number;
  onAsk: (give: ResourceBag, get: ResourceBag) => Record<number, TradeResponse>;
  onTrade: (partner: number, give: ResourceBag, get: ResourceBag) => boolean;
  onClose: () => void;
}) {
  const [give, setGiveRaw] = useState(bag());
  const [get, setGetRaw] = useState(bag());
  // Answers belong to one exact offer at one moment of the game.
  const [answers, setAnswers] = useState<{ at: number; responses: Record<number, TradeResponse> } | null>(null);
  const me = state.players[humanId];
  const valid = totalCards(give) > 0 && totalCards(get) > 0 && RESOURCES.every((r) => give[r] === 0 || get[r] === 0);
  const live = answers && answers.at === state.log.length ? answers.responses : null;
  const setGive = (b: ResourceBag) => {
    setGiveRaw(b);
    setAnswers(null);
  };
  const setGet = (b: ResourceBag) => {
    setGetRaw(b);
    setAnswers(null);
  };
  const rivals = state.players.filter((p) => p.id !== humanId);
  const accepted = live ? rivals.filter((p) => live[p.id]?.accept).length : 0;

  return (
    <section className="panel trade">
      <div className="panel-head">
        <h2>Offer a trade to rivals</h2>
        <button className="ghost small" onClick={onClose}>
          Close
        </button>
      </div>
      <p className="label">You give</p>
      <BagEditor value={give} onChange={setGive} max={me.resources} />
      <p className="label">You want</p>
      <BagEditor value={get} onChange={setGet} />
      <button className="primary wide" disabled={!valid} onClick={() => setAnswers({ at: state.log.length, responses: onAsk(give, get) })}>
        Offer to all rivals
      </button>

      {live && (
        <div className="responses" aria-live="polite">
          <p className="label">
            {accepted === 0 ? 'Nobody accepts. Try a different offer.' : `${accepted} of ${rivals.length} accept. Choose who to trade with:`}
          </p>
          {rivals.map((p) => {
            const r = live[p.id];
            return (
              <div key={p.id} className={`response ${r.accept ? 'yes' : 'no'}`}>
                <span className="swatch" style={{ background: p.color }} />
                <div className="response-text">
                  <strong>
                    {p.name} {r.accept ? '✓ accepts' : '✗ declines'}
                  </strong>
                  <small>“{r.reason}”</small>
                </div>
                {r.accept && (
                  <button
                    className="small"
                    onClick={() => {
                      if (onTrade(p.id, give, get)) {
                        setGiveRaw(bag());
                        setGetRaw(bag());
                        setAnswers(null);
                      }
                    }}
                  >
                    Trade with {p.name}
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}
      <p className="hint">Rivals accept offers that help their own plans, and refuse anyone close to winning.</p>
    </section>
  );
}

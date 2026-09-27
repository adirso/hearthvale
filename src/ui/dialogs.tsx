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
  type TradeOffer,
} from '../engine';
import { ResourceGlyph } from './art';
import { BagView } from './panels';

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

function AnswerList({ state, offer, humanId, onPick }: {
  state: GameState;
  offer: TradeOffer;
  humanId: number;
  onPick?: (partner: number) => void;
}) {
  return (
    <div className="responses" aria-live="polite">
      {state.players
        .filter((p) => p.id !== offer.from)
        .map((p) => {
          const answer = offer.responses[p.id];
          const reason = offer.reasons[p.id];
          return (
            <div key={p.id} className={`response ${answer === 'accept' ? 'yes' : answer === 'decline' ? 'no' : 'wait'}`}>
              <span className="swatch" style={{ background: p.color }} />
              <div className="response-text">
                <strong>
                  {p.id === humanId ? 'You' : p.name}{' '}
                  {answer === 'pending' ? (
                    <span className="thinking">thinking…</span>
                  ) : (
                    `${answer === 'accept' ? '✓ accept' : '✗ decline'}${p.id === humanId ? '' : 's'}`
                  )}
                </strong>
                {reason && <small>“{reason}”</small>}
              </div>
              {onPick && answer === 'accept' && (
                <button className="small" onClick={() => onPick(p.id)}>
                  Trade with {p.name}
                </button>
              )}
            </div>
          );
        })}
    </div>
  );
}

function OfferTerms({ state, offer, humanId }: { state: GameState; offer: TradeOffer; humanId: number }) {
  const from = offer.from === humanId ? 'You' : state.players[offer.from].name;
  return (
    <div className="offer-terms">
      <div>
        <small>{from} give{offer.from === humanId ? '' : 's'}</small>
        <BagView value={offer.give} size={24} />
      </div>
      <span className="offer-arrow">⇄</span>
      <div>
        <small>{offer.from === humanId ? 'You want' : 'Wants'}</small>
        <BagView value={offer.get} size={24} />
      </div>
    </div>
  );
}

/** A rival's offer that the human must answer. */
export function IncomingOfferDialog({
  state,
  humanId,
  onAnswer,
}: {
  state: GameState;
  humanId: number;
  onAnswer: (accept: boolean) => void;
}) {
  const offer = state.tradeOffer!;
  const from = state.players[offer.from];
  const canPay = RESOURCES.every((r) => state.players[humanId].resources[r] >= offer.get[r]);
  return (
    <Modal title={`${from.name} offers a trade`}>
      <OfferTerms state={state} offer={offer} humanId={humanId} />
      <p className="muted">The offer went to everyone. If several accept, {from.name} picks the partner.</p>
      <div className="modal-actions">
        <button className="primary" disabled={!canPay} onClick={() => onAnswer(true)}>
          Accept
        </button>
        <button onClick={() => onAnswer(false)}>Decline</button>
      </div>
      {!canPay && <p className="hint">You do not have the cards asked for.</p>}
    </Modal>
  );
}

/** Live view of an offer between rivals (or one the human already answered). */
export function OfferWatch({ state, humanId }: { state: GameState; humanId: number }) {
  const offer = state.tradeOffer!;
  const from = state.players[offer.from];
  return (
    <section className="panel offer-watch" style={{ borderColor: from.color }}>
      <h2>
        <span className="swatch" style={{ background: from.color }} /> {from.name} proposes a trade
      </h2>
      <OfferTerms state={state} offer={offer} humanId={humanId} />
      <AnswerList state={state} offer={offer} humanId={humanId} />
    </section>
  );
}

export function PlayerTradePanel({
  state,
  humanId,
  onOffer,
  onConfirm,
  onWithdraw,
  onClose,
}: {
  state: GameState;
  humanId: number;
  onOffer: (give: ResourceBag, get: ResourceBag) => void;
  onConfirm: (partner: number) => void;
  onWithdraw: () => void;
  onClose: () => void;
}) {
  const [give, setGive] = useState(bag());
  const [get, setGet] = useState(bag());
  const me = state.players[humanId];
  const offer = state.tradeOffer && state.tradeOffer.from === humanId ? state.tradeOffer : null;
  const valid = totalCards(give) > 0 && totalCards(get) > 0 && RESOURCES.every((r) => give[r] === 0 || get[r] === 0);

  if (offer) {
    const answers = Object.values(offer.responses);
    const waiting = answers.filter((a) => a === 'pending').length;
    const accepted = answers.filter((a) => a === 'accept').length;
    return (
      <section className="panel trade">
        <h2>Your offer to all rivals</h2>
        <OfferTerms state={state} offer={offer} humanId={humanId} />
        <p className="label">
          {waiting > 0
            ? `Waiting for ${waiting} answer${waiting > 1 ? 's' : ''}…`
            : accepted === 0
              ? 'Nobody accepts. Withdraw and try a different offer.'
              : `${accepted} accept. Choose who to trade with:`}
        </p>
        <AnswerList
          state={state}
          offer={offer}
          humanId={humanId}
          onPick={(p) => {
            onConfirm(p);
            setGive(bag());
            setGet(bag());
          }}
        />
        <button className="ghost" onClick={onWithdraw}>
          Withdraw offer
        </button>
      </section>
    );
  }

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
      <button className="primary wide" disabled={!valid} onClick={() => onOffer(give, get)}>
        Offer to all rivals
      </button>
      <p className="hint">Rivals accept offers that help their own plans, and refuse anyone close to winning.</p>
    </section>
  );
}

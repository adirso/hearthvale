import { useEffect, useMemo, useRef, useState } from 'react';
import {
  canAfford,
  canPlayDevCard,
  legalCityVertices,
  legalRaiderHexes,
  legalRoadEdges,
  legalSettlementVertices,
  legalSetupRoadEdges,
  legalSetupSettlementVertices,
  pips,
  RESOURCE_LABEL,
  RESOURCES,
  totalCards,
  TOPOLOGY,
  tradeRatio,
  type DevCard,
  type GameState,
} from '../engine';
import { ResourceGlyph } from './art';
import { Board, NO_TARGETS, type BoardTargets } from './Board';
import { BankTradePanel, DiscardDialog, PlayerTradePanel, ResourcePickDialog, StealDialog } from './dialogs';
import { EndScreen } from './EndScreen';
import { CostsPanel, DevCardsPanel, Dice, HandPanel, LogPanel, PlayersPanel } from './panels';
import { playSound, setSoundEnabled } from './sound';
import { soundCues } from './soundEvents';
import type { Prefs } from './storage';
import { useGameController } from './useGameController';

type BuildMode = 'road' | 'settlement' | 'city' | null;
type SidePanel = 'bank' | 'players' | null;

interface Props {
  initial: GameState;
  speed: Prefs['speed'];
  onSpeedChange: (s: Prefs['speed']) => void;
  sound: boolean;
  onSoundChange: (on: boolean) => void;
  onNewGame: () => void;
  onMenu: () => void;
}

function prompt(state: GameState, humanId: number, mode: BuildMode): string {
  const cur = state.players[state.currentPlayer];
  if (state.phase === 'gameOver') return `${state.players[state.winner!].name} has won the island.`;
  if (state.phase === 'discard') {
    return state.pendingDiscards[humanId] !== undefined
      ? `A 7! Choose ${state.pendingDiscards[humanId]} cards to give up.`
      : 'A 7! Waiting for rivals to give up cards…';
  }
  if (state.currentPlayer !== humanId) {
    const last = [...state.log].reverse().find((l) => l.player === cur.id);
    return last ? `${cur.name}'s turn — ${last.text}` : `${cur.name} is taking their turn…`;
  }
  switch (state.phase) {
    case 'setup': {
      const which = state.setup!.round === 1 ? 'first' : 'second';
      return state.setup!.step === 'settlement'
        ? `Place your ${which} settlement on a glowing intersection. No building may sit next to another.${state.setup!.round === 2 ? ' You collect one card from each tile it touches.' : ''}`
        : 'Lay a road on a glowing path next to the settlement you just placed.';
    }
    case 'roll':
      return 'Roll the dice to begin your turn.';
    case 'moveRaider':
      return 'Move the raider: tap any other tile. It blocks that tile and lets you rob a neighbor.';
    case 'steal':
      return 'Choose a rival to rob.';
    case 'roadBuilding':
      return `Surveyor: tap a glowing path to lay a free road (${state.freeRoadsLeft} left).`;
    case 'main':
      if (mode === 'road') return 'Tap a glowing path to build a road.';
      if (mode === 'settlement') return 'Tap a glowing intersection to found a settlement.';
      if (mode === 'city') return 'Tap one of your settlements to raise it into a city.';
      return 'Build, trade or play a card — then end your turn.';
    default:
      return '';
  }
}

function describeVertex(state: GameState, v: number) {
  const hexes = TOPOLOGY.vertexHexes[v].map((h) => state.hexes[h]);
  const port = state.ports.find((p) => TOPOLOGY.edgeVertices[p.edge].includes(v));
  const b = state.buildings[v];
  return (
    <div className="vertex-info">
      <span className="muted">{b ? `${state.players[b.owner].name}'s ${b.kind} touches:` : 'This intersection touches:'}</span>
      {hexes.map((h) => (
        <span key={h.id} className="vi-tile">
          {h.terrain === 'waste' ? (
            'Wasteland'
          ) : (
            <>
              <ResourceGlyph resource={h.terrain} size={18} /> {RESOURCE_LABEL[h.terrain]} {h.token}
              <small>({pips(h.token)}/36)</small>
              {h.id === state.raiderHex && <small className="warn"> raided</small>}
            </>
          )}
        </span>
      ))}
      {hexes.length < 3 && <span className="vi-tile muted">Sea</span>}
      {port && (
        <span className="vi-tile">⚓ {port.resource ? `2:1 ${RESOURCE_LABEL[port.resource]}` : '3:1'} harbor</span>
      )}
    </div>
  );
}

function quickHint(t: BoardTargets): string | null {
  const kinds: string[] = [];
  if (t.quickEdges?.size) kinds.push('roads');
  const vs = [...(t.quickVertices?.values() ?? [])];
  if (vs.includes('settlement')) kinds.push('settlements');
  if (vs.includes('city')) kinds.push('cities');
  if (!kinds.length) return null;
  return `You can afford ${kinds.join(', ')}: hover the map to preview and click to build (tap twice on touch screens).`;
}

export function GameScreen({ initial, speed, onSpeedChange, sound, onSoundChange, onNewGame, onMenu }: Props) {
  const { state, humanId, error, notice, dispatch, askRivals, tradeWith, clearMessages } = useGameController(initial, speed);
  const [rawMode, setMode] = useState<BuildMode>(null);
  const [rawPanel, setPanel] = useState<SidePanel>(null);
  const [rawPicker, setPicker] = useState<'embargo' | 'bounty' | null>(null);
  const [focusVertex, setFocusVertex] = useState<number | null>(null);
  const [showEnd, setShowEnd] = useState(true);

  const me = state.players[humanId];
  const myTurn = state.currentPlayer === humanId && state.phase !== 'gameOver';
  const inMain = myTurn && state.phase === 'main';

  // Selections only apply while they make sense for the current phase.
  const mode = inMain ? rawMode : null;
  const panel = inMain ? rawPanel : null;
  const picker = myTurn ? rawPicker : null;

  useEffect(() => {
    if (!error && !notice) return;
    const t = setTimeout(clearMessages, 3500);
    return () => clearTimeout(t);
  }, [error, notice, clearMessages]);

  // Sound effects for every change on the board, whoever made it.
  useEffect(() => setSoundEnabled(sound), [sound]);
  const prevState = useRef(state);
  useEffect(() => {
    const prev = prevState.current;
    prevState.current = state;
    if (prev !== state) soundCues(prev, state, humanId).forEach((c) => playSound(c.name, c.delay));
  }, [state, humanId]);
  useEffect(() => {
    if (error) playSound('error');
  }, [error]);

  const targets: BoardTargets = useMemo(() => {
    if (!myTurn) return NO_TARGETS;
    const t: BoardTargets = {
      vertices: new Set(),
      edges: new Set(),
      hexes: new Set(),
      ghostColor: state.players[humanId].color,
    };
    if (state.phase === 'setup') {
      t.vertexGhost = 'settlement';
      if (state.setup!.step === 'settlement') legalSetupSettlementVertices(state).forEach((v) => t.vertices.add(v));
      else legalSetupRoadEdges(state).forEach((e) => t.edges.add(e));
    } else if (state.phase === 'moveRaider') {
      legalRaiderHexes(state).forEach((h) => t.hexes.add(h));
    } else if (state.phase === 'roadBuilding') {
      legalRoadEdges(state, humanId).forEach((e) => t.edges.add(e));
    } else if (state.phase === 'main') {
      if (mode === 'road') legalRoadEdges(state, humanId).forEach((e) => t.edges.add(e));
      if (mode === 'settlement') legalSettlementVertices(state, humanId).forEach((v) => t.vertices.add(v));
      if (mode === 'city') legalCityVertices(state, humanId).forEach((v) => t.vertices.add(v));
      if (mode === 'settlement' || mode === 'city') t.vertexGhost = mode;
      if (mode === null) {
        // No mode chosen: every affordable, legal build is available straight from the map.
        if (canAfford(state, humanId, 'road')) t.quickEdges = new Set(legalRoadEdges(state, humanId));
        const quick = new Map<number, 'settlement' | 'city'>();
        if (canAfford(state, humanId, 'settlement'))
          legalSettlementVertices(state, humanId).forEach((v) => quick.set(v, 'settlement'));
        if (canAfford(state, humanId, 'city')) legalCityVertices(state, humanId).forEach((v) => quick.set(v, 'city'));
        t.quickVertices = quick;
      }
    }
    return t;
  }, [state, humanId, myTurn, mode]);

  const onVertex = (v: number) => {
    if (state.phase === 'setup') dispatch({ type: 'placeSetupSettlement', vertex: v });
    else if (mode === 'settlement') {
      if (dispatch({ type: 'buildSettlement', vertex: v })) setMode(null);
    }
    else if (mode === 'city') {
      if (dispatch({ type: 'buildCity', vertex: v })) setMode(null);
    } else if (inMain) {
      // Quick build straight from the map.
      const own = state.buildings[v];
      dispatch(own ? { type: 'buildCity', vertex: v } : { type: 'buildSettlement', vertex: v });
    }
    setFocusVertex(null);
  };
  const onEdge = (e: number) => {
    if (state.phase === 'setup') dispatch({ type: 'placeSetupRoad', edge: e });
    else if (state.phase === 'roadBuilding') dispatch({ type: 'placeFreeRoad', edge: e });
    else if (mode === 'road') {
      if (dispatch({ type: 'buildRoad', edge: e })) setMode(null);
    } else if (inMain) dispatch({ type: 'buildRoad', edge: e });
  };
  const onHex = (h: number) => dispatch({ type: 'moveRaider', hex: h });

  const playCard = (card: DevCard) => {
    setMode(null);
    if (card === 'warden') dispatch({ type: 'playWarden' });
    else if (card === 'surveyor') dispatch({ type: 'playSurveyor' });
    else setPicker(card === 'embargo' ? 'embargo' : 'bounty');
  };

  // Only legal actions are offered.
  const can = {
    road: inMain && canAfford(state, humanId, 'road') && legalRoadEdges(state, humanId).length > 0,
    settlement: inMain && canAfford(state, humanId, 'settlement') && legalSettlementVertices(state, humanId).length > 0,
    city: inMain && canAfford(state, humanId, 'city') && legalCityVertices(state, humanId).length > 0,
    dev: inMain && canAfford(state, humanId, 'devCard') && state.devDeck.length > 0,
    bank: inMain && RESOURCES.some((r) => me.resources[r] >= tradeRatio(state, humanId, r)),
    offer: inMain && totalCards(me.resources) > 0,
  };
  const toggleMode = (m: Exclude<BuildMode, null>) => {
    setPanel(null);
    setMode(mode === m ? null : m);
  };

  return (
    <div className="game">
      <header className="topbar">
        <button className="ghost small" onClick={onMenu}>
          ☰ Menu
        </button>
        <h1>Hearthvale</h1>
        <div className="top-controls">
        <button
          className="ghost small sound-toggle"
          onClick={() => onSoundChange(!sound)}
          aria-label={sound ? 'Mute sound' : 'Turn sound on'}
          title={sound ? 'Mute sound' : 'Turn sound on'}
        >
          {sound ? '🔊' : '🔇'}
        </button>
        <label className="speed">
          Pace
          <select value={speed} onChange={(e) => onSpeedChange(e.target.value as Prefs['speed'])}>
            <option value="relaxed">Relaxed</option>
            <option value="normal">Normal</option>
            <option value="fast">Fast</option>
          </select>
        </label>
        </div>
      </header>

      <div className="layout">
        <main className="board-area">
          <div className={`prompt ${myTurn || state.pendingDiscards[humanId] !== undefined ? 'mine' : ''}`}>
            <span className="swatch" style={{ background: state.players[state.currentPlayer].color }} />
            <span>{prompt(state, humanId, mode)}</span>
          </div>
          <div className="board-wrap">
            <Board
              state={state}
              targets={targets}
              focusVertex={focusVertex}
              onFocusVertex={setFocusVertex}
              onVertex={onVertex}
              onEdge={onEdge}
              onHex={onHex}
            />
          </div>
          <div className="board-footer">
            {focusVertex !== null ? (
              describeVertex(state, focusVertex)
            ) : (
              <span className="muted">{quickHint(targets) ?? 'Hover or tap an intersection to see which tiles it touches.'}</span>
            )}
          </div>
          {(error || notice) && (
            <div className={`toast ${error ? 'error' : ''}`} role="status">
              {error ?? notice}
            </div>
          )}
        </main>

        <aside className="sidebar">
          <section className="panel actions">
            <div className="turn-line">
              <span>
                Turn {Math.max(1, state.turn)} · {state.phase === 'setup' ? 'Settling' : state.players[state.currentPlayer].name}
              </span>
              <Dice state={state} />
            </div>
            <div className="action-grid">
              {myTurn && state.phase === 'roll' && (
                <button className="primary" onClick={() => dispatch({ type: 'rollDice' })}>
                  🎲 Roll dice
                </button>
              )}
              {myTurn && state.phase === 'roll' && canPlayDevCard(state, humanId, 'warden') && (
                <button onClick={() => playCard('warden')}>Play Warden first</button>
              )}
              {can.road && (
                <button className={mode === 'road' ? 'selected' : ''} onClick={() => toggleMode('road')}>
                  Build road
                </button>
              )}
              {can.settlement && (
                <button className={mode === 'settlement' ? 'selected' : ''} onClick={() => toggleMode('settlement')}>
                  Found settlement
                </button>
              )}
              {can.city && (
                <button className={mode === 'city' ? 'selected' : ''} onClick={() => toggleMode('city')}>
                  Raise city
                </button>
              )}
              {can.dev && <button onClick={() => dispatch({ type: 'buyDevCard' })}>Buy development card</button>}
              {can.bank && (
                <button className={panel === 'bank' ? 'selected' : ''} onClick={() => { setMode(null); setPanel(panel === 'bank' ? null : 'bank'); }}>
                  Bank / harbor trade
                </button>
              )}
              {can.offer && (
                <button className={panel === 'players' ? 'selected' : ''} onClick={() => { setMode(null); setPanel(panel === 'players' ? null : 'players'); }}>
                  Trade with rivals
                </button>
              )}
              {mode && (
                <button className="ghost" onClick={() => setMode(null)}>
                  Cancel
                </button>
              )}
              {inMain && (
                <button className="end" onClick={() => {
                    setMode(null);
                    setPanel(null);
                    dispatch({ type: 'endTurn' });
                  }}>
                  End turn ➜
                </button>
              )}
              {!myTurn && state.phase !== 'gameOver' && <p className="hint waiting">Watching rivals…</p>}
              {state.phase === 'gameOver' && !showEnd && (
                <button className="primary" onClick={() => setShowEnd(true)}>
                  Show results
                </button>
              )}
            </div>
          </section>

          {panel === 'bank' && inMain && (
            <BankTradePanel
              state={state}
              humanId={humanId}
              onTrade={(give, get) => dispatch({ type: 'bankTrade', give, get })}
              onClose={() => setPanel(null)}
            />
          )}
          {panel === 'players' && inMain && (
            <PlayerTradePanel state={state} humanId={humanId} onAsk={askRivals} onTrade={tradeWith} onClose={() => setPanel(null)} />
          )}

          <HandPanel state={state} humanId={humanId} />
          <DevCardsPanel state={state} humanId={humanId} onPlay={playCard} />
          <PlayersPanel state={state} humanId={humanId} />
          <CostsPanel state={state} humanId={humanId} />
          <LogPanel state={state} />
        </aside>
      </div>

      {state.phase === 'discard' && state.pendingDiscards[humanId] !== undefined && (
        <DiscardDialog
          key={state.log.length}
          state={state}
          humanId={humanId}
          onConfirm={(cards) => dispatch({ type: 'discard', player: humanId, cards })}
        />
      )}
      {myTurn && state.phase === 'steal' && <StealDialog state={state} onPick={(victim) => dispatch({ type: 'steal', victim })} />}
      {picker === 'embargo' && (
        <ResourcePickDialog
          title="Embargo"
          prompt="Name a resource. Every rival hands you all of theirs."
          count={1}
          onCancel={() => setPicker(null)}
          onConfirm={([r]) => {
            setPicker(null);
            dispatch({ type: 'playEmbargo', resource: r });
          }}
        />
      )}
      {picker === 'bounty' && (
        <ResourcePickDialog
          title="Bounty"
          prompt="Take any two resources from the bank."
          count={2}
          bank={state.bank}
          onCancel={() => setPicker(null)}
          onConfirm={([a, b]) => {
            setPicker(null);
            dispatch({ type: 'playBounty', resources: [a, b] });
          }}
        />
      )}
      {state.phase === 'gameOver' && showEnd && (
        <EndScreen state={state} humanId={humanId} onNewGame={onNewGame} onMenu={onMenu} onClose={() => setShowEnd(false)} />
      )}
    </div>
  );
}

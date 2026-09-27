import { longestRoadLength, victoryPoints, type GameState } from '../engine';

interface Props {
  state: GameState;
  humanId: number;
  onNewGame: () => void;
  onMenu: () => void;
  onClose: () => void;
}

export function EndScreen({ state, humanId, onNewGame, onMenu, onClose }: Props) {
  const winner = state.players[state.winner!];
  const rows = state.players
    .map((p) => {
      const settlements = state.buildings.filter((b) => b?.owner === p.id && b.kind === 'settlement').length;
      const cities = state.buildings.filter((b) => b?.owner === p.id && b.kind === 'city').length;
      const monuments = [...p.devCards, ...p.newDevCards].filter((c) => c === 'monument').length;
      return {
        p,
        settlements,
        cities,
        monuments,
        road: longestRoadLength(state, p.id),
        total: victoryPoints(state, p.id),
      };
    })
    .sort((a, b) => b.total - a.total);
  const humanWon = winner.id === humanId;

  return (
    <div className="modal-backdrop">
      <div className="modal end" role="dialog" aria-modal="true" aria-label="Game over">
        <div className="crest" style={{ background: winner.color }}>
          ★
        </div>
        <h2>{humanWon ? 'Victory! The vale is yours.' : `${winner.name} claims the vale.`}</h2>
        <p className="muted">Decided on turn {state.turn}.</p>
        <table className="scores">
          <thead>
            <tr>
              <th>Settler</th>
              <th title="Settlements (1 each)">Stl</th>
              <th title="Cities (2 each)">City</th>
              <th title="Grand Highway (+2)">Hwy</th>
              <th title="Strongest Guard (+2)">Grd</th>
              <th title="Monuments (1 each)">Mon</th>
              <th>VP</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ p, settlements, cities, monuments, road, total }) => (
              <tr key={p.id} className={p.id === winner.id ? 'winner' : ''}>
                <td>
                  <span className="swatch" style={{ background: p.color }} /> {p.name}
                </td>
                <td>{settlements}</td>
                <td>{cities}</td>
                <td title={`Longest road: ${road}`}>{state.longestRoadHolder === p.id ? '✓' : '—'}</td>
                <td title={`Wardens played: ${p.wardensPlayed}`}>{state.largestArmyHolder === p.id ? '✓' : '—'}</td>
                <td>{monuments}</td>
                <td>
                  <strong>{total}</strong>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="modal-actions">
          <button className="primary" onClick={onNewGame}>
            Play again
          </button>
          <button onClick={onMenu}>Main menu</button>
          <button className="ghost" onClick={onClose}>
            View board
          </button>
        </div>
      </div>
    </div>
  );
}

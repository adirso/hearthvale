import { useState } from 'react';
import { victoryPoints, type GameState } from '../engine';
import type { Prefs } from './storage';

interface Props {
  prefs: Prefs;
  saved: GameState | null;
  onStart: (prefs: Prefs) => void;
  onResume: () => void;
}

const DIFFICULTIES: { id: Prefs['difficulty']; label: string; blurb: string }[] = [
  { id: 'basic', label: 'Basic', blurb: 'Rivals build what they can and pick spots by raw yield.' },
  { id: 'intermediate', label: 'Intermediate', blurb: 'Rivals plan goals, weigh scarcity, race for titles and aim the raider at the leader.' },
  { id: 'mixed', label: 'Mixed', blurb: 'One rival of each kind.' },
];

export function StartScreen({ prefs, saved, onStart, onResume }: Props) {
  const [name, setName] = useState(prefs.name);
  const [difficulty, setDifficulty] = useState(prefs.difficulty);
  const [speed, setSpeed] = useState(prefs.speed);
  const resumable = saved && saved.phase !== 'gameOver' ? saved : null;
  const human = resumable?.players.find((p) => p.isHuman);

  return (
    <div className="start">
      <div className="start-card">
        <div className="logo" aria-hidden="true">
          <svg viewBox="-50 -50 100 100" width="84" height="84">
            <polygon points="0,-44 38,-22 38,22 0,44 -38,22 -38,-22" fill="#e8c65a" stroke="#5b4a2c" strokeWidth="4" />
            <polygon points="-16,18 -16,-2 0,-16 16,-2 16,18" fill="#c0392b" stroke="#1b1b1b" strokeWidth="3" />
            <rect x="-5" y="4" width="10" height="14" fill="#f6ecd4" />
          </svg>
        </div>
        <h1>Hearthvale</h1>
        <p className="tagline">Settle a wild island, bargain for what you lack, and be first to raise a realm of ten renown.</p>

        {resumable && human && (
          <button className="primary wide" onClick={onResume}>
            Resume game — turn {Math.max(1, resumable.turn)}, you have {victoryPoints(resumable, human.id)} VP
          </button>
        )}

        <div className="form">
          <label>
            Your name
            <input value={name} maxLength={16} onChange={(e) => setName(e.target.value)} />
          </label>
          <fieldset>
            <legend>Rival difficulty</legend>
            {DIFFICULTIES.map((d) => (
              <label key={d.id} className={`radio ${difficulty === d.id ? 'selected' : ''}`}>
                <input type="radio" name="difficulty" checked={difficulty === d.id} onChange={() => setDifficulty(d.id)} />
                <span>
                  <strong>{d.label}</strong>
                  <small>{d.blurb}</small>
                </span>
              </label>
            ))}
          </fieldset>
          <label>
            Rival pace
            <select value={speed} onChange={(e) => setSpeed(e.target.value as Prefs['speed'])}>
              <option value="relaxed">Relaxed</option>
              <option value="normal">Normal</option>
              <option value="fast">Fast</option>
            </select>
          </label>
        </div>

        <button className={resumable ? 'wide' : 'primary wide'} onClick={() => onStart({ name: name.trim() || 'You', difficulty, speed })}>
          New game
        </button>
        {resumable && <p className="hint">Starting a new game replaces your saved game.</p>}

        <details className="howto">
          <summary>How to play</summary>
          <ul>
            <li>Each settler places two settlements and two roads. The order reverses for the second pair, and your second settlement pays one card from each tile it touches.</li>
            <li>Every turn begins with a roll. Tiles showing that number pay their neighbors: 1 card per settlement, 2 per city.</li>
            <li>Spend cards on roads, settlements, cities and development cards. Settlements need a road of yours and an empty intersection on every side.</li>
            <li>Trade 4:1 with the bank, 3:1 or 2:1 at harbors you have built on, or offer deals to rivals.</li>
            <li>A 7 wakes the raider: anyone with more than 7 cards gives up half, then the roller moves the raider and robs a neighbor.</li>
            <li>The longest road (5+) earns the Grand Highway, and 3+ wardens earns the Strongest Guard — 2 points each.</li>
            <li>Reach 10 victory points on your turn to win.</li>
          </ul>
        </details>
      </div>
    </div>
  );
}

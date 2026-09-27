import { useState } from 'react';
import { createGame, type Difficulty, type GameState } from './engine';
import { GameScreen } from './ui/GameScreen';
import { StartScreen } from './ui/StartScreen';
import { clearGame, loadGame, loadPrefs, saveGame, savePrefs, type Prefs } from './ui/storage';

const COLORS = { human: '#d64541', rivalA: '#2e86de', rivalB: '#8e44ad' };

function newGameFrom(prefs: Prefs): GameState {
  const rivalDifficulty: [Difficulty, Difficulty] =
    prefs.difficulty === 'mixed' ? ['basic', 'intermediate'] : [prefs.difficulty, prefs.difficulty];
  return createGame({
    players: [
      { name: prefs.name, isHuman: true, difficulty: 'intermediate', color: COLORS.human },
      { name: 'Maren', isHuman: false, difficulty: rivalDifficulty[0], color: COLORS.rivalA },
      { name: 'Tobin', isHuman: false, difficulty: rivalDifficulty[1], color: COLORS.rivalB },
    ],
  });
}

export default function App() {
  const [prefs, setPrefs] = useState<Prefs>(loadPrefs);
  const [game, setGame] = useState<{ id: number; state: GameState } | null>(null);

  const updatePrefs = (next: Prefs) => {
    setPrefs(next);
    savePrefs(next);
  };

  const start = (next: Prefs) => {
    updatePrefs(next);
    clearGame();
    const state = newGameFrom(next);
    saveGame(state);
    setGame((g) => ({ id: (g?.id ?? 0) + 1, state }));
  };

  if (!game) {
    return (
      <StartScreen
        prefs={prefs}
        saved={loadGame()}
        onStart={start}
        onResume={() => {
          const saved = loadGame();
          if (saved) setGame({ id: Date.now(), state: saved });
        }}
      />
    );
  }

  return (
    <GameScreen
      key={game.id}
      initial={game.state}
      speed={prefs.speed}
      onSpeedChange={(speed) => updatePrefs({ ...prefs, speed })}
      onNewGame={() => start(prefs)}
      onMenu={() => setGame(null)}
    />
  );
}

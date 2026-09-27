import { useState } from 'react';
import type { GameState } from './engine';
import { GameScreen } from './ui/GameScreen';
import { newGameFrom } from './ui/newGame';
import { StartScreen } from './ui/StartScreen';
import { clearGame, loadGame, loadPrefs, saveGame, savePrefs, type Prefs } from './ui/storage';

export default function App() {
  const [prefs, setPrefs] = useState<Prefs>(loadPrefs);
  const [game, setGame] = useState<{ id: number; state: GameState } | null>(null);

  const updatePrefs = (next: Prefs) => {
    setPrefs(next);
    savePrefs(next);
  };

  /** `seed` is the map previewed on the start screen; omitted means a fresh random map. */
  const start = (next: Prefs, seed?: number) => {
    updatePrefs(next);
    clearGame();
    const state = newGameFrom(next, seed);
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
      sound={prefs.sound}
      onSoundChange={(sound) => updatePrefs({ ...prefs, sound })}
      onNewGame={() => start(prefs)}
      onMenu={() => setGame(null)}
    />
  );
}

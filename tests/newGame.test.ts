import { describe, expect, it } from 'vitest';
import { colorHex, newGameFrom, PLAYER_COLORS } from '../src/ui/newGame';
import { DEFAULT_PREFS } from '../src/ui/storage';

const mapOf = (s: ReturnType<typeof newGameFrom>) => s.hexes.map((h) => `${h.terrain}${h.token}`).join();

describe('new game options', () => {
  it('generates a fresh map for every new game', () => {
    const maps = new Set(Array.from({ length: 20 }, () => mapOf(newGameFrom(DEFAULT_PREFS))));
    expect(maps.size).toBe(20);
  });

  it('plays exactly the previewed map for a given seed, whatever the other options', () => {
    const preview = newGameFrom({ ...DEFAULT_PREFS, firstPlayer: 'you' }, 999);
    const game = newGameFrom({ ...DEFAULT_PREFS, color: 'amber', firstPlayer: 'random' }, 999);
    expect(mapOf(game)).toBe(mapOf(preview));
    expect(game.ports).toEqual(preview.ports);
  });

  it('gives the human the chosen colour and rivals two different ones', () => {
    for (const c of PLAYER_COLORS) {
      const s = newGameFrom({ ...DEFAULT_PREFS, color: c.id });
      expect(s.players[0].color).toBe(colorHex(c.id));
      expect(new Set(s.players.map((p) => p.color)).size).toBe(3);
    }
  });

  it('lets the chosen player place first, with the snake order following', () => {
    const cases = [
      ['you', [0, 1, 2, 2, 1, 0]],
      ['maren', [1, 2, 0, 0, 2, 1]],
      ['tobin', [2, 0, 1, 1, 0, 2]],
    ] as const;
    for (const [firstPlayer, order] of cases) {
      const s = newGameFrom({ ...DEFAULT_PREFS, firstPlayer });
      expect(s.currentPlayer).toBe(order[0]);
      expect(s.setup!.order).toEqual(order);
    }
    const starters = new Set(Array.from({ length: 40 }, (_, i) => newGameFrom({ ...DEFAULT_PREFS, firstPlayer: 'random' }, i).currentPlayer));
    expect(starters.size).toBe(3);
  });
});

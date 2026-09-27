// Procedural sound effects built with the Web Audio API — no audio files.
// Browsers only allow audio after a user gesture, so the context is created
// lazily and resumed on the first pointer or key press.

export type SoundName =
  | 'dice'
  | 'road'
  | 'settlement'
  | 'city'
  | 'buyCard'
  | 'playCard'
  | 'trade'
  | 'raider'
  | 'steal'
  | 'discard'
  | 'gather'
  | 'yourTurn'
  | 'victory'
  | 'defeat'
  | 'error';

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let enabled = true;

function audio(): { ctx: AudioContext; out: GainNode } | null {
  if (typeof window === 'undefined' || !('AudioContext' in window)) return null;
  if (!ctx) {
    ctx = new AudioContext();
    master = ctx.createGain();
    master.gain.value = 0.5;
    master.connect(ctx.destination);
  }
  if (ctx.state === 'suspended') void ctx.resume();
  return { ctx, out: master! };
}

if (typeof window !== 'undefined') {
  const unlock = () => {
    audio();
    window.removeEventListener('pointerdown', unlock);
    window.removeEventListener('keydown', unlock);
  };
  window.addEventListener('pointerdown', unlock);
  window.addEventListener('keydown', unlock);
}

export function setSoundEnabled(on: boolean) {
  enabled = on;
}

function tone(
  a: { ctx: AudioContext; out: GainNode },
  freq: number,
  start: number,
  duration: number,
  opts: { type?: OscillatorType; volume?: number; endFreq?: number; attack?: number } = {},
) {
  const { ctx, out } = a;
  const t0 = ctx.currentTime + start;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = opts.type ?? 'sine';
  osc.frequency.setValueAtTime(freq, t0);
  if (opts.endFreq) osc.frequency.exponentialRampToValueAtTime(opts.endFreq, t0 + duration);
  const vol = opts.volume ?? 0.3;
  gain.gain.setValueAtTime(0.0001, t0);
  gain.gain.exponentialRampToValueAtTime(vol, t0 + (opts.attack ?? 0.008));
  gain.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);
  osc.connect(gain).connect(out);
  osc.start(t0);
  osc.stop(t0 + duration + 0.05);
}

function noise(
  a: { ctx: AudioContext; out: GainNode },
  start: number,
  duration: number,
  opts: { freq?: number; q?: number; volume?: number; endFreq?: number; type?: BiquadFilterType } = {},
) {
  const { ctx, out } = a;
  const t0 = ctx.currentTime + start;
  const length = Math.max(1, Math.floor(ctx.sampleRate * duration));
  const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < length; i++) data[i] = Math.random() * 2 - 1;
  const src = ctx.createBufferSource();
  src.buffer = buffer;
  const filter = ctx.createBiquadFilter();
  filter.type = opts.type ?? 'bandpass';
  filter.frequency.setValueAtTime(opts.freq ?? 2000, t0);
  if (opts.endFreq) filter.frequency.exponentialRampToValueAtTime(opts.endFreq, t0 + duration);
  filter.Q.value = opts.q ?? 1;
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(opts.volume ?? 0.3, t0);
  gain.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);
  src.connect(filter).connect(gain).connect(out);
  src.start(t0);
  src.stop(t0 + duration + 0.05);
}

const SOUNDS: Record<SoundName, (a: { ctx: AudioContext; out: GainNode }) => void> = {
  dice: (a) => {
    // Two dice clattering on a table, then settling.
    const hits = [0, 0.07, 0.13, 0.22, 0.29, 0.38, 0.44, 0.52];
    hits.forEach((t, i) => {
      noise(a, t, 0.045, { freq: 2600 + Math.random() * 1800, q: 6, volume: 0.5 - i * 0.04 });
      tone(a, 900 + Math.random() * 500, t, 0.04, { type: 'triangle', volume: 0.08 });
    });
  },
  road: (a) => {
    // Wooden plank laid down.
    tone(a, 190, 0, 0.16, { type: 'triangle', endFreq: 80, volume: 0.45 });
    noise(a, 0, 0.06, { freq: 900, q: 2, volume: 0.35 });
  },
  settlement: (a) => {
    // Two hammer knocks and a warm chime.
    noise(a, 0, 0.05, { freq: 1200, q: 3, volume: 0.4 });
    tone(a, 160, 0, 0.1, { type: 'triangle', endFreq: 90, volume: 0.35 });
    noise(a, 0.12, 0.05, { freq: 1300, q: 3, volume: 0.4 });
    tone(a, 170, 0.12, 0.1, { type: 'triangle', endFreq: 95, volume: 0.35 });
    tone(a, 523.25, 0.26, 0.5, { type: 'sine', volume: 0.22 });
    tone(a, 659.25, 0.34, 0.55, { type: 'sine', volume: 0.2 });
  },
  city: (a) => {
    // Rising fanfare over a low bell.
    tone(a, 130.8, 0, 0.9, { type: 'sine', volume: 0.25 });
    [523.25, 659.25, 783.99, 1046.5].forEach((f, i) =>
      tone(a, f, i * 0.1, 0.45 + i * 0.05, { type: 'triangle', volume: 0.2 }),
    );
  },
  buyCard: (a) => {
    // Card slid off the deck.
    noise(a, 0, 0.18, { freq: 1500, endFreq: 5000, q: 1.2, volume: 0.3 });
    tone(a, 880, 0.12, 0.12, { type: 'sine', volume: 0.12 });
  },
  playCard: (a) => {
    noise(a, 0, 0.12, { freq: 3500, endFreq: 1500, q: 1.5, volume: 0.3 });
    tone(a, 587.33, 0.05, 0.3, { type: 'triangle', volume: 0.2 });
    tone(a, 880, 0.12, 0.35, { type: 'triangle', volume: 0.18 });
  },
  trade: (a) => {
    // Coins changing hands.
    tone(a, 1760, 0, 0.18, { type: 'sine', volume: 0.18 });
    tone(a, 2349, 0.07, 0.22, { type: 'sine', volume: 0.15 });
    tone(a, 1975, 0.15, 0.25, { type: 'sine', volume: 0.13 });
  },
  raider: (a) => {
    // An ominous low swell.
    tone(a, 98, 0, 0.7, { type: 'sawtooth', endFreq: 65, volume: 0.18, attack: 0.08 });
    tone(a, 103.8, 0, 0.7, { type: 'sawtooth', endFreq: 69, volume: 0.12, attack: 0.08 });
    noise(a, 0, 0.6, { type: 'lowpass', freq: 400, volume: 0.25 });
  },
  steal: (a) => {
    noise(a, 0, 0.2, { freq: 4000, endFreq: 800, q: 2, volume: 0.35 });
    tone(a, 660, 0.05, 0.15, { type: 'square', endFreq: 330, volume: 0.07 });
  },
  discard: (a) => {
    noise(a, 0, 0.25, { freq: 2500, endFreq: 600, q: 0.8, volume: 0.3 });
  },
  gather: (a) => {
    tone(a, 1318.5, 0, 0.12, { type: 'sine', volume: 0.12 });
    tone(a, 1568, 0.06, 0.15, { type: 'sine', volume: 0.1 });
  },
  yourTurn: (a) => {
    tone(a, 659.25, 0, 0.25, { type: 'sine', volume: 0.18 });
    tone(a, 987.77, 0.12, 0.35, { type: 'sine', volume: 0.16 });
  },
  victory: (a) => {
    [523.25, 659.25, 783.99, 1046.5, 783.99, 1046.5].forEach((f, i) =>
      tone(a, f, i * 0.13, i === 5 ? 0.9 : 0.25, { type: 'triangle', volume: 0.22 }),
    );
  },
  defeat: (a) => {
    [392, 349.23, 311.13, 261.63].forEach((f, i) =>
      tone(a, f, i * 0.22, i === 3 ? 0.9 : 0.3, { type: 'triangle', volume: 0.2 }),
    );
  },
  error: (a) => {
    tone(a, 150, 0, 0.14, { type: 'square', volume: 0.08 });
    tone(a, 120, 0.1, 0.16, { type: 'square', volume: 0.08 });
  },
};

export function playSound(name: SoundName, delaySeconds = 0) {
  if (!enabled) return;
  const a = audio();
  if (!a || a.ctx.state !== 'running') return;
  if (delaySeconds > 0) setTimeout(() => SOUNDS[name](a), delaySeconds * 1000);
  else SOUNDS[name](a);
}

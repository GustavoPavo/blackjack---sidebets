/**
 * Efeitos sonoros SINTETIZADOS no próprio navegador (Web Audio API). Não há arquivos de áudio de terceiros:
 * os sons são gerados por código original deste projeto (ver docs/ASSETS.md). Volume discreto.
 * O contexto de áudio só é criado após o primeiro gesto do usuário (política dos navegadores).
 */
type Ctx = AudioContext;
let ctx: Ctx | null = null;
const MASTER = 0.16;

function audio(): Ctx | null {
  try {
    if (!ctx) {
      const AC = (globalThis as { AudioContext?: new () => Ctx; webkitAudioContext?: new () => Ctx }).AudioContext
        ?? (globalThis as { webkitAudioContext?: new () => Ctx }).webkitAudioContext;
      if (!AC) return null;
      ctx = new AC();
    }
    if (ctx.state === 'suspended') void ctx.resume();
    return ctx;
  } catch { return null; }
}

function tone(c: Ctx, freq: number, start: number, dur: number, type: OscillatorType, gain: number, endFreq?: number) {
  const o = c.createOscillator();
  const g = c.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, start);
  if (endFreq) o.frequency.exponentialRampToValueAtTime(endFreq, start + dur);
  g.gain.setValueAtTime(0.0001, start);
  g.gain.exponentialRampToValueAtTime(gain * MASTER, start + 0.008);
  g.gain.exponentialRampToValueAtTime(0.0001, start + dur);
  o.connect(g).connect(c.destination);
  o.start(start);
  o.stop(start + dur + 0.02);
}

function noise(c: Ctx, start: number, dur: number, gain: number, freq: number) {
  const len = Math.max(1, Math.floor(c.sampleRate * dur));
  const buf = c.createBuffer(1, len, c.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
  const src = c.createBufferSource();
  src.buffer = buf;
  const f = c.createBiquadFilter();
  f.type = 'bandpass';
  f.frequency.value = freq;
  f.Q.value = 0.9;
  const g = c.createGain();
  g.gain.value = gain * MASTER;
  src.connect(f).connect(g).connect(c.destination);
  src.start(start);
}

/** Carta deslizando sobre o feltro. */
export function playCard() {
  const c = audio(); if (!c) return;
  const t = c.currentTime;
  noise(c, t, 0.07, 1.6, 2600);
  tone(c, 180, t, 0.05, 'triangle', 0.35, 90);
}
/** Ficha pousando em outra. */
export function playChip() {
  const c = audio(); if (!c) return;
  const t = c.currentTime;
  tone(c, 1850, t, 0.06, 'triangle', 0.5, 1300);
  tone(c, 1250, t + 0.045, 0.07, 'triangle', 0.4, 900);
}
/** Vitória: pequeno arpejo ascendente. */
export function playWin() {
  const c = audio(); if (!c) return;
  const t = c.currentTime;
  [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => tone(c, f, t + i * 0.09, 0.28, 'sine', 0.55));
}

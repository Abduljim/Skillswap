/**
 * Generates client/android/app/src/main/res/raw/call_chime.wav — the bundled
 * incoming-call sound. Pure Node (no dependencies): synthesizes a crisp,
 * repeating marimba-style arpeggio (mid/high frequencies that cut through room
 * noise) as a small 16-bit PCM mono WAV. Re-run with `node scripts/...mjs`.
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const SR = 44100;
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

// Classic marimba motif: a quick ascending run in A major, then a low-to-mid
// answer — recognizable, fast-attack, short decay so it never smears.
const NOTES = [440, 554.37, 659.25, 880, 1108.73, 880, 659.25];
const NOTE_DUR = 0.21;
const GAP = 0.13;
const TOTAL = NOTES.length * (NOTE_DUR + GAP) + 0.35;

function marimba(f, t) {
  const amp = Math.exp(-6.2 * t);
  const attack = Math.min(1, t / 0.002);
  const detune = 1 + (Math.random() - 0.5) * 0.006;
  const f1 = Math.sin(2 * Math.PI * f * detune * t);
  const f4 = 0.3 * Math.sin(2 * Math.PI * f * 4 * t);
  const f9 = 0.12 * Math.sin(2 * Math.PI * f * 9.2 * t);
  return (f1 + f4 + f9) * amp * attack;
}

const samples = new Float32Array(Math.round(SR * TOTAL));
NOTES.forEach((f, i) => {
  const start = i * (NOTE_DUR + GAP);
  const n = Math.round(NOTE_DUR * SR);
  const s = Math.round(start * SR);
  for (let j = 0; j < n; j++) {
    const t = j / SR;
    if (s + j < samples.length) samples[s + j] += marimba(f, t) * 0.32;
  }
});

const warmEnd = 0.015 * SR;
for (let i = samples.length - Math.round(warmEnd); i < samples.length; i++) {
  const k = (samples.length - i) / warmEnd;
  samples[i] *= k;
}

const dir = resolve(ROOT, 'client/android/app/src/main/res/raw');
mkdirSync(dir, { recursive: true });
const bytes = new Uint8Array(44 + samples.length * 2);
const view = new DataView(bytes.buffer);
view.setUint32(0, 0x46464952, true); // 'RIFF'
view.setUint32(4, 36 + samples.length * 2, true);
view.setUint32(8, 0x45564157, true); // 'WAVE'
view.setUint32(12, 0x20746d66, true); // 'fmt '
view.setUint32(16, 16, true);
view.setUint16(20, 1, true); // PCM
view.setUint16(22, 1, true); // mono
view.setUint32(24, SR, true);
view.setUint32(28, SR * 2, true); // byte rate
view.setUint16(32, 2, true); // block align
view.setUint16(34, 16, true); // bits per sample
view.setUint32(36, 0x61746164, true); // 'data'
view.setUint32(40, samples.length * 2, true);
for (let i = 0; i < samples.length; i++) {
  const v = Math.max(-1, Math.min(1, samples[i]));
  view.setInt16(44 + i * 2, Math.round(v * 32767), true);
}
const out = resolve(dir, 'call_chime.wav');
writeFileSync(out, bytes);
console.log(`wrote ${out} (${bytes.length} bytes, ${TOTAL.toFixed(2)}s loop)`);
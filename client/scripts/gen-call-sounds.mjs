#!/usr/bin/env node
/**
 * Generates the two bundled call sounds as 16-bit mono WAV files in
 * android/app/src/main/res/raw/.
 *
 * Why a script and not checked-in binaries of unknown origin: the sounds are
 * part of the design, so they belong in review. Both are synthesised from the
 * note tables below — no samples, no third-party audio, no AI generation — and
 * `client/src/lib/ringtone.ts` plays the SAME note tables through WebAudio so
 * the browser preview and the Android notification ring are the same tune.
 *
 *   node scripts/gen-call-sounds.mjs
 *
 * Each file ends with a short silence because CallNotifier rings with
 * MediaPlayer.setLooping(true); the gap turns the loop into a natural pulse
 * instead of a stutter.
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = join(HERE, '..', 'android', 'app', 'src', 'main', 'res', 'raw');
const RATE = 22050;

/* ------------------------------------------------------------------ voices */

/**
 * Marimba-ish pluck: sine fundamental with two quiet upper partials and a fast
 * exponential decay. Bright enough to cut across a lecture hall or a street.
 */
function pluck(out, at, freq, dur, peak) {
  const attack = 0.006;
  for (let i = 0; i < dur * RATE; i++) {
    const t = i / RATE;
    const idx = Math.round((at + t) * RATE);
    if (idx >= out.length) break;
    const env =
      t < attack
        ? t / attack
        : Math.exp((-3.4 * (t - attack)) / Math.max(0.05, dur));
    const s =
      Math.sin(2 * Math.PI * freq * t) +
      0.34 * Math.sin(2 * Math.PI * freq * 2 * t) +
      0.12 * Math.sin(2 * Math.PI * freq * 3 * t);
    out[idx] += env * peak * (s / 1.46);
  }
}

/**
 * Warm pad: two slightly detuned sines per note plus a quiet octave, with a
 * slow attack and a long release. Nothing percussive, so it never startles.
 */
function swell(out, at, freqs, dur, peak) {
  const attack = dur * 0.34;
  const detune = 1.0035; // ~6 cents — enough to feel like a room, not a chorus
  for (let i = 0; i < dur * RATE; i++) {
    const t = i / RATE;
    const idx = Math.round((at + t) * RATE);
    if (idx >= out.length) break;
    const env =
      t < attack
        ? 0.5 - 0.5 * Math.cos((Math.PI * t) / attack) // raised cosine in
        : Math.pow(1 - (t - attack) / (dur - attack), 1.7); // long tail out
    let s = 0;
    for (const f of freqs) {
      s += Math.sin(2 * Math.PI * f * t) + 0.85 * Math.sin(2 * Math.PI * f * detune * t);
      s += 0.16 * Math.sin(2 * Math.PI * f * 2 * t);
    }
    out[idx] += env * peak * (s / (freqs.length * 2.01));
  }
}

/* ------------------------------------------------------------------ scores */

// C-E-G-C, then a descending flourish. Rising = "pick up", which is the point.
const HIGH = {
  seconds: 2.0,
  peak: 0.86,
  paint(out) {
    const notes = [523.25, 659.25, 783.99, 1046.5];
    notes.forEach((f, i) => pluck(out, i * 0.115, f, 0.34, 0.9));
    pluck(out, 0.58, 1318.51, 0.3, 0.7);
    pluck(out, 0.7, 1046.5, 0.34, 0.75);
    pluck(out, 0.82, 783.99, 0.44, 0.8);
    // Second pass an octave-spread wider, so the loop does not feel like a beep.
    pluck(out, 1.16, 659.25, 0.3, 0.5);
    pluck(out, 1.26, 987.77, 0.3, 0.5);
    pluck(out, 1.36, 1318.51, 0.46, 0.55);
  },
};

// F major → G major, low and slow. Two breaths, no attack, no urgency.
const SOOTHE = {
  seconds: 4.4,
  peak: 0.5,
  paint(out) {
    swell(out, 0.0, [174.61, 261.63, 349.23], 2.0, 1.0); // F3 + C4 + F4
    swell(out, 1.75, [196.0, 293.66, 392.0], 2.15, 0.92); // G3 + D4 + G4
    swell(out, 3.5, [130.81, 196.0], 0.85, 0.4); // low C3 + G3 release
  },
};

/* -------------------------------------------------------------------- wav */

function render(score) {
  const total = Math.ceil(score.seconds * RATE);
  const out = new Float64Array(total);
  score.paint(out);

  let peak = 0;
  for (let i = 0; i < total; i++) peak = Math.max(peak, Math.abs(out[i]));
  const gain = peak > 0 ? score.peak / peak : 1; // normalise, never clip

  const data = Buffer.alloc(total * 2);
  for (let i = 0; i < total; i++) {
    const v = Math.max(-1, Math.min(1, out[i] * gain));
    data.writeInt16LE(Math.round(v * 32767), i * 2);
  }

  const header = Buffer.alloc(44);
  header.write('RIFF', 0);
  header.writeUInt32LE(36 + data.length, 4);
  header.write('WAVE', 8);
  header.write('fmt ', 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20); // PCM
  header.writeUInt16LE(1, 22); // mono
  header.writeUInt32LE(RATE, 24);
  header.writeUInt32LE(RATE * 2, 28); // byte rate
  header.writeUInt16LE(2, 32); // block align
  header.writeUInt16LE(16, 34); // bits per sample
  header.write('data', 36);
  header.writeUInt32LE(data.length, 40);

  return Buffer.concat([header, data]);
}

mkdirSync(OUT_DIR, { recursive: true });
for (const [name, score] of [
  ['ring_high', HIGH],
  ['ring_soothe', SOOTHE],
]) {
  const buf = render(score);
  const path = join(OUT_DIR, `${name}.wav`);
  writeFileSync(path, buf);
  console.log(
    `  ${name}.wav  ${(buf.length / 1024).toFixed(0)} KB  ${score.seconds.toFixed(2)}s  ` +
      `${RATE} Hz mono 16-bit  peak ${score.peak}`,
  );
}
console.log(`written to ${OUT_DIR}`);

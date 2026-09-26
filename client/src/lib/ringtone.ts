import { Capacitor } from '@capacitor/core';
import { getCallSoundSource, type CallSoundSource } from './call-notifier';

/**
 * In-app call sounds, synthesised with WebAudio.
 *
 * Two ringtones exist — 'high' (Beacon: a bright rising marimba figure) and
 * 'soothe' (Drift: a slow warm pad) — plus 'silent'. The note tables below are
 * the same ones `client/scripts/gen-call-sounds.mjs` renders into
 * `android/app/src/main/res/raw/ring_{high,soothe}.wav`, so the Android
 * notification ring and the browser preview are the same tune rather than two
 * approximations of one.
 *
 * Where each path is used:
 *   - Android incoming call → the native CallNotifier plays the WAV (looping
 *     MediaPlayer), so the web voice stays quiet; startRingtone(true) returns
 *     early there.
 *   - Web/browser incoming call and outgoing ringback → this file.
 *   - Settings → Calls preview → previewCallSound().
 */

let ctx: AudioContext | null = null;
let ringTimer: ReturnType<typeof setInterval> | null = null;
/** Live oscillators, so stopRingtone can cut a loop mid-phrase instead of
 *  letting the tail of the last repetition keep sounding. */
let voices: OscillatorNode[] = [];

/**
 * Android WebViews suspend the AudioContext until the first real user gesture.
 * Calling this from the very first pointerdown re-opens the audio path so the
 * socket-driven ringtone (and WebRTC audio) can start without an extra tap.
 */
export function unlockAudio(): void {
  try {
    const AC = window.AudioContext || (window as any).webkitAudioContext;
    if (!AC) return;
    if (!ctx) ctx = new AC();
    if (ctx.state === 'suspended') void ctx.resume();
  } catch {
    // Unsupported — the native ringtone still covers ringing.
  }
}

/* ------------------------------------------------------------------ voices */

/** Marimba-ish pluck: fundamental + two quiet upper partials, fast decay. */
function pluck(at: number, freq: number, dur: number, peak: number): void {
  if (!ctx) return;
  const bus = ctx.createGain();
  bus.gain.setValueAtTime(0.0001, at);
  bus.gain.linearRampToValueAtTime(peak * 0.3, at + 0.006);
  bus.gain.exponentialRampToValueAtTime(0.0001, at + dur);
  bus.connect(ctx.destination);

  for (const [mult, level] of [
    [1, 1],
    [2, 0.34],
    [3, 0.12],
  ] as const) {
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.value = freq * mult;
    g.gain.value = level / 1.46;
    osc.connect(g).connect(bus);
    osc.start(at);
    osc.stop(at + dur + 0.05);
    voices.push(osc);
  }
}

/** Warm pad: two detuned sines per note plus a quiet octave, slow in and out. */
function swell(at: number, freqs: number[], dur: number, peak: number): void {
  if (!ctx) return;
  const bus = ctx.createGain();
  const attack = dur * 0.34;
  bus.gain.setValueAtTime(0.0001, at);
  bus.gain.linearRampToValueAtTime(peak * 0.22, at + attack);
  bus.gain.exponentialRampToValueAtTime(0.0001, at + dur);
  bus.connect(ctx.destination);

  for (const f of freqs) {
    for (const [mult, level, detune] of [
      [1, 1, -3],
      [1.0035, 0.85, 3],
      [2, 0.16, 0],
    ] as const) {
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = f * mult;
      osc.detune.value = detune;
      g.gain.value = level / (freqs.length * 2.01);
      osc.connect(g).connect(bus);
      osc.start(at);
      osc.stop(at + dur + 0.05);
      voices.push(osc);
    }
  }
}

/* ------------------------------------------------------------------ scores */

/** C-E-G-C then a descending flourish. Rising contour = "pick up". */
const HIGH_SCORE = {
  loopMs: 2000,
  paint(at: number) {
    [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => pluck(at + i * 0.115, f, 0.34, 0.9));
    pluck(at + 0.58, 1318.51, 0.3, 0.7);
    pluck(at + 0.7, 1046.5, 0.34, 0.75);
    pluck(at + 0.82, 783.99, 0.44, 0.8);
    pluck(at + 1.16, 659.25, 0.3, 0.5);
    pluck(at + 1.26, 987.77, 0.3, 0.5);
    pluck(at + 1.36, 1318.51, 0.46, 0.55);
  },
};

/** F major → G major, low and slow. Two breaths, no percussive edge. */
const SOOTHE_SCORE = {
  loopMs: 4400,
  paint(at: number) {
    swell(at, [174.61, 261.63, 349.23], 2.0, 1.0);
    swell(at + 1.75, [196.0, 293.66, 392.0], 2.15, 0.92);
    swell(at + 3.5, [130.81, 196.0], 0.85, 0.4);
  },
};

const SCORES = { high: HIGH_SCORE, soothe: SOOTHE_SCORE } as const;
export type RingKind = keyof typeof SCORES;

/** 'silent' (and anything unknown) rings nothing. */
function kindOf(source: CallSoundSource): RingKind | null {
  return source === 'high' || source === 'soothe' ? source : null;
}

function clearVoices(): void {
  const now = ctx ? ctx.currentTime : 0;
  for (const osc of voices) {
    try {
      osc.stop(now);
    } catch {
      // Already finished — nothing to cancel.
    }
  }
  voices = [];
}

/**
 * Play one pass of a sound. Used by the Settings → Calls picker so a choice can
 * be heard before it is saved, and by startRingtone() for each loop repetition.
 */
export function previewCallSound(source: CallSoundSource = getCallSoundSource()): void {
  stopRingtone();
  try {
    const AC = window.AudioContext || (window as any).webkitAudioContext;
    if (!AC) return;
    if (!ctx) ctx = new AC();
    if (ctx.state === 'suspended') void ctx.resume();
    if (ctx.state !== 'running') return;
    const kind = kindOf(source);
    if (!kind) return; // silent
    SCORES[kind].paint(ctx.currentTime + 0.02);
  } catch {
    // Ignored — audio is a nicety, never a failure path.
  }
}

/**
 * Ring for an incoming call, or play the outgoing ringback. Pass
 * skipAndroid=true for incoming calls on the installed app — the native
 * CallNotifier notification rings there with the user's chosen sound, so a web
 * voice would stack on top of it.
 *
 * Honours the 'silent' choice on every platform: a user who picked vibrate-only
 * gets no tone from the WebView either.
 */
export function startRingtone(skipAndroid = false): void {
  stopRingtone();
  if (skipAndroid && Capacitor.getPlatform() === 'android') return;
  try {
    const kind = kindOf(getCallSoundSource());
    if (!kind) return;
    const AC = window.AudioContext || (window as any).webkitAudioContext;
    if (!AC) return;
    if (!ctx) ctx = new AC();
    if (ctx.state !== 'running') return; // the native CallNotifier rings instead
    const score = SCORES[kind];
    score.paint(ctx.currentTime + 0.02);
    ringTimer = setInterval(() => {
      if (!ctx) return;
      score.paint(ctx.currentTime + 0.02);
    }, score.loopMs);
  } catch {
    // Ignored
  }
}

export function stopRingtone(): void {
  if (ringTimer) {
    clearInterval(ringTimer);
    ringTimer = null;
  }
  clearVoices();
}

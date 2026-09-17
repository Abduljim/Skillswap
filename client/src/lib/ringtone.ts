let ctx: AudioContext | null = null;
let ringTimer: ReturnType<typeof setInterval> | null = null;

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
    // Unsupported — native ringtone still covers ringing.
  }
}

function beep(at: number, dur: number, freq: number) {
  if (!ctx) return;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = 'sine';
  osc.frequency.value = freq;
  gain.gain.setValueAtTime(0.0001, at);
  gain.gain.linearRampToValueAtTime(0.32, at + 0.03);
  gain.gain.setValueAtTime(0.32, at + dur - 0.03);
  gain.gain.linearRampToValueAtTime(0.0001, at + dur);
  osc.connect(gain).connect(ctx.destination);
  osc.start(at);
  osc.stop(at + dur + 0.05);
}

export function startRingtone(): void {
  stopRingtone();
  try {
    const AC = window.AudioContext || (window as any).webkitAudioContext;
    if (!AC) return;
    if (!ctx) ctx = new AC();
    if (ctx.state !== 'running') return; // native CallNotifier rings instead
    ringTimer = setInterval(() => {
      if (!ctx) return;
      const now = ctx.currentTime;
      beep(now, 0.9, 830);
      beep(now + 1.15, 0.9, 830);
    }, 2600);
  } catch {
    // Ignored
  }
}

export function stopRingtone(): void {
  if (ringTimer) {
    clearInterval(ringTimer);
    ringTimer = null;
  }
}
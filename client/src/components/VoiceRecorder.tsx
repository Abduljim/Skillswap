/**
 * In-app voice-note recorder.
 *
 * Why the app records instead of using a file picker: a voice note has to feel
 * like WhatsApp — one tap, a live meter, a cap, and a listen-before-send step.
 * MediaRecorder also lets us pin the codec (Opus, ~32 kbps: five minutes is
 * roughly 1 MB, which matters on mobile data) instead of whatever an OEM voice
 * app produced.
 *
 * Device reality, handled explicitly:
 *   - WebM/Opus is what Android WebView records; iOS Safari produces MP4/AAC,
 *     so both are offered and the first supported one wins;
 *   - `ensureMediaPermissions()` asks Android for the runtime permission
 *     natively first, because the WebView-only prompt fails outside a user
 *     gesture (the same trap the calls feature hit);
 *   - if MediaRecorder or getUserMedia is missing entirely, the sheet says so
 *     rather than showing a dead button;
 *   - the recorder stops itself at five minutes, matching the server cap, so a
 *     long note can never be recorded and then rejected at send time.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { AlertTriangle, Mic, RotateCcw, Send, Square, X } from 'lucide-react';
import { ensureMediaPermissions } from '../lib/media-permissions';
import { formatBytes, formatDuration } from '../lib/media-upload';
import AudioBubble from './AudioBubble';

export interface RecordedVoiceNote {
  blob: Blob;
  /** Object URL for local preview. The caller owns it after `onRecorded`. */
  url: string;
  bytes: number;
  durationMs: number;
  contentType: string;
}

/** Five minutes: long enough for a real explanation, short enough to stay ~1 MB. */
export const MAX_VOICE_MS = 300_000;

const BARS = 32;
const AUDIO_BITS_PER_SECOND = 32_000;

// Opus in WebM first (Android WebView), then the containers iOS and desktop offer.
const MIME_CANDIDATES = [
  'audio/webm;codecs=opus',
  'audio/webm',
  'audio/ogg;codecs=opus',
  'audio/mp4;codecs=mp4a.40.2',
  'audio/mp4',
  'audio/aac',
  '',
];

function pickMimeType(): string {
  if (typeof MediaRecorder === 'undefined' || typeof MediaRecorder.isTypeSupported !== 'function') return '';
  return MIME_CANDIDATES.find((candidate) => candidate !== '' && MediaRecorder.isTypeSupported(candidate)) || '';
}

function recorderSupported(): boolean {
  return (
    typeof MediaRecorder !== 'undefined' &&
    typeof navigator !== 'undefined' &&
    Boolean(navigator.mediaDevices?.getUserMedia)
  );
}

type Phase = 'starting' | 'ready' | 'recording' | 'review' | 'error';

export default function VoiceRecorder({
  open,
  onClose,
  onRecorded,
}: {
  open: boolean;
  onClose: () => void;
  onRecorded: (note: RecordedVoiceNote) => void;
}) {
  const [phase, setPhase] = useState<Phase>('starting');
  const [error, setError] = useState<string | null>(null);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [levels, setLevels] = useState<number[]>(() => Array(BARS).fill(0.06));
  const [clip, setClip] = useState<RecordedVoiceNote | null>(null);

  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const startedAtRef = useRef<number>(0);
  const timerRef = useRef<number | null>(null);
  const rafRef = useRef<number | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  /** The clip the sheet is holding. Nulled before handing ownership to ChatTab so
   *  teardown does not revoke a URL that is still being uploaded. */
  const clipRef = useRef<RecordedVoiceNote | null>(null);
  const phaseRef = useRef<Phase>('starting');
  phaseRef.current = phase;

  const stopMeter = useCallback(() => {
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    setLevels(Array(BARS).fill(0.06));
  }, []);

  /** Releases the microphone and any preview we still own. */
  const teardown = useCallback(() => {
    if (timerRef.current !== null) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    stopMeter();
    const recorder = recorderRef.current;
    if (recorder && recorder.state !== 'inactive') {
      recorder.ondataavailable = null;
      recorder.onstop = null;
      try {
        recorder.stop();
      } catch {
        // Already stopped.
      }
    }
    recorderRef.current = null;
    chunksRef.current = [];
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    if (audioCtxRef.current && audioCtxRef.current.state !== 'closed') {
      void audioCtxRef.current.close().catch(() => undefined);
    }
    audioCtxRef.current = null;
    analyserRef.current = null;
    if (clipRef.current) {
      URL.revokeObjectURL(clipRef.current.url);
      clipRef.current = null;
    }
    setClip(null);
    setElapsedMs(0);
    setError(null);
  }, [stopMeter]);

  const startMeter = useCallback(() => {
    const analyser = analyserRef.current;
    if (!analyser) return;
    const data = new Uint8Array(analyser.frequencyBinCount);
    let last = 0;
    const loop = () => {
      rafRef.current = requestAnimationFrame(loop);
      const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
      // ~14 fps is plenty for a lively meter and cheap on low-end phones, where
      // a 60 fps setState loop is what makes the recording UI stutter.
      if (now - last < 70) return;
      last = now;
      analyser.getByteTimeDomainData(data);
      let sum = 0;
      for (let i = 0; i < data.length; i += 1) {
        const sample = (data[i] - 128) / 128;
        sum += sample * sample;
      }
      const rms = Math.sqrt(sum / Math.max(1, data.length));
      const level = Math.max(0.06, Math.min(1, rms * 3.2));
      setLevels((previous) => [...previous.slice(1), level]);
    };
    rafRef.current = requestAnimationFrame(loop);
  }, []);

  const stopRecording = useCallback(() => {
    if (timerRef.current !== null) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    stopMeter();
    const recorder = recorderRef.current;
    if (recorder && recorder.state !== 'inactive') {
      try {
        recorder.stop();
      } catch {
        // Already stopped — onstop still fires with whatever was captured.
      }
    }
  }, [stopMeter]);

  const finishRecording = useCallback(
    (contentType: string) => {
      const chunks = chunksRef.current;
      const elapsed = startedAtRef.current ? Date.now() - startedAtRef.current : 0;
      chunksRef.current = [];
      if (chunks.length === 0 || elapsed < 300) {
        setPhase('error');
        setError('Nothing was recorded. Check that the microphone is not muted and try again.');
        return;
      }
      const type = contentType.split(';')[0].trim() || 'audio/webm';
      const blob = new Blob(chunks, { type });
      const url = URL.createObjectURL(blob);
      if (clipRef.current) URL.revokeObjectURL(clipRef.current.url);
      const note: RecordedVoiceNote = {
        blob,
        url,
        bytes: blob.size,
        durationMs: Math.max(500, Math.min(MAX_VOICE_MS, elapsed)),
        contentType: type,
      };
      clipRef.current = note;
      setClip(note);
      setPhase('review');
    },
    []
  );

  const beginRecording = useCallback(() => {
    const stream = streamRef.current;
    if (!stream) return;
    const mimeType = pickMimeType();
    let recorder: MediaRecorder;
    try {
      recorder = mimeType
        ? new MediaRecorder(stream, { mimeType, audioBitsPerSecond: AUDIO_BITS_PER_SECOND })
        : new MediaRecorder(stream, { audioBitsPerSecond: AUDIO_BITS_PER_SECOND });
    } catch {
      setPhase('error');
      setError('This device cannot record audio in the browser. Try the system voice recorder and send the file.');
      return;
    }
    chunksRef.current = [];
    recorder.ondataavailable = (event) => {
      if (event.data && event.data.size > 0) chunksRef.current.push(event.data);
    };
    recorder.onstop = () => finishRecording(recorder.mimeType || mimeType || 'audio/webm');
    recorder.onerror = () => {
      setPhase('error');
      setError('The recorder stopped unexpectedly. Please try again.');
    };
    recorderRef.current = recorder;
    try {
      // A timeslice means a crash or a force-quit still leaves usable audio.
      recorder.start(250);
    } catch {
      setPhase('error');
      setError('The recorder could not start. Please try again.');
      return;
    }
    startedAtRef.current = Date.now();
    setElapsedMs(0);
    setPhase('recording');
    timerRef.current = window.setInterval(() => {
      const elapsed = Date.now() - startedAtRef.current;
      setElapsedMs(elapsed);
      if (elapsed >= MAX_VOICE_MS) stopRecording();
    }, 100);
    startMeter();
  }, [finishRecording, startMeter, stopRecording]);

  const openMicrophone = useCallback(async () => {
    setPhase('starting');
    setError(null);
    if (!recorderSupported()) {
      setPhase('error');
      setError('Recording is not available in this browser. Update the app or the WebView and try again.');
      return;
    }
    try {
      // Asks Android for the runtime permission natively. That request covers
      // camera as well, which the calls feature already granted at launch, so
      // in practice no extra prompt appears — and it avoids adding a mic-only
      // path through the native bridge for no user-visible gain.
      await ensureMediaPermissions();
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });
      streamRef.current = stream;
      try {
        const Ctor: typeof AudioContext | undefined =
          window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
        if (Ctor) {
          const ctx = new Ctor();
          const analyser = ctx.createAnalyser();
          analyser.fftSize = 512;
          analyser.smoothingTimeConstant = 0.6;
          ctx.createMediaStreamSource(stream).connect(analyser);
          audioCtxRef.current = ctx;
          analyserRef.current = analyser;
          // iOS starts an AudioContext suspended until a gesture; recording IS
          // the gesture, so resume rather than show a frozen meter.
          if (ctx.state === 'suspended') void ctx.resume().catch(() => undefined);
        }
      } catch {
        // The meter is decoration. Recording works without it.
      }
      setPhase('ready');
    } catch (err) {
      const name = err instanceof Error ? err.name : '';
      setPhase('error');
      setError(
        name === 'NotAllowedError' || name === 'SecurityError'
          ? 'Microphone access is off. Allow it in Android settings → Apps → SkillSwap → Permissions, then try again.'
          : 'Could not open the microphone. Check that no call is using it, then try again.'
      );
    }
  }, []);

  // Opening the sheet acquires the microphone; closing or unmounting releases it.
  useEffect(() => {
    if (!open) return;
    void openMicrophone();
    return () => teardown();
  }, [open, openMicrophone, teardown]);

  if (!open) return null;

  const close = () => {
    teardown();
    setPhase('starting');
    onClose();
  };

  const reRecord = () => {
    if (clipRef.current) {
      URL.revokeObjectURL(clipRef.current.url);
      clipRef.current = null;
    }
    setClip(null);
    setElapsedMs(0);
    // The stream is still open, so the next take starts immediately.
    setPhase(streamRef.current ? 'ready' : 'starting');
    if (!streamRef.current) void openMicrophone();
  };

  const send = () => {
    const note = clipRef.current;
    if (!note) return;
    clipRef.current = null; // ChatTab owns the object URL from here.
    setClip(null);
    onRecorded(note);
    close();
  };

  const reachedCap = elapsedMs >= MAX_VOICE_MS - 1000;

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-[#0d0f14] text-white animate-fade-in">
      <div className="flex items-center justify-between px-3 pt-3 pb-2">
        <div className="flex items-center gap-2">
          <Mic className="w-4 h-4 text-[#fb4f1d]" />
          <span className="text-sm font-semibold">Voice note</span>
        </div>
        <button
          type="button"
          onClick={close}
          aria-label="Close the voice recorder"
          className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center active:scale-95"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      <div className="flex-1 flex flex-col items-center justify-center gap-6 px-6">
        {phase === 'starting' && (
          <div className="text-sm text-white/70">Opening the microphone…</div>
        )}

        {phase === 'error' && (
          <div className="max-w-sm text-center space-y-3">
            <AlertTriangle className="w-8 h-8 mx-auto text-[#ffb020]" />
            <p className="text-sm text-white/85">{error}</p>
            <button
              type="button"
              onClick={() => void openMicrophone()}
              className="rounded-full bg-white/10 px-5 py-2.5 text-sm font-semibold active:scale-95"
            >
              Try again
            </button>
          </div>
        )}

        {phase === 'ready' && (
          <>
            <p className="text-sm text-white/70 text-center">
              Tap to start recording. Notes stop themselves at {formatDuration(MAX_VOICE_MS)}.
            </p>
            <button
              type="button"
              onClick={beginRecording}
              aria-label="Start recording"
              className="w-20 h-20 rounded-full bg-[#fb4f1d] flex items-center justify-center active:scale-95 transition-transform shadow-lg"
            >
              <Mic className="w-8 h-8" />
            </button>
          </>
        )}

        {phase === 'recording' && (
          <>
            <div className="flex items-center gap-2">
              <span className="relative flex w-2.5 h-2.5">
                <span className="absolute inline-flex w-full h-full rounded-full bg-[#fb4f1d] opacity-70 animate-ping" />
                <span className="relative inline-flex w-2.5 h-2.5 rounded-full bg-[#fb4f1d]" />
              </span>
              <span className="text-3xl font-semibold tabular-nums">{formatDuration(elapsedMs)}</span>
            </div>

            <div className="flex items-end justify-center gap-[3px] h-20 w-full max-w-sm" aria-hidden="true">
              {levels.map((level, index) => (
                <span
                  key={index}
                  className="w-[3px] rounded-full bg-white/80"
                  style={{ height: `${Math.max(6, level * 100)}%` }}
                />
              ))}
            </div>

            <button
              type="button"
              onClick={stopRecording}
              aria-label="Stop recording"
              className="w-20 h-20 rounded-full bg-white text-[#0d0f14] flex items-center justify-center active:scale-95 transition-transform shadow-lg"
            >
              <Square className="w-7 h-7" fill="currentColor" />
            </button>
            <p className={`text-xs text-center ${reachedCap ? 'text-[#ffb020]' : 'text-white/60'}`}>
              {reachedCap ? 'Reached the five-minute limit — stopping now.' : 'Tap the square when you are done.'}
            </p>
          </>
        )}

        {phase === 'review' && clip && (
          <div className="w-full max-w-sm space-y-5">
            <p className="text-sm text-white/70 text-center">Listen back before you send it.</p>
            {/* currentColor inside AudioBubble resolves to white here, which is
                exactly the contrast this dark sheet needs. */}
            <div className="rounded-2xl bg-white/10 ring-1 ring-white/15">
              <AudioBubble src={clip.url} durationMs={clip.durationMs} bytes={clip.bytes} label="Preview" />
            </div>
            <div className="flex items-center justify-center gap-3">
              <button
                type="button"
                onClick={reRecord}
                className="flex items-center gap-2 rounded-full bg-white/10 px-5 py-3 text-sm font-semibold active:scale-95"
              >
                <RotateCcw className="w-4 h-4" />
                Re-record
              </button>
              <button
                type="button"
                onClick={send}
                className="flex items-center gap-2 rounded-full bg-[#00a884] px-6 py-3 text-sm font-semibold active:scale-95"
              >
                <Send className="w-4 h-4" />
                Send {formatBytes(clip.bytes)}
              </button>
            </div>
            <p className="text-center text-xs text-white/55">
              {formatDuration(clip.durationMs)} · {clip.contentType || 'audio'}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

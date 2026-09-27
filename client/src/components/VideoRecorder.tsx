/**
 * In-app video recorder (WhatsApp-style).
 *
 * Why the app records instead of handing off to the system camera: the quality
 * choice has to be ours. `<input capture>` returns whatever the OEM camera app
 * decided to shoot — often 4K at 40 MB — and gives no chance to say "Standard,
 * because this is going over mobile data". Recording through getUserMedia +
 * MediaRecorder lets us pin the resolution and the bitrate, cap the length at
 * 60s, and show the file size before anything is sent.
 *
 * Device reality is handled explicitly:
 *   - MP4/H.264 is preferred (plays everywhere) but WebM/VP8 is the fallback,
 *     because Android WebView support for `video/mp4` recording is patchy;
 *   - `ensureMediaPermissions()` asks Android for CAMERA + RECORD_AUDIO as a real
 *     runtime permission first — the WebView-only prompt fails outside a user
 *     gesture, which is the same trap the calls feature already hit;
 *   - if MediaRecorder is missing entirely, the UI says so and offers the gallery
 *     path rather than showing a dead button.
 */
import { useEffect, useRef, useState } from 'react';
import { AlertTriangle, Camera, RotateCw, Send, X } from 'lucide-react';
import { ensureMediaPermissions } from '../lib/media-permissions';
import { formatBytes, formatDuration, type VideoQuality } from '../lib/media-upload';

export interface RecordedClip {
  blob: Blob;
  /** Object URL for local preview. The caller owns it after `onRecorded`. */
  url: string;
  bytes: number;
  width: number;
  height: number;
  durationMs: number;
  quality: VideoQuality;
  contentType: string;
}

export const MAX_VIDEO_MS = 60_000;

interface Preset {
  label: string;
  note: string;
  width: number;
  height: number;
  videoBitsPerSecond: number;
  audioBitsPerSecond: number;
}

/**
 * Standard is the default on purpose: most clips are shot on mobile data, and
 * 900 kbps at 480p is ~6 MB for a full minute. HD doubles the sharpness for
 * roughly three times the bytes — which is why the toggle says so out loud.
 */
const PRESETS: Record<VideoQuality, Preset> = {
  standard: {
    label: 'Standard',
    note: 'Good quality · smaller file',
    width: 640,
    height: 480,
    videoBitsPerSecond: 900_000,
    audioBitsPerSecond: 64_000,
  },
  hd: {
    label: 'HD',
    note: 'Sharper · uses more data',
    width: 1280,
    height: 720,
    videoBitsPerSecond: 2_500_000,
    audioBitsPerSecond: 96_000,
  },
};

// MP4 first (universal playback), WebM as the reliable WebView fallback.
const MIME_CANDIDATES = [
  'video/mp4;codecs=avc1.42E01E,mp4a.40.2',
  'video/mp4;codecs=h264,aac',
  'video/mp4',
  'video/webm;codecs=vp9,opus',
  'video/webm;codecs=vp8,opus',
  'video/webm',
];

function pickMimeType(): string {
  if (typeof MediaRecorder === 'undefined' || typeof MediaRecorder.isTypeSupported !== 'function') return '';
  return MIME_CANDIDATES.find((candidate) => MediaRecorder.isTypeSupported(candidate)) || '';
}

function recorderSupported(): boolean {
  return (
    typeof MediaRecorder !== 'undefined' &&
    typeof navigator !== 'undefined' &&
    Boolean(navigator.mediaDevices?.getUserMedia)
  );
}

type Phase = 'starting' | 'ready' | 'recording' | 'review' | 'error';

export default function VideoRecorder({
  open,
  onClose,
  onRecorded,
  onFallbackToGallery,
  maxMs = MAX_VIDEO_MS,
}: {
  open: boolean;
  onClose: () => void;
  onRecorded: (clip: RecordedClip) => void;
  onFallbackToGallery?: () => void;
  maxMs?: number;
}) {
  const [phase, setPhase] = useState<Phase>('starting');
  const [error, setError] = useState<string | null>(null);
  const [quality, setQuality] = useState<VideoQuality>('standard');
  const [facing, setFacing] = useState<'environment' | 'user'>('environment');
  const [elapsed, setElapsed] = useState(0);
  const [clip, setClip] = useState<RecordedClip | null>(null);

  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const tickRef = useRef<number | null>(null);
  const startedAtRef = useRef(0);
  const handedOffRef = useRef(false);
  const clipRef = useRef<RecordedClip | null>(null);

  clipRef.current = clip;

  const stopTicker = () => {
    if (tickRef.current !== null) {
      clearInterval(tickRef.current);
      tickRef.current = null;
    }
  };

  const stopStream = () => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
  };

  // Camera (re)acquisition. Re-runs when the quality or the lens changes, since
  // both need a fresh getUserMedia — the toggle is hidden while recording.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;

    const start = async () => {
      setPhase('starting');
      setError(null);
      // A fresh session must not inherit the previous clip's hand-off flag, or
      // the teardown below would keep a URL alive that nobody will ever use.
      handedOffRef.current = false;

      if (!recorderSupported()) {
        setPhase('error');
        setError('This device cannot record video inside the app. You can still send a video from your gallery.');
        return;
      }

      try {
        await ensureMediaPermissions();
      } catch {
        // Not fatal: getUserMedia below still gets to ask.
      }

      const preset = PRESETS[quality];
      let stream: MediaStream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: true },
          video: {
            facingMode: { ideal: facing },
            width: { ideal: preset.width },
            height: { ideal: preset.height },
            frameRate: { ideal: 30, max: 30 },
          },
        });
      } catch (e) {
        if (cancelled) return;
        const name = e instanceof DOMException ? e.name : '';
        setPhase('error');
        setError(
          name === 'NotAllowedError'
            ? 'Camera and microphone access is off for SkillSwap. Allow both in Android settings, then try again.'
            : name === 'NotFoundError' || name === 'OverconstrainedError'
              ? 'No camera could be opened at that quality. Try switching to Standard.'
              : 'The camera could not be started. Close other camera apps and try again.'
        );
        return;
      }

      if (cancelled) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }
      streamRef.current = stream;
      const el = videoRef.current;
      if (el) {
        el.srcObject = stream;
        await el.play().catch(() => {});
      }
      setPhase('ready');
    };

    void start();
    return () => {
      cancelled = true;
      stopTicker();
      const recorder = recorderRef.current;
      if (recorder && recorder.state !== 'inactive') {
        try {
          recorder.stop();
        } catch {
          // already stopped
        }
      }
      recorderRef.current = null;
      stopStream();
      // Closing (or switching lens/quality) drops any clip still on the review
      // screen. One that was handed to the composer belongs to the caller now.
      if (!handedOffRef.current && clipRef.current) {
        URL.revokeObjectURL(clipRef.current.url);
        clipRef.current = null;
        setClip(null);
      }
      setElapsed(0);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, quality, facing]);

  // Teardown: never leave the camera light on, never leak an object URL we made.
  useEffect(() => {
    return () => {
      if (!handedOffRef.current && clipRef.current) URL.revokeObjectURL(clipRef.current.url);
    };
  }, []);

  const stopRecording = () => {
    stopTicker();
    const recorder = recorderRef.current;
    if (recorder && recorder.state !== 'inactive') {
      try {
        recorder.stop();
      } catch {
        // onstop will not fire; fall back below
        recorderRef.current = null;
        setPhase('ready');
      }
    }
    recorderRef.current = null;
  };

  const startRecording = () => {
    const stream = streamRef.current;
    if (!stream || phase !== 'ready') return;

    const preset = PRESETS[quality];
    const mime = pickMimeType();
    let recorder: MediaRecorder;
    try {
      recorder = new MediaRecorder(
        stream,
        mime
          ? { mimeType: mime, videoBitsPerSecond: preset.videoBitsPerSecond, audioBitsPerSecond: preset.audioBitsPerSecond }
          : { videoBitsPerSecond: preset.videoBitsPerSecond, audioBitsPerSecond: preset.audioBitsPerSecond }
      );
    } catch {
      setPhase('error');
      setError('Recording could not start on this device. You can still send a video from your gallery.');
      return;
    }

    chunksRef.current = [];
    recorder.ondataavailable = (event) => {
      if (event.data && event.data.size > 0) chunksRef.current.push(event.data);
    };
    recorder.onerror = () => {
      stopTicker();
      setPhase('error');
      setError('Recording stopped unexpectedly. Please try again.');
    };
    recorder.onstop = () => {
      const type = recorder.mimeType || mime || 'video/webm';
      const blob = new Blob(chunksRef.current, { type: type.split(';')[0] });
      const durationMs = Math.max(0, Math.min(maxMs, Date.now() - startedAtRef.current));
      const settings = stream.getVideoTracks()[0]?.getSettings?.() ?? {};
      if (blob.size <= 0) {
        setPhase('error');
        setError('That recording came out empty. Please try again.');
        return;
      }
      const url = URL.createObjectURL(blob);
      setClip({
        blob,
        url,
        bytes: blob.size,
        width: settings.width || preset.width,
        height: settings.height || preset.height,
        durationMs,
        quality,
        contentType: type.split(';')[0],
      });
      // Freeze the live preview while the clip is being reviewed.
      videoRef.current?.pause();
      setPhase('review');
    };

    // A 250 ms timeslice means an interrupted recording still has its data.
    recorder.start(250);
    recorderRef.current = recorder;
    startedAtRef.current = Date.now();
    setElapsed(0);
    setPhase('recording');

    tickRef.current = window.setInterval(() => {
      const ms = Date.now() - startedAtRef.current;
      setElapsed(ms);
      if (ms >= maxMs) stopRecording(); // hard stop: the 60-second cap
    }, 200);
  };

  const retake = () => {
    if (clip) URL.revokeObjectURL(clip.url);
    setClip(null);
    setElapsed(0);
    setPhase('ready');
    void videoRef.current?.play().catch(() => {});
  };

  const useClip = () => {
    if (!clip) return;
    handedOffRef.current = true; // the caller owns the object URL from here
    onRecorded(clip);
  };

  const close = () => {
    stopTicker();
    if (clip) URL.revokeObjectURL(clip.url);
    setClip(null);
    handedOffRef.current = false;
    onClose();
  };

  if (!open) return null;

  const preset = PRESETS[quality];
  const progress = Math.min(100, (elapsed / maxMs) * 100);
  const remaining = Math.max(0, Math.ceil((maxMs - elapsed) / 1000));

  return (
    <div className="fixed inset-0 z-50 bg-black flex flex-col animate-fade-in">
      {/* Top bar: close, then the quality choice (hidden while recording) */}
      <div className="flex items-center justify-between gap-2 px-3 pt-3 pb-2 bg-gradient-to-b from-black/85 to-transparent">
        <button
          type="button"
          onClick={close}
          className="w-10 h-10 rounded-full bg-white/10 text-white flex items-center justify-center active:scale-95 shrink-0"
          title="Close"
        >
          <X className="w-5 h-5" />
        </button>

        {phase === 'recording' ? (
          <div className="flex items-center gap-2 rounded-full bg-[#c1121f]/90 px-3 py-1.5">
            <span className="w-2 h-2 rounded-full bg-white animate-pulse" />
            <span className="text-white text-sm font-semibold tabular-nums">{formatDuration(elapsed)}</span>
          </div>
        ) : (
          <div className="flex items-center gap-1 rounded-full bg-white/10 p-1">
            {(['standard', 'hd'] as VideoQuality[]).map((option) => (
              <button
                key={option}
                type="button"
                disabled={phase !== 'ready'}
                onClick={() => setQuality(option)}
                className={`px-3 py-1.5 rounded-full text-xs font-semibold transition-colors disabled:opacity-50 ${
                  quality === option ? 'bg-white text-black' : 'text-white/80'
                }`}
              >
                {PRESETS[option].label}
              </button>
            ))}
          </div>
        )}

        <button
          type="button"
          onClick={() => setFacing((f) => (f === 'environment' ? 'user' : 'environment'))}
          disabled={phase === 'recording' || phase === 'review'}
          className="w-10 h-10 rounded-full bg-white/10 text-white flex items-center justify-center active:scale-95 shrink-0 disabled:opacity-40"
          title="Flip camera"
        >
          <RotateCw className="w-5 h-5" />
        </button>
      </div>

      {/* Preview / review */}
      <div className="flex-1 min-h-0 relative flex items-center justify-center">
        <video
          ref={videoRef}
          autoPlay
          muted
          playsInline
          className={`w-full h-full ${phase === 'review' ? 'object-contain' : 'object-cover'}`}
        />
        {clip && phase === 'review' && (
          <video
            src={clip.url}
            controls
            autoPlay
            loop
            playsInline
            className="absolute inset-0 w-full h-full object-contain bg-black"
          />
        )}

        {phase === 'starting' && (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="text-white/80 text-sm flex items-center gap-2">
              <Camera className="w-4 h-4" /> Starting camera…
            </div>
          </div>
        )}

        {phase === 'error' && (
          <div className="absolute inset-0 flex items-center justify-center px-6">
            <div className="rounded-2xl bg-[#1f2430] p-5 max-w-sm text-center">
              <AlertTriangle className="w-7 h-7 text-[#ffb703] mx-auto mb-2" />
              <div className="text-white text-sm leading-relaxed">{error}</div>
              {onFallbackToGallery && (
                <button
                  type="button"
                  onClick={() => {
                    close();
                    onFallbackToGallery();
                  }}
                  className="mt-4 rounded-full bg-white text-black text-sm font-semibold px-4 py-2 active:scale-95"
                >
                  Choose a video instead
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Bottom: quality note, then the shutter */}
      <div className="px-3 pt-2 pb-[max(1.25rem,env(safe-area-inset-bottom))] bg-gradient-to-t from-black/85 to-transparent">
        {phase === 'review' && clip ? (
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={retake}
              className="flex-1 rounded-full bg-white/10 text-white text-sm font-semibold px-4 py-3 active:scale-95"
            >
              Retake
            </button>
            <div className="text-center text-white/85 text-[11px] leading-tight shrink-0 w-28">
              <div className="font-semibold text-white">{formatDuration(clip.durationMs)}</div>
              <div>{formatBytes(clip.bytes)}</div>
              <div>{clip.height >= 700 ? 'HD' : 'Standard'} · {clip.width}×{clip.height}</div>
            </div>
            <button
              type="button"
              onClick={useClip}
              className="flex-1 flex items-center justify-center gap-2 rounded-full bg-[#00a884] text-white text-sm font-semibold px-4 py-3 active:scale-95"
            >
              <Send className="w-4 h-4" /> Use video
            </button>
          </div>
        ) : (
          <>
            {phase === 'recording' && (
              <div className="mb-2 h-1 rounded-full bg-white/15 overflow-hidden">
                <div className="h-full bg-[#c1121f] transition-[width] duration-200" style={{ width: `${progress}%` }} />
              </div>
            )}
            <div className="flex items-center justify-center gap-4">
              <div className="text-center text-white/75 text-[11px] leading-tight w-28 shrink-0">
                {phase === 'recording' ? (
                  <>
                    <div className="text-white font-semibold">{remaining}s left</div>
                    <div>stops at 1 minute</div>
                  </>
                ) : (
                  <>
                    <div className="text-white font-semibold">{preset.label}</div>
                    <div>{preset.note}</div>
                  </>
                )}
              </div>

              <button
                type="button"
                onClick={() => (phase === 'recording' ? stopRecording() : startRecording())}
                disabled={phase !== 'ready' && phase !== 'recording'}
                className="w-[74px] h-[74px] rounded-full bg-white/15 flex items-center justify-center active:scale-95 disabled:opacity-40 shrink-0"
                title={phase === 'recording' ? 'Stop recording' : 'Record video'}
              >
                {phase === 'recording' ? (
                  <span className="w-7 h-7 rounded-md bg-[#c1121f]" />
                ) : (
                  <span className="w-[58px] h-[58px] rounded-full bg-white border-4 border-black/20" />
                )}
              </button>

              <div className="w-28 shrink-0 text-center text-white/60 text-[11px] leading-tight">
                {quality === 'hd' ? 'HD looks sharper but uses more mobile data' : 'Best size for mobile data'}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

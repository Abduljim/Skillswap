/**
 * Voice-note playback inside a chat bubble.
 *
 * Two rules shaped this component:
 *
 *   - Nothing downloads until Play is pressed (`preload="none"`). A chat with
 *     twenty voice notes still has to open instantly on mobile data — the same
 *     reason video bubbles carry a poster frame instead of a decoded clip.
 *   - Every painted colour comes from `currentColor`, i.e. the bubble's own
 *     text colour. That keeps the player legible on all four bubble styles
 *     (mine/theirs × light/dark) without duplicating ChatTab's theme table, and
 *     Tailwind cannot generate arbitrary values built at runtime anyway.
 *
 * Playback rate is exposed because a five-minute note at 2× is the difference
 * between listening and skimming, which is how students actually use these.
 */
import { useEffect, useRef, useState } from 'react';
import { AlertTriangle, Pause, Play } from 'lucide-react';
import { formatBytes, formatDuration } from '../lib/media-upload';

const SPEEDS = [1, 1.5, 2];

export default function AudioBubble({
  src,
  durationMs,
  bytes,
  label = 'Voice note',
}: {
  src: string;
  /** What the sender measured while recording; the file's own metadata wins if
   *  it disagrees, because containers sometimes report 0 until loaded. */
  durationMs?: number | null;
  bytes?: number | null;
  label?: string;
}) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState(false);
  const [position, setPosition] = useState(0);
  const [seconds, setSeconds] = useState(durationMs && durationMs > 0 ? durationMs / 1000 : 0);
  const [speedIndex, setSpeedIndex] = useState(0);
  const [failed, setFailed] = useState(false);

  // Leaving the chat mid-note must not keep audio playing behind the next screen.
  useEffect(
    () => () => {
      const audio = audioRef.current;
      if (!audio) return;
      audio.pause();
      audio.removeAttribute('src');
      audio.load();
    },
    []
  );

  const toggle = () => {
    const audio = audioRef.current;
    if (!audio) return;
    if (failed) setFailed(false);
    if (audio.paused) {
      // With preload="none" this single call both fetches and starts. Android
      // WebView rejects play() only outside a user gesture, and this is inside one.
      const started = audio.play();
      if (started && typeof started.catch === 'function') started.catch(() => setFailed(true));
    } else {
      audio.pause();
    }
  };

  const seek = (event: React.MouseEvent<HTMLDivElement>) => {
    const audio = audioRef.current;
    if (!audio || !audio.duration || !Number.isFinite(audio.duration)) return;
    const rect = event.currentTarget.getBoundingClientRect();
    if (rect.width <= 0) return;
    const ratio = Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width));
    audio.currentTime = ratio * audio.duration;
    setPosition(ratio);
  };

  const cycleSpeed = () => {
    const next = (speedIndex + 1) % SPEEDS.length;
    setSpeedIndex(next);
    const audio = audioRef.current;
    if (audio) audio.playbackRate = SPEEDS[next];
  };

  const elapsedMs = Math.round(position * (seconds || 0) * 1000);

  return (
    <div className="flex items-center gap-2.5 px-2 py-1.5 min-w-0">
      <audio
        ref={audioRef}
        src={src}
        preload="none"
        className="hidden"
        onPlay={() => setPlaying(true)}
        onPlaying={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => {
          setPlaying(false);
          setPosition(0);
        }}
        onLoadedMetadata={() => {
          const audio = audioRef.current;
          if (audio && Number.isFinite(audio.duration) && audio.duration > 0) {
            setSeconds(audio.duration);
            audio.playbackRate = SPEEDS[speedIndex];
          }
        }}
        onTimeUpdate={() => {
          const audio = audioRef.current;
          if (!audio) return;
          const total = Number.isFinite(audio.duration) && audio.duration > 0 ? audio.duration : seconds;
          setPosition(total > 0 ? Math.min(1, audio.currentTime / total) : 0);
        }}
        onError={() => {
          setPlaying(false);
          setFailed(true);
        }}
      />

      <button
        type="button"
        onClick={toggle}
        aria-label={playing ? 'Pause voice note' : 'Play voice note'}
        className="w-9 h-9 shrink-0 rounded-full border-2 flex items-center justify-center active:scale-95 transition-transform"
        style={{ borderColor: 'currentColor' }}
      >
        {playing ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4 translate-x-[1px]" />}
      </button>

      <div className="flex-1 min-w-0">
        <div className="flex items-baseline justify-between gap-2 text-[10px] font-semibold">
          <span className="truncate opacity-80">
            {label}
            {bytes ? ` · ${formatBytes(bytes)}` : ''}
          </span>
          <span className="tabular-nums shrink-0 opacity-80">
            {formatDuration(elapsedMs)} / {seconds > 0 ? formatDuration(Math.round(seconds * 1000)) : '--:--'}
          </span>
        </div>
        <div
          role="slider"
          tabIndex={0}
          aria-label="Seek voice note"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(position * 100)}
          onClick={seek}
          className="mt-1.5 h-1.5 rounded-full cursor-pointer"
          style={{ backgroundColor: 'rgba(128,128,128,0.35)' }}
        >
          <div
            className="h-full rounded-full"
            style={{ width: `${Math.max(0, Math.min(100, position * 100))}%`, backgroundColor: 'currentColor' }}
          />
        </div>
        {failed && (
          <div className="mt-1 flex items-center gap-1 text-[10px]">
            <AlertTriangle className="w-3 h-3 shrink-0" />
            <span>Could not play that. Tap again to retry.</span>
          </div>
        )}
      </div>

      <button
        type="button"
        onClick={cycleSpeed}
        aria-label={`Playback speed ${SPEEDS[speedIndex]} times`}
        className="shrink-0 text-[10px] font-bold rounded-full px-1.5 py-0.5 border active:scale-95"
        style={{ borderColor: 'currentColor' }}
      >
        {SPEEDS[speedIndex]}×
      </button>
    </div>
  );
}

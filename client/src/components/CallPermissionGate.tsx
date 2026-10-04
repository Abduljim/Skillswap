import { useCallback, useEffect, useState } from 'react';
import { BellRing, Mic, Video, Wrench, X } from 'lucide-react';
import { Capacitor } from '@capacitor/core';
import {
  getCallPermissionState,
  openCallSettings,
  requestCallMediaPermissions,
  requestCallNotificationPermission,
  type CallPermissions,
} from '../lib/call-notifier';
import { ensureMediaPermissions } from '../lib/media-permissions';
import { subscribeCallPermission } from '../lib/permission-gate';
import { useCalls } from '../contexts/CallsContext';

/**
 * The honest check: can this WebView actually open a microphone right now?
 * Android's permission state and the WebView's ability to capture are two
 * different facts, and calls only care about the second.
 */
async function probeMicrophone(): Promise<boolean> {
  try {
    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) return false;
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    stream.getTracks().forEach((track) => track.stop());
    return true;
  } catch {
    return false;
  }
}

/** One primer per install. The banner keeps going until the microphone works. */
const PRIMER_KEY = 'skillswap_call_primer_v1';

/**
 * Asks for the call permissions before a call needs them, and keeps offering a
 * one-tap way back after somebody says no.
 *
 * The app used to fire three OS dialogs cold on first open with no explanation
 * and nothing afterwards. A denied microphone then breaks every call the user
 * ever answers, and the only symptom was a red sheet mid-call — which reads as a
 * broken app rather than a setting two taps away. Explaining first raises grant
 * rates; the banner covers the "don't ask again" case Android otherwise makes
 * permanent.
 */
export default function CallPermissionGate() {
  const isAndroid = Capacitor.getPlatform() === 'android';
  const { status, groupStatus } = useCalls();
  const [perms, setPerms] = useState<CallPermissions | null>(null);
  const [showPrimer, setShowPrimer] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [asking, setAsking] = useState(false);
  /** A named cause from a failed call (busy mic, missing hardware) — shown
   *  instead of the permission wording when the permission is not the problem. */
  const [noticeMessage, setNoticeMessage] = useState<string | null>(null);

  const refresh = useCallback(async (): Promise<CallPermissions | null> => {
    if (!isAndroid) return null;
    const next = await getCallPermissionState();
    setPerms(next);
    return next;
  }, [isAndroid]);

  useEffect(() => {
    // Browsers prompt at getUserMedia time; the audio prewarm still applies.
    if (!isAndroid) {
      void ensureMediaPermissions();
      return;
    }
    let alive = true;
    void (async () => {
      const next = await refresh();
      if (!alive || !next) return;
      // Everything a call needs, asked for the moment the app opens: Android
      // shows each OS dialog once and then remembers. Waiting until the first
      // call to ask is how a surprised "no" becomes a broken-looking call.
      if (next.microphone !== 'granted' || next.camera !== 'granted' || next.notifications !== 'granted') {
        try {
          await requestCallMediaPermissions();
          await requestCallNotificationPermission();
        } catch {
          // Native bridge absent (plain web build) — the probe below applies.
        }
        const after = await refresh();
        if (!alive) return;
        if (after && after.microphone === 'granted') {
          setShowPrimer(false);
          return;
        }
        // Android says denied, but the WebView is what a call actually uses.
        // If a live probe opens the microphone, calls work and a banner
        // claiming otherwise would be a lie.
        if (await probeMicrophone()) {
          setPerms({ ...(after ?? next), microphone: 'granted' });
          setShowPrimer(false);
          return;
        }
      }
      if (next.microphone === 'granted') return;
      let seen = false;
      try {
        seen = localStorage.getItem(PRIMER_KEY) === '1';
      } catch {
        // Storage blocked — show the primer again rather than never.
      }
      if (!seen) setShowPrimer(true);
    })();

    // Coming back from Android's settings is the moment to re-check, so the
    // banner clears itself the instant the microphone is allowed.
    const recheck = () => {
      if (document.visibilityState !== 'visible') return;
      void refresh().then((next) => {
        if (next?.microphone === 'granted') {
          setShowPrimer(false);
          setDismissed(false);
        }
      });
    };
    document.addEventListener('visibilitychange', recheck);
    window.addEventListener('focus', recheck);
    return () => {
      alive = false;
      document.removeEventListener('visibilitychange', recheck);
      window.removeEventListener('focus', recheck);
    };
  }, [isAndroid, refresh]);

  // A call just failed for want of a permission: bring the fix back on screen,
  // even if it was dismissed earlier in this session.
  useEffect(
    () =>
      subscribeCallPermission((notice) => {
        setDismissed(false);
        setNoticeMessage(notice.message ?? null);
        void refresh();
      }),
    [refresh]
  );

  const markSeen = () => {
    try {
      localStorage.setItem(PRIMER_KEY, '1');
    } catch {
      // Ignored — the primer simply shows again next launch.
    }
  };

  const ask = useCallback(async () => {
    setAsking(true);
    markSeen();
    await requestCallNotificationPermission();
    await requestCallMediaPermissions();
    await refresh();
    setAsking(false);
    setShowPrimer(false);
  }, [refresh]);

  const later = useCallback(() => {
    markSeen();
    setShowPrimer(false);
  }, []);

  // Never sit on top of a call — a ringing sheet is the more urgent thing.
  const callActive = status !== 'none' || groupStatus !== 'none';
  if (!isAndroid || callActive) return null;

  const micMissing = perms?.microphone !== 'granted';
  const notificationsMissing = perms?.notifications !== 'granted';
  const showBanner = !showPrimer && !dismissed && !!perms && (micMissing || notificationsMissing);

  return (
    <>
      {showPrimer && (
        <div className="fixed inset-0 z-40 flex items-end justify-center bg-ink-900/60 p-4 sm:items-center">
          <div className="w-full max-w-sm rounded-3xl bg-cream-50 p-6 shadow-2xl">
            <h2 className="font-display text-xl font-bold text-ink-900">Before your first call</h2>
            <p className="mt-1 text-sm text-ink-600">
              Android will ask for these next. Calls need the first one; the other two make them
              behave like real calls.
            </p>
            <ul className="mt-4 space-y-3 text-sm text-ink-700">
              <li className="flex gap-3">
                <Mic className="mt-0.5 h-5 w-5 shrink-0 text-coral-500" />
                <span>
                  <strong className="text-ink-900">Microphone</strong> — without it a call you answer
                  cannot carry your voice, and the caller just hears ringing.
                </span>
              </li>
              <li className="flex gap-3">
                <Video className="mt-0.5 h-5 w-5 shrink-0 text-coral-500" />
                <span>
                  <strong className="text-ink-900">Camera</strong> — video calls only. Voice calls
                  never touch it.
                </span>
              </li>
              <li className="flex gap-3">
                <BellRing className="mt-0.5 h-5 w-5 shrink-0 text-coral-500" />
                <span>
                  <strong className="text-ink-900">Notifications</strong> — so a call rings when the
                  app is closed or the screen is locked.
                </span>
              </li>
            </ul>
            <div className="mt-6 flex flex-col gap-2">
              <button
                onClick={() => void ask()}
                disabled={asking}
                className="btn-coral w-full justify-center disabled:opacity-60"
              >
                {asking ? 'Asking Android…' : 'Allow'}
              </button>
              <button onClick={later} className="btn-ghost w-full justify-center text-ink-600">
                Not now
              </button>
            </div>
            <p className="mt-3 text-[11px] leading-snug text-ink-500">
              Tap “Allow”, then allow each one Android asks for. If you decline, we leave a banner
              with a one-tap way to turn it back on.
            </p>
          </div>
        </div>
      )}

      {showBanner && (
        <div className="fixed bottom-20 left-3 right-3 z-40 mx-auto flex max-w-md items-center gap-3 rounded-2xl bg-ink-900 px-4 py-3 text-cream-50 shadow-xl md:bottom-6">
          <Wrench className="h-5 w-5 shrink-0 text-coral-500" />
          <p className="flex-1 text-xs leading-snug">
            {micMissing
              ? noticeMessage ?? 'Calls cannot work until SkillSwap can use your microphone.'
              : 'Calls will not ring when the app is closed until notifications are allowed.'}
          </p>
          <button
            onClick={() => void openCallSettings()}
            className="shrink-0 rounded-full bg-coral-500 px-3 py-1.5 text-xs font-semibold text-white active:scale-95"
          >
            Fix it
          </button>
          <button
            onClick={() => setDismissed(true)}
            aria-label="Dismiss"
            className="shrink-0 text-cream-50/60"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}
    </>
  );
}

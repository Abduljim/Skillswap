import { Capacitor } from '@capacitor/core';
import { requestCallMediaPermissions } from './call-notifier';

// One-shot web prewarm; on Android the native grant above is what makes
// getUserMedia work, so nothing more is needed there.
let probed = false;

/**
 * Ask Android for camera + microphone access as a real runtime permission.
 * The WebView-only getUserMedia prompt fails outside a user gesture (and the
 * old approach often surfaced as "cant call, microphone/camera not enabled"
 * even when the OS toggles looked on). Calling this natively up front — at app
 * launch and again right before a call — guarantees getUserMedia succeeds.
 */
export async function ensureMediaPermissions(): Promise<void> {
  const android = Capacitor.getPlatform() === 'android';
  try {
    if (android) {
      await requestCallMediaPermissions();
      return;
    }
  } catch {
    // Non-native build — fall through to the web prewarm.
  }
  if (probed || typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) return;
  probed = true;
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: true });
    stream.getTracks().forEach((t) => t.stop());
  } catch {
    // Ignored — denied or unsupported. Call-time prompts still apply.
  }
}
import { Capacitor, registerPlugin } from '@capacitor/core';

interface CallNotifierPlugin {
  requestPermission(): Promise<void>;
  ring(opts: { displayName: string }): Promise<void>;
  stop(): Promise<void>;
}

const CallNotifier = registerPlugin<CallNotifierPlugin>('CallNotifier');

export async function requestCallNotificationPermission(): Promise<void> {
  try {
    if (Capacitor.getPlatform() === 'android') await CallNotifier.requestPermission();
  } catch {
    // Web Preview / non-native builds have no native plugin.
  }
}

export async function ringIncomingCall(peer: { displayName: string }): Promise<void> {
  try {
    if (Capacitor.getPlatform() === 'android') await CallNotifier.ring(peer);
  } catch {
    // Fall back to the in-app Web Audio ringtone.
  }
}

export async function stopIncomingCallRing(): Promise<void> {
  try {
    if (Capacitor.getPlatform() === 'android') await CallNotifier.stop();
  } catch {
    // Ignored
  }
}
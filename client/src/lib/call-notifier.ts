import { Capacitor, registerPlugin } from '@capacitor/core';

export type CallSoundSource = 'ringtone' | 'alarm' | 'silent';

interface CallNotifierPlugin {
  requestPermission(): Promise<void>;
  requestMediaPermissions(): Promise<void>;
  setSoundSource(opts: { source: CallSoundSource }): Promise<void>;
  ring(opts: { displayName: string; soundSource?: CallSoundSource }): Promise<void>;
  stop(): Promise<void>;
}

const CallNotifier = registerPlugin<CallNotifierPlugin>('CallNotifier');

export function getCallSoundSource(): CallSoundSource {
  try {
    const saved = localStorage.getItem('skillswap_call_sound');
    if (saved === 'alarm' || saved === 'silent' || saved === 'ringtone') return saved;
  } catch {
    // Ignored
  }
  return 'ringtone';
}

export function setCallSoundSource(source: CallSoundSource): void {
  try {
    localStorage.setItem('skillswap_call_sound', source);
    if (Capacitor.getPlatform() === 'android') void CallNotifier.setSoundSource({ source });
  } catch {
    // Ignored
  }
}

export async function requestCallNotificationPermission(): Promise<void> {
  try {
    if (Capacitor.getPlatform() === 'android') await CallNotifier.requestPermission();
  } catch {
    // Web Preview / non-native builds have no native plugin.
  }
}

// Grants CAMERA + RECORD_AUDIO via the native bridge first, so the WebView
// getUserMedia calls never fail with a "microphone/camera not enabled" error.
export async function requestCallMediaPermissions(): Promise<void> {
  try {
    if (Capacitor.getPlatform() === 'android') await CallNotifier.requestMediaPermissions();
  } catch {
    // Non-native build — getUserMedia handles prompting.
  }
}

export async function ringIncomingCall(peer: { displayName: string }, sound: CallSoundSource = 'ringtone'): Promise<void> {
  try {
    if (Capacitor.getPlatform() === 'android') await CallNotifier.ring({ ...peer, soundSource: sound });
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
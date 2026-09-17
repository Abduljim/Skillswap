import { Capacitor, registerPlugin } from '@capacitor/core';

export type CallSoundSource = 'chime' | 'ringtone' | 'alarm' | 'silent';

interface CallNotifierPlugin {
  requestPermission(): Promise<void>;
  requestMediaPermissions(): Promise<void>;
  setSoundSource(opts: { source: CallSoundSource }): Promise<void>;
  setCallUiActive(opts: { active: boolean }): Promise<void>;
  ring(opts: { displayName: string; soundSource?: CallSoundSource }): Promise<void>;
  stop(): Promise<void>;
  openSettings(): Promise<void>;
}

const CallNotifier = registerPlugin<CallNotifierPlugin>('CallNotifier');

export function getCallSoundSource(): CallSoundSource {
  try {
    const saved = localStorage.getItem('skillswap_call_sound');
    if (saved === 'chime' || saved === 'alarm' || saved === 'silent' || saved === 'ringtone') return saved;
  } catch {
    // Ignored
  }
  return 'chime';
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

// Grants POST_NOTIFICATIONS, CAMERA + RECORD_AUDIO via the native bridge first,
// so the WebView getUserMedia calls never fail with a "microphone/camera not
// enabled" error. Also prompts (once) to allow full-screen call intents on
// Android 12+ so an incoming call takes over the screen like a real call.
export async function requestCallMediaPermissions(): Promise<void> {
  try {
    if (Capacitor.getPlatform() === 'android') await CallNotifier.requestMediaPermissions();
  } catch {
    // Non-native build — getUserMedia handles prompting.
  }
}

// Hides the Android system bars and keeps the screen on while a call rings or
// is active (a "simulated call alarm"). Restore with false when the call ends.
export async function setCallUiActive(active: boolean): Promise<void> {
  try {
    if (Capacitor.getPlatform() === 'android') await CallNotifier.setCallUiActive({ active });
  } catch {
    // Web Preview / non-native builds have no native plugin.
  }
}

export async function ringIncomingCall(peer: { displayName: string }, sound: CallSoundSource = 'chime'): Promise<void> {
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

// Opens this app's Android Settings so a user who denied mic/camera/notification
// can re-grant the permission a call needs.
export async function openCallSettings(): Promise<void> {
  try {
    if (Capacitor.getPlatform() === 'android') await CallNotifier.openSettings();
  } catch {
    // Web Preview / non-native builds have no native plugin.
  }
}
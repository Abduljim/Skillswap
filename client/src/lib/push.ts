import { Capacitor, registerPlugin } from '@capacitor/core';
import { api } from './api';

interface PushPlugin {
  getToken(): Promise<{ token: string }>;
  getLaunchedCall(): Promise<{ exchangeId: string; callerName: string; video: boolean } | null>;
  clearLaunchedCall(): Promise<void>;
}

const Push = registerPlugin<PushPlugin>('Push');

let registered = false;

/**
 * Register this device with Firebase Cloud Messaging and hand the token to the
 * server so incoming calls can ring even when the app is closed. Called after
 * login; re-registers only if it fails (the server re-points the token to
 * whoever signs in on this device).
 */
export async function registerPushToken(): Promise<void> {
  try {
    if (Capacitor.getPlatform() !== 'android') return;
    const { token } = await Push.getToken();
    if (!token) return;
    if (registered) return;
    registered = true;
    await api.post('/notifications/push-token', { token, platform: 'android' });
  } catch {
    registered = false;
  }
}

/**
 * If the app was opened from an incoming-call notification, return the call so
 * we can drop the user straight into that conversation.
 */
export async function getLaunchedCall(): Promise<{ exchangeId: string; callerName: string; video: boolean } | null> {
  try {
    if (Capacitor.getPlatform() !== 'android') return null;
    return await Push.getLaunchedCall();
  } catch {
    return null;
  }
}

export async function clearLaunchedCall(): Promise<void> {
  try {
    if (Capacitor.getPlatform() === 'android') await Push.clearLaunchedCall();
  } catch {
    // Ignored
  }
}
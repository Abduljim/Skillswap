import { Capacitor, registerPlugin } from '@capacitor/core';
import { api } from './api';

/** What a call notification stored natively before opening the app. */
export interface LaunchedCall {
  exchangeId: string;
  callerName: string;
  callerId: string;
  video: boolean;
  /** 'direct' (1:1) or 'group'. A group invite has no exchange to open. */
  kind?: 'direct' | 'group';
  groupId?: string;
  memberCount?: number;
}

interface PushPlugin {
  getToken(): Promise<{ token: string }>;
  getLaunchedCall(): Promise<LaunchedCall | null>;
  clearLaunchedCall(): Promise<void>;
  getLaunchAction(): Promise<{ action: string }>;
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
export async function getLaunchedCall(): Promise<LaunchedCall | null> {
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

/**
 * The Answer / Decline button pressed on an incoming-call notification that was
 * posted while the app was closed. Consumed on read, so one tap answers one
 * call. Empty on web, where there is no such notification.
 */
export async function getLaunchAction(): Promise<'answer' | 'decline' | ''> {
  try {
    if (Capacitor.getPlatform() !== 'android') return '';
    const res = await Push.getLaunchAction();
    return res?.action === 'answer' || res?.action === 'decline' ? res.action : '';
  } catch {
    return '';
  }
}
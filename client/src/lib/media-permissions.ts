let requestedOnce = false;

async function queryPermission(name: PermissionName): Promise<PermissionState | null> {
  try {
    if (!navigator.permissions?.query) return null;
    const res = await navigator.permissions.query({ name });
    return res.state;
  } catch {
    return null;
  }
}

/**
 * Ask Android/Chrome for camera + microphone access once per session so every
 * user (not just admins or the first caller) sees the OS permission dialog up
 * front. Rights to the stream are released immediately after the prompt.
 */
export async function ensureMediaPermissions(): Promise<void> {
  if (requestedOnce || typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) return;
  requestedOnce = true;
  try {
    const [cam, mic] = await Promise.all([queryPermission('camera' as PermissionName), queryPermission('microphone' as PermissionName)]);
    if ((cam === 'granted' && mic === 'granted') || cam === 'denied' || mic === 'denied') return;
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: true });
    stream.getTracks().forEach((t) => t.stop());
  } catch {
    // Ignored — denied or unsupported. Turn-by-turn prompts still happen at call time.
  }
}
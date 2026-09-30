type Missing = 'microphone' | 'camera' | 'notifications';
type Listener = (missing: Missing) => void;

const listeners = new Set<Listener>();

/**
 * Called when a call fails because a permission is missing, so the gate can put
 * the fix on screen instead of leaving the user with only an error message.
 */
export function notifyCallPermissionNeeded(missing: Missing = 'microphone'): void {
  for (const listener of listeners) listener(missing);
}

export function subscribeCallPermission(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

type Missing = 'microphone' | 'camera' | 'notifications';

export interface PermissionNotice {
  missing: Missing;
  /** When the failure is NOT a denied permission (busy mic, missing hardware),
   *  the caller names it — "denied" on a phone whose settings show "allowed"
   *  reads as a broken app. */
  message?: string;
}
type Listener = (notice: PermissionNotice) => void;

const listeners = new Set<Listener>();

/**
 * Called when a call fails for want of a permission or a working microphone, so
 * the gate can put the right fix on screen instead of leaving the user with
 * only an error message.
 */
export function notifyCallPermissionNeeded(missing: Missing = 'microphone', message?: string): void {
  for (const listener of listeners) listener({ missing, message });
}

export function subscribeCallPermission(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

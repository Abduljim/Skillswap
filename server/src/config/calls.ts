/**
 * Call limits, shared by the socket layer (which enforces them) and
 * GET /api/calls/limits (which tells the client what they are). One definition,
 * so the UI picker and the server can never disagree about the cap.
 */
import { env } from './env';

/**
 * Group calls run as a WebRTC mesh: every participant opens a peer connection to
 * every other one, so n people means n*(n-1) streams in total and each phone
 * uploads n-1 copies of its own audio/video. On mobile data that is the binding
 * constraint long before the server is — a 6-person mesh on a 4G phone drops
 * frames and burns through a data plan.
 *
 * Capped at 4 by default. Raise it with MAX_GROUP_CALL_PARTICIPANTS if you move
 * to an SFU, which is the design that actually scales group video (each phone
 * sends one stream to a server that fans it out) rather than a bigger mesh.
 */
export const MAX_GROUP_CALL_PARTICIPANTS = Math.max(
  2,
  Number.isFinite(env.MAX_GROUP_CALL_PARTICIPANTS) ? env.MAX_GROUP_CALL_PARTICIPANTS : 4
);

/**
 * Group calls start audio-only. Video stays available per participant — the
 * camera button in a group call acquires a video track and renegotiates with
 * every peer — but nobody pays for n-1 video streams they did not ask for.
 *
 * A 5-minute audio call relays roughly 2 MB; the same call on video is 50-150 MB
 * per participant, which on a metered TURN relay or a capped mobile plan is the
 * difference between "free" and "expensive".
 */
export const GROUP_CALLS_AUDIO_FIRST = true;

/**
 * How long a 1:1 call may ring before the server ends it as unanswered.
 *
 * Without a limit the caller sits on "Ringing…" forever, and a callee whose app
 * is closed keeps an insistent call notification ringing until they notice it.
 * Ending the call also pushes `call_cancelled` to that phone so it goes quiet.
 *
 * Read at call time rather than at import so it can be tuned per environment
 * (CALL_RING_TIMEOUT_MS) and shortened inside a single test.
 */
export function callRingTimeoutMs(): number {
  const override = Number(process.env.CALL_RING_TIMEOUT_MS);
  if (Number.isFinite(override) && override > 0) return override;
  return Number.isFinite(env.CALL_RING_TIMEOUT_MS) && env.CALL_RING_TIMEOUT_MS > 0
    ? env.CALL_RING_TIMEOUT_MS
    : 45_000;
}

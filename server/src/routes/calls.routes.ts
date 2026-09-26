import { Router } from 'express';
import { asyncHandler } from '../utils/asyncHandler';
import { requireAuth } from '../middleware/auth';
import { buildIceConfig } from '../services/turn.service';
import { MAX_GROUP_CALL_PARTICIPANTS, GROUP_CALLS_AUDIO_FIRST } from '../config/calls';
import { ok } from '../utils/responses';

const router = Router();

/**
 * ICE servers for one call, minted per request.
 *
 * Authenticated on purpose: an anonymous caller would get a relay credential
 * that costs us bandwidth. The credential is short-lived (TURN_TTL_SECONDS), so
 * a leaked one is only briefly useful, and the secret itself never leaves the
 * server.
 *
 * Clients call this before creating an RTCPeerConnection and cache the result
 * for the lifetime of the credential (see client/src/lib/ice.ts).
 */
router.get(
  '/ice-servers',
  requireAuth,
  asyncHandler(async (_req, res) => {
    ok(res, buildIceConfig());
  })
);

/**
 * Call limits the client needs to enforce in the UI. The socket layer enforces
 * them too — this is so the picker can stop at the cap instead of letting the
 * user choose six people and silently dropping two.
 */
router.get(
  '/limits',
  requireAuth,
  asyncHandler(async (_req, res) => {
    ok(res, {
      maxGroupCallParticipants: MAX_GROUP_CALL_PARTICIPANTS,
      groupCallsAudioFirst: GROUP_CALLS_AUDIO_FIRST,
    });
  })
);

export default router;

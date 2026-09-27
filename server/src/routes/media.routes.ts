/**
 * Chat media uploads (photos and videos).
 *
 * Three steps, all authenticated:
 *   POST /api/media/sign     → server picks the object path, asks Supabase for a
 *                              single-use upload URL, returns it with the caps.
 *   (client POSTs the bytes straight to that URL — they never touch this API)
 *   POST /api/media/confirm  → server HEADs the object, checks its *real* size and
 *                              type against the caps, and returns the public URL.
 *
 * Splitting it this way keeps the service-role key on the server, keeps large
 * blobs off a free 512 MB API instance, and means the metadata stored on the
 * message is measured rather than claimed.
 *
 * GET /api/media/status lets the client disable the video buttons cleanly when
 * hosting is not configured yet, instead of failing after a recording.
 */
import { Router } from 'express';
import { asyncHandler } from '../utils/asyncHandler';
import { requireAuth } from '../middleware/auth';
import { ok } from '../utils/responses';
import { validate } from '../middleware/validate';
import { BadRequestError } from '../utils/errors';
import { mediaConfirmSchema, mediaSignSchema } from '../validators/schemas';
import * as storage from '../services/supabase.service';

const router = Router();

router.get(
  '/status',
  requireAuth,
  asyncHandler(async (_req, res) => {
    ok(res, {
      configured: storage.storageConfigured(),
      // Lets a half-finished setup name what is absent, so "video does not work"
      // is one curl away from being diagnosable instead of guesswork.
      missing: storage.missingStorageConfig(),
      maxVideoBytes: storage.MAX_VIDEO_BYTES,
      maxImageBytes: storage.MAX_IMAGE_BYTES,
      maxVideoMs: storage.MAX_VIDEO_MS,
    });
  })
);

router.post(
  '/sign',
  requireAuth,
  validate(mediaSignSchema),
  asyncHandler(async (req, res) => {
    storage.assertStorageReady();
    const { kind, contentType, bytes } = req.body as {
      kind: storage.MediaKind;
      contentType: string;
      bytes: number;
    };

    if (!storage.isAllowedType(kind, contentType)) {
      throw new BadRequestError(
        kind === 'video'
          ? 'That video format is not supported. MP4 and WebM work best.'
          : 'That image format is not supported. JPEG, PNG, WebP and GIF work best.',
        { contentType }
      );
    }
    if (bytes > storage.maxBytesFor(kind)) {
      throw new BadRequestError(
        `That file is ${(bytes / 1_048_576).toFixed(1)} MB. The limit is ${Math.round(
          storage.maxBytesFor(kind) / 1_048_576
        )} MB.`,
        { bytes, maxBytes: storage.maxBytesFor(kind) }
      );
    }

    const path = storage.buildMediaPath(kind, contentType, req.user!.userId);
    const uploadUrl = await storage.createSignedUploadUrl(path, contentType);
    ok(res, {
      kind,
      path,
      uploadUrl,
      method: 'POST',
      // Sent back so the client never has to know the project URL or bucket.
      publicUrl: storage.publicUrlFor(path),
      maxBytes: storage.maxBytesFor(kind),
      // Exactly what the WebView must send with the bytes — see
      // clientUploadHeaders for why the publishable key belongs in there.
      headers: storage.clientUploadHeaders(contentType),
    });
  })
);

router.post(
  '/confirm',
  requireAuth,
  validate(mediaConfirmSchema),
  asyncHandler(async (req, res) => {
    storage.assertStorageReady();
    const { path, kind, width, height, durationMs } = req.body as {
      path: string;
      kind: storage.MediaKind;
      width?: number | null;
      height?: number | null;
      durationMs?: number | null;
    };

    const stat = await storage.statObject(path);
    if (!stat) {
      throw new BadRequestError('That upload did not arrive. Please record or pick the video again.');
    }
    if (stat.bytes <= 0) {
      throw new BadRequestError('The upload arrived empty. Please try again.');
    }
    if (stat.bytes > storage.maxBytesFor(kind)) {
      // Measured, not claimed: a client cannot talk its way past this.
      await storage.deleteObject(path);
      throw new BadRequestError(
        `That file is ${(stat.bytes / 1_048_576).toFixed(1)} MB. The limit is ${Math.round(
          storage.maxBytesFor(kind) / 1_048_576
        )} MB.`,
        { bytes: stat.bytes, maxBytes: storage.maxBytesFor(kind) }
      );
    }
    if (!storage.isAllowedType(kind, stat.contentType)) {
      await storage.deleteObject(path);
      throw new BadRequestError('The uploaded file is not a supported media type.', {
        contentType: stat.contentType,
      });
    }
    if (kind === 'video' && durationMs && durationMs > storage.MAX_VIDEO_MS) {
      await storage.deleteObject(path);
      throw new BadRequestError(
        `That clip is ${Math.round(durationMs / 1000)}s long. SkillSwap sends videos up to ${Math.round(
          storage.MAX_VIDEO_MS / 1000
        )}s.`
      );
    }

    ok(res, {
      kind,
      path,
      url: storage.publicUrlFor(path),
      contentType: stat.contentType,
      bytes: stat.bytes,
      width: width ?? null,
      height: height ?? null,
      durationMs: kind === 'video' ? (durationMs ?? null) : null,
    });
  })
);

export default router;

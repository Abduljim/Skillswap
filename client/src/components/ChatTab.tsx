import { useEffect, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api, ApiError } from '../lib/api';
import { useAuth } from '../contexts/AuthContext';
import {
  Send,
  Smile,
  Check,
  CheckCheck,
  Camera,
  Image as ImageIcon,
  Video as VideoIcon,
  Film,
  Plus,
  X,
  Pencil,
  Keyboard,
  AlertTriangle,
  Mic,
  Flame,
  EyeOff,
  FileText,
} from 'lucide-react';
import EmojiPicker from './EmojiPicker';
import VideoRecorder, { MAX_VIDEO_MS, type RecordedClip } from './VideoRecorder';
import VoiceRecorder, { type RecordedVoiceNote } from './VoiceRecorder';
import AudioBubble from './AudioBubble';
import { Socket } from 'socket.io-client';
import { showAndroidKeyboard } from '../lib/keyboard-bridge';
import {
  uploadMedia,
  mediaStatus,
  probeVideo,
  grabVideoFrame,
  formatBytes,
  formatDuration,
  qualityForHeight,
} from '../lib/media-upload';
import type { Message, MessageMediaFields } from '../types';

/** A recorded or picked clip waiting to be reviewed and sent. */
interface PendingVideo {
  url: string;
  blob: Blob;
  bytes: number;
  width: number;
  height: number;
  durationMs: number;
  quality: 'standard' | 'hd';
}

export default function ChatTab({
  exchangeId,
  socket,
  dark = false,
}: {
  exchangeId: string;
  socket?: Socket | null;
  dark?: boolean;
}) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const { data: messages = [], refetch } = useQuery({
    queryKey: ['messages', exchangeId],
    queryFn: async () => {
      const messages = await api.get<Message[]>(`/exchanges/${exchangeId}/messages`);
      void qc.invalidateQueries({ queryKey: ['conversations'] });
      return messages;
    },
  });
  // When a view-once message is opened (by us or on another device of ours) the
  // thread is re-pulled so "View once" flips to "Viewed" without a manual pull.
  useEffect(() => {
    if (!socket) return;
    const onViewed = (d: { exchangeId: string }) => {
      if (d.exchangeId === exchangeId) void refetch();
    };
    socket.on('message:viewed', onViewed);
    return () => {
      socket.off('message:viewed', onViewed);
    };
  }, [socket, exchangeId, refetch]);

  const [text, setText] = useState('');
  const [typing, setTyping] = useState(false);
  const [pendingImage, setPendingImage] = useState<string | null>(null);
  const [pendingCaption, setPendingCaption] = useState('');
  const [reviewOpen, setReviewOpen] = useState(false);
  // The emoji panel REPLACES the keyboard rather than stacking over it, so the
  // composer never changes height twice in a row.
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [sending, setSending] = useState(false);
  // Staged video, the attach sheet, the recorder, and the photo's binary form
  // (kept alongside the preview data URL so it can be uploaded as a real file).
  const [pendingVideo, setPendingVideo] = useState<PendingVideo | null>(null);
  const [attachOpen, setAttachOpen] = useState(false);
  const [recorderOpen, setRecorderOpen] = useState(false);
  // Voice notes send straight from the recorder, so the only thing staged here is
  // a note whose upload failed — kept so the user can retry instead of
  // re-recording a two-minute explanation because of one dropped request.
  const [voiceOpen, setVoiceOpen] = useState(false);
  const [pendingVoice, setPendingVoice] = useState<RecordedVoiceNote | null>(null);
  const [pendingViewOnce, setPendingViewOnce] = useState(false);
  const [viewOnceOpen, setViewOnceOpen] = useState<{
    url: string;
    type: string;
    durationMs: number | null;
    bytes: number | null;
    name: string | null;
  } | null>(null);
  /** Staged document: the picker's File kept as plain fields (no object URL). */
  const [pendingFile, setPendingFile] = useState<{
    name: string;
    size: number;
    type: string;
    blob: Blob;
  } | null>(null);
  const [mediaBusy, setMediaBusy] = useState<string | null>(null);
  const [mediaError, setMediaError] = useState<string | null>(null);
  const [pendingImageBlob, setPendingImageBlob] = useState<Blob | null>(null);
  const [pendingImageSize, setPendingImageSize] = useState<{ width: number; height: number } | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const socketRef = useRef<Socket | null>(socket ?? null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const videoInputRef = useRef<HTMLInputElement>(null);
  const docInputRef = useRef<HTMLInputElement>(null);
  const textInputRef = useRef<HTMLInputElement>(null);
  const pendingVideoRef = useRef<PendingVideo | null>(null);
  pendingVideoRef.current = pendingVideo;

  // Leaving the chat must not leak the preview URL we created for a staged clip.
  useEffect(
    () => () => {
      if (pendingVideoRef.current) URL.revokeObjectURL(pendingVideoRef.current.url);
    },
    []
  );

  const m = dark
    ? {
        surface: 'chat-dark',
        rowBorder: 'border-[#1f2430]',
        bubbleMine: 'bg-[#fb4f1d] text-[#ffffff]',
        bubbleTheirs: 'bg-[#1a1e29] text-[#eef0f4] ring-1 ring-[#2a2f3d]',
        infoMine: 'text-[#ffffff]/70',
        infoTheirs: 'text-[#76819a]',
        tickRead: 'text-[#12131a]',
        input: 'bg-[#1a1e29] border-[#2a2f3d] text-[#eef0f4]',
        inputPlaceholder: 'placeholder:text-[#76819a]',
        iconBtn: 'text-[#cdd1da] hover:bg-[#1f2430]',
        muted: 'text-[#76819a]',
      }
    : {
        surface: 'chat-white',
        rowBorder: 'border-[#efe9e0]',
        bubbleMine: 'bg-[#12131a] text-[#fdfaf4]',
        bubbleTheirs: 'bg-[#f5f2ec] text-[#12131a]',
        infoMine: 'text-[#fdfaf4]/70',
        infoTheirs: 'text-[#8a8a8f]',
        tickRead: 'text-[#fb4f1d]',
        input: 'bg-white border-[#e2dcd1] text-[#12131a]',
        inputPlaceholder: 'placeholder:text-[#8a8a8f]',
        iconBtn: 'text-[#12131a] hover:bg-[#f5f2ec]',
        muted: 'text-[#8a8a8f]',
      };

  useEffect(() => {
    if (!socket) return;
    socketRef.current = socket;
    const onMsg = (data: { exchangeId: string }) => {
      if (data.exchangeId !== exchangeId) return;
      refetch();
      socket.emit('message:read', { exchangeId });
    };
    const onStatus = (data: { exchangeId: string }) => {
      if (data.exchangeId !== exchangeId) return;
      refetch();
    };
    const onTyping = (data: { exchangeId: string; userId: string }) => {
      if (data.exchangeId !== exchangeId || data.userId !== user?.id) setTyping(true);
      setTimeout(() => setTyping(false), 2000);
    };
    socket.on('message:new', onMsg);
    socket.on('message:read', onStatus);
    socket.on('message:delivered', onStatus);
    socket.on('typing', onTyping);
    socket.emit('message:read', { exchangeId });
    return () => {
      socket.off('message:new', onMsg);
      socket.off('message:read', onStatus);
      socket.off('message:delivered', onStatus);
      socket.off('typing', onTyping);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [socket, exchangeId]);

  // Pin to the newest message without moving anything else.
  //
  // Two rules, both about keeping the screen still:
  //   1. Only the list scrolls — never the page, never the shell.
  //   2. Only follow the conversation when the reader is already at the bottom.
  //      Yanking someone back down while they read older messages is what made
  //      the chat feel like it was sliding around.
  // `typing` is deliberately NOT a trigger: the indicator toggles every couple
  // of seconds and must never reposition the list.
  const pinnedRef = useRef(false);

  const stickToBottom = (force = false) => {
    const el = scrollRef.current;
    if (!el) return;
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    // "At the bottom" = within about one message bubble.
    if (force || distanceFromBottom < 140) el.scrollTop = el.scrollHeight;
  };

  useEffect(() => {
    pinnedRef.current = false;
  }, [exchangeId]);

  useEffect(() => {
    if (messages.length === 0) return;
    if (!pinnedRef.current) {
      // First paint of a loaded conversation: open at the newest message.
      pinnedRef.current = true;
      stickToBottom(true);
      return;
    }
    stickToBottom();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages.length]);

  // Staging a photo grows the composer, which shrinks the list; re-pin so the
  // newest message is not pushed out of view behind it.
  useEffect(() => {
    if (pendingImage) stickToBottom(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingImage]);

  // The panel is a fixed height, but the list still has to stay glued to the
  // newest message when the composer area grows or shrinks by 272px.
  useEffect(() => {
    stickToBottom(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [emojiOpen]);

  // Images have no intrinsic height until they decode, so the list grows after
  // paint and the pinned position would be stale. Re-pin as each one lands.
  const onMediaLoad = () => stickToBottom();

  // Insert at the caret, not at the end: someone mid-sentence who taps an emoji
  // expects it where the cursor is.
  const insertAtCursor = (emoji: string) => {
    const input = textInputRef.current;
    const start = input?.selectionStart ?? text.length;
    const end = input?.selectionEnd ?? text.length;
    setText(text.slice(0, start) + emoji + text.slice(end));
    // Restore the caret on the next frame so it applies to the new value rather
    // than being reset by the re-render that follows setText.
    requestAnimationFrame(() => {
      const el = textInputRef.current;
      if (!el) return;
      try {
        el.setSelectionRange(start + emoji.length, start + emoji.length);
      } catch {
        // A detached input can throw here; losing the caret is not worth a crash.
      }
    });
    socketRef.current?.emit('typing', { exchangeId });
  };

  // "Big emoji" mode in the picker: one tap sends it as a STICKER message, which
  // the list already renders full size.
  const sendBigEmoji = (emoji: string) => {
    void sendMessage(emoji, 'STICKER');
    setEmojiOpen(false);
  };

  // Hand back to the system keyboard: focus first, then ask the native bridge to
  // raise Gboard, then focus again so the keyboard stays attached to the field.
  const openKeyboard = () => {
    setEmojiOpen(false);
    const input = textInputRef.current;
    if (!input) return;
    input.focus({ preventScroll: true });
    setTimeout(() => {
      void showAndroidKeyboard().catch(() => {});
      input.focus({ preventScroll: true });
    }, 0);
  };

  const sendMessage = async (
    body: string,
    type: string = 'TEXT',
    caption?: string | null,
    media?: MessageMediaFields,
    viewOnce = false
  ) => {
    if (!body.trim() || sending) return;
    setSending(true);
    try {
      await api.post(`/exchanges/${exchangeId}/messages`, {
        body,
        type,
        caption: caption || null,
        ...(media || {}),
        viewOnce,
      });
      setText('');
      void qc.invalidateQueries({ queryKey: ['conversations'] });
      refetch();
    } catch (e) {
      if (e instanceof ApiError) console.error(e.message);
    } finally {
      setSending(false);
    }
  };

  const sendImage = async (
    body: string,
    caption?: string | null,
    media?: MessageMediaFields,
    viewOnce?: boolean
  ) => {
    await sendMessage(body, 'IMAGE', caption, media, viewOnce === true);
  };

  // Compress to a ~1600px JPEG so phone camera photos (often 3–8MB) never hit
  // the DB cap and silently vanish. The result is staged as a preview and only
  // sent when the user taps Send (OK).
  const stageImage = (file: File) => {
    const reader = new FileReader();
    reader.onerror = () => {};
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => {};
      img.onload = () => {
        const MAX = 1600;
        const scale = Math.min(1, MAX / Math.max(img.width, img.height));
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(img.width * scale);
        canvas.height = Math.round(img.height * scale);
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        setPendingImageSize({ width: canvas.width, height: canvas.height });
        try {
          setPendingImage(canvas.toDataURL('image/jpeg', 0.82));
          // Keep the binary as well: when the server has media hosting switched
          // on, the photo is uploaded as a file and the row stores a short URL
          // instead of ~300 KB of base64 — which also stops photos dying with
          // the database and keeps the message list light.
          canvas.toBlob((blob) => setPendingImageBlob(blob), 'image/jpeg', 0.82);
        } catch {
          // fall back to the raw data URL if JPEG not supported
          setPendingImage(reader.result as string);
          setPendingImageBlob(null);
        }
      };
      img.src = reader.result as string;
    };
    reader.readAsDataURL(file);
  };

  const handleMediaFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (f) stageImage(f);
  };

  /**
   * Sends the staged photo. Uploads it as a file when the server has media
   * hosting switched on; falls back to the v1.5 inline data URL when it does not,
   * so photos keep working with no Supabase keys configured.
   */
  const sendPending = async () => {
    if (!pendingImage || sending) return;
    const image = pendingImage;
    const blob = pendingImageBlob;
    const dims = pendingImageSize;
    const caption = pendingCaption;
    setSending(true);
    setMediaError(null);

    let body = image;
    let media: MessageMediaFields | undefined;
    if (blob) {
      try {
        setMediaBusy('Uploading photo…');
        const uploaded = await uploadMedia(blob, 'image');
        body = uploaded.url;
        media = {
          mediaUrl: uploaded.url,
          mediaBytes: uploaded.bytes,
          mediaWidth: dims?.width ?? null,
          mediaHeight: dims?.height ?? null,
        };
      } catch (error) {
        // Not configured = the old inline path is still correct, so carry on.
        // Any other failure is worth telling the user about rather than
        // silently sending a photo they may not have wanted sent that way.
        if (error instanceof ApiError && error.code !== 'MEDIA_NOT_CONFIGURED') {
          setMediaError(error.message);
          setSending(false);
          setMediaBusy(null);
          return;
        }
      }
    }

    setMediaBusy('Sending…');
    await sendImage(body, caption, media, pendingViewOnce);
    setSending(false);
    setMediaBusy(null);
    setPendingImage(null);
    setPendingImageBlob(null);
    setPendingViewOnce(false);
    setPendingImageSize(null);
    setPendingCaption('');
    setReviewOpen(false);
  };

  const discardPending = () => {
    setPendingImage(null);
    setPendingImageBlob(null);
    setPendingViewOnce(false);
    setPendingImageSize(null);
    setPendingCaption('');
    setReviewOpen(false);
  };

  // ── Video ────────────────────────────────────────────────────────────────

  /** The recorder hands back a finished clip; stage it and open the review. */
  const handleRecorded = (clip: RecordedClip) => {
    setRecorderOpen(false);
    setAttachOpen(false);
    setMediaError(null);
    setPendingVideo({
      url: clip.url,
      blob: clip.blob,
      bytes: clip.bytes,
      width: clip.width,
      height: clip.height,
      durationMs: clip.durationMs,
      quality: clip.quality,
    });
    setReviewOpen(true);
  };

  /**
   * Checked before the microphone opens, exactly like the video path: recording
   * a five-minute note only to be told the server cannot store it wastes the
   * user's time and their data.
   */
  const openVoiceRecorder = () => {
    void (async () => {
      setEmojiOpen(false);
      setAttachOpen(false);
      setMediaError(null);
      const status = await mediaStatus().catch(() => null);
      if (status && !status.configured) {
        setMediaError(
          'Voice notes are not switched on for this server yet. Add the Supabase keys (docs/MEDIA.md) to enable them.'
        );
        return;
      }
      setVoiceOpen(true);
    })();
  };

  const sendVoiceNote = async (note: RecordedVoiceNote) => {
    if (sending) return;
    setSending(true);
    setMediaError(null);
    try {
      setMediaBusy('Uploading voice note…');
      const uploaded = await uploadMedia(note.blob, 'audio');

      setMediaBusy('Sending…');
      await api.post(`/exchanges/${exchangeId}/messages`, {
        // body is NOT NULL and every list/preview path reads it, so the URL goes
        // in both places — the same shape a video message uses.
        body: uploaded.url,
        type: 'AUDIO',
        viewOnce: pendingViewOnce,
        caption: null,
        mediaUrl: uploaded.url,
        mediaBytes: uploaded.bytes,
        mediaDurationMs: Math.max(1, Math.round(note.durationMs)),
      });

      URL.revokeObjectURL(note.url);
      setPendingVoice(null);
      setPendingViewOnce(false);
      void qc.invalidateQueries({ queryKey: ['conversations'] });
      refetch();
    } catch (error) {
      setPendingVoice(note);
      setMediaError(
        error instanceof ApiError ? error.message : 'Could not send that voice note. Please try again.'
      );
    } finally {
      setSending(false);
      setMediaBusy(null);
    }
  };

  const openViewOnce = async (message: Message) => {
    try {
      const res = await api.post<{ url: string | null; viewedAt: string | null }>(
        `/exchanges/${exchangeId}/messages/${message.id}/view`,
        {}
      );
      if (!res.url) throw new ApiError('VIEW_ONCE_GONE', 'That media is no longer available.', 410);
      setViewOnceOpen({
        url: res.url,
        type: message.type || 'IMAGE',
        durationMs: message.mediaDurationMs ?? null,
        bytes: message.mediaBytes ?? null,
        name: message.mediaName ?? null,
      });
    } catch (error) {
      setMediaError(error instanceof ApiError ? error.message : 'That view-once media could not be opened.');
    }
  };

  /** Document picker: size-check against the server's cap, then stage. */
  const handleDocFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setMediaError(null);
    const status = await mediaStatus().catch(() => null);
    if (status && !status.configured) {
      setMediaError('File sending is not switched on for this server yet.');
      return;
    }
    const maxBytes = status?.maxFileBytes ?? 32 * 1024 * 1024;
    if (file.size > maxBytes) {
      setMediaError(`That file is ${formatBytes(file.size)}. The limit is ${formatBytes(maxBytes)}.`);
      return;
    }
    if (file.size === 0) {
      setMediaError('That file is empty.');
      return;
    }
    setPendingFile({
      name: file.name,
      size: file.size,
      type: file.type || 'application/octet-stream',
      blob: file,
    });
    setReviewOpen(true);
  };

  const sendPendingFile = async () => {
    if (!pendingFile || sending) return;
    const doc = pendingFile;
    const caption = pendingCaption;
    setSending(true);
    setMediaError(null);
    try {
      setMediaBusy('Uploading file…');
      const uploaded = await uploadMedia(doc.blob, 'file');
      setMediaBusy('Sending…');
      await api.post(`/exchanges/${exchangeId}/messages`, {
        body: uploaded.url,
        type: 'FILE',
        caption: caption || null,
        mediaUrl: uploaded.url,
        mediaBytes: uploaded.bytes,
        mediaName: doc.name,
        viewOnce: pendingViewOnce,
      });
      setPendingFile(null);
      setPendingCaption('');
      setPendingViewOnce(false);
      setReviewOpen(false);
      void qc.invalidateQueries({ queryKey: ['conversations'] });
      refetch();
    } catch (error) {
      setMediaError(
        error instanceof ApiError && error.code !== 'MEDIA_NOT_CONFIGURED'
          ? error.message
          : 'Could not send that file. Please try again.'
      );
    } finally {
      setSending(false);
      setMediaBusy(null);
    }
  };

  const discardPendingFile = () => {
    setPendingFile(null);
    setPendingCaption('');
    setPendingViewOnce(false);
    setReviewOpen(false);
  };

  const handleVoiceNote = (note: RecordedVoiceNote) => {
    setVoiceOpen(false);
    setPendingVoice(note);
    void sendVoiceNote(note);
  };

  const discardVoiceNote = () => {
    setPendingVoice((note) => {
      if (note) URL.revokeObjectURL(note.url);
      return null;
    });
    setMediaError(null);
  };

  /**
   * A video from the gallery (or the system camera app). Checked against the
   * same ceilings as a recording *before* anything uploads, so the user gets
   * "that clip is 2:14 long" instead of a spinner followed by a failure.
   */
  const handleVideoFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    setAttachOpen(false);
    if (!file) return;
    setMediaError(null);

    const status = await mediaStatus().catch(() => null);
    if (status && !status.configured) {
      setMediaError('Video sending is not switched on for this server yet.');
      return;
    }
    const maxBytes = status?.maxVideoBytes ?? 64 * 1024 * 1024;
    // The server allows a few seconds of slack for container rounding, but the
    // promise made in the UI is one minute — so that is what a gallery pick is
    // held to, and what the refusal message says.
    const maxMs = MAX_VIDEO_MS;

    if (file.size > maxBytes) {
      setMediaError(`That video is ${formatBytes(file.size)}. The limit is ${formatBytes(maxBytes)}.`);
      return;
    }

    const url = URL.createObjectURL(file);
    const probe = await probeVideo(url).catch(() => ({ durationMs: 0, width: 0, height: 0 }));
    if (probe.durationMs > maxMs) {
      URL.revokeObjectURL(url);
      setMediaError(
        `That video is ${formatDuration(probe.durationMs)} long. SkillSwap sends clips up to ${formatDuration(maxMs)}.`
      );
      return;
    }

    setPendingVideo({
      url,
      blob: file,
      bytes: file.size,
      width: probe.width,
      height: probe.height,
      durationMs: probe.durationMs,
      quality: qualityForHeight(probe.height),
    });
    setReviewOpen(true);
  };

  const sendPendingVideo = async () => {
    if (!pendingVideo || sending) return;
    const clip = pendingVideo;
    const caption = pendingCaption;
    setSending(true);
    setMediaError(null);
    try {
      // Poster frame first: it is a few KB and lets the recipient's list draw
      // the bubble without downloading the video at all.
      setMediaBusy('Preparing…');
      const frame = await grabVideoFrame(clip.url);
      let thumbUrl: string | null = null;
      if (frame) {
        try {
          thumbUrl = (await uploadMedia(frame, 'image')).url;
        } catch {
          thumbUrl = null; // no poster is fine — the video still plays
        }
      }

      setMediaBusy('Uploading video…');
      const uploaded = await uploadMedia(clip.blob, 'video');

      setMediaBusy('Sending…');
      await api.post(`/exchanges/${exchangeId}/messages`, {
        body: uploaded.url,
        type: 'VIDEO',
        viewOnce: pendingViewOnce,
        caption: caption || null,
        mediaUrl: uploaded.url,
        thumbUrl,
        mediaBytes: uploaded.bytes,
        mediaWidth: clip.width || null,
        mediaHeight: clip.height || null,
        mediaDurationMs: Math.max(1, Math.round(clip.durationMs)),
      });

      URL.revokeObjectURL(clip.url);
      setPendingVideo(null);
      setPendingViewOnce(false);
      setPendingCaption('');
      setReviewOpen(false);
      void qc.invalidateQueries({ queryKey: ['conversations'] });
      refetch();
    } catch (error) {
      setMediaError(error instanceof ApiError ? error.message : 'Could not send that video. Please try again.');
    } finally {
      setSending(false);
      setMediaBusy(null);
    }
  };

  const discardPendingVideo = () => {
    if (pendingVideo) URL.revokeObjectURL(pendingVideo.url);
    setPendingVideo(null);
    setPendingViewOnce(false);
    setPendingCaption('');
    setReviewOpen(false);
  };

  return (
    <div className={`flex flex-col h-full min-h-0 w-full overflow-hidden ${m.surface}`}>
      <div ref={scrollRef} className="flex-1 min-h-0 overflow-y-auto overscroll-contain touch-pan-y space-y-3 px-4 py-4">
        {messages.length === 0 && (
          <div className={`text-center text-sm ${m.muted} py-10`}>No messages yet. Say hello.</div>
        )}
        {messages.map((message) => {
          const mine = message.senderId === user?.id;
          return (
            <div key={message.id} className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
              {/* A photo gets its own frame. `w-[min(78%,320px)]` is a hard
                  width, so the bubble can never be wider than the row, and the
                  image fills it and is cropped to it (object-cover) instead of
                  spilling outside. The old `max-w-[300px] max-h-96 w-auto` was
                  wider than 78% of a narrow screen and taller than the viewport
                  allowed, which is why sent AND received photos broke out of the
                  bubble. Text keeps its padding; photos get a 4px mat instead. */}
              <div
                className={
                  message.type === 'IMAGE' || message.type === 'VIDEO' || message.type === 'AUDIO'
                    ? `w-[min(78%,320px)] min-w-0 rounded-2xl p-1 shadow-sm overflow-hidden ${
                        mine ? m.bubbleMine : m.bubbleTheirs
                      }`
                    : `max-w-[78%] min-w-0 rounded-2xl px-4 py-2 shadow-sm ${
                        mine ? m.bubbleMine : m.bubbleTheirs
                      }`
                }
              >
                {message.type === 'IMAGE' ? (
                  <div>
                    <img
                      src={message.mediaUrl || message.body}
                      alt={message.caption || 'Shared image'}
                      loading="lazy"
                      decoding="async"
                      className="block w-full h-auto max-h-[340px] object-cover rounded-xl"
                      onLoad={onMediaLoad}
                    />
                    {message.caption && (
                      <div className="text-sm whitespace-pre-wrap break-words px-2.5 pt-2">{message.caption}</div>
                    )}
                  </div>
                ) : message.type === 'VIDEO' ? (
                  <div className="relative">
                    {/* The same hard frame as a photo: the video fills the
                        bubble and is cropped to it, so it can never spill
                        outside. `preload="metadata"` + a poster means a chat
                        full of clips costs kilobytes, not megabytes, to open. */}
                    <video
                      src={message.mediaUrl || message.body}
                      poster={message.thumbUrl || undefined}
                      controls
                      playsInline
                      preload="metadata"
                      className="block w-full h-auto max-h-[340px] rounded-xl bg-black object-cover"
                      onLoadedData={onMediaLoad}
                    />
                    <div className="absolute top-2 right-2 flex items-center gap-1 rounded-full bg-black/65 px-2 py-0.5 text-[10px] font-semibold text-white pointer-events-none">
                      <VideoIcon className="w-3 h-3" />
                      {message.mediaDurationMs ? formatDuration(message.mediaDurationMs) : 'Video'}
                      {message.mediaBytes ? ` · ${formatBytes(message.mediaBytes)}` : ''}
                    </div>
                    {message.caption && (
                      <div className="text-sm whitespace-pre-wrap break-words px-2.5 pt-2">{message.caption}</div>
                    )}
                  </div>
                ) : message.viewOnce ? (
                  <div>
                    {message.mediaViewedAt ? (
                      <div className="flex items-center gap-2 px-3 py-2 text-sm opacity-75">
                        <EyeOff className="w-4 h-4 shrink-0" />
                        Viewed once
                      </div>
                    ) : mine ? (
                      <div className="flex items-center gap-2 px-3 py-2 text-sm opacity-75">
                        <Flame className="w-4 h-4 shrink-0" />
                        View once · not opened yet
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => void openViewOnce(message)}
                        className="flex items-center gap-2 px-3 py-2 text-sm font-semibold active:scale-95"
                      >
                        <Flame className="w-4 h-4 shrink-0" />
                        View once
                      </button>
                    )}
                    {message.caption && (
                      <div className="text-sm whitespace-pre-wrap break-words px-2.5 pb-1">{message.caption}</div>
                    )}
                  </div>
                ) : message.type === 'FILE' ? (
                  <div>
                    <button
                      type="button"
                      onClick={() => window.open(message.mediaUrl || message.body, '_blank')}
                      className="flex items-center gap-3 px-3 py-2.5 text-left active:scale-[0.98] w-full"
                      title="Download file"
                    >
                      <span
                        className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                          mine ? 'bg-white/15' : 'bg-black/5'
                        }`}
                      >
                        <FileText className="w-5 h-5" />
                      </span>
                      <span className="min-w-0">
                        <span className="block text-sm font-semibold truncate max-w-[190px]">
                          {message.mediaName || 'File'}
                        </span>
                        <span className="block text-[11px] opacity-70">
                          {message.mediaBytes ? `${formatBytes(message.mediaBytes)} · ` : ''}Tap to download
                        </span>
                      </span>
                    </button>
                    {message.caption && (
                      <div className="text-sm whitespace-pre-wrap break-words px-2.5 pb-1">{message.caption}</div>
                    )}
                  </div>
                ) : message.type === 'AUDIO' ? (
                  <div>
                    <AudioBubble
                      src={message.mediaUrl || message.body}
                      durationMs={message.mediaDurationMs}
                      bytes={message.mediaBytes}
                    />
                    {message.caption && (
                      <div className="text-sm whitespace-pre-wrap break-words px-2.5 pb-1">{message.caption}</div>
                    )}
                  </div>
                ) : message.type === 'STICKER' ? (
                  <div className="text-5xl leading-none py-1">{message.body}</div>
                ) : (
                  <div className="text-sm whitespace-pre-wrap break-words">{message.body}</div>
                )}
                <div
                  className={`text-[10px] flex items-center justify-end gap-1 ${
                    message.type === 'IMAGE' || message.type === 'VIDEO' || message.type === 'AUDIO' ? 'mt-1 px-2 pb-1' : 'mt-1'
                  } ${mine ? m.infoMine : m.infoTheirs}`}
                >
                  {new Date(message.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  {mine && (
                    message.status === 'READ' ? (
                      <CheckCheck className={`w-3 h-3 ${m.tickRead}`} />
                    ) : message.status === 'DELIVERED' ? (
                      <CheckCheck className="w-3 h-3" />
                    ) : (
                      <Check className="w-3 h-3" />
                    )
                  )}
                </div>
              </div>
            </div>
          );
        })}
        {typing && <div className={`text-xs italic px-2 ${m.muted}`}>typing…</div>}
      </div>

      <div className={`pt-3 px-4 pb-4 border-t ${m.rowBorder} relative`}>
        {mediaError && (
          <div className="mb-2 flex items-start gap-2 rounded-xl bg-[#fdecea] px-3 py-2 text-[#8a1c13]">
            <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
            <div className="flex-1 min-w-0 text-xs leading-snug">{mediaError}</div>
            <button
              type="button"
              onClick={() => setMediaError(null)}
              className="shrink-0 text-[#8a1c13]/70 hover:text-[#8a1c13]"
              title="Dismiss"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {pendingVoice && (
          <div
            className={`mb-2 flex items-center gap-2 rounded-xl px-3 py-2 text-xs ${
              dark ? 'bg-[#1a1e29] text-[#eef0f4] ring-1 ring-[#2a2f3d]' : 'bg-[#f5f2ec] text-[#12131a]'
            }`}
          >
            <Mic className="w-3.5 h-3.5 shrink-0" />
            <span className="flex-1 min-w-0 truncate">
              {mediaBusy || `Voice note · ${formatDuration(pendingVoice.durationMs)}`}
            </span>
            {mediaError && !sending && (
              <button
                type="button"
                onClick={() => void sendVoiceNote(pendingVoice)}
                className="shrink-0 font-semibold underline"
              >
                Send again
              </button>
            )}
            <button
              type="button"
              onClick={discardVoiceNote}
              disabled={sending}
              className="shrink-0 opacity-70 disabled:opacity-40"
            >
              Discard
            </button>
          </div>
        )}

        {/* Attach sheet. Floats above the composer (absolute) so opening it
            never resizes the message list — the same rule that keeps the chat
            from jumping when the emoji panel opens. */}
        {attachOpen && !pendingImage && !pendingVideo && !pendingFile && (
          <>
            <button
              type="button"
              aria-label="Close attach menu"
              className="fixed inset-0 z-20 cursor-default"
              onClick={() => setAttachOpen(false)}
            />
            <div className="absolute bottom-full left-0 right-0 z-30 mb-2 px-1">
              <div
                className={`rounded-2xl border p-2 grid grid-cols-4 gap-1 shadow-lg ${
                  dark ? 'bg-[#1a1e29] border-[#2a2f3d]' : 'bg-white border-[#e2dcd1]'
                }`}
              >
                {[
                  {
                    key: 'camera',
                    label: 'Take photo',
                    icon: <Camera className="w-5 h-5" />,
                    run: () => cameraInputRef.current?.click(),
                  },
                  {
                    key: 'photo',
                    label: 'Photos',
                    icon: <ImageIcon className="w-5 h-5" />,
                    run: () => fileInputRef.current?.click(),
                  },
                  {
                    key: 'record',
                    label: 'Record video',
                    icon: <VideoIcon className="w-5 h-5" />,
                    // Checked BEFORE the camera opens: recording a clip only to
                    // be told at the end that the server cannot store it wastes
                    // the user's minute and their data.
                    run: () => {
                      void (async () => {
                        setEmojiOpen(false);
                        setMediaError(null);
                        const status = await mediaStatus().catch(() => null);
                        if (status && !status.configured) {
                          setMediaError(
                            'Video sending is not switched on for this server yet. Add the Supabase keys (docs/MEDIA.md) to enable it.'
                          );
                          return;
                        }
                        setRecorderOpen(true);
                      })();
                    },
                  },
                  {
                    key: 'video',
                    label: 'Videos',
                    icon: <Film className="w-5 h-5" />,
                    run: () => videoInputRef.current?.click(),
                  },
                  {
                    key: 'document',
                    label: 'Document',
                    icon: <FileText className="w-5 h-5" />,
                    run: () => docInputRef.current?.click(),
                  },
                ].map((item) => (
                  <button
                    key={item.key}
                    type="button"
                    onClick={() => {
                      setAttachOpen(false);
                      item.run();
                    }}
                    className="flex flex-col items-center gap-1 rounded-xl py-2 active:scale-95"
                  >
                    <span
                      className={`w-11 h-11 rounded-full flex items-center justify-center ${
                        dark ? 'bg-[#1f2430] text-[#eef0f4]' : 'bg-[#f5f2ec] text-[#12131a]'
                      }`}
                    >
                      {item.icon}
                    </span>
                    <span className={`text-[10px] leading-tight text-center ${m.muted}`}>{item.label}</span>
                  </button>
                ))}
              </div>
            </div>
          </>
        )}

        {pendingFile ? (
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setReviewOpen(true)}
              className={`shrink-0 w-12 h-12 rounded-xl flex items-center justify-center border active:scale-95 ${
                dark ? 'bg-[#1f2430] border-[#2a2f3d] text-[#eef0f4]' : 'bg-[#f5f2ec] border-[#e2dcd1] text-[#12131a]'
              }`}
              title="Review file"
            >
              <FileText className="w-5 h-5" />
            </button>
            <div className="flex-1 min-w-0">
              <div className={`text-sm font-semibold ${dark ? 'text-[#eef0f4]' : 'text-[#12131a]'}`}>
                {pendingCaption ? 'File with caption ready' : 'File ready'}
              </div>
              <div className={`text-xs truncate ${m.muted}`}>
                {pendingFile.name} · {formatBytes(pendingFile.size)}
              </div>
            </div>
            <button
              type="button"
              onClick={discardPendingFile}
              className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 ${m.iconBtn}`}
              title="Remove file"
            >
              <X className="w-5 h-5" />
            </button>
            <button
              type="button"
              onClick={() => setReviewOpen(true)}
              className="btn-coral text-sm px-4 py-2 shrink-0 whitespace-nowrap"
            >
              <Pencil className="w-4 h-4" /> Review
            </button>
          </div>
        ) : pendingVideo ? (
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setReviewOpen(true)}
              className="relative shrink-0 w-12 h-12 rounded-xl overflow-hidden border bg-black active:scale-95"
              title="Review video"
            >
              <video src={pendingVideo.url} muted playsInline preload="metadata" className="w-12 h-12 object-cover" />
              <span className="absolute inset-0 flex items-center justify-center">
                <VideoIcon className="w-4 h-4 text-white drop-shadow" />
              </span>
            </button>
            <div className="flex-1 min-w-0">
              <div className={`text-sm font-semibold ${dark ? 'text-[#eef0f4]' : 'text-[#12131a]'}`}>
                {pendingCaption ? 'Video with caption ready' : 'Video ready'}
              </div>
              <div className={`text-xs truncate ${m.muted}`}>
                {pendingCaption ||
                  `${formatDuration(pendingVideo.durationMs)} · ${formatBytes(pendingVideo.bytes)} · ${
                    pendingVideo.quality === 'hd' ? 'HD' : 'Standard'
                  }`}
              </div>
            </div>
            <button
              type="button"
              onClick={discardPendingVideo}
              className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 ${m.iconBtn}`}
              title="Remove video"
            >
              <X className="w-5 h-5" />
            </button>
            <button
              type="button"
              onClick={() => setReviewOpen(true)}
              className="btn-coral text-sm px-4 py-2 shrink-0 whitespace-nowrap"
            >
              <Pencil className="w-4 h-4" /> Review
            </button>
          </div>
        ) : pendingImage ? (
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setReviewOpen(true)}
              className="shrink-0 rounded-xl overflow-hidden border active:scale-95"
              title="Review photo"
            >
              <img src={pendingImage} alt="Photo to send" className="w-12 h-12 object-cover" />
            </button>
            <div className="flex-1 min-w-0">
              <div className={`text-sm font-semibold ${dark ? 'text-[#eef0f4]' : 'text-[#12131a]'}`}>
                {pendingCaption ? 'Photo with caption ready' : 'Photo ready'}
              </div>
              <div className={`text-xs truncate ${m.muted}`}>
                {pendingCaption || 'Tap the photo to review and add a caption.'}
              </div>
            </div>
            <button
              type="button"
              onClick={discardPending}
              className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 ${m.iconBtn}`}
              title="Remove photo"
            >
              <X className="w-5 h-5" />
            </button>
            <button
              type="button"
              onClick={() => setReviewOpen(true)}
              className="btn-coral text-sm px-4 py-2 shrink-0 whitespace-nowrap"
            >
              <Pencil className="w-4 h-4" /> Review
            </button>
          </div>
        ) : (
          <div className="flex gap-2 items-end">
            <div className="relative flex items-center gap-1">
              <button
                type="button"
                onPointerDown={(e) => {
                  e.preventDefault();
                }}
                onClick={() => (emojiOpen ? openKeyboard() : setEmojiOpen(true))}
                className={`w-9 h-9 rounded-full flex items-center justify-center ${m.iconBtn}`}
                aria-label={emojiOpen ? 'Back to the keyboard' : 'Open the emoji picker'}
                title={emojiOpen ? 'Back to the keyboard' : 'Open the emoji picker'}
                aria-expanded={emojiOpen}
              >
                {emojiOpen ? <Keyboard className="w-5 h-5" /> : <Smile className="w-5 h-5" />}
              </button>
              <button
                type="button"
                onPointerDown={(e) => e.preventDefault()}
                onClick={() => {
                  setEmojiOpen(false);
                  setAttachOpen((open) => !open);
                }}
                className={`w-9 h-9 rounded-full flex items-center justify-center ${m.iconBtn}`}
                aria-label="Attach a photo, video or document"
                title="Attach a photo, video or document"
                aria-expanded={attachOpen}
              >
                <Plus className={`w-5 h-5 transition-transform ${attachOpen ? 'rotate-45' : ''}`} />
              </button>
              <input
                ref={cameraInputRef}
                type="file"
                accept="image/*"
                capture="environment"
                className="hidden"
                onChange={handleMediaFile}
              />
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleMediaFile}
              />
              <input
                ref={videoInputRef}
                type="file"
                accept="video/*"
                className="hidden"
                onChange={(e) => void handleVideoFile(e)}
              />
              <input
                ref={docInputRef}
                type="file"
                accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv,.md,.rtf,.zip,.7z,.rar,.epub,.json"
                className="hidden"
                onChange={(e) => void handleDocFile(e)}
              />
            </div>

            <input
              ref={textInputRef}
              className={`input flex-1 min-w-0 ${m.input} ${m.inputPlaceholder}`}
              placeholder="Type a message…"
              value={text}
              onFocus={() => setEmojiOpen(false)}
              onChange={(e) => {
                setText(e.target.value);
                socketRef.current?.emit('typing', { exchangeId });
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  sendMessage(text);
                }
              }}
            />
            {text.trim().length > 0 ? (
              <button onClick={() => sendMessage(text)} className="btn-coral shrink-0" aria-label="Send message">
                <Send className="w-4 h-4" />
              </button>
            ) : (
              <button
                type="button"
                onClick={openVoiceRecorder}
                className="btn-coral shrink-0"
                aria-label="Record a voice note"
                title="Record a voice note"
              >
                <Mic className="w-4 h-4" />
              </button>
            )}
          </div>
        )}
      </div>

      {emojiOpen && (
        <EmojiPicker dark={dark} onInsert={insertAtCursor} onSendBig={sendBigEmoji} onClose={openKeyboard} />
      )}

      <VideoRecorder
        open={recorderOpen}
        onClose={() => setRecorderOpen(false)}
        onRecorded={handleRecorded}
        onFallbackToGallery={() => videoInputRef.current?.click()}
      />

      {viewOnceOpen && (
        <div className="fixed inset-0 z-50 bg-black flex flex-col">
          <div className="flex items-center justify-between px-3 pt-3">
            <span className="text-xs text-white/70 flex items-center gap-1.5">
              <Flame className="w-3.5 h-3.5" />
              View once — it will not be available again
            </span>
            <button
              type="button"
              onClick={() => {
                setViewOnceOpen(null);
                refetch();
              }}
              aria-label="Close"
              className="w-10 h-10 rounded-full bg-white/10 text-white flex items-center justify-center active:scale-95"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
          <div className="flex-1 flex items-center justify-center p-4 min-h-0">
            {viewOnceOpen.type === 'VIDEO' ? (
              <video
                src={viewOnceOpen.url}
                controls
                autoPlay
                playsInline
                className="max-h-full max-w-full rounded-xl"
              />
            ) : viewOnceOpen.type === 'FILE' ? (
              <div className="flex flex-col items-center gap-4 text-white text-center px-6">
                <span className="w-20 h-20 rounded-2xl bg-white/10 flex items-center justify-center">
                  <FileText className="w-9 h-9" />
                </span>
                <div className="text-sm font-semibold break-all">{viewOnceOpen.name || 'File'}</div>
                <button
                  type="button"
                  onClick={() => window.open(viewOnceOpen.url, '_blank')}
                  className="rounded-full bg-[#fb4f1d] text-white text-sm font-semibold px-6 py-3 active:scale-95"
                >
                  Download
                </button>
              </div>
            ) : viewOnceOpen.type === 'AUDIO' ? (
              <div className="w-full max-w-sm text-white">
                <AudioBubble
                  src={viewOnceOpen.url}
                  durationMs={viewOnceOpen.durationMs}
                  bytes={viewOnceOpen.bytes}
                />
              </div>
            ) : (
              <img src={viewOnceOpen.url} alt="View-once photo" className="max-h-full max-w-full object-contain" />
            )}
          </div>
        </div>
      )}

      <VoiceRecorder
        open={voiceOpen}
        onClose={() => setVoiceOpen(false)}
        onRecorded={handleVoiceNote}
        viewOnce={pendingViewOnce}
        onViewOnceChange={setPendingViewOnce}
      />

      {reviewOpen && (pendingImage || pendingVideo || pendingFile) && (
        <div className="fixed inset-0 z-50 bg-black flex flex-col animate-fade-in">
          <div className="flex items-center justify-between px-3 pt-3 pb-2 bg-gradient-to-b from-black/80 to-transparent">
            <button
              type="button"
              onClick={() => setReviewOpen(false)}
              className="w-10 h-10 rounded-full bg-white/10 text-white flex items-center justify-center active:scale-95"
              title="Back"
            >
              <X className="w-5 h-5" />
            </button>
            <button
              type="button"
              onClick={() => setPendingViewOnce((v) => !v)}
              className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold ring-1 active:scale-95 ${
                pendingViewOnce ? 'bg-[#fb4f1d] text-white ring-[#fb4f1d]' : 'bg-white/10 text-white ring-white/25'
              }`}
              title="View once: the media disappears after it is opened once"
            >
              <Flame className="w-3.5 h-3.5" />
              View once
            </button>
            <button
              type="button"
              onClick={() => void (pendingFile ? sendPendingFile() : pendingVideo ? sendPendingVideo() : sendPending())}
              disabled={sending}
              className="flex items-center gap-2 rounded-full bg-[#00a884] text-white text-sm font-semibold px-5 py-2.5 active:scale-95 disabled:opacity-60"
            >
              <Send className="w-4 h-4" /> {sending ? mediaBusy || 'Sending…' : 'Send'}
            </button>
          </div>

          <div className="flex-1 min-h-0 flex items-center justify-center px-2">
            {pendingFile ? (
              <div className="flex flex-col items-center gap-3 text-white px-6 text-center">
                <span className="w-20 h-20 rounded-2xl bg-white/10 flex items-center justify-center">
                  <FileText className="w-9 h-9" />
                </span>
                <div className="text-sm font-semibold break-all">{pendingFile.name}</div>
                <div className="text-xs text-white/60">{formatBytes(pendingFile.size)}</div>
              </div>
            ) : pendingVideo ? (
              <video
                src={pendingVideo.url}
                controls
                autoPlay
                loop
                playsInline
                className="max-w-full max-h-full w-auto h-auto object-contain"
              />
            ) : (
              <img
                src={pendingImage || ''}
                alt="Photo to send"
                className="max-w-full max-h-full w-auto h-auto object-contain"
              />
            )}
          </div>

          {pendingVideo && (
            <div className="px-3 pt-1 text-center text-white/70 text-[11px]">
              {formatDuration(pendingVideo.durationMs)} · {formatBytes(pendingVideo.bytes)} ·{' '}
              {pendingVideo.quality === 'hd' ? 'HD (uses more data)' : 'Standard'}
              {pendingVideo.width > 0 && ` · ${pendingVideo.width}×${pendingVideo.height}`}
            </div>
          )}

          <div className="px-3 pb-[max(1rem,env(safe-area-inset-bottom))] pt-2 bg-gradient-to-t from-black/80 to-transparent">
            <div className="flex items-center gap-2 rounded-full bg-[#1f2c34] px-4 py-2.5">
              <Smile className="w-5 h-5 text-[#8696a0] shrink-0" />
              <input
                autoFocus
                className="flex-1 min-w-0 bg-transparent text-white text-sm outline-none placeholder:text-[#8696a0]"
                placeholder="Add a caption…"
                value={pendingCaption}
                onChange={(e) => setPendingCaption(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    void (pendingFile ? sendPendingFile() : pendingVideo ? sendPendingVideo() : sendPending());
                  }
                }}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
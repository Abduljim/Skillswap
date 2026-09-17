import { useEffect, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api, ApiError } from '../lib/api';
import { useAuth } from '../contexts/AuthContext';
import { Send, Smile, Check, CheckCheck, Camera, Image as ImageIcon, X, Pencil } from 'lucide-react';
import { Socket } from 'socket.io-client';
import { showAndroidKeyboard } from '../lib/keyboard-bridge';
import type { Message } from '../types';

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
  const [text, setText] = useState('');
  const [typing, setTyping] = useState(false);
  const [pendingImage, setPendingImage] = useState<string | null>(null);
  const [pendingCaption, setPendingCaption] = useState('');
  const [reviewOpen, setReviewOpen] = useState(false);
  const [sending, setSending] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const socketRef = useRef<Socket | null>(socket ?? null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const textInputRef = useRef<HTMLInputElement>(null);

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

  // Scroll only the messages container — never the page (avoids shaky/jumpy screens).
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages.length, typing]);

  const sendMessage = async (body: string, type: string = 'TEXT', caption?: string | null) => {
    if (!body.trim() || sending) return;
    setSending(true);
    try {
      await api.post(`/exchanges/${exchangeId}/messages`, { body, type, caption: caption || null });
      setText('');
      void qc.invalidateQueries({ queryKey: ['conversations'] });
      refetch();
    } catch (e) {
      if (e instanceof ApiError) console.error(e.message);
    } finally {
      setSending(false);
    }
  };

  const sendImage = async (body: string, caption?: string | null) => {
    await sendMessage(body, 'IMAGE', caption);
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
        try {
          setPendingImage(canvas.toDataURL('image/jpeg', 0.82));
        } catch {
          // fall back to the raw data URL if JPEG not supported
          setPendingImage(reader.result as string);
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

  const sendPending = async () => {
    if (!pendingImage || sending) return;
    const image = pendingImage;
    const caption = pendingCaption;
    setSending(true);
    await sendImage(image, caption);
    setSending(false);
    setPendingImage(null);
    setPendingCaption('');
    setReviewOpen(false);
  };

  const discardPending = () => {
    setPendingImage(null);
    setPendingCaption('');
    setReviewOpen(false);
  };

  return (
    <div className={`flex flex-col h-full min-h-0 w-full ${m.surface}`}>
      <div ref={scrollRef} className="flex-1 min-h-0 overflow-y-auto space-y-3 px-4 py-4">
        {messages.length === 0 && (
          <div className={`text-center text-sm ${m.muted} py-10`}>No messages yet. Say hello.</div>
        )}
        {messages.map((message) => {
          const mine = message.senderId === user?.id;
          return (
            <div key={message.id} className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
              <div
                className={`max-w-[78%] rounded-2xl px-4 py-2 shadow-sm ${mine ? m.bubbleMine : m.bubbleTheirs}`}
              >
                {message.type === 'IMAGE' ? (
                  <div>
                    <img
                      src={message.body}
                      alt={message.caption || 'Shared image'}
                      className="rounded-xl max-w-[300px] max-h-96 w-auto h-auto object-contain"
                    />
                    {message.caption && (
                      <div className="text-sm whitespace-pre-wrap break-words mt-1.5">{message.caption}</div>
                    )}
                  </div>
                ) : message.type === 'STICKER' ? (
                  <div className="text-5xl leading-none py-1">{message.body}</div>
                ) : (
                  <div className="text-sm whitespace-pre-wrap break-words">{message.body}</div>
                )}
                <div className={`text-[10px] mt-1 flex items-center justify-end gap-1 ${mine ? m.infoMine : m.infoTheirs}`}>
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

      <div className={`pt-3 px-4 pb-4 border-t ${m.rowBorder}`}>
        {pendingImage ? (
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
                onClick={() => {
                  const input = textInputRef.current;
                  if (!input) return;
                  // Focus the input, pop the system keyboard (Gboard), then re-focus so
                  // the keyboard stays attached. Users reach emoji via Gboard's smiley key.
                  input.focus({ preventScroll: true });
                  setTimeout(() => {
                    void showAndroidKeyboard().catch(() => {});
                    input.focus({ preventScroll: true });
                  }, 0);
                }}
                className={`w-9 h-9 rounded-full flex items-center justify-center ${m.iconBtn}`}
                aria-label="Open keyboard; use your system keyboard's emoji key for emoji"
                title="Open keyboard; use your system keyboard's emoji key for emoji"
              >
                <Smile className="w-5 h-5" />
              </button>
              <button
                type="button"
                onPointerDown={(e) => e.preventDefault()}
                onClick={() => cameraInputRef.current?.click()}
                className={`w-9 h-9 rounded-full flex items-center justify-center ${m.iconBtn}`}
                title="Take a photo"
              >
                <Camera className="w-5 h-5" />
              </button>
              <button
                type="button"
                onPointerDown={(e) => e.preventDefault()}
                onClick={() => fileInputRef.current?.click()}
                className={`w-9 h-9 rounded-full flex items-center justify-center ${m.iconBtn}`}
                title="Send an image"
              >
                <ImageIcon className="w-5 h-5" />
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
            </div>

            <input
              ref={textInputRef}
              className={`input flex-1 min-w-0 ${m.input} ${m.inputPlaceholder}`}
              placeholder="Type a message…"
              value={text}
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
            <button onClick={() => sendMessage(text)} className="btn-coral shrink-0">
              <Send className="w-4 h-4" />
            </button>
          </div>
        )}
      </div>

      {reviewOpen && pendingImage && (
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
              onClick={() => void sendPending()}
              disabled={sending}
              className="flex items-center gap-2 rounded-full bg-[#00a884] text-white text-sm font-semibold px-5 py-2.5 active:scale-95 disabled:opacity-60"
            >
              <Send className="w-4 h-4" /> {sending ? 'Sending…' : 'Send'}
            </button>
          </div>

          <div className="flex-1 min-h-0 flex items-center justify-center px-2">
            <img
              src={pendingImage}
              alt="Photo to send"
              className="max-w-full max-h-full w-auto h-auto object-contain"
            />
          </div>

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
                    void sendPending();
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
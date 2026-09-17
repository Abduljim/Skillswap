import { useEffect, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api, ApiError } from '../lib/api';
import { useAuth } from '../contexts/AuthContext';
import { Send, Smile, Check, CheckCheck, Camera, Image as ImageIcon, X } from 'lucide-react';
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
    const onMsg = () => {
      refetch();
      socket.emit('message:read', { exchangeId });
    };
    const onStatus = () => refetch();
    const onTyping = (data: { userId: string }) => {
      if (data.userId !== user?.id) setTyping(true);
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

  const sendMessage = async (body: string, type: string = 'TEXT') => {
    if (!body.trim()) return;
    try {
      await api.post(`/exchanges/${exchangeId}/messages`, { body, type });
      setText('');
      void qc.invalidateQueries({ queryKey: ['conversations'] });
      refetch();
    } catch (e) {
      if (e instanceof ApiError) console.error(e.message);
    }
  };

  const sendImage = async (body: string) => {
    await sendMessage(body, 'IMAGE');
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
    if (!pendingImage) return;
    await sendImage(pendingImage);
    setPendingImage(null);
    setText('');
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
                  <img src={message.body} alt="Shared image" className="rounded-xl max-w-[260px] max-h-64 object-cover" />
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

      <div className={`flex gap-2 pt-3 px-4 pb-4 border-t items-end ${m.rowBorder}`}>
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

        {pendingImage && (
          <div className={`flex items-center gap-2 pl-3 pr-1 py-2 border-t ${m.rowBorder}`}>
            <img src={pendingImage} alt="Photo to send" className="w-14 h-14 rounded-lg object-cover border" />
            <div className="flex-1 min-w-0">
              <div className={`text-sm font-semibold ${dark ? 'text-[#eef0f4]' : 'text-[#12131a]'}`}>Photo ready</div>
              <div className={`text-xs ${m.muted}`}>Tap Send to share it.</div>
            </div>
            <button
              type="button"
              onClick={() => setPendingImage(null)}
              className={`w-9 h-9 rounded-full flex items-center justify-center ${m.iconBtn}`}
              title="Remove photo"
            >
              <X className="w-5 h-5" />
            </button>
            <button type="button" onClick={() => void sendPending()} className="btn-coral text-sm px-4 py-2 shrink-0">
              <Send className="w-4 h-4" /> Send
            </button>
          </div>
        )}

        <input
          ref={textInputRef}
          className={`input flex-1 ${m.input} ${m.inputPlaceholder}`}
          placeholder="Type a message…"
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            socketRef.current?.emit('typing', { exchangeId });
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              if (pendingImage) void sendPending();
              else sendMessage(text);
            }
          }}
        />
        <button
          onClick={() => {
            if (pendingImage) void sendPending();
            else sendMessage(text);
          }}
          className="btn-coral shrink-0"
        >
          <Send className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
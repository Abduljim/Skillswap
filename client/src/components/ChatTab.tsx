import { useEffect, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api, ApiError } from '../lib/api';
import { useAuth } from '../contexts/AuthContext';
import { Send, Smile } from 'lucide-react';
import { Socket } from 'socket.io-client';
import { showAndroidKeyboard } from '../lib/keyboard-bridge';
import type { Message } from '../types';

export default function ChatTab({
  exchangeId,
  socket,
}: {
  exchangeId: string;
  socket?: Socket | null;
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
  const scrollRef = useRef<HTMLDivElement>(null);
  const socketRef = useRef<Socket | null>(socket ?? null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const textInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!socket) return;
    socketRef.current = socket;
    const onMsg = () => refetch();
    const onTyping = (data: { userId: string }) => {
      if (data.userId !== user?.id) setTyping(true);
      setTimeout(() => setTyping(false), 2000);
    };
    socket.on('message:new', onMsg);
    socket.on('typing', onTyping);
    return () => {
      socket.off('message:new', onMsg);
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

  const sendImage = async (file: File) => {
    if (file.size > 2 * 1024 * 1024) {
      return; // silently cap at 2MB
    }
    const reader = new FileReader();
    reader.onload = async () => {
      const dataUrl = reader.result as string;
      await sendMessage(dataUrl, 'IMAGE');
    };
    reader.readAsDataURL(file);
  };

  return (
    <div className="card flex flex-col h-full min-h-0">
      <div ref={scrollRef} className="flex-1 min-h-0 overflow-y-auto space-y-3 p-4">
        {messages.length === 0 && (
          <div className="text-center text-sm text-ink-500 py-8">No messages yet. Say hello.</div>
        )}
        {messages.map((m) => {
          const mine = m.senderId === user?.id;
          return (
            <div key={m.id} className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
              <div
                className={`max-w-[75%] rounded-2xl px-4 py-2 ${
                  mine ? 'bg-ink-900 text-cream-50' : 'bg-cream-100 text-ink-900'
                }`}
              >
                {m.type === 'IMAGE' ? (
                  <img src={m.body} alt="Shared image" className="rounded-xl max-w-[260px] max-h-64 object-cover" />
                ) : m.type === 'STICKER' ? (
                  <div className="text-5xl leading-none py-1">{m.body}</div>
                ) : (
                  <div className="text-sm whitespace-pre-wrap break-words">{m.body}</div>
                )}
                <div className={`text-[10px] mt-1 ${mine ? 'text-cream-300' : 'text-ink-500'}`}>
                  {m.type === 'IMAGE' && '📷 '}
                  {new Date(m.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </div>
              </div>
            </div>
          );
        })}
        {typing && <div className="text-xs text-ink-500 italic px-2">typing…</div>}
      </div>

      <div className="flex gap-2 pt-3 px-4 pb-4 border-t border-ink-100 items-end">
        <div className="relative flex items-center gap-1">
          <button
            type="button"
            onPointerDown={(e) => {
              e.preventDefault();
            }}
            onClick={() => {
              const input = textInputRef.current;
              if (!input) return;
              input.focus({ preventScroll: true });
              void showAndroidKeyboard().catch(() => {});
            }}
            className="w-9 h-9 rounded-full flex items-center justify-center text-lg hover:bg-cream-100 active:scale-90"
            aria-label="Open keyboard; use your system keyboard's emoji key for emoji"
            title="Open keyboard; use your system keyboard's emoji key for emoji"
          >
            <Smile className="w-5 h-5" />
          </button>
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="w-9 h-9 rounded-full flex items-center justify-center text-lg hover:bg-cream-100 active:scale-90"
            title="Send image"
          >
            📷
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              e.target.value = '';
              if (f) sendImage(f);
            }}
          />
        </div>
        <input
          ref={textInputRef}
          className="input flex-1"
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
    </div>
  );
}
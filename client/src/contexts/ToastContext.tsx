import { createContext, useContext, useState, useCallback, ReactNode } from 'react';
import { CheckCircle2, AlertCircle, Info, X } from 'lucide-react';

type ToastType = 'success' | 'error' | 'info';

interface Toast {
  id: number;
  type: ToastType;
  title: string;
  body?: string;
}

interface ToastContextValue {
  push: (t: { type: ToastType; title: string; body?: string }) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const push = useCallback((t: { type: ToastType; title: string; body?: string }) => {
    const id = Date.now() + Math.random();
    setToasts((cur) => [...cur, { ...t, id }]);
    setTimeout(() => {
      setToasts((cur) => cur.filter((x) => x.id !== id));
    }, 4000);
  }, []);

  return (
    <ToastContext.Provider value={{ push }}>
      {children}
      <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 max-w-sm w-[calc(100%-2rem)]">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={`card animate-slide-up p-4 flex items-start gap-3 ${
              t.type === 'success'
                ? 'border-mint-200'
                : t.type === 'error'
                ? 'border-coral-300'
                : 'border-ink-200'
            }`}
          >
            {t.type === 'success' && <CheckCircle2 className="w-5 h-5 text-mint-500 shrink-0" />}
            {t.type === 'error' && <AlertCircle className="w-5 h-5 text-coral-500 shrink-0" />}
            {t.type === 'info' && <Info className="w-5 h-5 text-ink-500 shrink-0" />}
            <div className="flex-1 min-w-0">
              <div className="font-semibold text-sm text-ink-900">{t.title}</div>
              {t.body && <div className="text-xs text-ink-600 mt-0.5">{t.body}</div>}
            </div>
            <button
              onClick={() => setToasts((cur) => cur.filter((x) => x.id !== t.id))}
              className="text-ink-400 hover:text-ink-700"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used inside ToastProvider');
  return ctx;
}
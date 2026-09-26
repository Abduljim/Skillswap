import { useEffect, useMemo, useState } from 'react';
import { Keyboard, Send } from 'lucide-react';

/**
 * In-app emoji panel.
 *
 * Why this exists instead of "open the keyboard's emoji tab": there is no public
 * Android API that forces an IME into its emoji panel. Gboard has one, Samsung
 * has one, and neither can be told to show it — the old button could only focus
 * the input and hope the user found the smiley key on their own keyboard, which
 * is exactly what felt broken. WhatsApp and Telegram ship their own panel for
 * the same reason.
 *
 * Everything here is plain Unicode rendered by the system emoji font: no image
 * assets, no sprite sheet, works offline inside the APK, and it looks native on
 * every device because it IS the device's own emoji.
 *
 * The panel replaces the keyboard rather than stacking on top of it, and it is a
 * fixed height with its own internal scroll, so opening it cannot shift or shake
 * the message list.
 */

const RECENT_KEY = 'skillswap_emoji_recent';
const RECENT_MAX = 22;

/** Curated sets — the ones people actually send in a chat, not the full 3,600. */
const CATEGORIES: { id: string; label: string; icon: string; emoji: string[] }[] = [
  {
    id: 'recent',
    label: 'Recent',
    icon: '🕘',
    emoji: [],
  },
  {
    id: 'smileys',
    label: 'Faces',
    icon: '🙂',
    emoji: [
      '😀', '😃', '😄', '😁', '😆', '😅', '🤣', '😂', '🙂', '🙃',
      '😉', '😊', '😇', '🥰', '😍', '🤩', '😘', '😗', '😚', '😙',
      '🥲', '😋', '😛', '😜', '🤪', '🤨', '🧐', '🤓', '😎', '🥸',
      '🤗', '🤔', '🤭', '🥱', '😴', '😪', '😷', '🤒', '🤕', '🤢',
      '😵', '🤯', '🥳', '🥺', '😢', '😭', '😤', '😠', '😡', '🤬',
      '😈', '👿', '💀', '☠️', '💩', '🤡', '👹', '👺', '👻', '👽',
    ],
  },
  {
    id: 'gestures',
    label: 'Hands',
    icon: '👍',
    emoji: [
      '👋', '🤚', '🖐️', '✋', '🖖', '👌', '🤌', '🤏', '✌️', '🤞',
      '🤟', '🤘', '🤙', '👈', '👉', '👆', '🖕', '👇', '☝️', '👍',
      '👎', '✊', '👊', '🤛', '🤜', '👏', '🙌', '👐', '🤲', '🤝',
      '🙏', '💪', '🦾', '👀', '👁️', '🧠', '❤️', '🧡', '💛', '💚',
      '💙', '💜', '🖤', '🤍', '🤎', '💔', '❣️', '💕', '💞', '💓',
      '💗', '💖', '💘', '💝', '💯', '🔥', '✨', '⭐', '🌟', '💫',
    ],
  },
  {
    id: 'people',
    label: 'People',
    icon: '🧑',
    emoji: [
      '🧑', '👨', '👩', '🧒', '👦', '👧', '👶', '🧓', '👴', '👵',
      '👮', '🕵️', '💂', '👷', '🤴', '👸', '👳', '👲', '🧕', '🤵',
      '👰', '🤰', '🤱', '👼', '🎅', '🤶', '🦸', '🦹', '🧙', '🧚',
      '🧛', '🧜', '🧝', '🙋', '🙇', '💁', '🙅', '🙆', '🙎', '🙍',
      '👨‍🏫', '👩‍🎓', '👨‍🎓', '👩‍💻', '👨‍💻', '👩‍🎨', '👨‍🍳', '👩‍⚕️', '👨‍🔧', '👩‍🌾',
    ],
  },
  {
    id: 'activity',
    label: 'Study & play',
    icon: '📚',
    emoji: [
      '📚', '📖', '📝', '✏️', '🖊️', '📐', '📏', '🧮', '🔬', '🔭',
      '🧪', '🧫', '💻', '⌨️', '🖥️', '📱', '🎓', '🏫', '🎒', '🗂️',
      '📊', '📈', '🗓️', '⏰', '⌛', '💡', '🔦', '🧰', '🛠️', '⚙️',
      '🎨', '🎬', '🎤', '🎧', '🎼', '🎹', '🥁', '🎸', '🎺', '🎻',
      '⚽', '🏀', '🏈', '⚾', '🎾', '🏐', '🏆', '🥇', '🎯', '🎮',
    ],
  },
  {
    id: 'food',
    label: 'Food',
    icon: '🍲',
    emoji: [
      '🍎', '🍊', '🍋', '🍌', '🍉', '🍇', '🍓', '🫐', '🍈', '🍒',
      '🍑', '🥭', '🍍', '🥥', '🥝', '🍅', '🥑', '🌽', '🥕', '🧄',
      '🍞', '🥐', '🥖', '🧀', '🍗', '🍖', '🌭', '🍔', '🍟', '🍕',
      '🌮', '🌯', '🥙', '🍜', '🍲', '🍛', '🍣', '🍤', '🍦', '🍰',
      '🎂', '🍫', '🍬', '☕', '🍵', '🧃', '🥤', '🍺', '🍻', '🥂',
    ],
  },
  {
    id: 'nature',
    label: 'Nature',
    icon: '🌿',
    emoji: [
      '🐶', '🐱', '🐭', '🐹', '🐰', '🦊', '🐻', '🐼', '🐨', '🐯',
      '🦁', '🐮', '🐷', '🐸', '🐵', '🐔', '🐧', '🐦', '🦆', '🦅',
      '🦉', '🦇', '🐺', '🐗', '🐴', '🦄', '🐝', '🐛', '🦋', '🐌',
      '🐞', '🐢', '🐍', '🦖', '🐙', '🦀', '🐠', '🐬', '🦈', '🐘',
      '🌵', '🌲', '🌳', '🌴', '🌱', '🌿', '☘️', '🍀', '🌾', '🌺',
      '🌸', '🌼', '🌻', '🌹', '🥀', '🍄', '🌍', '🌙', '⭐', '⚡',
    ],
  },
  {
    id: 'symbols',
    label: 'Marks',
    icon: '✅',
    emoji: [
      '✅', '❌', '❓', '❗', '‼️', '⭕', '🔴', '🟠', '🟡', '🟢',
      '🔵', '🟣', '⚫', '⚪', '🔶', '🔷', '✔️', '☑️', '🔘', '🔳',
      '➕', '➖', '➗', '✖️', '💲', '🔞', '📵', '🚫', '♻️', '🔚',
      '🔜', '⏳', '🔔', '🔕', '💬', '💭', '🗯️', '📌', '📍', '🔒',
      '🔓', '🔑', '🚩', '🏁', '⚠️', '🆗', '🆕', '🔝', '💤', '🎉',
    ],
  },
];

function readRecent(): string[] {
  try {
    const raw = localStorage.getItem(RECENT_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((e) => typeof e === 'string').slice(0, RECENT_MAX) : [];
  } catch {
    return [];
  }
}

function writeRecent(list: string[]): void {
  try {
    localStorage.setItem(RECENT_KEY, JSON.stringify(list.slice(0, RECENT_MAX)));
  } catch {
    // Private mode or a full quota — recents are a convenience, not a feature.
  }
}

export default function EmojiPicker({
  dark,
  onInsert,
  onSendBig,
  onClose,
}: {
  dark?: boolean;
  /** Append an emoji at the composer's cursor. */
  onInsert: (emoji: string) => void;
  /** Send a single emoji as a full-size sticker message. */
  onSendBig: (emoji: string) => void;
  onClose: () => void;
}) {
  const [recent, setRecent] = useState<string[]>(() => readRecent());
  const [category, setCategory] = useState<string>(recent.length ? 'recent' : 'smileys');
  const [big, setBig] = useState(false);

  const cats = useMemo(
    () => CATEGORIES.map((c) => (c.id === 'recent' ? { ...c, emoji: recent } : c)),
    [recent],
  );
  const active = cats.find((c) => c.id === category) ?? cats[1]!;

  // If recents empty out, do not strand the user on an empty tab.
  useEffect(() => {
    if (category === 'recent' && recent.length === 0) setCategory('smileys');
  }, [category, recent.length]);

  const choose = (emoji: string) => {
    setRecent((prev) => {
      const next = [emoji, ...prev.filter((e) => e !== emoji)].slice(0, RECENT_MAX);
      writeRecent(next);
      return next;
    });
    if (big) onSendBig(emoji);
    else onInsert(emoji);
  };

  const c = dark
    ? {
        panel: 'bg-[#12151d] border-[#1f2430]',
        tabIdle: 'text-[#76819a]',
        tabActive: 'bg-[#1f2430] text-[#eef0f4]',
        tile: 'hover:bg-[#1a1e29] active:bg-[#232838]',
        label: 'text-[#a5abba]',
        toggleOn: 'bg-[#fb4f1d] text-white',
        toggleOff: 'bg-[#1a1e29] text-[#a5abba]',
      }
    : {
        panel: 'bg-white border-[#e2dcd1]',
        tabIdle: 'text-[#8a8a8f]',
        tabActive: 'bg-[#f2ede4] text-[#12131a]',
        tile: 'hover:bg-[#f5f2ec] active:bg-[#ece5d8]',
        label: 'text-[#8a8a8f]',
        toggleOn: 'bg-[#fb4f1d] text-white',
        toggleOff: 'bg-[#f5f2ec] text-[#8a8a8f]',
      };

  return (
    <div
      className={`shrink-0 border-t ${c.panel}`}
      style={{ height: 272 }}
      role="group"
      aria-label="Emoji picker"
    >
      {/* Row 1: how a tap behaves, and how to get the keyboard back. Fixed
          heights throughout so opening this panel cannot reflow the list. */}
      <div className="flex items-center gap-2 px-3 h-11 shrink-0">
        <button
          type="button"
          onClick={() => setBig((b) => !b)}
          aria-pressed={big}
          title={big ? 'Tap sends a big emoji' : 'Tap inserts into your message'}
          className={`flex items-center gap-1.5 rounded-full px-3 h-7 text-[11px] font-semibold transition-colors ${
            big ? c.toggleOn : c.toggleOff
          }`}
        >
          <Send className="w-3 h-3" /> {big ? 'Big emoji' : 'Insert'}
        </button>
        <span className={`text-[11px] ${c.label} min-w-0 flex-1 truncate`}>
          {big ? 'Tap an emoji to send it full size' : 'Tap to add it to your message'}
        </span>
        <button
          type="button"
          onClick={onClose}
          aria-label="Back to the keyboard"
          title="Back to the keyboard"
          className={`shrink-0 w-8 h-8 rounded-full flex items-center justify-center ${c.tile} ${c.tabIdle}`}
        >
          <Keyboard className="w-4 h-4" />
        </button>
      </div>

      {/* Row 2: the grid. This is the only scrolling element in the panel, and
          its overscroll is contained so it never drags the page. */}
      <div className="h-[196px] overflow-y-auto overscroll-contain touch-pan-y px-1.5">
        {active.emoji.length === 0 ? (
          <div className={`h-full flex items-center justify-center text-xs ${c.label}`}>
            Emoji you use will collect here.
          </div>
        ) : (
          <div className="grid grid-cols-8 gap-0.5 pb-2">
            {active.emoji.map((e, i) => (
              <button
                key={`${e}-${i}`}
                type="button"
                onClick={() => choose(e)}
                className={`h-11 rounded-lg flex items-center justify-center text-[26px] leading-none transition-colors ${c.tile}`}
                aria-label={e}
              >
                {e}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Row 3: categories. A grid, not a horizontal scroller — same reason the
          conversation tabs are a grid: a scrollable strip reads as the screen
          sliding. */}
      <div className="grid grid-cols-7 gap-0.5 px-1.5 h-[52px] shrink-0 items-center">
        {cats
          .filter((cat) => cat.id !== 'recent' || cat.emoji.length > 0)
          .map((cat) => (
            <button
              key={cat.id}
              type="button"
              onClick={() => setCategory(cat.id)}
              aria-pressed={cat.id === active.id}
              title={cat.label}
              className={`h-9 rounded-lg flex items-center justify-center text-[19px] leading-none transition-colors ${
                cat.id === active.id ? c.tabActive : `${c.tabIdle} ${c.tile}`
              }`}
            >
              {cat.icon}
            </button>
          ))}
      </div>
    </div>
  );
}

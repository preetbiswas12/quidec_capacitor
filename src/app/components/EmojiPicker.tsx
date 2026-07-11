import { useState, useRef, useEffect, useMemo } from 'react';
import { Search, X } from 'lucide-react';

const EMOJI_CATEGORIES: Record<string, string[]> = {
  'Recent': [],
  'Smileys': ['😀','😃','😄','😁','😆','😅','🤣','😂','🙂','😊','😇','🥰','😍','🤩','😘','😗','😚','😙','🥲','😋','😛','😜','🤪','😝','🤑','🤗','🤭','🤫','🤔','🤐','🤨','😐','😑','😶','😏','😒','🙄','😬','😌','😔','😪','🤤','😴','😷','🤒','🤕','🤢','🤮','🥵','🥶','🥴','😵','🤯','🤠','🥳','🥸','😎','🤓','🧐','😳','🥺','🥹','😱','😨','😰','😥','😢','😭','😤','😡','🤬','😈','👿','💀','☠️','🤡','👻','👽','🤖','😺','😸','😹','😻','😼','😽','🙀','😿','😾'],
  'People': ['👋','🤚','🖐️','✋','🖖','👌','🤌','🤏','✌️','🤞','🤟','🤘','🤙','👈','👉','👆','🖕','👇','☝️','👍','👎','✊','👊','🤛','🤜','👏','🙌','👐','🤲','🤝','🙏','💪','🦾','🦿','🦵','🦶','👂','🦻','👃','🧠','🫀','🦷','🦴','👀','👁️','👅','👄'],
  'Animals': ['🐶','🐱','🐭','🐹','🐰','🦊','🐻','🐼','🐨','🐯','🦁','🐮','🐷','🐽','🐸','🐵','🙈','🙉','🙊','🐒','🐔','🐧','🐦','🐤','🐣','🐥','🦆','🦅','🦉','🦇','🐺','🐗','🐴','🦄','🐝','🪱','🐛','🦋','🐌','🐞','🐜','🦟','🦗','🕷️','🦂','🐢','🐍','🦎','🦖','🦕','🐙','🦑','🦐','🦞','🦀','🐡','🐠','🐟','🐬','🐳','🐋','🦈','🐊'],
  'Food': ['🍏','🍎','🍐','🍊','🍋','🍌','🍉','🍇','🍓','🫐','🍈','🍒','🍑','🥭','🍍','🥥','🥝','🍅','🥑','🍆','🥔','🥕','🌽','🌶️','🫑','🥒','🥬','🥦','🧄','🧅','🍄','🥜','🫘','🌰','🍞','🥐','🥖','🥨','🥯','🥞','🧇','🧀','🍖','🍗','🥩','🥓','🍔','🍟','🍕','🌭','🥪','🌮','🌯','🫔','🥙','🧆','🥚','🍳','🥘','🍲','🫕','🥣','🥗','🍿','🧈','🧂','🥫','🍱','🍘','🍙','🍚','🍛','🍜','🍝','🍠','🍢','🍣','🍤','🍥','🥮','🍡','🥟','🥠','🥡','🦀','🦞','🦐','🦑','🍦','🍧','🍨','🍩','🍪','🎂','🍰','🧁','🥧','🍫','🍬','🍭','🍮','🍯','🍼','🥛','☕','🫖','🍵','🍶','🍾','🍷','🍸','🍹','🍺','🍻','🥂','🥃','🫗','🥤','🧋','🧃','🧉','🧊'],
  'Activities': ['⚽','🏀','🏈','⚾','🥎','🎾','🏐','🏉','🥏','🎱','🏓','🏸','🏒','🥅','⛳','🪁','🏹','🎣','🤿','🥊','🥋','🎽','🛹','🛼','🛷','⛸️','🥌','🎿','🎯','🪃','🏆','🥇','🥈','🥉','🏅','🎖️','🏵️','🎗️','🎪','🤹','🎭','🩰','🎨','🎬','🎤','🎧','🎼','🎹','🥁','🪘','🎷','🎺','🪗','🎸','🪕','🎻','🎲','♟️','🎯','🎳','🎮','🕹️'],
  'Travel': ['🚗','🚕','🚌','🏎️','🚓','🚑','🚒','🚐','🛻','🚚','🚛','🚜','🛵','🏍️','🛺','🚲','🛴','🛹','🛼','🚁','✈️','🛩️','🛫','🛬','🪂','💺','🚀','🛸','🚢','⛴️','🛥️','🛶','⛵','🌊','🗺️','🧭','🏔️','⛰️','🌋','🗻','🏕️','🏖️','🏜️','🏝️','🏞️','🏟️','🏛️','🏗️','🧱','🪨','🛖','🏠','🏡','🏘️','🏚️','🏗️','🏭','🏢','🏬','🏣','🏤','🏥','🏦','🏨','🏪','🏫','🏩','💒','🏛️','⛪','🕌','🛕','🕍','⛩️','🕋','⛲','⛺','🌁','🌃','🏙️','🌄','🌅','🌆','🌇','🌉','🌌'],
  'Objects': ['⌚','📱','💻','⌨️','🖥️','🖨️','🖱️','🖲️','🕹️','🗜️','💽','💾','💿','📀','📷','📸','📹','🎥','📽️','🎞️','📞','☎️','📟','📠','📺','📻','🎙️','🎚️','🎛️','🧭','⏱️','⏲️','⏰','🕰️','📡','🔋','🔌','💡','🔦','🕯️','🪔','🧯','🛢️','💸','💵','💴','💶','💷','🪙','💰','💳','🧾','💎','⚖️','🪜','🧰','🪛','🔧','🔨','⚒️','🛠️','⛏️','🪚','🔩','⚙️','🪤','🧱','⛓️','🧲','🔫','💣','🧨','🪓','🔪','🗡️','⚔️','🛡️','🚬','⚰️','🪦','⚱️','🏺','🔮','📿','🧿','💈','⚗️','🔭','🔬','🕳️','🩹','🩺','🩻','🩼','💊','💉','🩸','🧬','🧫','🧪','🌡️','🧹','🪠','🧺','🧻','🚽','🚰','🚿','🛁','🛀','🧼','🫧','🪥','🪒','🧽','🪣','🧴','🛎️','🔑','🗝️','🚪','🪑','🛋️','🛏️','🛌','🧸','🪆','🖼️','🪞','🪟','🛍️','🛒','🎁','🎈','🎏','🪅','🪩','🎐','🧧','🎀','🪄','🎫','🎟️','🎪','🎭','🩰','🎨','🎬','🎤','🎧','🎼','🎹','🥁','🪘','🎷','🎺','🪗','🎸','🪕','🎻','🎲','♟️','🎯','🎳','🎮','🕹️'],
  'Symbols': ['❤️','🧡','💛','💚','💙','💜','🖤','🤍','🤎','💔','❤️‍🔥','❤️‍🩹','❣️','💕','💞','💓','💗','💖','💘','💝','💟','☮️','✝️','☪️','🕉️','☸️','✡️','🔯','🕎','☯️','☦️','🛐','⛎','♈','♉','♊','♋','♌','♍','♎','♏','♐','♑','♒','♓','🆔','⚛️','🉑','☢️','☣️','📴','📳','🈶','🈚','🈸','🈺','🈷️','✴️','🆚','💮','🉐','㊙️','㊗️','🈴','🈵','🈹','🈲','🅰️','🅱️','🆎','🆑','🅾️','🆘','❌','⭕','🛑','⛔','📛','🚫','💯','💢','♨️','🚷','🚯','🚳','🚱','🔞','📵','🚭','❗','❕','❓','❔','‼️','⁉️','🔅','🔆','〽️','⚠️','🚸','🔱','⚜️','🔰','♻️','✅','🈯','💹','❇️','✳️','❎','🌐','💠','Ⓜ️','🌀','💤','🏧','🚾','♿','🅿️','🛗','🈳','🈂️','🛂','🛃','🛄','🛅','🚹','🚺','🚼','⚧️','🚻','🚮','🎦','📶','🈁','🔣','ℹ️','🔤','🔡','🔠','🆖','🆗','🆙','🆒','🆕','🆓','0️⃣','1️⃣','2️⃣','3️⃣','4️⃣','5️⃣','6️⃣','7️⃣','8️⃣','9️⃣','🔟','🔢','#️⃣','*️⃣','⏏️','▶️','⏸️','⏯️','⏹️','⏺️','⏭️','⏮️','⏩','⏪','⏫','⏬','◀️','🔼','🔽','➡️','⬅️','⬆️','⬇️','↗️','↘️','↙️','↖️','↕️','↔️','↪️','↩️','⤴️','⤵️','🔀','🔁','🔂','🔄','🔃','🎵','🎶','➕','➖','➗','✖️','🟰','♾️','💲','💱','™️','©️','®️','〰️','➰','➿','🔚','🔙','🔛','🔝','🔜','✔️','☑️','🔘','🔴','🟠','🟡','🟢','🔵','🟣','⚫','⚪','🟤','🔺','🔻','🔸','🔹','🔶','🔷','🔳','🔲','▪️','▫️','◾','◽','◼️','◻️','🟥','🟧','🟨','🟩','🟦','🟪','⬛','⬜','🟫','🔈','🔇','🔉','🔊','🔔','🔕','📣','📢','💬','💭','🗯️','♠️','♣️','♥️','♦️','🃏','🎴','🀄','🕐','🕑','🕒','🕓','🕔','🕕','🕖','🕗','🕘','🕙','🕚','🕛','🕜','🕝','🕞','🕟','🕠','🕡','🕢','🕣','🕤','🕥','🕦','🕧'],
  'Flags': ['🏁','🚩','🎌','🏴','🏳️','🏳️‍🌈','🏳️‍⚧️','🏴‍☠️','🇺🇸','🇬🇧','🇫🇷','🇩🇪','🇮🇹','🇪🇸','🇯🇵','🇰🇷','🇨🇳','🇮🇳','🇧🇷','🇷🇺','🇨🇦','🇦🇺','🇲🇽','🇿🇦','🇳🇬','🇪🇬','🇸🇦','🇦🇪','🇹🇷','🇮🇩','🇵🇰','🇧🇩','🇻🇳','🇹🇭','🇵🇭','🇲🇾','🇸🇬','🇳🇿','🇮🇪','🇳🇱','🇧🇪','🇨🇭','🇦🇹','🇸🇪','🇳🇴','🇩🇰','🇫🇮','🇵🇱','🇺🇦','🇨🇿','🇷🇴','🇭🇺','🇬🇷','🇵🇹','🇮🇱','🇦🇷','🇨🇴','🇨🇱','🇵🇪','🇪🇨','🇻🇪','🇧🇴','🇵🇾','🇺🇾','🇨🇺','🇯🇲','🇹🇹','🇭🇹','🇩🇴','🇵🇦','🇨🇷','🇳🇮','🇭🇳','🇸🇻','🇬🇹','🇧🇿','🇭🇰','🇹🇼','🇲🇴','🇦🇫','🇮🇷','🇮🇶','🇸🇾','🇱🇧','🇯🇴','🇮🇱','🇵🇸','🇾🇪','🇴🇲','🇦🇲','🇦🇿','🇬🇪','🇰🇿','🇺🇿','🇹🇲','🇰🇬','🇹🇯','🇲🇳','🇧🇹','🇳🇵','🇱🇰','🇲🇲','🇰🇭','🇱🇦'],
};

const CATEGORY_ICONS: Record<string, string> = {
  'Recent': '🕐',
  'Smileys': '😀',
  'People': '👋',
  'Animals': '🐶',
  'Food': '🍕',
  'Activities': '⚽',
  'Travel': '✈️',
  'Objects': '💡',
  'Symbols': '❤️',
  'Flags': '🏁',
};

function getRecentEmojis(): string[] {
  try {
    const stored = localStorage.getItem('quidec_recent_emojis');
    return stored ? JSON.parse(stored) : [];
  } catch { return []; }
}

function saveRecentEmoji(emoji: string) {
  try {
    let recent = getRecentEmojis();
    recent = recent.filter(e => e !== emoji);
    recent.unshift(emoji);
    if (recent.length > 24) recent = recent.slice(0, 24);
    localStorage.setItem('quidec_recent_emojis', JSON.stringify(recent));
  } catch { /* ignore */ }
}

export default function EmojiPicker({ onSelect, onClose }: { onSelect: (emoji: string) => void; onClose: () => void }) {
  const [activeCategory, setActiveCategory] = useState('Recent');
  const [search, setSearch] = useState('');
  const [recentEmojis, setRecentEmojis] = useState<string[]>(getRecentEmojis);
  const gridRef = useRef<HTMLDivElement>(null);

  useEffect(() => { setRecentEmojis(getRecentEmojis()); }, []);

  const categories = Object.keys(EMOJI_CATEGORIES);

  const filteredEmojis = useMemo(() => {
    if (search.trim()) {
      const q = search.toLowerCase();
      const all: string[] = [];
      for (const [, emojis] of Object.entries(EMOJI_CATEGORIES)) {
        all.push(...emojis);
      }
      return all.filter(e => e.includes(q) || true).slice(0, 120);
    }
    if (activeCategory === 'Recent') return recentEmojis;
    return EMOJI_CATEGORIES[activeCategory] || [];
  }, [activeCategory, search, recentEmojis]);

  const handleSelect = (emoji: string) => {
    saveRecentEmoji(emoji);
    setRecentEmojis(getRecentEmojis());
    onSelect(emoji);
  };

  return (
    <div className="bg-wa-menu-bg border-t border-wa-border/30 flex flex-col" style={{ height: '320px' }}>
      <div className="flex items-center gap-2 px-3 py-2 border-b border-wa-border/20">
        <div className="flex-1 flex items-center gap-2 bg-wa-secondary/50 rounded-lg px-3 py-1.5">
          <Search size={15} className="text-wa-text-muted shrink-0" />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search emoji"
            className="flex-1 bg-transparent outline-none text-wa-primary placeholder:text-wa-text-muted text-sm"
          />
          {search && <button onClick={() => setSearch('')}><X size={14} className="text-wa-text-muted" /></button>}
        </div>
        <button onClick={onClose} className="p-1.5 hover:bg-wa-secondary/50 rounded-lg transition-colors">
          <X size={16} className="text-wa-text-muted" />
        </button>
      </div>

      <div className="flex border-b border-wa-border/20 overflow-x-auto no-scrollbar">
        {categories.map(cat => (
          <button
            key={cat}
            onClick={() => { setActiveCategory(cat); setSearch(''); }}
            className={`px-3 py-2 text-base shrink-0 transition-colors ${activeCategory === cat && !search ? 'border-b-2 border-wa-accent' : 'opacity-50 hover:opacity-80'}`}
          >
            {CATEGORY_ICONS[cat]}
          </button>
        ))}
      </div>

      <div ref={gridRef} className="flex-1 overflow-y-auto p-2">
        {filteredEmojis.length === 0 ? (
          <p className="text-wa-text-muted text-sm text-center py-8">No emojis found</p>
        ) : (
          <div className="grid grid-cols-8 gap-0.5">
            {filteredEmojis.map((emoji, i) => (
              <button
                key={`${emoji}-${i}`}
                onClick={() => handleSelect(emoji)}
                className="text-2xl p-1.5 rounded-lg hover:bg-wa-secondary/50 active:scale-125 transition-all duration-100 flex items-center justify-center"
              >
                {emoji}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

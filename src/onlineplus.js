
import { io } from 'socket.io-client';

const STORE_KEY = 'glass-chess-online-plus-v1';
const CLIENT_ID_KEY = 'glass-chess-online-client-id';
function getClientIdentity() {
  try {
    let id = localStorage.getItem(CLIENT_ID_KEY);
    if (!/^[a-f0-9-]{32,36}$/i.test(id || '')) {
      id = window.crypto?.randomUUID?.();
      if (!id) {
        const bytes = new Uint8Array(16);
        window.crypto.getRandomValues(bytes);
        id = Array.from(bytes, value => value.toString(16).padStart(2, '0')).join('');
      }
      localStorage.setItem(CLIENT_ID_KEY, id);
    }
    return id;
  } catch {
    const bytes = new Uint8Array(16);
    try { window.crypto.getRandomValues(bytes); }
    catch { for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256); }
    return Array.from(bytes, value => value.toString(16).padStart(2, '0')).join('');
  }
}
const CLIENT_ID = getClientIdentity();
const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
const GLYPHS = new Set(['♔','♕','♖','♗','♘','♙','♚','♛','♜','♝','♞','♟']);
const SKINS = [
  { id: 'royal', name: 'Royal Gold', unlock: 0, icon: '♕', desc: 'Ivory and gold with polished depth.' },
  { id: 'obsidian', name: 'Obsidian', unlock: 100, icon: '♚', desc: 'Dark steel with a cool silver edge.' },
  { id: 'neon', name: 'Neon Pulse', unlock: 250, icon: '♘', desc: 'Electric cyan and violet glow.' },
  { id: 'crimson', name: 'Crimson', unlock: 450, icon: '♜', desc: 'Pearl white against a ruby finish.' },
  { id: 'frost', name: 'Frost', unlock: 700, icon: '♗', desc: 'Icy platinum and blue highlights.' }
];
const SKIN_COLORS = {
  royal: { white: "#f3e2b5", black: "#1a2639" },
  obsidian: { white: "#dbe5f5", black: "#151c2a" },
  neon: { white: "#aefaff", black: "#8c5bdf" },
  crimson: { white: "#f4f2ed", black: "#7a2038" },
  frost: { white: "#eaf5ff", black: "#547999" }
};
const AVATARS = ['♟', '♞', '♜', '♛', '♚', '⚡', '🐉', '🦊', '🦅', '🐺'];
const BANNERS = [
  { id: 'aurora', label: 'Aurora', css: 'linear-gradient(120deg,#152a4f,#315e79 48%,#986bb3)' },
  { id: 'ember', label: 'Ember', css: 'linear-gradient(120deg,#351b28,#9a3f38 55%,#e0a55c)' },
  { id: 'emerald', label: 'Emerald', css: 'linear-gradient(120deg,#102e29,#276b56 55%,#a2ae6c)' },
  { id: 'royal', label: 'Royal', css: 'linear-gradient(120deg,#201b3f,#50438a 55%,#c4a0dc)' },
  { id: 'glacier', label: 'Glacier', css: 'linear-gradient(120deg,#183448,#4c8da5 55%,#c7edf0)' }
];
const PERSONALITIES = {
  balanced: { label: 'Balanced', level: 10, depth: 12, note: 'A steady all-round opponent.' },
  aggressive: { label: 'Aggressive', level: 17, depth: 13, note: 'Higher strength setting; favors sharper, forcing play when Stockfish finds it.' },
  defensive: { label: 'Defensive', level: 14, depth: 14, note: 'A steadier, stronger setting; prefers reliable engine choices.' },
  positional: { label: 'Positional', level: 15, depth: 15, note: 'A deeper setting for longer-term plans. These are strength presets, not separate AI models.' }
};
const DAILY_CHALLENGES = [
  { fen: '6k1/5ppp/8/8/8/8/5PPP/4R1K1 w - - 0 1', solution: 'e1e8', notation: 'Re8#', title: 'The open file', text: 'White to move. Slide the rook up the e-file for mate in one.' },
  { fen: '7k/5Qpp/8/8/8/8/8/K7 w - - 0 1', solution: 'f7f8', notation: 'Qf8#', title: 'Queen finish', text: 'White to move. Find the queen move that traps the king.' },
  { fen: '7k/8/5KQ1/8/8/8/8/8 w - - 0 1', solution: 'g6g7', notation: 'Qg7#', title: 'Protected queen', text: 'White to move. Deliver mate with the queen protected by your king.' }
];
const DAILY_MISSIONS = [
  { id: 'moves', label: 'Play 8 legal moves', target: 8, xp: 30 },
  { id: 'puzzle', label: 'Solve a training puzzle', target: 1, xp: 40 },
  { id: 'review', label: 'Review one completed game', target: 1, xp: 40 }
];
const ACHIEVEMENTS = [
  { id: 'first-move', title: 'First Steps', description: 'Make your first move in Glass Chess.', icon: '♙', xp: 25 },
  { id: 'first-puzzle', title: 'Tactical Mind', description: 'Solve your first engine puzzle.', icon: '✦', xp: 50 },
  { id: 'first-mate', title: 'Checkmate!', description: 'Finish a game by checkmate.', icon: '♛', xp: 75 },
  { id: 'ten-games', title: 'Regular at the Board', description: 'Finish ten games.', icon: '🏆', xp: 100 },
  { id: 'five-friends', title: 'Club Founder', description: 'Add five friends to your local friends list.', icon: '♟', xp: 60 },
  { id: 'daily-three', title: 'Daily Discipline', description: 'Complete all three daily missions.', icon: '☀️', xp: 80 },
  { id: 'online-game', title: 'Connected', description: 'Join an online game room.', icon: '🌐', xp: 50 },
  { id: 'daily-challenge', title: 'Puzzle of the Day', description: 'Solve the daily mate-in-one challenge.', icon: '⚔️', xp: 60 }
];

let api;
let root;
let state;
let socket = null;
let online = { code: '', role: '', side: '', resumeToken: '', lastState: null, syncing: false, previousMode: 'computer', previousColor: 'white' };
let dailyChallenge = { active: false, solution: '', notation: '', solved: false, rewardEligible: false };
let finishedFen = '';
let pieceObserver = null;
let victoryKey = '';
let victoryPresentationTimer = null;
let previousVictoryFocus = null;
let socketBound = false;
let matchmakingActive = false;
let matchmakingGeneration = 0;
let onlineRequestActive = false;
let onlineRequestGeneration = 0;
let offlineIntent = false;
let toastTimer = null;
let lastCheckToastPly = 0;

function todayKey() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function defaultState() {
  return {
    name: 'Player', avatar: '♞', banner: 'aurora', xp: 0, pieceSkin: 'custom', pieceSkinVersion: 2,
    personality: 'balanced', animations: true, sound: true, friends: [], achievements: [],
    missionDay: todayKey(), missionProgress: { moves: 0, puzzle: 0, review: 0 }, missionClaimed: [],
    lastChallenge: '',
  };
}

function loadState() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORE_KEY) || '{}') || {};
    const value = { ...defaultState(), ...saved };
    // Older builds applied a default Royal skin after the board loaded. Treat that old
    // default as custom so it cannot unexpectedly replace the user's saved appearance.
    if (saved.pieceSkinVersion !== 2) {
      value.pieceSkin = 'custom';
      value.pieceSkinVersion = 2;
    }
    if (!Array.isArray(value.friends)) value.friends = [];
    if (!Array.isArray(value.achievements)) value.achievements = [];
    if (!Array.isArray(value.missionClaimed)) value.missionClaimed = [];
    if (!value.missionProgress || typeof value.missionProgress !== 'object') value.missionProgress = { moves: 0, puzzle: 0, review: 0 };
    if (value.missionDay !== todayKey()) {
      value.missionDay = todayKey();
      value.missionProgress = { moves: 0, puzzle: 0, review: 0 };
      value.missionClaimed = [];
    }
    return value;
  } catch {
    return defaultState();
  }
}

function getPublicPlayerName() {
  const user = window.GlassChessCloud?.user;
  const candidate = user?.displayName || user?.username || "";
  const cleaned = String(candidate).replace(/[<>]/g, "").trim().slice(0, 20);
  return cleaned || "Anonymous";
}

function saveState() {
  try { localStorage.setItem(STORE_KEY, JSON.stringify(state)); }
  catch (error) { console.warn('Glass Chess Online Plus could not save local progress:', error); }
}

function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
}

function levelInfo() {
  const level = Math.floor(state.xp / 250) + 1;
  const into = state.xp % 250;
  return { level, into, next: 250 - into };
}

function toast(message) {
  const el = document.getElementById('gc-plus-toast');
  if (!el) return;
  el.textContent = message;
  el.classList.add('show');
  if (toastTimer !== null) window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => { el.classList.remove('show'); toastTimer = null; }, 2500);
}

function grantXP(amount, reason) {
  const before = levelInfo().level;
  state.xp += amount;
  saveState();
  renderRewards();
  toast(`+${amount} XP · ${reason}`);
  const after = levelInfo().level;
  if (after > before) {
    toast(`LEVEL UP! You're now level ${after}.`);
    playChime('level');
  }
  renderSkins();
}

function awardAchievement(id) {
  if (state.achievements.includes(id)) return;
  const item = ACHIEVEMENTS.find(entry => entry.id === id);
  if (!item) return;
  state.achievements.push(id);
  saveState();
  renderAchievements();
  grantXP(item.xp, `Achievement: ${item.title}`);
  toast(`Achievement unlocked: ${item.title}`);
}

function progressMission(id, amount = 1) {
  const mission = DAILY_MISSIONS.find(item => item.id === id);
  if (!mission || state.missionClaimed.includes(id)) return;
  state.missionProgress[id] = Math.min(mission.target, (state.missionProgress[id] || 0) + amount);
  if (state.missionProgress[id] >= mission.target) {
    state.missionClaimed.push(id);
    grantXP(mission.xp, `Daily mission: ${mission.label}`);
  } else saveState();
  renderMissions();
  if (DAILY_MISSIONS.every(item => state.missionClaimed.includes(item.id))) awardAchievement('daily-three');
}

function playChime(kind = 'move') {
  if (!state.sound) return;
  try {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const now = ctx.currentTime;
    const notes = kind === 'level' ? [523.25, 659.25, 783.99, 1046.5] : kind === 'victory' ? [523.25, 659.25, 783.99] : [660];
    notes.forEach((frequency, index) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = frequency;
      gain.gain.setValueAtTime(0.0001, now + index * 0.12);
      gain.gain.exponentialRampToValueAtTime(0.08, now + index * 0.12 + 0.025);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + index * 0.12 + 0.20);
      osc.connect(gain); gain.connect(ctx.destination);
      osc.start(now + index * 0.12); osc.stop(now + index * 0.12 + 0.22);
    });
    window.setTimeout(() => ctx.close().catch(() => {}), 1000);
  } catch { /* Audio is optional. */ }
}

function injectStyles() {
  if (document.getElementById('gc-online-plus-style')) return;
  const style = document.createElement('style');
  style.id = 'gc-online-plus-style';
  style.textContent = `
    #gc-premium .gc-plus-tabs{display:flex;gap:6px;flex-wrap:wrap}
    #gc-premium .gc-plus-profile{overflow:hidden;border:1px solid var(--border,rgba(255,255,255,.15));border-radius:16px;margin-bottom:10px;background:rgba(127,127,127,.06)}
    #gc-premium .gc-plus-banner{min-height:82px;padding:14px;display:flex;align-items:flex-end;background:linear-gradient(120deg,#152a4f,#315e79 48%,#986bb3);background-size:cover}
    #gc-premium .gc-plus-profile-body{display:flex;align-items:center;gap:12px;padding:12px}
    #gc-premium .gc-plus-avatar{width:58px;height:58px;flex:0 0 58px;display:grid;place-items:center;border-radius:17px;font-size:34px;background:rgba(8,15,28,.82);border:2px solid rgba(255,255,255,.5);box-shadow:0 8px 22px rgba(0,0,0,.25)}
    #gc-premium .gc-plus-level{font-size:11px;opacity:.75}
    #gc-premium .gc-plus-xp{height:8px;background:rgba(127,127,127,.22);border-radius:99px;overflow:hidden;margin-top:7px}
    #gc-premium .gc-plus-xp span{display:block;height:100%;width:0;background:linear-gradient(90deg,#7dd3fc,#c4b5fd,#f0d28a);transition:width .25s}
    #gc-premium .gc-plus-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}
    #gc-premium .gc-plus-mission{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:9px;border:1px solid var(--border,rgba(255,255,255,.12));border-radius:10px;margin:7px 0;font-size:12px}
    #gc-premium .gc-plus-mission.done{border-color:#54c99a;background:rgba(84,201,154,.09)}
    #gc-premium .gc-plus-badge{display:flex;align-items:flex-start;gap:9px;padding:9px;border:1px solid var(--border,rgba(255,255,255,.12));border-radius:11px;margin:7px 0}
    #gc-premium .gc-plus-badge .medal{font-size:23px;width:28px;text-align:center}
    #gc-premium .gc-plus-skins{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}
    #gc-premium .gc-plus-skin{padding:10px;border:1px solid var(--border,rgba(255,255,255,.14));border-radius:12px;text-align:left;background:rgba(127,127,127,.06)}
    #gc-premium .gc-plus-skin.active{border-color:var(--gc-accent);box-shadow:0 0 0 1px var(--gc-accent) inset}
    #gc-premium .gc-plus-skin .sample{font-size:32px;letter-spacing:5px;display:block;margin-bottom:4px}
    #gc-premium .gc-plus-field{display:grid;gap:5px;margin:8px 0;font-size:11px;opacity:.9}
    #gc-premium .gc-plus-field input,#gc-premium .gc-plus-field select{font-size:12px}
    #gc-premium .gc-plus-chat{height:128px;overflow:auto;border:1px solid var(--border,rgba(255,255,255,.13));border-radius:10px;padding:8px;font-size:11px;margin:8px 0}
    #gc-premium .gc-plus-chat p{margin:4px 0;overflow-wrap:anywhere}
    #gc-premium .gc-plus-status{padding:8px 10px;border-radius:9px;background:rgba(127,127,127,.10);font-size:11px;line-height:1.4}
    #gc-premium #gc-plus-toast{position:sticky;bottom:8px;z-index:40;opacity:0;transform:translateY(8px);pointer-events:none;transition:all .2s;background:#15243a;color:#fff;border:1px solid #7896c8;padding:10px 13px;border-radius:11px;font-size:12px;text-align:center}
    #gc-premium #gc-plus-toast.show{opacity:1;transform:none}
    #gc-premium .gc-plus-small{font-size:10px;opacity:.68;line-height:1.45}
    #gc-premium .gc-plus-actions{display:flex;gap:7px;flex-wrap:wrap;margin-top:8px}
    #gc-premium .gc-plus-actions>*{flex:1 1 110px}
    #gc-plus-victory{position:fixed;inset:0;z-index:99999;display:grid;place-items:center;background:rgba(4,9,18,.72);backdrop-filter:blur(9px);animation:gc-victory-fade .25s ease}
    #gc-plus-victory .card{position:relative;overflow:hidden;width:min(430px,calc(100vw - 34px));padding:30px 22px;text-align:center;border-radius:22px;border:1px solid rgba(255,255,255,.25);background:linear-gradient(145deg,#15243a,#28214a 58%,#3b315c);color:#fff;box-shadow:0 24px 90px rgba(0,0,0,.45)}
    #gc-plus-victory h2{font-size:30px;letter-spacing:.04em;margin:7px 0}.gc-plus-crown{font-size:54px;filter:drop-shadow(0 5px 15px #d3b76d)}
    #gc-plus-victory .card button{margin-top:15px;padding:10px 18px;border-radius:10px;background:#e9d5a3;color:#182033;border:0;font-weight:800}
    @keyframes gc-victory-fade{from{opacity:0}to{opacity:1}}
    /* One restrained entrance and a quiet result surface replace the old confetti loop. */
    #gc-plus-victory{background:rgba(5,10,19,.66);backdrop-filter:blur(16px);-webkit-backdrop-filter:blur(16px);animation:gc-victory-fade .2s ease-out both}
    #gc-plus-victory .card{width:min(400px,calc(100vw - 32px));padding:30px 26px 24px;border-radius:20px;border:1px solid rgba(224,211,177,.24);background:linear-gradient(150deg,rgba(24,35,55,.97),rgba(27,29,53,.97));box-shadow:0 24px 80px rgba(0,0,0,.38);animation:gc-victory-arrive .36s cubic-bezier(.2,.75,.25,1) both}
    #gc-plus-victory .gc-victory-mark{width:68px;height:68px;display:grid;place-items:center;margin:0 auto 14px;border:1px solid rgba(232,207,151,.38);border-radius:21px;background:radial-gradient(circle at 35% 25%,rgba(237,214,169,.22),rgba(255,255,255,.035));color:#f0dcae;font-size:39px;filter:drop-shadow(0 5px 16px rgba(218,190,130,.17))}
    #gc-plus-victory .gc-victory-kicker{margin:0 0 8px;color:#b5c0d5;font-size:9px;font-weight:800;letter-spacing:.2em}
    #gc-plus-victory h2{margin:0 0 8px;color:#f4f0e8;font-size:25px;letter-spacing:.09em}
    #gc-plus-victory #gc-plus-victory-message{margin:0;color:#c1cad9;font-size:13px;line-height:1.55}
    #gc-plus-victory .card button{min-height:42px;margin-top:22px;padding:0 18px;border:1px solid rgba(239,218,174,.38);border-radius:11px;background:rgba(232,207,151,.13);color:#f4e4bd;font-size:12px;font-weight:750;cursor:pointer}
    #gc-plus-victory .card button:hover{background:rgba(232,207,151,.2)}
    @keyframes gc-victory-arrive{from{opacity:0;transform:translateY(9px) scale(.985)}to{opacity:1;transform:translateY(0) scale(1)}}
    @media(prefers-reduced-motion:reduce){#gc-plus-victory,#gc-plus-victory .card{animation:none!important}}
    .gc-piece-glyph{display:inline-block!important;font-family:'Apple Symbols','Segoe UI Symbol','Noto Sans Symbols 2',serif!important;font-weight:900!important;line-height:1!important;transition:transform .16s ease,filter .16s ease!important;transform:translateZ(0);white-space:nowrap;user-select:none;-webkit-font-smoothing:antialiased}
    .gc-piece-glyph.gc-piece-enter{animation:gc-piece-arrive .22s cubic-bezier(.2,.8,.2,1)}
    @keyframes gc-piece-arrive{from{opacity:.65;transform:translateY(-5px) scale(.84)}to{opacity:1;transform:translateY(0) scale(1)}}
    [data-square]:hover .gc-piece-glyph,.square:hover .gc-piece-glyph{transform:translateY(-2px) scale(1.07);filter:drop-shadow(0 5px 4px rgba(0,0,0,.35))}
    #gc-premium .gc-plus-actions{min-width:0;align-items:stretch}
    #gc-premium .gc-plus-actions>*{min-width:0;max-width:100%;box-sizing:border-box}
    #gc-premium .gc-plus-actions button{min-height:38px;transition:transform .14s ease,background-color .16s ease,border-color .16s ease}
    #gc-premium .gc-plus-actions button:not(:disabled):active{transform:translateY(1px) scale(.985)}
    #gc-premium .gc-plus-field input,#gc-premium .gc-plus-field select{width:100%;min-width:0;max-width:100%;box-sizing:border-box}
    #gc-premium .gc-plus-grid>*{min-width:0}
    #gc-premium .gc-plus-chat p{animation:gc-chat-arrive .18s ease-out both}
    @keyframes gc-chat-arrive{from{opacity:0;transform:translateY(3px)}to{opacity:1;transform:translateY(0)}}
    @media(max-width:520px){#gc-premium .gc-plus-grid{grid-template-columns:minmax(0,1fr)}}
    @media(prefers-reduced-motion:reduce){#gc-premium .gc-plus-actions button{transition:none!important}#gc-premium .gc-plus-chat p{animation:none!important}}
    body.gc-no-piece-motion .gc-piece-glyph{transition:none!important;animation:none!important}
    body.gc-piece-royal .gc-piece-glyph[data-side="white"]{background:linear-gradient(160deg,#fffdf0 5%,#f3e2b5 42%,#9c8051 100%);-webkit-background-clip:text;background-clip:text;-webkit-text-fill-color:transparent;-webkit-text-stroke:.35px #fff1ca;filter:drop-shadow(0 2px 1px #5b503e) drop-shadow(0 5px 4px rgba(0,0,0,.34))}
    body.gc-piece-royal .gc-piece-glyph[data-side="black"]{background:linear-gradient(155deg,#56647a 0%,#1a2639 48%,#050a13 100%);-webkit-background-clip:text;background-clip:text;-webkit-text-fill-color:transparent;-webkit-text-stroke:.5px #c5a86a;filter:drop-shadow(0 2px 1px #000) drop-shadow(0 5px 4px rgba(0,0,0,.55))}
    body.gc-piece-obsidian .gc-piece-glyph[data-side="white"]{color:#f4f2ed;-webkit-text-stroke:1px #7d8da4;text-shadow:0 2px 0 #9ba6b4,0 5px 5px #283347;filter:drop-shadow(0 5px 4px #111)}
    body.gc-piece-obsidian .gc-piece-glyph[data-side="black"]{color:#151c2a;-webkit-text-stroke:1px #95a7c0;text-shadow:0 1px 0 #59677c,0 5px 6px #000;filter:drop-shadow(0 0 5px rgba(130,170,220,.25))}
    body.gc-piece-neon .gc-piece-glyph[data-side="white"]{color:#aefaff;-webkit-text-stroke:1px #e6ffff;text-shadow:0 0 4px #67f1ff,0 0 11px #24cde4,0 0 20px #24cde4;filter:drop-shadow(0 3px 3px #07152c)}
    body.gc-piece-neon .gc-piece-glyph[data-side="black"]{color:#b58cff;-webkit-text-stroke:1px #e4d1ff;text-shadow:0 0 4px #a66cff,0 0 12px #763cff,0 0 22px #763cff;filter:drop-shadow(0 3px 3px #07152c)}
    body.gc-piece-crimson .gc-piece-glyph[data-side="white"]{color:#fff2df;-webkit-text-stroke:1px #cba77b;text-shadow:0 2px 0 #c3a888,0 5px 5px #3d2630;filter:drop-shadow(0 4px 4px #20131a)}
    body.gc-piece-crimson .gc-piece-glyph[data-side="black"]{color:#651e35;-webkit-text-stroke:1px #f4b8bd;text-shadow:0 2px 0 #34111e,0 5px 7px #000;filter:drop-shadow(0 0 4px rgba(212,74,105,.48))}
    body.gc-piece-frost .gc-piece-glyph[data-side="white"]{color:#f6ffff;-webkit-text-stroke:1px #8dd9ed;text-shadow:0 0 4px #e7fbff,0 4px 5px #456d84;filter:drop-shadow(0 4px 4px #172a3c)}
    body.gc-piece-frost .gc-piece-glyph[data-side="black"]{color:#263c54;-webkit-text-stroke:1px #a3e0f4;text-shadow:0 1px 0 #8abbd0,0 5px 7px #081522;filter:drop-shadow(0 0 5px rgba(112,207,238,.42))}
    /* Reward finishes target the current board renderer as well as legacy glyphs. */
    body.gc-piece-royal .gc-piece.piece-white{color:#f3e2b5!important;filter:drop-shadow(0 2px 1px #5b503e) drop-shadow(0 5px 4px rgba(0,0,0,.34))}
    body.gc-piece-royal .gc-piece.piece-black{color:#1a2639!important;filter:drop-shadow(0 2px 1px #000) drop-shadow(0 5px 4px rgba(0,0,0,.55))}
    body.gc-piece-obsidian .gc-piece.piece-white{color:#dbe5f5!important;filter:drop-shadow(0 4px 4px #283347)}
    body.gc-piece-obsidian .gc-piece.piece-black{color:#151c2a!important;filter:drop-shadow(0 0 5px rgba(130,170,220,.25))}
    body.gc-piece-neon .gc-piece.piece-white{color:#aefaff!important;filter:drop-shadow(0 0 5px #24cde4) drop-shadow(0 0 13px #24cde4)}
    body.gc-piece-neon .gc-piece.piece-black{color:#8c5bdf!important;filter:drop-shadow(0 0 5px #763cff) drop-shadow(0 0 14px #763cff)}
    body.gc-piece-crimson .gc-piece.piece-white{color:#f4f2ed!important;filter:drop-shadow(0 3px 3px #6b202e)}
    body.gc-piece-crimson .gc-piece.piece-black{color:#7a2038!important;filter:drop-shadow(0 0 5px rgba(255,92,115,.35))}
    body.gc-piece-frost .gc-piece.piece-white{color:#eaf5ff!important;filter:drop-shadow(0 0 5px rgba(183,228,255,.5))}
    body.gc-piece-frost .gc-piece.piece-black{color:#547999!important;filter:drop-shadow(0 0 7px rgba(154,217,255,.48))}
    @media(max-width:640px){#gc-premium .gc-plus-grid{grid-template-columns:1fr}#gc-premium .gc-plus-skins{grid-template-columns:1fr 1fr}#gc-premium .gc-plus-profile-body{align-items:flex-start}}
    @media(prefers-reduced-motion:reduce){#gc-plus-victory .confetti i{animation:none!important}.gc-piece-glyph{animation:none!important;transition:none!important}}
  `;
  document.head.appendChild(style);
}

function mountTab() {
  if (root.querySelector('[data-view="onlineplus"]')) return;
  const nav = root.querySelector('.gc-tabs');
  const tab = document.createElement('button');
  tab.type = 'button'; tab.dataset.tab = 'onlineplus'; tab.textContent = 'Online + Club';
  nav.appendChild(tab);
  const view = document.createElement('section');
  view.className = 'gc-view'; view.dataset.view = 'onlineplus';
  view.innerHTML = `
    <div class="gc-plus-profile">
      <div class="gc-plus-banner" id="gc-plus-banner"></div>
      <div class="gc-plus-profile-body">
        <div class="gc-plus-avatar" id="gc-plus-avatar">♞</div>
        <div style="flex:1;min-width:0"><div style="font-weight:900;font-size:17px" id="gc-plus-name">Player</div><div class="gc-plus-level" id="gc-plus-level">Level 1 · 0 XP</div><div class="gc-plus-xp"><span id="gc-plus-xpbar"></span></div></div>
      </div>
    </div>
    <div class="gc-card"><div class="gc-row"><h4>Player identity</h4><span class="gc-pill">Local profile</span></div>
      <div class="gc-plus-grid">
        <label class="gc-plus-field">Display name<input id="gc-plus-name-input" maxlength="20" placeholder="Your chess name"></label>
        <label class="gc-plus-field">Avatar<select id="gc-plus-avatar-select">${AVATARS.map(x => `<option value="${esc(x)}">${esc(x)}</option>`).join('')}</select></label>
        <label class="gc-plus-field">Profile banner<select id="gc-plus-banner-select">${BANNERS.map(x => `<option value="${x.id}">${x.label}</option>`).join('')}</select></label>
      </div><div class="gc-plus-actions"><button class="primary" id="gc-plus-profile-save">Save profile</button></div>
      <p class="gc-plus-small">Your name and avatar are shared with players in rooms you join. Profile XP and achievements stay on this device.</p>
    </div>
    <div class="gc-card"><div class="gc-row"><h4>Online multiplayer</h4><span class="gc-pill" id="gc-plus-connection">Offline</span></div>
      <label class="gc-plus-field" hidden>Online server address<input id="gc-plus-server-url" value="https://glass-chess-sqk0.onrender.com" spellcheck="false"></label>
      <div class="gc-plus-actions"><button class="primary" id="gc-plus-find-match">Find an opponent</button><button id="gc-plus-cancel-match" disabled>Cancel search</button></div>
      <p class="gc-plus-small">Quick Match pairs you with the next available player. This first version is casual, with no rating changes. You can cancel while searching.</p>
      <div class="gc-plus-actions"><button id="gc-plus-create-room">Challenge a friend · Create link</button></div>
      <div class="gc-plus-grid"><label class="gc-plus-field">Room code<input id="gc-plus-room-code" maxlength="8" placeholder="ABC123"></label><div style="display:flex;align-items:end;gap:6px"><button id="gc-plus-join-room" style="flex:1">Join</button><button id="gc-plus-spectate" style="flex:1">Spectate</button></div></div>
      <div class="gc-plus-status" id="gc-plus-room-status">Connect to the online server, then create a room or enter a friend's code.</div>
      <div class="gc-plus-actions"><button id="gc-plus-copy-invite" disabled>Copy invitation link</button><button id="gc-plus-leave-room" disabled>Leave room</button><button id="gc-plus-resign" disabled>Resign</button></div>
      <div class="gc-plus-small">Private invitations work across the internet. Your friend opens the link and joins your game. Moves are checked by the Glass Chess game server.</div>
    </div>
    <div class="gc-card"><div class="gc-row"><h4>Room chat</h4><span class="gc-muted" id="gc-plus-room-people">No room</span></div><div class="gc-plus-chat" id="gc-plus-chat"><p class="gc-plus-small">Room chat appears here after you join.</p></div><div class="gc-plus-actions"><input id="gc-plus-chat-input" maxlength="240" placeholder="Message your room" aria-label="Room chat message"><button id="gc-plus-chat-send">Send</button></div></div>
    <div class="gc-card"><div class="gc-row"><h4>Friends list</h4><span class="gc-pill" id="gc-plus-friend-count">0 friends</span></div><div class="gc-plus-actions"><input id="gc-plus-friend-input" maxlength="20" placeholder="Friend's display name"><button id="gc-plus-add-friend">Add friend</button></div><div id="gc-plus-friends" class="gc-results"><div class="gc-empty">Add a friend to start your local list.</div></div><p class="gc-plus-small">This is a saved contacts list on this device. You can invite friends with a private game link.</p></div>
    <div class="gc-card"><div class="gc-row"><h4>Daily missions</h4><span class="gc-pill" id="gc-plus-mission-date">Today</span></div><div id="gc-plus-missions"></div><div class="gc-plus-small">Complete missions to earn XP and unlock new chess-piece designs.</div></div>
    <div class="gc-card"><div class="gc-row"><h4>Game of the day</h4><span class="gc-pill">Daily challenge</span></div><div class="gc-stat" id="gc-plus-daily-title" style="font-size:18px">Find the forced mate</div><p class="gc-muted" id="gc-plus-daily-copy">White to move. Find the move that ends the game immediately.</p><div class="gc-plus-actions"><button class="primary" id="gc-plus-daily-start">Start today's challenge</button></div><div class="gc-plus-status" id="gc-plus-daily-status">One tactical challenge, refreshed each day.</div></div>
    <div class="gc-card"><div class="gc-row"><h4>Achievements</h4><span class="gc-pill" id="gc-plus-achievement-count">0 / ${ACHIEVEMENTS.length}</span></div><div id="gc-plus-achievements"></div></div>
    <div class="gc-card"><div class="gc-row"><h4>Unlockable piece finishes</h4><span class="gc-pill" id="gc-plus-skin-xp">0 XP</span></div><div id="gc-plus-skins" class="gc-plus-skins"></div><p class="gc-plus-small" id="gc-plus-skin-current">Choose a finish to recolor your selected Glass, Medieval or Modern pieces. Manual color choices take priority.</p></div>
    <div class="gc-card"><div class="gc-row"><h4>Engine personality presets</h4><span class="gc-pill">Stockfish</span></div><label class="gc-plus-field">Playing style<select id="gc-plus-personality">${Object.entries(PERSONALITIES).map(([id,p]) => `<option value="${id}">${p.label}</option>`).join('')}</select></label><div class="gc-plus-status" id="gc-plus-personality-note"></div><div class="gc-plus-actions"><button class="primary" id="gc-plus-personality-apply">Apply personality</button></div><p class="gc-plus-small">These presets tune Stockfish skill level and search depth. Stockfish remains the same engine; these are not separate trained personalities.</p></div>
    <div class="gc-card"><div class="gc-row"><h4>Sound & animation studio</h4><span class="gc-pill">Preferences</span></div><label style="display:flex;gap:8px;align-items:center;margin:9px 0;font-size:12px"><input id="gc-plus-sound" type="checkbox" style="width:auto"> Sound effects and victory chimes</label><label style="display:flex;gap:8px;align-items:center;margin:9px 0;font-size:12px"><input id="gc-plus-animations" type="checkbox" style="width:auto"> Piece motion and victory animations</label><div class="gc-plus-actions"><button id="gc-plus-settings-save">Save studio settings</button></div><p class="gc-plus-small">You can also switch off motion for a calmer board experience.</p></div>
    <div id="gc-plus-toast" role="status" aria-live="polite"></div>
  `;
  root.appendChild(view);
  tab.addEventListener('click', () => switchTab('onlineplus'));
  root.querySelectorAll('[data-tab]').forEach(button => {
    if (button.dataset.gcPlusBound) return;
    button.dataset.gcPlusBound = '1';
    button.addEventListener('click', () => switchTab(button.dataset.tab));
  });
}

function switchTab(name) {
  root.querySelectorAll('[data-tab]').forEach(button => button.classList.toggle('active', button.dataset.tab === name));
  root.querySelectorAll('[data-view]').forEach(view => view.classList.toggle('active', view.dataset.view === name));
}

function applyBanner() {
  const banner = BANNERS.find(item => item.id === state.banner) || BANNERS[0];
  const el = root.querySelector('#gc-plus-banner');
  if (el) el.style.background = banner.css;
  document.body.dataset.gcProfileBanner = state.banner;
}

function renderProfile() {
  const level = levelInfo();
  root.querySelector('#gc-plus-avatar').textContent = state.avatar;
  root.querySelector('#gc-plus-name').textContent = state.name;
  root.querySelector('#gc-plus-name-input').value = state.name;
  root.querySelector('#gc-plus-avatar-select').value = state.avatar;
  root.querySelector('#gc-plus-banner-select').value = state.banner;
  root.querySelector('#gc-plus-level').textContent = `Level ${level.level} · ${state.xp} XP · ${level.next} XP to next level`;
  root.querySelector('#gc-plus-xpbar').style.width = `${level.into / 250 * 100}%`;
  root.querySelector('#gc-plus-personality').value = state.personality;
  root.querySelector('#gc-plus-personality-note').textContent = PERSONALITIES[state.personality].note;
  root.querySelector('#gc-plus-sound').checked = state.sound;
  root.querySelector('#gc-plus-animations').checked = state.animations;
  applyBanner();
}

function renderMissions() {
  const host = root.querySelector('#gc-plus-missions');
  host.innerHTML = DAILY_MISSIONS.map(mission => {
    const progress = state.missionProgress[mission.id] || 0;
    const done = state.missionClaimed.includes(mission.id);
    return `<div class="gc-plus-mission ${done ? 'done' : ''}"><div><strong>${done ? '✓ ' : ''}${esc(mission.label)}</strong><div class="gc-plus-small">${Math.min(progress, mission.target)} / ${mission.target} · +${mission.xp} XP</div></div><span class="gc-pill">${done ? 'Complete' : 'In progress'}</span></div>`;
  }).join('');
  root.querySelector('#gc-plus-mission-date').textContent = todayKey();
}

function renderAchievements() {
  const unlocked = state.achievements;
  root.querySelector('#gc-plus-achievement-count').textContent = `${unlocked.length} / ${ACHIEVEMENTS.length}`;
  root.querySelector('#gc-plus-achievements').innerHTML = ACHIEVEMENTS.map(item => {
    const earned = unlocked.includes(item.id);
    return `<div class="gc-plus-badge" style="opacity:${earned ? 1 : .48}"><span class="medal">${earned ? item.icon : '🔒'}</span><div><strong>${esc(item.title)}</strong><div class="gc-plus-small">${esc(item.description)}</div><div class="gc-plus-small">${earned ? 'Unlocked' : `Reward: ${item.xp} XP`}</div></div></div>`;
  }).join('');
}

function renderSkins() {
  root.querySelector('#gc-plus-skin-xp').textContent = `${state.xp} XP`;
  root.querySelector('#gc-plus-skins').innerHTML = SKINS.map(skin => {
    const unlocked = state.xp >= skin.unlock;
    return `<button class="gc-plus-skin ${state.pieceSkin === skin.id ? 'active' : ''}" data-skin="${skin.id}" ${unlocked ? '' : 'disabled'}><span class="sample">${skin.icon} ♞</span><strong>${esc(skin.name)}</strong><div class="gc-plus-small">${unlocked ? esc(skin.desc) : `Unlock at ${skin.unlock} XP`}</div></button>`;
  }).join('');
  const current = SKINS.find(item => item.id === state.pieceSkin);
  root.querySelector('#gc-plus-skin-current').textContent = current
    ? `${current.name} finish is active on the board. Select another finish or change a piece color to use a custom appearance.`
    : 'Custom piece colors are active. Your Glass, Medieval or Modern design stays selected.';
  root.querySelectorAll('[data-skin]').forEach(button => button.addEventListener('click', () => {
    const skin = SKINS.find(item => item.id === button.dataset.skin);
    if (!skin || state.xp < skin.unlock) return;
    state.pieceSkin = skin.id;
    saveState();
    applyPieceSkin(true);
    renderSkins();
    toast(`${skin.name} piece finish equipped.`);
  }));
}

function renderFriends() {
  const host = root.querySelector('#gc-plus-friends');
  root.querySelector('#gc-plus-friend-count').textContent = `${state.friends.length} friends`;
  if (!state.friends.length) { host.innerHTML = '<div class="gc-empty">Add a friend to start your local list.</div>'; return; }
  host.innerHTML = state.friends.map((name, index) => `<div class="gc-plus-mission"><span>♟ ${esc(name)}</span><button data-remove-friend="${index}">Remove</button></div>`).join('');
  host.querySelectorAll('[data-remove-friend]').forEach(button => button.addEventListener('click', () => {
    state.friends.splice(Number(button.dataset.removeFriend), 1); saveState(); renderFriends();
  }));
}

function renderRoomButtons() {
  const active = Boolean(online.code && socket?.connected);
  root.querySelector('#gc-plus-copy-invite').disabled = !active;
  root.querySelector('#gc-plus-leave-room').disabled = !online.code;
  root.querySelector('#gc-plus-resign').disabled = !online.code || online.role === 'spectator';
  const find = root.querySelector('#gc-plus-find-match');
  const cancel = root.querySelector('#gc-plus-cancel-match');
  if (find) { find.disabled = matchmakingActive || Boolean(online.code); find.textContent = matchmakingActive ? 'Searching…' : 'Find an opponent'; }
  if (cancel) cancel.disabled = !matchmakingActive;
  root.querySelector('#gc-plus-connection').textContent = socket?.connected ? 'Connected' : 'Offline';
}

function addChatMessage(message) {
  const chat = root.querySelector('#gc-plus-chat');
  const p = document.createElement('p');
  const name = document.createElement('strong');
  name.textContent = `${message.name}: `;
  p.append(name, document.createTextNode(message.text));
  chat.appendChild(p);
  chat.scrollTop = chat.scrollHeight;
}

function showRoomState(snapshot) {
  if (!snapshot || !online.code) return;
  online.lastState = snapshot;
  online.syncing = true;
  try {
    api.rebuild(START_FEN, snapshot.history || []);
    if (api.fen !== snapshot.fen) throw new Error('The server FEN did not match its move history.');
    window.GlassChessPremium?.onLoadedGame?.(snapshot.history || [], snapshot.fen);
  } catch (error) {
    root.querySelector('#gc-plus-room-status').textContent = `Could not sync this game: ${error.message}`;
  }
  api.setReplayLock(online.role === 'spectator' || Boolean(snapshot.gameOver || snapshot.resigned || snapshot.abandoned));
  if (online.role === 'w' || online.role === 'b') api.setOnlineSide(online.role);
  api.setOnlineMatchActive?.(true);
  const white = snapshot.players?.w?.name || 'Waiting for White';
  const black = snapshot.players?.b?.name || 'Waiting for Black';
  root.querySelector('#gc-plus-room-status').textContent = `${online.role === 'spectator' ? 'Spectating' : `Playing as ${online.role === 'w' ? 'White' : 'Black'}`} · ${white} vs ${black} · ${snapshot.result}`;
  if (snapshot.lastMove?.fx?.isCheck && snapshot.lastMove.ply !== lastCheckToastPly) {
    lastCheckToastPly = snapshot.lastMove.ply;
    toast(snapshot.lastMove.fx.isCheckmate ? 'Checkmate!' : 'Check!');
  }
  root.querySelector('#gc-plus-room-people').textContent = `${Number(snapshot.spectators || 0)} spectators`;
  renderRoomButtons();
  window.setTimeout(() => { online.syncing = false; }, 0);
  if (snapshot.gameOver || snapshot.resigned || snapshot.abandoned) {
    if (snapshot.checkmate) awardAchievement('first-mate');
    showVictory(snapshot.result || 'Game over');
  }
}

function handleExpiredRoom(payload = {}) {
  if (!online.code || payload.code !== online.code) return;
  const message = payload.reason === 'invitation-expired'
    ? 'This invitation expired. Create a new room to challenge a friend.'
    : 'This online room expired and has been closed. Start a new match.';
  void leaveRoom({ restoreMode: true }).then(() => {
    root.querySelector('#gc-plus-room-status').textContent = message;
    toast('Online room closed.');
  });
}

function makeSocket() {
  const input = root.querySelector('#gc-plus-server-url');
  const url = input.value.trim().replace(/\/$/, '');
  if (!/^https?:\/\//i.test(url)) throw new Error('Enter a server address beginning with http:// or https://.');
  if (socket) {
    try { socket.disconnect(); } catch {}
    socket = null;
  }
  socket = io(url, { transports: ['websocket', 'polling'], reconnection: true, reconnectionAttempts: Infinity, reconnectionDelay: 500, reconnectionDelayMax: 5000, timeout: 8000 });
  root.querySelector('#gc-plus-room-status').textContent = `Connecting to Glass Chess online…`;
  socket.on('connect', () => {
    root.querySelector('#gc-plus-connection').textContent = 'Connected';
    if (online.code && online.resumeToken) {
      root.querySelector('#gc-plus-room-status').textContent = 'Reconnecting to your game…';
      socket.timeout(7000).emit('room:resume', { code: online.code, playerId: CLIENT_ID, resumeToken: online.resumeToken }, (timeoutError, result) => {
        if (timeoutError) {
          root.querySelector('#gc-plus-room-status').textContent = 'The reconnect request timed out. Your saved session is being kept for another attempt.';
          renderRoomButtons();
          return;
        }
        if (!result?.ok) {
          const message = result?.error || 'Could not restore the online game.';
          if (/no longer be resumed|invalid or expired|room not found/i.test(message)) {
            void leaveRoom({ restoreMode: true }).then(() => {
              root.querySelector('#gc-plus-room-status').textContent = message;
            });
          } else {
            root.querySelector('#gc-plus-room-status').textContent = message;
          }
          renderRoomButtons();
          return;
        }
        online.role = result.role;
        online.side = result.role === 'w' || result.role === 'b' ? result.role : '';
        online.lastState = result.state;
        showRoomState(result.state);
        root.querySelector('#gc-plus-room-status').textContent = 'Connection restored. Your game is synchronized.';
        toast('Back in the game.');
      });
    } else if (!online.code) {
      root.querySelector('#gc-plus-room-status').textContent = 'Connected. Create a room or enter a room code.';
    }
    renderRoomButtons();
  });
  socket.on('connect_error', error => {
    root.querySelector('#gc-plus-connection').textContent = 'Connection error';
    root.querySelector('#gc-plus-room-status').textContent = `Could not connect: ${error.message}. Check the server is running at ${url}.`;
    renderRoomButtons();
  });
  socket.on('disconnect', reason => {
    if (matchmakingActive) {
      matchmakingActive = false;
      root.querySelector('#gc-plus-room-status').textContent = 'Connection lost while searching. Reconnect and try again.';
    } else {
      root.querySelector('#gc-plus-room-status').textContent = `Disconnected: ${reason}. Reconnect to continue.`;
    }
    root.querySelector('#gc-plus-connection').textContent = 'Disconnected';
    renderRoomButtons();
  });
  socket.on('room:state', snapshot => showRoomState(snapshot));
  socket.on('room:expired', handleExpiredRoom);
  socket.on('match:found', result => {
    // A cancelled search or an offline-game request can race with a late match event.
    // Do not let that stale event put the board back into online mode.
    if (offlineIntent || (!matchmakingActive && !online.code)) {
      void emitAck('room:leave').catch(() => {});
      return;
    }
    if (online.code) return; // The queue acknowledgement already applied this match.
    matchmakingActive = false;
    applyRoomJoin(result);
    root.querySelector('#gc-plus-room-status').textContent = 'Opponent found! You are playing as ' + (result.role === 'w' ? 'White.' : 'Black.');
    toast('Match found. Good luck!');
  });
  socket.on('chat:message', addChatMessage);
  return socket;
}

function emitAck(event, payload = {}) {
  return new Promise((resolve, reject) => {
    if (!socket?.connected) return reject(new Error('Not connected to the online server.'));
    socket.timeout(6500).emit(event, payload, (timeoutError, result) => {
      if (timeoutError) return reject(new Error('The online server did not respond. Check your connection and try again.'));
      if (result?.ok) resolve(result);
      else reject(new Error(result?.error || 'The server rejected that request.'));
    });
  });
}

function applyRoomJoin(result) {
  lastCheckToastPly = 0;
  offlineIntent = false;
  online.code = result.code;
  online.role = result.role;
  online.side = result.role === 'w' || result.role === 'b' ? result.role : '';
  online.resumeToken = result.resumeToken || online.resumeToken || '';
  online.lastState = result.state;
  if (online.resumeToken) {
    try {
      localStorage.setItem('glass-chess-online-room-code', online.code);
      localStorage.setItem(`glass-chess-online-resume:${online.code}`, online.resumeToken);
    } catch { /* Reconnection remains available for this page session. */ }
  }
  api.stopSearch?.();
  api.setMode('local', false);
  if (online.side) api.setOnlineSide(online.side);
  state.xp = Math.max(0, state.xp);
  awardAchievement('online-game');
  root.querySelector('#gc-plus-room-code').value = result.code;
  root.querySelector('#gc-plus-chat').innerHTML = '';
  showRoomState(result.state);
  renderRoomButtons();
}

async function findMatch() {
  if (online.code || matchmakingActive) return;
  offlineIntent = false;
  const generation = ++matchmakingGeneration;
  online.previousMode = api.mode;
  online.previousColor = api.playerColor;
  matchmakingActive = true;
  renderRoomButtons();
  root.querySelector('#gc-plus-room-status').textContent = 'Looking for another player… Keep this page open. You can cancel at any time.';
  try {
    if (!socket?.connected) makeSocket();
    await waitForSocket();
    if (generation !== matchmakingGeneration || offlineIntent) return;
    const result = await emitAck('queue:join', { name: getPublicPlayerName(), playerId: CLIENT_ID });
    if (generation !== matchmakingGeneration || offlineIntent) {
      if (result?.matched && socket?.connected) {
        try { await emitAck('room:leave'); } catch {}
      }
      return;
    }
    // The match:found event may arrive before the queue acknowledgement.
    if (online.code) return;
    if (result.matched) {
      matchmakingActive = false;
      applyRoomJoin(result);
      toast('Opponent found. Game starting!');
    } else {
      matchmakingActive = true;
      root.querySelector('#gc-plus-room-status').textContent = 'Searching for an opponent… You will be connected automatically when someone joins.';
    }
  } catch (error) {
    if (generation !== matchmakingGeneration || offlineIntent) return;
    matchmakingActive = false;
    renderRoomButtons();
    root.querySelector('#gc-plus-room-status').textContent = error.message;
  }
}

async function cancelMatch() {
  if (!matchmakingActive) return;
  ++matchmakingGeneration;
  try { if (socket?.connected) await emitAck('queue:cancel'); }
  catch (error) { root.querySelector('#gc-plus-room-status').textContent = error.message; }
  matchmakingActive = false;
  root.querySelector('#gc-plus-room-status').textContent = 'Matchmaking cancelled.';
  renderRoomButtons();
}

async function createRoom() {
  offlineIntent = false;
  online.previousMode = api.mode;
  online.previousColor = api.playerColor;
  onlineRequestActive = true;
  const generation = ++onlineRequestGeneration;
  try {
    if (!socket?.connected) makeSocket();
    await waitForSocket();
    if (generation !== onlineRequestGeneration || offlineIntent) return;
    const result = await emitAck('room:create', { name: getPublicPlayerName(), playerId: CLIENT_ID });
    if (generation !== onlineRequestGeneration || offlineIntent) {
      if (result?.code && socket?.connected) {
        try { await emitAck('room:leave'); } catch {}
      }
      return;
    }
    applyRoomJoin(result);
    toast(`Room ${result.code} created. Share the invitation link.`);
  } catch (error) {
    if (generation === onlineRequestGeneration && !offlineIntent) {
      root.querySelector('#gc-plus-room-status').textContent = error.message;
    }
  } finally {
    if (generation === onlineRequestGeneration) {
      onlineRequestActive = false;
      renderRoomButtons();
    }
  }
}

function waitForSocket() {
  if (socket?.connected) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const timeout = window.setTimeout(() => { cleanup(); reject(new Error('Connection timed out. Is the online server running?')); }, 9000);
    const connected = () => { cleanup(); resolve(); };
    const failed = error => { cleanup(); reject(new Error(error?.message || 'Connection failed.')); };
    function cleanup() { clearTimeout(timeout); socket?.off('connect', connected); socket?.off('connect_error', failed); }
    socket?.once('connect', connected); socket?.once('connect_error', failed);
  });
}

async function joinRoom(spectate = false) {
  offlineIntent = false;
  online.previousMode = api.mode;
  online.previousColor = api.playerColor;
  onlineRequestActive = true;
  const generation = ++onlineRequestGeneration;
  try {
    if (!socket?.connected) makeSocket();
    await waitForSocket();
    if (generation !== onlineRequestGeneration || offlineIntent) return;
    const code = root.querySelector('#gc-plus-room-code').value.trim().toUpperCase();
    const result = await emitAck(spectate ? 'room:spectate' : 'room:join', { code, name: getPublicPlayerName(), playerId: CLIENT_ID });
    if (generation !== onlineRequestGeneration || offlineIntent) {
      if (result?.code && socket?.connected) {
        try { await emitAck('room:leave'); } catch {}
      }
      return;
    }
    applyRoomJoin(result);
    if (spectate) toast(`Watching room ${result.code}.`);
    else toast(`Joined room ${result.code}.`);
  } catch (error) {
    if (generation === onlineRequestGeneration && !offlineIntent) {
      root.querySelector('#gc-plus-room-status').textContent = error.message;
    }
  } finally {
    if (generation === onlineRequestGeneration) {
      onlineRequestActive = false;
      renderRoomButtons();
    }
  }
}

function handleLocalMove(move) {
  if (!online.code || online.syncing) return true;
  if (!socket?.connected) {
    if (online.lastState) window.setTimeout(() => showRoomState(online.lastState), 0);
    return false;
  }
  if (online.role === 'spectator' || move.color !== online.side) {
    window.setTimeout(() => { if (online.lastState) showRoomState(online.lastState); }, 0);
    root.querySelector('#gc-plus-room-status').textContent = online.role === 'spectator' ? 'Spectators cannot move pieces.' : 'That is not your color. The online game has been restored.';
    return false;
  }
  socket.timeout(6000).emit('game:move', {
    code: online.code,
    expectedPly: online.lastState?.history?.length ?? -1,
    expectedFen: online.lastState?.fen || '',
    move: { from: move.from, to: move.to, promotion: move.promotion }
  }, (timeoutError, result) => {
    if (timeoutError || !result?.ok) {
      root.querySelector('#gc-plus-room-status').textContent =
        timeoutError ? 'The server did not confirm that move. Waiting for the authoritative position.' :
        (result?.error || 'Move rejected by server.');
      if (online.lastState) showRoomState(online.lastState);
    }
  });
  return true;
}

async function leaveRoom({ restoreMode = true } = {}) {
  const roomCode = online.code;
  const wasSearching = matchmakingActive;
  const hadPendingRequest = onlineRequestActive;
  const previousMode = online.previousMode || 'computer';
  const previousColor = online.previousColor || api.playerColor || 'white';
  offlineIntent = true;
  ++matchmakingGeneration;
  ++onlineRequestGeneration;
  onlineRequestActive = false;

  // Cancel both queue searches and active rooms before allowing local play.
  if (wasSearching && socket?.connected) {
    try { await emitAck('queue:cancel'); } catch {}
  }
  if (roomCode && socket?.connected) {
    try { await emitAck('room:leave'); } catch {}
  }

  try {
    const savedCode = localStorage.getItem('glass-chess-online-room-code') || '';
    for (const code of new Set([roomCode, savedCode].filter(Boolean))) {
      localStorage.removeItem(`glass-chess-online-resume:${code}`);
    }
    localStorage.removeItem('glass-chess-online-room-code');
  } catch { /* Local storage may be disabled. */ }

  online.code = '';
  online.role = '';
  online.side = '';
  online.resumeToken = '';
  online.lastState = null;
  online.syncing = false;
  lastCheckToastPly = 0;
  matchmakingActive = false;
  onlineRequestActive = false;
  api.setReplayLock(false);
  api.setOnlineMatchActive?.(false);
  if (restoreMode) api.setMode(previousMode);
  if (previousColor) api.setOnlineSide(previousColor === 'black' ? 'b' : 'w');

  // An invitation URL must not silently rejoin after leaving or starting a solo game.
  try {
    const url = new URL(window.location.href);
    if (url.searchParams.has('room')) {
      url.searchParams.delete('room');
      window.history.replaceState(window.history.state, '', url);
    }
  } catch { /* URL cleanup is optional. */ }

  root.querySelector('#gc-plus-room-status').textContent = roomCode
    ? 'You left the room.'
    : (wasSearching || hadPendingRequest) ? 'Online request cancelled. Ready for offline play.' : 'Ready for offline play.';
  root.querySelector('#gc-plus-room-people').textContent = 'No room';
  renderRoomButtons();
  return true;
}

async function copyInvite() {
  if (!online.code) return;
  const url = new URL(window.location.href);
  url.searchParams.set('room', online.code);
  url.searchParams.delete('server');
  try {
    await navigator.clipboard.writeText(url.toString());
    toast('Invitation link copied. Send it to your friend.');
  } catch {
    root.querySelector('#gc-plus-room-status').textContent = `Share room code ${online.code} and server ${root.querySelector('#gc-plus-server-url').value.trim()}.`;
  }
}

function addFriend() {
  const input = root.querySelector('#gc-plus-friend-input');
  const name = input.value.trim().slice(0, 20);
  if (!name) return;
  if (name.toLowerCase() === state.name.toLowerCase()) { toast('That is your own display name.'); return; }
  if (state.friends.some(item => item.toLowerCase() === name.toLowerCase())) { toast('That friend is already on your list.'); return; }
  state.friends.push(name); state.friends.sort((a, b) => a.localeCompare(b));
  input.value = ''; saveState(); renderFriends();
  if (state.friends.length >= 5) awardAchievement('five-friends');
}

async function startDailyChallenge() {
  if (api.history.length && !window.confirm('Starting the daily challenge replaces the current board. Save your game first if you need it. Continue?')) return;
  if (online.code || matchmakingActive) await leaveRoom({ restoreMode: false });
  const challenge = DAILY_CHALLENGES[Number(todayKey().replaceAll('-', '')) % DAILY_CHALLENGES.length];
  dailyChallenge = { active: true, solution: challenge.solution, notation: challenge.notation, solved: false, rewardEligible: state.lastChallenge !== todayKey() };
  const fen = challenge.fen;
  api.setReplayLock(false);
  api.setMode('local', false);
  api.setOnlineSide('w');
  api.rebuild(fen, []);
  window.GlassChessPremium?.onReset?.(fen);
  root.querySelector('#gc-plus-daily-status').textContent = `White to move: find ${challenge.notation}. You have one move.`;
  toast('Daily challenge loaded. Find the forced mate.');
  switchTab('onlineplus');
}

function showVictory(message) {
  const checkmate = Boolean(api?.checkmate) || /checkmate/i.test(String(message));
  if (!state.animations) {
    toast(message);
    return;
  }

  const positionFen = String(api?.fen || '');
  const key = positionFen + '|' + String(message);
  const existing = document.getElementById('gc-plus-victory');
  if (existing && victoryKey === key) return;
  if (victoryKey === key && victoryPresentationTimer !== null) return;
  if (victoryPresentationTimer !== null) window.clearTimeout(victoryPresentationTimer);
  victoryPresentationTimer = null;
  existing?.remove();
  victoryKey = key;

  const present = () => {
    victoryPresentationTimer = null;
    // A result can be queued just before the board is reset or a different PGN is loaded.
    if (victoryKey !== key || String(api?.fen || '') !== positionFen) {
      if (victoryKey === key) victoryKey = '';
      return;
    }

    previousVictoryFocus = document.activeElement;
    const overlay = document.createElement('div');
    overlay.id = 'gc-plus-victory';
    overlay.className = checkmate ? 'is-checkmate' : 'is-complete';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-labelledby', 'gc-plus-victory-title');
    overlay.setAttribute('aria-describedby', 'gc-plus-victory-message');
    overlay.tabIndex = -1;
    overlay.innerHTML = `
      <section class="card">
        <span class="gc-victory-mark" aria-hidden="true">${checkmate ? '♛' : '♔'}</span>
        <p class="gc-victory-kicker">GLASS CHESS · RESULT</p>
        <h2 id="gc-plus-victory-title">${checkmate ? 'CHECKMATE' : 'GAME COMPLETE'}</h2>
        <p id="gc-plus-victory-message">${esc(message)}</p>
        <button type="button" id="gc-plus-victory-close">Back to board</button>
      </section>`;

    const close = () => {
      overlay.remove();
      if (victoryKey === key) victoryKey = '';
      if (previousVictoryFocus?.isConnected) previousVictoryFocus.focus();
      previousVictoryFocus = null;
    };
    overlay.querySelector('#gc-plus-victory-close').addEventListener('click', close);
    overlay.addEventListener('keydown', event => {
      if (event.key === 'Escape') {
        event.preventDefault();
        close();
      } else if (event.key === 'Tab') {
        event.preventDefault();
        overlay.querySelector('#gc-plus-victory-close')?.focus();
      }
    });
    document.body.appendChild(overlay);
    requestAnimationFrame(() => overlay.querySelector('#gc-plus-victory-close')?.focus({ preventScroll: true }));
    // The king's checkmate ring gets its full 1.5 s on-board moment before the result arrives.
    if (!checkmate) playChime('victory');
  };

  if (checkmate && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    victoryPresentationTimer = window.setTimeout(present, 1500);
  } else {
    present();
  }
}

function applyPieceSkin(applyPreset = false) {
  document.body.classList.remove(...SKINS.map(skin => `gc-piece-${skin.id}`));
  const selected = SKINS.find(skin => skin.id === state.pieceSkin);
  if (selected) document.body.classList.add(`gc-piece-${selected.id}`);
  document.body.classList.toggle('gc-no-piece-motion', !state.animations);

  // Apply colors only when selected. On reload, the main renderer's saved
  // colors stay authoritative, so its style never flashes and resets.
  if (applyPreset && selected) {
    const colors = SKIN_COLORS[selected.id];
    api.updateAppearance?.({
      whitePieceColor: colors.white,
      blackPieceColor: colors.black
    });
    const whitePicker = root.querySelector('#gc-white-piece-color');
    const blackPicker = root.querySelector('#gc-black-piece-color');
    if (whitePicker) whitePicker.value = colors.white;
    if (blackPicker) blackPicker.value = colors.black;
  }
  decoratePieces();
}

function useCustomPieceAppearance() {
  if (state.pieceSkin === 'custom') return;
  state.pieceSkin = 'custom';
  saveState();
  document.body.classList.remove(...SKINS.map(skin => `gc-piece-${skin.id}`));
  renderSkins();
}

function decoratePieces() {
  const squares = document.querySelectorAll('[data-square], .square');
  for (const square of squares) {
    // The primary renderer already owns its persisted glass/medieval/modern pieces.
    // Do not let the Online + Club reward-skin observer wrap or reskin those nodes.
    if (square.querySelector('.gc-piece')) continue;

    const walker = document.createTreeWalker(square, NodeFilter.SHOW_TEXT);
    const nodes = [];
    while (walker.nextNode()) {
      const node = walker.currentNode;
      if (node.parentElement?.closest('.gc-piece-glyph')) continue;
      const value = node.textContent.trim();
      if (GLYPHS.has(value.replace(/\uFE0E/g, ''))) nodes.push(node);
    }
    for (const node of nodes) {
      const glyph = node.textContent.trim();
      const span = document.createElement('span');
      span.className = 'gc-piece-glyph gc-piece-enter';
      span.dataset.side = '♔♕♖♗♘♙'.includes(glyph[0]) ? 'white' : 'black';
      span.textContent = glyph;
      node.parentNode.replaceChild(span, node);
      window.setTimeout(() => span.classList.remove('gc-piece-enter'), 280);
    }
  }
}

function installPieceObserver() {
  decoratePieces();
  if (pieceObserver) pieceObserver.disconnect();
  pieceObserver = new MutationObserver(() => {
    if (pieceObserver._scheduled) return;
    pieceObserver._scheduled = true;
    requestAnimationFrame(() => { pieceObserver._scheduled = false; decoratePieces(); });
  });
  pieceObserver.observe(document.body, { childList: true, characterData: true, subtree: true });
}

async function applyPersonality() {
  const id = root.querySelector('#gc-plus-personality').value;
  const preset = PERSONALITIES[id] || PERSONALITIES.balanced;
  state.personality = id; saveState();
  root.querySelector('#gc-plus-personality-note').textContent = `${preset.note} Skill level ${preset.level}, analysis depth ${preset.depth}.`;
  if (!api.engineReady) { toast('Preset saved. It will apply when Stockfish is ready.'); return; }
  try {
    if (typeof api.configureEngine === 'function') await api.configureEngine({ skillLevel: preset.level });
    toast(`${preset.label} engine preset applied.`);
  } catch (error) { toast(`Could not apply engine preset: ${error.message}`); }
}

function renderRewards() {
  const level = levelInfo();
  const label = root.querySelector('#gc-plus-level');
  const bar = root.querySelector('#gc-plus-xpbar');
  if (label) label.textContent = `Level ${level.level} · ${state.xp} XP · ${level.next} XP to next level`;
  if (bar) bar.style.width = `${level.into / 250 * 100}%`;
}

function bindUI() {
  root.querySelector('#gc-plus-profile-save').addEventListener('click', () => {
    state.name = root.querySelector('#gc-plus-name-input').value.trim().slice(0, 20) || 'Player';
    state.avatar = root.querySelector('#gc-plus-avatar-select').value;
    state.banner = root.querySelector('#gc-plus-banner-select').value;
    saveState(); renderProfile(); toast('Player profile saved.');
  });
  root.querySelector('#gc-plus-find-match').addEventListener('click', findMatch);
  root.querySelector('#gc-plus-cancel-match').addEventListener('click', cancelMatch);
  root.querySelector('#gc-plus-create-room').addEventListener('click', createRoom);
  root.querySelector('#gc-plus-join-room').addEventListener('click', () => joinRoom(false));
  root.querySelector('#gc-plus-spectate').addEventListener('click', () => joinRoom(true));
  root.querySelector('#gc-plus-copy-invite').addEventListener('click', copyInvite);
  root.querySelector('#gc-plus-leave-room').addEventListener('click', leaveRoom);
  root.querySelector('#gc-plus-resign').addEventListener('click', async () => {
    try { await emitAck('room:resign'); } catch (error) { toast(error.message); }
  });
  root.querySelector('#gc-plus-chat-send').addEventListener('click', async () => {
    const input = root.querySelector('#gc-plus-chat-input');
    try { await emitAck('chat:send', { text: input.value }); input.value = ''; }
    catch (error) { toast(error.message); }
  });
  root.querySelector('#gc-plus-chat-input').addEventListener('keydown', event => { if (event.key === 'Enter') root.querySelector('#gc-plus-chat-send').click(); });
  root.querySelector('#gc-plus-add-friend').addEventListener('click', addFriend);
  root.querySelector('#gc-plus-friend-input').addEventListener('keydown', event => { if (event.key === 'Enter') addFriend(); });
  root.querySelector('#gc-plus-daily-start').addEventListener('click', startDailyChallenge);
  root.querySelector('#gc-plus-personality').addEventListener('change', () => {
    const preset = PERSONALITIES[root.querySelector('#gc-plus-personality').value];
    root.querySelector('#gc-plus-personality-note').textContent = preset.note;
  });
  root.querySelector('#gc-plus-personality-apply').addEventListener('click', applyPersonality);
  root.querySelector('#gc-plus-settings-save').addEventListener('click', () => {
    state.sound = root.querySelector('#gc-plus-sound').checked;
    state.animations = root.querySelector('#gc-plus-animations').checked;
    const legacySound = root.querySelector('#gc-sound-toggle');
    if (legacySound) { legacySound.checked = state.sound; legacySound.dispatchEvent(new Event('change', { bubbles: true })); }
    saveState(); applyPieceSkin(); toast('Sound and animation settings saved.');
  });

  const params = new URLSearchParams(window.location.search);
  const room = params.get('room');
  const server = params.get('server');
  const serverInput = root.querySelector('#gc-plus-server-url');

  if (server) {
    serverInput.value = server;
  } else if (['localhost', '127.0.0.1', '::1'].includes(window.location.hostname)) {
    serverInput.value = 'http://localhost:3001';
  } else {
    serverInput.value = 'https://glass-chess-sqk0.onrender.com';
  }

  if (room) {
    root.querySelector('#gc-plus-room-code').value = room.toUpperCase();
    window.setTimeout(() => {
      root.querySelector('#gc-plus-room-status').textContent = 'Joining your friend’s invitation…';
      void joinRoom(false);
    }, 650);
  } else {
    try {
      const savedCode = localStorage.getItem('glass-chess-online-room-code') || '';
      const savedToken = savedCode ? localStorage.getItem(`glass-chess-online-resume:${savedCode}`) : '';
      if (savedCode && savedToken) {
        online.code = savedCode;
        online.resumeToken = savedToken;
        root.querySelector('#gc-plus-room-code').value = savedCode;
        window.setTimeout(() => {
          root.querySelector('#gc-plus-room-status').textContent = 'Restoring your previous online game…';
          try { makeSocket(); } catch (error) { root.querySelector('#gc-plus-room-status').textContent = error.message; }
        }, 250);
      }
    } catch { /* Local storage may be disabled. */ }
  }
}

function buildDailyChallenge() {
  const status = root.querySelector('#gc-plus-daily-status');
  const challenge = DAILY_CHALLENGES[Number(todayKey().replaceAll('-', '')) % DAILY_CHALLENGES.length];
  root.querySelector('#gc-plus-daily-title').textContent = challenge.title;
  root.querySelector('#gc-plus-daily-copy').textContent = challenge.text;
  status.textContent = state.lastChallenge === todayKey() ? 'You have already solved today’s challenge. Replay it for practice—no repeat XP.' : 'Today’s challenge is ready. Solve the mate-in-one to earn XP.';
}

export function mountOnlinePlus(chessApi, premiumRoot) {
  if (document.getElementById('gc-plus-online-mounted')) return;
  api = chessApi;
  root = premiumRoot;
  state = loadState();
  state.sound = Boolean(api.soundsEnabled);
  saveState();
  injectStyles();
  mountTab();
  const marker = document.createElement('span'); marker.id = 'gc-plus-online-mounted'; marker.hidden = true; root.appendChild(marker);
  bindUI();
  renderProfile();
  renderMissions();
  renderAchievements();
  renderSkins();
  renderFriends();
  renderRoomButtons();
  buildDailyChallenge();
  applyPieceSkin();
  installPieceObserver();
  window.GlassChessOnlinePlus = {
    isOnline() { return Boolean(online.code); },
    isMatchmaking() { return matchmakingActive || onlineRequestActive; },
    exitOnlineSession(options = {}) { return leaveRoom(options); },
    getPlayers() { return online.lastState?.players || null; },
    canMove(side = api.turn) {
      return Boolean(
        online.code &&
        socket?.connected &&
        (online.role === 'w' || online.role === 'b') &&
        online.side === side &&
        online.lastState &&
        online.lastState.turn === side &&
        !online.lastState.gameOver &&
        !online.lastState.resigned
      );
    },
    showMoveDenied() {
      const status = root.querySelector('#gc-plus-room-status');
      if (status) status.textContent = online.role === 'spectator'
        ? 'Spectators cannot move pieces.'
        : !socket?.connected
          ? 'You are disconnected. Reconnect before moving.'
          : 'It is not your turn. Only your assigned color can move.';
    },
    isSyncing() { return online.syncing; },
    onManualAppearanceChange() { useCustomPieceAppearance(); },
    onReset() { finishedFen = ''; },
    handleMove(move, beforeFen, afterFen) {
      if (online.syncing) return;
      if (!handleLocalMove(move)) return;
      if (dailyChallenge.active) {
        const moveUci = `${move.from}${move.to}${move.promotion || ''}`.toLowerCase();
        if (moveUci === dailyChallenge.solution) {
          dailyChallenge.active = false; dailyChallenge.solved = true;
          if (dailyChallenge.rewardEligible) {
            state.lastChallenge = todayKey(); saveState();
            root.querySelector('#gc-plus-daily-status').textContent = `Solved! ${dailyChallenge.notation} is checkmate. Daily reward claimed.`;
            grantXP(60, 'Game of the day solved'); progressMission('puzzle', 1); awardAchievement('daily-challenge');
          } else {
            root.querySelector('#gc-plus-daily-status').textContent = `Solved! ${dailyChallenge.notation} is checkmate. Practice complete—today’s reward was already claimed.`;
          }
          playChime('victory');
        } else {
          root.querySelector('#gc-plus-daily-status').textContent = 'Not quite. Try again — the move will be taken back.';
          window.setTimeout(() => { if (api.fen !== afterFen) return; api.game.undo(); api.render(); }, 80);
        }
      }
      progressMission('moves', 1);
      if (!state.achievements.includes('first-move')) awardAchievement('first-move');
      if (api.gameOver && finishedFen !== api.fen) {
        finishedFen = api.fen;
        if (api.checkmate) awardAchievement('first-mate');
        showVictory(api.checkmate ? 'Checkmate — the game is over.' : 'Draw — the game is complete.');
      }
    },
    onPuzzleSolved() {
      progressMission('puzzle', 1);
      if (!state.achievements.includes('first-puzzle')) awardAchievement('first-puzzle');
    },
    onReviewComplete() { progressMission('review', 1); },
    getEngineSkillLevel() { return PERSONALITIES[state.personality]?.level ?? PERSONALITIES.balanced.level; },
    onGameFinished() {
      if (api.checkmate && !state.achievements.includes('first-mate')) awardAchievement('first-mate');
      const games = Number(document.querySelector('#gc-games')?.textContent || 0);
      if (games >= 10) awardAchievement('ten-games');
    }
  };
  if (api.engineReady) void applyPersonality();
  else {
    const wait = window.setInterval(() => {
      if (!document.getElementById('gc-plus-online-mounted')) { clearInterval(wait); return; }
      if (api.engineReady) { clearInterval(wait); void applyPersonality(); }
    }, 800);
  }
  console.log('Glass Chess Online + Club loaded.');
}

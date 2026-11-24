
import { io } from 'socket.io-client';

const STORE_KEY = 'glass-chess-online-plus-v1';
const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
const GLYPHS = new Set(['♔','♕','♖','♗','♘','♙','♚','♛','♜','♝','♞','♟']);
const SKINS = [
  { id: 'royal', name: 'Royal Gold', unlock: 0, icon: '♕', desc: 'Ivory and gold with polished depth.' },
  { id: 'obsidian', name: 'Obsidian', unlock: 100, icon: '♚', desc: 'Dark steel with a cool silver edge.' },
  { id: 'neon', name: 'Neon Pulse', unlock: 250, icon: '♘', desc: 'Electric cyan and violet glow.' },
  { id: 'crimson', name: 'Crimson', unlock: 450, icon: '♜', desc: 'Pearl white against a ruby finish.' },
  { id: 'frost', name: 'Frost', unlock: 700, icon: '♗', desc: 'Icy platinum and blue highlights.' }
];
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
let online = { code: '', role: '', side: '', lastState: null, syncing: false, previousMode: 'computer', previousColor: 'white' };
let dailyChallenge = { active: false, solution: '', notation: '', solved: false, rewardEligible: false };
let finishedFen = '';
let pieceObserver = null;
let victoryTimer = null;
let socketBound = false;

function todayKey() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function defaultState() {
  return {
    name: 'Player', avatar: '♞', banner: 'aurora', xp: 0, pieceSkin: 'royal',
    personality: 'balanced', animations: true, sound: true, friends: [], achievements: [],
    missionDay: todayKey(), missionProgress: { moves: 0, puzzle: 0, review: 0 }, missionClaimed: [],
    lastChallenge: '',
  };
}

function loadState() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORE_KEY) || '{}');
    const value = { ...defaultState(), ...saved };
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
  window.setTimeout(() => el.classList.remove('show'), 2500);
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
    #gc-plus-victory .confetti{position:absolute;inset:-20px;pointer-events:none;overflow:hidden}
    #gc-plus-victory .confetti i{position:absolute;top:-20px;width:7px;height:13px;border-radius:2px;background:var(--c);left:var(--x);animation:gc-confetti var(--t) linear infinite;animation-delay:var(--d)}
    #gc-plus-victory .card button{margin-top:15px;padding:10px 18px;border-radius:10px;background:#e9d5a3;color:#182033;border:0;font-weight:800}
    @keyframes gc-victory-fade{from{opacity:0}to{opacity:1}}@keyframes gc-confetti{to{transform:translate3d(30px,600px,0) rotate(650deg)}}
    .gc-piece-glyph{display:inline-block!important;font-family:'Apple Symbols','Segoe UI Symbol','Noto Sans Symbols 2',serif!important;font-weight:900!important;line-height:1!important;transition:transform .16s ease,filter .16s ease!important;transform:translateZ(0);white-space:nowrap;user-select:none;-webkit-font-smoothing:antialiased}
    .gc-piece-glyph.gc-piece-enter{animation:gc-piece-arrive .22s cubic-bezier(.2,.8,.2,1)}
    @keyframes gc-piece-arrive{from{opacity:.65;transform:translateY(-5px) scale(.84)}to{opacity:1;transform:translateY(0) scale(1)}}
    [data-square]:hover .gc-piece-glyph,.square:hover .gc-piece-glyph{transform:translateY(-2px) scale(1.07);filter:drop-shadow(0 5px 4px rgba(0,0,0,.35))}
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
      <label class="gc-plus-field">Online server address<input id="gc-plus-server-url" value="http://localhost:3001" spellcheck="false"></label>
      <div class="gc-plus-actions"><button class="primary" id="gc-plus-connect">Connect</button><button id="gc-plus-create-room">Create private room</button></div>
      <div class="gc-plus-grid"><label class="gc-plus-field">Room code<input id="gc-plus-room-code" maxlength="8" placeholder="ABC123"></label><div style="display:flex;align-items:end;gap:6px"><button id="gc-plus-join-room" style="flex:1">Join</button><button id="gc-plus-spectate" style="flex:1">Spectate</button></div></div>
      <div class="gc-plus-status" id="gc-plus-room-status">Connect to the online server, then create a room or enter a friend's code.</div>
      <div class="gc-plus-actions"><button id="gc-plus-copy-invite" disabled>Copy invitation link</button><button id="gc-plus-leave-room" disabled>Leave room</button><button id="gc-plus-resign" disabled>Resign</button></div>
      <div class="gc-plus-small">Private rooms use server-validated legal moves. To play over the internet, the server must be hosted on a public HTTPS-compatible service. Localhost only reaches this computer.</div>
    </div>
    <div class="gc-card"><div class="gc-row"><h4>Room chat</h4><span class="gc-muted" id="gc-plus-room-people">No room</span></div><div class="gc-plus-chat" id="gc-plus-chat"><p class="gc-plus-small">Room chat appears here after you join.</p></div><div class="gc-plus-actions"><input id="gc-plus-chat-input" maxlength="240" placeholder="Message your room" aria-label="Room chat message"><button id="gc-plus-chat-send">Send</button></div></div>
    <div class="gc-card"><div class="gc-row"><h4>Friends list</h4><span class="gc-pill" id="gc-plus-friend-count">0 friends</span></div><div class="gc-plus-actions"><input id="gc-plus-friend-input" maxlength="20" placeholder="Friend's display name"><button id="gc-plus-add-friend">Add friend</button></div><div id="gc-plus-friends" class="gc-results"><div class="gc-empty">Add a friend to start your local list.</div></div><p class="gc-plus-small">This is a saved contacts list on this device. Invitations are shared through your private room link; accounts and presence syncing are not enabled.</p></div>
    <div class="gc-card"><div class="gc-row"><h4>Daily missions</h4><span class="gc-pill" id="gc-plus-mission-date">Today</span></div><div id="gc-plus-missions"></div><div class="gc-plus-small">Complete missions to earn XP and unlock new chess-piece designs.</div></div>
    <div class="gc-card"><div class="gc-row"><h4>Game of the day</h4><span class="gc-pill">Daily challenge</span></div><div class="gc-stat" id="gc-plus-daily-title" style="font-size:18px">Find the forced mate</div><p class="gc-muted" id="gc-plus-daily-copy">White to move. Find the move that ends the game immediately.</p><div class="gc-plus-actions"><button class="primary" id="gc-plus-daily-start">Start today's challenge</button></div><div class="gc-plus-status" id="gc-plus-daily-status">One tactical challenge, refreshed each day.</div></div>
    <div class="gc-card"><div class="gc-row"><h4>Achievements</h4><span class="gc-pill" id="gc-plus-achievement-count">0 / ${ACHIEVEMENTS.length}</span></div><div id="gc-plus-achievements"></div></div>
    <div class="gc-card"><div class="gc-row"><h4>Unlockable chess-piece designs</h4><span class="gc-pill" id="gc-plus-skin-xp">0 XP</span></div><div id="gc-plus-skins" class="gc-plus-skins"></div><p class="gc-plus-small">Piece designs use stylized light and dark chess glyphs with gradients, metallic edges, shadows and move animations. Earn XP to unlock more sets.</p></div>
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
  root.querySelectorAll('[data-skin]').forEach(button => button.addEventListener('click', () => {
    const skin = SKINS.find(item => item.id === button.dataset.skin);
    if (!skin || state.xp < skin.unlock) return;
    state.pieceSkin = skin.id;
    saveState(); applyPieceSkin(); renderSkins();
    toast(`${skin.name} piece set equipped.`);
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
    window.GlassChessPremium?.onLoadedGame?.(snapshot.history || [], snapshot.fen);
  } catch (error) {
    root.querySelector('#gc-plus-room-status').textContent = `Could not sync this game: ${error.message}`;
  }
  api.setReplayLock(online.role === 'spectator' || Boolean(snapshot.gameOver || snapshot.resigned));
  if (online.role === 'w' || online.role === 'b') api.setOnlineSide(online.role);
  const white = snapshot.players?.w?.name || 'Waiting for White';
  const black = snapshot.players?.b?.name || 'Waiting for Black';
  root.querySelector('#gc-plus-room-status').textContent = `${online.role === 'spectator' ? 'Spectating' : `Playing as ${online.role === 'w' ? 'White' : 'Black'}`} · ${white} vs ${black} · ${snapshot.result}`;
  root.querySelector('#gc-plus-room-people').textContent = `${Number(snapshot.spectators || 0)} spectators`;
  renderRoomButtons();
  window.setTimeout(() => { online.syncing = false; }, 0);
  if (snapshot.checkmate || snapshot.resigned) {
    if (snapshot.checkmate) awardAchievement('first-mate');
    showVictory(snapshot.result || 'Game over');
  }
}

function makeSocket() {
  const input = root.querySelector('#gc-plus-server-url');
  const url = input.value.trim().replace(/\/$/, '');
  if (!/^https?:\/\//i.test(url)) throw new Error('Enter a server address beginning with http:// or https://.');
  if (socket) {
    try { socket.disconnect(); } catch {}
    socket = null;
  }
  socket = io(url, { transports: ['websocket', 'polling'], reconnection: true, timeout: 8000 });
  root.querySelector('#gc-plus-room-status').textContent = `Connecting to ${url}…`;
  socket.on('connect', () => {
    root.querySelector('#gc-plus-connection').textContent = 'Connected';
    if (!online.code) root.querySelector('#gc-plus-room-status').textContent = 'Connected. Create a room or enter a room code.';
    renderRoomButtons();
  });
  socket.on('connect_error', error => {
    root.querySelector('#gc-plus-connection').textContent = 'Connection error';
    root.querySelector('#gc-plus-room-status').textContent = `Could not connect: ${error.message}. Check the server is running at ${url}.`;
    renderRoomButtons();
  });
  socket.on('disconnect', reason => {
    root.querySelector('#gc-plus-connection').textContent = 'Disconnected';
    root.querySelector('#gc-plus-room-status').textContent = `Disconnected: ${reason}. Reconnect to continue.`;
    renderRoomButtons();
  });
  socket.on('room:state', snapshot => showRoomState(snapshot));
  socket.on('chat:message', addChatMessage);
  return socket;
}

function emitAck(event, payload = {}) {
  return new Promise((resolve, reject) => {
    if (!socket?.connected) return reject(new Error('Not connected to the online server.'));
    socket.emit(event, payload, result => result?.ok ? resolve(result) : reject(new Error(result?.error || 'The server rejected that request.')));
  });
}

function applyRoomJoin(result) {
  online.code = result.code;
  online.role = result.role;
  online.side = result.role === 'w' || result.role === 'b' ? result.role : '';
  online.lastState = result.state;
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

async function createRoom() {
  try {
    if (!socket?.connected) makeSocket();
    await waitForSocket();
    const result = await emitAck('room:create', { name: state.name });
    online.previousMode = api.mode;
    online.previousColor = api.playerColor;
    applyRoomJoin(result);
    toast(`Room ${result.code} created. Share the invitation link.`);
  } catch (error) { root.querySelector('#gc-plus-room-status').textContent = error.message; }
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
  try {
    if (!socket?.connected) makeSocket();
    await waitForSocket();
    online.previousMode = api.mode;
    online.previousColor = api.playerColor;
    const code = root.querySelector('#gc-plus-room-code').value.trim().toUpperCase();
    const result = await emitAck(spectate ? 'room:spectate' : 'room:join', { code, name: state.name });
    applyRoomJoin(result);
    if (spectate) toast(`Watching room ${result.code}.`);
    else toast(`Joined room ${result.code}.`);
  } catch (error) { root.querySelector('#gc-plus-room-status').textContent = error.message; }
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
  socket.emit('game:move', { code: online.code, move: { from: move.from, to: move.to, promotion: move.promotion } }, result => {
    if (!result?.ok) {
      root.querySelector('#gc-plus-room-status').textContent = result?.error || 'Move rejected by server.';
      if (online.lastState) showRoomState(online.lastState);
    }
  });
  return true;
}

async function leaveRoom() {
  if (!online.code) return;
  try { if (socket?.connected) await emitAck('room:leave'); } catch {}
  online.code = ''; online.role = ''; online.side = ''; online.lastState = null;
  api.setReplayLock(false);
  api.setMode(online.previousMode || 'computer');
  if (online.previousColor) api.setOnlineSide(online.previousColor === 'black' ? 'b' : 'w');
  root.querySelector('#gc-plus-room-status').textContent = 'You left the room.';
  root.querySelector('#gc-plus-room-people').textContent = 'No room';
  renderRoomButtons();
}

async function copyInvite() {
  if (!online.code) return;
  const url = new URL(window.location.href);
  url.searchParams.set('room', online.code);
  url.searchParams.set('server', root.querySelector('#gc-plus-server-url').value.trim());
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

function startDailyChallenge() {
  if (online.code) { toast('Leave your online room before starting a solo challenge.'); return; }
  if (api.history.length && !window.confirm('Starting the daily challenge replaces the current board. Save your game first if you need it. Continue?')) return;
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
  if (!state.animations) { toast(message); return; }
  const existing = document.getElementById('gc-plus-victory');
  if (existing) existing.remove();
  const overlay = document.createElement('div');
  overlay.id = 'gc-plus-victory';
  const confetti = Array.from({ length: 34 }, (_, i) => `<i style="--x:${(i * 37) % 100}%;--d:-${(i % 9) * .27}s;--t:${2.4 + (i % 5) * .3}s;--c:${['#f5d98a','#8ed6ff','#c4a4ff','#f49ea8','#a7e6c1'][i % 5]}"></i>`).join('');
  overlay.innerHTML = `<div class="card"><div class="confetti">${confetti}</div><div class="gc-plus-crown">♛</div><div class="gc-plus-small" style="letter-spacing:.2em">GLASS CHESS</div><h2>${esc(message.toLowerCase().includes('checkmate') ? 'CHECKMATE' : 'GAME COMPLETE')}</h2><p>${esc(message)}</p><button type="button" id="gc-plus-victory-close">Back to board</button></div>`;
  document.body.appendChild(overlay);
  overlay.querySelector('#gc-plus-victory-close').addEventListener('click', () => overlay.remove());
  if (victoryTimer) clearTimeout(victoryTimer);
  victoryTimer = window.setTimeout(() => overlay.remove(), 6500);
  playChime('victory');
}

function applyPieceSkin() {
  document.body.classList.remove(...SKINS.map(skin => `gc-piece-${skin.id}`));
  document.body.classList.add(`gc-piece-${state.pieceSkin}`);
  document.body.classList.toggle('gc-no-piece-motion', !state.animations);
  decoratePieces();
}

function decoratePieces() {
  const squares = document.querySelectorAll('[data-square], .square');
  for (const square of squares) {
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
  root.querySelector('#gc-plus-connect').addEventListener('click', () => {
    try { makeSocket(); } catch (error) { root.querySelector('#gc-plus-room-status').textContent = error.message; }
  });
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

  if (room) root.querySelector('#gc-plus-room-code').value = room.toUpperCase();
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
    isSyncing() { return online.syncing; },
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

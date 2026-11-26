import { ChessEngine } from "./engine.js";

const STORAGE_KEY = 'glass-chess-premium-v1';
const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

const OPENINGS = [
  { seq: ['e4', 'e5', 'Nf3', 'Nc6', 'Bb5'], name: 'Ruy Lopez', family: 'Open Game', next: ['Ba4', 'Bxc6', 'O-O'] },
  { seq: ['e4', 'e5', 'Nf3', 'Nc6', 'Bc4'], name: 'Italian Game', family: 'Open Game', next: ['Bc5', 'Nf6', 'd6'] },
  { seq: ['e4', 'c5'], name: 'Sicilian Defense', family: 'Semi-open Game', next: ['Nf3', 'Nc3', 'c3'] },
  { seq: ['e4', 'e6'], name: 'French Defense', family: 'Semi-open Game', next: ['d4', 'd3', 'Nf3'] },
  { seq: ['e4', 'c6'], name: 'Caro-Kann Defense', family: 'Semi-open Game', next: ['d4', 'Nc3', 'Nd2'] },
  { seq: ['e4', 'd5'], name: 'Scandinavian Defense', family: 'Semi-open Game', next: ['exd5', 'Nc3'] },
  { seq: ['d4', 'd5', 'c4'], name: "Queen's Gambit", family: 'Closed Game', next: ['e6', 'c6', 'dxc4'] },
  { seq: ['d4', 'Nf6', 'c4', 'g6'], name: "King's Indian Defense", family: 'Indian Defense', next: ['Nc3', 'Nf3', 'g3'] },
  { seq: ['Nf3', 'd5', 'c4'], name: 'English Opening', family: 'Flank Opening', next: ['e6', 'c6', 'd4'] },
  { seq: ['d4', 'Nf6', 'c4', 'e6'], name: 'Indian Game', family: 'Indian Defense', next: ['Nc3', 'Nf3', 'g3'] }
];

const THEMES = {
  midnight: { label: 'Midnight', light: '#d9dfeb', dark: '#52647f', accent: '#83b8ff', panel: '#111827' },
  forest: { label: 'Forest', light: '#e8e1c9', dark: '#63866c', accent: '#b5d49c', panel: '#14231b' },
  marble: { label: 'Marble', light: '#eee9e2', dark: '#9c9a99', accent: '#d8b77b', panel: '#242321' },
  ocean: { label: 'Ocean', light: '#d9edf2', dark: '#39778c', accent: '#6ed2e5', panel: '#10232d' },
  aurora: { label: 'Aurora', light: '#e9e8f7', dark: '#5965a2', accent: '#aab8ff', panel: '#17182e' },
  royal: { label: 'Royal', light: '#efe2c9', dark: '#604777', accent: '#e6c078', panel: '#211a2d' },
  sunset: { label: 'Sunset', light: '#f7dfc8', dark: '#b85f50', accent: '#ffb779', panel: '#2b1920' },
  carbon: { label: 'Carbon', light: '#d5d9df', dark: '#3a4657', accent: '#8fbce9', panel: '#111720' }
};

const DEFAULT_DATA = {
  name: 'Player', rating: 1200, games: 0, wins: 0, draws: 0, losses: 0,
  puzzlesSolved: 0, puzzleStreak: 0, bestPuzzleStreak: 0,
  savedGames: [], sound: true, theme: 'midnight', timeControl: '5+0'
};

let api;
let root;
let data;
let moves = [];
let positions = [];
let startFen = START_FEN;
let replaying = false;
let suppressTracking = false;
let puzzle = null;
let lastRecordedResult = '';
let reviewResults = [];
let audioContext = null;
let liveAnalysisToken = 0;
let liveAnalysisRunning = false;
let liveAnalysisPaused = false;
let liveAnalysisScheduled = false;
let liveAnalysisTimer = null;
let liveAnalysisStopPromise = Promise.resolve();
let liveAnalysisEngine = null;
let liveAnalysisEngineReady = null;
let liveAnalysisSuppressed = false;
let reviewToken = 0;
let puzzleToken = 0;

function loadData() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
    return { ...DEFAULT_DATA, ...saved, savedGames: Array.isArray(saved.savedGames) ? saved.savedGames : [] };
  } catch {
    return { ...DEFAULT_DATA };
  }
}

function saveData() {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(data)); }
  catch (error) { console.warn('Could not save Glass Chess profile:', error); }
}

function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
}

function uciFromMove(move) {
  return `${move.from}${move.to}${move.promotion || ''}`.toLowerCase();
}

function scoreFromInfo(info) {
  if (!info) return null;

  if (typeof info === 'string') {
    const mate = info.match(/\bscore\s+mate\s+(-?\d+)/);
    const cp = info.match(/\bscore\s+cp\s+(-?\d+)/);
    if (mate) return Math.sign(Number(mate[1]) || 1) * 10000;
    if (cp) return Number(cp[1]) / 100;
    return null;
  }

  const score = info.score ?? info.evaluation ?? info.eval ?? info.centipawns;
  if (score && typeof score === 'object') {
    const type = String(score.type || score.kind || '').toLowerCase();
    const value = Number(score.value ?? score.cp ?? score.mate ?? score.score);
    if (!Number.isFinite(value)) return null;
    if (type.includes('mate') || score.mate != null) return Math.sign(value || 1) * 10000;
    if (type === 'cp' || score.cp != null) return value / 100;
    return Math.abs(value) > 10 ? value / 100 : value;
  }
  if (typeof score === 'number' && Number.isFinite(score)) {
    return Math.abs(score) > 10 ? score / 100 : score;
  }
  return null;
}

function evalLabel(value) {
  if (!Number.isFinite(value)) return '—';
  if (Math.abs(value) >= 90) return value > 0 ? 'M+' : 'M−';
  return `${value > 0 ? '+' : ''}${value.toFixed(2)}`;
}

function installStyles() {
  if (document.getElementById('gc-premium-style')) return;
  const style = document.createElement('style');
  style.id = 'gc-premium-style';
  style.textContent = `
    #gc-premium{--gc-accent:#83b8ff;--gc-panel:#111827;color:var(--text,#e8edf5);margin-top:18px;padding-top:16px;border-top:1px solid var(--border,rgba(255,255,255,.12));font:inherit}
    #gc-premium *{box-sizing:border-box}#gc-premium .gc-head{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:12px}
    #gc-premium .gc-brand{font-size:14px;font-weight:900;letter-spacing:.12em}#gc-premium .gc-tag{font-size:10px;letter-spacing:.12em;border:1px solid var(--gc-accent);color:var(--gc-accent);padding:5px 8px;border-radius:999px}
    #gc-premium .gc-tabs{display:flex;gap:6px;flex-wrap:wrap;margin:12px 0 14px}#gc-premium button,#gc-premium select,#gc-premium input{font:inherit}
    #gc-premium button{border:1px solid var(--border,rgba(255,255,255,.16));background:rgba(255,255,255,.06);color:inherit;border-radius:10px;padding:8px 11px;cursor:pointer;transition:transform .16s ease,border-color .16s ease,background .16s ease}
    #gc-premium button:hover{transform:translateY(-1px);border-color:var(--gc-accent)}#gc-premium button.primary{background:var(--gc-accent);color:#101722;border-color:transparent;font-weight:800}
    #gc-premium button.active{border-color:var(--gc-accent);background:color-mix(in srgb,var(--gc-accent) 18%,transparent)}
    #gc-premium select,#gc-premium input{width:100%;min-width:0;background:rgba(127,127,127,.12);border:1px solid var(--border,rgba(255,255,255,.18));color:inherit;border-radius:9px;padding:9px}
    #gc-premium option{color:#111}#gc-premium .gc-view{display:none;animation:gc-in .2s ease}#gc-premium .gc-view.active{display:block}@keyframes gc-in{from{opacity:.35;transform:translateY(4px)}to{opacity:1;transform:none}}
    #gc-premium .gc-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:9px}#gc-premium .gc-card{min-width:0;border:1px solid var(--border,rgba(255,255,255,.12));background:rgba(127,127,127,.07);border-radius:13px;padding:12px;margin-bottom:9px}
    #gc-premium .gc-card h4{font-size:12px;letter-spacing:.07em;text-transform:uppercase;margin:0 0 9px;opacity:.78}#gc-premium .gc-muted{font-size:11px;opacity:.68;line-height:1.45}#gc-premium .gc-stat{font-size:22px;font-weight:850;letter-spacing:-.04em;font-variant-numeric:tabular-nums}
    #gc-premium .gc-stat-label{font-size:10px;opacity:.68;text-transform:uppercase;letter-spacing:.08em}#gc-premium .gc-clock{font-size:24px;font-weight:900;font-variant-numeric:tabular-nums;letter-spacing:.03em}
    #gc-premium .gc-clock.active{color:var(--gc-accent)}#gc-premium .gc-row{display:flex;align-items:center;justify-content:space-between;gap:8px}#gc-premium .gc-actions{display:flex;gap:7px;flex-wrap:wrap;margin-top:9px}
    #gc-premium .gc-actions>*{flex:1 1 auto}#gc-premium .gc-move{display:flex;justify-content:space-between;gap:8px;padding:7px 8px;border-bottom:1px solid var(--border,rgba(255,255,255,.08));font-size:12px}
    #gc-premium .gc-pill{border-radius:999px;padding:3px 7px;font-size:10px;background:rgba(127,127,127,.18);white-space:nowrap}#gc-premium .gc-good{color:#69d6a3}#gc-premium .gc-warn{color:#efc36d}#gc-premium .gc-bad{color:#ff8585}
    #gc-premium .gc-evalbar{height:10px;border-radius:999px;overflow:hidden;background:rgba(127,127,127,.3);display:flex;margin:10px 0 5px}#gc-premium .gc-evalbar>span{display:block;background:#e9edf3;transition:width .25s ease}
    #gc-premium .gc-evalbar>i{display:block;background:#27364b;flex:1}#gc-premium .gc-board-themes{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:7px}
    #gc-premium .gc-theme-swatch{height:35px;border-radius:8px;border:2px solid transparent;margin-bottom:5px}#gc-premium .gc-board-themes button.active{border-color:var(--gc-accent)}
    #gc-premium .gc-range{width:100%;accent-color:var(--gc-accent)}#gc-premium .gc-results{max-height:230px;overflow:auto}
    #gc-premium .gc-empty{padding:13px;text-align:center;border:1px dashed var(--border,rgba(255,255,255,.2));border-radius:11px;font-size:12px;opacity:.7}
    #gc-premium .gc-graph{width:100%;height:110px;display:block;background:rgba(127,127,127,.06);border-radius:9px}#gc-premium .gc-graph polyline{fill:none;stroke:var(--gc-accent);stroke-width:2.5;vector-effect:non-scaling-stroke}
    body.gc-theme-forest #gc-premium{--gc-accent:#b5d49c;--gc-panel:#14231b}body.gc-theme-marble #gc-premium{--gc-accent:#d8b77b;--gc-panel:#242321}body.gc-theme-ocean #gc-premium{--gc-accent:#6ed2e5;--gc-panel:#10232d}
    body.gc-theme-forest .square.light,body.gc-theme-forest [data-square].light{background:#e8e1c9!important}body.gc-theme-forest .square.dark,body.gc-theme-forest [data-square].dark{background:#63866c!important}
    body.gc-theme-marble .square.light,body.gc-theme-marble [data-square].light{background:#eee9e2!important}body.gc-theme-marble .square.dark,body.gc-theme-marble [data-square].dark{background:#9c9a99!important}
    body.gc-theme-ocean .square.light,body.gc-theme-ocean [data-square].light{background:#d9edf2!important}body.gc-theme-ocean .square.dark,body.gc-theme-ocean [data-square].dark{background:#39778c!important}
    body.gc-theme-midnight .square.light,body.gc-theme-midnight [data-square].light{background:#d9dfeb!important}body.gc-theme-midnight .square.dark,body.gc-theme-midnight [data-square].dark{background:#52647f!important}
    @media(max-width:600px){#gc-premium .gc-grid{grid-template-columns:1fr 1fr}#gc-premium .gc-board-themes{grid-template-columns:repeat(2,minmax(0,1fr))}#gc-premium .gc-clock{font-size:20px}}
  `;
  document.head.appendChild(style);
}

function buildInterface() {
  const panel = document.querySelector('.analysis-panel');
  if (!panel) throw new Error('The existing .analysis-panel was not found.');
  root = document.createElement('section');
  root.id = 'gc-premium';
  root.innerHTML = `
    <div class="gc-head"><div><div class="gc-brand">GLASS CHESS</div><div class="gc-muted">Your premium chess workspace</div></div><span class="gc-tag">PREMIUM SUITE</span></div>
    <nav class="gc-tabs" aria-label="Premium features">
      <button class="active" data-tab="home">Overview</button><button data-tab="train">Train</button><button data-tab="review">Review</button><button data-tab="custom">Customize</button>
    </nav>
    <section class="gc-view active" data-view="home">
      <div class="gc-card"><div class="gc-row"><div><div class="gc-stat-label">Player profile</div><div class="gc-stat" id="gc-player-name">Player</div><div class="gc-muted">Local rating · saved on this device</div></div><div class="gc-stat" id="gc-rating">1200</div></div><div class="gc-actions"><input id="gc-name-input" maxlength="22" aria-label="Player name" placeholder="Your display name"><button id="gc-save-name">Save name</button></div></div>
      <div class="gc-grid">
        <div class="gc-card"><div class="gc-stat" id="gc-wins">0</div><div class="gc-stat-label">Wins</div></div>
        <div class="gc-card"><div class="gc-stat" id="gc-games">0</div><div class="gc-stat-label">Games played</div></div>
        <div class="gc-card"><div class="gc-stat" id="gc-draws">0</div><div class="gc-stat-label">Draws</div></div>
        <div class="gc-card"><div class="gc-stat" id="gc-losses">0</div><div class="gc-stat-label">Losses</div></div>
      </div>
      <div class="gc-card"><div class="gc-row"><h4>Chess clock</h4><span class="gc-pill">One clock · Game Lab</span></div><p class="gc-muted">Time controls and the live countdown are managed in Game Lab, so there is only one authoritative clock per match.</p><button id="gc-open-clock-tools">Open Game Lab clock</button></div>
      <div class="gc-card gc-live-engine-card">
        <div class="gc-row"><h4>Live Engine Lab</h4><span class="gc-pill" id="gc-engine-status">LIVE · Starting automatically</span></div>
        <div class="gc-row gc-live-score-row"><strong id="gc-live-eval">—</strong><span class="gc-muted" id="gc-live-depth">Ready for analysis</span></div>
        <div class="gc-evalbar"><span id="gc-eval-white" style="width:50%"></span><i></i></div>
        <p id="gc-live-progress" class="gc-engine-progress">Live analysis follows the current board automatically.</p>
        <div class="gc-live-result"><strong>Best move</strong><div id="gc-live-best" class="gc-muted">Analyze the current position to get a best-move recommendation.</div></div>
        <div class="gc-live-result"><strong>Principal variation</strong><div id="gc-live-pv" class="gc-muted">The engine’s suggested continuation will appear here.</div></div>
        <label class="gc-live-depth-label" for="gc-live-depth-select">Analysis depth</label>
        <select id="gc-live-depth-select">
          <option value="10">Quick · Depth 10</option>
          <option value="14" selected>Balanced · Depth 14</option>
          <option value="18">Deep · Depth 18</option>
          <option value="22">Very deep · Depth 22</option>
        </select>
        <div class="gc-actions">
          <button class="primary" id="gc-live-analyze">Refresh live analysis</button>
          <button id="gc-live-stop" disabled>Pause live analysis</button>
          <button id="gc-open-analysis">Open Analysis Studio</button>
        </div>
        <p class="gc-muted">Always-on board monitoring. It refreshes after moves and runs in its own Stockfish worker so it never blocks your moves or the computer's turn.</p>
        </div>
      </div>
      <div class="gc-card"><h4>Opening explorer</h4><div id="gc-opening-name" class="gc-stat" style="font-size:17px">Unclassified position</div><div id="gc-opening-family" class="gc-muted">Play a few moves to identify the opening.</div><div id="gc-opening-suggestions" class="gc-actions"></div></div>
      <div class="gc-card"><div class="gc-row"><h4>Game files</h4><span class="gc-muted">Stored in this browser</span></div><div class="gc-actions"><button id="gc-save-game">Save current game</button><button id="gc-export-pgn">Export PGN</button></div><label class="gc-muted" for="gc-saved-games">Saved games</label><select id="gc-saved-games"><option value="">Choose a saved game</option></select><div class="gc-actions"><button id="gc-load-saved">Load selected</button><button id="gc-delete-saved">Delete selected</button></div><div id="gc-save-status" class="gc-muted">Your saved games stay on this device.</div></div>
    </section>
    <section class="gc-view" data-view="train">
      <div class="gc-card"><h4>Engine-generated puzzle lab</h4><div class="gc-stat" id="gc-puzzle-count">0 solved</div><div class="gc-muted">Create a challenge from the position currently on your board. Stockfish chooses the best move; the destination stays hidden until you solve it or ask for a hint.</div><div class="gc-actions"><button class="primary" id="gc-create-puzzle">Create puzzle from position</button><button id="gc-puzzle-hint">Show hint</button></div><p id="gc-puzzle-status" class="gc-muted">No active puzzle. Start one from any position.</p></div>
      <div class="gc-card"><h4>Training routine</h4><div class="gc-move"><span>1. Solve a tactical challenge</span><span class="gc-pill">Puzzle</span></div><div class="gc-move"><span>2. Study the opening name and candidate moves</span><span class="gc-pill">Openings</span></div><div class="gc-move"><span>3. Review your completed game</span><span class="gc-pill">Review</span></div><div class="gc-move"><span>4. Replay the turning point</span><span class="gc-pill">Replay</span></div><p class="gc-muted">Puzzle streak and solved counts are saved locally.</p></div>
    </section>
    <section class="gc-view" data-view="review">
      <div class="gc-card"><div class="gc-row"><h4>Game review</h4><span class="gc-pill" id="gc-review-status">Not analyzed</span></div><div class="gc-grid"><div><div class="gc-stat" id="gc-accuracy">—</div><div class="gc-stat-label">Estimated accuracy</div></div><div><div class="gc-stat" id="gc-review-moves">0</div><div class="gc-stat-label">Moves reviewed</div></div></div><p class="gc-muted">Accuracy is a local estimate based on shallow Stockfish evaluations, not an official Chess.com or FIDE accuracy score.</p><button class="primary" id="gc-review-game">Review this game with Stockfish</button><svg class="gc-graph" id="gc-review-graph" viewBox="0 0 320 110" preserveAspectRatio="none" role="img" aria-label="Evaluation graph"><line x1="0" y1="55" x2="320" y2="55" stroke="currentColor" opacity=".25" stroke-dasharray="4 4"/><polyline points="0,55 320,55" /></svg></div>
      <div class="gc-card"><div class="gc-row"><h4>Move-by-move review</h4><span class="gc-muted" id="gc-review-depth">Depth 7</span></div><div id="gc-move-review" class="gc-results"><div class="gc-empty">Run a review to classify moves.</div></div></div>
      <div class="gc-card"><h4>Replay navigator</h4><div class="gc-row"><span class="gc-muted" id="gc-replay-label">Live position</span><span class="gc-muted" id="gc-replay-count">0 / 0</span></div><input class="gc-range" id="gc-replay-range" type="range" min="0" max="0" value="0"><div class="gc-actions"><button id="gc-replay-start">Start</button><button id="gc-replay-back">Previous</button><button id="gc-replay-forward">Next</button><button id="gc-replay-exit">Exit replay</button></div></div>
    </section>
    <section class="gc-view" data-view="custom">
      <div class="gc-card"><h4>Board themes</h4><div class="gc-board-themes" id="gc-theme-list"></div><p class="gc-muted">Changes the chessboard squares.</p></div>
      <div class="gc-card gc-background-customizer"><h4>Workspace background color</h4>
        <p class="gc-muted">Choose a ready-made color or pick any custom color. This changes the workspace behind the chessboard.</p>
        <div class="gc-background-palette" id="gc-background-list" aria-label="Background color palette">
          <button type="button" data-bg-color="#18202f" aria-label="Deep navy" title="Deep navy"><span style="background:#18202f"></span></button>
          <button type="button" data-bg-color="#243b53" aria-label="Steel blue" title="Steel blue"><span style="background:#243b53"></span></button>
          <button type="button" data-bg-color="#174b49" aria-label="Emerald teal" title="Emerald teal"><span style="background:#174b49"></span></button>
          <button type="button" data-bg-color="#365a3b" aria-label="Forest green" title="Forest green"><span style="background:#365a3b"></span></button>
          <button type="button" data-bg-color="#553879" aria-label="Royal violet" title="Royal violet"><span style="background:#553879"></span></button>
          <button type="button" data-bg-color="#78364f" aria-label="Burgundy" title="Burgundy"><span style="background:#78364f"></span></button>
          <button type="button" data-bg-color="#874b2e" aria-label="Warm copper" title="Warm copper"><span style="background:#874b2e"></span></button>
          <button type="button" data-bg-color="#a36c43" aria-label="Amber" title="Amber"><span style="background:#a36c43"></span></button>
          <button type="button" data-bg-color="#6d747e" aria-label="Stone gray" title="Stone gray"><span style="background:#6d747e"></span></button>
          <button type="button" data-bg-color="#e4e8ee" aria-label="Soft silver" title="Soft silver"><span style="background:#e4e8ee"></span></button>
        </div>
        <label class="gc-background-picker-label" for="gc-background-color">Custom background color
          <input id="gc-background-color" type="color" value="#18202f" aria-label="Choose custom workspace background color">
        </label>
        <p class="gc-muted">Your selection is saved automatically on this device.</p>
      </div>
      <div class="gc-card gc-piece-customizer"><h4>Piece appearance</h4><label for="gc-piece-style">Piece design</label><select id="gc-piece-style"><option value="glass">Glass Classic · Original</option><option value="medieval">Medieval</option><option value="modern">Modern</option></select><div class="gc-piece-colors"><label for="gc-white-piece-color">White pieces<input id="gc-white-piece-color" type="color" value="#f7f2e9" aria-label="White piece color"></label><label for="gc-black-piece-color">Black pieces<input id="gc-black-piece-color" type="color" value="#263244" aria-label="Black piece color"></label></div><p class="gc-muted">Changes the pieces on the board, not the board squares. Your choices are saved on this device.</p></div>
      <div class="gc-card"><div class="gc-row"><h4>Sound effects</h4><label><input id="gc-sound-toggle" type="checkbox" style="width:auto"> Enable move sounds</label></div><p class="gc-muted">Light local sound effects for legal moves and puzzle results.</p></div>
      <div class="gc-card"><h4>Data and privacy</h4><p class="gc-muted">Profile, rating, statistics, saved games, and preferences are stored in this browser using local storage. Nothing is uploaded to a server.</p><div class="gc-actions"><button id="gc-export-data">Export profile data</button><button id="gc-reset-data">Reset profile data</button></div></div>
    </section>
  `;
  panel.appendChild(root);
}

function $(id) { return root.querySelector(`#${id}`); }

function switchTab(name) {
  root.querySelectorAll('[data-tab]').forEach(button => button.classList.toggle('active', button.dataset.tab === name));
  root.querySelectorAll('[data-view]').forEach(view => view.classList.toggle('active', view.dataset.view === name));
}

function renderProfile() {
  $('gc-player-name').textContent = data.name;
  $('gc-rating').textContent = String(data.rating);
  $('gc-name-input').value = data.name;
  $('gc-wins').textContent = String(data.wins);
  $('gc-games').textContent = String(data.games);
  $('gc-draws').textContent = String(data.draws);
  $('gc-losses').textContent = String(data.losses);
  $('gc-puzzle-count').textContent = `${data.puzzlesSolved} solved · ${data.puzzleStreak} streak`;
  data.sound = Boolean(api.soundsEnabled);
  $('gc-sound-toggle').checked = data.sound;
  renderSavedGames();
}

function renderClock() { window.GlassChessGameplaySuite?.renderClock?.(); }
function stopClock() { window.GlassChessGameplaySuite?.stopClock?.(); }
function startClock() { window.GlassChessGameplaySuite?.startClock?.(); }

function playTone(kind = 'move') {
  if (!data.sound) return;
  try {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return;
    audioContext ||= new AudioCtx();
    if (audioContext.state === 'suspended') void audioContext.resume();
    const oscillator = audioContext.createOscillator();
    const gain = audioContext.createGain();
    oscillator.type = 'sine';
    oscillator.frequency.value = kind === 'success' ? 720 : kind === 'error' ? 180 : 430;
    gain.gain.setValueAtTime(0.0001, audioContext.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.055, audioContext.currentTime + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, audioContext.currentTime + 0.12);
    oscillator.connect(gain); gain.connect(audioContext.destination);
    oscillator.start(); oscillator.stop(audioContext.currentTime + 0.13);
  } catch (error) { console.debug('Sound unavailable:', error); }
}

function applyTheme(name) {
  const theme = THEMES[name] ? name : 'midnight';
  Object.keys(THEMES).forEach(key => document.body.classList.toggle(`gc-theme-${key}`, key === theme));
  api.updateAppearance?.({ theme });
  data.theme = theme;
  saveData();
  root.querySelectorAll('[data-theme]').forEach(button => button.classList.toggle('active', button.dataset.theme === theme));
  const boardSquares = [...document.querySelectorAll('[data-square]')];
  const colors = THEMES[theme];
  boardSquares.forEach(square => {
    const squareName = square.dataset.square || '';
    if (!/^[a-h][1-8]$/.test(squareName)) return;
    const file = squareName.charCodeAt(0) - 97;
    const rank = Number(squareName[1]);
    const squareColor = (file + rank) % 2 === 1 ? colors.dark : colors.light;
    square.style.setProperty('background', squareColor, 'important');
  });
}

function renderThemes() {
  $('gc-theme-list').innerHTML = Object.entries(THEMES).map(([key, theme]) => `
    <button data-theme="${key}" class="${data.theme === key ? 'active' : ''}">
      <div class="gc-theme-swatch" style="background:linear-gradient(90deg,${theme.light} 50%,${theme.dark} 50%)"></div>
      <span>${theme.label}</span>
    </button>`).join('');
  applyTheme(data.theme);
}

function openingFor(history) {
  const sans = history.map(move => move.san);
  let found = null;
  for (const opening of OPENINGS) {
    const prefixMatches = opening.seq.every((san, index) => sans[index] === san);
    if (prefixMatches && (!found || opening.seq.length > found.seq.length)) found = opening;
  }
  if (found) return { name: found.name, family: found.family, next: found.next };
  const candidates = OPENINGS.filter(opening => sans.length < opening.seq.length && sans.every((san, index) => opening.seq[index] === san));
  if (candidates.length) return { name: 'Opening in progress', family: 'Possible: ' + candidates.slice(0, 2).map(item => item.name).join(' / '), next: [...new Set(candidates.flatMap(item => item.seq[sans.length] ? [item.seq[sans.length]] : []))].slice(0, 4) };
  const byFirstMove = {
    e4: ['e5', 'c5', 'e6', 'c6'], d4: ['d5', 'Nf6', 'e6'], Nf3: ['d5', 'Nf6', 'c5'], c4: ['e5', 'Nf6', 'c5']
  };
  return { name: sans.length ? 'Unclassified opening' : 'Opening explorer', family: sans.length ? 'Explore common continuations from this position.' : 'Start with 1. e4, 1. d4, 1. Nf3, or 1. c4.', next: sans.length ? (byFirstMove[sans[0]] || []) : ['e4', 'd4', 'Nf3', 'c4'] };
}

function renderOpening() {
  const opening = openingFor(api.history);
  $('gc-opening-name').textContent = opening.name;
  $('gc-opening-family').textContent = opening.family;
  $('gc-opening-suggestions').innerHTML = opening.next.map(move => `<span class="gc-pill">${esc(move)}</span>`).join('') || '<span class="gc-muted">No book suggestion</span>';
}

function renderSavedGames() {
  const selector = $('gc-saved-games');
  if (!selector) return;
  selector.innerHTML = '<option value="">Choose a saved game</option>' + data.savedGames.map((item, index) => `<option value="${index}">${esc(item.title)} · ${esc(item.date)}</option>`).join('');
}

function downloadText(filename, text, type = 'text/plain') {
  const blob = new Blob([text], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url; link.download = filename; document.body.appendChild(link); link.click(); link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function saveCurrentGame() {
  if (!api.history.length) { $('gc-save-status').textContent = 'Make at least one move before saving a game.'; return; }
  const pgn = api.pgn || '';
  const item = { title: `${data.name} · ${new Date().toLocaleDateString()}`, date: new Date().toLocaleString(), pgn, fen: api.fen };
  data.savedGames.unshift(item);
  data.savedGames = data.savedGames.slice(0, 30);
  saveData(); renderSavedGames();
  $('gc-save-status').textContent = 'Game saved on this device.';
}

function exportPgn() {
  if (!api.history.length) { $('gc-save-status').textContent = 'There are no moves to export yet.'; return; }
  downloadText('glass-chess-game.pgn', api.pgn || '', 'application/x-chess-pgn');
  $('gc-save-status').textContent = 'PGN export created.';
}

function recordFinishedGame() {
  if (!api.gameOver || api.mode === 'analysis' || window.GlassChessOnlinePlus?.isOnline?.()) return;
  const pgn = api.pgn || '';
  const key = `${pgn}|${api.fen}`;
  if (key === lastRecordedResult || !api.history.length) return;
  lastRecordedResult = key;
  const termination = api.termination;
  const isDraw = api.draw || Boolean(termination?.draw);
  const winningSide = termination
    ? (termination.winner === 'White' ? 'w' : termination.winner === 'Black' ? 'b' : null)
    : (api.turn === 'w' ? 'b' : 'w');
  const playerSide = api.playerColor === 'black' ? 'b' : 'w';
  const result = isDraw ? 'draw' : winningSide === playerSide ? 'win' : 'loss';
  data.games += 1;
  if (result === 'win') data.wins += 1;
  else if (result === 'loss') data.losses += 1;
  else data.draws += 1;
  if (api.mode === 'computer') {
    const expected = 1 / (1 + Math.pow(10, (1500 - data.rating) / 400));
    const actual = result === 'win' ? 1 : result === 'draw' ? 0.5 : 0;
    data.rating = Math.max(100, Math.round(data.rating + 24 * (actual - expected)));
  }
  const saved = { title: `${result.toUpperCase()} · ${new Date().toLocaleDateString()}`, date: new Date().toLocaleString(), pgn, fen: api.fen };
  data.savedGames.unshift(saved); data.savedGames = data.savedGames.slice(0, 30);
  saveData(); renderProfile(); renderSavedGames();
}

function onMove(move, beforeFen, afterFen) {
  if (suppressTracking || replaying || window.GlassChessOnlinePlus?.isSyncing?.()) return;
  window.GlassChessOnlinePlus?.handleMove?.(move, beforeFen, afterFen);
  moves.push({ from: move.from, to: move.to, promotion: move.promotion, san: move.san, color: move.color });
  positions.push(afterFen);
  renderOpening();
  if (puzzle?.active) handlePuzzleMove(move, afterFen);
  if (api.gameOver) { recordFinishedGame(); stopClock(); window.GlassChessOnlinePlus?.onGameFinished?.(); }
  setTimeout(() => applyTheme(data.theme), 0);
  refreshReplayControls();
  if (!puzzle?.active) scheduleLiveAnalysis(180);
}

function onReset(fen) {
  reviewToken++; puzzleToken++;
  void api.stopSearch?.();
  window.GlassChessOnlinePlus?.onReset?.(fen);
  startFen = fen;
  moves = [];
  positions = [fen];
  replaying = false;
  api.setReplayLock(false);
  puzzle = null;
  stopClock();
  lastRecordedResult = '';
  reviewResults = [];
  $('gc-puzzle-status').textContent = 'New game detected. Create a puzzle from this position.';
  $('gc-move-review').innerHTML = '<div class="gc-empty">Run a review to classify moves.</div>';
  $('gc-accuracy').textContent = '—';
  $('gc-review-moves').textContent = '0';
  $('gc-review-status').textContent = 'Not analyzed';
  renderOpening();
  setTimeout(() => applyTheme(data.theme), 0);
  refreshReplayControls();
  liveAnalysisSuppressed = false;
  scheduleLiveAnalysis(180);
}

function onUndo(history, fen) {
  if (suppressTracking || replaying) return;
  reviewToken++; puzzleToken++; puzzle = null;
  moves = history.map(move => ({ from: move.from, to: move.to, promotion: move.promotion, san: move.san, color: move.color }));
  lastRecordedResult = '';
  try {
    suppressTracking = true;
    positions = api.calculatePositions(startFen, moves);
  } catch (error) {
    console.warn('Could not rebuild replay positions after undo:', error);
    startFen = fen; moves = []; positions = [fen];
  } finally { suppressTracking = false; }
  renderOpening();
  refreshReplayControls();
  liveAnalysisSuppressed = false;
  scheduleLiveAnalysis(180);
}

function onLoadedGame(history, fen) {
  reviewToken++; puzzleToken++; puzzle = null;
  stopClock();
  startFen = api.startFen || START_FEN;
  moves = history.map(move => ({ from: move.from, to: move.to, promotion: move.promotion, san: move.san, color: move.color }));
  try {
    suppressTracking = true;
    positions = api.calculatePositions(startFen, moves);
  } catch (error) {
    console.warn('Could not rebuild loaded PGN positions:', error);
    startFen = fen; moves = []; positions = [fen];
  } finally { suppressTracking = false; }
  replaying = false;
  api.setReplayLock(false);
  renderOpening();
  refreshReplayControls();
  liveAnalysisSuppressed = false;
  scheduleLiveAnalysis(180);
}

function refreshReplayControls() {
  const range = $('gc-replay-range');
  if (!range) return;
  range.max = String(moves.length);
  if (!replaying) range.value = String(moves.length);
  $('gc-replay-count').textContent = `${range.value} / ${moves.length}`;
  $('gc-replay-label').textContent = replaying ? `Replay · ply ${range.value}` : 'Live position';
}

function replayTo(index) {
  const target = Math.max(0, Math.min(moves.length, Number(index) || 0));
  suppressTracking = true;
  replaying = true;
  try {
    api.rebuild(startFen, moves.slice(0, target));
    api.setReplayLock(true);
  } finally {
    suppressTracking = false;
  }
  $('gc-replay-range').value = String(target);
  refreshReplayControls();
  renderOpening();
  scheduleLiveAnalysis(320);
}

function exitReplay() {
  if (!replaying) return;
  suppressTracking = true;
  try {
    api.rebuild(startFen, moves);
    replaying = false;
    api.setReplayLock(false);
  } finally { suppressTracking = false; }
  refreshReplayControls(); renderOpening();
  scheduleLiveAnalysis(180);
}

async function createPuzzle() {
  if (!api.engineReady) { $('gc-puzzle-status').textContent = 'Stockfish is still loading. Try again when the engine is ready.'; return; }
  if (api.thinking) { $('gc-puzzle-status').textContent = 'Wait for the current engine calculation to finish.'; return; }
  if (replaying) exitReplay();
  liveAnalysisSuppressed = true;
  liveAnalysisToken += 1;
  if (liveAnalysisTimer !== null) { clearTimeout(liveAnalysisTimer); liveAnalysisTimer = null; }
  liveAnalysisScheduled = false;
  liveAnalysisRunning = false;
  $('gc-engine-status').textContent = "Live analysis paused for puzzle";
  $('gc-live-progress').textContent = "The engine will stay quiet while you solve the training puzzle.";
  if (liveAnalysisEngine?.activeSearch) {
    const stop = liveAnalysisEngine.stop();
    liveAnalysisStopPromise = Promise.all([liveAnalysisStopPromise, stop]).then(() => undefined).catch(() => {});
  }
  syncLiveAnalysisControls();
  const token = ++puzzleToken, generation = api.generation, fen = api.fen;
  $('gc-puzzle-status').textContent = 'Stockfish is selecting a challenge move…';
  try {
    const result = await api.search(fen, 13, () => {});
    if (token !== puzzleToken || generation !== api.generation || fen !== api.fen || result.cancelled) {
      liveAnalysisSuppressed = false;
      scheduleLiveAnalysis(180);
      return;
    }
    const best = String(result?.bestMove || '').toLowerCase();
    if (!/^[a-h][1-8][a-h][1-8][qrbn]?$/.test(best)) throw new Error('Stockfish did not return a legal move.');
    puzzle = { fen, best, active: true, hinted: false };
    liveAnalysisSuppressed = true;
    api.setMode('analysis', false);
    $('gc-puzzle-status').textContent = `Puzzle ready. Find the best move for ${api.turn === 'w' ? 'White' : 'Black'}.`;
    $('gc-puzzle-hint').textContent = 'Show hint';
    switchTab('train');
  } catch (error) {
    if (token === puzzleToken) $('gc-puzzle-status').textContent = `Puzzle could not be created: ${error.message}`;
    liveAnalysisSuppressed = false;
    scheduleLiveAnalysis(180);
  }
}

async function handlePuzzleMove(move, afterFen) {
  if (!puzzle?.active) return;
  const actual = uciFromMove(move);
  if (actual === puzzle.best) {
    puzzle.active = false;
    data.puzzlesSolved += 1;
    data.puzzleStreak += 1;
    data.bestPuzzleStreak = Math.max(data.bestPuzzleStreak, data.puzzleStreak);
    saveData(); renderProfile(); playTone('success');
    $('gc-puzzle-status').textContent = `Correct! ${move.san} is Stockfish’s top move. Puzzle solved.`;
    liveAnalysisSuppressed = false;
    window.GlassChessOnlinePlus?.onPuzzleSolved?.();
    return;
  }
  data.puzzleStreak = 0; saveData(); renderProfile(); playTone('error');
  $('gc-puzzle-status').textContent = 'Not quite. Your move was rolled back; try another move or ask for a hint.';
  try { await api.stopSearch(); } catch {}
  setTimeout(() => {
    if (!puzzle?.active || api.fen !== afterFen) return;
    api.game.undo(); api.render();
  }, 60);
}

function showPuzzleHint() {
  if (!puzzle?.active) { $('gc-puzzle-status').textContent = 'Create a puzzle first.'; return; }
  puzzle.hinted = true;
  const from = puzzle.best.slice(0, 2);
  const to = puzzle.best.slice(2, 4);
  $('gc-puzzle-status').textContent = `Hint: look for a move starting from ${from}. The destination is ${to}.`;
  $('gc-puzzle-hint').textContent = 'Hint shown';
}

function updateLiveEvaluation(score, info, sideToMove, bestMove = "") {
  const whiteScore = sideToMove === "b" && Number.isFinite(score) ? -score : score;
  $('gc-live-eval').textContent = evalLabel(whiteScore);
  $('gc-live-depth').textContent = info?.depth ? `Depth ${info.depth}` : "Engine evaluation";
  const whitePercent = Number.isFinite(whiteScore)
    ? Math.max(4, Math.min(96, 50 + whiteScore * 9))
    : 50;
  $('gc-eval-white').style.width = `${whitePercent}%`;

  if (bestMove) {
    const promotion = bestMove.length > 4 ? ` = ${bestMove[4].toUpperCase()}` : "";
    $('gc-live-best').textContent = `${bestMove.slice(0, 2)} → ${bestMove.slice(2, 4)}${promotion}`;
  }
  if (Array.isArray(info?.pv) && info.pv.length) {
    $('gc-live-pv').textContent = info.pv.slice(0, 12).join(" ");
  }
}

function formatEngineProgress(info) {
  if (!info) return "Waiting for Stockfish…";
  const parts = [];
  if (info.depth) parts.push(`Depth ${info.depth}`);
  if (info.seldepth) parts.push(`selective ${info.seldepth}`);
  if (Number.isFinite(info.nodes)) parts.push(`${info.nodes.toLocaleString()} nodes`);
  if (Number.isFinite(info.nps)) parts.push(`${info.nps.toLocaleString()} NPS`);
  if (Number.isFinite(info.time)) parts.push(`${(info.time / 1000).toFixed(1)}s`);
  return parts.join(" · ") || "Stockfish is calculating…";
}

function syncLiveAnalysisControls() {
  const refresh = $('gc-live-analyze');
  const pause = $('gc-live-stop');
  if (!refresh || !pause) return;
  refresh.disabled = false;
  refresh.textContent = liveAnalysisPaused ? "Resume live analysis" : "Refresh live analysis";
  pause.disabled = liveAnalysisPaused || (!liveAnalysisRunning && !liveAnalysisScheduled);
}

function prepareLiveAnalysisEngine() {
  if (!liveAnalysisEngine) liveAnalysisEngine = new ChessEngine();
  if (!liveAnalysisEngineReady) {
    liveAnalysisEngineReady = (async () => {
      await liveAnalysisEngine.start();
      await liveAnalysisEngine.configure({ skillLevel: 20, multiPV: 1 });
    })().catch(error => {
      liveAnalysisEngineReady = null;
      throw error;
    });
  }
  return liveAnalysisEngineReady;
}

function scheduleLiveAnalysis(delay = 180) {
  if (!api || liveAnalysisPaused) return;
  if (liveAnalysisTimer !== null) {
    clearTimeout(liveAnalysisTimer);
    liveAnalysisTimer = null;
  }
  const token = ++liveAnalysisToken;
  const fen = api.fen;

  if (liveAnalysisSuppressed || puzzle?.active) {
    liveAnalysisScheduled = false;
    liveAnalysisRunning = false;
    const pendingStop = liveAnalysisEngine?.activeSearch
      ? liveAnalysisEngine.stop()
      : Promise.resolve();
    liveAnalysisStopPromise = Promise.all([liveAnalysisStopPromise, pendingStop]).then(() => undefined).catch(() => {});
    $('gc-engine-status').textContent = "Live analysis paused for puzzle";
    $('gc-live-progress').textContent = "The live engine stays out of the way while you solve this puzzle.";
    syncLiveAnalysisControls();
    return;
  }

  // Invalidate the old position immediately, then wait for its UCI stop acknowledgement
  // before asking the dedicated worker to analyze the newly played position.
  const pendingStop = liveAnalysisEngine?.activeSearch
    ? liveAnalysisEngine.stop()
    : Promise.resolve();
  liveAnalysisStopPromise = Promise.all([liveAnalysisStopPromise, pendingStop]).then(() => undefined).catch(() => {});
  const stopBeforeNextSearch = liveAnalysisStopPromise;
  liveAnalysisRunning = false;
  liveAnalysisScheduled = true;
  $('gc-engine-status').textContent = "LIVE · Updating position";
  $('gc-live-progress').textContent = "The board changed. Stockfish is refreshing its evaluation automatically.";
  syncLiveAnalysisControls();

  liveAnalysisTimer = window.setTimeout(async () => {
    liveAnalysisTimer = null;
    await stopBeforeNextSearch;
    if (token !== liveAnalysisToken || liveAnalysisPaused || api.fen !== fen) return;
    if (liveAnalysisSuppressed || puzzle?.active) {
      liveAnalysisScheduled = false;
      syncLiveAnalysisControls();
      return;
    }
    void runLiveAnalysis(fen, token);
  }, Math.max(0, Number(delay) || 0));
}

async function runLiveAnalysis(fen, token) {
  if (token !== liveAnalysisToken || liveAnalysisPaused || api.fen !== fen) return;
  liveAnalysisScheduled = false;
  liveAnalysisRunning = true;
  const sideToMove = fen.split(/\s+/)[1] || api.turn;
  const depth = Number($('gc-live-depth-select').value) || 14;
  let latest = null;

  $('gc-live-analyze').textContent = "Refresh live analysis";
  $('gc-live-stop').disabled = false;
  $('gc-engine-status').textContent = "LIVE · Starting Stockfish";
  $('gc-live-progress').textContent = "Preparing the dedicated analysis worker…";
  $('gc-live-depth').textContent = `Depth 0 / ${depth}`;
  $('gc-live-eval').textContent = "—";
  $('gc-eval-white').style.width = "50%";
  $('gc-live-best').textContent = "Stockfish is searching the current position…";
  $('gc-live-pv').textContent = "Waiting for the principal variation…";

  try {
    await prepareLiveAnalysisEngine();
    if (token !== liveAnalysisToken || liveAnalysisPaused || api.fen !== fen) return;

    const result = await liveAnalysisEngine.search(fen, {
      depth,
      onInfo: info => {
        if (token !== liveAnalysisToken || api.fen !== fen || liveAnalysisPaused) return;
        latest = info;
        const score = scoreFromInfo(info);
        if (score != null) updateLiveEvaluation(score, info, sideToMove);
        $('gc-live-progress').textContent = formatEngineProgress(info);
        $('gc-engine-status').textContent = info?.depth
          ? `LIVE · Depth ${info.depth}/${depth}`
          : "LIVE · Analyzing";
      }
    });

    if (token !== liveAnalysisToken || liveAnalysisPaused) return;
    if (api.fen !== fen) {
      $('gc-engine-status').textContent = "LIVE · Position changed";
      scheduleLiveAnalysis(0);
      return;
    }
    if (result?.cancelled) {
      $('gc-engine-status').textContent = "LIVE · Refreshing";
      scheduleLiveAnalysis(180);
      return;
    }

    const best = String(result?.bestMove || "");
    const score = scoreFromInfo(result) ?? scoreFromInfo(latest);
    updateLiveEvaluation(score, result || latest, sideToMove, best);
    $('gc-live-progress').textContent = formatEngineProgress(result || latest) || "Position evaluated. Waiting for the next board change.";
    $('gc-engine-status').textContent = `LIVE · Depth ${result?.depth || depth}`;
    if (!best || best === "(none)") {
      $('gc-live-best').textContent = "No legal move is available in this position.";
    }
  } catch (error) {
    if (token === liveAnalysisToken) {
      $('gc-engine-status').textContent = "LIVE · Engine unavailable";
      $('gc-live-progress').textContent = error?.message || "The dedicated Stockfish worker could not complete its analysis.";
      $('gc-live-best').textContent = "Live analysis will retry when you refresh or the next position is played.";
    }
  } finally {
    if (token === liveAnalysisToken) {
      liveAnalysisRunning = false;
      syncLiveAnalysisControls();
    }
  }
}

async function stopLiveAnalysis() {
  liveAnalysisPaused = true;
  liveAnalysisToken += 1;
  if (liveAnalysisTimer !== null) {
    clearTimeout(liveAnalysisTimer);
    liveAnalysisTimer = null;
  }
  liveAnalysisScheduled = false;
  $('gc-engine-status').textContent = "LIVE · Pausing";
  $('gc-live-progress').textContent = "Stopping the dedicated Live Engine Lab worker…";
  try {
    if (liveAnalysisEngine) await liveAnalysisEngine.stop();
  } catch (error) {
    console.warn("Could not pause Live Engine Lab:", error);
  }
  liveAnalysisRunning = false;
  $('gc-engine-status').textContent = "LIVE · Paused";
  $('gc-live-progress').textContent = "Live monitoring is paused. Resume it to follow the current board again.";
  syncLiveAnalysisControls();
}

function analyzeCurrent() {
  liveAnalysisPaused = false;
  scheduleLiveAnalysis(0);
  syncLiveAnalysisControls();
}

function moveClass(loss) {
  if (loss <= 0.10) return ['Best', 'gc-good'];
  if (loss <= 0.30) return ['Excellent', 'gc-good'];
  if (loss <= 0.80) return ['Good', 'gc-good'];
  if (loss <= 1.50) return ['Inaccuracy', 'gc-warn'];
  if (loss <= 3.00) return ['Mistake', 'gc-bad'];
  return ['Blunder', 'gc-bad'];
}

function renderReviewGraph(values) {
  const width = 320, height = 110, pad = 8;
  if (!values.length) { $('gc-review-graph').innerHTML = '<line x1="0" y1="55" x2="320" y2="55" stroke="currentColor" opacity=".25" stroke-dasharray="4 4"/><polyline points="0,55 320,55" />'; return; }
  const min = Math.min(-5, ...values), max = Math.max(5, ...values);
  const span = max - min || 1;
  const points = values.map((value, index) => {
    const x = values.length === 1 ? width / 2 : pad + index * (width - 2 * pad) / (values.length - 1);
    const y = height - pad - ((value - min) / span) * (height - 2 * pad);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(' ');
  $('gc-review-graph').innerHTML = `<line x1="0" y1="55" x2="320" y2="55" stroke="currentColor" opacity=".25" stroke-dasharray="4 4"/><polyline points="${points}" />`;
}

async function reviewGame() {
  if (!api.engineReady) { $('gc-review-status').textContent = 'Engine not ready'; return; }
  if (api.thinking) { $('gc-review-status').textContent = 'Engine is busy'; return; }
  if (!moves.length) { $('gc-review-status').textContent = 'Play moves first'; return; }
  if (replaying) exitReplay();
  const token = ++reviewToken;
  const generation = api.generation;
  const snapshotFen = api.fen;
  const snapshotMoves = moves.slice();
  const snapshotPositions = positions.slice();
  reviewResults = [];
  $('gc-review-status').textContent = 'Reviewing…';
  $('gc-move-review').innerHTML = '<div class="gc-empty">Stockfish is reviewing the moves. Keep this tab open.</div>';
  api.setReplayLock(true);
  const evals = [];
  let totalAccuracy = 0;
  let ratedMoves = 0;
  try {
    for (let i = 0; i < snapshotMoves.length; i++) {
      if (token !== reviewToken || generation !== api.generation || snapshotFen !== api.fen) break;
      const before = snapshotPositions[i], after = snapshotPositions[i + 1];
      if (!before || !after) continue;
      let beforeScore = null, afterScore = null;
      const pre = await api.search(before, 7, info => { const score = scoreFromInfo(info); if (score != null) beforeScore = score; });
      if (token !== reviewToken || generation !== api.generation || snapshotFen !== api.fen || pre.cancelled) break;
      beforeScore ??= scoreFromInfo(pre);
      const post = await api.search(after, 7, info => { const score = scoreFromInfo(info); if (score != null) afterScore = score; });
      if (token !== reviewToken || generation !== api.generation || snapshotFen !== api.fen || post.cancelled) break;
      afterScore ??= scoreFromInfo(post);
      let loss = null;
      if (beforeScore != null && afterScore != null) {
        // Search scores are from the side-to-move perspective at each position.
        loss = Math.max(0, beforeScore + afterScore);
        loss = Math.min(20, loss);
      }
      const [label, color] = loss == null ? ['Reviewed', ''] : moveClass(loss);
      const accuracy = loss == null ? null : Math.max(0, 100 - loss * 14);
      if (accuracy != null) { totalAccuracy += accuracy; ratedMoves += 1; }
      const whiteEval = beforeScore == null ? null : (snapshotMoves[i].color === 'w' ? beforeScore : -beforeScore);
      if (whiteEval != null) evals.push(whiteEval);
      reviewResults.push({ san: snapshotMoves[i].san, color: snapshotMoves[i].color, label, colorClass: color, loss, accuracy });
      $('gc-move-review').innerHTML = reviewResults.map((item, index) => `
        <div class="gc-move"><span>${index + 1}. ${item.color === 'w' ? 'White' : 'Black'} · <strong>${esc(item.san)}</strong></span><span class="gc-pill ${item.colorClass}">${esc(item.label)}${item.loss == null ? '' : ` · ${item.loss.toFixed(2)}`}</span></div>`).join('');
      $('gc-review-moves').textContent = String(reviewResults.length);
      $('gc-review-status').textContent = `Reviewing ${i + 1}/${snapshotMoves.length}`;
    }
    if (token !== reviewToken || generation !== api.generation || snapshotFen !== api.fen) return;
    $('gc-accuracy').textContent = ratedMoves ? `${Math.round(totalAccuracy / ratedMoves)}%` : '—';
    $('gc-review-status').textContent = 'Review complete';
    renderReviewGraph(evals);
    window.GlassChessOnlinePlus?.onReviewComplete?.();
  } catch (error) {
    if (token === reviewToken) {
      $('gc-review-status').textContent = 'Review stopped';
      $('gc-move-review').innerHTML += `<div class="gc-muted">${esc(error.message)}</div>`;
    }
  } finally {
    if (token === reviewToken) api.setReplayLock(false);
  }
}

function stopPremiumReview() {
  reviewToken++;
  void api.stopSearch?.();
  api.setReplayLock(false);
  $('gc-review-status').textContent = 'Review stopped';
}

function exportProfile() {
  downloadText('glass-chess-profile.json', JSON.stringify(data, null, 2), 'application/json');
}

function resetProfile() {
  if (!confirm('Reset your local Glass Chess profile, rating, statistics, saved games, and preferences?')) return;
  localStorage.removeItem(STORAGE_KEY);
  data = { ...DEFAULT_DATA, savedGames: [] };
  saveData(); renderProfile(); renderThemes();
}

function bindEvents() {
  root.querySelectorAll('[data-tab]').forEach(button => button.addEventListener('click', () => switchTab(button.dataset.tab)));
  $('gc-save-name').addEventListener('click', () => { data.name = $('gc-name-input').value.trim().slice(0, 22) || 'Player'; saveData(); renderProfile(); });
  $('gc-open-clock-tools').addEventListener('click', () => {
    root.querySelector('[data-tab="game-lab"]')?.click();
    root.querySelector('[data-view="game-lab"]')?.scrollIntoView?.({behavior:'smooth',block:'start'});
  });
  $('gc-live-analyze').addEventListener('click', analyzeCurrent);
  $('gc-live-stop').addEventListener('click', stopLiveAnalysis);
  $('gc-live-depth-select').addEventListener('change', () => {
    if (!liveAnalysisPaused) scheduleLiveAnalysis(120);
  });
  $('gc-open-analysis').addEventListener('click', () => { api.setMode('analysis'); switchTab('home'); });
  $('gc-create-puzzle').addEventListener('click', createPuzzle);
  $('gc-puzzle-hint').addEventListener('click', showPuzzleHint);
  $('gc-review-game').addEventListener('click', reviewGame);
  $('gc-save-game').addEventListener('click', saveCurrentGame);
  $('gc-export-pgn').addEventListener('click', exportPgn);
  $('gc-load-saved').addEventListener('click', () => {
    const index = Number($('gc-saved-games').value);
    const item = data.savedGames[index];
    if (!item?.pgn) { $('gc-save-status').textContent = 'Choose a saved game first.'; return; }
    try { exitReplay(); api.loadPgn(item.pgn); api.setMode('analysis'); $('gc-save-status').textContent = 'Saved game loaded for analysis.'; }
    catch (error) { $('gc-save-status').textContent = `Could not load game: ${error.message}`; }
  });
  $('gc-delete-saved').addEventListener('click', () => {
    const index = Number($('gc-saved-games').value);
    if (!Number.isInteger(index) || !data.savedGames[index]) return;
    data.savedGames.splice(index, 1); saveData(); renderSavedGames(); $('gc-save-status').textContent = 'Saved game deleted.';
  });
  $('gc-replay-range').addEventListener('input', event => replayTo(event.target.value));
  $('gc-replay-start').addEventListener('click', () => replayTo(0));
  $('gc-replay-back').addEventListener('click', () => replayTo(Number($('gc-replay-range').value) - 1));
  $('gc-replay-forward').addEventListener('click', () => replayTo(Number($('gc-replay-range').value) + 1));
  $('gc-replay-exit').addEventListener('click', exitReplay);
  $('gc-theme-list').addEventListener('click', event => { const button = event.target.closest('[data-theme]'); if (button) applyTheme(button.dataset.theme); });

  const appearance = api.appearance || {
    background: 'midnight',
    backgroundColor: '#18202f',
    pieceStyle: 'glass',
    whitePieceColor: '#f7f2e9',
    blackPieceColor: '#263244'
  };
  $('gc-piece-style').value = appearance.pieceStyle;
  $('gc-white-piece-color').value = appearance.whitePieceColor;
  $('gc-black-piece-color').value = appearance.blackPieceColor;

  const savePieceAppearance = () => {
    api.updateAppearance?.({
      pieceStyle: $('gc-piece-style').value,
      whitePieceColor: $('gc-white-piece-color').value,
      blackPieceColor: $('gc-black-piece-color').value
    });
    window.GlassChessOnlinePlus?.onManualAppearanceChange?.();
  };
  $('gc-piece-style').addEventListener('change', savePieceAppearance);
  $('gc-white-piece-color').addEventListener('input', savePieceAppearance);
  $('gc-black-piece-color').addEventListener('input', savePieceAppearance);

  const backgroundList = $('gc-background-list');
  const backgroundInput = $('gc-background-color');
  const initialBackgroundColor = appearance.backgroundColor || '#18202f';
  if (backgroundInput) backgroundInput.value = initialBackgroundColor;
  const syncBackgroundButtons = selected => {
    backgroundList.querySelectorAll('[data-bg-color]').forEach(button => {
      button.classList.toggle('active', button.dataset.bgColor.toLowerCase() === selected.toLowerCase());
    });
  };
  syncBackgroundButtons(initialBackgroundColor);
  const setBackgroundColor = selected => {
    if (!/^#[0-9a-f]{6}$/i.test(selected)) return;
    api.updateAppearance?.({ backgroundColor: selected });
    if (backgroundInput) backgroundInput.value = selected;
    syncBackgroundButtons(selected);
  };
  backgroundList.addEventListener('click', event => {
    const button = event.target.closest('[data-bg-color]');
    if (button) setBackgroundColor(button.dataset.bgColor);
  });
  backgroundInput.addEventListener('input', () => setBackgroundColor(backgroundInput.value));

  $('gc-sound-toggle').addEventListener('change', event => {
    data.sound = event.target.checked;
    api.setSoundEnabled?.(data.sound);
    saveData();
    if (data.sound) playTone();
  });
  $('gc-export-data').addEventListener('click', exportProfile);
  $('gc-reset-data').addEventListener('click', resetProfile);
}

export function mount(chessApi) {
  if (document.getElementById('gc-premium')) return;
  api = chessApi;
  data = loadData();
  startFen = START_FEN;
  moves = api.history.map(move => ({ from: move.from, to: move.to, promotion: move.promotion, san: move.san, color: move.color }));
  try { positions = api.calculatePositions(startFen, moves); }
  catch { startFen = api.fen || START_FEN; moves = []; positions = [startFen]; }
  installStyles();
  buildInterface();
  bindEvents();
  import('./onlineplus.js')
    .then(async ({ mountOnlinePlus }) => {
      mountOnlinePlus(api, root);
      const { mountAdvancedLab } = await import('./advanced-lab.js');
      mountAdvancedLab(api, root);
    })
    .catch(error => console.error('Glass Chess Online + Advanced Lab could not start:', error));
  renderProfile();
  renderThemes();
  renderOpening();
  refreshReplayControls();
  $('gc-engine-status').textContent = api.engineReady ? 'Stockfish ready' : 'Loading Stockfish';
  if (api.history.length) {
    $('gc-puzzle-status').textContent = 'Create a puzzle from the current position, or begin a new game to track a full game from move one.';
  }
  window.GlassChessPremium = {
    onMove,
    onReset,
    onUndo,
    onLoadedGame,
    onGameFinished: recordFinishedGame,
    shouldSkipAutoAnalysis: () => Boolean(puzzle?.active),
    stopReview: stopPremiumReview,
    isReplaying: () => replaying,
    setTheme: applyTheme,
    setSoundEnabled(enabled) {
      data.sound = Boolean(enabled);
      const control = $('gc-sound-toggle');
      if (control) control.checked = data.sound;
      saveData();
    }
  };
  // Only update the initial loading label. Never overwrite Live Engine Lab's own analysis status.
  // Start Live Engine Lab automatically. It owns an isolated Stockfish worker and
  // refreshes on every board-position change without locking player input.
  scheduleLiveAnalysis(250);
  window.addEventListener('pagehide', () => {
    if (liveAnalysisTimer !== null) clearTimeout(liveAnalysisTimer);
    void liveAnalysisEngine?.stop?.();
  }, { once: true });
  console.log('Glass Chess Premium Suite loaded.');
}

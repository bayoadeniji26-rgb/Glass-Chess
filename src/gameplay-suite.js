import { Chess } from 'chess.js';
import './gameplay-suite.css';

const HISTORY_KEY = 'glass-chess-match-history-v1';
const PREF_KEY = 'glass-chess-game-lab-v1';
const PIECE_VALUE = { p:1, n:3, b:3, r:5, q:9, k:0 };
const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

const OPENINGS = [
  { moves:['e4','e5','Nf3','Nc6','Bb5'], name:'Ruy Lopez', eco:'C60' },
  { moves:['e4','e5','Nf3','Nc6','Bc4'], name:'Italian Game', eco:'C50' },
  { moves:['e4','c5','Nf3','d6','d4','cxd4','Nxd4','Nf6','Nc3','a6'], name:'Sicilian Defense · Najdorf setup', eco:'B90' },
  { moves:['e4','c5'], name:'Sicilian Defense', eco:'B20' },
  { moves:['e4','e6','d4','d5'], name:'French Defense', eco:'C00' },
  { moves:['e4','c6','d4','d5'], name:'Caro-Kann Defense', eco:'B10' },
  { moves:['e4','d5'], name:'Scandinavian Defense', eco:'B01' },
  { moves:['e4','Nf6'], name:'Alekhine Defense', eco:'B02' },
  { moves:['e4','d6','d4','Nf6','Nc3','g6'], name:'Pirc Defense', eco:'B07' },
  { moves:['d4','d5','c4'], name:"Queen's Gambit", eco:'D06' },
  { moves:['d4','d5','c4','c6'], name:'Slav Defense', eco:'D10' },
  { moves:['d4','Nf6','c4','g6','Nc3','d5'], name:'Grünfeld Defense', eco:'D70' },
  { moves:['d4','Nf6','c4','e6','Nf3','b6'], name:"Queen's Indian Defense", eco:'E12' },
  { moves:['d4','d5','Bf4'], name:'London System', eco:'D00' },
  { moves:['d4','Nf6','c4','e6','g3'], name:'Catalan Opening', eco:'E01' },
  { moves:['d4','Nf6','c4','g6','Nc3','Bg7'], name:"King's Indian Defense", eco:'E60' },
  { moves:['d4','Nf6','c4','e6','Nc3','Bb4'], name:'Nimzo-Indian Defense', eco:'E20' },
  { moves:['c4'], name:'English Opening', eco:'A10' },
  { moves:['Nf3','d5','g3'], name:'Réti Opening', eco:'A05' },
  { moves:['e4','e5','f4'], name:'King’s Gambit', eco:'C30' },
  { moves:['f4'], name:'Bird Opening', eco:'A02' }
];

const PUZZLES = [
  { name:'Back-rank finish', theme:'Mate in one', fen:'6k1/5ppp/8/8/8/8/5PPP/4R1K1 w - - 0 1', best:'e1e8', rating:600 },
  { name:'Queen net', theme:'Mate in one', fen:'7k/5Qpp/8/8/8/8/8/K7 w - - 0 1', best:'f7f8', rating:650 },
  { name:'Rook lift', theme:'Tactical finish', fen:'7k/6pp/8/8/8/8/5PPP/4R1K1 w - - 0 1', best:'e1e8', rating:700 }
];

const DRILLS = [
  { name:'Queen mate', fen:'7k/8/8/8/8/8/2Q5/K7 w - - 0 1', note:'Convert queen and king versus a lone king.' },
  { name:'Rook mate', fen:'7k/8/8/8/8/2K5/8/R7 w - - 0 1', note:'Drive the king to the edge with king and rook.' },
  { name:'Two bishops', fen:'7k/8/8/8/3B4/2K1B3/8/8 w - - 0 1', note:'Coordinate both bishops and your king.' },
  { name:'King and pawn', fen:'7k/8/8/8/8/4K3/4P3/8 w - - 0 1', note:'Use opposition and escort the passer.' },
  { name:'Lucena technique', fen:'2k4r/2P5/2K5/8/8/8/8/R7 w - - 0 1', note:'Rook endgame position built around the Lucena winning method.' },
  { name:'Philidor technique', fen:'2r5/8/6k1/6P1/8/8/5R2/6K1 b - - 0 1', note:'Rook endgame position for practicing Philidor-style defense.' }
];

const PERSONAS = {
  beginner:{label:'Beginner',skillLevel:2,multiPV:3,note:'Gentler strength with occasional candidate variation choices.'},
  aggressive:{label:'Aggressive Tactician',skillLevel:13,multiPV:3,note:'Prefers forcing checks and captures among close engine candidates.'},
  positional:{label:'Solid Positional',skillLevel:15,multiPV:2,note:'Usually chooses the top engine line with limited variation.'},
  maximum:{label:'Maximum Stockfish 19',skillLevel:20,multiPV:1,note:'Uses the strongest top line available from this Stockfish build.'}
};

let api = null;
let root = null;
let board = null;
let evalFill = null;
let evalLabel = null;
let arrowSvg = null;
let arrowFrom = null;
let customArrows = [];
let preMove = null;
let preMoveEnabled = false;
let confirmEnabled = false;
let confirmCandidate = null;
let drawMode = false;
let heatmapEnabled = false;
let customFen = START_FEN;
let reviewData = [];
let retryQueue = [];
let retryIndex = 0;
let retryActive = false;
let activePuzzle = null;
let rushTimer = null;
let rushSeconds = 60;
let rushScore = 0;
let activeDrill = null;
let lastArrowOrientation = null;
let clockState = { white:300, black:300, increment:0, running:false, side:'w', last:0, timer:null };
let suppressMoveHook = false;
let inspectedIndex = null;
let inspectedFullHistory = null;
let currentStartFen = START_FEN;
let cachedMatchSaved = '';
let lastAutoReviewKey = '';

function safeHistory() {
  try { return JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]').slice(0,100); }
  catch { return []; }
}
function saveHistory(items) {
  try { localStorage.setItem(HISTORY_KEY, JSON.stringify(items.slice(0,100))); }
  catch (error) { console.warn('Match history could not be saved:', error); }
}
function loadPrefs() {
  try { return JSON.parse(localStorage.getItem(PREF_KEY) || '{}'); }
  catch { return {}; }
}
function savePrefs(patch) {
  try { localStorage.setItem(PREF_KEY, JSON.stringify({ ...loadPrefs(), ...patch })); }
  catch {}
}
function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
}
function isTextEntry(target) {
  return Boolean(target?.closest?.('input,textarea,select,[contenteditable="true"]'));
}
function squareFromTarget(target) {
  return target?.closest?.('[data-square]')?.dataset.square || null;
}
function uci(move) {
  return move ? (move.from + move.to + (move.promotion || '')).toLowerCase() : '';
}
function scoreFromInfo(info) {
  const score = info?.score;
  if (!score) return null;
  const value = Number(score.value);
  if (!Number.isFinite(value)) return null;
  return score.type === 'mate' ? Math.sign(value || 1) * 100 : value / 100;
}
function gameStartFromPgn(pgn) {
  const match = String(pgn).match(/\[FEN\s+"([^"]+)"\]/i);
  return match ? match[1] : START_FEN;
}
function materialCount(history) {
  const captured = { white:[], black:[] };
  for (const move of history) {
    if (!move.captured) continue;
    const side = move.color === 'w' ? 'black' : 'white';
    captured[side].push(move.captured);
  }
  const whiteScore = captured.white.reduce((sum,p)=>sum+(PIECE_VALUE[p]||0),0);
  const blackScore = captured.black.reduce((sum,p)=>sum+(PIECE_VALUE[p]||0),0);
  return { captured, whiteScore, blackScore, net:whiteScore-blackScore };
}

function buildUI() {
  const nav = root.querySelector('.gc-tabs');
  if (!nav || root.querySelector('[data-view="game-lab"]')) return;
  const tab = document.createElement('button');
  tab.type = 'button';
  tab.dataset.tab = 'game-lab';
  tab.textContent = 'Game Lab';
  nav.appendChild(tab);

  const view = document.createElement('section');
  view.className = 'gc-view gc-game-lab';
  view.dataset.view = 'game-lab';
  view.innerHTML = `
    <div class="gcl-intro"><div><strong>GAME LAB</strong><small>Advanced play, analysis & board tools</small></div><span class="gcl-live">LOCAL · STOCKFISH</span></div>

    <div class="gcl-quick-grid">
      <label class="gcl-toggle"><input id="gcl-premove" type="checkbox"> Pre-moves</label>
      <label class="gcl-toggle"><input id="gcl-confirm" type="checkbox"> Confirm moves</label>
      <label class="gcl-toggle"><input id="gcl-heatmap" type="checkbox"> Attack heatmap</label>
      <label class="gcl-toggle"><input id="gcl-draw-mode" type="checkbox"> Touch arrow draw</label>
    </div>

    <details class="gcl-section" open>
      <summary>Live board tools <span>evaluation · arrows · material</span></summary>
      <div class="gcl-card">
        <div class="gcl-row"><strong>Evaluation & engine arrows</strong><span class="gcl-inline-toggles"><label class="gcl-toggle"><input id="gcl-engine-arrows" type="checkbox"> Best move</label><label class="gcl-toggle"><input id="gcl-threat-arrows" type="checkbox"> Reply threat</label></span></div>
        <div class="gcl-row"><span class="gcl-muted">Right-drag to draw arrows. Right-click a square to mark it. Left-click the board to clear annotations.</span></div>
        <div class="gcl-actions"><button id="gcl-clear-arrows">Clear arrows</button><button id="gcl-refresh-heatmap">Refresh heatmap</button></div>
        <label class="gcl-field gcl-arrow-color-field">Arrow / square color <input id="gcl-arrow-color" type="color" value="#e9cf93"></label>
        <div id="gcl-opening-banner" class="gcl-opening">Opening explorer · Play a move to identify the opening</div>
        <div id="gcl-material" class="gcl-material"></div>
      </div>
    </details>

    <details class="gcl-section" open>
      <summary>Analysis & review <span>badges · accuracy · retry</span></summary>
      <div class="gcl-card">
        <div class="gcl-row"><strong>Move classification</strong><span id="gcl-review-status" class="gcl-muted">Not reviewed</span></div>
        <p class="gcl-muted">Review runs a Stockfish pass across each move and may take longer on long games.</p>
        <div class="gcl-actions"><button class="primary" id="gcl-review">Analyze all moves</button><button id="gcl-stop-review">Stop</button></div>
        <div id="gcl-review-progress" class="gcl-progress"><span></span></div>
        <div id="gcl-summary" class="gcl-summary"></div>
        <div id="gcl-classifications" class="gcl-classifications"></div>
        <div class="gcl-actions"><button id="gcl-retry-mistakes" disabled>Retry mistakes</button><button id="gcl-exit-retry" disabled>Exit retry</button></div>
        <p id="gcl-retry-status" class="gcl-muted"></p>
      </div>
      <div class="gcl-card">
        <div class="gcl-row"><strong>Move navigator</strong><span id="gcl-nav-status" class="gcl-muted">Live position</span></div>
        <div id="gcl-history-list" class="gcl-history-list"></div>
        <div class="gcl-actions"><button id="gcl-history-start">Start</button><button id="gcl-history-back">◀</button><button id="gcl-history-forward">▶</button><button id="gcl-history-end">Live</button></div>
      <div class="gcl-actions"><button id="gcl-play-from-here" class="primary">Play vs Stockfish</button><button id="gcl-explore-from-here">Explore branch</button></div>
      </div>
    </details>

    <details class="gcl-section">
      <summary>Import, export & sharing <span>PGN · FEN · replay link</span></summary>
      <div class="gcl-card">
        <label class="gcl-field">Paste PGN<textarea id="gcl-pgn-input" rows="4" placeholder="[Event &quot;Glass Chess&quot;]&#10;1. e4 e5 2. Nf3 Nc6"></textarea></label>
        <div class="gcl-actions"><button id="gcl-import-pgn" class="primary">Load PGN</button><button id="gcl-copy-pgn">Copy PGN</button><button id="gcl-download-pgn">Download PGN</button></div>
        <label class="gcl-field">Paste FEN<input id="gcl-fen-input" placeholder="rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1"></label>
        <div class="gcl-actions"><button id="gcl-import-fen" class="primary">Load position</button><button id="gcl-copy-fen">Copy FEN</button><button id="gcl-share-game">Copy share link</button></div>
        <p id="gcl-import-status" class="gcl-muted">PGN and FEN are handled locally in this browser.</p>
      </div>
    </details>

    <details class="gcl-section">
      <summary>New game & clock <span>bullet · blitz · rapid · custom</span></summary>
      <div class="gcl-card">
        <label class="gcl-field">Time control<select id="gcl-time-preset">
          <option value="1+0">Bullet · 1+0</option><option value="2+1">Bullet · 2+1</option>
          <option value="3+0">Blitz · 3+0</option><option value="3+2">Blitz · 3+2</option><option value="5+0" selected>Blitz · 5+0</option>
          <option value="10+0">Rapid · 10+0</option><option value="15+10">Rapid · 15+10</option><option value="untimed">Untimed</option><option value="custom">Custom</option>
        </select></label>
        <div class="gcl-grid" id="gcl-custom-clock" hidden><label class="gcl-field">Minutes<input id="gcl-custom-minutes" type="number" min="1" max="180" value="5"></label><label class="gcl-field">Increment (sec)<input id="gcl-custom-increment" type="number" min="0" max="60" value="0"></label></div>
        <div class="gcl-clock-grid"><div><small>WHITE</small><strong id="gcl-clock-white">05:00</strong></div><div><small>BLACK</small><strong id="gcl-clock-black">05:00</strong></div></div>
        <div class="gcl-actions"><button class="primary" id="gcl-clock-start">Start clock</button><button id="gcl-clock-pause">Pause</button><button id="gcl-clock-reset">Reset</button></div>
      </div>
    </details>

    <details class="gcl-section">
      <summary>Board editor <span>custom positions & castling</span></summary>
      <div class="gcl-card">
        <div class="gcl-row"><strong>Piece palette</strong><span class="gcl-muted">Select, then tap a square. Drag pieces onto the editor too.</span></div>
        <div id="gcl-editor-palette" class="gcl-editor-palette"></div>
        <div class="gcl-editor-board-wrap"><div id="gcl-editor-board" class="gcl-editor-board"></div></div>
        <div class="gcl-grid"><label class="gcl-field">Side to move<select id="gcl-editor-turn"><option value="w">White</option><option value="b">Black</option></select></label><label class="gcl-field">Selected piece<select id="gcl-editor-selected"><option value="">Erase square</option></select></label></div>
        <div class="gcl-rights"><label><input type="checkbox" id="gcl-castle-K" checked> White O-O</label><label><input type="checkbox" id="gcl-castle-Q" checked> White O-O-O</label><label><input type="checkbox" id="gcl-castle-k" checked> Black O-O</label><label><input type="checkbox" id="gcl-castle-q" checked> Black O-O-O</label></div>
        <div class="gcl-actions"><button id="gcl-editor-clear">Clear</button><button id="gcl-editor-start">Starting position</button><button id="gcl-editor-validate">Validate</button></div>
        <div class="gcl-actions"><button class="primary" id="gcl-editor-play">Start playing</button><button id="gcl-editor-analysis">Analyze position</button></div>
        <p id="gcl-editor-status" class="gcl-muted">Editor starts from the standard position.</p>
      </div>
    </details>

    <details class="gcl-section">
      <summary>Puzzles & endgame drills <span>tactics · rush · technique</span></summary>
      <div class="gcl-card">
        <div class="gcl-row"><strong id="gcl-puzzle-name">Daily tactics</strong><span id="gcl-puzzle-rating" class="gcl-pill">Rating 600</span></div>
        <p id="gcl-puzzle-copy" class="gcl-muted">Find the best move. The solution remains hidden until you play.</p>
        <div class="gcl-actions"><button class="primary" id="gcl-puzzle-start">Start puzzle</button><button id="gcl-puzzle-next">Next puzzle</button><button id="gcl-rush-start">Start 60s Puzzle Rush</button></div>
        <div id="gcl-rush-clock" class="gcl-rush-clock" hidden>60</div><p id="gcl-puzzle-status" class="gcl-muted"></p>
      </div>
      <div class="gcl-card">
        <label class="gcl-field">Endgame drill<select id="gcl-drill-select"></select></label>
        <p id="gcl-drill-copy" class="gcl-muted">Practice a technical endgame against Stockfish defense.</p>
        <div class="gcl-actions"><button class="primary" id="gcl-drill-start">Start drill</button><button id="gcl-drill-next">Choose another</button></div>
      </div>
    </details>

    <details class="gcl-section">
      <summary>Engine personality & match history <span>personas · saved games</span></summary>
      <div class="gcl-card">
        <label class="gcl-field">Stockfish persona<select id="gcl-persona"></select></label>
        <p id="gcl-persona-note" class="gcl-muted"></p>
        <button class="primary" id="gcl-persona-apply">Apply persona</button>
      </div>
      <div class="gcl-card">
        <div class="gcl-row"><strong>Local match history</strong><span id="gcl-match-count" class="gcl-muted">0 saved</span></div>
        <input id="gcl-match-filter" placeholder="Filter by result or date">
        <div id="gcl-match-list" class="gcl-match-list"></div>
      </div>
    </details>
  `;
  root.appendChild(view);
  tab.addEventListener('click', () => switchTab('game-lab'));
  tab.addEventListener('click', () => { tab.classList.add('active'); });
}

function switchTab(name) {
  root.querySelectorAll('[data-tab]').forEach(button=>button.classList.toggle('active',button.dataset.tab===name));
  root.querySelectorAll('[data-view]').forEach(view=>view.classList.toggle('active',view.dataset.view===name));
}

function mountEvaluationBar() {
  const stage = document.querySelector('.board-section');
  if (!stage || document.getElementById('gcl-eval-bar')) return;
  stage.style.position='relative';
  const bar = document.createElement('div');
  bar.id='gcl-eval-bar';
  bar.className='gcl-eval-bar';
  bar.innerHTML='<div class="gcl-eval-track"><span id="gcl-eval-fill"></span></div><b id="gcl-eval-label">0.0</b>';
  stage.appendChild(bar);
  evalFill=bar.querySelector('#gcl-eval-fill');
  evalLabel=bar.querySelector('#gcl-eval-label');
}

function mountArrowLayer() {
  const boardEl = document.getElementById('board');
  if (!boardEl || document.getElementById('gcl-arrow-layer')) return;
  board = boardEl;
  board.style.position='relative';
  arrowSvg=document.createElementNS('http://www.w3.org/2000/svg','svg');
  arrowSvg.id='gcl-arrow-layer';
  arrowSvg.setAttribute('viewBox','0 0 800 800');
  arrowSvg.setAttribute('preserveAspectRatio','none');
  arrowSvg.innerHTML='<defs><marker id="gcl-arrow-head" markerWidth="7" markerHeight="7" refX="5" refY="3" orient="auto"><path d="M0,0 L6,3 L0,6 Z" fill="#e9cf93"/></marker></defs>';
  boardEl.appendChild(arrowSvg);
  board=boardEl;
}

function updateEvaluation(info, side='w') {
  if (!evalFill || !evalLabel || !info) return;
  const score=scoreFromInfo(info);
  if (score==null) return;
  const whiteScore=side==='b' ? -score : score;
  const bounded=Math.max(-8,Math.min(8,whiteScore));
  const whitePercent=100/(1+Math.exp(-bounded*0.75));
  evalFill.style.height=whitePercent+'%';
  evalFill.style.bottom='0';
  evalFill.style.top='auto';
  evalLabel.textContent=info.score.type==='mate' ? 'M'+Math.abs(info.score.value) : (whiteScore>0?'+':'')+whiteScore.toFixed(1);
  evalLabel.dataset.side=whiteScore>0?'white':whiteScore<0?'black':'equal';
}

function clearAnnotations() {
  customArrows=[];
  if (arrowSvg) arrowSvg.querySelectorAll('.gcl-drawn-arrow,.gcl-marked-square,.gcl-engine-arrow,.gcl-threat-arrow').forEach(node=>node.remove());
  board?.querySelectorAll('.gcl-user-mark').forEach(node=>node.classList.remove('gcl-user-mark'));
}
function clearEngineArrows() {
  arrowSvg?.querySelectorAll('.gcl-engine-arrow,.gcl-threat-arrow').forEach(node=>node.remove());
}
function redrawCustomAnnotations() {
  if(!arrowSvg)return;
  arrowSvg.querySelectorAll('.gcl-drawn-arrow,.gcl-marked-square').forEach(node=>node.remove());
  customArrows.forEach(item=>drawArrow(item.from,item.to,item.color,'gcl-drawn-arrow'));
}
function squareCenter(square) {
  const el=board?.querySelector('[data-square="'+square+'"]');
  if (!el) return null;
  const rect=el.getBoundingClientRect(), base=board.getBoundingClientRect();
  return { x:((rect.left+rect.width/2-base.left)/base.width)*800, y:((rect.top+rect.height/2-base.top)/base.height)*800 };
}
function drawArrow(from,to,color='#e9cf93',className='gcl-drawn-arrow') {
  if (!arrowSvg || !from || !to) return;
  const a=squareCenter(from), b=squareCenter(to);
  if (!a||!b) return;
  if (from===to) {
    const cell=board.querySelector('[data-square="'+from+'"]');
    const mark=document.createElementNS('http://www.w3.org/2000/svg','rect');
    mark.setAttribute('x',a.x-48);mark.setAttribute('y',a.y-48);mark.setAttribute('width',96);mark.setAttribute('height',96);
    mark.setAttribute('rx',10);mark.setAttribute('fill',color);mark.setAttribute('opacity','.34');mark.classList.add('gcl-marked-square');arrowSvg.appendChild(mark);
    cell?.classList.add('gcl-user-mark');
    return;
  }
  const line=document.createElementNS('http://www.w3.org/2000/svg','line');
  line.setAttribute('x1',a.x);line.setAttribute('y1',a.y);line.setAttribute('x2',b.x);line.setAttribute('y2',b.y);
  line.setAttribute('stroke',color);line.setAttribute('stroke-width','17');line.setAttribute('stroke-linecap','round');
  line.setAttribute('marker-end','url(#gcl-arrow-head)');line.setAttribute('opacity','.78');line.classList.add(className);
  arrowSvg.appendChild(line);
}

function installArrowInput() {
  if (!board) return;
  let start=null;
  board.addEventListener('contextmenu',event=>{event.preventDefault();cancelPreMove();});
  board.addEventListener('pointerdown',event=>{
    const square=squareFromTarget(event.target);
    if (!square) return;
    if (event.button===2 || (event.pointerType==='touch' && drawMode)) {
      event.preventDefault();
      event.stopPropagation();
      start=square;
      try{board.setPointerCapture(event.pointerId);}catch{}
    } else if (event.button===0 && !drawMode) {
      clearAnnotations();
    }
  });
  board.addEventListener('pointerup',event=>{
    if (!start) return;
    const end=squareFromTarget(document.elementFromPoint(event.clientX,event.clientY));
    if (end) {
      const color=event.shiftKey?'#66d7a8':event.altKey?'#8ebcff':(document.getElementById('gcl-arrow-color')?.value||'#e9cf93');
      drawArrow(start,end,color);
      customArrows.push({from:start,to:end,color});
    }
    start=null;
  });
  board.addEventListener('pointercancel',()=>{start=null;});
}

function paintPreMove() {
  board?.querySelectorAll('.gcl-premove-square').forEach(el=>el.classList.remove('gcl-premove-square'));
  if (!preMove) return;
  [preMove.from,preMove.to].forEach(square=>board?.querySelector('[data-square="'+square+'"]')?.classList.add('gcl-premove-square'));
}
function cancelPreMove() {
  preMove=null;
  paintPreMove();
}
function selectPreMoveSquare(square) {
  const piece=api.game.get(square);
  const side=api.playerColor==='black'?'b':'w';
  if (!preMove || !preMove.from) {
    if (piece && piece.color===side) {
      preMove={from:square,to:null};
      paintPreMove();
    }
    return true;
  }
  if (piece && piece.color===side) {
    preMove={from:square,to:null};
    paintPreMove();
    return true;
  }
  preMove.to=square;
  paintPreMove();
  return true;
}
function attemptPreMove() {
  if (!preMove || !preMove.from || !preMove.to || api.thinking) return;
  if (api.turn !== (api.playerColor==='black'?'b':'w')) return;
  const move={from:preMove.from,to:preMove.to,promotion:'q'};
  cancelPreMove();
  try {
    const legal=api.game.moves({square:move.from,verbose:true}).some(item=>item.to===move.to);
    if (legal) api.playMove(move);
  } catch {}
}
function handlePreMoveClick(event) {
  if (!preMoveEnabled || drawMode || api.mode!=='computer' || !api.thinking || !api.playerColor) return;
  const square=squareFromTarget(event.target);
  if (!square) return;
  event.preventDefault();
  event.stopImmediatePropagation();
  selectPreMoveSquare(square);
}

function renderMaterial() {
  const host=document.getElementById('gcl-material');
  if (!host) return;
  const info=materialCount(api.history);
  const glyph={p:'♟',n:'♞',b:'♝',r:'♜',q:'♛'};
  const group=side=>Object.entries(info.captured[side].reduce((acc,p)=>(acc[p]=(acc[p]||0)+1,acc),{})).map(([p,n])=>glyph[p].repeat(n)).join(' ');
  const lead=info.net>0?'Black':info.net<0?'White':'Equal';
  const adv=Math.abs(info.net);
  host.innerHTML='<span>Captured by White <b>'+esc(group('black')||'—')+'</b></span><span>Captured by Black <b>'+esc(group('white')||'—')+'</b></span><strong>'+ (adv?lead+' +'+adv:'Material equal') +'</strong>';
  document.querySelectorAll('.player-label').forEach(label=>{let slot=label.querySelector('.gcl-nameplate-material');if(!slot){slot=document.createElement('small');slot.className='gcl-nameplate-material';label.appendChild(slot);}const side=label.classList.contains('bottom-player')?'white':'black';const score=info.net>0?(side==='black'?'+':''):info.net<0?(side==='white'?'+':''):'';slot.textContent=(score?score+adv+' · ':'')+(group(side==='white'?'black':'white')||'—');});
}

function detectOpening() {
  const sans=api.history.map(move=>move.san);
  let best=null;
  for (const item of OPENINGS) {
    if (item.moves.every((san,index)=>sans[index]===san) && (!best||item.moves.length>best.moves.length)) best=item;
  }
  const host=document.getElementById('gcl-opening-banner');
  if (host) host.textContent=best ? best.name+' · ECO '+best.eco : (sans.length?'Opening line not in local reference':'Opening explorer · Start with 1. e4, 1. d4 or 1. Nf3');
  return best;
}

function renderMoveHistory() {
  const host=document.getElementById('gcl-history-list');
  if (!host) return;
  const history=inspectedFullHistory||api.history;
  host.innerHTML=history.map((move,index)=>{
    const badge=reviewData[index]?.label;
    return '<button type="button" data-ply="'+(index+1)+'"><span>'+(Math.floor(index/2)+1)+(move.color==='w'?'.':'…')+' '+esc(move.san)+'</span>'+(badge?'<small class="gcl-badge gcl-badge-'+badge.toLowerCase()+'">'+esc(badge)+'</small>':'')+'</button>';
  }).join('')||'<p class="gcl-muted">No moves yet.</p>';
  host.querySelectorAll('[data-ply]').forEach(btn=>btn.addEventListener('click',()=>inspectPly(Number(btn.dataset.ply))));
}

function inspectPly(ply) {
  if (inspectedFullHistory==null) inspectedFullHistory=api.history.slice();
  const history=inspectedFullHistory;
  const target=Math.max(0,Math.min(history.length,ply));
  const fullFen=api.startFen||currentStartFen||START_FEN;
  suppressMoveHook=true;
  api.rebuild(fullFen,history.slice(0,target));
  suppressMoveHook=false;
  api.setReplayLock(true);
  inspectedIndex=target;
  document.getElementById('gcl-nav-status').textContent='Position after '+target+' ply';
  const move=history[target-1];
  if(move){
    const square=board?.querySelector('[data-square="'+move.to+'"]');
    if(square){square.classList.remove('gcl-review-destination');void square.offsetWidth;square.classList.add('gcl-review-destination');}
  }
}
function restoreFullHistory() {
  if(inspectedFullHistory){
    const base=api.startFen||currentStartFen||START_FEN;
    const saved=inspectedFullHistory.slice();
    suppressMoveHook=true;
    api.setReplayLock(false);
    api.rebuild(base,saved);
    suppressMoveHook=false;
    window.GlassChessPremium?.onLoadedGame?.(api.history,api.fen);
  } else api.setReplayLock(false);
  inspectedFullHistory=null;
  inspectedIndex=null;
  document.getElementById('gcl-nav-status').textContent='Live position';
  renderMoveHistory();
}
function branchFromHere(mode) {
  if (inspectedIndex==null) return;
  api.setReplayLock(false);
  const history=(inspectedFullHistory||api.history).slice(0,inspectedIndex);
  const base=api.startFen||currentStartFen||START_FEN;
  suppressMoveHook=true;
  api.rebuild(base,history);
  suppressMoveHook=false;
  inspectedIndex=null;
  inspectedFullHistory=null;
  currentStartFen=base;
  window.GlassChessPremium?.onLoadedGame?.(api.history,api.fen);
  api.setMode(mode,false);
  if(mode==='computer'&&api.turn!==(api.playerColor==='black'?'b':'w'))api.startEngineTurn?.();
  renderMoveHistory();
  document.getElementById('gcl-nav-status').textContent=mode==='computer'?'Playing against Stockfish from selected move':'Analysis branch started';
}
function playFromHere(){branchFromHere('computer');}
function exploreFromHere(){branchFromHere('analysis');}

function updateClassifications(results) {
  reviewData=results;
  renderMoveHistory();
  const counts={Brilliant:0,Great:0,Best:0,Inaccuracy:0,Mistake:0,Blunder:0};
  results.forEach(item=>{if(counts[item.label]!=null)counts[item.label]++;});
  const host=document.getElementById('gcl-classifications');
  if(host)host.innerHTML=Object.entries(counts).map(([name,count])=>'<span class="gcl-count"><b>'+count+'</b><small>'+name+'</small></span>').join('');
}

function classifyLoss(loss, playedBest, playedMove) {
  if (playedBest) {
    return playedMove?.promotion && playedMove.promotion!=='q' ? 'Brilliant' : 'Best';
  }
  if (loss<0.12) return 'Great';
  if (loss<0.45) return 'Inaccuracy';
  if (loss<1.25) return 'Mistake';
  return 'Blunder';
}

let reviewToken=0;
async function analyzeGame() {
  if (!api.engineReady) { document.getElementById('gcl-review-status').textContent='Stockfish is not ready'; return; }
  const token=++reviewToken;
  const start=api.startFen||START_FEN;
  const moves=api.history.slice();
  const positions=api.calculatePositions(start,moves);
  const results=[];
  const summary=document.getElementById('gcl-review-status');
  const progress=document.querySelector('#gcl-review-progress span');
  let totalAccuracy=0, rated=0;
  const sideAccuracy={w:{total:0,count:0},b:{total:0,count:0}};
  api.setReplayLock(true);
  document.getElementById('gcl-review').disabled=true;
  try {
    for(let i=0;i<moves.length;i++){
      if(token!==reviewToken)break;
      const before=await api.search(positions[i],8);
      if(token!==reviewToken)break;
      const after=await api.search(positions[i+1],8);
      if(token!==reviewToken)break;
      const pre=scoreFromInfo(before);
      const post=scoreFromInfo(after);
      const loss=pre==null||post==null?0:Math.max(0,pre+post);
      const playedBest=String(before.bestMove||'').toLowerCase()===uci(moves[i]);
      const label=classifyLoss(loss,playedBest,moves[i]);
      const accuracy=Math.max(0,Math.min(100,100-loss*25));
      totalAccuracy+=accuracy;rated++;
      sideAccuracy[moves[i].color].total+=accuracy;
      sideAccuracy[moves[i].color].count++;
      results.push({ply:i+1,move:moves[i],before:positions[i],after:positions[i+1],best:before.bestMove,label,loss,accuracy});
      updateClassifications(results);
      const destination=board?.querySelector('[data-square="'+moves[i].to+'"]');
      if(destination){
        const badge=document.createElement('span');
        badge.className='gcl-review-destination-badge gcl-badge gcl-badge-'+label.toLowerCase();
        badge.textContent=label;
        destination.appendChild(badge);
        window.setTimeout(()=>badge.remove(),1800);
        destination.classList.add('gcl-review-destination');
        window.setTimeout(()=>destination.classList.remove('gcl-review-destination'),1800);
      }
      summary.textContent='Analyzing '+(i+1)+' / '+moves.length;
      progress.style.width=((i+1)/Math.max(1,moves.length)*100)+'%';
    }
    if(token===reviewToken){
      updateClassifications(results);
      renderSummary(results,rated?Math.round(totalAccuracy/rated):null,sideAccuracy);
      retryQueue=results.filter(item=>['Mistake','Blunder'].includes(item.label) && (api.mode!=='computer'||item.move.color===(api.playerColor==='black'?'b':'w')));
      document.getElementById('gcl-retry-mistakes').disabled=!retryQueue.length;
      summary.textContent='Review complete';
    }
  } catch(error) {
    summary.textContent='Review paused: '+error.message;
  } finally {
    api.setReplayLock(false);
    document.getElementById('gcl-review').disabled=false;
  }
}
function renderSummary(results,accuracy,sideAccuracy={w:{total:0,count:0},b:{total:0,count:0}}) {
  const host=document.getElementById('gcl-summary');
  const labels=['Brilliant','Great','Best','Inaccuracy','Mistake','Blunder'];
  const counts={Brilliant:0,Great:0,Best:0,Inaccuracy:0,Mistake:0,Blunder:0};
  const bySide={w:{...counts},b:{...counts}};
  results.forEach(item=>{if(counts[item.label]!=null){counts[item.label]++;bySide[item.move.color][item.label]++;}});
  const pct=side=>sideAccuracy[side].count?Math.round(sideAccuracy[side].total/sideAccuracy[side].count)+'%':'—';
  const sideCard=side=>'<div class="gcl-side-accuracy"><strong>'+(side==='w'?'White':'Black')+' · '+pct(side)+'</strong><small>'+labels.map(label=>bySide[side][label]+' '+label).join(' · ')+'</small></div>';
  host.innerHTML='<div class="gcl-summary-head"><strong>Post-game review</strong><b>'+(accuracy==null?'—':accuracy+'%')+' <small>combined estimated accuracy</small></b></div><div class="gcl-side-accuracy-grid">'+sideCard('w')+sideCard('b')+'</div><div class="gcl-summary-counts">'+labels.map(k=>'<span>'+counts[k]+' '+k+'</span>').join('')+'</div><div class="gcl-turning-points">'+results.filter(r=>['Mistake','Blunder'].includes(r.label)).map(r=>'<button data-turn="'+r.ply+'">Move '+r.ply+' · '+r.label+'</button>').join('')+'</div>';
  host.querySelectorAll('[data-turn]').forEach(btn=>btn.addEventListener('click',()=>inspectPly(Number(btn.dataset.turn)-1)));
  const matches=safeHistory();const latest=matches.find(item=>item.pgn===api.pgn);if(latest){latest.accuracy=accuracy;saveHistory(matches);renderMatchHistory();}
}
function stopReview() { reviewToken++;void api.stopSearch?.();document.getElementById('gcl-review-status').textContent='Review stopped'; }

function startRetry() {
  if(!retryQueue.length)return;
  retryIndex=0;retryActive=true;
  api.setMode('analysis',false);
  loadRetryPosition();
  document.getElementById('gcl-exit-retry').disabled=false;
}
function loadRetryPosition() {
  const item=retryQueue[retryIndex];
  if(!item){retryActive=false;document.getElementById('gcl-retry-status').textContent='All mistakes retried.';return;}
  suppressMoveHook=true;
  api.loadFen(item.before);
  suppressMoveHook=false;
  api.setMode('analysis',false);
  document.getElementById('gcl-retry-status').textContent='Retry '+(retryIndex+1)+' / '+retryQueue.length+'. Find the move without a hint.';
}
function exitRetry(){retryActive=false;document.getElementById('gcl-retry-status').textContent='Retry mode closed';document.getElementById('gcl-exit-retry').disabled=true;}

function drawEngineArrow(result) {
  if(!result?.bestMove)return;
  const best=String(result.bestMove).toLowerCase();
  drawArrow(best.slice(0,2),best.slice(2,4),'#76d8b0','gcl-engine-arrow');
}

async function refreshEngineArrow() {
  const bestOn=Boolean(document.getElementById('gcl-engine-arrows')?.checked);
  const threatOn=Boolean(document.getElementById('gcl-threat-arrows')?.checked);
  clearEngineArrows();
  if((!bestOn&&!threatOn) || api.mode!=='analysis' || !api.engineReady || api.thinking)return;
  try{
    const result=await api.search(api.fen,10);
    if(bestOn)drawEngineArrow(result);
    if(threatOn){
      const pv=result.variations?.[0]?.pv||[];
      const reply=pv[1];
      if(reply?.length>=4)drawArrow(reply.slice(0,2),reply.slice(2,4),'#83bfff','gcl-threat-arrow');
    }
  }catch{}
}

function attackSquares(fen,side) {
  let position;
  try { position=new Chess(fen); } catch { return new Set(); }
  const attacked=new Set();
  const offsets={
    n:[[1,2],[2,1],[2,-1],[1,-2],[-1,-2],[-2,-1],[-2,1],[-1,2]],
    k:[[1,0],[-1,0],[0,1],[0,-1],[1,1],[1,-1],[-1,1],[-1,-1]]
  };
  const rays={
    b:[[1,1],[1,-1],[-1,1],[-1,-1]],
    r:[[1,0],[-1,0],[0,1],[0,-1]],
    q:[[1,1],[1,-1],[-1,1],[-1,-1],[1,0],[-1,0],[0,1],[0,-1]]
  };
  const fileIndex=file=>file.charCodeAt(0)-97;
  const add=(file,rank)=>{if(file>=0&&file<8&&rank>=1&&rank<=8)attacked.add('abcdefgh'[file]+rank);};
  for(let rank=1;rank<=8;rank++)for(const file of 'abcdefgh'){
    const piece=position.get(file+rank);
    if(!piece||piece.color!==side)continue;
    const f=fileIndex(file);
    if(piece.type==='p'){
      const step=side==='w'?1:-1;
      add(f-1,rank+step);add(f+1,rank+step);
    } else if(piece.type==='n'||piece.type==='k'){
      for(const [df,dr] of offsets[piece.type])add(f+df,rank+dr);
    } else {
      for(const [df,dr] of rays[piece.type]||[]){
        let nf=f+df,nr=rank+dr;
        while(nf>=0&&nf<8&&nr>=1&&nr<=8){
          const target='abcdefgh'[nf]+nr;
          attacked.add(target);
          if(position.get(target))break;
          nf+=df;nr+=dr;
        }
      }
    }
  }
  return attacked;
}
function paintHeatmap() {
  if(!board)return;
  board.querySelectorAll('.gcl-heat-white,.gcl-heat-black,.gcl-heat-both').forEach(el=>el.classList.remove('gcl-heat-white','gcl-heat-black','gcl-heat-both'));
  if(!heatmapEnabled)return;
  const white=attackSquares(api.fen,'w'),black=attackSquares(api.fen,'b');
  for(let rank=1;rank<=8;rank++)for(const file of 'abcdefgh'){
    const square=file+rank,el=board.querySelector('[data-square="'+square+'"]');
    if(!el)continue;
    if(white.has(square)&&black.has(square))el.classList.add('gcl-heat-both');
    else if(white.has(square))el.classList.add('gcl-heat-white');
    else if(black.has(square))el.classList.add('gcl-heat-black');
  }
}

async function copyText(text) {
  try{await navigator.clipboard.writeText(text);return true;}
  catch{
    const area=document.createElement('textarea');area.value=text;document.body.appendChild(area);area.select();
    const ok=document.execCommand('copy');area.remove();return ok;
  }
}
function downloadText(name,text,type='text/plain') {
  const blob=new Blob([text],{type});const url=URL.createObjectURL(blob);
  const link=document.createElement('a');link.href=url;link.download=name;document.body.appendChild(link);link.click();link.remove();
  setTimeout(()=>URL.revokeObjectURL(url),1000);
}
async function shareGame() {
  const payload={v:1,f:api.startFen||START_FEN,m:api.history.map(uci).join(',')};
  const plain=JSON.stringify(payload);
  let token;
  try{
    if('CompressionStream' in window){
      const stream=new Blob([plain]).stream().pipeThrough(new CompressionStream('gzip'));
      const bytes=new Uint8Array(await new Response(stream).arrayBuffer());
      let binary='';for(let i=0;i<bytes.length;i+=0x8000)binary+=String.fromCharCode(...bytes.subarray(i,i+0x8000));
      token='z'+btoa(binary);
    }else token='p'+btoa(unescape(encodeURIComponent(plain)));
  }catch{token='p'+btoa(unescape(encodeURIComponent(plain)));}
  const link=location.origin+location.pathname+'#gc-replay='+token;
  const ok=await copyText(link);
  document.getElementById('gcl-import-status').textContent=ok?'Replay link copied. Anyone opening it can load this game.':'Could not copy link.';
}
async function loadSharedReplay() {
  const match=location.hash.match(/gc-replay=([^&]+)/);
  if(!match)return;
  try{
    const token=match[1];
    let decoded;
    if(token.startsWith('z')&&'DecompressionStream' in window){
      const binary=atob(token.slice(1)),bytes=new Uint8Array(binary.length);
      for(let i=0;i<binary.length;i++)bytes[i]=binary.charCodeAt(i);
      const stream=new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));
      decoded=await new Response(stream).text();
    }else{
      const plain=token.startsWith('p')?token.slice(1):token;
      decoded=decodeURIComponent(escape(atob(plain)));
    }
    const payload=JSON.parse(decoded);
    if(typeof payload.m==='string')payload.moves=payload.m.split(',').filter(Boolean);
    if(payload.v!==1||!Array.isArray(payload.moves))throw new Error('Unsupported replay link');
    const base=payload.fen||payload.f||START_FEN;
    const chess=new Chess(base);
    for(const code of payload.moves){
      const move=chess.moves({verbose:true}).find(m=>uci(m)===String(code).toLowerCase());
      if(!move)throw new Error('Replay contains an illegal move');
      chess.move({from:move.from,to:move.to,promotion:move.promotion});
    }
    api.setMode('analysis',false);
    api.rebuild(base,chess.history({verbose:true}));
    window.GlassChessPremium?.onLoadedGame?.(api.history,api.fen);
    currentStartFen=base;
    inspectedFullHistory=null;inspectedIndex=null;
    document.getElementById('gcl-import-status').textContent='Shared game loaded for replay.';
    renderMoveHistory();
  }catch(error){document.getElementById('gcl-import-status').textContent='Could not load replay: '+error.message;}
}

function importFen() {
  const fen=document.getElementById('gcl-fen-input').value.trim();
  try{
    const candidate=new Chess(fen);
    api.loadFen(candidate.fen());
    currentStartFen=candidate.fen();
    document.getElementById('gcl-import-status').textContent='Position loaded successfully.';
  }catch(error){document.getElementById('gcl-import-status').textContent='Invalid FEN: '+error.message;}
}
function importPgn() {
  const pgn=document.getElementById('gcl-pgn-input').value.trim();
  try{
    const base=gameStartFromPgn(pgn);
    new Chess(base);
    api.loadPgn(pgn);
    currentStartFen=base;
    document.getElementById('gcl-import-status').textContent='PGN loaded successfully.';
  }catch(error){document.getElementById('gcl-import-status').textContent='Could not load PGN: '+error.message;}
}

function fenFromEditor() {
  const placement=[];
  for(let rank=8;rank>=1;rank--){
    let empty=0,row='';
    for(const file of 'abcdefgh'){
      const piece=editorPieces[file+rank];
      if(!piece)empty++;
      else{if(empty){row+=empty;empty=0;}row+=(piece[0]==='w'?piece[1].toUpperCase():piece[1].toLowerCase());}
    }
    if(empty)row+=empty;
    placement.push(row);
  }
  const turn=document.getElementById('gcl-editor-turn').value;
  const rights=['K','Q','k','q'].filter(c=>document.getElementById('gcl-castle-'+c).checked).join('')||'-';
  return placement.join('/')+' '+turn+' '+rights+' - 0 1';
}
let editorPieces={};
let editorSelected='';
function drawEditorBoard() {
  const host=document.getElementById('gcl-editor-board');
  if(!host)return;
  host.innerHTML='';
  for(let rank=8;rank>=1;rank--)for(const file of 'abcdefgh'){
    const square=file+rank,light=(file.charCodeAt(0)-97+rank)%2===1;
    const btn=document.createElement('button');btn.type='button';btn.className='gcl-editor-square '+(light?'light':'dark');
    btn.dataset.square=square;btn.textContent=editorPieces[square]?({'K':'♔','Q':'♕','R':'♖','B':'♗','N':'♘','P':'♙','k':'♚','q':'♛','r':'♜','b':'♝','n':'♞','p':'♟'}[editorPieces[square]]):'';
    btn.addEventListener('click',()=>{if(editorSelected)editorPieces[square]=editorSelected;else delete editorPieces[square];drawEditorBoard();});
    btn.addEventListener('dragover',e=>e.preventDefault());
    btn.addEventListener('drop',e=>{e.preventDefault();const piece=e.dataTransfer.getData('text/plain');if(piece)editorPieces[square]=piece;drawEditorBoard();});
    host.appendChild(btn);
  }
}
function drawEditorPalette() {
  const host=document.getElementById('gcl-editor-palette');
  const all=['wK','wQ','wR','wB','wN','wP','bK','bQ','bR','bB','bN','bP'];
  const glyph={wK:'♔',wQ:'♕',wR:'♖',wB:'♗',wN:'♘',wP:'♙',bK:'♚',bQ:'♛',bR:'♜',bB:'♝',bN:'♞',bP:'♟'};
  host.innerHTML='<button type="button" data-piece="">Erase</button>'+all.map(key=>'<button type="button" draggable="true" data-piece="'+key+'">'+glyph[key]+'</button>').join('');
  host.querySelectorAll('[data-piece]').forEach(btn=>{
    btn.addEventListener('click',()=>{editorSelected=btn.dataset.piece;host.querySelectorAll('button').forEach(b=>b.classList.toggle('active',b===btn));});
    btn.addEventListener('dragstart',e=>e.dataTransfer.setData('text/plain',btn.dataset.piece));
  });
}
function initialiseEditor() {
  document.getElementById('gcl-editor-turn').value='w';
  ['K','Q','k','q'].forEach(c=>{const el=document.getElementById('gcl-castle-'+c);if(el)el.checked=true;});
  editorPieces={};
  const grid=new Chess();
  for(let rank=1;rank<=8;rank++)for(const file of 'abcdefgh'){
    const piece=grid.get(file+rank);
    if(piece)editorPieces[file+rank]=piece.color+piece.type.toUpperCase();
  }
  drawEditorBoard();
}
function validateEditor() {
  try{
    const fen=fenFromEditor();
    new Chess(fen);
    const kings=Object.entries(editorPieces).filter(([sq,p])=>p==='wK'||p==='bK');
    if(kings.length!==2||!kings.some(([,p])=>p==='wK')||!kings.some(([,p])=>p==='bK'))throw new Error('Place exactly one white king and one black king.');
    const whiteKing=kings.find(([,p])=>p==='wK')[0],blackKing=kings.find(([,p])=>p==='bK')[0];
    const file=sq=>sq.charCodeAt(0)-97,rank=sq=>Number(sq[1]);
    if(Math.max(Math.abs(file(whiteKing)-file(blackKing)),Math.abs(rank(whiteKing)-rank(blackKing)))<=1)throw new Error('Kings cannot touch.');
    if('abcdefgh'.split('').some(f=>['wP','bP'].includes(editorPieces[f+'1'])||['wP','bP'].includes(editorPieces[f+'8'])))throw new Error('Pawns cannot be placed on the first or eighth rank.');
    const rights=[['K','e1','wK','h1','wR'],['Q','e1','wK','a1','wR'],['k','e8','bK','h8','bR'],['q','e8','bK','a8','bR']];
    for(const [right,kingSquare,king,rookSquare,rook] of rights){
      if(document.getElementById('gcl-castle-'+right).checked&&(editorPieces[kingSquare]!==king||editorPieces[rookSquare]!==rook))throw new Error('Castling right '+right+' needs its original king and rook squares.');
    }
    const parts=fen.split(' ');
    parts[1]=parts[1]==='w'?'b':'w';
    if(new Chess(parts.join(' ')).isCheck())throw new Error('The side that just moved cannot leave its king in check.');
    document.getElementById('gcl-editor-status').textContent='Position structure is valid. FEN: '+fen;
    return fen;
  }catch(error){document.getElementById('gcl-editor-status').textContent='Position invalid: '+error.message;return null;}
}
function applyEditor(mode) {
  const fen=validateEditor();if(!fen)return;
  try{
    api.loadFen(new Chess(fen).fen());api.setMode(mode,false);currentStartFen=fen;
    if(mode==='computer' && api.turn!==(api.playerColor==='black'?'b':'w'))api.startEngineTurn?.();
    document.getElementById('gcl-editor-status').textContent='Position loaded into '+mode+'.';
  } catch(error){document.getElementById('gcl-editor-status').textContent=error.message;}
}

function updatePersonaNote() {
  const key=document.getElementById('gcl-persona').value;
  document.getElementById('gcl-persona-note').textContent=PERSONAS[key]?.note||'';
}
async function applyPersona() {
  const key=document.getElementById('gcl-persona').value;
  const persona=PERSONAS[key];if(!persona)return;
  try{
    await api.configureEngine({skillLevel:persona.skillLevel,multiPV:persona.multiPV});
    savePrefs({persona:key});
    document.getElementById('gcl-persona-note').textContent=persona.label+' applied · Skill '+persona.skillLevel+' · MultiPV '+persona.multiPV+'.';
  }catch(error){document.getElementById('gcl-persona-note').textContent='Could not apply persona: '+error.message;}
}
function selectPersonaMove(result) {
  const persona=PERSONAS[loadPrefs().persona||'maximum']||PERSONAS.maximum;
  const candidates=(result.variations||[]).filter(v=>v.pv?.length).sort((a,b)=>(a.multipv||1)-(b.multipv||1));
  if(!candidates.length)return result.bestMove;
  if(persona.label==='Beginner'&&candidates.length>1){
    const roll=Math.random();
    const chosen=roll<.56?candidates[0]:roll<.86?candidates[1]:candidates[2]||candidates[0];
    return chosen.pv[0];
  }
  if(persona.label==='Aggressive Tactician'){
    for(const candidate of candidates){
      const first=candidate.pv[0];
      const move=api.game.moves({verbose:true}).find(m=>uci(m)===first);
      if(move?.captured)return first;
    }
  }
  return candidates[0].pv[0]||result.bestMove;
}

function formatClock(seconds) {
  const value=Math.max(0,Math.ceil(seconds));
  return String(Math.floor(value/60)).padStart(2,'0')+':'+String(value%60).padStart(2,'0');
}
function renderClock() {
  const w=document.getElementById('gcl-clock-white'),b=document.getElementById('gcl-clock-black');
  if(w){w.textContent=formatClock(clockState.white);w.classList.toggle('low',clockState.white<10);}
  if(b){b.textContent=formatClock(clockState.black);b.classList.toggle('low',clockState.black<10);}
}
function stopClock(){clockState.running=false;if(clockState.timer)clearInterval(clockState.timer);clockState.timer=null;renderClock();}
function startClock(reset=true) {
  stopClock();
  const preset=document.getElementById('gcl-time-preset').value;
  let minutes=5,increment=0;
  if(preset==='untimed'){document.getElementById('gcl-clock-white').textContent='∞';document.getElementById('gcl-clock-black').textContent='∞';return;}
  if(preset==='custom'){minutes=Math.max(1,Math.min(180,Number(document.getElementById('gcl-custom-minutes').value)||5));increment=Math.max(0,Math.min(60,Number(document.getElementById('gcl-custom-increment').value)||0));}
  else [minutes,increment]=preset.split('+').map(Number);
  if(reset){clockState.white=minutes*60;clockState.black=minutes*60;clockState.increment=increment;}
  clockState.side=api.turn;clockState.last=performance.now();clockState.running=true;
  clockState.timer=window.setInterval(()=>{
    const now=performance.now(),elapsed=Math.max(0,(now-clockState.last)/1000);clockState.last=now;
    const key=clockState.side==='w'?'white':'black';
    clockState[key]=Math.max(0,clockState[key]-elapsed);
    if(clockState[key]<=0){stopClock();document.getElementById('gcl-import-status').textContent=(key==='white'?'White':'Black')+' flag fell.';}
    else renderClock();
  },100);
  renderClock();
}
function tickClockAfterMove(move) {
  if(!clockState.running)return;
  const key=move.color==='w'?'white':'black';
  clockState[key]+=clockState.increment;
  clockState.side=api.turn;
  clockState.last=performance.now();
  renderClock();
}

function saveCompletedMatch() {
  if(!api.gameOver||api.mode==='analysis'||!api.history.length)return;
  const key=api.pgn+'|'+api.fen;
  if(key===cachedMatchSaved)return;
  cachedMatchSaved=key;
  const isDraw=api.draw||!api.checkmate;
  const winner=api.turn==='w'?'b':'w';
  const result=isDraw?'draw':winner===(api.playerColor==='black'?'b':'w')?'win':'loss';
  const item={id:Date.now()+'-'+Math.random().toString(36).slice(2,7),date:new Date().toISOString(),result,opponent:api.mode==='computer'?(PERSONAS[loadPrefs().persona||'maximum']?.label||'Stockfish'):'Local match',fen:api.startFen||START_FEN,moves:api.history.map(uci),pgn:api.pgn,accuracy:reviewData.length?Math.round(reviewData.reduce((sum,r)=>sum+r.accuracy,0)/reviewData.length):null};
  const items=safeHistory();items.unshift(item);saveHistory(items);renderMatchHistory();
}
function renderMatchHistory() {
  const host=document.getElementById('gcl-match-list');if(!host)return;
  const query=document.getElementById('gcl-match-filter').value.trim().toLowerCase();
  const items=safeHistory().filter(x=>(x.result+' '+x.opponent+' '+x.date).toLowerCase().includes(query));
  document.getElementById('gcl-match-count').textContent=items.length+' saved';
  host.innerHTML=items.map(item=>'<div class="gcl-match"><span><b>'+esc(item.result.toUpperCase())+'</b><small>'+new Date(item.date).toLocaleString()+' · '+esc(item.opponent)+'</small></span><button data-match="'+esc(item.id)+'">Open</button></div>').join('')||'<p class="gcl-muted">No completed games saved yet.</p>';
  host.querySelectorAll('[data-match]').forEach(btn=>btn.addEventListener('click',()=>{
    const item=safeHistory().find(x=>x.id===btn.dataset.match);if(!item)return;
    api.setMode('analysis',false);currentStartFen=item.fen||START_FEN;
    if(Array.isArray(item.moves)){
      const chess=new Chess(item.fen||START_FEN);
      for(const code of item.moves){const move=chess.moves({verbose:true}).find(m=>uci(m)===String(code).toLowerCase());if(!move)throw new Error('Saved game has an invalid move');chess.move({from:move.from,to:move.to,promotion:move.promotion});}
      api.rebuild(item.fen||START_FEN,chess.history({verbose:true}));
      window.GlassChessPremium?.onLoadedGame?.(api.history,api.fen);
    } else api.loadPgn(item.pgn);
    renderMoveHistory();
  }));
}

function moveConfirmationCapture(event) {
  if(!confirmEnabled||api.thinking||retryActive)return;
  const square=squareFromTarget(event.target);if(!square)return;
  event.preventDefault();event.stopImmediatePropagation();
  const piece=api.game.get(square);
  const side=api.playerColor==='black'?'b':'w';
  if(!confirmCandidate){
    if(piece?.color===side){confirmCandidate={from:square};paintConfirmPreview();}
    return;
  }
  if(piece?.color===side){confirmCandidate={from:square};paintConfirmPreview();return;}
  const choices=api.game.moves({square:confirmCandidate.from,verbose:true}).filter(m=>m.to===square);
  if(!choices.length){confirmCandidate=null;paintConfirmPreview();return;}
  confirmCandidate={...confirmCandidate,to:square,promotion:choices[0].promotion||undefined};
  paintConfirmPreview();
  showConfirmButtons();
}
function paintConfirmPreview() {
  board?.querySelectorAll('.gcl-confirm-from,.gcl-confirm-to').forEach(el=>el.classList.remove('gcl-confirm-from','gcl-confirm-to'));
  if(confirmCandidate?.from)board?.querySelector('[data-square="'+confirmCandidate.from+'"]')?.classList.add('gcl-confirm-from');
  if(confirmCandidate?.to)board?.querySelector('[data-square="'+confirmCandidate.to+'"]')?.classList.add('gcl-confirm-to');
}
function showConfirmButtons() {
  let host=document.getElementById('gcl-confirm-popover');
  if(!host){host=document.createElement('div');host.id='gcl-confirm-popover';host.innerHTML='<span>Confirm move?</span><button id="gcl-confirm-yes">Confirm</button><button id="gcl-confirm-no">Cancel</button>';document.body.appendChild(host);
    host.querySelector('#gcl-confirm-yes').addEventListener('click',()=>{const move=confirmCandidate;cancelConfirm();if(move)api.playMove(move);});
    host.querySelector('#gcl-confirm-no').addEventListener('click',cancelConfirm);
  }
  host.classList.add('show');
}
function cancelConfirm(){confirmCandidate=null;board?.querySelectorAll('.gcl-confirm-from,.gcl-confirm-to').forEach(el=>el.classList.remove('gcl-confirm-from','gcl-confirm-to'));document.getElementById('gcl-confirm-popover')?.classList.remove('show');}

function onPositionLoad(fen) {
  currentStartFen=fen||START_FEN;
  lastAutoReviewKey='';
  reviewData=[];
  inspectedFullHistory=null;
  inspectedIndex=null;
  cancelPreMove();
  cancelConfirm();
  renderMoveHistory();
}
function onReset(fen) {
  currentStartFen=fen||START_FEN;
  lastAutoReviewKey='';
  reviewData=[];
  retryQueue=[];retryIndex=0;retryActive=false;
  activePuzzle=null;
  inspectedFullHistory=null;inspectedIndex=null;
  cancelPreMove();cancelConfirm();stopClock();
  document.getElementById('gcl-summary').innerHTML='';
  document.getElementById('gcl-classifications').innerHTML='';
  document.getElementById('gcl-retry-status').textContent='';
  document.getElementById('gcl-review-status').textContent='Not reviewed';
  renderMoveHistory();renderMaterial();
}
function onMove(move,beforeFen,afterFen) {
  if(suppressMoveHook)return;
  if(clockState.running)tickClockAfterMove(move);
  if(preMove && api.turn===(api.playerColor==='black'?'b':'w')){
    window.setTimeout(attemptPreMove,0);
  } else if(preMove && api.turn!==(api.playerColor==='black'?'b':'w')) {
    // The queue remains visible through the engine reply and is revalidated afterward.
    paintPreMove();
  }
  if(retryActive){
    const expected=retryQueue[retryIndex];
    if(expected){
      if(uci(move)===String(expected.best||'').toLowerCase()){
        retryIndex++;window.setTimeout(loadRetryPosition,120);
      }else{
        api.game.undo();api.render();
        document.getElementById('gcl-retry-status').textContent='Not the engine move. Try again.';
      }
    }
  }
  if(activePuzzle){
    if(uci(move)===activePuzzle.best){
      document.getElementById('gcl-puzzle-status').textContent='Correct! Nice calculation.';
      activePuzzle=null;rushScore++;updateRushScore();
      if(rushTimer){loadNextPuzzle();}
    }else{
      api.game.undo();api.render();
      document.getElementById('gcl-puzzle-status').textContent='Not quite — try another move.';
    }
  }
  detectOpening();renderMaterial();renderMoveHistory();paintHeatmap();
  if(api.gameOver){
    stopClock();saveCompletedMatch();
    const reviewKey=api.pgn+'|'+api.fen;
    if(api.mode!=='analysis'&&reviewKey!==lastAutoReviewKey){
      lastAutoReviewKey=reviewKey;
      window.setTimeout(()=>{if(api.gameOver&&api.pgn+'|'+api.fen===reviewKey)void analyzeGame();},500);
    }
  }
  if(document.getElementById('gcl-engine-arrows')?.checked)window.setTimeout(()=>void refreshEngineArrow(),0);
}

function updateRushScore() {
  const host=document.getElementById('gcl-rush-clock');
  if(host)host.textContent=rushSeconds+'s · '+rushScore+' solved';
}
function loadNextPuzzle() {
  const puzzle=PUZZLES[(rushScore+Math.floor(Math.random()*PUZZLES.length))%PUZZLES.length];
  activePuzzle={...puzzle};
  api.loadFen(puzzle.fen);api.setMode('analysis',false);
  document.getElementById('gcl-puzzle-name').textContent=puzzle.name;
  document.getElementById('gcl-puzzle-copy').textContent=puzzle.theme+' · Find the best move.';
  document.getElementById('gcl-puzzle-rating').textContent='Rating '+puzzle.rating;
  document.getElementById('gcl-puzzle-status').textContent='White to move. Find the tactic.';
}
function startPuzzle() {
  rushTimer && stopRush();
  const puzzle=PUZZLES[rushScore%PUZZLES.length];
  activePuzzle={...puzzle};
  api.loadFen(puzzle.fen);api.setMode('analysis',false);
  document.getElementById('gcl-puzzle-name').textContent=puzzle.name;
  document.getElementById('gcl-puzzle-copy').textContent=puzzle.theme+' · Rating '+puzzle.rating;
  document.getElementById('gcl-puzzle-rating').textContent='Rating '+puzzle.rating;
  document.getElementById('gcl-puzzle-status').textContent='Find the move. The solution is hidden.';
}
function startRush() {
  stopRush();rushScore=0;rushSeconds=60;loadNextPuzzle();
  const host=document.getElementById('gcl-rush-clock');host.hidden=false;updateRushScore();
  rushTimer=window.setInterval(()=>{rushSeconds--;updateRushScore();if(rushSeconds<=0)stopRush();},1000);
}
function stopRush() {
  if(rushTimer)clearInterval(rushTimer);rushTimer=null;activePuzzle=null;
  document.getElementById('gcl-puzzle-status').textContent='Puzzle Rush finished · '+rushScore+' solved.';
}

async function startDrill() {
  const drill=DRILLS[Number(document.getElementById('gcl-drill-select').value)||0];
  activeDrill=drill;
  try{await api.configureEngine({skillLevel:20,multiPV:1});}catch{}
  api.loadFen(drill.fen);api.setMode('computer',false);
  document.getElementById('gcl-drill-copy').textContent=drill.note+' Stockfish 19 will defend at maximum strength.';
  document.getElementById('gcl-drill-select').disabled=false;
  if(api.turn!==(api.playerColor==='black'?'b':'w'))api.startEngineTurn?.();
}

function buildControls() {
  const $id=id=>document.getElementById(id);
  const prefs=loadPrefs();
  preMoveEnabled=Boolean(prefs.premove);
  confirmEnabled=Boolean(prefs.confirm);
  heatmapEnabled=Boolean(prefs.heatmap);
  drawMode=Boolean(prefs.drawMode);
  $id('gcl-premove').checked=preMoveEnabled;
  $id('gcl-confirm').checked=confirmEnabled;
  $id('gcl-heatmap').checked=heatmapEnabled;
  $id('gcl-draw-mode').checked=drawMode;
  $id('gcl-persona').innerHTML=Object.entries(PERSONAS).map(([id,p])=>'<option value="'+id+'">'+p.label+'</option>').join('');
  $id('gcl-persona').value=prefs.persona||'maximum';updatePersonaNote();
  $id('gcl-drill-select').innerHTML=DRILLS.map((d,i)=>'<option value="'+i+'">'+d.name+'</option>').join('');
  for(const type of ['K','Q','R','B','N','P'])for(const color of ['w','b']){
    const value=color+type;
    const option=document.createElement('option');option.value=value;option.textContent=color==='w'?'White '+type:'Black '+type;
    $id('gcl-editor-selected').appendChild(option);
  }
  initialiseEditor();drawEditorPalette();renderMatchHistory();renderMaterial();detectOpening();renderMoveHistory();renderClock();

  $id('gcl-premove').addEventListener('change',e=>{preMoveEnabled=e.target.checked;savePrefs({premove:preMoveEnabled});if(!preMoveEnabled)cancelPreMove();});
  $id('gcl-confirm').addEventListener('change',e=>{confirmEnabled=e.target.checked;savePrefs({confirm:confirmEnabled});cancelConfirm();});
  $id('gcl-heatmap').addEventListener('change',e=>{heatmapEnabled=e.target.checked;savePrefs({heatmap:heatmapEnabled});paintHeatmap();});
  $id('gcl-draw-mode').addEventListener('change',e=>{drawMode=e.target.checked;savePrefs({drawMode});});
  $id('gcl-engine-arrows').addEventListener('change',()=>void refreshEngineArrow());
  $id('gcl-threat-arrows').addEventListener('change',()=>void refreshEngineArrow());
  $id('gcl-clear-arrows').addEventListener('click',clearAnnotations);
  $id('gcl-refresh-heatmap').addEventListener('click',paintHeatmap);
  $id('gcl-review').addEventListener('click',()=>void analyzeGame());
  $id('gcl-stop-review').addEventListener('click',stopReview);
  $id('gcl-retry-mistakes').addEventListener('click',startRetry);
  $id('gcl-exit-retry').addEventListener('click',exitRetry);
  $id('gcl-history-start').addEventListener('click',()=>inspectPly(0));
  $id('gcl-history-back').addEventListener('click',()=>inspectPly(Math.max(0,(inspectedIndex??(inspectedFullHistory||api.history).length)-1)));
  $id('gcl-history-forward').addEventListener('click',()=>inspectPly(Math.min((inspectedFullHistory||api.history).length,(inspectedIndex??(inspectedFullHistory||api.history).length)+1)));
  $id('gcl-history-end').addEventListener('click',restoreFullHistory);
  $id('gcl-play-from-here').addEventListener('click',playFromHere);
  $id('gcl-explore-from-here').addEventListener('click',exploreFromHere);
  $id('gcl-import-pgn').addEventListener('click',()=>{importPgn();if(document.getElementById('gcl-import-status').textContent.includes('successfully'))api.setMode('analysis',false);});
  $id('gcl-import-fen').addEventListener('click',()=>{importFen();api.setMode('analysis',false);});
  $id('gcl-copy-pgn').addEventListener('click',()=>void copyText(api.pgn));
  $id('gcl-download-pgn').addEventListener('click',()=>downloadText('glass-chess.pgn',api.pgn,'application/x-chess-pgn'));
  $id('gcl-copy-fen').addEventListener('click',()=>void copyText(api.fen));
  $id('gcl-share-game').addEventListener('click',shareGame);
  $id('gcl-time-preset').addEventListener('change',()=>{$id('gcl-custom-clock').hidden=$id('gcl-time-preset').value!=='custom';});
  $id('gcl-clock-start').addEventListener('click',()=>startClock(true));
  $id('gcl-clock-pause').addEventListener('click',stopClock);
  $id('gcl-clock-reset').addEventListener('click',()=>startClock(true));
  $id('gcl-editor-selected').addEventListener('change',e=>{editorSelected=e.target.value;});
  $id('gcl-editor-clear').addEventListener('click',()=>{editorPieces={};drawEditorBoard();});
  $id('gcl-editor-start').addEventListener('click',initialiseEditor);
  $id('gcl-editor-validate').addEventListener('click',validateEditor);
  $id('gcl-editor-play').addEventListener('click',()=>applyEditor('computer'));
  $id('gcl-editor-analysis').addEventListener('click',()=>applyEditor('analysis'));
  $id('gcl-persona').addEventListener('change',updatePersonaNote);
  $id('gcl-persona-apply').addEventListener('click',()=>void applyPersona());
  if(api.engineReady)window.setTimeout(()=>void applyPersona(),350);
  else {const personaWait=window.setInterval(()=>{if(api.engineReady){window.clearInterval(personaWait);void applyPersona();}},650);}
  $id('gcl-match-filter').addEventListener('input',renderMatchHistory);
  $id('gcl-puzzle-start').addEventListener('click',startPuzzle);
  $id('gcl-puzzle-next').addEventListener('click',startPuzzle);
  $id('gcl-rush-start').addEventListener('click',startRush);
  $id('gcl-drill-start').addEventListener('click',()=>void startDrill());
  $id('gcl-drill-next').addEventListener('click',()=>{$id('gcl-drill-select').selectedIndex=(($id('gcl-drill-select').selectedIndex+1)%DRILLS.length);$id('gcl-drill-copy').textContent=DRILLS[$id('gcl-drill-select').selectedIndex].note;});
  $id('gcl-refresh-heatmap').addEventListener('click',paintHeatmap);

  board.addEventListener('click',handlePreMoveClick,true);
  board.addEventListener('click',moveConfirmationCapture,true);
  board.addEventListener('click',event=>{
    if(!event.target.closest('[data-square]'))return;
    if(preMoveEnabled&&api.thinking)return;
    if(!confirmEnabled)clearAnnotations();
  });
  installArrowInput();
  document.addEventListener('keydown',event=>{
    if(isTextEntry(event.target))return;
    if(event.key==='Escape'){cancelPreMove();cancelConfirm();clearAnnotations();exitRetry();return;}
    if(event.key==='ArrowLeft'){event.preventDefault();inspectPly(Math.max(0,(inspectedIndex??(inspectedFullHistory||api.history).length)-1));}
    if(event.key==='ArrowRight'){event.preventDefault();inspectPly(Math.min((inspectedFullHistory||api.history).length,(inspectedIndex??(inspectedFullHistory||api.history).length)+1));}
    if(event.key==='ArrowUp'){event.preventDefault();inspectPly(0);}
    if(event.key==='ArrowDown'){event.preventDefault();restoreFullHistory();}
    if(event.key.toLowerCase()==='f'){event.preventDefault();api.flip();}
  });
  document.addEventListener('pointerdown',event=>{
    if(!preMove||board.contains(event.target))return;
    cancelPreMove();
  });
  document.addEventListener('contextmenu',event=>{if(board.contains(event.target))event.preventDefault();});
  document.getElementById('gcl-editor-board').addEventListener('dragover',e=>e.preventDefault());
  document.getElementById('gcl-editor-board').addEventListener('drop',e=>e.preventDefault());

  const originalFen=api.fen;
  $id('gcl-pgn-input').value='';
  $id('gcl-fen-input').value='';
  if(window.matchMedia?.('(max-width: 650px)').matches && prefs.confirm==null){confirmEnabled=true;$id('gcl-confirm').checked=true;savePrefs({confirm:true});}
}

function render() {
  if(arrowSvg&&arrowSvg.parentElement===board)board.appendChild(arrowSvg);
  renderMaterial();detectOpening();renderMoveHistory();paintHeatmap();paintPreMove();
  redrawCustomAnnotations();
  const orient=api.isFlipped?'black':'white';
  if(lastArrowOrientation&&orient!==lastArrowOrientation){
    clearEngineArrows();
    if(document.getElementById('gcl-engine-arrows')?.checked||document.getElementById('gcl-threat-arrows')?.checked){
      window.setTimeout(()=>void refreshEngineArrow(),0);
    }
  }
  lastArrowOrientation=orient;
  document.getElementById('gcl-eval-bar')?.setAttribute('data-orientation',orient);
}
function unmount(){stopClock();stopRush();stopReview();}

export function mountGameplaySuite(chessApi,premiumRoot) {
  if(!chessApi||!premiumRoot||window.GlassChessGameplaySuite)return;
  api=chessApi;root=premiumRoot;currentStartFen=api.startFen||START_FEN;
  buildUI();mountEvaluationBar();mountArrowLayer();buildControls();
  window.GlassChessGameplaySuite={
    onMove,
    onEngineTurnReady(){if(preMove)attemptPreMove();},
    onReset,
    onPositionLoad,
    setEvaluation:updateEvaluation,
    selectEngineMove:selectPersonaMove,
    refreshEngineArrows(){void refreshEngineArrow();},
    refresh:render,
    get suppressMoveHook(){return suppressMoveHook;},
    isRetryActive(){return retryActive;},
    shouldSkipAutoAnalysis(){return retryActive||Boolean(activePuzzle);},
    getEngineOptions(){const p=PERSONAS[loadPrefs().persona||'maximum']||PERSONAS.maximum;return {skillLevel:p.skillLevel,multiPV:p.multiPV};},
    destroy:unmount
  };
  if(preMoveEnabled)paintPreMove();
  void loadSharedReplay();
}

import { Chess } from 'chess.js';
import './daily-puzzles.css';
import { DAILY_PUZZLES, getPuzzleDayIndex } from './daily-puzzle-data.js';
import { saveEngine } from './save-engine.js';

const STORAGE_KEY = 'glass-chess-daily-chess-puzzles-v3';
const FILES = 'abcdefgh';
const PIECES = {
  wK: '♔', wQ: '♕', wR: '♖', wB: '♗', wN: '♘', wP: '♙',
  bK: '♚', bQ: '♛', bR: '♜', bB: '♝', bN: '♞', bP: '♟'
};
const PIECE_NAMES = { p: 'pawn', n: 'knight', b: 'bishop', r: 'rook', q: 'queen', k: 'king' };

function localDateKey(date = new Date()) {
  return date.getFullYear() + '-' + String(date.getMonth() + 1).padStart(2, '0') + '-' + String(date.getDate()).padStart(2, '0');
}
function readProgress() {
  const today = localDateKey();
  const defaults = { version: 3, startedOn: today, completedDays: [], revealedDays: [], lastSolvedDay: 0, streak: 0, attempts: {} };
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
    if (!saved || saved.version !== 3 || !/^\d{4}-\d{2}-\d{2}$/.test(saved.startedOn || '')) return defaults;
    getPuzzleDayIndex(saved.startedOn, today);
    return {
      ...defaults, ...saved, version: 3,
      completedDays: [...new Set((Array.isArray(saved.completedDays) ? saved.completedDays : []).map(Number).filter(n => Number.isInteger(n) && n >= 1 && n <= DAILY_PUZZLES.length))],
      revealedDays: [...new Set((Array.isArray(saved.revealedDays) ? saved.revealedDays : []).map(Number).filter(n => Number.isInteger(n) && n >= 1 && n <= DAILY_PUZZLES.length))],
      attempts: saved.attempts && typeof saved.attempts === 'object' ? saved.attempts : {}
    };
  } catch { return defaults; }
}
function saveProgress(progress) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(progress)); }
  catch (error) { console.warn('Daily puzzle progress could not be saved locally.', error); }
  void saveEngine.saveData({ localStorage: { dailyPuzzleProgress: progress } })
    .then(() => window.GlassChessCloud?.queueSync?.())
    .catch(error => console.warn('Daily puzzle progress could not be added to the cloud save.', error));
}
function mergePuzzleProgress(local, remote) {
  if (!remote || remote.version !== 3 || !/^\\d{4}-\\d{2}-\\d{2}$/.test(remote.startedOn || '')) return local;
  const startedOn = !local?.startedOn ? remote.startedOn
    : remote.startedOn < local.startedOn ? remote.startedOn : local.startedOn;
  const completedDays = [...new Set([...(local?.completedDays || []), ...(remote.completedDays || [])])]
    .map(Number).filter(day => Number.isInteger(day) && day >= 1 && day <= DAILY_PUZZLES.length).sort((a,b) => a-b);
  const revealedDays = [...new Set([...(local?.revealedDays || []), ...(remote.revealedDays || [])])]
    .map(Number).filter(day => Number.isInteger(day) && day >= 1 && day <= DAILY_PUZZLES.length);
  const attempts = { ...(local?.attempts || {}) };
  for (const [day, count] of Object.entries(remote.attempts || {})) attempts[day] = Math.max(Number(attempts[day] || 0), Number(count || 0));
  return { ...local, version: 3, startedOn, completedDays, revealedDays, attempts,
    lastSolvedDay: Math.max(Number(local?.lastSolvedDay || 0), Number(remote.lastSolvedDay || 0)),
    streak: Math.max(Number(local?.streak || 0), Number(remote.streak || 0)) };
}
const uci = move => move.from + move.to + (move.promotion || '');
const moveInput = value => ({ from: value.slice(0, 2), to: value.slice(2, 4), ...(value[4] ? { promotion: value[4] } : {}) });

function isForkSolved(game, puzzle) {
  if (puzzle.goal !== 'fork' || !puzzle.targetSquare || !game.isCheck()) return false;
  const target = game.get(puzzle.targetSquare);
  if (!target || target.type !== 'q' || target.color !== game.turn()) return false;
  const knightSquare = puzzle.solution[0].slice(2, 4);
  const knight = game.get(knightSquare);
  if (!knight || knight.type !== 'n' || knight.color === game.turn()) return false;
  const df = Math.abs(FILES.indexOf(knightSquare[0]) - FILES.indexOf(puzzle.targetSquare[0]));
  const dr = Math.abs(Number(knightSquare[1]) - Number(puzzle.targetSquare[1]));
  return (df === 1 && dr === 2) || (df === 2 && dr === 1);
}

function mountDailyPuzzles() {
  if (typeof document === 'undefined' || document.getElementById('gc-daily-puzzle')) return;
  const header = document.querySelector('.topbar');
  if (!header) return;

  let progress = readProgress();
  const openButton = document.createElement('button');
  openButton.id = 'gc-daily-puzzle';
  openButton.type = 'button';
  openButton.className = 'gc-daily-trigger';
  openButton.textContent = 'Daily Puzzle';
  openButton.setAttribute('aria-haspopup', 'dialog');
  openButton.setAttribute('aria-controls', 'gc-daily-dialog');
  header.insertBefore(openButton, document.getElementById('new-game') || null);

  const dialog = document.createElement('dialog');
  dialog.id = 'gc-daily-dialog';
  dialog.className = 'gc-daily-dialog';
  dialog.setAttribute('aria-labelledby', 'gc-daily-heading');
  dialog.innerHTML = `
    <div class="gc-daily-shell">
      <header class="gc-daily-header">
        <div><p class="gc-daily-kicker">GLASS CHESS · DAILY CHALLENGE</p><h2 id="gc-daily-heading">Find the best move.</h2></div>
        <button class="gc-daily-close" type="button" data-action="close" aria-label="Close daily puzzle">×</button>
      </header>
      <div class="gc-daily-progress-line"><span id="gc-daily-day-label"></span><span id="gc-daily-completed-label"></span></div>
      <div class="gc-daily-progress-track"><span id="gc-daily-progress-fill"></span></div>
      <section class="gc-daily-card">
        <div class="gc-daily-meta"><span id="gc-daily-theme"></span><span id="gc-daily-rating"></span></div>
        <h3 id="gc-daily-title"></h3>
        <p id="gc-daily-prompt" class="gc-daily-prompt"></p>
        <div id="gc-daily-board" class="gc-daily-board" role="group" aria-label="Interactive chess puzzle board"></div>
        <div id="gc-daily-promotion" class="gc-daily-promotion" hidden></div>
        <div id="gc-daily-feedback" class="gc-daily-feedback" role="status" aria-live="polite"></div>
        <div id="gc-daily-hint" class="gc-daily-hint" hidden></div>
        <div class="gc-daily-actions">
          <button type="button" data-action="hint">Hint</button>
          <button type="button" data-action="restart">Reset</button>
          <span id="gc-daily-streak"></span>
        </div>
        <nav class="gc-daily-navigation" aria-label="Puzzle navigation">
          <button type="button" data-action="previous">← Previous</button>
          <span id="gc-daily-position"></span>
          <button type="button" class="gc-daily-next" data-action="next">Next puzzle →</button>
        </nav>
      </section>
      <footer class="gc-daily-footer"><span>50 curated chess tactics</span><span>Progress saved on this device</span></footer>
    </div>`;
  document.body.appendChild(dialog);

  const el = id => dialog.querySelector('#' + id);
  const action = name => dialog.querySelector('[data-action="' + name + '"]');
  let puzzleDay = Math.min(DAILY_PUZZLES.length, getPuzzleDayIndex(progress.startedOn, localDateKey()));
  let puzzle = null, game = null, selectedSquare = null, legalMoves = [], pendingPromotion = [], solved = false, boardSide = 'w';

  function applyCloudProgress(remote) {
    const merged = mergePuzzleProgress(progress, remote);
    if (JSON.stringify(merged) === JSON.stringify(progress)) return;
    progress = merged;
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(progress)); } catch {}
    updateProgressUI();
    if (dialog.open) renderPuzzle();
  }
  window.GlassChessDailyPuzzles = { applyCloudProgress };
  window.addEventListener('glasschess:cloud-profile', event => {
    applyCloudProgress(event.detail?.profile?.localStorage?.dailyPuzzleProgress);
  });

  function updateProgressUI() {
    const count = progress.completedDays.length;
    openButton.textContent = count ? 'Daily Puzzle · ' + count + '/' + DAILY_PUZZLES.length : 'Daily Puzzle';
    el('gc-daily-progress-fill').style.width = (count / DAILY_PUZZLES.length * 100) + '%';
    el('gc-daily-completed-label').textContent = count + ' / ' + DAILY_PUZZLES.length + ' solved';
    el('gc-daily-streak').textContent = progress.streak + ' day streak';
    el('gc-daily-position').textContent = 'Puzzle ' + puzzleDay + ' of ' + DAILY_PUZZLES.length;
    action('previous').disabled = puzzleDay <= 1;
    action('next').disabled = puzzleDay >= DAILY_PUZZLES.length;
  }
  function feedback(message, kind = 'neutral') {
    el('gc-daily-feedback').className = 'gc-daily-feedback' + (kind ? ' is-' + kind : '');
    el('gc-daily-feedback').textContent = message;
  }
  function clearSelection() { selectedSquare = null; legalMoves = []; }

  function renderBoard() {
    const host = el('gc-daily-board');
    host.replaceChildren();
    const ranks = boardSide === 'w' ? [8,7,6,5,4,3,2,1] : [1,2,3,4,5,6,7,8];
    const files = boardSide === 'w' ? [0,1,2,3,4,5,6,7] : [7,6,5,4,3,2,1,0];
    for (const rank of ranks) for (const file of files) {
      const square = FILES[file] + rank, piece = game.get(square);
      const cell = document.createElement('button');
      cell.type = 'button';
      cell.className = 'gc-daily-square ' + ((rank + file) % 2 === 0 ? 'is-light' : 'is-dark');
      cell.dataset.square = square;
      if (selectedSquare === square) cell.classList.add('is-selected');
      if (legalMoves.some(move => move.to === square)) cell.classList.add(piece ? 'is-capture' : 'is-legal');
      if (piece) {
        const glyph = document.createElement('span');
        glyph.className = 'gc-daily-piece ' + (piece.color === 'w' ? 'piece-white' : 'piece-black');
        glyph.textContent = PIECES[piece.color + piece.type.toUpperCase()];
        cell.appendChild(glyph);
      }
      cell.setAttribute('aria-label', square + (piece ? ', ' + (piece.color === 'w' ? 'white ' : 'black ') + PIECE_NAMES[piece.type] : ', empty'));
      cell.setAttribute('aria-pressed', String(selectedSquare === square));
      cell.disabled = solved || pendingPromotion.length > 0;
      cell.addEventListener('click', () => handleSquare(square));
      host.appendChild(cell);
    }
  }
  function revealSolution() {
    game = new Chess(puzzle.fen);
    const move = game.move(moveInput(puzzle.solution[0]));
    if (!move) throw new Error('The saved puzzle solution is invalid.');
    solved = true; clearSelection(); renderBoard();
    feedback('Solved · ' + move.san + ' — ' + puzzle.explanation, 'success');
  }
  function finishMove(move) {
    const correct = puzzle.goal === 'mate' ? game.isCheckmate() : isForkSolved(game, puzzle);
    if (!correct) {
      game.undo(); clearSelection(); renderBoard();
      feedback('That move is legal, but it does not solve the tactic. Try again.', 'error');
      return;
    }
    solved = true; clearSelection();
    if (!progress.completedDays.includes(puzzle.day)) {
      progress.completedDays.push(puzzle.day);
      progress.completedDays.sort((a,b) => a-b);
      progress.streak = progress.lastSolvedDay === puzzle.day - 1 ? progress.streak + 1 : 1;
      progress.lastSolvedDay = puzzle.day;
    }
    saveProgress(progress); renderBoard();
    feedback('Correct · ' + move.san + ' — ' + puzzle.explanation, 'success');
    updateProgressUI();
  }
  function playMove(move) {
    if (solved || !move) return;
    if (uci(move) !== puzzle.solution[0]) {
      progress.attempts[puzzle.day] = Number(progress.attempts[puzzle.day] || 0) + 1;
      saveProgress(progress); clearSelection(); renderBoard();
      feedback('Not quite. Look for the forcing move.', 'error'); return;
    }
    const played = game.move({ from: move.from, to: move.to, ...(move.promotion ? { promotion: move.promotion } : {}) });
    if (!played) { clearSelection(); renderBoard(); feedback('That move is not legal. Select a highlighted square.', 'error'); return; }
    finishMove(played);
  }
  function showPromotion(choices) {
    pendingPromotion = choices;
    const panel = el('gc-daily-promotion'); panel.replaceChildren();
    const label = document.createElement('strong'); label.textContent = 'Choose your promotion'; panel.appendChild(label);
    for (const choice of choices) {
      const button = document.createElement('button'); button.type = 'button';
      button.textContent = PIECES[game.turn() + choice.promotion.toUpperCase()] + ' ' + ({q:'Queen',r:'Rook',b:'Bishop',n:'Knight'}[choice.promotion]);
      button.addEventListener('click', () => { panel.hidden = true; pendingPromotion = []; playMove(choice); });
      panel.appendChild(button);
    }
    const cancel = document.createElement('button'); cancel.type = 'button'; cancel.textContent = 'Cancel';
    cancel.addEventListener('click', () => { pendingPromotion = []; panel.hidden = true; renderBoard(); });
    panel.appendChild(cancel); panel.hidden = false; renderBoard();
  }
  function handleSquare(square) {
    if (solved || pendingPromotion.length) return;
    const piece = game.get(square);
    if (selectedSquare) {
      const choices = legalMoves.filter(move => move.to === square);
      if (choices.length > 1 && choices.every(move => move.promotion)) { showPromotion(choices); return; }
      if (choices.length === 1) { playMove(choices[0]); return; }
    }
    if (piece && piece.color === game.turn()) {
      selectedSquare = square; legalMoves = game.moves({ square, verbose: true }); renderBoard(); return;
    }
    clearSelection(); renderBoard();
  }
  function renderPuzzle() {
    progress = readProgress();
    puzzle = DAILY_PUZZLES[puzzleDay - 1];
    game = new Chess(puzzle.fen); boardSide = game.turn();
    clearSelection(); pendingPromotion = []; solved = progress.completedDays.includes(puzzle.day);
    el('gc-daily-day-label').textContent = 'DAILY CHALLENGE · ' + localDateKey();
    el('gc-daily-theme').textContent = puzzle.type.toUpperCase();
    el('gc-daily-rating').textContent = 'RATING ' + puzzle.rating;
    el('gc-daily-title').textContent = puzzle.title;
    el('gc-daily-prompt').textContent = (game.turn() === 'w' ? 'White' : 'Black') + ' to move. ' + (puzzle.goal === 'mate' ? 'Find checkmate in one.' : 'Find the checking fork.');
    el('gc-daily-hint').hidden = true; el('gc-daily-hint').textContent = '';
    el('gc-daily-promotion').hidden = true;
    action('hint').textContent = 'Hint';
    feedback(solved ? 'You already solved this puzzle.' : 'Tap a piece, then tap a highlighted destination.', solved ? 'success' : 'neutral');
    if (solved) revealSolution(); else renderBoard();
    updateProgressUI();
  }
  function closeDialog() { if (dialog.open) dialog.close(); openButton.focus(); }

  openButton.addEventListener('click', () => {
    renderPuzzle();
    if (typeof dialog.showModal === 'function') dialog.showModal(); else dialog.setAttribute('open', '');
    dialog.querySelector('.gc-daily-square:not([disabled])')?.focus();
  });
  action('close').addEventListener('click', closeDialog);
  action('hint').addEventListener('click', () => {
    const hint = el('gc-daily-hint');
    hint.hidden = !hint.hidden;
    hint.textContent = hint.hidden ? '' : 'HINT · ' + puzzle.hint;
    action('hint').textContent = hint.hidden ? 'Hint' : 'Hide hint';
  });
  action('restart').addEventListener('click', () => {
    if (solved) { feedback('This puzzle is already solved. Use Next puzzle to continue.', 'success'); return; }
    game = new Chess(puzzle.fen); boardSide = game.turn(); clearSelection(); pendingPromotion = [];
    el('gc-daily-promotion').hidden = true; renderBoard(); feedback('Puzzle reset. Find the strongest move.');
  });
  action('previous').addEventListener('click', () => { if (puzzleDay > 1) { puzzleDay--; renderPuzzle(); } });
  action('next').addEventListener('click', () => { if (puzzleDay < DAILY_PUZZLES.length) { puzzleDay++; renderPuzzle(); } });
  dialog.addEventListener('click', event => { if (event.target === dialog) closeDialog(); });
  dialog.addEventListener('cancel', event => { event.preventDefault(); closeDialog(); });
  updateProgressUI();
}
if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mountDailyPuzzles, { once: true });
  else mountDailyPuzzles();
}

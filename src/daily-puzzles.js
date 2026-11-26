import { Chess } from 'chess.js';
import './daily-puzzles.css';
import { DAILY_PUZZLES, getPuzzleDayIndex } from './daily-puzzle-data.js';

const STORAGE_KEY = 'glass-chess-daily-chess-puzzles-v2';
const FILES = 'abcdefgh';
const PIECES = {
  wK: '♔', wQ: '♕', wR: '♖', wB: '♗', wN: '♘', wP: '♙',
  bK: '♚', bQ: '♛', bR: '♜', bB: '♝', bN: '♞', bP: '♟︎'
};

function localDateKey(date = new Date()) {
  return date.getFullYear() + '-' +
    String(date.getMonth() + 1).padStart(2, '0') + '-' +
    String(date.getDate()).padStart(2, '0');
}

function readProgress() {
  const today = localDateKey();
  const defaults = {
    version: 2,
    startedOn: today,
    completedDays: [],
    revealedDays: [],
    lastSolvedDay: 0,
    streak: 0,
    attempts: {}
  };
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
    if (!saved || saved.version !== 2 ||
        !/^\d{4}-\d{2}-\d{2}$/.test(saved.startedOn || '')) {
      return defaults;
    }
    getPuzzleDayIndex(saved.startedOn, today);
    return {
      ...defaults,
      ...saved,
      completedDays: Array.isArray(saved.completedDays)
        ? [...new Set(saved.completedDays.map(Number).filter(day =>
            Number.isInteger(day) && day >= 1 && day <= 50))]
        : [],
      revealedDays: Array.isArray(saved.revealedDays)
        ? [...new Set(saved.revealedDays.map(Number).filter(day =>
            Number.isInteger(day) && day >= 1 && day <= 50))]
        : [],
      attempts: saved.attempts && typeof saved.attempts === 'object'
        ? saved.attempts
        : {}
    };
  } catch {
    return defaults;
  }
}

function saveProgress(progress) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(progress));
  } catch (error) {
    console.warn('Daily chess puzzle progress could not be saved on this device.', error);
  }
}

function uci(move) {
  return move.from + move.to + (move.promotion || '');
}

function moveInput(uciMove) {
  return {
    from: uciMove.slice(0, 2),
    to: uciMove.slice(2, 4),
    ...(uciMove[4] ? { promotion: uciMove[4] } : {})
  };
}

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
  if (typeof document === 'undefined' ||
      document.getElementById('gc-daily-puzzle')) return;

  const header = document.querySelector('.topbar');
  if (!header) return;

  let progress = readProgress();
  saveProgress(progress);

  const openButton = document.createElement('button');
  openButton.id = 'gc-daily-puzzle';
  openButton.type = 'button';
  openButton.className = 'gc-daily-trigger';
  openButton.textContent = 'Daily Puzzle';
  openButton.setAttribute('aria-haspopup', 'dialog');
  openButton.setAttribute('aria-controls', 'gc-daily-dialog');
  const newGameButton = document.getElementById('new-game');
  header.insertBefore(openButton, newGameButton || null);

  const dialog = document.createElement('dialog');
  dialog.id = 'gc-daily-dialog';
  dialog.className = 'gc-daily-dialog';
  dialog.setAttribute('aria-labelledby', 'gc-daily-heading');
  dialog.innerHTML = [
    '<div class="gc-daily-shell">',
      '<header class="gc-daily-header">',
        '<div><p class="gc-daily-kicker">THE DAILY CHESS CHALLENGE</p><h2 id="gc-daily-heading">Find the best move.</h2></div>',
        '<button class="gc-daily-close" type="button" data-action="close" aria-label="Close daily puzzle">×</button>',
      '</header>',
      '<div class="gc-daily-progress-line"><span id="gc-daily-day-label"></span><span id="gc-daily-completed-label"></span></div>',
      '<div class="gc-daily-progress-track" aria-hidden="true"><span id="gc-daily-progress-fill"></span></div>',
      '<section class="gc-daily-card">',
        '<div class="gc-daily-meta"><span id="gc-daily-theme"></span><span id="gc-daily-rating"></span></div>',
        '<h3 id="gc-daily-title"></h3>',
        '<p id="gc-daily-prompt" class="gc-daily-prompt"></p>',
        '<div id="gc-daily-board" class="gc-daily-board" role="group" aria-label="Daily chess puzzle board"></div>',
        '<div id="gc-daily-promotion" class="gc-daily-promotion" hidden></div>',
        '<div id="gc-daily-feedback" class="gc-daily-feedback" role="status" aria-live="polite"></div>',
        '<div id="gc-daily-hint" class="gc-daily-hint" hidden></div>',
        '<div class="gc-daily-actions">',
          '<button type="button" data-action="hint">Hint</button>',
          '<button type="button" data-action="restart">Reset puzzle</button>',
          '<span id="gc-daily-streak"></span>',
        '</div>',
      '</section>',
      '<footer class="gc-daily-footer"><span>50 daily chess puzzles</span><span>Progress saved on this device</span></footer>',
    '</div>'
  ].join('');
  document.body.appendChild(dialog);

  const el = id => dialog.querySelector('#' + id);
  let puzzle = null;
  let game = null;
  let selectedSquare = null;
  let legalMoves = [];
  let pendingPromotion = [];
  let hintVisible = false;
  let solved = false;
  let boardSide = 'w';

  function currentDay() {
    return getPuzzleDayIndex(progress.startedOn, localDateKey());
  }

  function currentPuzzle() {
    return DAILY_PUZZLES[currentDay() - 1];
  }

  function completedCount() {
    return progress.completedDays.length;
  }

  function updateProgressUI() {
    const count = completedCount();
    openButton.textContent = count ? 'Daily Puzzle · ' + count + '/50' : 'Daily Puzzle';
    el('gc-daily-progress-fill').style.width = (count / 50 * 100) + '%';
    el('gc-daily-completed-label').textContent = count + ' / 50 solved';
    el('gc-daily-streak').textContent = progress.streak + ' day streak';
  }

  function renderBoard() {
    const host = el('gc-daily-board');
    host.replaceChildren();
    const ranks = boardSide === 'w'
      ? [8, 7, 6, 5, 4, 3, 2, 1]
      : [1, 2, 3, 4, 5, 6, 7, 8];
    const files = boardSide === 'w'
      ? [0, 1, 2, 3, 4, 5, 6, 7]
      : [7, 6, 5, 4, 3, 2, 1, 0];
    for (const rank of ranks) {
      for (const file of files) {
        const square = FILES[file] + rank;
        const piece = game.get(square);
        const cell = document.createElement('button');
        cell.type = 'button';
        cell.className = 'gc-daily-square ' +
          ((rank + file) % 2 === 0 ? 'is-light' : 'is-dark');
        cell.dataset.square = square;
        if (selectedSquare === square) cell.classList.add('is-selected');
        if (legalMoves.some(move => move.to === square)) {
          cell.classList.add(piece ? 'is-capture' : 'is-legal');
        }
        if (piece) {
          const key = (piece.color === 'w' ? 'w' : 'b') +
            piece.type.toUpperCase();
          cell.textContent = PIECES[key];
          cell.classList.add(piece.color === 'w' ? 'piece-white' : 'piece-black');
        }
        const label = piece
          ? square + ', ' + (piece.color === 'w' ? 'white ' : 'black ') +
            ({ p: 'pawn', n: 'knight', b: 'bishop', r: 'rook', q: 'queen', k: 'king' }[piece.type])
          : square + ', empty';
        cell.setAttribute('aria-label', label);
        cell.setAttribute('aria-pressed', selectedSquare === square ? 'true' : 'false');
        cell.disabled = solved || Boolean(pendingPromotion.length);
        cell.addEventListener('click', () => handleSquare(square));
        host.appendChild(cell);
      }
    }
  }

  function showFeedback(message, kind = 'neutral') {
    const feedback = el('gc-daily-feedback');
    feedback.className = 'gc-daily-feedback' + (kind ? ' is-' + kind : '');
    feedback.textContent = message;
  }

  function clearSelection() {
    selectedSquare = null;
    legalMoves = [];
  }

  function revealSolvedPosition() {
    game = new Chess(puzzle.fen);
    const move = game.move(moveInput(puzzle.solution[0]));
    if (!move) throw new Error('The stored daily puzzle solution is not legal.');
    solved = true;
    clearSelection();
    renderBoard();
    showFeedback(
      'Solved · ' + move.san + ' — ' + puzzle.explanation,
      'success'
    );
  }

  function finishCorrectMove(move) {
    const success = puzzle.goal === 'mate'
      ? game.isCheckmate()
      : isForkSolved(game, puzzle);
    if (!success) {
      game.undo();
      clearSelection();
      renderBoard();
      showFeedback('That move is legal, but it does not complete this tactic. Try another move.', 'error');
      return;
    }

    solved = true;
    clearSelection();
    const day = puzzle.day;
    const wasSolved = progress.completedDays.includes(day);
    if (!wasSolved) {
      progress.completedDays.push(day);
      progress.completedDays.sort((a, b) => a - b);
      progress.streak = progress.lastSolvedDay === day - 1
        ? progress.streak + 1
        : 1;
      progress.lastSolvedDay = day;
    }
    saveProgress(progress);
    renderBoard();
    showFeedback(
      'Correct · ' + move.san + ' — ' + puzzle.explanation,
      'success'
    );
    updateProgressUI();
  }

  function playMove(move) {
    if (solved || !move) return;
    const intended = puzzle.solution[0];
    if (uci(move) !== intended) {
      progress.attempts[puzzle.day] =
        Number(progress.attempts[puzzle.day] || 0) + 1;
      saveProgress(progress);
      clearSelection();
      renderBoard();
      showFeedback(
        'Not the strongest move. Find the forcing continuation.',
        'error'
      );
      return;
    }

    const played = game.move({
      from: move.from,
      to: move.to,
      ...(move.promotion ? { promotion: move.promotion } : {})
    });
    if (!played) {
      clearSelection();
      renderBoard();
      showFeedback('That move is not legal. Select a highlighted square.', 'error');
      return;
    }
    finishCorrectMove(played);
  }

  function choosePromotion(moveChoices) {
    pendingPromotion = moveChoices;
    const panel = el('gc-daily-promotion');
    panel.replaceChildren();
    const label = document.createElement('strong');
    label.textContent = 'Choose your promotion';
    panel.appendChild(label);
    for (const choice of moveChoices) {
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = PIECES[(game.turn() === 'w' ? 'w' : 'b') + choice.promotion.toUpperCase()] +
        ' ' + ({ q: 'Queen', r: 'Rook', b: 'Bishop', n: 'Knight' }[choice.promotion]);
      button.addEventListener('click', () => {
        panel.hidden = true;
        pendingPromotion = [];
        playMove(choice);
      });
      panel.appendChild(button);
    }
    const cancel = document.createElement('button');
    cancel.type = 'button';
    cancel.textContent = 'Cancel';
    cancel.addEventListener('click', () => {
      pendingPromotion = [];
      panel.hidden = true;
      renderBoard();
    });
    panel.appendChild(cancel);
    panel.hidden = false;
    renderBoard();
  }

  function handleSquare(square) {
    if (solved || pendingPromotion.length) return;
    const piece = game.get(square);
    if (selectedSquare) {
      const choices = legalMoves.filter(move => move.to === square);
      if (choices.length > 1 && choices.every(move => Boolean(move.promotion))) {
        choosePromotion(choices);
        return;
      }
      if (choices.length === 1) {
        playMove(choices[0]);
        return;
      }
    }
    if (piece && piece.color === game.turn()) {
      selectedSquare = square;
      legalMoves = game.moves({ square, verbose: true });
      renderBoard();
      return;
    }
    clearSelection();
    renderBoard();
  }

  function renderPuzzle() {
    progress = readProgress();
    puzzle = currentPuzzle();
    game = new Chess(puzzle.fen);
    boardSide = game.turn();
    selectedSquare = null;
    legalMoves = [];
    pendingPromotion = [];
    hintVisible = false;
    solved = progress.completedDays.includes(puzzle.day);
    el('gc-daily-day-label').textContent =
      'DAY ' + puzzle.day + ' OF 50 · ' + localDateKey();
    el('gc-daily-theme').textContent = puzzle.type.toUpperCase();
    el('gc-daily-rating').textContent = 'RATING ' + puzzle.rating;
    el('gc-daily-title').textContent = puzzle.title;
    el('gc-daily-prompt').textContent =
      (game.turn() === 'w' ? 'White' : 'Black') + ' to move. ' +
      (puzzle.goal === 'mate' ? 'Find checkmate in one.' : 'Find the checking fork.');
    el('gc-daily-hint').textContent = 'HINT · ' + puzzle.hint;
    el('gc-daily-hint').hidden = true;
    el('gc-daily-hint').textContent = '';
    el('gc-daily-promotion').hidden = true;
    showFeedback(
      solved ? 'You already solved today’s puzzle.' : 'Select a piece, then choose a legal destination.',
      solved ? 'success' : 'neutral'
    );
    dialog.querySelector('[data-action="hint"]').textContent = 'Hint';
    if (solved) revealSolvedPosition();
    else renderBoard();
    updateProgressUI();
  }

  function closeDialog() {
    if (dialog.open) dialog.close();
    openButton.focus();
  }

  openButton.addEventListener('click', () => {
    renderPuzzle();
    if (typeof dialog.showModal === 'function') dialog.showModal();
    else dialog.setAttribute('open', '');
    dialog.querySelector('.gc-daily-square:not([disabled])')?.focus();
  });

  dialog.querySelector('[data-action="close"]').addEventListener('click', closeDialog);
  dialog.querySelector('[data-action="hint"]').addEventListener('click', () => {
    hintVisible = !hintVisible;
    el('gc-daily-hint').hidden = !hintVisible;
    el('gc-daily-hint').textContent = hintVisible ? 'HINT · ' + puzzle.hint : '';
    dialog.querySelector('[data-action="hint"]').textContent = hintVisible ? 'Hide hint' : 'Hint';
  });
  dialog.querySelector('[data-action="restart"]').addEventListener('click', () => {
    if (solved) return;
    game = new Chess(puzzle.fen);
    clearSelection();
    pendingPromotion = [];
    el('gc-daily-promotion').hidden = true;
    renderBoard();
    showFeedback('Puzzle reset. Find the strongest move.', 'neutral');
  });
  dialog.addEventListener('click', event => {
    if (event.target === dialog) closeDialog();
  });
  dialog.addEventListener('cancel', event => {
    event.preventDefault();
    closeDialog();
  });

  updateProgressUI();
}

if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', mountDailyPuzzles, { once: true });
  } else {
    mountDailyPuzzles();
  }
}

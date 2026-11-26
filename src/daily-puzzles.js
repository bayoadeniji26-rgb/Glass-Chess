import './daily-puzzles.css';
import { DAILY_PUZZLES, getPuzzleDayIndex, isPuzzleAnswerCorrect } from './daily-puzzle-data.js';
export { DAILY_PUZZLES, getPuzzleDayIndex, isPuzzleAnswerCorrect, normalizePuzzleAnswer } from './daily-puzzle-data.js';

const STORAGE_KEY = 'glass-chess-daily-puzzles-v1';
function localDateKey(date = new Date()) {
  return date.getFullYear() + '-' +
    String(date.getMonth() + 1).padStart(2, '0') + '-' +
    String(date.getDate()).padStart(2, '0');
}

function readProgress() {
  const today = localDateKey();
  const defaults = {
    version: 1,
    startedOn: today,
    maxDay: 1,
    completedDays: [],
    lastSolvedDay: 0,
    streak: 0,
    attempts: {}
  };
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
    if (!saved || saved.version !== 1 || !/^\d{4}-\d{2}-\d{2}$/.test(saved.startedOn || '')) {
      return defaults;
    }
    const computedDay = getPuzzleDayIndex(saved.startedOn, today);
    const previousMax = Number.isInteger(Number(saved.maxDay)) ? Number(saved.maxDay) : 1;
    const maxDay = Math.max(1, Math.min(50, Math.max(computedDay, previousMax)));
    return {
      ...defaults,
      ...saved,
      maxDay,
      completedDays: Array.isArray(saved.completedDays)
        ? [...new Set(saved.completedDays.map(Number).filter(day => Number.isInteger(day) && day >= 1 && day <= 50))]
        : [],
      attempts: saved.attempts && typeof saved.attempts === 'object' ? saved.attempts : {}
    };
  } catch {
    return defaults;
  }
}

function saveProgress(progress) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(progress)); }
  catch (error) { console.warn('Daily puzzle progress could not be saved on this device.', error); }
}

function mountDailyPuzzles() {
  if (typeof document === 'undefined' || document.getElementById('gc-daily-puzzle')) return;
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
        '<div><p class="gc-daily-kicker">THE DAILY CHALLENGE</p><h2 id="gc-daily-heading">A sharper mind, one day at a time.</h2></div>',
        '<button class="gc-daily-close" type="button" data-action="close" aria-label="Close daily puzzle">×</button>',
      '</header>',
      '<div class="gc-daily-progress-line"><span id="gc-daily-day-label"></span><span id="gc-daily-completed-label"></span></div>',
      '<div class="gc-daily-progress-track" aria-hidden="true"><span id="gc-daily-progress-fill"></span></div>',
      '<section class="gc-daily-card">',
        '<div class="gc-daily-meta"><span id="gc-daily-category"></span><span id="gc-daily-streak"></span></div>',
        '<h3 id="gc-daily-title"></h3>',
        '<p id="gc-daily-prompt"></p>',
        '<div id="gc-daily-hint" class="gc-daily-hint" hidden></div>',
        '<label for="gc-daily-answer">Your answer</label>',
        '<form id="gc-daily-form" class="gc-daily-answer-row">',
          '<input id="gc-daily-answer" name="answer" type="text" autocomplete="off" maxlength="120" placeholder="Type your answer…" required>',
          '<button id="gc-daily-submit" type="submit">Check answer</button>',
        '</form>',
        '<div id="gc-daily-feedback" class="gc-daily-feedback" role="status" aria-live="polite"></div>',
        '<div class="gc-daily-actions"><button type="button" data-action="hint">Show hint</button><span>One puzzle each local calendar day</span></div>',
      '</section>',
      '<footer class="gc-daily-footer"><span>50-day series</span><span>Progress is saved on this device</span></footer>',
    '</div>'
  ].join('');
  document.body.appendChild(dialog);

  const el = id => document.getElementById(id);
  const currentPuzzle = () => DAILY_PUZZLES[progress.maxDay - 1];
  let hintVisible = false;

  function updateHeaderProgress() {
    const completed = progress.completedDays.length;
    openButton.textContent = completed ? 'Daily Puzzle · ' + completed + '/50' : 'Daily Puzzle';
    el('gc-daily-progress-fill').style.width = (completed / 50 * 100) + '%';
    el('gc-daily-completed-label').textContent = completed + ' / 50 solved';
    el('gc-daily-streak').textContent = progress.streak + ' day streak';
  }

  function renderPuzzle() {
    progress = readProgress();
    saveProgress(progress);
    const puzzle = currentPuzzle();
    hintVisible = false;
    const completed = progress.completedDays.includes(puzzle.day);
    el('gc-daily-day-label').textContent = 'DAY ' + puzzle.day + ' OF 50 · ' + localDateKey();
    el('gc-daily-category').textContent = puzzle.type.toUpperCase();
    el('gc-daily-title').textContent = puzzle.title;
    el('gc-daily-prompt').textContent = puzzle.prompt;
    el('gc-daily-hint').textContent = 'HINT · ' + puzzle.hint;
    el('gc-daily-hint').hidden = true;
    el('gc-daily-answer').value = '';
    el('gc-daily-feedback').className = 'gc-daily-feedback';
    el('gc-daily-feedback').textContent = '';
    el('gc-daily-submit').disabled = completed;
    el('gc-daily-submit').textContent = completed ? 'Completed' : 'Check answer';
    el('gc-daily-answer').disabled = completed;
    if (completed) {
      el('gc-daily-feedback').classList.add('is-success');
      el('gc-daily-feedback').textContent = 'Solved. ' + puzzle.explanation;
    }
    const hintButton = dialog.querySelector('[data-action="hint"]');
    hintButton.textContent = 'Show hint';
    updateHeaderProgress();
  }

  function closeDialog() {
    if (dialog.open) dialog.close();
    openButton.focus();
  }

  openButton.addEventListener('click', () => {
    renderPuzzle();
    if (typeof dialog.showModal === 'function') dialog.showModal();
    else dialog.setAttribute('open', '');
    el('gc-daily-answer').focus();
  });
  dialog.querySelector('[data-action="close"]').addEventListener('click', closeDialog);
  dialog.querySelector('[data-action="hint"]').addEventListener('click', () => {
    hintVisible = !hintVisible;
    el('gc-daily-hint').hidden = !hintVisible;
    dialog.querySelector('[data-action="hint"]').textContent = hintVisible ? 'Hide hint' : 'Show hint';
  });
  dialog.addEventListener('click', event => {
    if (event.target === dialog) closeDialog();
  });
  dialog.addEventListener('cancel', event => {
    event.preventDefault();
    closeDialog();
  });
  dialog.querySelector('#gc-daily-form').addEventListener('submit', event => {
    event.preventDefault();
    const puzzle = currentPuzzle();
    const answerInput = el('gc-daily-answer');
    const feedback = el('gc-daily-feedback');
    if (progress.completedDays.includes(puzzle.day)) return;
    const submitted = answerInput.value;
    const attempts = Number(progress.attempts[puzzle.day] || 0) + 1;
    progress.attempts[puzzle.day] = attempts;
    if (isPuzzleAnswerCorrect(puzzle, submitted)) {
      progress.completedDays.push(puzzle.day);
      progress.completedDays = [...new Set(progress.completedDays)].sort((a, b) => a - b);
      progress.streak = progress.lastSolvedDay === puzzle.day - 1 ? progress.streak + 1 : 1;
      progress.lastSolvedDay = puzzle.day;
      saveProgress(progress);
      answerInput.disabled = true;
      el('gc-daily-submit').disabled = true;
      el('gc-daily-submit').textContent = 'Completed';
      feedback.className = 'gc-daily-feedback is-success gc-daily-pop';
      feedback.textContent = 'Correct · ' + puzzle.explanation;
      updateHeaderProgress();
      openButton.textContent = 'Daily Puzzle · ' + progress.completedDays.length + '/50';
    } else {
      saveProgress(progress);
      feedback.className = 'gc-daily-feedback is-error';
      feedback.textContent = attempts === 1 ? 'Not quite. Try again, or use the hint.' : 'Still not correct. Re-read the clue and try a different answer.';
      answerInput.select();
    }
  });

  updateHeaderProgress();
}

if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', mountDailyPuzzles, { once: true });
  } else {
    mountDailyPuzzles();
  }
}


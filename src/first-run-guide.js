import './first-run-guide.css';

(() => {
  'use strict';

  const STORAGE_KEY = 'glass-chess-first-run-v1';
  const STEPS = [
    {
      label: 'THE BOARD',
      title: 'Move with confidence.',
      copy: 'Choose a piece to see its legal destinations. Choose a highlighted square to make the move. The board will only let you play legal moves.',
      note: 'Tip: On a phone or trackpad, tap once to select and tap again to move.'
    },
    {
      label: 'GAME SETUP',
      title: 'Choose how you play.',
      copy: 'Open Play to choose Vs Computer, Pass and Play, or Analysis Studio. Pick your color and Stockfish strength, then select Start game.',
      note: 'You can change your game setup whenever you start a new game.'
    },
    {
      label: 'ANALYSIS STUDIO',
      title: 'Understand the position.',
      copy: 'Open Analysis to see the evaluation, Stockfish’s best move, and your move history. Use Hint when you need a nudge.',
      note: 'Undo takes back a move. Flip board changes your viewing side.'
    },
    {
      label: 'PRACTICE',
      title: 'Build your chess instincts.',
      copy: 'Daily Puzzle gives you a real chess position to solve. Try the hint, reset a puzzle, and move between challenges to keep practicing.',
      note: 'Your completed puzzle progress is saved on this device and can sync with a verified account.'
    }
  ];

  let root = null;
  let currentStep = 0;
  let lastOpener = null;

  function isDone() {
    try { return localStorage.getItem(STORAGE_KEY) === 'done'; }
    catch { return false; }
  }

  function markDone() {
    try { localStorage.setItem(STORAGE_KEY, 'done'); }
    catch (error) { console.warn('Glass Chess intro preference could not be saved.', error); }
  }

  function ensureHelpButton() {
    const topbar = document.querySelector('.topbar');
    const newGame = document.getElementById('new-game');
    if (!topbar || !newGame || document.getElementById('gc-first-run-help')) return;
    const button = document.createElement('button');
    button.type = 'button';
    button.id = 'gc-first-run-help';
    button.className = 'gc-first-run-help';
    button.title = 'Open the Glass Chess quick guide';
    button.setAttribute('aria-label', 'Open quick guide');
    button.textContent = '? Guide';
    button.addEventListener('click', () => openGuide());
    topbar.insertBefore(button, newGame);
  }

  function mountGuide() {
    if (root) return;
    root = document.createElement('section');
    root.id = 'gc-first-run-guide';
    root.className = 'gc-first-run-overlay';
    root.hidden = true;
    root.innerHTML = `
      <div class="gc-first-run-card" role="dialog" aria-modal="true" aria-labelledby="gc-first-run-title" aria-describedby="gc-first-run-copy">
        <header class="gc-first-run-header">
          <div class="gc-first-run-mark" aria-hidden="true">♔</div>
          <div class="gc-first-run-heading">
            <small id="gc-first-run-kicker">GLASS CHESS · QUICK START</small>
            <span id="gc-first-run-step">WELCOME</span>
          </div>
          <button type="button" id="gc-first-run-close" aria-label="Close guide">×</button>
        </header>
        <div class="gc-first-run-progress"><span id="gc-first-run-progress-fill"></span></div>
        <main class="gc-first-run-content" aria-live="polite">
          <h2 id="gc-first-run-title"></h2>
          <p id="gc-first-run-copy"></p>
          <div id="gc-first-run-note" class="gc-first-run-note"></div>
          <div id="gc-first-run-choices" class="gc-first-run-choices" hidden>
            <button type="button" data-guide-action="play"><span>♟</span><strong>Play a game</strong><small>Choose your mode and opponent</small></button>
            <button type="button" data-guide-action="puzzle"><span>♞</span><strong>Try a daily puzzle</strong><small>Solve a real chess tactic</small></button>
            <button type="button" data-guide-action="tour"><span>✦</span><strong>Take the quick tour</strong><small>Learn the main controls</small></button>
          </div>
        </main>
        <footer class="gc-first-run-footer">
          <button type="button" class="gc-first-run-skip" data-guide-action="skip">Skip guide</button>
          <div class="gc-first-run-nav">
            <button type="button" data-guide-action="back">Back</button>
            <button type="button" class="gc-first-run-next" data-guide-action="next">Next</button>
          </div>
        </footer>
      </div>`;
    document.body.appendChild(root);

    root.querySelector('#gc-first-run-close').addEventListener('click', closeGuide);
    root.addEventListener('click', event => {
      if (event.target === root) closeGuide();
      const button = event.target.closest('[data-guide-action]');
      if (button) handleAction(button.dataset.guideAction);
    });
    document.addEventListener('keydown', event => {
      if (!root.hidden && event.key === 'Escape') closeGuide();
      if (!root.hidden && event.key === 'Tab') keepFocusInside(event);
    });
    renderStep();
  }

  function renderStep() {
    if (!root) return;
    const welcome = currentStep === 0;
    const step = STEPS[currentStep - 1];
    root.querySelector('#gc-first-run-kicker').textContent = welcome ? 'GLASS CHESS · QUICK START' : 'GLASS CHESS · YOUR FIRST GAME';
    root.querySelector('#gc-first-run-step').textContent = welcome ? 'WELCOME' : 'STEP ' + currentStep + ' OF ' + STEPS.length;
    root.querySelector('#gc-first-run-title').textContent = welcome ? 'Welcome to Glass Chess.' : step.title;
    root.querySelector('#gc-first-run-copy').textContent = welcome
      ? 'A chess workspace built for playing, learning, and improving. Choose where you would like to begin.'
      : step.copy;
    root.querySelector('#gc-first-run-note').textContent = welcome
      ? 'You can reopen this guide anytime using the ? Guide button in the top bar.'
      : step.note;
    root.querySelector('#gc-first-run-note').hidden = false;
    root.querySelector('#gc-first-run-choices').hidden = !welcome;
    root.querySelector('[data-guide-action="back"]').hidden = welcome;
    root.querySelector('[data-guide-action="next"]').hidden = welcome || currentStep === STEPS.length;
    root.querySelector('[data-guide-action="next"]').textContent = 'Next';
    root.querySelector('[data-guide-action="skip"]').textContent = welcome ? 'Not now' : 'Skip guide';
    root.querySelector('#gc-first-run-progress-fill').style.width = (welcome ? 0 : currentStep / STEPS.length * 100) + '%';
  }

  function openGuide() {
    mountGuide();
    lastOpener = document.activeElement;
    currentStep = 0;
    renderStep();
    root.hidden = false;
    root.querySelector('[data-guide-action="tour"]').focus();
  }

  function closeGuide() {
    if (!root) return;
    root.hidden = true;
    lastOpener?.focus?.();
  }

  function finishGuide() {
    markDone();
    closeGuide();
  }

  function openPlay() {
    finishGuide();
    document.querySelector('[data-workspace-open="play"]')?.click();
  }

  function openPuzzle() {
    finishGuide();
    document.getElementById('gc-daily-puzzle')?.click();
  }

  function handleAction(action) {
    if (action === 'skip') { finishGuide(); return; }
    if (action === 'play') { openPlay(); return; }
    if (action === 'puzzle') { openPuzzle(); return; }
    if (action === 'tour') { currentStep = 1; renderStep(); root.querySelector('[data-guide-action="next"]')?.focus(); return; }
    if (action === 'back' && currentStep > 1) { currentStep--; renderStep(); return; }
    if (action === 'next' && currentStep < STEPS.length) { currentStep++; renderStep(); return; }
    if (action === 'next' && currentStep === STEPS.length) { finishGuide(); }
  }

  function keepFocusInside(event) {
    const focusable = Array.from(root.querySelectorAll('button:not([hidden])')).filter(button => !button.disabled);
    if (!focusable.length) return;
    const first = focusable[0], last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  }

  function boot() {
    ensureHelpButton();
    mountGuide();
    window.setTimeout(ensureHelpButton, 250);
    window.setTimeout(ensureHelpButton, 900);
    if (!isDone()) window.setTimeout(openGuide, 950);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
  else window.setTimeout(boot, 450);
})();

import './glass-screen-layout.css';

(() => {
  const SQUARE_SELECTOR = '[data-square]';
  const STYLE_CLASS = 'gc-screen-board';
  let board = null;
  let stage = null;
  let toolbar = null;
  let scheduled = false;
  let focusMode = false;

  function locateBoard() {
    const existing = document.querySelector('.gc-screen-board, .gc-smart-fit-board, .gc-responsive-board');
    if (existing && existing.querySelectorAll(SQUARE_SELECTOR).length === 64) return existing;

    const squares = Array.from(document.querySelectorAll(SQUARE_SELECTOR));
    if (squares.length < 64) return null;

    let node = squares[0].parentElement;
    let fallback = null;
    while (node && node !== document.body && node !== document.documentElement) {
      const count = node.querySelectorAll(SQUARE_SELECTOR).length;
      if (count === 64) {
        fallback ||= node;
        const display = getComputedStyle(node).display;
        const identity = `${node.id || ''} ${typeof node.className === 'string' ? node.className : ''}`;
        if (display === 'grid' || display === 'inline-grid' || /board|chess/i.test(identity)) return node;
      }
      node = node.parentElement;
    }
    return fallback;
  }

  function reduceExcessTopSpace() {
    if (!board) return;
    stage = board.parentElement;
    if (!stage) return;
    stage.classList.add('gc-board-screen-stage');

    // The immediate game-area wrapper commonly carries the large top padding / centered layout.
    const frame = stage.parentElement;
    if (frame && frame !== document.body && frame !== document.documentElement) {
      frame.classList.add('gc-board-screen-frame');
      const cs = getComputedStyle(frame);
      const topPadding = parseFloat(cs.paddingTop) || 0;
      const topMargin = parseFloat(cs.marginTop) || 0;
      if (topPadding > 20) frame.style.setProperty('padding-top', '8px', 'important');
      if (topMargin > 24) frame.style.setProperty('margin-top', '0px', 'important');
      if (cs.display.includes('flex') && cs.flexDirection === 'column' && cs.justifyContent.includes('center')) {
        frame.style.setProperty('justify-content', 'flex-start', 'important');
      }
      if (cs.display.includes('grid')) frame.style.setProperty('align-content', 'start', 'important');
    }

    const cs = getComputedStyle(stage);
    const paddingTop = parseFloat(cs.paddingTop) || 0;
    const marginTop = parseFloat(cs.marginTop) || 0;
    if (paddingTop > 12) stage.style.setProperty('padding-top', '4px', 'important');
    if (marginTop > 20) stage.style.setProperty('margin-top', '0px', 'important');
  }

  function makeToolbar() {
    if (!stage || !board || toolbar?.isConnected) return;
    toolbar = document.createElement('div');
    toolbar.id = 'gc-board-toolbar';
    toolbar.innerHTML = `
      <div class="gc-board-toolbar-brand">
        <span class="gc-board-toolbar-mark">♛</span>
        <span><strong>GLASS CHESS</strong><small>LIVE BOARD · 64 SQUARES</small></span>
      </div>
      <div class="gc-board-toolbar-actions">
        <button type="button" data-gc-focus aria-pressed="false" title="Give the board more space">Focus</button>
        <button type="button" data-gc-fullscreen title="Enter board fullscreen" aria-label="Enter board fullscreen">⛶</button>
      </div>`;
    stage.insertBefore(toolbar, board);
    toolbar.querySelector('[data-gc-focus]').addEventListener('click', event => {
      focusMode = !focusMode;
      document.documentElement.classList.toggle('gc-board-focus-mode', focusMode);
      event.currentTarget.setAttribute('aria-pressed', String(focusMode));
      event.currentTarget.textContent = focusMode ? 'Focused' : 'Focus';
      schedule();
    });
    toolbar.querySelector('[data-gc-fullscreen]').addEventListener('click', async () => {
      try {
        if (document.fullscreenElement) await document.exitFullscreen();
        else await stage.requestFullscreen?.();
      } catch (error) {
        console.warn('Glass Chess fullscreen was not available:', error);
      }
      schedule();
    });
  }

  function sizeBoard() {
    if (!board?.isConnected) return;
    const viewportWidth = Math.max(320, document.documentElement.clientWidth || window.innerWidth);
    const viewportHeight = Math.max(320, window.visualViewport?.height || window.innerHeight);
    const rect = board.getBoundingClientRect();
    const previousLift = parseFloat(stage?.style.getPropertyValue('--gc-board-lift') || '0') || 0;
    const unshiftedTop = rect.top + previousLift;

    // Lift the game area up when it starts unusually far down the page, reclaiming black space.
    const lift = Math.min(84, Math.max(0, unshiftedTop - 112));
    if (stage) stage.style.setProperty('--gc-board-lift', `${lift}px`);

    const estimatedTop = Math.max(96, unshiftedTop - lift);
    const bottomReserve = focusMode ? 16 : 28;
    const heightAvailable = Math.max(360, viewportHeight - estimatedTop - bottomReserve);
    const heightShare = viewportHeight * (focusMode ? 0.92 : 0.88);
    const widthAvailable = viewportWidth - (viewportWidth < 760 ? 22 : 48);
    const maxSize = focusMode ? 900 : 860;
    const size = Math.max(280, Math.floor(Math.min(maxSize, widthAvailable, heightShare, heightAvailable)));

    board.classList.add('gc-responsive-board', 'gc-smart-fit-board', STYLE_CLASS);
    board.style.setProperty('--gc-screen-board-size', `${size}px`);
    board.style.setProperty('width', `${size}px`, 'important');
    board.style.setProperty('height', `${size}px`, 'important');
    board.style.setProperty('max-width', `min(${size}px, calc(100vw - 22px))`, 'important');
    board.style.setProperty('max-height', `${size}px`, 'important');
  }

  function attach() {
    const found = locateBoard();
    if (!found) return;
    if (found !== board) {
      board = found;
      board.classList.add('gc-responsive-board', 'gc-smart-fit-board', STYLE_CLASS);
      stage = board.parentElement;
      reduceExcessTopSpace();
      makeToolbar();
    } else {
      if (!stage?.isConnected) {
        stage = board.parentElement;
        reduceExcessTopSpace();
        makeToolbar();
      }
    }
    sizeBoard();
  }

  function schedule() {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(() => {
      scheduled = false;
      attach();
    });
  }

  const observer = new MutationObserver(() => schedule());
  observer.observe(document.documentElement, { childList: true, subtree: true });
  window.addEventListener('resize', schedule, { passive: true });
  window.visualViewport?.addEventListener('resize', schedule, { passive: true });
  document.addEventListener('fullscreenchange', schedule);

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', attach, { once: true });
  } else {
    attach();
  }
  window.setTimeout(attach, 350);
  window.setTimeout(attach, 1100);
})();

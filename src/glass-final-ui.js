import './glass-final-ui.css';

(() => {
  'use strict';

  const SETTINGS_KEY = 'glass-chess-final-layout-v1';
  const PALETTES = {
    midnight: { light: '#d9dfeb', dark: '#52647f' },
    forest:   { light: '#e8e1c9', dark: '#63866c' },
    marble:   { light: '#eee9e2', dark: '#9c9a99' },
    ocean:    { light: '#d9edf2', dark: '#39778c' },
    aurora:   { light: '#e9e8f7', dark: '#5965a2' },
    royal:    { light: '#efe2c9', dark: '#604777' },
    sunset:   { light: '#f7dfc8', dark: '#b85f50' },
    carbon:   { light: '#d5d9df', dark: '#3a4657' }
  };
  const SIZE_FACTORS = { auto: 0.90, large: 0.97, max: 1 }; 

  let board = null;
  let stage = null;
  let toolbar = null;
  let resizeObserver = null;
  let boardObserver = null;
  let pageObserver = null;
  let queued = false;
  let focusMode = false;
  let settings = loadSettings();
  let lastTheme = '';

  function syncToolsButton() {
    const active = focusMode || Boolean(document.fullscreenElement);
    document.documentElement.classList.toggle('gc-tools-single-launcher', active);
    document.body?.classList.toggle('gc-tools-single-launcher', active);
  }

  function loadSettings() {
    try {
      const value = JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}');
      return {
        size: ['auto', 'large', 'max'].includes(value.size) ? value.size : 'large',
        focus: false
      };
    } catch {
      return { size: 'auto', focus: false };
    }
  }

  function saveSettings() {
    try { localStorage.setItem(SETTINGS_KEY, JSON.stringify({ size: settings.size })); }
    catch (error) { console.warn('Glass Chess layout preferences could not be saved:', error); }
  }

  function getSquares(root = document) {
    return Array.from(root.querySelectorAll('[data-square]'));
  }

  function findBoard() {
    const squares = getSquares();
    if (squares.length !== 64) return null;

    // Prefer the nearest 64-square ancestor that is already a grid or is named as a board.
    let node = squares[0].parentElement;
    let fallback = null;
    while (node && node !== document.body && node !== document.documentElement) {
      if (getSquares(node).length === 64) {
        fallback ||= node;
        const style = getComputedStyle(node);
        const identity = `${node.id || ''} ${typeof node.className === 'string' ? node.className : ''}`;
        if (style.display === 'grid' || style.display === 'inline-grid' || /board|chess/i.test(identity)) return node;
      }
      node = node.parentElement;
    }
    return fallback;
  }

  function themeName() {
    for (const name of Object.keys(PALETTES)) {
      if (document.body.classList.contains(`gc-theme-${name}`)) return name;
    }
    try {
      const saved = JSON.parse(localStorage.getItem('glass-chess-premium-v1') || '{}');
      if (PALETTES[saved.theme]) return saved.theme;
    } catch {}
    return 'midnight';
  }

  function paintTheme() {
    if (!board?.isConnected) return;
    const squares = getSquares(board);
    if (squares.length !== 64) return;
    const name = themeName();
    const colors = PALETTES[name] || PALETTES.midnight;

    for (const square of squares) {
      const coord = square.dataset.square || square.getAttribute('data-square') || '';
      if (!/^[a-h][1-8]$/.test(coord)) continue;
      const file = coord.charCodeAt(0) - 97;
      const rank = Number(coord[1]);
      // a1 is dark and h1 is light; the board's theme stays correct after every redraw.
      const color = (file + rank) % 2 === 1 ? colors.dark : colors.light;
      square.style.setProperty('background-color', color, 'important');
      square.style.setProperty('background', color, 'important');
      square.dataset.gcFinalTheme = name;
    }
    lastTheme = name;
  }

  function createToolbar() {
    if (!stage) return;
    if (toolbar?.parentElement === stage) return;
    if (toolbar?.isConnected) toolbar.remove();
    toolbar = document.createElement('div');
    toolbar.id = 'gc-final-toolbar';
    toolbar.innerHTML = `
      <div class="gc-final-brand">
        <span class="gc-final-crown" aria-hidden="true">♛</span>
        <span class="gc-final-brand-copy"><strong>GLASS CHESS</strong><small>THE BOARD IS YOURS</small></span>
      </div>
      <div class="gc-final-actions">
        <label class="gc-final-size-label" for="gc-final-size">Board</label>
        <select id="gc-final-size" aria-label="Board size">
          <option value="auto">Auto</option>
          <option value="large">Large</option>
          <option value="max">Maximum</option>
        </select>
        <button type="button" data-gc-analysis-focus aria-pressed="false" title="Open a focused analysis workspace">Analysis focus</button>
        <button type="button" data-gc-stage-fullscreen title="Enter fullscreen" aria-label="Enter fullscreen">⛶</button>
      </div>`;
    const boardFrame = board.closest('.board-frame');
    stage.insertBefore(toolbar, boardFrame || board);

    const sizeSelect = toolbar.querySelector('#gc-final-size');
    sizeSelect.value = settings.size;

    sizeSelect.addEventListener('change', () => {
      settings.size = sizeSelect.value;
      saveSettings();
      scheduleLayout();
    });

    toolbar.querySelector('[data-gc-analysis-focus]').addEventListener('click', () => {
      focusMode = !focusMode;
      settings.focus = focusMode;
      document.documentElement.classList.toggle('gc-final-focus-mode', focusMode);
      document.body.classList.toggle('gc-final-focus-mode', focusMode);
      syncToolsButton();
      const button = toolbar.querySelector('[data-gc-analysis-focus]');
      button.setAttribute('aria-pressed', String(focusMode));
      button.textContent = focusMode ? 'Exit focus' : 'Analysis focus';
      if (focusMode) {
        settings.size = 'max';
        sizeSelect.value = 'max';
      }
      saveSettings();
      scheduleLayout();
    });

    toolbar.querySelector('[data-gc-stage-fullscreen]').addEventListener('click', async () => {
      try {
        if (document.fullscreenElement) await document.exitFullscreen();
        else await document.documentElement.requestFullscreen?.();
      } catch (error) {
        console.warn('Fullscreen is unavailable in this browser:', error);
      }
      scheduleLayout();
    });
  }

  function compactTopWhitespace() {
    if (!stage) return;

    let node = stage;

    for (let depth = 0; depth < 7 && node?.parentElement; depth += 1) {
      const parent = node.parentElement;
      const style = getComputedStyle(parent);

      const topPadding = parseFloat(style.paddingTop) || 0;
      const topMargin = parseFloat(style.marginTop) || 0;

      if (topPadding > 28) {
        parent.style.setProperty("padding-top", "10px", "important");
      }

      if (topMargin > 30) {
        parent.style.setProperty("margin-top", "8px", "important");
      }

      if (
        style.display.includes("flex") &&
        style.flexDirection === "column" &&
        ["center", "space-around", "space-evenly"].includes(style.justifyContent)
      ) {
        parent.style.setProperty("justify-content", "flex-start", "important");
      }

      if (
        style.display.includes("grid") &&
        ["center", "space-around", "space-evenly"].includes(style.alignContent)
      ) {
        parent.style.setProperty("align-content", "start", "important");
      }

      const previous = node.previousElementSibling;

      if (previous) {
        const tag = previous.tagName || "";
        const identity = (previous.id || "") + " " +
          (typeof previous.className === "string" ? previous.className : "");

        if (
          /^(HEADER|NAV)$/i.test(tag) ||
          /topbar|navbar|app-header|site-header|masthead/i.test(identity)
        ) {
          const headerStyle = getComputedStyle(previous);

          if ((parseFloat(headerStyle.paddingTop) || 0) > 16) {
            previous.style.setProperty("padding-top", "8px", "important");
          }

          if ((parseFloat(headerStyle.paddingBottom) || 0) > 16) {
            previous.style.setProperty("padding-bottom", "8px", "important");
          }

          if ((parseFloat(headerStyle.marginBottom) || 0) > 24) {
            previous.style.setProperty("margin-bottom", "12px", "important");
          }
        }
      }

      node = parent;
    }
  }

  function prepareStage() {
    if (!board) return;
    stage = board.closest('.board-section') || board.parentElement;
    if (!stage) return;
    compactTopWhitespace();
    stage.classList.add('gc-final-board-stage');
    board.classList.add('gc-final-board');

    // Expand the board lane rather than leaving an old two-column sidebar gutter.
    stage.style.setProperty('width', '100%', 'important');
    stage.style.setProperty('max-width', 'none', 'important');
    stage.style.setProperty('min-width', '0', 'important');
    stage.style.setProperty('display', 'flex', 'important');
    stage.style.setProperty('flex-direction', 'column', 'important');
    stage.style.setProperty('align-items', 'center', 'important');
    stage.style.setProperty('justify-content', 'flex-start', 'important');
    stage.style.setProperty('gap', '10px', 'important');

    const frame = stage.parentElement;
    if (frame && frame !== document.body && frame !== document.documentElement) {
      frame.classList.add('gc-final-board-frame');
      frame.style.setProperty('min-width', '0', 'important');
      frame.style.setProperty('max-width', 'none', 'important');
      const cs = getComputedStyle(frame);
      if ((parseFloat(cs.paddingTop) || 0) > 30) frame.style.setProperty('padding-top', '8px', 'important');
      if ((parseFloat(cs.marginTop) || 0) > 30) frame.style.setProperty('margin-top', '0px', 'important');
      if (cs.display === 'grid' && frame.classList.contains('gc-hub-panel-grid-parent')) {
        frame.style.setProperty('grid-template-columns', 'minmax(0, 1fr)', 'important');
      }
    }

    // Trim excessive top padding on the stage itself without touching the app's game logic.
    const stageStyle = getComputedStyle(stage);
    if ((parseFloat(stageStyle.paddingTop) || 0) > 22) stage.style.setProperty('padding-top', '4px', 'important');
    createToolbar();
    observeBoard();
  }

  function observeBoard() {
    resizeObserver?.disconnect();
    boardObserver?.disconnect();
    if (typeof ResizeObserver === 'function') {
      resizeObserver = new ResizeObserver(scheduleLayout);
      if (stage) resizeObserver.observe(stage);
      if (board) resizeObserver.observe(board);
    }
    if (board && typeof MutationObserver === 'function') {
      boardObserver = new MutationObserver(() => {
        scheduleThemePaint();
        scheduleLayout();
      });
      boardObserver.observe(board, { childList: true, subtree: true, characterData: true });
    }
  }

  function applyVerticalLift() {
    // Never move the board over surrounding page content.
    if (!stage) return;
    stage.style.removeProperty("margin-top");
    delete stage.dataset.gcFinalLift;
  }

  function fitBoard() {
    if (!board?.isConnected || !stage) return;

    applyVerticalLift();

    const vv = window.visualViewport;
    const viewportWidth = Math.max(
      320,
      vv?.width || document.documentElement.clientWidth || window.innerWidth
    );
    const viewportHeight = Math.max(
      320,
      vv?.height || window.innerHeight
    );

    const widthReserve = viewportWidth < 760 ? 14 : 30;
    const widthCap = Math.max(280, viewportWidth - widthReserve);
    const hardCap = viewportWidth < 760 ? 720 : 920;
    const toolbarHeight = Math.max(
      42,
      toolbar?.getBoundingClientRect().height || 44
    );

    // Normal mode uses a large viewport-based board.
    // Focus mode uses the remaining fullscreen space under the toolbar.
    // Reserve room for both player labels, the board controls, promotion UI,
    // and the toolbar so none of them get pushed below the visible board.
    // Keep every control in the same visible workspace as the board.
    // Focus mode reserves compact space for player labels, toolbar and actions.
    const surroundingUI = focusMode
      ? (viewportWidth < 600 ? 158 : 166)
      : (viewportWidth < 600 ? 170 : 178);
    const verticalCap = focusMode
      ? Math.max(180, viewportHeight - toolbarHeight - surroundingUI - 18)
      : Math.max(180, Math.min(viewportHeight * 0.70, viewportHeight - toolbarHeight - surroundingUI - 72));

    const factor = SIZE_FACTORS[settings.size] || 1;
    const baseSize = Math.min(widthCap, verticalCap, hardCap);
    const safeSize = Math.max(
      280,
      Math.floor(Math.min(baseSize * factor, widthCap, verticalCap, hardCap))
    );

    stage.style.removeProperty("transform");
    stage.style.setProperty("--gc-final-board-size", `${safeSize}px`);
    board.style.setProperty("--gc-final-board-size", `${safeSize}px`);

    board.style.setProperty("display", "grid", "important");
    board.style.setProperty(
      "grid-template-columns",
      "repeat(8, minmax(0, 1fr))",
      "important"
    );
    board.style.setProperty(
      "grid-template-rows",
      "repeat(8, minmax(0, 1fr))",
      "important"
    );
    board.style.setProperty("gap", "0px", "important");
    board.style.setProperty("width", `${safeSize}px`, "important");
    board.style.setProperty("height", `${safeSize}px`, "important");
    board.style.setProperty(
      "max-width",
      `min(${safeSize}px, calc(100vw - ${widthReserve}px))`,
      "important"
    );
    board.style.setProperty("max-height", `${safeSize}px`, "important");
    board.style.setProperty("min-width", "0", "important");
    board.style.setProperty("min-height", "0", "important");
    board.style.setProperty("aspect-ratio", "1 / 1", "important");
    board.style.setProperty("flex", "0 0 auto", "important");
    board.style.setProperty("margin", "0 auto", "important");
    board.style.setProperty("overflow", "hidden", "important");
    board.style.setProperty("box-sizing", "border-box", "important");

    const boardFrame = board.closest(".board-frame");
    if (boardFrame) {
      boardFrame.style.setProperty("width", `${safeSize + 16}px`, "important");
      boardFrame.style.setProperty("max-width", "calc(100vw - 12px)", "important");
      boardFrame.style.setProperty("height", "auto", "important");
      boardFrame.style.setProperty("aspect-ratio", "auto", "important");
      boardFrame.style.setProperty("padding", "8px", "important");
      boardFrame.style.setProperty("flex", "0 0 auto", "important");
    }

    for (const square of getSquares(board)) {
      square.style.setProperty("min-width", "0", "important");
      square.style.setProperty("min-height", "0", "important");
      square.style.setProperty("width", "auto", "important");
      square.style.setProperty("height", "auto", "important");
      square.style.setProperty("aspect-ratio", "1 / 1", "important");
      square.style.setProperty("padding", "0", "important");
      square.style.setProperty("line-height", "1", "important");
      square.style.setProperty("overflow", "hidden", "important");
    }

    scheduleThemePaint();
  }

  let themePaintQueued = false;
  function scheduleThemePaint() {
    if (themePaintQueued) return;
    themePaintQueued = true;
    requestAnimationFrame(() => {
      themePaintQueued = false;
      paintTheme();
    });
  }

  function scheduleLayout() {
    if (queued) return;
    queued = true;
    requestAnimationFrame(() => {
      queued = false;
      const found = findBoard();
      if (found && found !== board) {
        boardObserver?.disconnect();
        resizeObserver?.disconnect();
        board = found;
        prepareStage();
      }
      if (board?.isConnected) fitBoard();
    });
  }

  // Theme selection is handled by the existing Premium module. This makes its selected
  // palette persist after the chessboard re-renders or the game changes position.
  document.addEventListener('click', event => {
    if (event.target?.closest?.('[data-theme]')) {
      requestAnimationFrame(() => requestAnimationFrame(scheduleThemePaint));
    }
  }, true);

  const bodyThemeObserver = new MutationObserver(() => {
    const next = themeName();
    if (next !== lastTheme) scheduleThemePaint();
  });
  bodyThemeObserver.observe(document.body, { attributes: true, attributeFilter: ['class'] });

  pageObserver = new MutationObserver(scheduleLayout);
  pageObserver.observe(document.documentElement, { childList: true, subtree: true });
  window.addEventListener('resize', scheduleLayout, { passive: true });
  window.visualViewport?.addEventListener('resize', scheduleLayout, { passive: true });
  document.addEventListener('fullscreenchange', scheduleLayout);
  // gc-focus-escape-capture: close Glass Hub before leaving Focus Mode.
  let hubWasOpenOnEscape = false;

  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && focusMode) {
      hubWasOpenOnEscape = Boolean(
        document.querySelector('#gc-floating-hub.gc-hub-open')
      );
    }
  }, true);

  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && focusMode) {
      if (hubWasOpenOnEscape) {
        hubWasOpenOnEscape = false;
        return;
      }
      focusMode = false;
      document.documentElement.classList.remove('gc-final-focus-mode');
      document.body.classList.remove('gc-final-focus-mode');
      const button = toolbar?.querySelector('[data-gc-analysis-focus]');
      if (button) { button.setAttribute('aria-pressed', 'false'); button.textContent = 'Analysis focus'; }
      scheduleLayout();
    }
  });

  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && focusMode) {
      if (hubWasOpenOnEscape) {
        hubWasOpenOnEscape = false;
        return;
      }
      focusMode = false;
      document.documentElement.classList.remove('gc-final-focus-mode');
      document.body.classList.remove('gc-final-focus-mode');
      syncToolsButton();
      const button = toolbar?.querySelector('[data-gc-analysis-focus]');
      if (button) { button.setAttribute('aria-pressed', 'false'); button.textContent = 'Analysis focus'; }
      scheduleLayout();
    }
  });

  document.addEventListener('fullscreenchange', () => {
    syncToolsButton();
    scheduleLayout();
  });

  function boot() {
    syncToolsButton();
    const found = findBoard();
    if (!found) return false;
    board = found;
    prepareStage();
    fitBoard();
    paintTheme();
    return true;
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot, { once: true });
  } else {
    boot();
  }
  // Vite/engine startup can render the 64 squares just after the first DOM ready event.
  window.setTimeout(boot, 180);
  window.setTimeout(boot, 650);
  window.setTimeout(boot, 1400);
})();

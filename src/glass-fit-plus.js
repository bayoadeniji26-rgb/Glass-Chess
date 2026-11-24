import './glass-fit-plus.css';

(() => {
  const STORE_KEY = 'glass-chess-premium-v1';
  const PALETTES = {
    midnight: { light: '#d9dfeb', dark: '#52647f' },
    forest: { light: '#e8e1c9', dark: '#63866c' },
    marble: { light: '#eee9e2', dark: '#9c9a99' },
    ocean: { light: '#d9edf2', dark: '#39778c' },
    aurora: { light: '#e9e8f7', dark: '#5965a2' },
    royal: { light: '#efe2c9', dark: '#604777' },
    sunset: { light: '#f7dfc8', dark: '#b85f50' },
    carbon: { light: '#d5d9df', dark: '#3a4657' }
  };

  let board = null;
  let boardObserver = null;
  let pageObserver = null;
  let scheduled = false;
  let lastTheme = '';

  function storedTheme() {
    try {
      const saved = JSON.parse(localStorage.getItem(STORE_KEY) || '{}');
      if (PALETTES[saved.theme]) return saved.theme;
    } catch (_) {}
    return 'midnight';
  }

  function activeTheme() {
    for (const name of Object.keys(PALETTES)) {
      if (document.body.classList.contains(`gc-theme-${name}`)) return name;
    }
    return storedTheme();
  }

  function squareName(square) {
    const value = square?.dataset?.square || square?.getAttribute('data-square') || '';
    return /^[a-h][1-8]$/.test(value) ? value : '';
  }

  function paintSquares() {
    const themeName = activeTheme();
    const colors = PALETTES[themeName] || PALETTES.midnight;
    const squares = Array.from(document.querySelectorAll('[data-square]'));
    if (squares.length !== 64) return;

    squares.forEach((square, index) => {
      const name = squareName(square);
      let file;
      let rank;
      if (name) {
        file = name.charCodeAt(0) - 97;
        rank = Number(name[1]);
      } else {
        // Safe visual fallback for a standard 8x8 DOM ordering.
        file = index % 8;
        rank = 8 - Math.floor(index / 8);
      }
      // a1, c1, e1 and the other dark squares use the dark palette.
      const color = (file + rank) % 2 === 1 ? colors.dark : colors.light;
      square.style.setProperty('background', color, 'important');
      square.style.setProperty('background-color', color, 'important');
      square.dataset.gcThemePainted = themeName;
    });
    lastTheme = themeName;
  }

  function findBoard() {
    const squares = Array.from(document.querySelectorAll('[data-square]'));
    if (squares.length !== 64) return null;
    let node = squares[0].parentElement;
    while (node && node !== document.body && node !== document.documentElement) {
      if (node.querySelectorAll('[data-square]').length === 64) return node;
      node = node.parentElement;
    }
    return null;
  }

  function fitBoard() {
    const found = findBoard();
    if (found && found !== board) {
      boardObserver?.disconnect();
      board = found;
      board.classList.add('gc-responsive-board', 'gc-smart-fit-board');
      boardObserver = new MutationObserver(() => schedule());
      boardObserver.observe(board, { childList: true, characterData: true, subtree: true });
    }
    paintSquares();
  }

  function schedule() {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(() => {
      scheduled = false;
      if (!board?.isConnected || !board.querySelector('[data-square]')) fitBoard();
      else paintSquares();
    });
  }

  // Repaint after a player chooses a theme; the premium module handles saving it.
  document.addEventListener('click', event => {
    const button = event.target?.closest?.('[data-theme]');
    if (!button) return;
    requestAnimationFrame(() => requestAnimationFrame(paintSquares));
  }, true);

  // Theme classes are also updated on the body by the existing Appearance panel.
  const bodyObserver = new MutationObserver(records => {
    if (records.some(record => record.attributeName === 'class')) {
      const theme = activeTheme();
      if (theme !== lastTheme) schedule();
    }
  });
  bodyObserver.observe(document.body, { attributes: true, attributeFilter: ['class'] });

  pageObserver = new MutationObserver(() => {
    if (!board?.isConnected || document.querySelectorAll('[data-square]').length !== 64) fitBoard();
  });
  pageObserver.observe(document.documentElement, { childList: true, subtree: true });

  window.addEventListener('resize', schedule, { passive: true });
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', fitBoard, { once: true });
  } else {
    fitBoard();
  }
})();

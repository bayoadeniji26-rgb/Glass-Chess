import './glass-polish.css';

(() => {
  const PIECES = new Set(['♔','♕','♖','♗','♘','♙','♚','♛','♜','♝','♞','♟']);
  const SHAKE_WORDS = /shake|wobble|vibrat|jolt/i;
  let board = null;
  let observer = null;
  let classObserver = null;
  let last = new Map();
  let queued = false;
  let motionAllowed = !window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  function squaresIn(node) {
    return node ? Array.from(node.querySelectorAll('[data-square]')) : [];
  }

  function findBoard() {
    const squares = Array.from(document.querySelectorAll('[data-square]'));
    if (squares.length < 64) return null;
    let node = squares[0].parentElement;
    let best = null;
    while (node && node !== document.body && node !== document.documentElement) {
      const count = node.querySelectorAll('[data-square]').length;
      if (count === 64) {
        best = node;
        const display = getComputedStyle(node).display;
        if (display === 'grid' || display === 'inline-grid' || /board|chess/i.test(String(node.className || '') + ' ' + (node.id || ''))) return node;
      }
      node = node.parentElement;
    }
    return best;
  }

  function keyOf(square, index) {
    return square.dataset.square || square.getAttribute('aria-label') || String(index);
  }

  function findGlyphNode(square) {
    const existing = square.querySelector('.gc-piece-art');
    if (existing) return existing;
    const walker = document.createTreeWalker(square, NodeFilter.SHOW_TEXT);
    let textNode;
    while ((textNode = walker.nextNode())) {
      const text = textNode.nodeValue || '';
      const chars = Array.from(text);
      const at = chars.findIndex(char => PIECES.has(char));
      if (at < 0) continue;
      const before = chars.slice(0, at).join('');
      const piece = chars[at];
      const after = chars.slice(at + 1).join('');
      const span = document.createElement('span');
      span.className = 'gc-piece-art';
      span.textContent = piece;
      const fragment = document.createDocumentFragment();
      if (before) fragment.append(document.createTextNode(before));
      fragment.append(span);
      if (after) fragment.append(document.createTextNode(after));
      textNode.replaceWith(fragment);
      return span;
    }
    const image = square.querySelector('img,svg,[data-piece]');
    return image || null;
  }

  function readPiece(square) {
    const dataPiece = square.getAttribute('data-piece') || square.getAttribute('data-piece-code');
    if (dataPiece) return { value: dataPiece, node: findGlyphNode(square) };
    const node = findGlyphNode(square);
    if (node) {
      const value = (node.textContent || '').trim();
      return { value: value || node.getAttribute('data-piece') || 'graphic', node };
    }
    const image = square.querySelector('img');
    if (image) return { value: image.getAttribute('alt') || image.getAttribute('src') || 'image-piece', node: image };
    return { value: '', node: null };
  }

  function snapshot() {
    const squares = squaresIn(board);
    const map = new Map();
    squares.forEach((square, index) => {
      const key = keyOf(square, index);
      const piece = readPiece(square);
      const rect = square.getBoundingClientRect();
      let clone = null;
      let style = null;
      if (piece.node) {
        clone = piece.node.cloneNode(true);
        const computed = getComputedStyle(piece.node);
        style = {
          color: computed.color,
          fontFamily: computed.fontFamily,
          fontSize: computed.fontSize,
          lineHeight: computed.lineHeight,
          fontWeight: computed.fontWeight
        };
      }
      map.set(key, { key, value: piece.value, node: piece.node, rect, clone, style, square });
    });
    return map;
  }

  function animateSlide(from, to) {
    if (!motionAllowed || !to?.node || !from?.rect || !to?.rect) return;
    const dx = from.rect.left - to.rect.left;
    const dy = from.rect.top - to.rect.top;
    const node = to.node;
    node.classList.add('gc-piece-art');
    node.style.transition = 'none';
    node.style.transform = `translate(${dx}px, ${dy}px) scale(.94)`;
    node.style.opacity = '.88';
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        node.style.transition = 'transform 230ms cubic-bezier(.2,.8,.2,1), opacity 230ms ease';
        node.style.transform = 'translate(0, 0) scale(1)';
        node.style.opacity = '1';
        window.setTimeout(() => {
          if (!node.isConnected) return;
          node.style.removeProperty('transition');
          node.style.removeProperty('transform');
          node.style.removeProperty('opacity');
        }, 270);
      });
    });
  }

  function animateCapture(oldPiece, targetSquare) {
    if (!motionAllowed || !oldPiece?.clone || !targetSquare) return;
    const rect = targetSquare.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    const ghost = oldPiece.clone.cloneNode(true);
    ghost.classList.add('gc-capture-ghost');
    Object.assign(ghost.style, {
      position: 'fixed', left: `${rect.left}px`, top: `${rect.top}px`,
      width: `${rect.width}px`, height: `${rect.height}px`,
      display: 'grid', placeItems: 'center', pointerEvents: 'none',
      zIndex: '100000', color: oldPiece.style?.color || 'currentColor',
      fontFamily: oldPiece.style?.fontFamily || 'serif',
      fontSize: oldPiece.style?.fontSize || 'clamp(22px,4vh,42px)',
      lineHeight: oldPiece.style?.lineHeight || '1',
      fontWeight: oldPiece.style?.fontWeight || 'normal', margin: '0'
    });
    document.body.appendChild(ghost);
    ghost.addEventListener('animationend', () => ghost.remove(), { once: true });
    window.setTimeout(() => ghost.remove(), 650);
  }

  function removeShakeClasses() {
    if (!board) return;
    let node = board;
    while (node && node !== document.body) {
      if (node.classList) {
        for (const token of Array.from(node.classList)) {
          if (SHAKE_WORDS.test(token)) node.classList.remove(token);
        }
      }
      node = node.parentElement;
    }
  }

  function processBoard() {
    if (!board?.isConnected) return;
    removeShakeClasses();
    const current = snapshot();
    if (!last.size) { last = current; return; }

    const removed = [];
    const added = [];
    for (const [key, before] of last) {
      const after = current.get(key);
      if (before.value && (!after || after.value !== before.value)) removed.push(before);
    }
    for (const [key, after] of current) {
      const before = last.get(key);
      if (after.value && (!before || before.value !== after.value)) added.push(after);
    }

    const used = new Set();
    for (const destination of added) {
      let source = removed.find(candidate => !used.has(candidate.key) && candidate.value === destination.value);
      if (!source && removed.length === 1 && added.length === 1) source = removed[0];
      if (source) {
        used.add(source.key);
        animateSlide(source, destination);
      }
    }

    // A changed occupied destination is a capture. En-passant captures are a piece
    // disappearing from a different square while a mover arrives on an empty one.
    for (const [key, before] of last) {
      const after = current.get(key);
      const isReplacement = before.value && after?.value && before.value !== after.value;
      const isEnPassantRemoval = before.value && !after?.value && !used.has(key) && added.length > 0;
      if (isReplacement || isEnPassantRemoval) animateCapture(before, after?.square || current.get(added[0]?.key)?.square);
    }

    last = current;
  }

  function scheduleProcess() {
    if (queued) return;
    queued = true;
    requestAnimationFrame(() => {
      queued = false;
      processBoard();
    });
  }

  function attachBoard(found) {
    if (!found || found === board) return;
    observer?.disconnect();
    board = found;
    board.classList.add('gc-responsive-board');
    last = snapshot();
    observer = new MutationObserver(scheduleProcess);
    observer.observe(board, { subtree: true, childList: true, characterData: true });
    removeShakeClasses();
    document.documentElement.classList.add('gc-board-polished');
  }

  function boot() {
    const found = findBoard();
    if (found) attachBoard(found);
    if (!classObserver) {
      classObserver = new MutationObserver(records => {
        for (const record of records) {
          const target = record.target;
          if (target?.classList && Array.from(target.classList).some(token => SHAKE_WORDS.test(token))) {
            for (const token of Array.from(target.classList)) if (SHAKE_WORDS.test(token)) target.classList.remove(token);
          }
        }
      });
      classObserver.observe(document.documentElement, { subtree: true, attributes: true, attributeFilter: ['class'] });
    }
  }

  motionAllowed = !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
  else boot();
  const pageObserver = new MutationObserver(() => {
    if (!board?.isConnected || !squaresIn(board).length) boot();
    else scheduleProcess();
  });
  pageObserver.observe(document.documentElement, { childList: true, subtree: true });
  window.addEventListener('resize', () => {
    const found = findBoard();
    if (found && found !== board) attachBoard(found);
  }, { passive: true });
})();

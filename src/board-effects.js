import './board-effects.css';

export function createBoardEffects(board, isSoundEnabled = () => true) {
  let audioContext = null;
  const timers = new Set();
  const reducedMotion = () => Boolean(
    window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );

  function getSquare(name) {
    if (!board || !/^[a-h][1-8]$/.test(String(name || ''))) return null;
    return board.querySelector('[data-square="' + name + '"]');
  }

  function pieceSnapshot(squareName) {
    const square = getSquare(squareName);
    const piece = square && square.querySelector('.gc-piece');
    if (!piece) return null;
    const rect = piece.getBoundingClientRect();
    return {
      clone: piece.cloneNode(true),
      rect: { left: rect.left, top: rect.top, width: rect.width, height: rect.height }
    };
  }

  function captureMove(move) {
    if (!move || !board) return null;
    const motions = [];
    const mover = pieceSnapshot(move.from);
    if (mover) motions.push({ ...mover, type: 'move', from: move.from, to: move.to });

    if (move.captured) {
      const captured = pieceSnapshot(move.to);
      if (captured) motions.push({ ...captured, type: 'capture', from: move.to, to: move.to });
    }

    // Castling moves the rook too. Capture its old position before render.
    const fromFile = move.from.charCodeAt(0);
    const toFile = move.to.charCodeAt(0);
    if (move.piece === 'k' && Math.abs(toFile - fromFile) === 2) {
      const rank = move.from[1];
      const kingSide = toFile > fromFile;
      const rookFrom = (kingSide ? 'h' : 'a') + rank;
      const rookTo = (kingSide ? 'f' : 'd') + rank;
      const rook = pieceSnapshot(rookFrom);
      if (rook) motions.push({ ...rook, type: 'castle-rook', from: rookFrom, to: rookTo });
    }

    return motions.length ? { motions } : null;
  }

  function makeGhost(snapshot, type) {
    const ghost = document.createElement('div');
    ghost.className = 'gc-motion-ghost gc-motion-ghost-' + type;
    ghost.style.left = snapshot.rect.left + 'px';
    ghost.style.top = snapshot.rect.top + 'px';
    ghost.style.width = snapshot.rect.width + 'px';
    ghost.style.height = snapshot.rect.height + 'px';
    ghost.appendChild(snapshot.clone);
    document.body.appendChild(ghost);
    return ghost;
  }

  function runAnimation(element, keyframes, options, cleanup) {
    let finished = false;
    const finish = () => {
      if (finished) return;
      finished = true;
      cleanup();
    };
    if (typeof element.animate === 'function' && !reducedMotion()) {
      try {
        const animation = element.animate(keyframes, options);
        animation.finished.then(finish, finish);
        window.setTimeout(finish, (options.duration || 180) + 100);
        return;
      } catch (error) {
        // Unsupported Web Animations behavior falls back to an immediate cleanup.
      }
    }
    finish();
  }

  function animateMove(snapshot) {
    if (!snapshot || !snapshot.motions || !snapshot.motions.length) return;
    for (const motion of snapshot.motions) {
      const ghost = makeGhost(motion, motion.type);
      const isCapture = motion.type === 'capture';
      let destinationPiece = null;
      let previousVisibility = '';

      if (!isCapture) {
        const targetSquare = getSquare(motion.to);
        destinationPiece = targetSquare && targetSquare.querySelector('.gc-piece');
        if (destinationPiece) {
          previousVisibility = destinationPiece.style.visibility;
          destinationPiece.style.visibility = 'hidden';
        }
      }

      const cleanup = () => {
        ghost.remove();
        if (destinationPiece) {
          if (previousVisibility) destinationPiece.style.visibility = previousVisibility;
          else destinationPiece.style.removeProperty('visibility');
        }
      };

      if (reducedMotion()) {
        cleanup();
        continue;
      }

      if (isCapture) {
        runAnimation(ghost, [
          { transform: 'translate3d(0,0,0) scale(1)', opacity: 1 },
          { transform: 'translate3d(7px,-6px,0) scale(.64)', opacity: 0 }
        ], { duration: 165, easing: 'cubic-bezier(.3,0,.7,1)', fill: 'forwards' }, cleanup);
        continue;
      }

      const targetSquare = getSquare(motion.to);
      const targetPiece = targetSquare && targetSquare.querySelector('.gc-piece');
      const targetRect = targetPiece ? targetPiece.getBoundingClientRect() : targetSquare?.getBoundingClientRect();
      if (!targetRect) {
        cleanup();
        continue;
      }
      const dx = targetRect.left - motion.rect.left;
      const dy = targetRect.top - motion.rect.top;
      runAnimation(ghost, [
        { transform: 'translate3d(0,0,0)', opacity: 1 },
        { transform: 'translate3d(' + dx + 'px,' + dy + 'px,0)', opacity: 1 }
      ], { duration: 175, easing: 'cubic-bezier(.16,1,.3,1)', fill: 'forwards' }, cleanup);
    }
  }

  function animatePromotion(squareName) {
    const piece = getSquare(squareName)?.querySelector('.gc-piece');
    if (!piece || reducedMotion()) return;
    piece.classList.remove('gc-piece-promoted');
    void piece.offsetWidth;
    piece.classList.add('gc-piece-promoted');
    const timer = window.setTimeout(() => {
      piece.classList.remove('gc-piece-promoted');
      timers.delete(timer);
    }, 520);
    timers.add(timer);
  }

  function animateCheck(kingSquare) {
    const square = getSquare(kingSquare);
    if (!square || reducedMotion()) return;
    square.classList.remove('gc-king-in-check');
    void square.offsetWidth;
    square.classList.add('gc-king-in-check');
    const timer = window.setTimeout(() => {
      square.classList.remove('gc-king-in-check');
      timers.delete(timer);
    }, 1120);
    timers.add(timer);
  }

  function animateFlip() {
    if (!board || reducedMotion() || typeof board.animate !== 'function') return;
    try {
      board.animate([
        { transform: 'perspective(900px) rotateY(0deg) scale(1)', opacity: 1 },
        { transform: 'perspective(900px) rotateY(5deg) scale(.985)', opacity: .88 },
        { transform: 'perspective(900px) rotateY(0deg) scale(1)', opacity: 1 }
      ], { duration: 285, easing: 'cubic-bezier(.2,.75,.25,1)' });
    } catch (error) {
      // The board still flips instantly and stays correctly oriented.
    }
  }

  function playSound(kind = 'move') {
    if (!isSoundEnabled()) return;
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) return;

    try {
      audioContext ||= new AudioContextClass();
      if (audioContext.state === 'suspended') {
        const resume = audioContext.resume();
        if (resume && typeof resume.catch === 'function') resume.catch(() => {});
      }
      const now = audioContext.currentTime;
      const presets = {
        move: [
          { frequency: 410, offset: 0, duration: .065, volume: .026, wave: 'triangle' },
          { frequency: 760, offset: .008, duration: .04, volume: .009, wave: 'sine' }
        ],
        capture: [
          { frequency: 285, offset: 0, duration: .095, volume: .035, wave: 'triangle' },
          { frequency: 590, offset: .015, duration: .06, volume: .014, wave: 'sine' }
        ],
        check: [
          { frequency: 760, offset: 0, duration: .12, volume: .024, wave: 'sine' },
          { frequency: 1046, offset: .105, duration: .16, volume: .021, wave: 'sine' }
        ],
        promotion: [
          { frequency: 523, offset: 0, duration: .09, volume: .021, wave: 'sine' },
          { frequency: 784, offset: .08, duration: .10, volume: .019, wave: 'sine' },
          { frequency: 988, offset: .16, duration: .14, volume: .018, wave: 'sine' }
        ]
      };
      const notes = presets[kind] || presets.move;
      for (const note of notes) {
        const start = now + note.offset;
        const oscillator = audioContext.createOscillator();
        const gain = audioContext.createGain();
        oscillator.type = note.wave;
        oscillator.frequency.setValueAtTime(note.frequency, start);
        gain.gain.setValueAtTime(.0001, start);
        gain.gain.exponentialRampToValueAtTime(note.volume, start + .012);
        gain.gain.exponentialRampToValueAtTime(.0001, start + note.duration);
        oscillator.connect(gain);
        gain.connect(audioContext.destination);
        oscillator.onended = () => {
          oscillator.disconnect();
          gain.disconnect();
        };
        oscillator.start(start);
        oscillator.stop(start + note.duration + .015);
      }
    } catch (error) {
      // A blocked or unsupported audio context never interrupts a chess move.
    }
  }

  return { captureMove, animateMove, animatePromotion, animateCheck, animateFlip, playSound };
}

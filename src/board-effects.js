import './board-effects.css';

export const BOARD_MOTION = Object.freeze({
  move: 190, capture: 165, promotion: 480, check: 960, checkmate: 1380, flip: 300
});

export function createBoardEffects(board, isSoundEnabled = () => true, isAnimationEnabled = () => true) {
  let audioContext = null;
  let lastSoundAt = 0;
  let disposed = false;
  const timers = new Map();
  const timerHandles = new Set();
  const animations = new Set();
  const ghosts = new Set();
  const reducedMotion = () => Boolean(window.matchMedia?.('(prefers-reduced-motion: reduce)').matches);
  const motionAllowed = () => !disposed && !reducedMotion() && Boolean(isAnimationEnabled());

  function getSquare(name) {
    if (!board || !/^[a-h][1-8]$/.test(String(name || ''))) return null;
    return board.querySelector('[data-square="' + name + '"]');
  }

  function pieceSnapshot(squareName) {
    const square = getSquare(squareName);
    const piece = square?.querySelector('.gc-piece');
    if (!piece) return null;
    const rect = piece.getBoundingClientRect();
    return { clone: piece.cloneNode(true), rect: { left: rect.left, top: rect.top, width: rect.width, height: rect.height } };
  }

  function captureMove(move) {
    if (!move || !board) return null;
    const motions = [];
    const mover = pieceSnapshot(move.from);
    if (mover) motions.push({ ...mover, type: 'move', from: move.from, to: move.to });

    if (move.captured) {
      // En passant removes the pawn from the square behind the destination.
      const captureSquare = move.flags?.includes('e') ? move.to[0] + move.from[1] : move.to;
      const captured = pieceSnapshot(captureSquare);
      if (captured) motions.push({ ...captured, type: 'capture', from: captureSquare, to: move.to });
    }

    // Castling moves the rook as well as the king.
    const fromFile = move.from.charCodeAt(0), toFile = move.to.charCodeAt(0);
    if (move.piece === 'k' && Math.abs(toFile - fromFile) === 2) {
      const rank = move.from[1], kingSide = toFile > fromFile;
      const rookFrom = (kingSide ? 'h' : 'a') + rank, rookTo = (kingSide ? 'f' : 'd') + rank;
      const rook = pieceSnapshot(rookFrom);
      if (rook) motions.push({ ...rook, type: 'castle-rook', from: rookFrom, to: rookTo });
    }
    return motions.length ? { motions } : null;
  }

  function clearTimer(element, className) {
    const byClass = timers.get(element), timer = byClass?.get(className);
    if (timer === undefined) return;
    window.clearTimeout(timer);
    timerHandles.delete(timer);
    byClass.delete(className);
    if (!byClass.size) timers.delete(element);
  }

  function scheduleClassRemoval(element, className, duration) {
    if (!element) return;
    clearTimer(element, className);
    let byClass = timers.get(element);
    if (!byClass) { byClass = new Map(); timers.set(element, byClass); }
    const timer = window.setTimeout(() => {
      element.classList.remove(className);
      byClass.delete(className);
      timerHandles.delete(timer);
      if (!byClass.size) timers.delete(element);
    }, duration);
    byClass.set(className, timer);
    timerHandles.add(timer);
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
    ghosts.add(ghost);
    return ghost;
  }

  function runAnimation(element, keyframes, options, cleanup = () => {}) {
    let finished = false, fallbackTimer = null, animation = null;
    const finish = () => {
      if (finished) return;
      finished = true;
      if (fallbackTimer !== null) {
        window.clearTimeout(fallbackTimer);
        timerHandles.delete(fallbackTimer);
        fallbackTimer = null;
      }
      if (animation) animations.delete(animation);
      cleanup();
    };
    if (!motionAllowed() || typeof element?.animate !== 'function') { finish(); return null; }
    try {
      animation = element.animate(keyframes, { ...options, duration: options.duration || BOARD_MOTION.move });
      animations.add(animation);
      animation.finished.then(finish, finish);
      fallbackTimer = window.setTimeout(finish, (options.duration || BOARD_MOTION.move) + 250);
      timerHandles.add(fallbackTimer);
      return animation;
    } catch {
      finish();
      return null;
    }
  }

  function animateMove(snapshot) {
    if (!motionAllowed() || !snapshot?.motions?.length) return;
    for (const motion of snapshot.motions) {
      const ghost = makeGhost(motion, motion.type);
      const isCapture = motion.type === 'capture';
      let destinationPiece = null, previousVisibility = '';
      if (!isCapture) {
        destinationPiece = getSquare(motion.to)?.querySelector('.gc-piece') || null;
        if (destinationPiece) {
          previousVisibility = destinationPiece.style.visibility;
          destinationPiece.style.visibility = 'hidden';
        }
      }
      const cleanup = () => {
        ghost.remove();
        ghosts.delete(ghost);
        if (destinationPiece) {
          if (previousVisibility) destinationPiece.style.visibility = previousVisibility;
          else destinationPiece.style.removeProperty('visibility');
        }
      };
      if (isCapture) {
        runAnimation(ghost, [
          { transform: 'translate3d(0,0,0) scale(1)', opacity: 1 },
          { transform: 'translate3d(3px,-3px,0) scale(.78)', opacity: 0 }
        ], { duration: BOARD_MOTION.capture, easing: 'cubic-bezier(.3,0,.7,1)', fill: 'forwards' }, cleanup);
        continue;
      }
      const targetSquare = getSquare(motion.to);
      const targetPiece = targetSquare?.querySelector('.gc-piece') || null;
      const targetRect = targetPiece ? targetPiece.getBoundingClientRect() : targetSquare?.getBoundingClientRect();
      if (!targetRect) { cleanup(); continue; }
      const dx = targetRect.left - motion.rect.left, dy = targetRect.top - motion.rect.top;
      runAnimation(ghost, [
        { transform: 'translate3d(0,0,0)', opacity: 1 },
        { transform: 'translate3d(' + dx + 'px,' + dy + 'px,0)', opacity: 1 }
      ], { duration: BOARD_MOTION.move, easing: 'cubic-bezier(.18,.72,.22,1)', fill: 'forwards' }, cleanup);
    }
  }

  function animatePromotion(squareName) {
    const piece = getSquare(squareName)?.querySelector('.gc-piece');
    if (!piece || !motionAllowed()) return;
    piece.classList.remove('gc-piece-promoted');
    void piece.offsetWidth;
    piece.classList.add('gc-piece-promoted');
    scheduleClassRemoval(piece, 'gc-piece-promoted', BOARD_MOTION.promotion + 80);
  }

  function animateCheck(kingSquare) {
    const square = getSquare(kingSquare);
    if (!square || !motionAllowed()) return;
    square.classList.remove('gc-king-in-check');
    void square.offsetWidth;
    square.classList.add('gc-king-in-check');
    scheduleClassRemoval(square, 'gc-king-in-check', BOARD_MOTION.check + 80);
  }

  function animateCheckmate(kingSquare) {
    const square = getSquare(kingSquare);
    if (!square || !motionAllowed()) return;
    clearTimer(square, 'gc-king-in-checkmate');
    square.classList.remove('gc-king-in-checkmate', 'gc-king-in-check');
    void square.offsetWidth;
    square.classList.add('gc-king-in-checkmate');
    scheduleClassRemoval(square, 'gc-king-in-checkmate', BOARD_MOTION.checkmate + 120);
  }

  function animateFlip() {
    if (!board || !motionAllowed() || typeof board.animate !== 'function') return;
    runAnimation(board, [
      { transform: 'perspective(900px) rotateY(0deg) scale(1)', opacity: 1 },
      { transform: 'perspective(900px) rotateY(3deg) scale(.992)', opacity: .94 },
      { transform: 'perspective(900px) rotateY(0deg) scale(1)', opacity: 1 }
    ], { duration: BOARD_MOTION.flip, easing: 'cubic-bezier(.2,.75,.25,1)' });
  }

  function playSound(kind = 'move') {
    if (disposed || !isSoundEnabled()) return;
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) return;
    try {
      audioContext ||= new AudioContextClass();
      if (audioContext.state === 'suspended') {
        const resume = audioContext.resume();
        if (resume?.catch) resume.catch(() => {});
      }
      const now = audioContext.currentTime, wallNow = performance.now();
      if (wallNow - lastSoundAt < 24) return;
      lastSoundAt = wallNow;
      const presets = {
        move: [{frequency:410,offset:0,duration:.065,volume:.026,wave:'triangle'},{frequency:760,offset:.008,duration:.04,volume:.009,wave:'sine'}],
        capture: [{frequency:285,offset:0,duration:.095,volume:.035,wave:'triangle'},{frequency:590,offset:.015,duration:.06,volume:.014,wave:'sine'}],
        check: [{frequency:760,offset:0,duration:.12,volume:.022,wave:'sine'},{frequency:1046,offset:.105,duration:.16,volume:.018,wave:'sine'}],
        checkmate: [{frequency:523.25,offset:0,duration:.15,volume:.019,wave:'sine'},{frequency:659.25,offset:.12,duration:.18,volume:.018,wave:'sine'},{frequency:783.99,offset:.26,duration:.28,volume:.02,wave:'sine'}],
        promotion: [{frequency:523,offset:0,duration:.09,volume:.021,wave:'sine'},{frequency:784,offset:.08,duration:.10,volume:.019,wave:'sine'},{frequency:988,offset:.16,duration:.14,volume:.018,wave:'sine'}]
      };
      for (const note of presets[kind] || presets.move) {
        const start = now + note.offset, oscillator = audioContext.createOscillator(), gain = audioContext.createGain();
        oscillator.type = note.wave;
        oscillator.frequency.setValueAtTime(note.frequency, start);
        gain.gain.setValueAtTime(.0001, start);
        gain.gain.exponentialRampToValueAtTime(note.volume, start + .012);
        gain.gain.exponentialRampToValueAtTime(.0001, start + note.duration);
        oscillator.connect(gain); gain.connect(audioContext.destination);
        oscillator.onended = () => { try { oscillator.disconnect(); gain.disconnect(); } catch {} };
        oscillator.start(start);
        oscillator.stop(start + note.duration + .015);
      }
    } catch { /* Audio is optional and must never interrupt a chess move. */ }
  }

  function getDiagnostics() {
    return {
      activeTimers: timerHandles.size,
      activeAnimations: animations.size,
      activeGhosts: ghosts.size,
      audioContextState: audioContext?.state || 'not-created',
      reducedMotion: reducedMotion(),
      animationsEnabled: Boolean(isAnimationEnabled())
    };
  }

  function dispose() {
    if (disposed) return;
    disposed = true;
    for (const timer of timerHandles) window.clearTimeout(timer);
    timerHandles.clear();
    timers.clear();
    for (const animation of animations) { try { animation.cancel(); } catch {} }
    animations.clear();
    for (const ghost of ghosts) ghost.remove();
    ghosts.clear();
    try { audioContext?.close?.().catch(() => {}); } catch {}
    audioContext = null;
  }

  return { captureMove, animateMove, animatePromotion, animateCheck, animateCheckmate, animateFlip, playSound, getDiagnostics, dispose };
}

import './board-effects.css';

export const BOARD_MOTION = Object.freeze({
  move: 340, capture: 230, promotion: 480, check: 960, checkmate: 1380, flip: 300
});

export function createBoardEffects(board, isSoundEnabled = () => true, isAnimationEnabled = () => true) {
  let audioContext = null;
  let lastSoundAt = 0;
  let disposed = false;
  const timers = new Map();
  const timerHandles = new Set();
  const animations = new Set();
  const ghosts = new Set();
  const transientCleanups = new Set();
  const reducedMotion = () => Boolean(window.matchMedia?.('(prefers-reduced-motion: reduce)').matches);
  const motionAllowed = () => !disposed && !reducedMotion() && Boolean(isAnimationEnabled());

  function getSquare(name) {
    if (!board || !/^[a-h][1-8]$/.test(String(name || ''))) return null;
    return board.querySelector('[data-square="' + name + '"]');
  }

  function pieceSnapshot(squareName) {
    const piece = getSquare(squareName)?.querySelector('.gc-piece');
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
      const captureSquare = move.flags?.includes('e') ? move.to[0] + move.from[1] : move.to;
      const captured = pieceSnapshot(captureSquare);
      if (captured) motions.push({ ...captured, type: 'capture', from: captureSquare, to: move.to });
    }

    const fromFile = move.from.charCodeAt(0), toFile = move.to.charCodeAt(0);
    if (move.piece === 'k' && Math.abs(toFile - fromFile) === 2) {
      const rank = move.from[1], kingSide = toFile > fromFile;
      const rook = pieceSnapshot((kingSide ? 'h' : 'a') + rank);
      if (rook) motions.push({ ...rook, type: 'castle-rook', from: (kingSide ? 'h' : 'a') + rank, to: (kingSide ? 'f' : 'd') + rank });
    }
    return motions.length ? { motions } : null;
  }

  function clearTimer(element, className) {
    const timer = timers.get(element)?.get(className);
    if (timer === undefined) return;
    window.clearTimeout(timer);
    timerHandles.delete(timer);
    const byClass = timers.get(element);
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
    Object.assign(ghost.style, {
      left: snapshot.rect.left + 'px', top: snapshot.rect.top + 'px',
      width: snapshot.rect.width + 'px', height: snapshot.rect.height + 'px'
    });
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

  function cancelTransientMotion() {
    for (const cleanup of [...transientCleanups]) cleanup();
    for (const animation of [...animations]) {
      try { animation.cancel(); } catch {}
    }
    animations.clear();
    for (const ghost of ghosts) ghost.remove();
    ghosts.clear();
  }

  function animateMove(snapshot) {
    if (!motionAllowed() || !snapshot?.motions?.length) return;
    // A new move supersedes unfinished piece travel; old ghosts must never stack.
    cancelTransientMotion();

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
      let cleaned = false;
      const cleanup = () => {
        if (cleaned) return;
        cleaned = true;
        transientCleanups.delete(cleanup);
        ghost.remove();
        ghosts.delete(ghost);
        if (destinationPiece) {
          if (previousVisibility) destinationPiece.style.visibility = previousVisibility;
          else destinationPiece.style.removeProperty('visibility');
        }
      };
      transientCleanups.add(cleanup);

      if (isCapture) {
        runAnimation(ghost, [
          { transform: 'translate3d(0,0,0) scale(1)', opacity: 1 },
          { transform: 'translate3d(2px,-2px,0) scale(.82)', opacity: 0 }
        ], { duration: BOARD_MOTION.capture, easing: 'cubic-bezier(.3,0,.7,1)', fill: 'forwards' }, cleanup);
        continue;
      }

      const targetSquare = getSquare(motion.to);
      const targetRect = targetSquare?.getBoundingClientRect();
      if (!targetRect) { cleanup(); continue; }
      const dx = targetRect.left + targetRect.width / 2 - (motion.rect.left + motion.rect.width / 2);
      const dy = targetRect.top + targetRect.height / 2 - (motion.rect.top + motion.rect.height / 2);
      runAnimation(ghost, [
        { transform: 'translate3d(0,0,0) scale(1)', opacity: 1 },
        { transform: 'translate3d(' + dx + 'px,' + dy + 'px,0) scale(1.015)', opacity: 1 }
      ], { duration: motion.type === 'castle-rook' ? BOARD_MOTION.move + 40 : BOARD_MOTION.move, easing: 'cubic-bezier(.22,.61,.36,1)', fill: 'forwards' }, cleanup);
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
    clearTimer(square, 'gc-king-in-check');
    square.classList.remove('gc-king-in-check');
    void square.offsetWidth;
    square.classList.add('gc-king-in-check');
    scheduleClassRemoval(square, 'gc-king-in-check', BOARD_MOTION.check + 80);
  }

  function animateCheckmate(kingSquare) {
    const square = getSquare(kingSquare);
    if (!square || !motionAllowed()) return;
    clearTimer(square, 'gc-king-in-check');
    clearTimer(square, 'gc-king-in-checkmate');
    square.classList.remove('gc-king-in-check', 'gc-king-in-checkmate');
    void square.offsetWidth;
    square.classList.add('gc-king-in-checkmate');
    scheduleClassRemoval(square, 'gc-king-in-checkmate', BOARD_MOTION.checkmate + 120);
  }

  function animateFlip() {
    if (!board || !motionAllowed() || typeof board.animate !== 'function') return;
    runAnimation(board, [
      { transform: 'perspective(900px) rotateY(0deg) scale(1)', opacity: 1 },
      { transform: 'perspective(900px) rotateY(2deg) scale(.995)', opacity: .97 },
      { transform: 'perspective(900px) rotateY(0deg) scale(1)', opacity: 1 }
    ], { duration: BOARD_MOTION.flip, easing: 'cubic-bezier(.2,.75,.25,1)' });
  }

  function playSound(kind = 'move') {
    if (disposed || !isSoundEnabled()) return;
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) return;
    try {
      audioContext ||= new AudioContextClass();
      if (audioContext.state === 'suspended') audioContext.resume()?.catch?.(() => {});
      const now = audioContext.currentTime, wallNow = performance.now();
      if (wallNow - lastSoundAt < 35) return;
      lastSoundAt = wallNow;
      const presets = {
        move: [{frequency:392,offset:0,duration:.055,volume:.019,wave:'sine'},{frequency:587.33,offset:.012,duration:.045,volume:.008,wave:'sine'}],
        capture: [{frequency:293.66,offset:0,duration:.075,volume:.022,wave:'triangle'},{frequency:440,offset:.018,duration:.055,volume:.009,wave:'sine'}],
        check: [{frequency:659.25,offset:0,duration:.10,volume:.018,wave:'sine'},{frequency:880,offset:.09,duration:.13,volume:.014,wave:'sine'}],
        checkmate: [{frequency:392,offset:0,duration:.16,volume:.018,wave:'sine'},{frequency:493.88,offset:.13,duration:.18,volume:.016,wave:'sine'},{frequency:587.33,offset:.27,duration:.26,volume:.018,wave:'sine'}],
        promotion: [{frequency:493.88,offset:0,duration:.08,volume:.016,wave:'sine'},{frequency:659.25,offset:.08,duration:.10,volume:.015,wave:'sine'},{frequency:783.99,offset:.16,duration:.13,volume:.016,wave:'sine'}]
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
    } catch { /* Sound is optional; a failed audio device must never block chess. */ }
  }

  function getDiagnostics() {
    return {
      activeTimers: timerHandles.size, activeAnimations: animations.size,
      activeGhosts: ghosts.size, activeMotionCleanups: transientCleanups.size,
      audioContextState: audioContext?.state || 'not-created',
      reducedMotion: reducedMotion(), animationsEnabled: Boolean(isAnimationEnabled())
    };
  }

  function dispose() {
    if (disposed) return;
    disposed = true;
    for (const timer of timerHandles) window.clearTimeout(timer);
    timerHandles.clear();
    timers.clear();
    cancelTransientMotion();
    for (const animation of animations) { try { animation.cancel(); } catch {} }
    animations.clear();
    for (const ghost of ghosts) ghost.remove();
    ghosts.clear();
    try { audioContext?.close?.().catch(() => {}); } catch {}
    audioContext = null;
  }

  return { captureMove, animateMove, animatePromotion, animateCheck, animateCheckmate, animateFlip, playSound, getDiagnostics, dispose };
}

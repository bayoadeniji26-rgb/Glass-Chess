import { Chess } from 'chess.js';

/**
 * Replays a line against an isolated Chess instance and returns each resulting FEN.
 * It never mutates the live game object used by the board.
 */
export function calculatePositionHistory(initialFen, moveList) {
  if (typeof initialFen !== 'string' || !initialFen.trim()) {
    throw new TypeError('A starting FEN is required.');
  }
  if (!Array.isArray(moveList)) {
    throw new TypeError('The move list must be an array.');
  }

  const candidate = new Chess(initialFen);
  const positions = [candidate.fen()];

  for (let index = 0; index < moveList.length; index += 1) {
    const move = moveList[index];
    if (!move || typeof move.from !== 'string' || typeof move.to !== 'string') {
      throw new TypeError('Move ' + (index + 1) + ' must include a from and to square.');
    }
    const input = { from: move.from, to: move.to };
    if (move.promotion) input.promotion = move.promotion;
    candidate.move(input);
    positions.push(candidate.fen());
  }

  return positions;
}

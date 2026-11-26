const FILES = 'abcdefgh';

const ALL_TRANSFORMS = [
  { id: 'original', map: (f, r) => [f, r] },
  { id: 'mirror-files', map: (f, r) => [7 - f, r] },
  { id: 'mirror-ranks', map: (f, r) => [f, 7 - r] },
  { id: 'rotate-180', map: (f, r) => [7 - f, 7 - r] },
  { id: 'rotate-90', map: (f, r) => [7 - r, f] },
  { id: 'rotate-270', map: (f, r) => [r, 7 - f] },
  { id: 'transpose', map: (f, r) => [r, f] },
  { id: 'anti-transpose', map: (f, r) => [7 - r, 7 - f] }
];

const PAWN_SAFE_TRANSFORMS = [
  ALL_TRANSFORMS[0],
  ALL_TRANSFORMS[1],
  { ...ALL_TRANSFORMS[2], swapColors: true, turn: 'b' },
  { ...ALL_TRANSFORMS[3], swapColors: true, turn: 'b' }
];

function transformSquare(square, transform) {
  const file = FILES.indexOf(square[0]);
  const row = 8 - Number(square[1]);
  const [nextFile, nextRow] = transform.map(file, row);
  return FILES[nextFile] + (8 - nextRow);
}

function swapPieceColor(piece) {
  return piece === piece.toUpperCase() ? piece.toLowerCase() : piece.toUpperCase();
}

function makeFen(pieces, turn) {
  const board = Array.from({ length: 8 }, () => Array(8).fill(null));
  for (const [square, piece] of pieces) {
    const file = FILES.indexOf(square[0]);
    const row = 8 - Number(square[1]);
    if (file < 0 || row < 0 || row > 7 || board[row][file]) {
      throw new Error('Invalid or overlapping puzzle square: ' + square);
    }
    board[row][file] = piece;
  }
  const ranks = board.map(row => {
    let empty = 0;
    let result = '';
    for (const piece of row) {
      if (!piece) {
        empty += 1;
      } else {
        if (empty) result += empty;
        result += piece;
        empty = 0;
      }
    }
    if (empty) result += empty;
    return result;
  });
  return ranks.join('/') + ' ' + turn + ' - - 0 1';
}

function expandTemplate(template, transforms) {
  return transforms.map(transform => {
    const pieces = template.pieces.map(([square, piece]) => [
      transformSquare(square, transform),
      transform.swapColors ? swapPieceColor(piece) : piece
    ]);
    const [from, to, promotion] = [
      transformSquare(template.solution.slice(0, 2), transform),
      transformSquare(template.solution.slice(2, 4), transform),
      template.solution[4] || ''
    ];
    const targetSquare = template.targetSquare
      ? transformSquare(template.targetSquare, transform)
      : null;
    return {
      fen: makeFen(pieces, transform.turn || 'w'),
      solution: from + to + promotion,
      targetSquare,
      type: template.type,
      title: template.title,
      rating: template.rating,
      hint: template.hint,
      explanation: template.explanation,
      goal: template.goal
    };
  });
}

const QUEEN_MATE = {
  type: 'Mate in 1',
  title: 'Queen checkmate',
  pieces: [['h8', 'k'], ['f6', 'K'], ['g6', 'Q']],
  solution: 'g6g7',
  goal: 'mate',
  rating: 650,
  hint: 'Bring your queen next to the enemy king, but make sure your own king protects it.',
  explanation: 'Checkmate. Your king protects the queen, while the queen controls every escape square.'
};

const QUEEN_LIFT_MATE = {
  ...QUEEN_MATE,
  title: 'Queen lift',
  pieces: [['h8', 'k'], ['f6', 'K'], ['g5', 'Q']],
  solution: 'g5g7',
  rating: 720,
  hint: 'Look for a queen move to the square protected by your king.',
  explanation: 'The queen reaches the mating square with protection from your king. The black king has no legal escape.'
};

const QUEEN_WITH_EXTRA_PIECES = {
  ...QUEEN_MATE,
  title: 'Queen mate under pressure',
  pieces: [['h8', 'k'], ['f6', 'K'], ['g6', 'Q'], ['b8', 'n'], ['a1', 'R']],
  rating: 820,
  hint: 'The queen is more important than the extra pieces. Find the protected checking square.',
  explanation: 'The queen delivers mate on the protected square. The extra pieces do not create an escape.'
};

const ROOK_NET = {
  type: 'Mate in 1',
  title: 'Rook net',
  pieces: [['a8', 'k'], ['h7', 'R'], ['b6', 'K'], ['c6', 'N']],
  solution: 'h7a7',
  goal: 'mate',
  rating: 900,
  hint: 'The rook can give check along the edge. Check who protects its destination and who covers b8.',
  explanation: 'The rook gives check on the a-file. Your king protects the rook, and the knight controls the last escape square.'
};

const KNIGHT_FORK_ONE = {
  type: 'Knight fork',
  title: 'Knight fork',
  pieces: [['h8', 'k'], ['d6', 'q'], ['e5', 'N'], ['a1', 'K']],
  solution: 'e5f7',
  targetSquare: 'd6',
  goal: 'fork',
  rating: 980,
  hint: 'A knight check can attack a second valuable piece at the same time.',
  explanation: 'Check and queen fork. The knight checks the king while attacking the queen on the same move.'
};

const KNIGHT_FORK_TWO = {
  type: 'Knight fork',
  title: 'Royal fork',
  pieces: [['a8', 'k'], ['e6', 'q'], ['b5', 'N'], ['h1', 'K']],
  solution: 'b5c7',
  targetSquare: 'e6',
  goal: 'fork',
  rating: 1050,
  hint: 'Find a knight jump that checks the king and attacks the queen.',
  explanation: 'The knight checks the king on a8 and attacks the queen on e6. The king must answer the check first.'
};

const BACK_RANK_MATE = {
  type: 'Back-rank mate',
  title: 'Back-rank finish',
  pieces: [['g8', 'k'], ['f7', 'p'], ['g7', 'p'], ['h7', 'p'], ['g1', 'K'], ['e1', 'R']],
  solution: 'e1e8',
  goal: 'mate',
  rating: 1120,
  hint: 'The enemy king is trapped by its own pawns. Can your rook use the open rank?',
  explanation: 'Back-rank checkmate. The rook checks across the eighth rank, and the king is boxed in by its own pawns.'
};

const candidateGroups = [
  ...expandTemplate(QUEEN_MATE, ALL_TRANSFORMS),
  ...expandTemplate(QUEEN_LIFT_MATE, ALL_TRANSFORMS),
  ...expandTemplate(QUEEN_WITH_EXTRA_PIECES, ALL_TRANSFORMS),
  ...expandTemplate(ROOK_NET, ALL_TRANSFORMS),
  ...expandTemplate(KNIGHT_FORK_ONE, ALL_TRANSFORMS),
  ...expandTemplate(BACK_RANK_MATE, PAWN_SAFE_TRANSFORMS),
  ...expandTemplate(KNIGHT_FORK_TWO, ALL_TRANSFORMS)
];

const seen = new Set();
const uniqueCandidates = candidateGroups.filter(puzzle => {
  if (seen.has(puzzle.fen)) return false;
  seen.add(puzzle.fen);
  return true;
});

if (uniqueCandidates.length < 50) {
  throw new Error('The chess puzzle catalog must contain at least 50 unique positions.');
}

export const DAILY_PUZZLES = Object.freeze(
  uniqueCandidates.slice(0, 50).map((puzzle, index) => Object.freeze({
    day: index + 1,
    ...puzzle,
    solution: Object.freeze([puzzle.solution])
  }))
);

export function getPuzzleDayIndex(startDate, currentDate) {
  const parse = value => {
    const match = String(value || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!match) throw new TypeError('Dates must use YYYY-MM-DD.');
    const year = Number(match[1]);
    const month = Number(match[2]);
    const day = Number(match[3]);
    const date = new Date(Date.UTC(year, month - 1, day));
    if (date.getUTCFullYear() !== year ||
        date.getUTCMonth() !== month - 1 ||
        date.getUTCDate() !== day) {
      throw new RangeError('Invalid calendar date: ' + value);
    }
    return date.getTime();
  };
  const elapsed = Math.floor((parse(currentDate) - parse(startDate)) / 86400000);
  return Math.max(1, Math.min(50, elapsed + 1));
}

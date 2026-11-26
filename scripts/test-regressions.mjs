import assert from 'node:assert/strict';
import { Chess } from 'chess.js';
import {
  DAILY_PUZZLES,
  getPuzzleDayIndex,
  isPuzzleAnswerCorrect,
  normalizePuzzleAnswer
} from '../src/daily-puzzle-data.js';
import { calculatePositionHistory, isFlagFallDraw } from '../src/chess-position-tools.js';

assert.equal(DAILY_PUZZLES.length, 50, 'The series must contain exactly 50 puzzles.');
assert.deepEqual(DAILY_PUZZLES.map(puzzle => puzzle.day), Array.from({ length: 50 }, (_, index) => index + 1));
assert.equal(new Set(DAILY_PUZZLES.map(puzzle => puzzle.prompt)).size, 50, 'Puzzle prompts must be distinct.');
const counts = Object.fromEntries([...new Set(DAILY_PUZZLES.map(puzzle => puzzle.type))].map(type => [type, DAILY_PUZZLES.filter(puzzle => puzzle.type === type).length]));
assert.deepEqual(counts, { 'Logic': 10, 'Math & Sequence': 10, 'Word & Cipher': 10, 'Spatial': 10, 'Deduction': 10 });
const categories = new Set(['Logic', 'Math & Sequence', 'Spatial', 'Word & Cipher', 'Deduction']);
for (const puzzle of DAILY_PUZZLES) {
  assert.ok(categories.has(puzzle.type), 'Unknown category on Day ' + puzzle.day);
  assert.ok(puzzle.title && puzzle.prompt && puzzle.hint && puzzle.answer && puzzle.explanation, 'Missing puzzle content on Day ' + puzzle.day);
  assert.ok(isPuzzleAnswerCorrect(puzzle, puzzle.answer), 'Canonical answer rejected on Day ' + puzzle.day);
}
assert.equal(normalizePuzzleAnswer('  FORTY-TWO! '), 'forty two');
assert.equal(isPuzzleAnswerCorrect(DAILY_PUZZLES[1], 'forty-two'), true);
assert.equal(isPuzzleAnswerCorrect(DAILY_PUZZLES[1], '41'), false);
assert.equal(isPuzzleAnswerCorrect(DAILY_PUZZLES[27], 'SHORTER'), true);
assert.equal(isPuzzleAnswerCorrect(DAILY_PUZZLES[45], '0.05'), true);
assert.equal(getPuzzleDayIndex('2026-11-25', '2026-11-25'), 1);
assert.equal(getPuzzleDayIndex('2026-11-25', '2026-11-26'), 2);
assert.equal(getPuzzleDayIndex('2026-11-25', '2026-12-14'), 20);
assert.equal(getPuzzleDayIndex('2026-11-25', '2027-01-20'), 50);
assert.equal(getPuzzleDayIndex('2026-11-25', '2026-11-24'), 1);
assert.throws(() => getPuzzleDayIndex('2026-02-30', '2026-03-01'), /Invalid calendar date/);

const start = new Chess();
const startFen = start.fen();
const line = [{ from: 'e2', to: 'e4' }, { from: 'e7', to: 'e5' }, { from: 'g1', to: 'f3' }];
const positions = calculatePositionHistory(startFen, line);
assert.equal(positions.length, line.length + 1);
assert.equal(positions[0], startFen);
assert.notEqual(positions.at(-1), startFen);
assert.equal(start.fen(), startFen, 'The source game must not be mutated.');
assert.throws(() => calculatePositionHistory(startFen, [{ from: 'e2', to: 'e5' }]), /Invalid move/);
assert.equal(start.fen(), startFen, 'An invalid replay must not mutate the source game.');

const castleFen = 'r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1';
const castlePositions = calculatePositionHistory(castleFen, [{ from: 'e1', to: 'g1' }, { from: 'e8', to: 'c8' }]);
assert.equal(castlePositions.length, 3, 'Castling moves must replay.');
const promotionFen = '4k3/P7/8/8/8/8/8/4K3 w - - 0 1';
const promotionPositions = calculatePositionHistory(promotionFen, [{ from: 'a7', to: 'a8', promotion: 'q' }]);
assert.equal(promotionPositions.length, 2, 'Promotion must replay.');
const enPassantGame = new Chess();
for (const san of ['e4', 'a6', 'e5', 'd5']) enPassantGame.move(san);
const enPassantFen = enPassantGame.fen();
const enPassantPositions = calculatePositionHistory(enPassantFen, [{ from: 'e5', to: 'd6' }]);
assert.equal(enPassantPositions.length, 2, 'En passant must replay.');
assert.equal(enPassantGame.fen(), enPassantFen, 'Special-move replay must not mutate its source game.');

console.log('Daily puzzle data and isolated position replay tests passed.');

const bareKingWinnerFen = '7k/8/8/8/8/8/8/K6r b - - 0 1';
assert.equal(isFlagFallDraw(bareKingWinnerFen, 'b'), true, 'A bare-king winner cannot checkmate even when the flagged side still has a rook.');
const rookWinnerFen = '7k/8/8/8/8/8/8/K6R b - - 0 1';
assert.equal(isFlagFallDraw(rookWinnerFen, 'b'), false, 'A winner with a rook can potentially checkmate.');
assert.throws(() => isFlagFallDraw(rookWinnerFen, 'x'), /flagging side/);

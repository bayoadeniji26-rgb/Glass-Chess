import assert from 'node:assert/strict';
import { Chess } from 'chess.js';
import {
  DAILY_PUZZLES,
  getPuzzleDayIndex,
  isPuzzleAnswerCorrect,
  normalizePuzzleAnswer
} from '../src/daily-puzzles.js';
import { calculatePositionHistory } from '../src/chess-position-tools.js';

assert.equal(DAILY_PUZZLES.length, 50, 'The series must contain exactly 50 puzzles.');
assert.deepEqual(DAILY_PUZZLES.map(puzzle => puzzle.day), Array.from({ length: 50 }, (_, index) => index + 1));
const categories = new Set(['Logic', 'Math & Sequence', 'Spatial', 'Word & Cipher', 'Deduction']);
for (const puzzle of DAILY_PUZZLES) {
  assert.ok(categories.has(puzzle.type), 'Unknown category on Day ' + puzzle.day);
  assert.ok(puzzle.title && puzzle.prompt && puzzle.hint && puzzle.answer && puzzle.explanation, 'Missing puzzle content on Day ' + puzzle.day);
  assert.ok(isPuzzleAnswerCorrect(puzzle, puzzle.answer), 'Canonical answer rejected on Day ' + puzzle.day);
}
assert.equal(normalizePuzzleAnswer('  FORTY-TWO! '), 'forty two');
assert.equal(isPuzzleAnswerCorrect(DAILY_PUZZLES[1], 'forty-two'), true);
assert.equal(isPuzzleAnswerCorrect(DAILY_PUZZLES[1], '41'), false);
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

console.log('Daily puzzle data and isolated position replay tests passed.');

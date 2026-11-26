import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { Chess } from 'chess.js';
import { DAILY_PUZZLES, getPuzzleDayIndex } from '../src/daily-puzzle-data.js';
import { calculatePositionHistory, isFlagFallDraw } from '../src/chess-position-tools.js';
import { remainingSeconds } from '../src/gameplay-timers.js';

const uci = move => move.from + move.to + (move.promotion || '');

assert.equal(DAILY_PUZZLES.length, 50, 'The series must contain exactly 50 chess puzzles.');
assert.deepEqual(DAILY_PUZZLES.map(puzzle => puzzle.day), Array.from({ length: 50 }, (_, index) => index + 1));
assert.equal(new Set(DAILY_PUZZLES.map(puzzle => puzzle.fen)).size, 50, 'All 50 puzzle positions must be distinct.');

assert.equal(new Set(DAILY_PUZZLES.map(puzzle => puzzle.id)).size, 50, 'Every puzzle must have a different source puzzle ID.');
assert.ok(new Set(DAILY_PUZZLES.flatMap(puzzle => puzzle.themes.split(' '))).size >= 15, 'The catalog must cover a broad range of tactical themes.');
assert.ok(new Set(DAILY_PUZZLES.map(puzzle => puzzle.solution.length)).size >= 4, 'The catalog must include varied multi-move solution lengths.');
for (const puzzle of DAILY_PUZZLES) {
  assert.ok(puzzle.title && puzzle.hint && puzzle.explanation && puzzle.sourceUrl, 'Missing puzzle content or attribution on Day ' + puzzle.day);
  assert.match(puzzle.fen, /\s[wb]\s/, 'Missing side to move on Day ' + puzzle.day);
  assert.ok(puzzle.solution.length >= 2 && puzzle.solution.length % 2 === 0, 'Each puzzle must include a full solver/opponent line on Day ' + puzzle.day);
  const game = new Chess(puzzle.fen);
  for (const [index, moveText] of puzzle.solution.entries()) {
    const move = game.move({ from: moveText.slice(0,2), to: moveText.slice(2,4), ...(moveText[4] ? { promotion: moveText[4] } : {}) });
    assert.ok(move, 'Puzzle line must be legal on Day ' + puzzle.day + ' at ply ' + (index + 1) + ': ' + moveText);
  }
}
assert.equal(getPuzzleDayIndex('2026-11-25', '2026-11-25'), 1);
assert.equal(getPuzzleDayIndex('2026-11-25', '2026-11-26'), 2);
assert.equal(getPuzzleDayIndex('2026-11-25', '2026-12-14'), 20);
assert.equal(getPuzzleDayIndex('2026-11-25', '2027-01-20'), 50);
assert.equal(getPuzzleDayIndex('2026-11-25', '2026-11-24'), 1);
assert.equal(getPuzzleDayIndex('2024-02-28', '2024-03-01'), 3, 'Leap day progression must be calendar-correct.');
assert.equal(getPuzzleDayIndex('2026-12-31', '2027-01-01'), 2, 'Year boundary progression must be calendar-correct.');
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

const bareKingWinnerFen = '7k/8/8/8/8/8/8/K6r b - - 0 1';
assert.equal(isFlagFallDraw(bareKingWinnerFen, 'b'), true);
const rookWinnerFen = '7k/8/8/8/8/8/8/K6R b - - 0 1';
assert.equal(isFlagFallDraw(rookWinnerFen, 'b'), false);
assert.equal(isFlagFallDraw('7k/8/8/8/8/8/8/K7 b - - 0 1', 'b'), true);
assert.throws(() => isFlagFallDraw(rookWinnerFen, 'x'), /flagging side/);

assert.equal(remainingSeconds(60000, 0), 60);
assert.equal(remainingSeconds(60000, 1001), 59);
assert.equal(remainingSeconds(60000, 59999), 1);
assert.equal(remainingSeconds(60000, 60001), 0);
assert.throws(() => remainingSeconds(Number.NaN, 0), /finite numbers/);

console.log('50 legal daily chess puzzles and regression suite passed.');

const puzzleUi = readFileSync(new URL('../src/daily-puzzles.js', import.meta.url), 'utf8');
const puzzleCss = readFileSync(new URL('../src/daily-puzzles.css', import.meta.url), 'utf8');
assert.match(puzzleUi, /data-action="next"/, 'Daily puzzles must include a Next button.');
assert.match(puzzleUi, /data-action="previous"/, 'Daily puzzles must include a Previous button.');
assert.match(puzzleUi, /puzzleDay\+\+/, 'Next must advance to the next puzzle.');
assert.match(puzzleUi, /puzzleDay--/, 'Previous must return to the previous puzzle.');
assert.match(puzzleCss, /grid-template-rows:repeat\(8,minmax\(0,1fr\)\)/, 'The puzzle board must explicitly size all eight rows.');
assert.match(puzzleCss, /\.gc-daily-square\.is-legal::after/, 'Legal-move indicators must be rendered above the square backgrounds.');
assert.match(puzzleCss, /\.gc-daily-square\.is-capture::after/, 'Capture indicators must be rendered above the square backgrounds.');

const cloudAuthSource = readFileSync(new URL('../src/clerk-auth.js', import.meta.url), 'utf8');
assert.match(puzzleUi, /saveEngine\.saveData/, 'Daily puzzle progress must be persisted in the account save payload.');
assert.match(puzzleUi, /dailyPuzzleProgress/, 'Daily puzzle progress must have a stable cloud-save key.');
assert.match(cloudAuthSource, /applyCloudProgress/, 'A restored cloud profile must restore daily puzzle progress.');

assert.match(puzzleUi, /solutionIndex/, 'The puzzle UI must track progress through a multi-move solution line.');
assert.match(puzzleUi, /game\.move\(moveInput\(puzzle\.solution\[solutionIndex\]\)\)/, 'The opponent response must be played from the verified solution line.');
assert.match(puzzleUi, /Opponent is replying/, 'The player must see the opponent response between their moves.');
assert.match(puzzleUi, /Lichess CC0/, 'The puzzle UI must attribute the open puzzle source.');

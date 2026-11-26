import assert from 'node:assert/strict';
import { Chess } from 'chess.js';
import { DAILY_PUZZLES, getPuzzleDayIndex } from '../src/daily-puzzle-data.js';
import { calculatePositionHistory, isFlagFallDraw } from '../src/chess-position-tools.js';
import { remainingSeconds } from '../src/gameplay-timers.js';

const uci = move => move.from + move.to + (move.promotion || '');

assert.equal(DAILY_PUZZLES.length, 50, 'The series must contain exactly 50 chess puzzles.');
assert.deepEqual(DAILY_PUZZLES.map(puzzle => puzzle.day), Array.from({ length: 50 }, (_, index) => index + 1));
assert.equal(new Set(DAILY_PUZZLES.map(puzzle => puzzle.fen)).size, 50, 'All 50 puzzle positions must be distinct.');

const puzzleTypes = new Set(['Mate in 1', 'Knight fork', 'Back-rank mate']);
for (const puzzle of DAILY_PUZZLES) {
  assert.ok(puzzleTypes.has(puzzle.type), 'Unknown chess puzzle type on Day ' + puzzle.day);
  assert.ok(puzzle.title && puzzle.hint && puzzle.explanation, 'Missing chess puzzle content on Day ' + puzzle.day);
  assert.match(puzzle.fen, /\s[wb]\s/, 'Missing side to move on Day ' + puzzle.day);
  assert.equal(puzzle.solution.length, 1, 'Each daily puzzle must have one answer move on Day ' + puzzle.day);

  const game = new Chess(puzzle.fen);
  const legalMove = game.moves({ verbose: true }).find(move => uci(move) === puzzle.solution[0]);
  assert.ok(legalMove, 'Solution must be legal on Day ' + puzzle.day + ': ' + puzzle.solution[0]);
  const played = game.move({ from: legalMove.from, to: legalMove.to, ...(legalMove.promotion ? { promotion: legalMove.promotion } : {}) });
  assert.ok(played, 'The solution must apply on Day ' + puzzle.day);

  if (puzzle.goal === 'mate') {
    assert.equal(game.isCheckmate(), true, 'Mate puzzle must end in checkmate on Day ' + puzzle.day);
  } else if (puzzle.goal === 'fork') {
    assert.equal(game.isCheck(), true, 'Fork move must give check on Day ' + puzzle.day);
    const target = game.get(puzzle.targetSquare);
    assert.ok(target && target.type === 'q' && target.color === game.turn(), 'Fork must attack the opposing queen on Day ' + puzzle.day);
    const knightSquare = puzzle.solution[0].slice(2, 4);
    const knight = game.get(knightSquare);
    assert.ok(knight && knight.type === 'n' && knight.color !== game.turn(), 'Forking knight must remain on the destination square on Day ' + puzzle.day);
    const df = Math.abs('abcdefgh'.indexOf(knightSquare[0]) - 'abcdefgh'.indexOf(puzzle.targetSquare[0]));
    const dr = Math.abs(Number(knightSquare[1]) - Number(puzzle.targetSquare[1]));
    assert.ok((df === 1 && dr === 2) || (df === 2 && dr === 1), 'Knight must attack the target queen on Day ' + puzzle.day);
  } else {
    assert.fail('Unexpected puzzle goal on Day ' + puzzle.day);
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

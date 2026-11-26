import assert from 'node:assert/strict';
import { Chess } from 'chess.js';

const squares = [];
for (const file of 'abcdefgh') {
  for (const rank of '12345678') squares.push({ dataset: { square: file + rank } });
}
globalThis.window = { setTimeout, clearTimeout };
globalThis.document = {
  querySelector() { return null; },
  querySelectorAll(selector) { return selector === '#board [data-square]' ? squares : []; }
};

const game = new Chess();
let calls = 0;
let nextResult = { bestMove: 'e2e4', cancelled: false };
const api = {
  fen: game.fen(),
  generation: 1,
  thinking: false,
  engineReady: false,
  game,
  async search() { calls += 1; return nextResult; }
};
window.GlassChess = api;

await import('../src/self-test.js');
await new Promise(resolve => setTimeout(resolve, 5));

const run = window.runChessSelfTest;
assert.equal(typeof run, 'function', 'The self-test runner must be exposed on window.');

const uninitialized = await run({ includeEngine: true });
const engineCheck = uninitialized.checks.find(item => item.name === 'Stockfish returns a legal move');
assert.ok(engineCheck?.passed, 'The test should run and validate a move even when engineReady starts false.');
assert.equal(calls, 1, 'The self-test must call the engine rather than passing a skipped check.');

api.thinking = true;
const busy = await run({ includeEngine: true });
const busyCheck = busy.checks.find(item => item.name === 'Stockfish returns a legal move');
assert.equal(busyCheck?.passed, false, 'A busy engine must not be represented as a successful engine test.');
assert.match(busyCheck.detail, /already busy/);
assert.equal(calls, 1, 'The test should not start a competing search while Stockfish is busy.');

api.thinking = false;
nextResult = { bestMove: 'e2e5', cancelled: false };
const illegal = await run({ includeEngine: true });
assert.equal(illegal.checks.find(item => item.name === 'Stockfish returns a legal move')?.passed, false,
  'The self-test must reject an illegal UCI best move.');

nextResult = { bestMove: null, cancelled: true };
const cancelled = await run({ includeEngine: true });
assert.equal(cancelled.checks.find(item => item.name === 'Stockfish returns a legal move')?.passed, false,
  'The self-test must reject cancelled engine searches.');

console.log('Browser self-test logic tests passed: engine auto-start attempt, busy-state failure, illegal bestmove rejection, and cancelled-search rejection.');

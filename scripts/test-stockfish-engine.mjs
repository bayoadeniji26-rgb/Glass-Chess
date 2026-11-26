import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { dirname, join, basename } from 'node:path';
import { readFile, stat } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { Chess } from 'chess.js';

const require = createRequire(import.meta.url);
const stockfish = require('stockfish');
const enginePath = stockfish.findEngine('lite-single');
const wasmPath = enginePath.replace(/\.js$/i, '.wasm');
const publicEnginePath = new URL('../public/engine/stockfish-19-lite-single.js', import.meta.url);
const publicWasmPath = new URL('../public/engine/stockfish-19-lite-single.wasm', import.meta.url);

const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const packageEngine = await readFile(enginePath);
const packageWasm = await readFile(wasmPath);
const shippedEngine = await readFile(publicEnginePath);
const shippedWasm = await readFile(publicWasmPath);
assert.equal(sha256(shippedEngine), sha256(packageEngine), 'The deployed browser worker JavaScript must match the locked Stockfish npm engine.');
assert.equal(sha256(shippedWasm), sha256(packageWasm), 'The deployed browser worker WebAssembly must match the locked Stockfish npm engine.');
assert.ok((await stat(publicWasmPath)).size > 1024 * 1024, 'The Stockfish WASM asset must not be an empty or truncated file.');

const output = [];
const waiters = { uci: null, ready: null, bestmove: null };
let stockfishProcess = null;
let testTimer = null;

function waitFor(key, timeoutMs = 25000) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      if (waiters[key]?.resolve === resolve) waiters[key] = null;
      reject(new Error('Timed out waiting for Stockfish ' + key + '. Last output: ' + output.slice(-8).join(' | ')));
    }, timeoutMs);
    waiters[key] = {
      resolve(value) {
        clearTimeout(timeout);
        waiters[key] = null;
        resolve(value);
      },
      reject(error) {
        clearTimeout(timeout);
        waiters[key] = null;
        reject(error);
      }
    };
  });
}

function onMessage(message) {
  const line = String(message ?? '').trim();
  if (!line) return;
  output.push(line);
  if (line === 'uciok') waiters.uci?.resolve(line);
  if (line === 'readyok') waiters.ready?.resolve(line);
  if (line.startsWith('bestmove ')) waiters.bestmove?.resolve(line);
}

async function searchPosition(fen, label, depth = 7) {
  const game = new Chess(fen);
  assert.ok(!game.isGameOver() || game.isCheckmate() || game.isDraw(), label + ' must be a valid chess position.');
  const response = waitFor('bestmove');
  stockfishProcess.processCommand('position fen ' + fen);
  stockfishProcess.processCommand('go depth ' + depth);
  const line = await response;
  const match = line.match(/^bestmove\s+(\S+)/);
  assert.ok(match, label + ' must produce a UCI bestmove line.');
  const move = match[1];
  if (game.isGameOver()) {
    assert.ok(move === '(none)' || move === '0000', label + ' must return no move for a finished position.');
    return { move: null, line };
  }
  assert.match(move, /^[a-h][1-8][a-h][1-8][qrbn]?$/, label + ' must return a valid UCI coordinate move.');
  const parsed = {
    from: move.slice(0, 2),
    to: move.slice(2, 4),
    ...(move[4] ? { promotion: move[4] } : {})
  };
  const applied = game.move(parsed);
  assert.ok(applied, label + ' best move must be legal in chess.js.');
  return { move, san: applied.san, line };
}

try {
  stockfishProcess = stockfish('lite-single', onMessage);
  const uciReady = waitFor('uci');
  stockfishProcess.processCommand('uci');
  await uciReady;
  assert.ok(output.some(line => /id name Stockfish 19/i.test(line)), 'The loaded engine must identify itself as Stockfish 19.');

  const ready = waitFor('ready');
  stockfishProcess.processCommand('setoption name Skill Level value 0');
  stockfishProcess.processCommand('setoption name MultiPV value 1');
  stockfishProcess.processCommand('isready');
  await ready;

  const start = await searchPosition(new Chess().fen(), 'Initial position');
  assert.ok(start.move, 'Initial position must return a legal move.');

  const enPassant = new Chess();
  for (const move of ['e4', 'a6', 'e5', 'd5']) enPassant.move(move);
  const ep = await searchPosition(enPassant.fen(), 'En-passant-available position');
  assert.ok(ep.move, 'An en-passant FEN must be accepted and analyzed.');

  const promotionFen = '4k3/P7/8/8/8/8/8/4K3 w - - 0 1';
  const promotion = await searchPosition(promotionFen, 'Promotion position', 8);
  assert.ok(promotion.move, 'Promotion position must return a legal move.');

  const mateFen = '7k/6Q1/6K1/8/8/8/8/8 b - - 0 1';
  const mate = new Chess(mateFen);
  assert.ok(mate.isCheckmate(), 'The terminal fixture must actually be checkmate.');
  const finished = await searchPosition(mateFen, 'Checkmate position');
  assert.equal(finished.move, null, 'A checkmated position must not fabricate a move.');

  console.log('Real Stockfish 19 WASM integration passed: shipped JS/WASM hashes match npm 19.0.1; UCI handshake; initial position; en-passant FEN; promotion position; checkmate no-move response.');
} finally {
  if (testTimer) clearTimeout(testTimer);
  for (const waiter of Object.values(waiters)) {
    if (waiter?.reject) waiter.reject(new Error('Stockfish test ended.'));
  }
  try { stockfishProcess?.terminate(); } catch {}
}

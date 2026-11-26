import assert from 'node:assert/strict';
import { Chess } from 'chess.js';
import { ChessEngine } from '../src/engine.js';

const tick = ms => new Promise(resolve => setTimeout(resolve, ms));
const startFen = new Chess().fen();

class MockWorker {
  static instances = [];
  static failNextStartup = false;
  static holdNextStartup = false;

  constructor(url) {
    this.url = url;
    this.commands = [];
    this.listeners = new Map();
    this.onmessage = null;
    this.onerror = null;
    this.terminated = false;
    this.autoBestMove = true;
    this.stopBestMove = true;
    MockWorker.instances.push(this);
  }

  addEventListener(type, listener) {
    const listeners = this.listeners.get(type) || new Set();
    listeners.add(listener);
    this.listeners.set(type, listeners);
  }

  removeEventListener(type, listener) {
    this.listeners.get(type)?.delete(listener);
  }

  emit(data) {
    const event = { data };
    try { this.onmessage?.(event); } catch (error) { throw error; }
    for (const listener of this.listeners.get('message') || []) listener(event);
  }

  postMessage(command) {
    this.commands.push(command);
    if (this.terminated) throw new Error('Worker is terminated.');
    if (command === 'uci') {
      if (MockWorker.holdNextStartup) {
        MockWorker.holdNextStartup = false;
        return;
      }
      if (MockWorker.failNextStartup) {
        MockWorker.failNextStartup = false;
        queueMicrotask(() => this.onerror?.({ message: 'Simulated Stockfish startup failure.' }));
      } else {
        queueMicrotask(() => {
          this.emit('id name Mock Stockfish 19');
          this.emit('uciok');
        });
      }
      return;
    }
    if (command === 'isready') {
      queueMicrotask(() => this.emit('readyok'));
      return;
    }
    if (command.startsWith('go depth ')) {
      if (!this.autoBestMove) return;
      setTimeout(() => {
        if (this.terminated) return;
        this.emit('info depth 5 seldepth 7 multipv 1 score cp 22 nodes 1000 nps 50000 time 20 pv e2e4 e7e5');
        this.emit('bestmove e2e4');
      }, 20);
      return;
    }
    if (command === 'stop' && this.stopBestMove) {
      setTimeout(() => {
        if (!this.terminated) this.emit('bestmove 0000');
      }, 5);
    }
  }

  terminate() {
    this.terminated = true;
  }
}

globalThis.Worker = MockWorker;

try {
  // Concurrent starts share exactly one UCI handshake and one Worker.
  const engine = new ChessEngine();
  await Promise.all([engine.start(), engine.start(), engine.start()]);
  assert.equal(engine.ready, true);
  assert.equal(MockWorker.instances.length, 1, 'Concurrent startup must not create duplicate workers.');
  assert.equal(MockWorker.instances[0].url, '/engine/stockfish.worker.js');

  // Configuration is clamped to the valid ranges and waits for readyok.
  await engine.configure({ skillLevel: 99, multiPV: -10 });
  assert.equal(engine.skillLevel, 20);
  assert.equal(engine.multiPV, 1);
  assert.ok(MockWorker.instances[0].commands.includes('setoption name Skill Level value 20'));
  assert.ok(MockWorker.instances[0].commands.includes('setoption name MultiPV value 1'));

  // A bestmove and its streamed info are associated with the same search.
  const result = await engine.search(startFen, { depth: 5 });
  assert.equal(result.bestMove, 'e2e4');
  assert.equal(result.cancelled, false);
  assert.ok(Number.isInteger(result.searchId) && result.searchId > 0);
  assert.equal(result.score.value, 22);
  assert.deepEqual(result.variations[0].pv, ['e2e4', 'e7e5']);
  const legal = new Chess(startFen);
  assert.ok(legal.move({ from: result.bestMove.slice(0,2), to: result.bestMove.slice(2,4) }));

  // The controller rejects overlapping go commands.
  const worker = engine.worker;
  worker.autoBestMove = false;
  const active = engine.search(startFen, { depth: 8 });
  await tick(0);
  assert.ok(engine.activeSearch, 'The first search should have become active.');
  await assert.rejects(engine.search(startFen), /already running a search/i);
  await engine.stop();
  const stopped = await active;
  assert.equal(stopped.cancelled, true, 'stop() must settle the active request as cancelled.');
  assert.equal(engine.activeSearch, null);
  assert.equal(engine.stopPromise, null);

  // A second request arriving during the stop acknowledgement waits behind
  // the cancelled search instead of failing with a transient busy error.
  worker.autoBestMove = false;
  const stoppingSearch = engine.search(startFen, { depth: 4 });
  await tick(0);
  const stopAcknowledgement = engine.stop();
  worker.autoBestMove = true;
  const queuedAfterStop = engine.search(startFen, { depth: 4 });
  const stoppingResult = await stoppingSearch;
  const afterStop = await queuedAfterStop;
  await stopAcknowledgement;
  assert.equal(stoppingResult.cancelled, true);
  assert.equal(afterStop.bestMove, 'e2e4');
  assert.equal(afterStop.cancelled, false);

  // Messages from a terminated worker must not complete the next worker's search.
  const oldWorker = engine.worker;
  await engine.restartWorker();
  const replacement = engine.worker;
  assert.notEqual(replacement, oldWorker);
  assert.equal(oldWorker.terminated, true);
  replacement.autoBestMove = false;
  const replacementSearch = engine.search(startFen, { depth: 4 });
  await tick(0);
  const activeReplacement = engine.activeSearch;
  assert.ok(activeReplacement);
  oldWorker.emit('bestmove a2a3');
  assert.equal(engine.activeSearch, activeReplacement, 'A stale bestmove from an old Worker must be ignored.');
  replacement.emit('info depth 3 score cp 12 multipv 1 pv d2d4');
  replacement.emit('bestmove d2d4');
  const replacementResult = await replacementSearch;
  assert.equal(replacementResult.bestMove, 'd2d4');

  // A search waiting behind configuration is cancellable before it sends "go".
  const waitingEngine = new ChessEngine();
  let releaseConfiguration;
  waitingEngine.configureQueue = new Promise(resolve => { releaseConfiguration = resolve; });
  const waitingSearch = waitingEngine.search(startFen, { depth: 3 });
  await tick(0);
  await waitingEngine.stop();
  releaseConfiguration();
  const cancelledBeforeStart = await waitingSearch;
  assert.equal(cancelledBeforeStart.cancelled, true);
  assert.equal(MockWorker.instances.length, 2, 'A cancelled pre-start request must not spawn a Worker.');

  // Startup failure is reported, cleans up the failed worker, and can be retried.
  const retryEngine = new ChessEngine();
  MockWorker.failNextStartup = true;
  await assert.rejects(retryEngine.start(), /\[object Object\]/);
  await tick(0);
  assert.equal(retryEngine.ready, false);
  assert.equal(retryEngine.worker, null);
  await retryEngine.start();
  assert.equal(retryEngine.ready, true);

  // Restarting during startup must reject the old start and keep its old
  // timeout from terminating the replacement Worker.
  const restartingEngine = new ChessEngine();
  restartingEngine.startTimeoutMs = 40;
  MockWorker.holdNextStartup = true;
  const staleStartPromise = restartingEngine.start();
  await tick(0);
  const staleStartingWorker = restartingEngine.worker;
  await restartingEngine.restartWorker();
  const replacementStartupWorker = restartingEngine.worker;
  assert.notEqual(replacementStartupWorker, staleStartingWorker);
  assert.equal(staleStartingWorker.terminated, true);
  await assert.rejects(staleStartPromise, /restarted during startup/);
  await tick(60);
  assert.equal(restartingEngine.ready, true, 'An old startup timeout must not tear down the new Worker.');
  assert.equal(restartingEngine.worker, replacementStartupWorker);

  // An unexpected Worker failure rejects an active search and permits restart.
  const failureWorker = retryEngine.worker;
  failureWorker.autoBestMove = false;
  const failedSearch = retryEngine.search(startFen, { depth: 5 });
  await tick(0);
  failureWorker.onerror?.({ message: 'Simulated runtime failure.' });
  await assert.rejects(failedSearch, /Stockfish worker failed/);
  assert.equal(retryEngine.activeSearch, null);
  assert.equal(retryEngine.ready, false);
  await retryEngine.start();
  assert.equal(retryEngine.ready, true);

  console.log('Stockfish controller lifecycle tests passed: shared startup, UCI configuration, parsed info, legal bestmove, overlap rejection, cancellation, stale-worker isolation, pre-start cancellation, failed-start retry, and runtime-error recovery.');
} finally {
  for (const worker of MockWorker.instances) worker.terminate();
}

class ChessEngine {
  constructor() {
    this.worker = null;
    this.ready = false;
    this.startPromise = null;
    this.configureQueue = Promise.resolve();
    this.searchPromise = null;
    this.stopPromise = null;
    this.activeSearch = null;
    this.searchGeneration = 0;
    this.skillLevel = 3;
    this.multiPV = 1;
  }

  start() {
    if (this.ready && this.worker) return Promise.resolve();
    if (this.startPromise) return this.startPromise;

    let resolveReady;
    let rejectReady;
    const pending = new Promise((resolve, reject) => {
      resolveReady = resolve;
      rejectReady = reject;
    });
    this.startPromise = pending;

    let settled = false;
    let timeout = null;
    const failStart = error => {
      if (settled) return;
      settled = true;
      if (timeout) clearTimeout(timeout);
      this.ready = false;
      try { this.worker?.terminate(); } catch {}
      this.worker = null;
      rejectReady(error instanceof Error ? error : new Error(String(error)));
    };
    const finishStart = () => {
      if (settled) return;
      settled = true;
      if (timeout) clearTimeout(timeout);
      this.ready = true;
      resolveReady();
    };

    try {
      const worker = new Worker("/engine/stockfish.worker.js");
      this.worker = worker;

      worker.onmessage = event => {
        // Ignore late output from a worker that has already been replaced.
        if (this.worker !== worker) return;
        const message = String(event.data ?? "").trim();
        if (message === "uciok") {
          try {
            this.send("setoption name Skill Level value " + this.skillLevel);
            this.send("setoption name MultiPV value " + this.multiPV);
            this.send("isready");
          } catch (error) {
            failStart(error);
          }
          return;
        }

        if (message === "readyok" && !this.ready) {
          finishStart();
          return;
        }

        if (message.startsWith("info")) {
          const parsed = this.parseInfo(message);
          if (this.activeSearch && parsed) {
            this.activeSearch.latestInfo = parsed;
            this.activeSearch.variations.set(parsed.multipv || 1, parsed);
            if ((parsed.multipv || 1) === 1) {
              try { this.activeSearch.onInfo?.(parsed, message); }
              catch (error) { console.warn("Stockfish info callback failed:", error); }
            }
          }
        }

        if (message.startsWith("bestmove")) this.finishSearch(message);
      };

      worker.onerror = error => {
        if (this.worker !== worker) return;
        if (!settled) {
          failStart(error);
        } else {
          this.handleWorkerFailure(error, worker);
        }
      };

      timeout = setTimeout(() => {
        failStart(new Error("Stockfish took too long to start."));
      }, 20000);
      worker.postMessage("uci");
    } catch (error) {
      failStart(error);
    }

    pending.then(
      () => { if (this.startPromise === pending) this.startPromise = null; },
      () => { if (this.startPromise === pending) this.startPromise = null; }
    );
    return pending;
  }

  handleWorkerFailure(error, failedWorker = this.worker) {
    if (failedWorker && this.worker && this.worker !== failedWorker) return;
    this.searchGeneration += 1;
    this.ready = false;
    const active = this.activeSearch;
    this.activeSearch = null;
    if (active?.timeout) clearTimeout(active.timeout);
    if (active) {
      try { active.reject(error instanceof Error ? error : new Error("Stockfish worker failed.")); }
      catch {}
    }
    try { failedWorker?.terminate(); } catch {}
    this.worker = null;
  }

  send(command) {
    if (!this.worker) throw new Error("Stockfish worker is not available.");
    try {
      this.worker.postMessage(command);
    } catch (error) {
      this.handleWorkerFailure(error);
      throw error;
    }
  }

  async restartWorker() {
    const previous = this.worker;
    this.worker = null;
    this.ready = false;
    this.startPromise = null;
    try { previous?.terminate(); } catch {}
    await this.start();
  }

  configure(options = {}) {
    const run = () => this.configureWorker(options);
    const queued = this.configureQueue.then(run, run);
    this.configureQueue = queued.catch(() => {});
    return queued;
  }

  async configureWorker(options = {}) {
    if (!this.ready || !this.worker) await this.start();
    await this.stop();

    if (Number.isFinite(options.skillLevel)) {
      this.skillLevel = Math.max(0, Math.min(20, Math.round(options.skillLevel)));
    }
    if (Number.isFinite(options.multiPV)) {
      this.multiPV = Math.max(1, Math.min(5, Math.round(options.multiPV)));
    }

    const worker = this.worker;
    if (!worker || !this.ready) throw new Error("Stockfish is not ready to configure.");

    try {
      await new Promise((resolve, reject) => {
        let settled = false;
        let timeout = null;
        const cleanup = () => {
          if (timeout) clearTimeout(timeout);
          worker.removeEventListener("message", listener);
        };
        const finish = () => {
          if (settled) return;
          settled = true;
          cleanup();
          resolve();
        };
        const listener = event => {
          if (String(event.data ?? "").trim() === "readyok") finish();
        };

        worker.addEventListener("message", listener);
        timeout = setTimeout(() => {
          if (settled) return;
          settled = true;
          cleanup();
          reject(new Error("Engine configuration timed out."));
        }, 5000);

        try {
          worker.postMessage("setoption name Skill Level value " + this.skillLevel);
          worker.postMessage("setoption name MultiPV value " + this.multiPV);
          // Register the listener before isready so a quick readyok cannot be missed.
          worker.postMessage("isready");
        } catch (error) {
          settled = true;
          cleanup();
          reject(error);
        }
      });
    } catch (error) {
      try { await this.restartWorker(); }
      catch (restartError) {
        throw new Error("Engine configuration failed and Stockfish could not restart: " + restartError.message);
      }
      throw error;
    }
  }

  search(fen, options = {}) {
    if (this.searchPromise) {
      return Promise.reject(new Error("Stockfish is already running a search."));
    }

    // Invalidate a request even while it is awaiting worker startup.
    const requestId = ++this.searchGeneration;
    const cancelledResult = () => ({
      bestMove: null,
      variations: [],
      cancelled: true,
      searchId: requestId
    });

    const task = (async () => {
      await this.configureQueue;
      if (requestId !== this.searchGeneration) return cancelledResult();
      if (!this.ready || !this.worker) await this.start();
      if (requestId !== this.searchGeneration) return cancelledResult();

      return new Promise((resolve, reject) => {
        const depth = Math.max(1, Math.min(30, Number(options.depth) || 10));
        const timeoutMs = Math.max(3000, Math.min(90000, Number(options.timeoutMs) || 30000));
        const search = {
          id: requestId,
          resolve,
          reject,
          onInfo: options.onInfo,
          latestInfo: null,
          variations: new Map(),
          cancelled: false,
          timeout: null
        };
        this.activeSearch = search;
        try {
          if (requestId !== this.searchGeneration) {
            this.activeSearch = null;
            resolve(cancelledResult());
            return;
          }
          this.send("setoption name MultiPV value " + this.multiPV);
          this.send("position fen " + fen);
          this.send("go depth " + depth);
          // A lost worker response must never leave Hint or analysis pending forever.
          search.timeout = setTimeout(() => {
            if (this.activeSearch !== search) return;
            this.activeSearch = null;
            search.timeout = null;
            this.searchGeneration += 1;
            this.ready = false;
            const timedOutWorker = this.worker;
            this.worker = null;
            try { timedOutWorker?.terminate(); } catch {}
            search.reject(new Error(
              "Stockfish did not return a best move within " + Math.round(timeoutMs / 1000) +
              " seconds. The engine is restarting; try Hint again."
            ));
            void this.start().catch(error => {
              console.error("Stockfish restart after search timeout failed:", error);
            });
          }, timeoutMs);
        } catch (error) {
          if (this.activeSearch === search) this.activeSearch = null;
          reject(error);
        }
      });
    })();

    this.searchPromise = task;
    task.then(
      () => { if (this.searchPromise === task) this.searchPromise = null; },
      () => { if (this.searchPromise === task) this.searchPromise = null; }
    );
    return task;
  }

  parseInfo(message) {
    const info = {};
    const depth = message.match(/\bdepth\s+(\d+)/);
    const seldepth = message.match(/\bseldepth\s+(\d+)/);
    const multipv = message.match(/\bmultipv\s+(\d+)/);
    const score = message.match(/\bscore\s+(cp|mate)\s+(-?\d+)/);
    const nodes = message.match(/\bnodes\s+(\d+)/);
    const nps = message.match(/\bnps\s+(\d+)/);
    const time = message.match(/\btime\s+(\d+)/);
    const pv = message.match(/\bpv\s+(.+)$/);

    if (depth) info.depth = Number(depth[1]);
    if (seldepth) info.seldepth = Number(seldepth[1]);
    if (multipv) info.multipv = Number(multipv[1]);
    if (score) info.score = { type: score[1], value: Number(score[2]) };
    if (nodes) info.nodes = Number(nodes[1]);
    if (nps) info.nps = Number(nps[1]);
    if (time) info.time = Number(time[1]);
    if (pv) info.pv = pv[1].trim().split(/\s+/);
    return info;
  }

  finishSearch(message) {
    if (!this.activeSearch) return;

    const search = this.activeSearch;
    this.activeSearch = null;
    if (search.timeout) {
      clearTimeout(search.timeout);
      search.timeout = null;
    }
    const match = message.match(/^bestmove\s+(\S+)/);
    const rawBestMove = match ? match[1] : null;
    const bestMove = rawBestMove && rawBestMove !== "(none)" && rawBestMove !== "0000"
      ? rawBestMove
      : null;

    search.resolve({
      ...(search.variations.get(1) || search.latestInfo || {}),
      bestMove,
      variations: Array.from(search.variations.values())
        .sort((a, b) => (a.multipv || 1) - (b.multipv || 1)),
      cancelled: search.cancelled,
      searchId: search.id
    });
  }

  stop() {
    // Also cancels work that has not sent its UCI go command yet.
    this.searchGeneration += 1;
    if (!this.activeSearch) return Promise.resolve();
    if (this.stopPromise) return this.stopPromise;

    const search = this.activeSearch;
    search.cancelled = true;
    if (search.timeout) {
      clearTimeout(search.timeout);
      search.timeout = null;
    }
    const originalResolve = search.resolve;
    const originalReject = search.reject;

    this.stopPromise = new Promise(resolve => {
      let finished = false;
      let timeout = null;
      const finish = () => {
        if (finished) return;
        finished = true;
        if (timeout) clearTimeout(timeout);
        this.stopPromise = null;
        resolve();
      };

      search.resolve = result => {
        try { originalResolve(result); }
        finally { finish(); }
      };
      search.reject = error => {
        try { originalReject(error); }
        finally { finish(); }
      };

      timeout = setTimeout(async () => {
        if (this.activeSearch === search) {
          this.activeSearch = null;
          try {
            originalResolve({
              ...(search.variations.get(1) || search.latestInfo || {}),
              bestMove: null,
              variations: Array.from(search.variations.values()),
              cancelled: true,
              searchId: search.id
            });
          } catch {}
          try { await this.restartWorker(); }
          catch (error) { console.error("Stockfish restart after stop timeout failed:", error); }
        }
        finish();
      }, 1500);

      try { this.send("stop"); }
      catch (error) {
        if (this.activeSearch === search) this.activeSearch = null;
        try { originalReject(error); } catch {}
        finish();
      }
    });

    return this.stopPromise;
  }
}

export const engine = new ChessEngine();

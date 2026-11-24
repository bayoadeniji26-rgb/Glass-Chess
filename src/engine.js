class ChessEngine {
  constructor() {
    this.worker = null;
    this.ready = false;
    this.startPromise = null;
    this.activeSearch = null;
    this.skillLevel = 3;
    this.multiPV = 1;
  }

  start() {
    if (this.ready) return Promise.resolve();
    if (this.startPromise) return this.startPromise;

    this.startPromise = new Promise((resolve, reject) => {
      try {
        this.worker = new Worker("/engine/stockfish.worker.js");

        const timeout = setTimeout(() => {
          reject(new Error("Stockfish took too long to start."));
        }, 20000);

        this.worker.onmessage = event => {
          const message = String(event.data).trim();

          if (message === "uciok") {
            this.send("setoption name Skill Level value " + this.skillLevel);
            this.send("setoption name MultiPV value " + this.multiPV);
            this.send("isready");
          }

          if (message === "readyok") {
            clearTimeout(timeout);
            this.ready = true;
            resolve();
          }

          if (message.startsWith("info")) {
            const parsed = this.parseInfo(message);
            if (this.activeSearch && parsed) {
              this.activeSearch.latestInfo = parsed;
              this.activeSearch.variations.set(parsed.multipv || 1, parsed);
              if ((parsed.multipv || 1) === 1) this.activeSearch.onInfo?.(parsed, message);
            }
          }

          if (message.startsWith("bestmove")) {
            this.finishSearch(message);
          }
        };

        this.worker.onerror = error => {
          clearTimeout(timeout);
          this.ready = false;
          reject(error);
        };

        this.send("uci");
      } catch (error) {
        reject(error);
      }
    });

    return this.startPromise;
  }

  send(command) {
    if (this.worker) {
      this.worker.postMessage(command);
    }
  }

  async configure(options = {}) {
    if (!this.ready) {
      throw new Error("Stockfish is not ready.");
    }

    await this.stop();

    if (Number.isFinite(options.skillLevel)) {
      this.skillLevel = Math.max(0, Math.min(20, Math.round(options.skillLevel)));
    }
    if (Number.isFinite(options.multiPV)) {
      this.multiPV = Math.max(1, Math.min(5, Math.round(options.multiPV)));
    }

    this.send("setoption name Skill Level value " + this.skillLevel);
    this.send("setoption name MultiPV value " + this.multiPV);

    this.send("isready");

    await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.worker.removeEventListener?.("message", listener);
        reject(new Error("Engine configuration timed out."));
      }, 5000);

      const listener = event => {
        if (String(event.data).trim() === "readyok") {
          clearTimeout(timeout);
          this.worker.removeEventListener("message", listener);
          resolve();
        }
      };

      this.worker.addEventListener("message", listener);
    });
  }

  search(fen, options = {}) {
    if (!this.ready) {
      return Promise.reject(new Error("Stockfish is not ready."));
    }

    return this.stop().then(() => {
      return new Promise((resolve, reject) => {
        this.activeSearch = {
          resolve,
          reject,
          onInfo: options.onInfo,
          latestInfo: null,
          variations: new Map(),
          cancelled: false
        };

        const depth = Math.max(
          1,
          Math.min(30, Number(options.depth) || 10)
        );

        this.send("setoption name MultiPV value " + this.multiPV);
        this.send("position fen " + fen);
        this.send("go depth " + depth);
      });
    });
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

    const match = message.match(/^bestmove\s+(\S+)/);
    const bestMove = match ? match[1] : null;

    search.resolve({
      ...(search.variations.get(1) || search.latestInfo || {}),
      bestMove,
      variations: Array.from(search.variations.values()).sort((a,b)=>(a.multipv||1)-(b.multipv||1)),
      cancelled: search.cancelled
    });
  }

  stop() {
    if (!this.activeSearch) {
      return Promise.resolve();
    }

    return new Promise(resolve => {
      const search = this.activeSearch;

      search.cancelled = true;

      const originalResolve = search.resolve;

      search.resolve = result => {
        originalResolve(result);
        resolve();
      };

      this.send("stop");
    });
  }
}

export const engine = new ChessEngine();

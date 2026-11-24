class ChessEngine {
  constructor() {
    this.worker = null;
    this.ready = false;
    this.startPromise = null;
    this.activeSearch = null;
    this.skillLevel = 3;
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
            this.send("setoption name Skill Level value " + 
this.skillLevel);
            this.send("isready");
          }

          if (message === "readyok") {
            clearTimeout(timeout);
            this.ready = true;
            resolve();
          }

          if (message.startsWith("info")) {
            this.activeSearch?.onInfo?.(message);
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
      this.skillLevel = Math.max(
        0,
        Math.min(20, Math.round(options.skillLevel))
      );
    }

    this.send(
      "setoption name Skill Level value " + this.skillLevel
    );

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
          cancelled: false
        };

        const depth = Math.max(
          1,
          Math.min(30, Number(options.depth) || 10)
        );

        this.send("position fen " + fen);
        this.send("go depth " + depth);
      });
    });
  }

  finishSearch(message) {
    if (!this.activeSearch) return;

    const search = this.activeSearch;
    this.activeSearch = null;

    const match = message.match(/^bestmove\s+(\S+)/);
    const bestMove = match ? match[1] : null;

    search.resolve({
      bestMove,
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

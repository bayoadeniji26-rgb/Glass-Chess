export class CloudSyncQueue {
  constructor({ run, canRun = () => true, delayMs = 900, retryDelayMs = 200, onError = () => {} } = {}) {
    if (typeof run !== 'function') throw new TypeError('CloudSyncQueue requires an async run() function.');
    if (typeof canRun !== 'function') throw new TypeError('CloudSyncQueue canRun must be a function.');
    this.run = run;
    this.canRun = canRun;
    this.delayMs = Math.max(0, Number(delayMs) || 0);
    this.retryDelayMs = Math.max(0, Number(retryDelayMs) || 0);
    this.onError = onError;
    this.timer = null;
    this.pending = false;
    this.running = false;
    this.promise = null;
  }

  queue() {
    if (!this.canRun()) return false;
    this.pending = true;
    if (!this.running) this.schedule(this.delayMs);
    return true;
  }

  schedule(delay) {
    if (this.timer !== null) clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      this.timer = null;
      void this.flush().catch(() => {});
    }, delay);
  }

  async flush({ force = false } = {}) {
    if (force && this.canRun()) this.pending = true;
    if (!this.canRun()) {
      this.pending = false;
      return false;
    }

    if (this.running) {
      this.pending = true;
      const current = this.promise;
      if (current) await current;
      // The in-flight run may have belonged to a different account. After it
      // settles, flush any work queued for the current account immediately.
      if (this.pending && this.canRun()) {
        if (this.timer !== null) clearTimeout(this.timer);
        this.timer = null;
        return this.flush();
      }
      return true;
    }

    if (!this.pending) return true;
    if (this.timer !== null) clearTimeout(this.timer);
    this.timer = null;
    this.running = true;

    const execute = async () => {
      while (this.pending && this.canRun()) {
        this.pending = false;
        await this.run();
      }
    };

    const active = execute().finally(() => {
      this.running = false;
      this.promise = null;
      if (this.pending && this.canRun()) this.schedule(this.retryDelayMs);
    });
    this.promise = active;

    try {
      await active;
      return true;
    } catch (error) {
      try { this.onError(error); } catch {}
      throw error;
    }
  }

  cancel() {
    if (this.timer !== null) clearTimeout(this.timer);
    this.timer = null;
    this.pending = false;
  }

  get diagnostics() {
    return {
      pending: this.pending,
      running: this.running,
      timerScheduled: this.timer !== null
    };
  }
}

const DB_NAME = 'glass-chess-save-engine';
const DB_VERSION = 1;
const STORE_NAME = 'profiles';
const ACTIVE_KEY = 'active';

const DEFAULT_STATE = Object.freeze({
  schema: 1,
  backgroundImage: '',
  backgroundUrl: '',
  avatars: { player: '', opponent: '' },
  chatLog: [],
  games: [],
  activePgn: '',
  activeFen: '',
  localStorage: {},
  updatedAt: ''
});

function requestResult(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('IndexedDB request failed.'));
  });
}

function transactionDone(transaction) {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error || new Error('Save transaction failed.'));
    transaction.onabort = () => reject(transaction.error || new Error('Save transaction was cancelled.'));
  });
}

function mergeState(current, patch) {
  const next = { ...current, ...patch };
  if (patch.avatars) next.avatars = { ...(current.avatars || {}), ...patch.avatars };
  if (patch.localStorage) next.localStorage = { ...(current.localStorage || {}), ...patch.localStorage };
  if (patch.chatLog) next.chatLog = patch.chatLog.slice(-300);
  if (patch.games) next.games = patch.games.slice(-150);
  next.schema = 1;
  next.updatedAt = new Date().toISOString();
  return next;
}

export class SaveEngine {
  constructor() {
    this.dbPromise = null;
    this.writeQueue = Promise.resolve();
    this.cloudAdapter = null;
    this.memoryState = { ...DEFAULT_STATE, avatars: { player: '', opponent: '' } };
  }

  open() {
    if (!('indexedDB' in globalThis)) return Promise.reject(new Error('This browser does not support IndexedDB.'));
    if (this.dbPromise) return this.dbPromise;
    this.dbPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) db.createObjectStore(STORE_NAME);
      };
      request.onsuccess = () => {
        const db = request.result;
        db.onversionchange = () => { db.close(); this.dbPromise = null; };
        resolve(db);
      };
      request.onerror = () => reject(request.error || new Error('Could not open the local save database.'));
      request.onblocked = () => reject(new Error('The local save database is blocked by another open tab.'));
    });
    return this.dbPromise;
  }

  async loadData() {
    try {
      const db = await this.open();
      const tx = db.transaction(STORE_NAME, 'readonly');
      const saved = await requestResult(tx.objectStore(STORE_NAME).get(ACTIVE_KEY));
      await transactionDone(tx);
      this.memoryState = saved ? mergeState(DEFAULT_STATE, saved) : this.memoryState;
      return structuredCloneSafe(this.memoryState);
    } catch (error) {
      try {
        const fallback = JSON.parse(localStorage.getItem('glass-chess-save-engine-fallback') || 'null');
        if (fallback) this.memoryState = mergeState(DEFAULT_STATE, fallback);
      } catch {}
      if (!this.memoryState.updatedAt) console.warn('Glass Chess is using its in-memory save fallback:', error);
      return structuredCloneSafe(this.memoryState);
    }
  }

  saveData(patch = {}) {
    const write = async () => {
      const current = await this.loadData();
      const next = mergeState(current, patch);
      this.memoryState = next;
      try {
        const db = await this.open();
        const tx = db.transaction(STORE_NAME, 'readwrite');
        tx.objectStore(STORE_NAME).put(next, ACTIVE_KEY);
        await transactionDone(tx);
      } catch (error) {
        try {
          localStorage.setItem('glass-chess-save-engine-fallback', JSON.stringify(next));
        } catch (fallbackError) {
          throw new Error('Could not save this profile. Browser storage may be full: ' + (fallbackError.message || error.message));
        }
      }
      return structuredCloneSafe(next);
    };
    this.writeQueue = this.writeQueue.then(write, write);
    return this.writeQueue;
  }

  replaceData(nextState) {
    const replace = async () => {
      const source = nextState || {};
      if (!Array.isArray(source.chatLog) || !Array.isArray(source.games) ||
          !source.avatars || typeof source.avatars !== 'object') {
        throw new Error('This save file is missing required profile data.');
      }
      const safe = mergeState(DEFAULT_STATE, source);
      this.memoryState = safe;
      try {
        const db = await this.open();
        const tx = db.transaction(STORE_NAME, 'readwrite');
        tx.objectStore(STORE_NAME).put(safe, ACTIVE_KEY);
        await transactionDone(tx);
        localStorage.removeItem('glass-chess-save-engine-fallback');
      } catch (error) {
        try { localStorage.setItem('glass-chess-save-engine-fallback', JSON.stringify(safe)); }
        catch { throw new Error('The imported save is too large for this browser storage.'); }
      }
      return structuredCloneSafe(safe);
    };
    // Replacements must share the same serial write queue as incremental saves.
    // Otherwise an older queued write can finish after an import/cloud restore and
    // silently put the old profile back on top of the restored profile.
    this.writeQueue = this.writeQueue.then(replace, replace);
    return this.writeQueue;
  }

  async exportSave() {
    await this.writeQueue;
    const state = await this.loadData();
    return JSON.stringify({
      format: 'glass-chess.kingpawn-save',
      version: 1,
      exportedAt: new Date().toISOString(),
      state
    }, null, 2);
  }

  async importSave(source) {
    const parsed = typeof source === 'string' ? JSON.parse(source) : source;
    if (!parsed || parsed.format !== 'glass-chess.kingpawn-save' || parsed.version !== 1 || !parsed.state) {
      throw new Error('That file is not a supported Glass Chess / King Pawn save.');
    }
    return this.replaceData(parsed.state);
  }

  setCloudAdapter(adapter) {
    if (adapter !== null && (!adapter || typeof adapter.push !== 'function' || typeof adapter.pull !== 'function')) {
      throw new TypeError('A cloud adapter must implement async push(data) and pull().');
    }
    this.cloudAdapter = adapter;
  }

  async getCommittedData() {
    // Read only after every accepted write has settled. Cloud snapshots and
    // exports must never race an import, profile restore, or queued local save.
    await this.writeQueue;
    return this.loadData();
  }

  async saveToCloud() {
    if (!this.cloudAdapter) throw new Error('Cloud sync is not configured. Export a save file to move data between devices.');
    const snapshot = await this.getCommittedData();
    return this.cloudAdapter.push(snapshot);
  }

  async loadFromCloud() {
    if (!this.cloudAdapter) throw new Error('Cloud sync is not configured. Export a save file to move data between devices.');
    await this.writeQueue;
    const remote = await this.cloudAdapter.pull();
    if (!remote || typeof remote !== 'object') throw new Error('The cloud service returned an invalid save.');
    return this.replaceData(remote);
  }
}

function structuredCloneSafe(value) {
  if (typeof structuredClone === 'function') return structuredClone(value);
  return JSON.parse(JSON.stringify(value));
}

export const saveEngine = new SaveEngine();

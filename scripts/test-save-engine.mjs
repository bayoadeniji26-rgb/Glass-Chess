import assert from 'node:assert/strict';
import { SaveEngine } from '../src/save-engine.js';

class MemoryStorage {
  values = new Map();
  getItem(key) { return this.values.has(key) ? this.values.get(key) : null; }
  setItem(key, value) { this.values.set(key, String(value)); }
  removeItem(key) { this.values.delete(key); }
}

const previousStorage = globalThis.localStorage;
const previousWarn = console.warn;
globalThis.localStorage = new MemoryStorage();
console.warn = () => {};

try {
  const engine = new SaveEngine();
  engine.open = async () => { throw new Error('Simulated IndexedDB unavailable.'); };

  // An account restore must not be overwritten by a previously queued local save.
  let releaseFirstWrite;
  engine.writeQueue = new Promise(resolve => { releaseFirstWrite = resolve; });
  const queuedOldSave = engine.saveData({ localStorage: { lastScreen: 'old-device' } });
  const restoredState = {
    schema: 1,
    avatars: { player: '♔', opponent: '♚' },
    chatLog: [],
    games: [],
    localStorage: { lastScreen: 'restored-account', dailyPuzzleProgress: { version: 3 } },
    activePgn: '',
    activeFen: ''
  };
  const restore = engine.replaceData(restoredState);
  releaseFirstWrite();
  await Promise.all([queuedOldSave, restore]);
  const afterRestore = await engine.loadData();
  assert.equal(afterRestore.localStorage.lastScreen, 'restored-account',
    'A restore must finish after older queued saves and remain the active profile.');
  assert.deepEqual(afterRestore.localStorage.dailyPuzzleProgress, { version: 3 });

  // A cloud snapshot must wait for accepted local writes instead of uploading stale state.
  let releaseSecondWrite;
  engine.writeQueue = new Promise(resolve => { releaseSecondWrite = resolve; });
  const queuedCloudSave = engine.saveData({ localStorage: { lastScreen: 'latest-before-cloud' } });
  let pushed = null;
  engine.setCloudAdapter({
    async push(snapshot) { pushed = snapshot; return { ok: true }; },
    async pull() { return restoredState; }
  });
  const cloudPush = engine.saveToCloud();
  await new Promise(resolve => setTimeout(resolve, 0));
  assert.equal(pushed, null, 'Cloud upload must wait for writes already queued in this tab.');
  releaseSecondWrite();
  await Promise.all([queuedCloudSave, cloudPush]);
  assert.equal(pushed.localStorage.lastScreen, 'latest-before-cloud',
    'The cloud adapter must receive the newest committed local profile.');

  // Import and restore must reject incomplete save envelopes rather than silently defaulting fields.
  await assert.rejects(
    engine.replaceData({ schema: 1, avatars: {} }),
    /missing required profile data/
  );
  await assert.rejects(
    engine.importSave({ format: 'glass-chess.kingpawn-save', version: 1, state: { avatars: {} } }),
    /missing required profile data/
  );

  console.log('Save-engine race tests passed: serialized restore, cloud snapshot ordering, and malformed import rejection.');
} finally {
  console.warn = previousWarn;
  if (previousStorage === undefined) delete globalThis.localStorage;
  else globalThis.localStorage = previousStorage;
}

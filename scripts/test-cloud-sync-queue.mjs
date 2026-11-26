import assert from 'node:assert/strict';
import { CloudSyncQueue } from '../src/cloud-sync-queue.js';

const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

// Repeated changes inside the debounce window coalesce into a single push.
let pushes = 0;
const debounced = new CloudSyncQueue({ run: async () => { pushes += 1; }, delayMs: 20 });
for (let index = 0; index < 5; index += 1) assert.equal(debounced.queue(), true);
await delay(60);
assert.equal(pushes, 1, 'A burst of local changes should coalesce into one cloud push.');

// A new change during an in-flight upload must cause a second latest-state push.
let releaseFirst;
let startedFirst;
const firstStarted = new Promise(resolve => { startedFirst = resolve; });
const savedValues = [];
let currentValue = 'first';
const queueDuringUpload = new CloudSyncQueue({
  delayMs: 0,
  run: async () => {
    const snapshot = currentValue;
    if (savedValues.length === 0) {
      startedFirst();
      await new Promise(resolve => { releaseFirst = resolve; });
    }
    savedValues.push(snapshot);
  }
});
queueDuringUpload.queue();
const firstFlush = queueDuringUpload.flush();
await firstStarted;
currentValue = 'second';
queueDuringUpload.queue();
releaseFirst();
await firstFlush;
assert.deepEqual(savedValues, ['first', 'second'],
  'A save queued during an upload must be pushed after the first run finishes.');

// A force-flush while another run is active must not silently return as if synced.
let releaseForce;
let forceStarted;
const forceStartedPromise = new Promise(resolve => { forceStarted = resolve; });
let forceCount = 0;
const forced = new CloudSyncQueue({
  delayMs: 0,
  run: async () => {
    forceCount += 1;
    if (forceCount === 1) {
      forceStarted();
      await new Promise(resolve => { releaseForce = resolve; });
    }
  }
});
forced.queue();
const activeForce = forced.flush();
await forceStartedPromise;
const secondForce = forced.flush({ force: true });
releaseForce();
await Promise.all([activeForce, secondForce]);
assert.equal(forceCount, 2, 'Force sync during an upload must schedule a follow-up push.');

// If the account changes during a push, the old snapshot is discarded and
// a new run is made under the currently active account.
let account = 'account-A';
let releaseAccountA;
let accountAStarted;
const accountStarted = new Promise(resolve => { accountAStarted = resolve; });
const pushedAccounts = [];
const accountQueue = new CloudSyncQueue({
  delayMs: 0,
  canRun: () => Boolean(account),
  run: async () => {
    const owner = account;
    if (owner === 'account-A') {
      accountAStarted();
      await new Promise(resolve => { releaseAccountA = resolve; });
    }
    if (owner === account) pushedAccounts.push(owner);
  }
});
accountQueue.queue();
const accountFlush = accountQueue.flush();
await accountStarted;
account = 'account-B';
accountQueue.queue();
releaseAccountA();
await accountFlush;
assert.deepEqual(pushedAccounts, ['account-B'],
  'An in-flight upload must not write a snapshot captured for a previous account.');

// Cancellation prevents delayed guest/sign-out work from firing.
let cancelledPushes = 0;
const cancelled = new CloudSyncQueue({ run: async () => { cancelledPushes += 1; }, delayMs: 20 });
cancelled.queue();
cancelled.cancel();
await delay(40);
assert.equal(cancelledPushes, 0);
assert.deepEqual(cancelled.diagnostics, { pending: false, running: false, timerScheduled: false });

console.log('Cloud sync queue tests passed: debounce, in-flight coalescing, manual flush, account-switch isolation, and cancellation.');

import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { io } from 'socket.io-client';
import { Chess } from 'chess.js';
import { setTimeout as delay } from 'node:timers/promises';

const ids = {
  queueA: '10000000-0000-4000-8000-000000000001',
  queueB: '10000000-0000-4000-8000-000000000002',
  white: '20000000-0000-4000-8000-000000000001',
  black: '20000000-0000-4000-8000-000000000002',
  friendA: '30000000-0000-4000-8000-000000000001',
  friendB: '30000000-0000-4000-8000-000000000002'
};
const START_FEN = new Chess().fen();
const connected = [];
let serverProcess;
let serverOutput = '';

async function reservePort() {
  const probe = createServer();
  await new Promise((resolve, reject) => {
    probe.once('error', reject);
    probe.listen(0, '127.0.0.1', resolve);
  });
  const port = probe.address().port;
  await new Promise(resolve => probe.close(resolve));
  return port;
}

async function waitForHealth(url) {
  let lastError;
  for (let attempt = 0; attempt < 50; attempt += 1) {
    try {
      const response = await fetch(url + '/healthz');
      if (response.ok) {
        const body = await response.json();
        assert.equal(body.ok, true);
        assert.equal(body.service, 'glass-chess-online');
        return;
      }
      lastError = new Error('Health endpoint returned ' + response.status);
    } catch (error) {
      lastError = error;
    }
    await delay(120);
  }
  throw lastError || new Error('Online server did not become healthy.');
}

async function connectClient(url) {
  const client = io(url, { transports: ['websocket'], reconnection: false, timeout: 4000 });
  connected.push(client);
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Socket connection timed out.')), 4500);
    client.once('connect', () => { clearTimeout(timer); resolve(); });
    client.once('connect_error', error => { clearTimeout(timer); reject(error); });
  });
  return client;
}

function ack(client, event, payload = {}) {
  return new Promise((resolve, reject) => {
    client.timeout(4000).emit(event, payload, (timeoutError, result) => {
      if (timeoutError) return reject(new Error(event + ' acknowledgement timed out.'));
      resolve(result);
    });
  });
}

function nextEvent(client, event, predicate = () => true, timeoutMs = 4000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      client.off(event, handler);
      reject(new Error('Timed out waiting for ' + event));
    }, timeoutMs);
    const handler = value => {
      if (!predicate(value)) return;
      clearTimeout(timer);
      client.off(event, handler);
      resolve(value);
    };
    client.on(event, handler);
  });
}

try {
  const port = await reservePort();
  const url = `http://127.0.0.1:${port}`;
  serverProcess = spawn(process.execPath, ['server.mjs'], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      PORT: String(port),
      HOST: '127.0.0.1',
      GC_INVITE_TTL_MS: '5000',
      GC_ENDED_ROOM_TTL_MS: '1500',
      OPENAI_API_KEY: '',
      GC_ALLOWED_ORIGIN: '*'
    },
    stdio: ['ignore', 'pipe', 'pipe']
  });
  serverProcess.stdout.on('data', chunk => { serverOutput += chunk.toString(); });
  serverProcess.stderr.on('data', chunk => { serverOutput += chunk.toString(); });

  await waitForHealth(url);
  const missingRoute = await fetch(url + '/missing');
  assert.equal(missingRoute.status, 404, 'Unknown HTTP routes should not masquerade as health checks.');

  // General questions are no longer blocked by a chess-only filter. Without a provider key,
  // both general and chess questions report missing server configuration honestly.
  const generalQuestionResponse = await fetch(url + '/api/king-pawn', {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: 'https://glass-chess-pro.onrender.com' },
    body: JSON.stringify({ question: 'Dogs or cats?' })
  });
  assert.equal(generalQuestionResponse.status, 503);
  assert.match((await generalQuestionResponse.json()).error, /not configured/i);
  assert.match((await fetch(url + '/api/king-pawn', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ question: 'What is science?' }) })).status.toString(), /^503$/, 'Missing AI configuration must be reported by the online server, not as an internet issue.');

  const timeQuestionResponse = await fetch(url + '/api/king-pawn', {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: 'https://glass-chess-pro.onrender.com' },
    body: JSON.stringify({ question: 'What time is it?' })
  });
  assert.equal(timeQuestionResponse.status, 503);
  assert.match((await timeQuestionResponse.json()).error, /not configured/i);

  // A valid chess question also reaches the AI setup and reports missing server configuration honestly.
  const missingAIKey = await fetch(url + '/api/king-pawn', {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: 'https://glass-chess-pro.onrender.com' },
    body: JSON.stringify({ question: 'How do I get better at chess?', board: { fen: START_FEN } })
  });
  assert.equal(missingAIKey.status, 503);
  assert.match((await missingAIKey.json()).error, /not configured/i);

  const preflight = await fetch(url + '/api/king-pawn', {
    method: 'OPTIONS',
    headers: { origin: 'https://glass-chess-pro.onrender.com', 'access-control-request-method': 'POST' }
  });
  assert.equal(preflight.status, 204);
  assert.equal(preflight.headers.get('access-control-allow-origin'), '*');

  // Verify queue cancellation and duplicate player protection.
  const queueA = await connectClient(url);
  const queueB = await connectClient(url);
  const waiting = await ack(queueA, 'queue:join', { playerId: ids.queueA, name: 'Queue A' });
  assert.equal(waiting?.ok, true);
  assert.equal(waiting?.waiting, true);
  const duplicate = await ack(queueB, 'queue:join', { playerId: ids.queueA, name: 'Duplicate' });
  assert.equal(duplicate?.ok, false, 'One player identity must not hold two queue tickets.');
  const cancelled = await ack(queueA, 'queue:cancel');
  assert.equal(cancelled?.ok, true);
  assert.equal(cancelled?.cancelled, true);
  const retryQueue = await ack(queueB, 'queue:join', { playerId: ids.queueB, name: 'Queue B' });
  assert.equal(retryQueue?.waiting, true);
  const retryCancel = await ack(queueB, 'queue:cancel');
  assert.equal(retryCancel?.cancelled, true);

  // Verify two distinct players are matched and the server controls move legality.
  const playerA = await connectClient(url);
  const playerB = await connectClient(url);
  const playerAWaiting = await ack(playerA, 'queue:join', { playerId: ids.white, name: 'Player A' });
  assert.equal(playerAWaiting?.waiting, true);
  const foundForA = nextEvent(playerA, 'match:found');
  const matchedForB = await ack(playerB, 'queue:join', { playerId: ids.black, name: 'Player B' });
  assert.equal(matchedForB?.ok, true);
  assert.equal(matchedForB?.matched, true);
  const foundA = await foundForA;
  assert.equal(foundA.code, matchedForB.code);
  assert.equal(typeof foundA.resumeToken, 'string');
  assert.equal(typeof matchedForB.resumeToken, 'string');
  assert.notEqual(foundA.resumeToken, matchedForB.resumeToken, 'Each player must receive a distinct resume credential.');

  const white = matchedForB.role === 'w' ? playerB : playerA;
  const black = matchedForB.role === 'b' ? playerB : playerA;
  const whiteId = matchedForB.role === 'w' ? ids.black : ids.white;
  const whiteToken = matchedForB.role === 'w' ? matchedForB.resumeToken : foundA.resumeToken;
  const blackToken = matchedForB.role === 'b' ? matchedForB.resumeToken : foundA.resumeToken;
  const secondRoomAttempt = await ack(white, 'room:create', { playerId: whiteId, name: 'Player A Again' });
  assert.equal(secondRoomAttempt?.ok, false, 'An active player must not create a second room from the same socket.');

  const outOfTurn = await ack(black, 'game:move', {
    code: matchedForB.code, expectedPly: 0, expectedFen: START_FEN,
    move: { from: 'e7', to: 'e5' }
  });
  assert.equal(outOfTurn?.ok, false, 'The server must reject moves from the side that is not to move.');

  const stateAfterWhiteMove = nextEvent(black, 'room:state', value => value?.history?.length === 1);
  const whiteMove = await ack(white, 'game:move', {
    code: matchedForB.code, expectedPly: 0, expectedFen: START_FEN,
    move: { from: 'e2', to: 'e4' }
  });
  assert.equal(whiteMove?.ok, true, 'The server should accept a legal move.');
  assert.equal(whiteMove.move.san, 'e4');
  const afterMove = await stateAfterWhiteMove;
  const expectedGame = new Chess();
  expectedGame.move('e4');
  assert.equal(afterMove.fen, expectedGame.fen(), 'The broadcast state must match the authoritative chess engine.');

  const staleMove = await ack(white, 'game:move', {
    code: matchedForB.code, expectedPly: 0, expectedFen: START_FEN,
    move: { from: 'd2', to: 'd4' }
  });
  assert.equal(staleMove?.ok, false, 'A stale expected ply must be rejected.');
  const missingPly = await ack(black, 'game:move', {
    code: matchedForB.code, expectedFen: expectedGame.fen(),
    move: { from: 'e7', to: 'e5' }
  });
  assert.equal(missingPly?.ok, false, 'A move without an expected ply must be rejected.');

  // A dropped socket gets a grace period and can recover the same game with its token.
  const reconnectSide = 'w';
  const reconnectId = matchedForB.role === 'w' ? ids.black : ids.white;
  const reconnectToken = matchedForB.role === 'w' ? matchedForB.resumeToken : foundA.resumeToken;
  const remainingSide = matchedForB.role === 'w' ? playerA : playerB;
  const disconnectedState = nextEvent(remainingSide, 'room:state', value => value?.players?.[reconnectSide]?.connected === false);
  (matchedForB.role === 'w' ? playerB : playerA).disconnect();
  await disconnectedState;
  const resumedClient = await connectClient(url);
  const invalidResume = await ack(resumedClient, 'room:resume', {
    code: matchedForB.code, playerId: reconnectId, resumeToken: 'invalid-token'
  });
  assert.equal(invalidResume?.ok, false, 'A reconnect without the server-issued token must fail.');
  const resumed = await ack(resumedClient, 'room:resume', {
    code: matchedForB.code, playerId: reconnectId, resumeToken: reconnectToken
  });
  assert.equal(resumed?.ok, true, 'A player should resume within the disconnect grace window.');
  assert.equal(resumed.role, reconnectSide);
  assert.equal(resumed.state.fen, expectedGame.fen());
  assert.equal(resumed.state.players[reconnectSide].connected, true);

  // Friend links create an eight-character room and return independent credentials.
  const friendA = await connectClient(url);
  const friendB = await connectClient(url);
  const created = await ack(friendA, 'room:create', { playerId: ids.friendA, name: 'Friend A' });
  assert.equal(created?.ok, true);
  const activePlayerInviteAttempt = await ack(resumedClient, 'room:join', { code: created.code, playerId: whiteId, name: 'Player Already Playing' });
  assert.equal(activePlayerInviteAttempt?.ok, false, 'An active player must not take a seat in a second room.');
  assert.match(created.code, /^[A-Z0-9]{8}$/);
  assert.equal(typeof created.resumeToken, 'string');
  const accepted = await ack(friendB, 'room:join', { code: created.code, playerId: ids.friendB, name: 'Friend B' });
  assert.equal(accepted?.ok, true);
  assert.equal(accepted.role, 'b');
  assert.equal(typeof accepted.resumeToken, 'string');
  const friendMove = await ack(friendA, 'game:move', {
    code: created.code, expectedPly: 0, expectedFen: START_FEN,
    move: { from: 'e2', to: 'e4' }
  });
  assert.equal(friendMove?.ok, true, 'An accepted friend challenge must be playable.');

  // Chat has a per-socket burst limit to stop spam from flooding a room.
  for (let index = 0; index < 8; index += 1) {
    const message = await ack(friendA, 'chat:send', { text: 'Test message ' + index });
    assert.equal(message?.ok, true);
  }
  const throttledMessage = await ack(friendA, 'chat:send', { text: 'One message too many' });
  assert.equal(throttledMessage?.ok, false, 'The server should rate-limit chat bursts.');

  // Leaving an active two-player game forfeits instead of opening the seat to strangers.
  const abandonedState = nextEvent(friendB, 'room:state', value => value?.abandoned === true);
  const endedRoomPromise = nextEvent(friendB, 'room:expired', value => value?.code === created.code, 4000);
  const leaveResult = await ack(friendA, 'room:leave');
  const reusedIdentityRoom = await ack(friendA, 'room:create', { playerId: ids.friendA, name: 'New Friend Room' });
  assert.equal(reusedIdentityRoom?.ok, true, 'A player who left a forfeited room may start a new room immediately.');
  assert.equal(leaveResult?.ok, true);
  const abandoned = await abandonedState;
  assert.match(abandoned.result, /Black wins by disconnection/, 'The opponent should win when White leaves an active game.');
  const friendPosition = new Chess();
  friendPosition.move('e4');
  const postForfeitMove = await ack(friendB, 'game:move', {
    code: created.code, expectedPly: 1, expectedFen: friendPosition.fen(),
    move: { from: 'e7', to: 'e5' }
  });
  assert.equal(postForfeitMove?.ok, false, 'A forfeited game must reject later moves.');
  const intruder = await connectClient(url);
  const intruderJoin = await ack(intruder, 'room:join', {
    code: created.code, playerId: '40000000-0000-4000-8000-000000000001', name: 'Intruder'
  });
  assert.equal(intruderJoin?.ok, false, 'A player must not occupy a seat after the game has ended.');

  // Ended rooms must be deleted after the retention window, not accumulate forever.
  const endedRoom = await endedRoomPromise;
  assert.equal(endedRoom.reason, 'game-ended');
  const duplicateOwner = await connectClient(url);
  const duplicateOwnerRoom = await ack(duplicateOwner, 'room:create', { playerId: ids.friendA, name: 'Duplicate Owner' });
  assert.equal(duplicateOwnerRoom?.ok, false, 'Expiring an older room must not clear a newer active-player lock.');
  assert.equal((await ack(friendA, 'room:leave'))?.ok, true, 'The replacement invitation should close cleanly.');
  const deletedRoomJoin = await ack(intruder, 'room:join', {
    code: created.code, playerId: '40000000-0000-4000-8000-000000000001', name: 'Late Guest'
  });
  assert.equal(deletedRoomJoin?.ok, false);
  assert.match(deletedRoomJoin?.error || '', /Room not found/);

  // An invitation with no second player must also expire automatically.
  const unusedInvite = await ack(friendB, 'room:create', { playerId: ids.friendB, name: 'Unused Invite' });
  assert.equal(unusedInvite?.ok, true);
  const expiredInvite = await nextEvent(friendB, 'room:expired', value => value?.code === unusedInvite.code, 7000);
  assert.equal(expiredInvite.reason, 'invitation-expired');
  const lateInviteJoin = await ack(intruder, 'room:join', {
    code: unusedInvite.code, playerId: '40000000-0000-4000-8000-000000000001', name: 'Late Guest'
  });
  assert.equal(lateInviteJoin?.ok, false);

  // Repetition must end the authoritative game as a draw and publish gameOver.
  const drawRoom = await ack(friendB, 'room:create', { playerId: ids.friendB, name: 'Draw Test' });
  assert.equal(drawRoom?.ok, true);
  const drawGuest = await ack(intruder, 'room:join', {
    code: drawRoom.code, playerId: '40000000-0000-4000-8000-000000000003', name: 'Draw Guest'
  });
  assert.equal(drawGuest?.ok, true);
  const drawGame = new Chess();
  const repetitionLine = [
    ['g1', 'f3'], ['g8', 'f6'], ['f3', 'g1'], ['f6', 'g8'],
    ['g1', 'f3'], ['g8', 'f6'], ['f3', 'g1'], ['f6', 'g8']
  ];
  const drawStatePromise = nextEvent(drawGuest ? intruder : friendB, 'room:state', value => value?.gameOver === true);
  const drawRoomExpired = nextEvent(friendB, 'room:expired', value => value?.code === drawRoom.code, 4000);
  for (let index = 0; index < repetitionLine.length; index += 1) {
    const [from, to] = repetitionLine[index];
    const player = index % 2 === 0 ? friendB : intruder;
    const expectedFen = drawGame.fen();
    const expectedPly = drawGame.history().length;
    const response = await ack(player, 'game:move', {
      code: drawRoom.code, expectedPly, expectedFen, move: { from, to }
    });
    assert.equal(response?.ok, true, 'The repetition line must be legal at ply ' + (index + 1));
    assert.ok(drawGame.move({ from, to }));
  }
  assert.ok(drawGame.isThreefoldRepetition());
  const drawnState = await drawStatePromise;
  assert.equal(drawnState.gameOver, true);
  assert.equal(drawnState.draw, true);
  assert.equal(drawnState.result, 'Draw');
  const drawnRoomExpiry = await drawRoomExpired;
  assert.equal(drawnRoomExpiry.reason, 'game-ended');

  console.log('Online integration tests passed: health, matchmaking, queue cancellation, legal/stale moves, reconnect, friend invites, chat throttling, forfeits, room/invite expiry, and threefold-repetition draws.');

} catch (error) {
  console.error(error);
  if (serverOutput) console.error('Online server output:\n' + serverOutput);
  if (serverProcess && !serverProcess.killed) serverProcess.kill('SIGTERM');
  process.exitCode = 1;
} finally {
  for (const client of connected) {
    try { client.disconnect(); } catch {}
  }
  if (serverProcess) {
    if (!serverProcess.killed) serverProcess.kill('SIGTERM');
    await Promise.race([
      new Promise(resolve => {
        if (serverProcess.exitCode !== null) resolve();
        else serverProcess.once('exit', resolve);
      }),
      delay(1000)
    ]);
  }
}

import http from 'node:http';
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { Server } from 'socket.io';
import { Chess } from 'chess.js';
import { MatchmakingQueue } from './src/matchmaking-queue.js';

const PORT = Number(process.env.PORT || 3001);
const HOST = process.env.HOST || '0.0.0.0';
const rooms = new Map();
const matchmaking = new MatchmakingQueue();
const activePlayers = new Map();
const INVITE_TTL_MS = Math.max(100, Number(process.env.GC_INVITE_TTL_MS) || 15 * 60 * 1000);
const DISCONNECT_GRACE_MS = 30 * 1000;
const ENDED_ROOM_TTL_MS = Math.max(100, Number(process.env.GC_ENDED_ROOM_TTL_MS) || 60 * 60 * 1000);
const RATE_LIMITS = {
  'queue:join': { limit: 3, windowMs: 10000 },
  'room:create': { limit: 5, windowMs: 60000 },
  'room:join': { limit: 6, windowMs: 10000 },
  'game:move': { limit: 8, windowMs: 10000 },
  'chat:send': { limit: 8, windowMs: 10000 }
};
const httpServer = http.createServer((req, res) => {
  if (req.method === 'GET' && (req.url === '/healthz' || req.url === '/')) {
    res.writeHead(200, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
    res.end(JSON.stringify({ ok: true, service: 'glass-chess-online', uptimeSeconds: Math.floor(process.uptime()) }));
    return;
  }
  res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
  res.end('Not found');
});
const io = new Server(httpServer, {
  cors: {
    origin: process.env.GC_ALLOWED_ORIGIN || '*',
    methods: ['GET', 'POST']
  },
  maxHttpBufferSize: 1e5,
  pingInterval: 25000,
  pingTimeout: 20000
});

const cleanName = value => String(value || 'Player').replace(/[<>\u0000-\u001f]/g, '').trim().slice(0, 20) || 'Player';
const cleanCode = value => String(value || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8);
const cleanPlayerId = value => {
  const id = String(value || '').trim().toLowerCase();
  return /^[a-f0-9-]{32,36}$/.test(id) ? id : '';
};
const hashResumeToken = token => createHash('sha256').update(String(token || '')).digest();
const issueResumeToken = () => randomBytes(32).toString('base64url');
const isResumeTokenValid = (storedHash, token) => {
  if (!storedHash || typeof token !== 'string' || token.length < 32) return false;
  const stored = Buffer.from(storedHash, 'hex');
  const supplied = hashResumeToken(token);
  return stored.length === supplied.length && timingSafeEqual(stored, supplied);
};
const allowRate = (socket, eventName) => {
  const rule = RATE_LIMITS[eventName];
  if (!rule) return true;
  const now = Date.now();
  const buckets = socket.data.rateLimitBuckets ||= new Map();
  let bucket = buckets.get(eventName);
  if (!bucket || now >= bucket.resetAt) {
    bucket = { count: 0, resetAt: now + rule.windowMs };
    buckets.set(eventName, bucket);
  }
  bucket.count += 1;
  return bucket.count <= rule.limit;
};
const publicRoom = room => ({
  code: room.code,
  players: {
    w: room.players.w ? { name: room.players.w.name, connected: Boolean(room.players.w.connected) } : null,
    b: room.players.b ? { name: room.players.b.name, connected: Boolean(room.players.b.connected) } : null
  },
  spectators: room.spectators.size,
  abandoned: Boolean(room.abandoned),
  history: room.game.history({ verbose: true }).map(move => ({
    from: move.from,
    to: move.to,
    promotion: move.promotion,
    san: move.san,
    color: move.color
  })),
  fen: room.game.fen(),
  pgn: room.game.pgn(),
  turn: room.game.turn(),
  check: room.game.isCheck(),
  checkmate: room.game.isCheckmate(),
  draw: room.game.isDraw(),
  gameOver: room.game.isGameOver(),
  resigned: room.resigned,
  lastMove: room.lastMove || null,
  invitationExpiresAt: room.invitationExpiresAt || null,
  result: room.abandoned ? `${room.abandoned === 'w' ? 'Black' : 'White'} wins by disconnection` :
    room.resigned ? `${room.resigned === 'w' ? 'Black' : 'White'} wins by resignation` :
    room.game.isCheckmate() ? `${room.game.turn() === 'w' ? 'Black' : 'White'} wins by checkmate` :
    room.game.isDraw() ? 'Draw' : 'In progress'
});

function codeAvailable() {
  const alphabet = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  let code;
  do {
    code = '';
    while (code.length < 8) {
      const byte = randomBytes(1)[0];
      if (byte < 252) code += alphabet[byte % alphabet.length];
    }
  } while (rooms.has(code));
  return code;
}

function expireRoom(room, reason = 'expired') {
  if (!room || rooms.get(room.code) !== room) return false;
  if (room.inviteTimer) clearTimeout(room.inviteTimer);
  if (room.cleanupTimer) clearTimeout(room.cleanupTimer);
  for (const player of Object.values(room.players || {})) {
    if (player?.disconnectTimer) clearTimeout(player.disconnectTimer);
    if (player?.playerId) activePlayers.delete(player.playerId);
  }
  const members = [...(io.sockets.adapter.rooms.get(room.code) || [])];
  for (const socketId of members) {
    const client = io.sockets.sockets.get(socketId);
    if (!client) continue;
    client.emit('room:expired', { code: room.code, reason });
    client.leave(room.code);
    if (client.data.roomCode === room.code) {
      client.data.roomCode = null;
      client.data.role = null;
    }
  }
  rooms.delete(room.code);
  return true;
}

function scheduleRoomCleanup(room, reason = 'game-ended') {
  if (!room || rooms.get(room.code) !== room) return;
  if (room.cleanupTimer) clearTimeout(room.cleanupTimer);
  room.cleanupTimer = setTimeout(() => expireRoom(room, reason), ENDED_ROOM_TTL_MS);
  room.cleanupTimer.unref?.();
}

function scheduleInviteExpiry(room) {
  if (!room?.invitationExpiresAt) return;
  if (room.inviteTimer) clearTimeout(room.inviteTimer);
  room.inviteTimer = setTimeout(() => {
    if (rooms.get(room.code) === room && !room.players.b) expireRoom(room, 'invitation-expired');
  }, Math.max(0, room.invitationExpiresAt - Date.now()));
  room.inviteTimer.unref?.();
}

function broadcast(room) {
  if (room.abandoned || room.resigned || room.game.isGameOver()) {
    scheduleRoomCleanup(room, 'game-ended');
  }
  io.to(room.code).emit('room:state', publicRoom(room));
}

function createMatchedRoom(firstSocket, firstPlayer, secondSocket, secondPlayer) {
  const code = codeAvailable();
  const firstIsWhite = randomBytes(1)[0] % 2 === 0;
  const whiteSocket = firstIsWhite ? firstSocket : secondSocket;
  const blackSocket = firstIsWhite ? secondSocket : firstSocket;
  const whitePlayer = firstIsWhite ? firstPlayer : secondPlayer;
  const blackPlayer = firstIsWhite ? secondPlayer : firstPlayer;
  const whiteResumeToken = issueResumeToken();
  const blackResumeToken = issueResumeToken();
  const room = {
    code,
    ownerId: whiteSocket.id,
    ownerPlayerId: whitePlayer.playerId,
    players: {
      w: { id: whiteSocket.id, playerId: whitePlayer.playerId, name: whitePlayer.name, connected: true, resumeTokenHash: hashResumeToken(whiteResumeToken).toString('hex') },
      b: { id: blackSocket.id, playerId: blackPlayer.playerId, name: blackPlayer.name, connected: true, resumeTokenHash: hashResumeToken(blackResumeToken).toString('hex') }
    },
    spectators: new Map(),
    game: new Chess(),
    resigned: null,
    abandoned: null
  };
  rooms.set(code, room);
  activePlayers.set(whitePlayer.playerId, code);
  activePlayers.set(blackPlayer.playerId, code);
  for (const [client, role] of [[whiteSocket, 'w'], [blackSocket, 'b']]) {
    client.join(code);
    client.data.roomCode = code;
    client.data.role = role;
    client.data.matchmaking = false;
  }
  return { room, whiteSocket, blackSocket, whiteResumeToken, blackResumeToken };
}

function removeSocketFromRoom(socket, { disconnected = false } = {}) {
  matchmaking.remove(socket.id);
  socket.data.matchmaking = false;
  const code = socket.data.roomCode;
  if (!code) return;
  const room = rooms.get(code);
  if (room) {
    for (const side of ['w', 'b']) {
      const player = room.players[side];
      if (player?.id !== socket.id) continue;
      if (disconnected) {
        player.id = null;
        player.connected = false;
        player.disconnectedAt = Date.now();
        if (player.disconnectTimer) clearTimeout(player.disconnectTimer);
        const playerId = player.playerId;
        if (room.abandoned || room.resigned || room.game.isGameOver()) {
          player.disconnectTimer = null;
          activePlayers.delete(playerId);
        } else {
          player.disconnectTimer = setTimeout(() => {
            const current = rooms.get(code);
            const currentPlayer = current?.players[side];
            if (!current || currentPlayer?.playerId !== playerId || currentPlayer.connected || current.abandoned || current.resigned || current.game.isGameOver()) return;
            current.abandoned = side;
            currentPlayer.disconnectTimer = null;
            activePlayers.delete(playerId);
            broadcast(current);
          }, DISCONNECT_GRACE_MS);
          player.disconnectTimer.unref?.();
        }
      } else {
        if (player.disconnectTimer) clearTimeout(player.disconnectTimer);
        activePlayers.delete(player.playerId);
        room.players[side] = null;
      }
    }
    room.spectators.delete(socket.id);
    broadcast(room);
    if ((!room.players.w || !room.players.w.connected) && (!room.players.b || !room.players.b.connected) && room.spectators.size === 0) {
      scheduleRoomCleanup(room, 'empty-room');
    }
  }
  socket.leave(code);
  socket.data.roomCode = null;
  socket.data.role = null;
}

io.on('connection', socket => {
  socket.on('queue:join', (payload = {}, done = () => {}) => {
    if (!allowRate(socket, 'queue:join')) return done({ ok: false, error: 'Too many matchmaking requests. Wait a few seconds and try again.' });
    if (socket.data.roomCode) return done({ ok: false, error: 'Leave your current game before finding another opponent.' });
    const playerId = cleanPlayerId(payload.playerId);
    if (!playerId) return done({ ok: false, error: 'A valid player identity is required. Refresh the page and try again.' });
    if (activePlayers.has(playerId)) return done({ ok: false, error: 'You are already in an online game.' });
    const player = { socketId: socket.id, playerId, name: cleanName(payload.name) };
    const result = matchmaking.enqueue(player);
    if (result.status === 'already_queued') return done({ ok: false, error: 'This player is already searching for an opponent in another tab.' });
    if (result.status !== 'matched') {
      socket.data.matchmaking = true;
      return done({ ok: true, waiting: true, queuedPlayers: matchmaking.size });
    }
    const opponentSocket = io.sockets.sockets.get(result.opponent.socketId);
    if (!opponentSocket?.connected) {
      matchmaking.remove(result.opponent.socketId);
      const retry = matchmaking.enqueue(player);
      socket.data.matchmaking = retry.status === 'waiting';
      return done({ ok: true, waiting: true, queuedPlayers: matchmaking.size });
    }
    const { room, whiteSocket, blackSocket, whiteResumeToken, blackResumeToken } = createMatchedRoom(socket, player, opponentSocket, result.opponent);
    const state = publicRoom(room);
    const joiningRole = socket.id === whiteSocket.id ? 'w' : 'b';
    const opponentRole = joiningRole === 'w' ? 'b' : 'w';
    const joiningResumeToken = joiningRole === 'w' ? whiteResumeToken : blackResumeToken;
    const opponentResumeToken = opponentRole === 'w' ? whiteResumeToken : blackResumeToken;
    done({ ok: true, waiting: false, matched: true, code: room.code, role: joiningRole, resumeToken: joiningResumeToken, state });
    opponentSocket.emit('match:found', { code: room.code, role: opponentRole, resumeToken: opponentResumeToken, state });
    broadcast(room);
  });

  socket.on('queue:cancel', (_payload = {}, done = () => {}) => {
    const removed = matchmaking.remove(socket.id);
    socket.data.matchmaking = false;
    done({ ok: true, cancelled: removed });
  });

  socket.on('room:resume', (payload = {}, done = () => {}) => {
    const code = cleanCode(payload.code);
    const room = rooms.get(code);
    if (!room || room.abandoned) return done({ ok: false, error: 'This online game can no longer be resumed.' });
    const playerId = cleanPlayerId(payload.playerId);
    const side = ['w', 'b'].find(candidate => room.players[candidate]?.playerId === playerId);
    const player = side ? room.players[side] : null;
    if (!player || !isResumeTokenValid(player.resumeTokenHash, payload.resumeToken)) {
      return done({ ok: false, error: 'The reconnect session is invalid or expired. Ask your opponent for a new invitation.' });
    }
    if (player.id && player.id !== socket.id) return done({ ok: false, error: 'This player is already connected in another session.' });
    if (player.disconnectTimer) clearTimeout(player.disconnectTimer);
    player.disconnectTimer = null;
    player.id = socket.id;
    player.connected = true;
    player.disconnectedAt = null;
    if (room.ownerPlayerId === playerId) room.ownerId = socket.id;
    socket.join(code);
    socket.data.roomCode = code;
    socket.data.role = side;
    done({ ok: true, code, role: side, resumeToken: payload.resumeToken, state: publicRoom(room) });
    broadcast(room);
  });

  socket.on('room:create', (payload = {}, done = () => {}) => {
    if (!allowRate(socket, 'room:create')) return done({ ok: false, error: 'Too many rooms created. Wait a minute and try again.' });
    if (socket.data.roomCode) return done({ ok: false, error: 'Leave your current online game before creating another room.' });
    const playerId = cleanPlayerId(payload.playerId);
    if (!playerId) return done({ ok: false, error: 'A valid local player identity is required. Refresh the page and try again.' });
    if (activePlayers.has(playerId)) return done({ ok: false, error: 'You are already in an online game.' });
    const code = codeAvailable();
    const resumeToken = issueResumeToken();
    const room = {
      code,
      ownerId: socket.id,
      ownerPlayerId: playerId,
      players: { w: { id: socket.id, playerId, name: cleanName(payload.name), connected: true, resumeTokenHash: hashResumeToken(resumeToken).toString('hex') }, b: null },
      spectators: new Map(),
      game: new Chess(),
      resigned: null,
      abandoned: null,
      invitationExpiresAt: Date.now() + INVITE_TTL_MS,
      inviteTimer: null,
      cleanupTimer: null
    };
    rooms.set(code, room);
    scheduleInviteExpiry(room);
    activePlayers.set(playerId, code);
    socket.join(code);
    socket.data.roomCode = code;
    socket.data.role = 'w';
    done({ ok: true, code, role: 'w', resumeToken, state: publicRoom(room) });
    broadcast(room);
  });

  socket.on('room:join', (payload = {}, done = () => {}) => {
    if (!allowRate(socket, 'room:join')) return done({ ok: false, error: 'Too many room attempts. Wait a few seconds and try again.' });
    const code = cleanCode(payload.code);
    const room = rooms.get(code);
    if (!room) return done({ ok: false, error: 'Room not found. Check the code.' });
    if (room.abandoned) return done({ ok: false, error: 'This game has already ended.' });
    if (room.invitationExpiresAt && Date.now() >= room.invitationExpiresAt && !room.players.b) {
      expireRoom(room, 'invitation-expired');
      return done({ ok: false, error: 'This invitation has expired. Ask your friend to create a new one.' });
    }
    if (room.players.w?.id === socket.id) return done({ ok: true, code, role: 'w', state: publicRoom(room) });
    if (room.players.b?.id === socket.id) return done({ ok: true, code, role: 'b', state: publicRoom(room) });
    const playerId = cleanPlayerId(payload.playerId);
    if (!playerId) return done({ ok: false, error: 'A valid local player identity is required. Refresh the page and try again.' });
    if (room.players.w?.playerId === playerId || room.players.b?.playerId === playerId) {
      return done({ ok: false, error: 'This browser is already assigned to the other seat. Open the invite on a different device or browser profile.' });
    }
    if (room.players.b) return done({ ok: false, error: 'That room already has two players. Join as a spectator instead.' });
    if (socket.data.roomCode && socket.data.roomCode !== code) return done({ ok: false, error: 'Leave your current room before joining another game.' });
    if (activePlayers.has(playerId)) return done({ ok: false, error: 'You are already in an online game.' });
    removeSocketFromRoom(socket);
    const resumeToken = issueResumeToken();
    room.players.b = { id: socket.id, playerId, name: cleanName(payload.name), connected: true, resumeTokenHash: hashResumeToken(resumeToken).toString('hex') };
    if (room.inviteTimer) clearTimeout(room.inviteTimer);
    room.inviteTimer = null;
    room.invitationExpiresAt = null;
    activePlayers.set(playerId, code);
    socket.join(code);
    socket.data.roomCode = code;
    socket.data.role = 'b';
    done({ ok: true, code, role: 'b', resumeToken, state: publicRoom(room) });
    broadcast(room);
  });

  socket.on('room:spectate', (payload = {}, done = () => {}) => {
    const code = cleanCode(payload.code);
    const room = rooms.get(code);
    if (!room) return done({ ok: false, error: 'Room not found. Check the code.' });
    if (socket.data.roomCode && (socket.data.roomCode !== code || socket.data.role !== 'spectator')) return done({ ok: false, error: 'Leave your current game before spectating another room.' });
    removeSocketFromRoom(socket);
    room.spectators.set(socket.id, cleanName(payload.name));
    socket.join(code);
    socket.data.roomCode = code;
    socket.data.role = 'spectator';
    done({ ok: true, code, role: 'spectator', state: publicRoom(room) });
    broadcast(room);
  });

  socket.on('game:move', (payload = {}, done = () => {}) => {
    if (!allowRate(socket, 'game:move')) return done({ ok: false, error: 'Moves are arriving too quickly. Please try again.' });
    const room = rooms.get(cleanCode(payload.code || socket.data.roomCode));
    if (!room || socket.data.roomCode !== room.code) return done({ ok: false, error: 'You are not in that room.' });
    if (room.abandoned || room.resigned || room.game.isGameOver()) return done({ ok: false, error: 'This game has ended.' });
    if (!Number.isInteger(payload.expectedPly) || payload.expectedPly !== room.game.history().length) {
      return done({ ok: false, error: 'The position changed. Sync the board before trying again.' });
    }
    if (typeof payload.expectedFen === 'string' && payload.expectedFen && payload.expectedFen !== room.game.fen()) {
      return done({ ok: false, error: 'Your board is out of date. Sync the current position before moving.' });
    }
    const side = ['w', 'b'].find(candidate => room.players[candidate]?.id === socket.id);
    if (!side) return done({ ok: false, error: 'Spectators cannot move pieces.' });
    if (room.game.turn() !== side) return done({ ok: false, error: 'It is not your turn.' });
    const move = payload.move || {};
    if (!/^[a-h][1-8]$/.test(move.from || '') || !/^[a-h][1-8]$/.test(move.to || '')) {
      return done({ ok: false, error: 'Invalid square coordinates.' });
    }
    try {
      const movingPiece = room.game.get(move.from);
      const isCastle = movingPiece?.type === 'k' && Math.abs(move.to.charCodeAt(0) - move.from.charCodeAt(0)) === 2;
      const legalMove = { from: move.from, to: move.to };
      if (['q', 'r', 'b', 'n'].includes(move.promotion)) legalMove.promotion = move.promotion;
      const applied = room.game.move(legalMove);
      room.lastMove = {
        ply: room.game.history().length,
        from: applied.from, to: applied.to, san: applied.san,
        uci: applied.from + applied.to + (applied.promotion || ''),
        color: applied.color,
        fx: {
          isCapture: Boolean(applied.captured),
          capturedPiece: applied.captured || null,
          isCheck: room.game.isCheck(),
          isCheckmate: room.game.isCheckmate(),
          isCastle
        }
      };
      done({ ok: true, move: room.lastMove });
      broadcast(room);
    } catch {
      done({ ok: false, error: 'That move is not legal in the server position.' });
    }
  });

  socket.on('room:resign', (_payload = {}, done = () => {}) => {
    const room = rooms.get(socket.data.roomCode);
    if (!room) return done({ ok: false, error: 'You are not in a room.' });
    if (room.abandoned || room.resigned || room.game.isGameOver()) return done({ ok: false, error: 'This game has already ended.' });
    const side = ['w', 'b'].find(candidate => room.players[candidate]?.id === socket.id);
    if (!side) return done({ ok: false, error: 'Only players can resign.' });
    room.resigned = side;
    done({ ok: true });
    broadcast(room);
  });

  socket.on('room:rematch', (_payload = {}, done = () => {}) => {
    const room = rooms.get(socket.data.roomCode);
    const side = room && ['w', 'b'].find(candidate => room.players[candidate]?.id === socket.id);
    if (!room || !side || room.ownerPlayerId !== room.players[side].playerId) return done({ ok: false, error: 'Only the room creator can start a rematch.' });
    if (!room.resigned && !room.abandoned && !room.game.isGameOver()) return done({ ok: false, error: 'Finish the current game before starting a rematch.' });
    if (!room.players.w?.connected || !room.players.b?.connected) return done({ ok: false, error: 'Both players must be connected to start a rematch.' });
    if (room.cleanupTimer) clearTimeout(room.cleanupTimer);
    room.cleanupTimer = null;
    room.game = new Chess();
    room.resigned = null;
    room.abandoned = null;
    room.lastMove = null;
    done({ ok: true });
    broadcast(room);
  });

  socket.on('chat:send', (payload = {}, done = () => {}) => {
    if (!allowRate(socket, 'chat:send')) return done({ ok: false, error: 'You are sending messages too quickly. Wait a moment.' });
    const room = rooms.get(socket.data.roomCode);
    if (!room) return done({ ok: false, error: 'Join a room to chat.' });
    const text = String(payload.text || '').replace(/[<>\u0000-\u001f]/g, '').trim().slice(0, 240);
    if (!text) return done({ ok: false, error: 'Write a message first.' });
    const side = ['w', 'b'].find(candidate => room.players[candidate]?.id === socket.id);
    const name = side ? room.players[side].name : room.spectators.get(socket.id) || 'Spectator';
    const message = { name, text, time: new Date().toISOString() };
    io.to(room.code).emit('chat:message', message);
    done({ ok: true });
  });

  socket.on('room:leave', (_payload = {}, done = () => {}) => {
    const code = socket.data.roomCode;
    const room = code ? rooms.get(code) : null;
    const side = room && ['w', 'b'].find(candidate => room.players[candidate]?.id === socket.id);
    if (room && side) {
      const otherSide = side === 'w' ? 'b' : 'w';
      const leavingPlayer = room.players[side];
      if (room.players[otherSide]) {
        if (leavingPlayer.disconnectTimer) clearTimeout(leavingPlayer.disconnectTimer);
        leavingPlayer.id = null;
        leavingPlayer.connected = false;
        if (!room.abandoned && !room.resigned && !room.game.isGameOver()) room.abandoned = side;
        activePlayers.delete(leavingPlayer.playerId);
        socket.leave(code);
        socket.data.roomCode = null;
        socket.data.role = null;
        broadcast(room);
      } else {
        rooms.delete(code);
        activePlayers.delete(leavingPlayer.playerId);
        socket.leave(code);
        socket.data.roomCode = null;
        socket.data.role = null;
      }
    } else {
      removeSocketFromRoom(socket);
    }
    done({ ok: true });
  });

  socket.on('disconnect', () => removeSocketFromRoom(socket, { disconnected: true }));
});

httpServer.listen(PORT, HOST, () => {
  console.log(`Glass Chess online server listening on http://${HOST}:${PORT}`);
  console.log('Use this computer name/IP plus port 3001 for other devices on the same network.');
});

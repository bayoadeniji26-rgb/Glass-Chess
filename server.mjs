import http from 'node:http';
import { randomBytes } from 'node:crypto';
import { Server } from 'socket.io';
import { Chess } from 'chess.js';
import { MatchmakingQueue } from './src/matchmaking-queue.js';

const PORT = Number(process.env.PORT || 3001);
const HOST = process.env.HOST || '0.0.0.0';
const rooms = new Map();
const matchmaking = new MatchmakingQueue();
const activePlayers = new Map();
const INVITE_TTL_MS = 15 * 60 * 1000;
const httpServer = http.createServer((req, res) => {
  res.writeHead(200, { 'content-type': 'text/plain; charset=utf-8' });
  res.end('Glass Chess online server is running.');
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
const publicRoom = room => ({
  code: room.code,
  players: {
    w: room.players.w ? { name: room.players.w.name, connected: true } : null,
    b: room.players.b ? { name: room.players.b.name, connected: true } : null
  },
  spectators: room.spectators.size,
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
  result: room.resigned ? `${room.resigned === 'w' ? 'Black' : 'White'} wins by resignation` :
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
      if (byte < 248) code += alphabet[byte % alphabet.length];
    }
  } while (rooms.has(code));
  return code;
}

function broadcast(room) {
  io.to(room.code).emit('room:state', publicRoom(room));
}

function createMatchedRoom(firstSocket, firstPlayer, secondSocket, secondPlayer) {
  const code = codeAvailable();
  const firstIsWhite = randomBytes(1)[0] % 2 === 0;
  const whiteSocket = firstIsWhite ? firstSocket : secondSocket;
  const blackSocket = firstIsWhite ? secondSocket : firstSocket;
  const whitePlayer = firstIsWhite ? firstPlayer : secondPlayer;
  const blackPlayer = firstIsWhite ? secondPlayer : firstPlayer;
  const room = {
    code,
    ownerId: whiteSocket.id,
    players: {
      w: { id: whiteSocket.id, playerId: whitePlayer.playerId, name: whitePlayer.name },
      b: { id: blackSocket.id, playerId: blackPlayer.playerId, name: blackPlayer.name }
    },
    spectators: new Map(),
    game: new Chess(),
    resigned: null
  };
  rooms.set(code, room);
  for (const [client, role] of [[whiteSocket, 'w'], [blackSocket, 'b']]) {
    client.join(code);
    client.data.roomCode = code;
    client.data.role = role;
    client.data.matchmaking = false;
  }
  return { room, whiteSocket, blackSocket };
}

function removeSocketFromRoom(socket) {
  matchmaking.remove(socket.id);
  socket.data.matchmaking = false;
  const code = socket.data.roomCode;
  if (!code) return;
  const room = rooms.get(code);
  if (room) {
    for (const side of ['w', 'b']) {
      if (room.players[side]?.id === socket.id) {
        if (room.players[side].playerId) activePlayers.delete(room.players[side].playerId);
        room.players[side] = null;
      }
    }
    room.spectators.delete(socket.id);
    broadcast(room);
    if (!room.players.w && !room.players.b && room.spectators.size === 0) {
      setTimeout(() => {
        const current = rooms.get(code);
        if (current && !current.players.w && !current.players.b && current.spectators.size === 0) {
          for (const player of Object.values(current.players)) if (player?.playerId) activePlayers.delete(player.playerId);
          rooms.delete(code);
        }
      }, 60000);
    }
  }
  socket.leave(code);
  socket.data.roomCode = null;
  socket.data.role = null;
}

io.on('connection', socket => {
  socket.on('queue:join', (payload = {}, done = () => {}) => {
    if (socket.data.roomCode) return done({ ok: false, error: 'Leave your current game before finding another opponent.' });
    const playerId = cleanPlayerId(payload.playerId);
    if (!playerId) return done({ ok: false, error: 'A valid player identity is required. Refresh the page and try again.' });
    const player = { socketId: socket.id, playerId, name: cleanName(payload.name) };
    const result = matchmaking.enqueue(player);
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
    const { room, whiteSocket, blackSocket } = createMatchedRoom(socket, player, opponentSocket, result.opponent);
    const state = publicRoom(room);
    const joiningRole = socket.id === whiteSocket.id ? 'w' : 'b';
    const opponentRole = joiningRole === 'w' ? 'b' : 'w';
    done({ ok: true, waiting: false, matched: true, code: room.code, role: joiningRole, state });
    opponentSocket.emit('match:found', {
      code: room.code,
      role: opponentRole,
      state
    });
    broadcast(room);
  });

  socket.on('queue:cancel', (done = () => {}) => {
    const removed = matchmaking.remove(socket.id);
    socket.data.matchmaking = false;
    done({ ok: true, cancelled: removed });
  });
  socket.on('room:create', (payload = {}, done = () => {}) => {
    removeSocketFromRoom(socket);
    const playerId = cleanPlayerId(payload.playerId);
    if (!playerId) return done({ ok: false, error: 'A valid local player identity is required. Refresh the page and try again.' });
    const code = codeAvailable();
    const room = {
      code,
      ownerId: socket.id,
      players: { w: { id: socket.id, playerId, name: cleanName(payload.name) }, b: null },
      spectators: new Map(),
      game: new Chess(),
      resigned: null
    };
    rooms.set(code, room);
    socket.join(code);
    socket.data.roomCode = code;
    socket.data.role = 'w';
    done({ ok: true, code, role: 'w', state: publicRoom(room) });
    broadcast(room);
  });

  socket.on('room:join', (payload = {}, done = () => {}) => {
    const code = cleanCode(payload.code);
    const room = rooms.get(code);
    if (!room) return done({ ok: false, error: 'Room not found. Check the code.' });
    if (room.invitationExpiresAt && Date.now() > room.invitationExpiresAt && !room.players.b) {
      rooms.delete(code);
      if (room.players.w?.playerId) activePlayers.delete(room.players.w.playerId);
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
    if (activePlayers.has(playerId)) return done({ ok: false, error: 'You are already in an online game.' });
    removeSocketFromRoom(socket);
    room.players.b = { id: socket.id, playerId, name: cleanName(payload.name) };
    room.invitationExpiresAt = null;
    activePlayers.set(playerId, code);
    socket.join(code);
    socket.data.roomCode = code;
    socket.data.role = 'b';
    done({ ok: true, code, role: 'b', state: publicRoom(room) });
    broadcast(room);
  });

  socket.on('room:spectate', (payload = {}, done = () => {}) => {
    const code = cleanCode(payload.code);
    const room = rooms.get(code);
    if (!room) return done({ ok: false, error: 'Room not found. Check the code.' });
    removeSocketFromRoom(socket);
    room.spectators.set(socket.id, cleanName(payload.name));
    socket.join(code);
    socket.data.roomCode = code;
    socket.data.role = 'spectator';
    done({ ok: true, code, role: 'spectator', state: publicRoom(room) });
    broadcast(room);
  });

  socket.on('game:move', (payload = {}, done = () => {}) => {
    const room = rooms.get(cleanCode(payload.code || socket.data.roomCode));
    if (!room || socket.data.roomCode !== room.code) return done({ ok: false, error: 'You are not in that room.' });
    if (room.resigned || room.game.isGameOver()) return done({ ok: false, error: 'This game has ended.' });
    if (Number.isInteger(payload.expectedPly) && payload.expectedPly !== room.game.history().length) {
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
      const legalMove = { from: move.from, to: move.to };
      if (['q', 'r', 'b', 'n'].includes(move.promotion)) legalMove.promotion = move.promotion;
      room.game.move(legalMove);
      done({ ok: true });
      broadcast(room);
    } catch {
      done({ ok: false, error: 'That move is not legal in the server position.' });
    }
  });

  socket.on('room:resign', (done = () => {}) => {
    const room = rooms.get(socket.data.roomCode);
    if (!room) return done({ ok: false, error: 'You are not in a room.' });
    const side = ['w', 'b'].find(candidate => room.players[candidate]?.id === socket.id);
    if (!side) return done({ ok: false, error: 'Only players can resign.' });
    room.resigned = side;
    done({ ok: true });
    broadcast(room);
  });

  socket.on('room:rematch', (done = () => {}) => {
    const room = rooms.get(socket.data.roomCode);
    if (!room || room.ownerId !== socket.id) return done({ ok: false, error: 'Only the room creator can start a rematch.' });
    room.game = new Chess();
    room.resigned = null;
    done({ ok: true });
    broadcast(room);
  });

  socket.on('chat:send', (payload = {}, done = () => {}) => {
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

  socket.on('room:leave', (done = () => {}) => {
    removeSocketFromRoom(socket);
    done({ ok: true });
  });

  socket.on('disconnect', () => removeSocketFromRoom(socket));
});

httpServer.listen(PORT, HOST, () => {
  console.log(`Glass Chess online server listening on http://${HOST}:${PORT}`);
  console.log('Use this computer name/IP plus port 3001 for other devices on the same network.');
});

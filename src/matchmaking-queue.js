export class MatchmakingQueue {
  constructor() {
    this.waiting = new Map();
  }

  enqueue(player) {
    const duplicate = [...this.waiting.values()].find(candidate => candidate.playerId === player.playerId);
    if (duplicate) {
      if (duplicate.socketId === player.socketId) return { status: 'waiting', opponent: null };
      return { status: 'already_queued', opponent: null };
    }
    const opponent = [...this.waiting.values()]
      .filter(candidate => candidate.socketId !== player.socketId && candidate.playerId !== player.playerId)
      .sort((a, b) => a.joinedAt - b.joinedAt)[0];
    if (opponent) {
      this.waiting.delete(opponent.socketId);
      return { status: 'matched', opponent };
    }
    this.waiting.set(player.socketId, { ...player, joinedAt: Date.now() });
    return { status: 'waiting', opponent: null };
  }

  remove(socketId) {
    return this.waiting.delete(socketId);
  }

  hasPlayer(playerId) {
    return [...this.waiting.values()].some(candidate => candidate.playerId === playerId);
  }

  get size() {
    return this.waiting.size;
  }
}

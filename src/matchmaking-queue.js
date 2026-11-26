export class MatchmakingQueue {
  constructor() {
    this.waiting = new Map();
  }

  enqueue(player) {
    const existing = this.waiting.get(player.socketId);
    if (existing) return { status: 'waiting', opponent: null };
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

  get size() {
    return this.waiting.size;
  }
}

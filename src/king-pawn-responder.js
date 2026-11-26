/*
 * King Pawn v2 — isolated response coordinator.
 * It applies a strict chess-only boundary, supports a secure optional server adapter,
 * and always falls back to the local chess knowledge + Stockfish path.
 */
const CHESS_TERMS = /\b(chess|chaturanga|board|opening|endgame|tactic|fork|pin|skewer|check|checkmate|castl|en passant|pawn|rook|bishop|knight|queen|king|move|position|fen|pgn|grandmaster|fischer|kasparov|morphy|stalemate|promotion|opposition|lucena|philidor|gambit|sicilian|zugzwang|tempo|blunder|development|center|centre)\b/i;
const ACCEPTED_CHESS_QUESTIONS = [
  /when\s+(?:was|is|did)\s+(?:the\s+game\s+of\s+)?chess\s+(?:made|invented|created|begin|start)/i,
  /who\s+(?:invented|made|created)\s+chess/i,
  /why\s+do\s+(?:i|you|people)\s+chess/i,
  /chess\s+(?:sucks|is\s+boring|is\s+hard|is\s+fun)/i
];
const OFF_TOPIC_REPLY = 'I’m King Pawn, the chess-only advisor inside Glass Chess. I can help with chess history, rules, openings, tactics, strategy, famous games, and your current board. Try asking “When was chess made?”, “Why play chess?”, or “What should I move?”';
const SYSTEM_PROMPT = 'You are King Pawn, the chess-only advisor for Glass Chess. Answer only questions about chess: its history, rules, openings, tactics, strategy, endgames, famous players and games, training, chess opinions, and the supplied live position. Be clear, encouraging, conversational, and accurate for a beginner. Acknowledge opinions such as “chess sucks” without arguing. Distinguish official rules from strategic advice. Never invent a move, statistic, quote, or historical certainty. If a question is not about chess, politely enforce the chess-only boundary. Use the live FEN, PGN, move list, turn, check status, and material only when relevant. Never make moves for the player.';

function isChessQuestion(question) {
  const value = String(question || '').trim();
  return CHESS_TERMS.test(value) || ACCEPTED_CHESS_QUESTIONS.some(pattern => pattern.test(value));
}

function withTimeout(promise, milliseconds, controller) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => {
      controller?.abort();
      reject(new Error('King Pawn AI request timed out.'));
    }, milliseconds);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

export function createKingPawnResponder(options = {}) {
  const getContext = typeof options.getContext === 'function' ? options.getContext : () => ({});
  const getKnowledgeAnswer = typeof options.getKnowledgeAnswer === 'function' ? options.getKnowledgeAnswer : async () => '';
  const endpoint = String(import.meta.env?.VITE_KING_PAWN_AI_ENDPOINT || '').trim();
  let customAdapter = null;

  async function endpointAdapter(payload) {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ systemPrompt: payload.systemPrompt, question: payload.question, board: payload.board }),
      signal: payload.signal,
      credentials: 'same-origin'
    });
    if (!response.ok) throw new Error('The King Pawn service returned HTTP ' + response.status + '.');
    return response.json();
  }

  async function ask(input) {
    const question = String(input || '').replace(/\s+/g, ' ').trim().slice(0, 1200);
    if (!question) return 'Ask me a chess question and I’ll help you work through it.';
    if (!isChessQuestion(question)) return OFF_TOPIC_REPLY;

    let context = {};
    try { context = getContext() || {}; }
    catch (error) { console.warn('King Pawn could not read the live board:', error); }
    const board = {
      fen: String(context.fen || ''),
      pgn: String(context.pgn || '').slice(0, 12000),
      history: Array.isArray(context.history) ? context.history.slice(-160) : [],
      turn: context.turn === 'b' ? 'b' : 'w',
      gameOver: Boolean(context.gameOver),
      inCheck: Boolean(context.inCheck),
      checkState: String(context.checkState || ''),
      material: context.material && typeof context.material === 'object' ? context.material : {}
    };

    const adapter = customAdapter || (endpoint ? endpointAdapter : null);
    if (adapter) {
      const controller = new AbortController();
      try {
        const result = await withTimeout(Promise.resolve(adapter({
          systemPrompt: SYSTEM_PROMPT,
          question,
          board,
          signal: controller.signal
        })), 14000, controller);
        const answer = typeof result === 'string' ? result : result?.answer;
        if (typeof answer === 'string' && answer.trim()) return answer.trim().slice(0, 12000);
      } catch (error) {
        console.warn('King Pawn remote AI unavailable; using local response engine:', error);
      }
    }

    try {
      const local = await getKnowledgeAnswer(question, context);
      if (typeof local === 'string' && local.trim()) return local.trim().slice(0, 12000);
    } catch (error) {
      console.error('King Pawn local response engine failed:', error);
    }
    return 'I could not finish that chess answer just now. Please try again, or ask me about a specific rule, opening, tactic, or move.';
  }

  return {
    ask,
    setAIAdapter(adapter) {
      if (adapter !== null && typeof adapter !== 'function') {
        throw new TypeError('King Pawn AI adapter must be an async function.');
      }
      customAdapter = adapter;
    },
    get mode() { return customAdapter || endpoint ? 'remote-with-local-fallback' : 'local-offline'; }
  };
}

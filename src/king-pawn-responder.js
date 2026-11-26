/*
 * King Pawn v2 — isolated response coordinator.
 * It applies a strict chess-only boundary, supports a secure optional server adapter,
 * and always falls back to the local chess knowledge + Stockfish path.
 */
const CHESS_TERMS = /\b(chess|chessboard|chaturanga|fen|pgn|uci|stockfish|en passant|castl(?:e|ing)?|checkmate|stalemate|promotion|promote|pawn|rook|bishop|knight|king|queen|opening|endgame|gambit|grandmaster|fide|elo|rating|blitz|bullet|rapid|tournament|chess clock|algebraic notation|zugzwang|tempo|fork|pin|skewer|discovered attack|back.?rank|opposition|lucena|philidor|sicilian|ruy lopez|italian game|french defense|caro.?kann|queens gambit|london system|king.?s indian)\b/i;
const CHESS_QUESTION_PATTERNS = [
  /\bwhen\s+(?:was|is|did)\s+(?:the\s+game\s+of\s+)?chess\s+(?:made|invented|created|begin|start)/i,
  /\bwho\s+(?:invented|made|created)\s+chess\b/i,
  /\bwhy\s+(?:do|should)\s+(?:i|you|people)\s+(?:play\s+)?chess\b/i,
  /\bchess\s+(?:sucks|is\s+boring|is\s+hard|is\s+fun)\b/i,
  /\b(?:how\s+do\s+i|how\s+can\s+i|how\s+should\s+i)\s+(?:get\s+better|improve|win|beat\s+(?:a\s+)?(?:stronger\s+)?opponent|train|practice)\b/i,
  /\b(?:who\s+(?:is|was)|who's)\s+(?:the\s+)?(?:best|greatest|strongest)\s+(?:chess\s+)?(?:player|grandmaster|champion)\b/i,
  /\b(?:best|next|good|bad|legal|brilliant|winning|strongest)\s+(?:chess\s+)?move\b/i,
  /\bwhat\s+(?:should|do)\s+i\s+(?:play|move)\b/i,
  /\bhow\s+many\s+(?:pieces|squares|pawns|knights|bishops|rooks|queens)\b/i,
  /\b(?:rules|strategy|tactics|training|notation|time\s+control|rating\s+system)\s+(?:of|in|for)\s+chess\b/i,
  /\b(?:famous|greatest|immortal)\s+chess\s+(?:game|match|player|players)\b/i,
  /\b(?:explain|analy[sz]e|review|evaluate)\s+(?:this|my|the|last)\s+(?:game|move|position|opening|line)\b/i
];
const CLEARLY_OFF_TOPIC = [
  /\bwhat\s+time\s+is\s+it\b/i,
  /\b(?:dogs?\s+or\s+cats?|cats?\s+or\s+dogs?)\b/i,
  /\b(?:weather|forecast|temperature\s+outside)\b/i,
  /\b(?:recipe|cook(?:ing)?|bake|pizza|dinner|lunch|breakfast)\b/i,
  /\b(?:football|soccer|basketball|baseball|tennis)\s+(?:score|match|game|team)\b/i,
  /\b(?:president|election|politics|stock\s+market|bitcoin|crypto)\b/i,
  /\b(?:favorite|favourite)\s+(?:food|movie|song|colour|color|animal)\b/i,
  /\b(?:grammar|spelling|homework|maths?\s+problem)\b/i,
  /\bking\s+of\s+(?:england|great\s+britain|pop|the\s+hill)\b/i
];
const CHESS_FOLLOW_UP = /^(?:why\??|how\??|what\??|what\s+about\s+that\??|what\s+does\s+that\s+mean\??|can\s+you\s+(?:explain|show\s+me)\??|explain\s+that\??|tell\s+me\s+more\??|and\s+then\??|what\s+next\??|what\s+now\??|is\s+that\s+good\??|why\s+not\??|how\s+so\??|give\s+an\s+example\??)$/i;
const BOARD_ACTION_QUESTION = /\b(?:what\s+now|what\s+next|what\s+should\s+i\s+do|help\s+me|what\s+do\s+i\s+play|what\s+is\s+my\s+plan|is\s+this\s+(?:good|bad|safe)|why\s+was\s+that\s+(?:good|bad))\b/i;
export const OFF_TOPIC_REPLY = 'I’m King Pawn, the chess-only advisor inside Glass Chess. I can help with chess history, rules, openings, tactics, strategy, endgames, famous players, and your current game. Ask me something chess-related and I’ll help you work it out.';
const SYSTEM_PROMPT = 'You are King Pawn, the chess-only AI advisor for Glass Chess. Give a useful direct answer to any chess-related question, not just a list of definitions. Chess includes its history, rules, openings, tactics, strategy, endgames, famous players and games, rating systems, training, tournament formats, chess software, and the live board. Use the supplied recent conversation to understand short follow-up questions. Use the live FEN, PGN, moves, turn, check status, and material only when relevant. Explain ideas clearly for a beginner, give examples when useful, distinguish official rules from strategic advice, and say when a claim is uncertain or debated. Never invent engine output, exact statistics, quotations, or a guaranteed winning move. Do not make moves for the player. If the question is not chess-related, reply only with this redirect: "' + OFF_TOPIC_REPLY + '"';

function hasChessSignal(question) {
  return CHESS_TERMS.test(question) || CHESS_QUESTION_PATTERNS.some(pattern => pattern.test(question));
}

export function isChessQuestion(question, context = {}) {
  const value = String(question || '').replace(/\s+/g, ' ').trim();
  if (!value) return false;
  if (CLEARLY_OFF_TOPIC.some(pattern => pattern.test(value))) return false;
  if (hasChessSignal(value)) return true;

  const recent = Array.isArray(context?.recentConversation) ? context.recentConversation : [];
  const previousUser = [...recent].reverse().find(message =>
    message?.role === 'user' && String(message.content || '').trim().toLowerCase() !== value.toLowerCase()
  );
  if (previousUser && CHESS_FOLLOW_UP.test(value) && hasChessSignal(String(previousUser.content || ''))) {
    return true;
  }

  // In an active board session, short move/plan follow-ups are chess questions
  // even when the user does not repeat the word "chess".
  if (context?.fen && BOARD_ACTION_QUESTION.test(value)) return true;
  return false;
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
  const endpoint = String(import.meta.env?.VITE_KING_PAWN_AI_ENDPOINT || 'https://glass-chess-sqk0.onrender.com/api/king-pawn').trim();
  let customAdapter = null;

  async function endpointAdapter(payload) {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ question: payload.question, board: payload.board, conversation: payload.board.recentConversation }),
      signal: payload.signal,
      credentials: 'same-origin'
    });
    if (!response.ok) throw new Error('The King Pawn service returned HTTP ' + response.status + '.');
    return response.json();
  }

  async function ask(input) {
    const question = String(input || '').replace(/\s+/g, ' ').trim().slice(0, 1200);
    if (!question) return 'Ask me a chess question and I’ll help you work through it.';

    let context = {};
    try { context = getContext() || {}; }
    catch (error) { console.warn('King Pawn could not read the live board:', error); }
    if (!isChessQuestion(question, context)) return OFF_TOPIC_REPLY;
    const board = {
      fen: String(context.fen || ''),
      pgn: String(context.pgn || '').slice(0, 12000),
      history: Array.isArray(context.history) ? context.history.slice(-160) : [],
      turn: context.turn === 'b' ? 'b' : 'w',
      gameOver: Boolean(context.gameOver),
      inCheck: Boolean(context.inCheck),
      checkState: String(context.checkState || ''),
      material: context.material && typeof context.material === 'object' ? context.material : {},
      recentConversation: Array.isArray(context.recentConversation)
        ? context.recentConversation.slice(-8).map(message => ({
            role: message?.role === 'assistant' ? 'assistant' : 'user',
            content: String(message?.content || '').slice(0, 700)
          }))
        : []
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

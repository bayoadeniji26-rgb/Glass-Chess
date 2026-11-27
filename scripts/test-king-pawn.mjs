import assert from 'node:assert/strict';
import { createKingPawnResponder, isChessQuestion, isKingPawnQuestion } from '../src/king-pawn-responder.js';

assert.equal(isKingPawnQuestion('What is photosynthesis?'), true, 'General knowledge questions must be accepted.');
assert.equal(isKingPawnQuestion('What happened in ancient Egypt?'), true, 'History questions must be accepted.');
assert.equal(isKingPawnQuestion('   '), false, 'Empty messages must be rejected.');

const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

const chessExamples = [
  'When was chess made?',
  'Why do you chess?',
  'Chess sucks.',
  'How do I get better?',
  'How can I beat a stronger opponent?',
  'Who was the greatest chess player ever?',
  'What does en passant mean?',
  'What should I play next?',
  'What about e4?',
  'How many squares are on a chessboard?',
  'What is the Elo rating system?',
  'Can you explain the Sicilian Defense?'
];
for (const question of chessExamples) {
  assert.equal(isChessQuestion(question), true, 'King Pawn should accept: ' + question);
}

const unrelatedExamples = [
  'What time is it?',
  'Dogs or cats?',
  'What the heck?',
  'Tell me a pizza recipe.',
  'What is the weather tomorrow?',
  'Who is the king of England?',
  'What is your favorite song?',
  'Who won the football match?'
];
for (const question of unrelatedExamples) {
  assert.equal(isChessQuestion(question), false, 'King Pawn should redirect: ' + question);
}

assert.equal(
  isChessQuestion('Tell me more.', {
    recentConversation: [{ role: 'user', content: 'How does castling work?' }]
  }),
  true,
  'A short follow-up to a chess question should keep the chess context.'
);
assert.equal(
  isChessQuestion('Tell me more.', {
    recentConversation: [{ role: 'user', content: 'Dogs or cats?' }]
  }),
  false,
  'A short follow-up must not inherit an unrelated topic.'
);
assert.equal(
  isChessQuestion('Tell me more?', {
    recentConversation: [{ role: 'user', content: 'How does castling work?' }]
  }),
  true,
  'Question-mark follow-ups should keep the chess context too.'
);
assert.equal(
  isChessQuestion('What should I do now?', { fen: START_FEN }),
  true,
  'Move/plan questions inside an active board session should be accepted.'
);
assert.equal(
  isChessQuestion('What should I do now?'),
  false,
  'A generic question outside a board session should not bypass the chess-only boundary.'
);

let remoteCalls = 0;
let capturedPayload = null;
const responder = createKingPawnResponder({
  getContext: () => ({
    fen: START_FEN,
    pgn: '1. e4 e5',
    history: [{ san: 'e4' }, { san: 'e5' }],
    turn: 'w',
    recentConversation: [{ role: 'user', content: 'How do I improve at chess?' }]
  }),
  getKnowledgeAnswer: async question => 'Local chess fallback: ' + question
});
responder.setAIAdapter(async payload => {
  remoteCalls += 1;
  capturedPayload = payload;
  return { answer: 'A real AI answer about chess.' };
});

const aiAnswer = await responder.ask('How do I get better?');
assert.equal(aiAnswer, 'A real AI answer about chess.');
assert.equal(remoteCalls, 1);
assert.equal(capturedPayload.board.fen, START_FEN);
assert.equal(capturedPayload.board.pgn, '1. e4 e5');
assert.equal(capturedPayload.board.recentConversation[0].content, 'How do I improve at chess?');
assert.match(capturedPayload.systemPrompt, /general-purpose assistant/i);

const generalAnswer = await responder.ask('What is photosynthesis?');
assert.equal(generalAnswer, 'A real AI answer about chess.');
assert.equal(remoteCalls, 2, 'General knowledge questions must reach the configured AI provider.');
assert.deepEqual(capturedPayload.board, {}, 'General questions must not send unnecessary live board data.');
assert.equal(capturedPayload.conversation[0].content, 'How do I improve at chess?', 'General follow-ups should retain conversation context.');

responder.setAIAdapter(async () => { throw new Error('Simulated provider outage.'); });
const fallback = await responder.ask('When was chess invented?');
assert.match(fallback, /Local chess fallback/);
const generalOffline = await responder.ask('What is the solar system?');
assert.match(generalOffline, /secure AI service is available|server/);

responder.setAIAdapter(null);
assert.equal(typeof responder.mode, 'string');

console.log('King Pawn tests passed: broad chess questions, general questions, contextual chess follow-ups, live board handoff, provider routing, and local fallback.');

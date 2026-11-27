import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { Chess } from 'chess.js';
import { DAILY_PUZZLES, getPuzzleDayIndex } from '../src/daily-puzzle-data.js';
import { calculatePositionHistory, isFlagFallDraw } from '../src/chess-position-tools.js';
import { remainingSeconds } from '../src/gameplay-timers.js';
import { MatchmakingQueue } from '../src/matchmaking-queue.js';
import { isKingPawnQuestion } from '../src/king-pawn-responder.js';

const uci = move => move.from + move.to + (move.promotion || '');

assert.equal(DAILY_PUZZLES.length, 50, 'The series must contain exactly 50 chess puzzles.');
assert.deepEqual(DAILY_PUZZLES.map(puzzle => puzzle.day), Array.from({ length: 50 }, (_, index) => index + 1));
assert.equal(new Set(DAILY_PUZZLES.map(puzzle => puzzle.fen)).size, 50, 'All 50 puzzle positions must be distinct.');

assert.equal(new Set(DAILY_PUZZLES.map(puzzle => puzzle.id)).size, 50, 'Every puzzle must have a different source puzzle ID.');
assert.ok(new Set(DAILY_PUZZLES.flatMap(puzzle => puzzle.themes.split(' '))).size >= 15, 'The catalog must cover a broad range of tactical themes.');
assert.ok(new Set(DAILY_PUZZLES.map(puzzle => puzzle.solution.length)).size >= 4, 'The catalog must include varied multi-move solution lengths.');
for (const puzzle of DAILY_PUZZLES) {
  assert.ok(puzzle.title && puzzle.hint && puzzle.explanation && puzzle.sourceUrl, 'Missing puzzle content or attribution on Day ' + puzzle.day);
  assert.match(puzzle.fen, /\s[wb]\s/, 'Missing side to move on Day ' + puzzle.day);
  assert.ok(puzzle.solution.length >= 2 && puzzle.solution.length % 2 === 0, 'Each puzzle must include a full solver/opponent line on Day ' + puzzle.day);
  const game = new Chess(puzzle.fen);
  for (const [index, moveText] of puzzle.solution.entries()) {
    const move = game.move({ from: moveText.slice(0,2), to: moveText.slice(2,4), ...(moveText[4] ? { promotion: moveText[4] } : {}) });
    assert.ok(move, 'Puzzle line must be legal on Day ' + puzzle.day + ' at ply ' + (index + 1) + ': ' + moveText);
  }
}
assert.equal(getPuzzleDayIndex('2026-11-25', '2026-11-25'), 1);
assert.equal(getPuzzleDayIndex('2026-11-25', '2026-11-26'), 2);
assert.equal(getPuzzleDayIndex('2026-11-25', '2026-12-14'), 20);
assert.equal(getPuzzleDayIndex('2026-11-25', '2027-01-20'), 50);
assert.equal(getPuzzleDayIndex('2026-11-25', '2026-11-24'), 1);
assert.equal(getPuzzleDayIndex('2024-02-28', '2024-03-01'), 3, 'Leap day progression must be calendar-correct.');
assert.equal(getPuzzleDayIndex('2026-12-31', '2027-01-01'), 2, 'Year boundary progression must be calendar-correct.');
assert.throws(() => getPuzzleDayIndex('2026-02-30', '2026-03-01'), /Invalid calendar date/);

const start = new Chess();
const startFen = start.fen();
const line = [{ from: 'e2', to: 'e4' }, { from: 'e7', to: 'e5' }, { from: 'g1', to: 'f3' }];
const positions = calculatePositionHistory(startFen, line);
assert.equal(positions.length, line.length + 1);
assert.equal(positions[0], startFen);
assert.notEqual(positions.at(-1), startFen);
assert.equal(start.fen(), startFen, 'The source game must not be mutated.');
assert.throws(() => calculatePositionHistory(startFen, [{ from: 'e2', to: 'e5' }]), /Invalid move/);
assert.equal(start.fen(), startFen, 'An invalid replay must not mutate the source game.');

const castleFen = 'r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1';
const castlePositions = calculatePositionHistory(castleFen, [{ from: 'e1', to: 'g1' }, { from: 'e8', to: 'c8' }]);
assert.equal(castlePositions.length, 3, 'Castling moves must replay.');
const promotionFen = '4k3/P7/8/8/8/8/8/4K3 w - - 0 1';
const promotionPositions = calculatePositionHistory(promotionFen, [{ from: 'a7', to: 'a8', promotion: 'q' }]);
assert.equal(promotionPositions.length, 2, 'Promotion must replay.');
const enPassantGame = new Chess();
for (const san of ['e4', 'a6', 'e5', 'd5']) enPassantGame.move(san);
const enPassantFen = enPassantGame.fen();
const enPassantPositions = calculatePositionHistory(enPassantFen, [{ from: 'e5', to: 'd6' }]);
assert.equal(enPassantPositions.length, 2, 'En passant must replay.');
assert.equal(enPassantGame.fen(), enPassantFen, 'Special-move replay must not mutate its source game.');

const bareKingWinnerFen = '7k/8/8/8/8/8/8/K6r b - - 0 1';
assert.equal(isFlagFallDraw(bareKingWinnerFen, 'b'), true);
const rookWinnerFen = '7k/8/8/8/8/8/8/K6R b - - 0 1';
assert.equal(isFlagFallDraw(rookWinnerFen, 'b'), false);
assert.equal(isFlagFallDraw('7k/8/8/8/8/8/8/K7 b - - 0 1', 'b'), true);
assert.throws(() => isFlagFallDraw(rookWinnerFen, 'x'), /flagging side/);

assert.equal(remainingSeconds(60000, 0), 60);
assert.equal(remainingSeconds(60000, 1001), 59);
assert.equal(remainingSeconds(60000, 59999), 1);
assert.equal(remainingSeconds(60000, 60001), 0);
assert.throws(() => remainingSeconds(Number.NaN, 0), /finite numbers/);


const queue = new MatchmakingQueue();
const playerA = { socketId: 'socket-a', playerId: 'player-a', name: 'Alice' };
const playerB = { socketId: 'socket-b', playerId: 'player-b', name: 'Bob' };
assert.equal(queue.enqueue(playerA).status, 'waiting', 'First player should wait in the queue.');
assert.equal(queue.enqueue({ ...playerA, socketId: 'socket-a2' }).status, 'already_queued', 'A second tab must not queue the same player twice.');
assert.equal(queue.size, 1, 'Duplicate identity must not create a second ticket.');
const match = queue.enqueue(playerB);
assert.equal(match.status, 'matched', 'Second distinct player should be paired.');
assert.equal(match.opponent.playerId, 'player-a', 'Queue should pair the oldest waiting opponent.');
assert.equal(queue.size, 0, 'Matched players must be removed from the queue.');
queue.enqueue(playerA);
assert.equal(queue.remove('socket-a'), true, 'Player should be able to cancel matchmaking.');
assert.equal(queue.size, 0, 'Cancelled matchmaking should remove its ticket.');

const selfTestSource = readFileSync(new URL('../src/self-test.js', import.meta.url), 'utf8');
assert.doesNotMatch(selfTestSource, /if \(!api\.engineReady\) return makeResult[^\n]*true/, 'An uninitialized Stockfish engine must not make the engine test pass without searching.');
assert.match(selfTestSource, /api\.search\(beforeFen, 3\)/, 'The in-app engine test must actually request a Stockfish move.');

const onlineServer = readFileSync(new URL('../server.mjs', import.meta.url), 'utf8');
const onlineClient = readFileSync(new URL('../src/onlineplus.js', import.meta.url), 'utf8');
assert.match(onlineServer, /INVITE_TTL_MS = Math\.max\(100, Number\(process\.env\.GC_INVITE_TTL_MS\) \|\| 15 \* 60 \* 1000\)/, 'Private invitations must expire after fifteen minutes by default.');
assert.match(onlineServer, /function scheduleInviteExpiry/, 'Unused invitations must be cleaned up automatically.');
assert.match(onlineServer, /function scheduleRoomCleanup/, 'Ended rooms must be removed after a bounded retention period.');
assert.match(onlineServer, /function releasePlayerLock[\s\S]*?activePlayers\.get\(playerId\) === roomCode/, 'A stale room cleanup must not clear a newer player lock.');
assert.match(onlineServer, /activePlayers\.set\(whitePlayer\.playerId, code\)/, 'Matched players must be locked against a second active game.');
assert.match(onlineServer, /activePlayers\.has\(playerId\)/, 'A player already in a game must not enter another room.');
assert.match(onlineServer, /expectedPly/, 'The authoritative server must reject stale move submissions.');
assert.match(onlineServer, /room\.game\.move\(legalMove\)/, 'The server must validate moves with chess.js.');
assert.match(onlineServer, /capturedPiece: applied\.captured/, 'Moves must include server-derived capture metadata.');
assert.match(onlineServer, /isCheckmate: room\.game\.isCheckmate\(\)/, 'Moves must include server-derived checkmate metadata.');
assert.match(onlineClient, /https:\/\/glass-chess-sqk0\.onrender\.com/, 'Online play must default to the deployed Glass Chess server.');
assert.match(onlineClient, /queue:join/, 'The client must support joining matchmaking.');
assert.match(onlineClient, /queue:cancel/, 'The client must support cancelling matchmaking.');
assert.match(onlineClient, /socket\.on\('room:expired', handleExpiredRoom\)/, 'Clients must clear sessions when the server expires a room.');
assert.match(onlineClient, /if \(snapshot\.gameOver \|\| snapshot\.resigned \|\| snapshot\.abandoned\)/, 'The online result dialog must show draws as well as wins.');
assert.match(onlineClient, /match:found/, 'The client must join automatically when a match is found.');
assert.match(onlineClient, /searchParams\.set\('room', online\.code\)/, 'Friend invites must create shareable room links.');
assert.match(onlineClient, /window\.location\.search/, 'Invite links must be parsed when the friend opens them.');

const mainUi = readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');
const authUi = readFileSync(new URL('../src/clerk-auth.js', import.meta.url), 'utf8');
const appHtml = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
assert.match(mainUi, /function getSignedInDisplayName/, 'Human seat labels must use the signed-in account display name.');
assert.match(mainUi, /const candidate = user\.displayName \|\| user\.username \|\| ""/, 'Board names must come only from the registered account name.');
assert.match(mainUi, /return cleaned \|\| "Anonymous"/, 'Accounts without a registered name must show Anonymous.');
assert.doesNotMatch(mainUi, /user\.email.*split\("@"/, 'Email addresses must never be used as player names.');
assert.match(mainUi, /normalizeSeatName/, 'Empty and legacy placeholder names must display as Anonymous.');
assert.match(mainUi, /online\.getPlayers\?\.\(\)/, 'Online nameplates must use the authoritative room player names.');
assert.match(mainUi, /Elo: Unrated/, 'The UI must not invent an Elo value when no rating is available.');
assert.match(mainUi, /gameMode === "computer" && !isOnlineMatch/, 'Stockfish nameplates must be exclusive to computer games.');
assert.match(onlineClient, /function getPublicPlayerName/, 'Online rooms must transmit the signed-in name or Anonymous.');
assert.match(onlineClient, /const candidate = user\?\.displayName \|\| user\?\.username \|\| ""/, 'Online identity must use the account registered name only.');
assert.match(onlineClient, /return cleaned \|\| "Anonymous"/, 'Online guests without a registered name must be Anonymous.');
assert.doesNotMatch(onlineClient, /user\?\.email.*split\("@"/, 'Online identity must not derive names from email addresses.');
assert.equal((onlineClient.match(/name: getPublicPlayerName\(\), playerId: CLIENT_ID/g) || []).length, 3, 'Matchmaking, room creation, and joining must use the account name.');
assert.match(authUi, /glasschess:auth-change/, 'Account changes must refresh the board nameplates.');
assert.match(appHtml, /id="opponent-name"/, 'The top player nameplate must have a separate name element.');
assert.match(appHtml, /id="player-name"/, 'The bottom player nameplate must have a separate name element.');
assert.match(mainUi, /onlineSession\?\.isOnline\?\.\(\) \|\| onlineSession\?\.isMatchmaking\?\.\(\)/, 'Starting a regular game must detect active online rooms and matchmaking searches.');
assert.match(mainUi, /exitOnlineSession\?\.\(\{ restoreMode: false \}\)/, 'Starting an offline game must leave online mode before resetting the board.');
assert.match(onlineClient, /isMatchmaking\(\) \{ return matchmakingActive \|\| onlineRequestActive; \}/, 'The main game must detect matchmaking and pending room joins.');
assert.match(onlineClient, /exitOnlineSession\(options = \{\}\) \{ return leaveRoom\(options\); \}/, 'Online Plus must expose a reusable online-session exit action.');
assert.match(onlineClient, /let onlineRequestActive = false;[\s\S]*?let offlineIntent = false;/, 'Pending create and join requests must be tracked until they finish or are cancelled.');
assert.match(onlineClient, /generation !== onlineRequestGeneration \|\| offlineIntent/, 'Late room-create and room-join responses must be ignored after the user starts offline play.');
assert.match(onlineClient, /offlineIntent \|\| \(!matchmakingActive && !online\.code\)/, 'Late match-found events must not re-enter online mode after cancellation.');
assert.match(onlineClient, /if \(wasSearching && socket\?\.connected\) \{\s*try \{ await emitAck\('queue:cancel'\); \} catch \{\}/, 'Leaving online mode must cancel an active matchmaking queue.');
assert.match(onlineClient, /if \(roomCode && socket\?\.connected\) \{\s*try \{ await emitAck\('room:leave'\); \} catch \{\}/, 'Leaving online mode must leave an active room on the server.');
assert.match(onlineClient, /localStorage\.removeItem\('glass-chess-online-room-code'\)/, 'Leaving online mode must clear the saved room-resume pointer.');
assert.match(onlineClient, /url\.searchParams\.delete\('room'\)/, 'Leaving an invite room must remove the auto-join URL parameter.');
assert.match(onlineClient, /async function startDailyChallenge\(\)[\s\S]*?leaveRoom\(\{ restoreMode: false \}\)/, 'Starting a solo daily challenge must also exit online mode.');


console.log('50 legal daily chess puzzles and regression suite passed.');

const puzzleUi = readFileSync(new URL('../src/daily-puzzles.js', import.meta.url), 'utf8');
const puzzleCss = readFileSync(new URL('../src/daily-puzzles.css', import.meta.url), 'utf8');
assert.match(puzzleUi, /data-action="next"/, 'Daily puzzles must include a Next button.');
assert.match(puzzleUi, /data-action="previous"/, 'Daily puzzles must include a Previous button.');
assert.match(puzzleUi, /puzzleDay\+\+/, 'Next must advance to the next puzzle.');
assert.match(puzzleUi, /puzzleDay--/, 'Previous must return to the previous puzzle.');
assert.match(puzzleCss, /grid-template-rows:repeat\(8,minmax\(0,1fr\)\)/, 'The puzzle board must explicitly size all eight rows.');
assert.match(puzzleCss, /\.gc-daily-square\.is-legal::after/, 'Legal-move indicators must be rendered above the square backgrounds.');
assert.match(puzzleCss, /\.gc-daily-square\.is-capture::after/, 'Capture indicators must be rendered above the square backgrounds.');

const cloudAuthSource = readFileSync(new URL('../src/clerk-auth.js', import.meta.url), 'utf8');
assert.match(puzzleUi, /saveEngine\.saveData/, 'Daily puzzle progress must be persisted in the account save payload.');
assert.match(puzzleUi, /dailyPuzzleProgress/, 'Daily puzzle progress must have a stable cloud-save key.');
assert.match(cloudAuthSource, /applyCloudProgress/, 'A restored cloud profile must restore daily puzzle progress.');

assert.match(puzzleUi, /solutionIndex/, 'The puzzle UI must track progress through a multi-move solution line.');
assert.match(puzzleUi, /game\.move\(moveInput\(puzzle\.solution\[solutionIndex\]\)\)/, 'The opponent response must be played from the verified solution line.');
assert.match(puzzleUi, /Opponent is replying/, 'The player must see the opponent response between their moves.');
assert.match(puzzleUi, /Lichess CC0/, 'The puzzle UI must attribute the open puzzle source.');

assert.match(puzzleUi, /Completed earlier — replay this puzzle anytime for practice/, 'Completed puzzles must remain replayable.');
assert.match(puzzleUi, /el\('gc-daily-board'\)\.addEventListener\('click'/, 'Puzzle square clicks must be handled by the board event delegate.');
assert.doesNotMatch(puzzleUi, /function revealSolution\(/, 'Opening a completed puzzle must not reveal and disable the board.');

const supportUi = readFileSync(new URL('../src/cloud-auth.js', import.meta.url), 'utf8');
const supportCss = readFileSync(new URL('../src/cloud-auth.css', import.meta.url), 'utf8');
assert.match(supportUi, /contact\.id = 'gc-contact'/, 'The top bar must include a standalone Contact action.');
assert.match(supportUi, /openDonationDialog\('contact'\)/, 'The Contact action must open contact mode.');
assert.match(supportUi, /message_type: \$\('gc-donation-topic'\)\.value/, 'Contact submissions must include the selected message topic.');
assert.match(supportUi, /donation_amount: supportMode === 'contact' \? 'No donation/, 'Contact submissions must not require a donation.');
assert.match(supportUi, /api\.emailjs\.com\/api\/v1\.0\/email\/send/, 'Contact messages must use the configured email delivery service.');
assert.match(supportCss, /height: 36px !important/, 'Top-bar actions must use a consistent height.');
assert.match(supportCss, /overflow-x: auto !important/, 'Top-bar controls must remain reachable when the viewport is narrow.');
assert.match(supportCss, /\.gc-donation-overlay\.is-contact \.gc-donation-actions/, 'Contact mode must have contact-specific presentation.');
assert.match(supportCss, /#gc-copy-cashapp-dialog/, 'The Cash App copy button inside the donation dialog must be styled.');
assert.match(supportUi, /EMAILJS_PUBLIC_KEY = import\.meta\.env\.VITE_EMAILJS_PUBLIC_KEY \|\| 'aKuTsseHTnwR-RWgG'/, 'The EmailJS fallback public key must include its final character.');
assert.match(supportUi, /public key\.\{0,40\}invalid/, 'Invalid EmailJS public keys must produce a specific explanation.');
assert.match(supportCss, /flex-wrap: nowrap !important/, 'Desktop navigation must remain in a single row.');
assert.match(supportCss, /@media \(max-width: 1500px\) and \(min-width: 761px\)/, 'The header must compact controls for medium desktop widths.');


assert.match(supportUi, /name: senderName/, 'EmailJS receives the standard Contact Us sender-name field.');
assert.match(supportUi, /email: email \|\| ''/, 'EmailJS receives the standard Contact Us reply address field.');
assert.match(supportUi, /title: emailSubject/, 'EmailJS receives the standard Contact Us subject field.');
assert.match(supportUi, /function describeEmailDeliveryError/, 'Email delivery failures must provide an actionable explanation.');
assert.doesNotMatch(supportUi, /This feature is not available\. Try again later\./, 'Message failures must not be hidden behind a generic unavailable message.');
assert.match(supportUi, /lastEmailRequestAt/, 'Message submissions must respect the EmailJS rate limit.');

const firstRunGuide = readFileSync(new URL('../src/first-run-guide.js', import.meta.url), 'utf8');
const firstRunCss = readFileSync(new URL('../src/first-run-guide.css', import.meta.url), 'utf8');
assert.match(firstRunGuide, /glass-chess-first-run-v1/, 'The first-run guide must remember when the welcome flow was completed.');
assert.match(firstRunGuide, /data-guide-action="play"/, 'The welcome flow must offer a direct path to Play.');
assert.match(firstRunGuide, /data-guide-action="puzzle"/, 'The welcome flow must offer a direct path to Daily Puzzle.');
assert.match(firstRunGuide, /data-guide-action="tour"/, 'The welcome flow must offer an interactive quick tour.');
assert.match(firstRunGuide, /keepFocusInside/, 'The welcome dialog must keep keyboard focus inside.');
assert.match(firstRunCss, /\.gc-first-run-overlay\[hidden\]/, 'The guide must support a properly hidden state.');
assert.match(appHtml, /src="\/src\/first-run-guide\.js"/, 'The first-run guide must load in the application.');


const workspaceUi = readFileSync(new URL('../src/glass-workspace.js', import.meta.url), 'utf8');
const workspaceCss = readFileSync(new URL('../src/glass-workspace.css', import.meta.url), 'utf8');
const toolsUi = readFileSync(new URL('../src/glass-dock.js', import.meta.url), 'utf8');
const toolsCss = readFileSync(new URL('../src/glass-dock.css', import.meta.url), 'utf8');
assert.match(workspaceUi, /onlineOption\.value = 'online'/, 'Play must offer Online beside its offline game modes.');
assert.match(workspaceUi, /data-workspace-open="tools"/, 'Tools must be available from the top navigation.');
assert.match(workspaceUi, /play\.addEventListener\('click',[\s\S]*?closeDrawer\(\)/, 'Starting a game must close the Play drawer automatically.');
assert.match(mainUi, /requestedMode === "online"/, 'The Play Online choice must route into Online + Club instead of the local engine.');
assert.match(toolsUi, /openOnline,/, 'The Tools hub must expose a direct Online destination.');
assert.match(toolsUi, /description:/, 'Tools categories must provide descriptive helper text.');
assert.doesNotMatch(toolsUi, /gc-hub-orb/, 'The old floating Tools orb must be removed.');
assert.match(toolsCss, /grid-template-columns: repeat\(2, minmax\(0, 1fr\)\)/, 'Tools categories must use an organized card grid.');
assert.doesNotMatch(toolsCss, /gc-hub-orb/, 'The Tools stylesheet must not style the removed floating orb.');
assert.match(workspaceCss, /gc-tools-single-launcher #gc-workspace-actions/, 'The top-bar Tools action must remain reachable in fullscreen focus mode.');
const finalUiCss = readFileSync(new URL('../src/glass-final-ui.css', import.meta.url), 'utf8');
const redesignCss = readFileSync(new URL('../src/glass-redesign.css', import.meta.url), 'utf8');
const redesignUi = readFileSync(new URL('../src/glass-redesign.js', import.meta.url), 'utf8');
assert.match(toolsCss, /grid-template-columns: repeat\(3, minmax\(0, 1fr\)\)/, 'Desktop Tools shortcuts must use a compact three-column layout.');
assert.match(toolsCss, /overflow-y: auto !important/, 'The Tools feature pane must own vertical scrolling.');
assert.match(toolsCss, /pointer-events: auto !important/, 'Interactive tool controls must remain clickable above the backdrop.');
assert.match(toolsCss, /position: relative !important/, 'Tool buttons must remain in the drawer hit-testing layer.');
assert.match(redesignCss, /bottom: 12px !important/, 'The Tools drawer must use the bottom of the available viewport.');
assert.doesNotMatch(redesignCss, /bottom: 105px/, 'The removed floating orb must not reserve 105 pixels under the drawer.');
assert.doesNotMatch(redesignCss, /gc-hub-orb/, 'The redesign stylesheet must not recreate the removed purple orb.');
assert.doesNotMatch(finalUiCss, /gc-hub-orb/, 'The final UI stylesheet must not style the removed purple orb.');
assert.doesNotMatch(redesignUi, /gc-hub-orb/, 'The update module must not keep an obsolete orb visible.');
assert.match(toolsUi, /role="dialog" aria-modal="true"/, 'The Tools panel must expose dialog semantics.');
assert.match(toolsUi, /tabindex="0" aria-label="Scrollable tools"/, 'The Tools content region must be keyboard-scrollable.');

const premiumUi = readFileSync(new URL('../src/premium.js', import.meta.url), 'utf8');
assert.ok(premiumUi.includes('import { ChessEngine } from "./engine.js"'), 'Live Engine Lab must use an isolated Stockfish engine worker.');
assert.ok(premiumUi.includes('function scheduleLiveAnalysis'), 'Live Engine Lab must have an automatic position-refresh scheduler.');
assert.ok(premiumUi.includes('liveAnalysisEngine.search(fen'), 'Live Engine Lab must search with its dedicated engine.');
const liveMoveHook = premiumUi.slice(premiumUi.indexOf('function onMove('), premiumUi.indexOf('function onReset('));
const liveResetHook = premiumUi.slice(premiumUi.indexOf('function onReset('), premiumUi.indexOf('function onUndo('));
assert.ok(liveMoveHook.includes('scheduleLiveAnalysis(180)'), 'Every accepted board move must schedule a fresh live evaluation.');
assert.ok(liveResetHook.includes('scheduleLiveAnalysis(180)'), 'Starting a new game must refresh the live evaluation.');
assert.ok(premiumUi.includes('scheduleLiveAnalysis(250)'), 'Live Engine Lab must start automatically after the Premium Suite mounts.');
assert.ok(premiumUi.includes('Always-on board monitoring'), 'The interface must explain that Live Engine Lab runs automatically.');
assert.ok(premiumUi.includes('liveAnalysisEngine.stop()'), 'Position changes and pause must stop stale background searches safely.');
assert.ok(premiumUi.includes('liveAnalysisSuppressed = true'), 'Live Engine Lab must stay out of the way while a training puzzle is active.');
const liveRunner = premiumUi.slice(premiumUi.indexOf('async function runLiveAnalysis'), premiumUi.indexOf('function moveClass(loss)'));
assert.ok(!liveRunner.includes('api.search('), 'Live Engine Lab must not use the main game thinking lock.');

assert.equal(isKingPawnQuestion('What is photosynthesis?'), true, 'King Pawn must accept general questions.');
assert.equal(isKingPawnQuestion(''), false, 'King Pawn must reject empty questions.');

const responderSource = readFileSync(new URL('../src/king-pawn-responder.js', import.meta.url), 'utf8');
assert.match(responderSource, /friendly general-purpose assistant/, 'King Pawn must be a general-purpose assistant.');
assert.match(responderSource, /internet connection is working|could not reach King Pawn’s answer service/, 'King Pawn must distinguish backend setup errors from actual connection errors.');
const kingPawnServerSource = readFileSync(new URL('../server.mjs', import.meta.url), 'utf8');
assert.match(kingPawnServerSource, /isKingPawnQuestion\(question\)/, 'The server must accept general non-empty questions.');
assert.doesNotMatch(kingPawnServerSource, /isChessQuestion\(question/, 'The server must not keep the old chess-only request gate.');
assert.match(kingPawnServerSource, /age-appropriate/, 'King Pawn must use age-appropriate response guidance.');

const workspaceSource = readFileSync(new URL('../src/glass-workspace.js', import.meta.url), 'utf8');
const onlinePreferencesSource = readFileSync(new URL('../src/onlineplus.js', import.meta.url), 'utf8');
const finalMainSource = readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');
const finalWorkspaceCss = readFileSync(new URL('../src/glass-workspace.css', import.meta.url), 'utf8');
const finalDockSource = readFileSync(new URL('../src/glass-dock.js', import.meta.url), 'utf8');
const finalUiSource = readFileSync(new URL('../src/glass-final-ui.js', import.meta.url), 'utf8');
const finalPremiumSource = readFileSync(new URL('../src/premium.js', import.meta.url), 'utf8');
assert.match(finalMainSource, /gc-stockfish-mark/, 'The computer opponent must display a Stockfish engine icon.');
assert.match(finalMainSource, /BOT_PROFILE_INFO/, 'Stockfish must offer multiple named difficulty levels.');
assert.match(finalMainSource, /ratingLabel/, 'The Stockfish nameplate must show an explicitly estimated rating.');
assert.match(finalMainSource, /gc-analysis-eval-rail/, 'Analysis Studio must create an evaluation rail alongside the board.');
assert.match(finalWorkspaceCss, /gc-analysis-rail-track/, 'The Analysis Studio evaluation rail must have modern styling.');
assert.match(workspaceSource, /gc-settings-online-preferences/, 'The Settings drawer must host profile and appearance preferences.');
assert.match(workspaceSource, /#gc-plus-skins/, 'Piece finishes must be moved to Settings.');
assert.match(workspaceSource, /#gc-plus-sound/, 'Sound and animation preferences must be moved to Settings.');
assert.doesNotMatch(finalDockSource, /id: "style", label: "Appearance"/, 'Appearance must not remain a Tools category.');
assert.match(finalPremiumSource, /getRating:/, 'The local player Elo must be exposed to the main game UI.');
assert.match(finalPremiumSource, /opponentRating = Number\(api\.botRating\)/, 'The rating update must use the selected Stockfish level.');
assert.match(onlinePreferencesSource, /gc-victory-confetti/, 'Checkmate results must include a confetti animation.');
assert.match(onlinePreferencesSource, /getPlayerAvatar\(\)/, 'The selected avatar icon must be available to the board UI.');
assert.match(onlinePreferencesSource, /'♔', '♕', '♖'/, 'The avatar picker must offer chess-piece icon choices.');
assert.match(onlinePreferencesSource, /AVATARS\.includes\(value\.avatar\)/, 'Older animal avatars must migrate to the current icon set.');
assert.match(onlinePreferencesSource, /if \(!state\.animations && !checkmate\)/, 'Disabling animation must not hide a checkmate result.');
assert.match(onlinePreferencesSource, /checkmate && state\.animations/, 'Checkmate confetti must respect motion preferences.');
assert.match(finalMainSource, /dataset\.gcBoardTheme = selectedTheme/, 'The selected board theme must be explicit and persistent.');
assert.match(finalPremiumSource, /dataset\.gcBoardTheme = theme/, 'Premium appearance updates must preserve the selected board theme.');
assert.match(finalPremiumSource, /const boardTheme = api\.appearance\?\.theme/, 'Premium startup must not overwrite the main Settings board theme with an older saved value.');
assert.match(finalUiSource, /savedSettings\.theme/, 'Delayed theme rendering must read the saved board theme rather than revert it.');
assert.match(finalMainSource, /medieval: \{[\s\S]*?modern: \{/, 'The refined Medieval and Modern piece artwork must both be present.');

const stockfishLogoSource = readFileSync(new URL('../src/stockfish-logo.js', import.meta.url), 'utf8');
assert.match(stockfishLogoSource, /data:image\/webp;base64,/, 'The official Stockfish logo must be bundled locally for offline display.');
assert.match(finalMainSource, /import \{ STOCKFISH_LOGO_DATA_URL \} from "\.\/stockfish-logo\.js"/, 'The Stockfish player badge must use the supplied official logo asset.');
assert.match(finalMainSource, /mark\.src = STOCKFISH_LOGO_DATA_URL/, 'The player nameplate must render the real Stockfish image, not a drawn substitute.');
assert.match(finalMainSource, /M15 88h70l-5 8H20z/, 'Medieval knight must use the refined horse silhouette.');
assert.match(finalPremiumSource, /gc-medieval-preview.*<svg/s, 'The Medieval piece selector must preview the refined knight silhouette.');
const embeddedLogo = stockfishLogoSource.match(/base64,([A-Za-z0-9+/=]+)/)?.[1] || '';
assert.ok(embeddedLogo.length > 2000 && embeddedLogo.length % 4 === 0, 'The official Stockfish logo data URL must be complete base64.');
assert.match(finalPremiumSource, /data-piece-style="medieval"/, 'The Settings panel must offer a visible Medieval piece-style card.');
assert.match(finalPremiumSource, /syncPieceStyleOptions/, 'Piece-style cards must reflect and update the saved design.');
assert.match(finalPremiumSource, /gc-piece-style-options/, 'Piece design choices must be presented in a visible selector area.');
assert.match(finalWorkspaceCss, /gc-background-palette > button > span/, 'Background palette swatches must render visible color blocks.');
assert.match(finalWorkspaceCss, /gc-piece-style-option\.active/, 'Selected piece design must have a visible active state.');
assert.match(finalWorkspaceCss, /\.gc-settings-drawer \{[\s\S]*?width: min\(390px/, 'The Settings drawer must use a compact width.');
const finalLayoutSource = readFileSync(new URL('../src/glass-final-ui.js', import.meta.url), 'utf8');
assert.match(finalLayoutSource, /viewportHeight \* 0\.84/, 'The board should use more of the available workspace height.');
assert.match(finalLayoutSource, /viewportWidth < 760 \? 720 : 1100/, 'Desktop boards should be allowed to grow larger than the old 920px cap.');
assert.match(kingPawnServerSource, /backend is online, but its private AI provider key has not been configured/i, 'A missing King Pawn key must be described as a server-side setup issue.');
assert.match(kingPawnServerSource, /providerResponse\.status === 429/, 'King Pawn must distinguish provider quota/rate-limit errors.');
assert.match(kingPawnServerSource, /providerResponse\.status === 401 \|\| providerResponse\.status === 403/, 'King Pawn must distinguish invalid provider credentials.');
assert.match(kingPawnServerSource, /KING_PAWN_MODEL \|\| 'gpt-6\.2-sol'/, 'King Pawn should default to the lower-cost everyday model.');
const cloudSetupSource = readFileSync(new URL('../docs/CLOUD-SYNC-SETUP.md', import.meta.url), 'utf8');
assert.match(cloudSetupSource, /VITE_SUPABASE_URL/, 'Cloud sync setup must document the Supabase URL.');
assert.match(cloudSetupSource, /VITE_SUPABASE_PUBLISHABLE_KEY/, 'Cloud sync setup must document the Supabase publishable key.');
assert.match(cloudSetupSource, /VITE_CLERK_PUBLISHABLE_KEY/, 'Cloud sync setup must document the Clerk publishable key.');
assert.match(cloudSetupSource, /Third-Party Auth/, 'Cloud sync setup must document the Clerk/Supabase third-party trust configuration.');

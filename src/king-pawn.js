import { Chess } from 'chess.js';
import { engine } from './engine.js';
import { saveEngine } from './save-engine.js';
import './king-pawn.css';

const $ = id => document.getElementById(id);
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
let saveState = null;
let chatLog = [];
let hintMove = null;
let hintFen = '';
let saveTimer = null;
let restoreComplete = false;
let currentBackgroundImage = '';
let currentBackgroundUrl = '';
let avatarImages = { player: '', opponent: '' };
let savedGames = [];
let activeSaveGameId = null;
let backgroundDimmer = 56;
let aiAdapter = null;

function safeImageData(file) {
  return new Promise((resolve, reject) => {
    if (!file || !/^image\/(png|jpeg|webp)$/i.test(file.type)) return reject(new Error('Choose a JPG, PNG, or WebP image.'));
    if (file.size > MAX_IMAGE_BYTES) return reject(new Error('That image is over 8 MB. Choose a smaller image.'));
    const image = new Image();
    const url = URL.createObjectURL(file);
    image.onload = () => {
      const scale = Math.min(1, 1920 / Math.max(image.naturalWidth, image.naturalHeight));
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
      canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
      const context = canvas.getContext('2d');
      if (!context) { URL.revokeObjectURL(url); reject(new Error('Image compression is unavailable.')); return; }
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(url);
      canvas.toBlob(blob => {
        if (!blob) return reject(new Error('The image could not be compressed.'));
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () => reject(new Error('The image could not be read.'));
        reader.readAsDataURL(blob);
      }, file.type === 'image/png' ? 'image/png' : 'image/webp', 0.84);
    };
    image.onerror = () => { URL.revokeObjectURL(url); reject(new Error('The selected image could not be opened.')); };
    image.src = url;
  });
}

function saveLegacySettings() {
  const stored = {};
  for (let i = 0; i < localStorage.length; i += 1) {
    const key = localStorage.key(i);
    if (!key || !key.startsWith('glass-chess-') || /token|secret|auth/i.test(key)) continue;
    if (key.includes('save-engine')) continue;
    try { stored[key] = localStorage.getItem(key); } catch {}
  }
  return stored;
}

function queueSave(patch) {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    saveEngine.saveData({ ...patch, localStorage: saveLegacySettings() })
      .then(value => { saveState = value; window.GlassChessCloud?.queueSync?.(); })
      .catch(error => showToast('Save problem: ' + error.message, true));
  }, 180);
}

function showToast(message, isError = false) {
  let toast = $('gc-save-toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'gc-save-toast';
    toast.setAttribute('role', 'status');
    document.body.appendChild(toast);
  }
  toast.textContent = message;
  toast.classList.toggle('gc-toast-error', Boolean(isError));
  toast.classList.add('gc-toast-visible');
  clearTimeout(toast._hideTimer);
  toast._hideTimer = setTimeout(() => toast.classList.remove('gc-toast-visible'), 2600);
}

function applyBackground(dataUrl) {
  currentBackgroundImage = dataUrl || '';
  if (!dataUrl) {
    document.body.classList.remove('gc-custom-background');
    document.body.style.removeProperty('--gc-custom-background-image');
    document.body.style.removeProperty('background-image');
    document.body.style.removeProperty('background-size');
    document.body.style.removeProperty('background-position');
    return;
  }
  const dim = Math.max(0, Math.min(0.88, Number(backgroundDimmer) / 100));
  const lower = Math.min(0.94, dim + 0.12);
  document.body.classList.add('gc-custom-background');
  document.body.style.setProperty('--gc-custom-background-image', 'url("' + dataUrl.replace(/["\\\n\r]/g, '') + '")');
  // main.js uses an important inline background shorthand; set the image layer inline too.
  document.body.style.setProperty('background-image', 'linear-gradient(rgba(8,12,22,' + dim + '), rgba(8,12,22,' + lower + ')), var(--gc-custom-background-image)', 'important');
  document.body.style.setProperty('background-size', 'cover', 'important');
  document.body.style.setProperty('background-position', 'center', 'important');
  document.body.style.setProperty('background-attachment', 'fixed', 'important');
}

function createAvatar(label, side, initial) {
  const inputId = 'gc-avatar-file-' + side;
  let button = document.querySelector('[data-gc-avatar="' + side + '"]');
  if (!button) {
    const playerLabel = side === 'opponent'
      ? document.querySelector('.board-section > .player-label:not(.bottom-player)')
      : document.querySelector('.board-section > .bottom-player');
    if (!playerLabel) return null;
    const oldGlyph = playerLabel.querySelector(':scope > span');
    const strong = playerLabel.querySelector(':scope > strong');
    button = document.createElement('button');
    button.type = 'button';
    button.className = 'gc-player-avatar';
    button.dataset.gcAvatar = side;
    button.setAttribute('aria-label', 'Upload ' + label + ' profile picture');
    button.title = 'Change ' + label + ' picture';
    button.textContent = initial;
    if (oldGlyph) oldGlyph.replaceWith(button);
    else playerLabel.insertBefore(button, strong || null);
    button.addEventListener('click', () => $(inputId)?.click());
    const input = document.createElement('input');
    input.type = 'file';
    input.id = inputId;
    input.accept = 'image/png,image/jpeg,image/webp';
    input.hidden = true;
    input.addEventListener('change', async () => {
      const file = input.files?.[0];
      if (!file) return;
      try {
        const image = await safeImageData(file);
        applyAvatar(side, image);
        queueSave({ avatars: { [side]: image } });
        showToast(label + ' picture saved on this device.');
      } catch (error) { showToast(error.message, true); }
      input.value = '';
    });
    document.body.appendChild(input);
  }
  return button;
}

function applyAvatar(side, dataUrl) {
  avatarImages[side] = dataUrl || '';
  const button = document.querySelector('[data-gc-avatar="' + side + '"]');
  if (!button) return;
  if (dataUrl) {
    button.textContent = '';
    button.style.backgroundImage = 'url("' + dataUrl + '")';
    button.classList.add('has-image');
  } else {
    button.style.removeProperty('background-image');
    button.classList.remove('has-image');
    button.textContent = side === 'player' ? '♔' : '♚';
  }
}

function mountPersonalization() {
  createAvatar('opponent', 'opponent', '♚');
  createAvatar('player', 'player', '♔');
  installBoardExportActions();

  const options = $('gc-options');
  if (!options || $('gc-personalization')) return;
  const section = document.createElement('section');
  section.id = 'gc-personalization';
  section.innerHTML = [
    '<div class="divider"></div>',
    '<p class="eyebrow">PERSONALIZE YOUR BOARD</p>',
    '<button type="button" id="gc-background-open" class="gc-settings-action">Customize Theme / Upload Background</button>',
    '<input type="file" id="gc-background-file" accept="image/png,image/jpeg,image/webp" hidden>',
    '<label for="gc-background-preset">Preset background</label>',
    '<select id="gc-background-preset"><option value="midnight">Midnight</option><option value="sky">Open Sky</option><option value="aurora">Aurora Lights</option><option value="fruit">Colorful Fruit</option><option value="sunset">Sunset</option><option value="ocean">Deep Ocean</option><option value="forest">Forest</option><option value="marble">Marble</option></select>',
    '<label for="gc-background-dimmer">Background dimmer <span id="gc-background-dimmer-value">56%</span></label>',
    '<input id="gc-background-dimmer" type="range" min="0" max="88" value="56">',
    '<label for="gc-background-url">Or paste an image URL</label>',
    '<input id="gc-background-url" type="url" placeholder="https://example.com/background.jpg" autocomplete="url">',
    '<div class="gc-settings-actions"><button type="button" id="gc-background-apply">Apply URL</button><button type="button" id="gc-background-reset">Reset to Default</button></div>',
    '<p class="gc-settings-note">Click either player avatar beside the board to upload a profile picture.</p>',
    '<div class="divider"></div>',
    '<p class="eyebrow">PORTABLE SAVE</p>',
    '<div class="gc-settings-actions"><button type="button" id="gc-save-export">Export Save Data</button><button type="button" id="gc-save-import-open">Import Save Data</button></div>',
    '<input type="file" id="gc-save-import" accept=".json,.kingpawn,application/json" hidden>',
    '<p class="gc-settings-note" id="gc-cloud-sync-note">Local autosave is on. Cloud sync is not configured; use Export / Import to move a profile between devices.</p>'
  ].join('');
  options.appendChild(section);

  $('gc-background-open').addEventListener('click', () => $('gc-background-file').click());
  $('gc-background-preset').addEventListener('change', event => {
    currentBackgroundUrl = '';
    applyBackground('');
    window.GlassChess?.updateAppearance?.({ background: event.target.value });
    queueSave({ backgroundImage: '', backgroundUrl: '', backgroundPreset: event.target.value });
    showToast('Preset background applied.');
  });
  $('gc-background-dimmer').addEventListener('input', event => {
    backgroundDimmer = Number(event.target.value);
    $('gc-background-dimmer-value').textContent = backgroundDimmer + '%';
    if (currentBackgroundImage) applyBackground(currentBackgroundImage);
    queueSave({ backgroundDimmer });
  });
  $('gc-background-file').addEventListener('change', async () => {
    const file = $('gc-background-file').files?.[0];
    if (!file) return;
    try {
      const image = await safeImageData(file);
      applyBackground(image);
      $('gc-background-url').value = '';
      currentBackgroundUrl = '';
      queueSave({ backgroundImage: image, backgroundUrl: '' });
      showToast('Custom background saved.');
    } catch (error) { showToast(error.message, true); }
    $('gc-background-file').value = '';
  });
  $('gc-background-apply').addEventListener('click', () => {
    const raw = $('gc-background-url').value.trim();
    let url;
    try { url = new URL(raw); } catch { showToast('Paste a valid image URL first.', true); return; }
    if (!['http:', 'https:'].includes(url.protocol)) {
      showToast('Use an http or https image URL.', true);
      return;
    }
    currentBackgroundUrl = url.href;
    applyBackground(url.href);
    queueSave({ backgroundImage: url.href, backgroundUrl: url.href });
    showToast('Background URL saved.');
  });
  $('gc-background-reset').addEventListener('click', () => {
    currentBackgroundUrl = '';
    applyBackground('');
    $('gc-background-url').value = '';
    window.GlassChess?.updateAppearance?.({ background: 'midnight' });
    $('gc-background-preset').value = 'midnight';
    backgroundDimmer = 56;
    $('gc-background-dimmer').value = '56';
    $('gc-background-dimmer-value').textContent = '56%';
    queueSave({ backgroundImage: '', backgroundUrl: '', backgroundDimmer, backgroundPreset: 'midnight' });
    showToast('Default background restored.');
  });
  $('gc-save-export').addEventListener('click', exportSave);
  $('gc-save-import-open').addEventListener('click', () => $('gc-save-import').click());
  $('gc-save-import').addEventListener('change', importSave);
}

function exportBlob(filename, content, type) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1200);
}

async function exportSave() {
  try {
    clearTimeout(saveTimer);
    const api = window.GlassChess;
    await saveEngine.saveData({
      backgroundImage: currentBackgroundImage,
      backgroundUrl: currentBackgroundUrl,
      avatars: avatarImages,
      chatLog,
      games: savedGames,
      activePgn: api?.pgn || '',
      activeFen: api?.fen || '',
      localStorage: saveLegacySettings()
    });
    const json = await saveEngine.exportSave();
    exportBlob('glass-chess.kingpawn.json', json, 'application/json');
    showToast('Your complete Glass Chess save was exported.');
  } catch (error) { showToast('Export failed: ' + error.message, true); }
}

async function importSave(event) {
  const file = event.target.files?.[0];
  if (!file) return;
  try {
    if (file.size > 60 * 1024 * 1024) throw new Error('The save file is larger than 60 MB.');
    const text = await file.text();
    const data = await saveEngine.importSave(text);
    saveState = data;
    savedGames = Array.isArray(data.games) ? data.games.slice() : [];
    currentBackgroundUrl = data.backgroundUrl || '';
    for (const [key, value] of Object.entries(data.localStorage || {})) {
      try { localStorage.setItem(key, String(value)); } catch {}
    }
    chatLog = Array.isArray(data.chatLog) ? data.chatLog.slice(-300) : [];
    applyBackground(data.backgroundImage || '');
    applyAvatar('player', data.avatars?.player || '');
    applyAvatar('opponent', data.avatars?.opponent || '');
    const urlInput = $('gc-background-url');
    if (urlInput) urlInput.value = data.backgroundUrl || '';
    const api = window.GlassChess;
    if (api && data.activePgn && typeof api.loadPgn === 'function') api.loadPgn(data.activePgn);
    else if (api && data.activeFen && typeof api.loadFen === 'function') api.loadFen(data.activeFen);
    renderChat();
    showToast('Save imported. Reloading Glass Chess to apply all settings and restore the saved game…');
    window.setTimeout(() => window.location.reload(), 650);
  } catch (error) { showToast('Import failed: ' + error.message, true); }
  event.target.value = '';
}

function currentBoardContext() {
  const api = window.GlassChess;
  const chess = api?.game;
  const material = { w: { p: 0, n: 0, b: 0, r: 0, q: 0 }, b: { p: 0, n: 0, b: 0, r: 0, q: 0 } };
  try {
    for (const row of chess?.board?.() || []) for (const piece of row || []) {
      if (piece && material[piece.color]?.[piece.type] !== undefined) material[piece.color][piece.type] += 1;
    }
  } catch {}
  const inCheck = Boolean(chess?.isCheck?.());
  return {
    fen: api?.fen || '', pgn: api?.pgn || '', history: api?.history || [],
    gameOver: Boolean(api?.gameOver), turn: api?.turn || 'w', inCheck,
    checkState: inCheck ? (api?.turn === 'w' ? 'White is in check' : 'Black is in check') : 'No king is in check',
    material
  };
}

function addChatMessage(role, content, context = currentBoardContext()) {
  chatLog.push({
    role,
    content: String(content),
    fen: context.fen,
    pgn: context.pgn,
    turn: context.turn,
    inCheck: context.inCheck,
    checkState: context.checkState,
    material: context.material,
    at: new Date().toISOString()
  });
  chatLog = chatLog.slice(-300);
  renderChat();
  queueSave({ chatLog });
}

function chessTopicAnswer(question, context) {
  const q = question.toLowerCase();
  const current = (() => { try { return new Chess(context.fen); } catch { return null; } })();
  const boardLine = current
    ? ' Current position: ' + (current.turn() === 'w' ? 'White' : 'Black') + ' to move, ' +
      current.moves().length + ' legal moves' + (current.isCheck() ? ', and the king is in check' : '') + '.'
    : '';
  const opening = [
    [/ruy lopez|spanish opening/i, 'The Ruy Lopez starts 1.e4 e5 2.Nf3 Nc6 3.Bb5. White pressures the c6-knight, which supports e5. Develop smoothly, castle, and keep central tension; Black can challenge the bishop with ...a6 or develop with ...Nf6.'],
    [/italian game|giuoco piano/i, 'The Italian Game begins 1.e4 e5 2.Nf3 Nc6 3.Bc4. White aims at f7 and can build with c3 and d4. Black should develop quickly and contest the center rather than chase the bishop.'],
    [/sicilian/i, 'The Sicilian Defense begins 1.e4 c5. Black fights for d4 asymmetrically and often gets active queenside play, while White usually gets space and attacking chances. Know your chosen variation before memorizing long move sequences.'],
    [/queens gambit/i, 'The Queen’s Gambit begins 1.d4 d5 2.c4. White offers the c-pawn to challenge Black’s d5-pawn and gain central influence. Black can accept, decline with ...e6, or play ...c6.'],
    [/london system/i, 'The London System usually starts 1.d4 and 2.Bf4, often followed by e3, Nf3, Bd3, and c3. It is a setup opening: develop safely, watch the e5 square, and choose a central break when prepared.'],
    [/french defense/i, 'The French Defense begins 1.e4 e6 2.d4 d5. Black attacks White’s center. The light-squared bishop can be cramped, so plan its development and time ...c5 or ...f6 carefully.'],
    [/caro.?kann/i, 'The Caro-Kann begins 1.e4 c6 2.d4 d5. Black challenges the center while usually keeping a solid pawn structure. Develop the light-squared bishop actively before ...e6 when the variation allows.']
  ].find(([pattern]) => pattern.test(q));
  if (opening) return opening[1] + boardLine;

  if (/en passant/.test(q)) return 'En passant is a special pawn capture. When an enemy pawn advances two squares from its starting square and lands beside your pawn, you may capture it as though it had moved only one square. You must do it immediately on your next move or the right disappears.' + boardLine;
  if (/castl|castle|castling right/.test(q)) return 'Castling moves your king two squares toward a rook, then places that rook beside the king. You cannot castle if the king or chosen rook has moved, a piece is between them, your king is in check, or the king crosses or lands on an attacked square.' + boardLine;
  if (/promot/.test(q)) return 'A pawn reaching the last rank must promote to a queen, rook, bishop, or knight. It does not have to become a queen; underpromotion to a knight can create a fork or avoid stalemate.' + boardLine;
  if (/stalemate/.test(q)) return 'Stalemate is a draw: the side to move is not in check but has no legal move. Be careful when winning with a queen or rook—do not take away every enemy move unless it is checkmate.' + boardLine;
  if (/threefold|fifty.?move|50.?move|repetition|draw rule/.test(q)) return 'A player may claim a draw after the same position occurs three times with the same player to move and the same legal rights. A draw may also be claimable under the 50-move rule after 50 moves by each side without a pawn move or capture. The automatic 75-move and fivefold rules are separate.' + boardLine;
  if (/fork/.test(q)) return 'A fork is one move that attacks two or more targets at once. Knights are famous for forks because they jump, but pawns, queens, rooks, and bishops can fork too. Look for checks that attack the king while hitting a queen or rook.' + boardLine;
  if (/pin/.test(q)) return 'A pin is an attack along a line where moving the attacked piece exposes a more valuable piece behind it. An absolute pin exposes the king, so the pinned piece cannot legally move; a relative pin exposes a queen or another valuable target.' + boardLine;
  if (/skewer/.test(q)) return 'A skewer is a line attack against a valuable piece that must move, exposing a less valuable piece behind it. It is like a pin in reverse: the more valuable target is in front.' + boardLine;
  if (/discovered attack|discovery/.test(q)) return 'A discovered attack happens when one piece moves out of the way and reveals an attack from a bishop, rook, or queen behind it. A discovered check is especially powerful because the moving piece can create a second threat.' + boardLine;
  if (/opposition|king and pawn|pawn endgame/.test(q)) return 'In king-and-pawn endings, the king is an active fighting piece. Opposition means the kings face each other with one square between them; the side not to move often has the opposition. Use it to step in front of your pawn, shoulder the enemy king away, and create a passed pawn.' + boardLine;
  if (/lucena/.test(q)) return 'The Lucena position is a classic winning rook-and-pawn endgame: the stronger side has a rook pawn on the seventh rank, king in front of it, and must build a bridge with the rook to shelter the king from checks.' + boardLine;
  if (/philidor/.test(q)) return 'The Philidor position is a key drawing method in rook endings. The defending rook controls the pawn’s advance from the third rank; when the pawn advances, the rook moves behind it and gives checks from the rear.' + boardLine;
  if (/checkmate|mate/.test(q)) return current?.isCheckmate()
    ? 'The game is checkmate. The checked king has no legal escape, capture, or block. The game is over.'
    : 'Checkmate means the king is in check and there is no legal move that removes the check. Common patterns include back-rank mate, smothered mate, ladder mate, and mating nets with queen and rook.' + boardLine;
  if (/famous|grandmaster|immortal game|evergreen|opera game|game of the century|kasparov|fischer|morphy/.test(q)) {
    return 'A few famous games to study: Morphy’s Opera Game (Paris, 1858) shows rapid development and a direct attack; Anderssen–Kieseritzky (1851), the Immortal Game, features spectacular sacrifices; Fischer–Byrne (1956), the Game of the Century, is a model of piece activity and a queen sacrifice; Kasparov–Topalov (1999) is renowned for a long tactical combination. Replay them slowly and ask why each piece improves.';
  }
  if (/opening/.test(q)) return 'In the opening, fight for the center, develop knights and bishops, protect your king by castling, and avoid moving the same piece repeatedly without a reason. Common first moves are 1.e4, 1.d4, 1.Nf3, and 1.c4.' + boardLine;
  if (/endgame/.test(q)) return 'In endgames, activate your king, create passed pawns, use your rook actively (often behind passed pawns), and calculate pawn races precisely. King activity is often more important than preserving a pawn.' + boardLine;
  if (/check/.test(q) && current?.isCheck()) return 'Your king is currently in check. First find every legal response: move the king, capture the checking piece, or block the line if the check is sliding. A double check can only be answered by moving the king.' + boardLine;
  return 'I have the live position and move list in view. Start by checking king safety, loose pieces, forcing checks and captures, and pawn breaks. Ask me about a specific rule, opening, tactic, endgame, famous game, or type “best move” and I will request a Stockfish line for this exact position.' + boardLine;
}

async function makeChessAnswer(question) {
  const context = currentBoardContext();
  const chessWords = /\b(chess|board|opening|endgame|tactic|fork|pin|skewer|check|mate|castl|en passant|pawn|rook|bishop|knight|queen|king|move|position|fen|pgn|grandmaster|fischer|kasparov|morphy|stalemate|promotion|opposition|lucena|philidor)\b/i;
  if (!chessWords.test(question)) {
    return 'I am King Pawn, royal advisor of the 64 squares. I only advise on chess matters. Ask me about a move, opening, tactic, rule, endgame, or this board.';
  }

  // A secure server-backed model can be attached without exposing its API key in the browser.
  if (aiAdapter) {
    try {
      const answer = await aiAdapter({
        systemPrompt: 'You are King Pawn, a helpful chess-only advisor for Glass Chess. Answer chess questions accurately and clearly, explain ideas in beginner-friendly steps, distinguish rules from strategy, and never invent a move or claim certainty without calculation. If the user asks about a non-chess topic, politely redirect them to chess. Analyze the supplied live board position and recent PGN when relevant. Do not make moves for the user.',
        question,
        board: {
          fen: context.fen,
          pgn: context.pgn,
          history: context.history,
          turn: context.turn,
          gameOver: context.gameOver,
          inCheck: context.inCheck,
          checkState: context.checkState,
          material: context.material
        }
      });
      const text = typeof answer === 'string' ? answer : answer?.answer;
      if (typeof text === 'string' && text.trim()) return text.trim().slice(0, 12000);
    } catch (error) {
      console.warn('King Pawn AI adapter failed; using the local chess advisor:', error);
    }
  }

  const contextAnswer = chessTopicAnswer(question, context);
  if (/\b(best move|what should i play|what should my plan|analy[sz]e (this|the|my)|current position|why was my last move|is this move good|what is the plan)\b/i.test(question)) {
    if (!context.fen) return contextAnswer;
    if (context.gameOver) return 'This game is already over, so there is no next move to recommend. Review the final position in the move list.';
    if (window.GlassChess?.thinking || engine.searchPromise) {
      return 'Stockfish is already working on another move or analysis. Let that finish, then ask me again. The live FEN and PGN are attached to this chat.';
    }
    try {
      const result = await engine.search(context.fen, { depth: 12, timeoutMs: 5000 });
      if (result.cancelled || !result.bestMove) return 'Stockfish did not return a legal continuation. Try again after the engine is ready.';
      const uci = result.bestMove;
      const moveGame = new Chess(context.fen);
      const move = moveGame.move({
        from: uci.slice(0, 2),
        to: uci.slice(2, 4),
        ...(uci.length > 4 ? { promotion: uci[4] } : {})
      });
      if (!move) return 'Stockfish returned a move that could not be validated against the live position.';
      const last = context.history.at(-1);
      const lastText = last ? ' Your last move was ' + last.san + '.' : '';
      return 'Stockfish’s current recommendation is ' + move.san + ' (' + move.from + ' to ' + move.to + ').' + lastText +
        ' This is the engine’s best line at depth 12, not a guaranteed win. FEN: ' + context.fen;
    } catch (error) {
      return 'I could not finish the live analysis: ' + (error.message || 'Stockfish is unavailable.') + ' The board context is still attached, so ask again once the engine is ready.';
    }
  }
  return contextAnswer;
}

function renderChat() {
  const list = $('gc-king-pawn-messages');
  if (!list) return;
  list.replaceChildren();
  for (const message of chatLog.slice(-80)) {
    const row = document.createElement('div');
    row.className = 'gc-kp-message ' + (message.role === 'user' ? 'is-user' : 'is-assistant');
    const label = document.createElement('small');
    label.textContent = message.role === 'user' ? 'YOU' : 'KING PAWN';
    const body = document.createElement('p');
    body.textContent = message.content;
    row.append(label, body);
    list.appendChild(row);
  }
  list.scrollTop = list.scrollHeight;
}


function boardPngBlob() {
  return new Promise((resolve, reject) => {
    const board = $('board');
    const api = window.GlassChess;
    if (!board || !api?.fen) return reject(new Error('The chessboard is not ready.'));
    let position;
    try { position = new Chess(api.fen); } catch { return reject(new Error('The current board position is invalid.')); }
    const squares = Array.from(board.querySelectorAll('[data-square]'));
    if (squares.length !== 64) return reject(new Error('The board is still rendering. Try again.'));
    const canvas = document.createElement('canvas');
    const cell = 144;
    canvas.width = cell * 8;
    canvas.height = cell * 8;
    const ctx = canvas.getContext('2d');
    if (!ctx) return reject(new Error('Canvas export is unavailable in this browser.'));
    const glyphs = {
      wk:'♔',wq:'♕',wr:'♖',wb:'♗',wn:'♘',wp:'♙',
      bk:'♚',bq:'♛',br:'♜',bb:'♝',bn:'♞',bp:'♟'
    };
    squares.forEach((element, index) => {
      const x = (index % 8) * cell;
      const y = Math.floor(index / 8) * cell;
      const style = getComputedStyle(element);
      ctx.fillStyle = style.backgroundColor || '#b58863';
      ctx.fillRect(x, y, cell, cell);
      const squareName = element.dataset.square;
      const piece = position.get(squareName);
      if (piece) {
        const glyph = glyphs[piece.color + piece.type];
        ctx.save();
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.font = '112px "Segoe UI Symbol", "DejaVu Sans", serif';
        ctx.lineWidth = 2.2;
        ctx.strokeStyle = piece.color === 'w' ? '#282828' : '#eee8dc';
        ctx.fillStyle = piece.color === 'w' ? '#fffdf4' : '#171717';
        ctx.strokeText(glyph, x + cell / 2, y + cell / 2 + 2);
        ctx.fillText(glyph, x + cell / 2, y + cell / 2 + 2);
        ctx.restore();
      }
      const coordinates = element.querySelectorAll('.gc-coordinate');
      if (coordinates.length) {
        ctx.save();
        ctx.font = '17px system-ui, sans-serif';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'top';
        ctx.fillStyle = 'rgba(20,24,32,.8)';
        for (const coord of coordinates) {
          if (coord.classList.contains('gc-rank')) ctx.fillText(coord.textContent, x + 5, y + 4);
          if (coord.classList.contains('gc-file')) {
            ctx.textAlign = 'right';
            ctx.textBaseline = 'bottom';
            ctx.fillText(coord.textContent, x + cell - 5, y + cell - 4);
          }
        }
        ctx.restore();
      }
    });
    canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('The PNG image could not be created.')), 'image/png');
  });
}

async function exportBoardPng(copyToClipboard) {
  const blob = await boardPngBlob();
  if (copyToClipboard) {
    if (!navigator.clipboard?.write || !window.ClipboardItem) {
      throw new Error('This browser does not allow copying images. Use Download PNG instead.');
    }
    await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
    showToast('Board PNG copied to clipboard.');
    return;
  }
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  const api = window.GlassChess;
  const moveNumber = Math.max(1, Math.ceil((api?.history?.length || 0) / 2));
  link.download = 'chess-match-' + new Date().toISOString().slice(0, 10) + '-' + moveNumber + '.png';
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1200);
  showToast('Board PNG downloaded.');
}

function installBoardExportActions() {
  const controls = document.querySelector('.board-controls');
  if (!controls || $('gc-export-toolbar')) return;
  const toolbar = document.createElement('div');
  toolbar.id = 'gc-export-toolbar';
  toolbar.setAttribute('role', 'group');
  toolbar.setAttribute('aria-label', 'Board image export');

  const findExisting = (kind, terms) => Array.from(document.querySelectorAll('button')).find(button => {
    if (button.closest('#gc-export-toolbar')) return false;
    const label = (button.textContent || '') + ' ' + (button.getAttribute('aria-label') || '') + ' ' + button.id;
    return terms.some(term => label.toLowerCase().includes(term));
  });
  const entries = [
    { kind:'download', terms:['download png','download-png'], label:'Download PNG' },
    { kind:'copy', terms:['copy png','copy-png'], label:'Copy PNG' }
  ];
  for (const entry of entries) {
    let button = findExisting(entry.kind, entry.terms);
    if (!button) {
      button = document.createElement('button');
      button.type = 'button';
      button.textContent = entry.label;
      button.addEventListener('click', async () => {
        button.disabled = true;
        try { await exportBoardPng(entry.kind === 'copy'); }
        catch (error) { showToast(error.message, true); }
        finally { button.disabled = false; }
      });
    } else {
      button.textContent = entry.label;
      button.classList.add('gc-export-existing');
    }
    button.dataset.gcExportKind = entry.kind;
    toolbar.appendChild(button);
  }
  controls.appendChild(toolbar);
}

function mountKingPawn() {
  if ($('gc-king-pawn')) return;
  const dock = document.createElement('div');
  dock.id = 'gc-king-pawn';
  dock.innerHTML = [
    '<button type="button" id="gc-king-pawn-launcher" aria-expanded="false" aria-controls="gc-king-pawn-panel"><span aria-hidden="true">♛</span><small>KING PAWN</small></button>',
    '<section id="gc-king-pawn-panel" aria-label="King Pawn chess assistant" hidden>',
    '<header><span class="gc-kp-crown">♛</span><div><strong>King Pawn</strong><small>Chess advisor · Board-aware</small></div><button type="button" id="gc-king-pawn-close" aria-label="Close King Pawn">×</button></header>',
    '<div class="gc-kp-context" id="gc-kp-context">Connected to your current board and move list.</div>',
    '<div class="gc-kp-prompts" aria-label="Quick chess questions">' +
      '<button type="button" data-kp-prompt="Analyze my current position">Analyze position</button>' +
      '<button type="button" data-kp-prompt="Why was my last move good or bad?">Review last move</button>' +
      '<button type="button" data-kp-prompt="What opening are we playing?">Identify opening</button>' +
      '<button type="button" data-kp-prompt="Suggest a strategic plan">Strategic plan</button>' +
    '</div>',
    '<div id="gc-king-pawn-messages" aria-live="polite"></div>',
    '<form id="gc-king-pawn-form"><label class="gc-kp-sr-only" for="gc-king-pawn-input">Ask King Pawn a chess question</label><textarea id="gc-king-pawn-input" rows="2" maxlength="1200" placeholder="Ask about a move, opening, tactic, or rule…"></textarea><button type="submit">Ask King Pawn</button></form>',
    '<footer>Powered by chess knowledge + Stockfish 19</footer>',
    '</section>'
  ].join('');
  document.body.appendChild(dock);
  const panel = $('gc-king-pawn-panel');
  const launcher = $('gc-king-pawn-launcher');
  function close() {
    panel.hidden = true;
    launcher.setAttribute('aria-expanded', 'false');
  }
  function open() {
    panel.hidden = false;
    launcher.setAttribute('aria-expanded', 'true');
    $('gc-king-pawn-input')?.focus();
    renderChat();
  }
  launcher.addEventListener('click', () => panel.hidden ? open() : close());
  $('gc-king-pawn-close').addEventListener('click', close);
  dock.querySelectorAll('[data-kp-prompt]').forEach(button => button.addEventListener('click', () => {
    $('gc-king-pawn-input').value = button.dataset.kpPrompt || '';
    $('gc-king-pawn-form').requestSubmit();
  }));
  $('gc-king-pawn-form').addEventListener('submit', async event => {
    event.preventDefault();
    const input = $('gc-king-pawn-input');
    const question = input.value.trim();
    if (!question) return;
    const context = currentBoardContext();
    addChatMessage('user', question, context);
    input.value = '';
    const submit = $('gc-king-pawn-form').querySelector('button[type="submit"]');
    submit.disabled = true;
    submit.textContent = 'Thinking…';
    addChatMessage('assistant', 'Let me study the board…', context);
    try {
      const answer = await makeChessAnswer(question);
      const last = chatLog.at(-1);
      if (last?.role === 'assistant') {
        last.content = answer;
        last.fen = context.fen;
        last.pgn = context.pgn;
        renderChat();
        queueSave({ chatLog });
      } else addChatMessage('assistant', answer, context);
    } finally {
      submit.disabled = false;
      submit.textContent = 'Ask King Pawn';
      input.focus();
    }
  });
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && !panel.hidden) close();
  });
  renderChat();
}

function renderHintArrow(detail) {
  const board = $('board');
  if (!board) return;
  board.querySelector('.gc-hint-arrow-layer')?.remove();
  hintMove = detail?.move || null;
  hintFen = detail?.fen || '';
  if (!hintMove || hintFen !== window.GlassChess?.fen) return;

  const flipped = Boolean(window.GlassChess?.isFlipped);
  const point = square => {
    const file = square.charCodeAt(0) - 97;
    const rank = 8 - Number(square[1]);
    return {
      x: ((flipped ? 7 - file : file) + 0.5) * 12.5,
      y: ((flipped ? 7 - rank : rank) + 0.5) * 12.5
    };
  };
  const from = point(hintMove.from);
  const to = point(hintMove.to);
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 100 100');
  svg.setAttribute('preserveAspectRatio', 'none');
  svg.classList.add('gc-hint-arrow-layer');
  svg.setAttribute('aria-hidden', 'true');
  const defs = document.createElementNS(svg.namespaceURI, 'defs');
  const marker = document.createElementNS(svg.namespaceURI, 'marker');
  marker.setAttribute('id', 'gc-hint-arrow-head');
  marker.setAttribute('markerWidth', '5');
  marker.setAttribute('markerHeight', '5');
  marker.setAttribute('refX', '3.8');
  marker.setAttribute('refY', '2.5');
  marker.setAttribute('orient', 'auto');
  const head = document.createElementNS(svg.namespaceURI, 'path');
  head.setAttribute('d', 'M0,0 L5,2.5 L0,5 Z');
  head.setAttribute('fill', '#ffe28a');
  marker.appendChild(head);
  defs.appendChild(marker);
  svg.appendChild(defs);
  const line = document.createElementNS(svg.namespaceURI, 'line');
  line.setAttribute('x1', String(from.x));
  line.setAttribute('y1', String(from.y));
  line.setAttribute('x2', String(to.x));
  line.setAttribute('y2', String(to.y));
  line.setAttribute('stroke', '#ffe28a');
  line.setAttribute('stroke-width', '1.7');
  line.setAttribute('stroke-linecap', 'round');
  line.setAttribute('marker-end', 'url(#gc-hint-arrow-head)');
  line.setAttribute('opacity', '.95');
  svg.appendChild(line);
  board.appendChild(svg);
}

function installHintFeedback() {
  document.addEventListener('glasschess:hint', event => renderHintArrow(event.detail));
  document.addEventListener('glasschess:statechange', event => {
    const fen = event.detail?.fen || '';
    if (hintMove && fen !== hintFen) {
      hintMove = null;
      $('board')?.querySelector('.gc-hint-arrow-layer')?.remove();
    }
    const context = currentBoardContext();
    const status = $('gc-kp-context');
    if (status) {
      status.textContent = 'Live position · ' + (context.turn === 'w' ? 'White' : 'Black') +
        ' to move · ' + context.history.length + ' plies · ' + context.checkState +
        ' · material counts · FEN and PGN update automatically';
    }
  });
}

async function restoreAndMount() {
  try {
    saveState = await saveEngine.loadData();
    chatLog = Array.isArray(saveState.chatLog) ? saveState.chatLog.slice(-300) : [];
    savedGames = Array.isArray(saveState.games) ? saveState.games.slice() : [];
    currentBackgroundUrl = saveState.backgroundUrl || '';
    backgroundDimmer = Math.max(0, Math.min(88, Number(saveState.backgroundDimmer ?? 56)));
    applyBackground(saveState.backgroundImage || '');
    applyAvatar('player', saveState.avatars?.player || '');
    applyAvatar('opponent', saveState.avatars?.opponent || '');
    if ($('gc-background-url')) $('gc-background-url').value = saveState.backgroundUrl || '';
    if ($('gc-background-dimmer')) $('gc-background-dimmer').value = String(backgroundDimmer);
    if ($('gc-background-dimmer-value')) $('gc-background-dimmer-value').textContent = backgroundDimmer + '%';
    if ($('gc-background-preset')) $('gc-background-preset').value = saveState.backgroundPreset || 'midnight';
    const api = window.GlassChess;
    if (api && !api.history?.length && saveState.activePgn && typeof api.loadPgn === 'function') {
      try { api.loadPgn(saveState.activePgn); } catch (error) { console.warn('Saved game could not be restored:', error); }
    }
    renderChat();
    restoreComplete = true;
    const context = currentBoardContext();
    queueSave({ activePgn: context.pgn, activeFen: context.fen, localStorage: saveLegacySettings() });
  } catch (error) {
    console.warn('Glass Chess save engine initialization failed:', error);
    showToast('Local save could not start: ' + error.message, true);
  }
}

function captureGameState(event) {
  const detail = event?.detail || {};
  const api = window.GlassChess;
  if (!api || !restoreComplete) return;
  const pgn = detail.pgn || api.pgn || '';
  const fen = detail.fen || api.fen || '';
  if (!pgn) activeSaveGameId = null;
  if (pgn && !activeSaveGameId) activeSaveGameId = 'match_' + (crypto.randomUUID?.() || (Date.now() + '_' + Math.random().toString(36).slice(2)));
  const gameSnapshot = pgn ? { id: activeSaveGameId, pgn, fen, savedAt: new Date().toISOString(), status: detail.gameOver ? 'finished' : 'in-progress' } : null;
  const games = savedGames.slice();
  if (gameSnapshot) {
    const index = games.findIndex(item => item.id === gameSnapshot.id);
    if (index >= 0) games[index] = gameSnapshot;
    else games.push(gameSnapshot);
    if (games.length > 150) games.splice(0, games.length - 150);
    savedGames = games;
  }
  queueSave({
    activePgn: pgn,
    activeFen: fen,
    games,
    localStorage: saveLegacySettings()
  });
}

let bootStarted = false;
function boot() {
  if (bootStarted) return;
  bootStarted = true;
  mountPersonalization();
  mountKingPawn();
  installHintFeedback();
  void restoreAndMount();
  document.addEventListener('glasschess:statechange', captureGameState);
  // Keep premium settings and match history in the portable save, even when they change
  // without causing a board re-render.
  window.setInterval(() => {
    if (!restoreComplete) return;
    queueSave({ localStorage: saveLegacySettings() });
  }, 5000);
  window.GlassChessKingPawn = {
    name: 'King Pawn',
    getContext: currentBoardContext,
    ask: makeChessAnswer,
    getMessages: () => chatLog.slice(),
    setCloudAdapter: adapter => saveEngine.setCloudAdapter(adapter),
    setAIAdapter(adapter) {
      if (adapter !== null && typeof adapter !== 'function') throw new TypeError('King Pawn AI adapter must be an async function.');
      aiAdapter = adapter;
    },
    syncToCloud: () => saveEngine.saveToCloud(),
    loadFromCloud: () => saveEngine.loadFromCloud(),
    async applyCloudProfile(profile = {}) {
      currentBackgroundUrl = profile.backgroundUrl || '';
      backgroundDimmer = Math.max(0, Math.min(88, Number(profile.backgroundDimmer ?? 56)));
      const background = profile.backgroundImageUrl || profile.backgroundImage || currentBackgroundUrl || '';
      applyBackground(background);
      if ($('gc-background-dimmer')) $('gc-background-dimmer').value = String(backgroundDimmer);
      if ($('gc-background-dimmer-value')) $('gc-background-dimmer-value').textContent = backgroundDimmer + '%';
      if ($('gc-background-url')) $('gc-background-url').value = currentBackgroundUrl;
      if (profile.avatars) {
        avatarImages = { player: profile.avatars.player || '', opponent: profile.avatars.opponent || '' };
        applyAvatar('player', avatarImages.player);
        applyAvatar('opponent', avatarImages.opponent);
      }
      if (Array.isArray(profile.chatLog)) { chatLog = profile.chatLog.slice(-300); renderChat(); }
      for (const [key, value] of Object.entries(profile.localStorage || {})) {
        if (String(key).startsWith('glass-chess-') && !/(token|secret|auth)/i.test(key)) {
          try { localStorage.setItem(key, String(value)); } catch {}
        }
      }
      try {
        const settings = JSON.parse(localStorage.getItem('glass-chess-settings') || '{}');
        window.GlassChess?.updateAppearance?.({
          theme: settings.theme, background: settings.background, backgroundColor: settings.backgroundColor,
          pieceStyle: settings.pieceStyle, whitePieceColor: settings.whitePieceColor, blackPieceColor: settings.blackPieceColor
        });
      } catch {}
      await saveEngine.saveData({ backgroundImage: background, backgroundUrl: currentBackgroundUrl, backgroundDimmer, avatars: avatarImages, chatLog });
    }
  };
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot, { once: true });
} else {
  boot();
}
window.setTimeout(boot, 500);

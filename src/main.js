import { Chess } from "chess.js";
import { engine } from "./engine.js";
import "./features.css";
import { createBoardEffects } from "./board-effects.js";

// ============================================
// GLASS CHESS — MAIN GAME
// ============================================

const $ = id => document.getElementById(id);
const game = new Chess();
let gameStartFen = game.fen();
let suppressGameCallbacks = false;

const PIECES = {
  wk: "♔", wq: "♕", wr: "♖", wb: "♗", wn: "♘", wp: "♙",
  bk: "♚", bq: "♛", br: "♜", bb: "♝", bn: "♞", bp: "♟︎"
};

const PROFILES = {
  casual: 3,
  tactical: 7,
  positional: 11,
  master: 16,
  maximum: 20
};

const THEMES = {
  midnight: ["#d9dfeb", "#52647f"],
  forest: ["#e8e1c9", "#63866c"],
  marble: ["#eee9e2", "#9c9a99"],
  ocean: ["#d9edf2", "#39778c"],
  aurora: ["#e9e8f7", "#5965a2"],
  royal: ["#efe2c9", "#604777"],
  sunset: ["#f7dfc8", "#b85f50"],
  carbon: ["#d5d9df", "#3a4657"]
};

const LEGACY_THEME_MAP = {
  classic: "midnight",
  emerald: "forest",
  slate: "carbon",
  violet: "aurora"
};

const PIECE_SVG = {
  medieval: {
    p: `<path d="M20 84h60l-5 10H25zM33 82c2-8 11-13 11-23 0-5-5-9-5-15 0-10 5-18 11-21 7 3 12 11 12 21 0 6-5 10-5 15 0 10 9 15 11 23z"/><circle cx="50" cy="14" r="10"/><path d="M29 88h42M42 57h16" fill="none" stroke="var(--gc-piece-highlight)" stroke-width="2.5"/>`,
    r: `<path d="M23 15h12v11h10V15h10v11h10V15h12v27H23zM29 42h42l-5 40H34zM20 82h60l-5 12H25z"/><path d="M31 48v27M50 48v27M69 48v27" fill="none" stroke="var(--gc-piece-highlight)" stroke-width="2.5"/>`,
    n: `<path d="M20 84h60l-5 10H25zM28 82c4-14 8-25 4-36l-5-12 15-17 20 7 14 19-5 39z"/><path d="M43 25c-1 10 6 14 15 16l8 12-9 6-11-12-11-2 6-12z"/><circle cx="48" cy="36" r="2.5" fill="var(--gc-piece-highlight)" stroke="none"/><path d="M36 72h30" fill="none" stroke="var(--gc-piece-highlight)" stroke-width="2.5"/>`,
    b: `<path d="M20 84h60l-5 10H25zM33 82c2-12 8-17 9-27-8-6-10-17-3-27l11-15 11 15c7 10 5 21-3 27 1 10 7 15 9 27z"/><path d="M50 20l-6 17 7 8-6 9" fill="none" stroke="var(--gc-piece-highlight)" stroke-width="3"/><path d="M30 88h40" fill="none" stroke="var(--gc-piece-highlight)" stroke-width="2.5"/>`,
    q: `<path d="M20 84h60l-5 10H25zM29 82l-7-40 17 14 11-34 11 34 17-14-7 40z"/><circle cx="22" cy="37" r="6"/><circle cx="39" cy="54" r="5"/><circle cx="50" cy="18" r="6"/><circle cx="61" cy="54" r="5"/><circle cx="78" cy="37" r="6"/><path d="M33 72h34" fill="none" stroke="var(--gc-piece-highlight)" stroke-width="2.5"/>`,
    k: `<path d="M20 84h60l-5 10H25zM32 82c2-13 8-17 8-29h20c0 12 6 16 8 29z"/><path d="M46 12h8v12h12v8H54v12h-8V32H34v-8h12z" /><path d="M30 88h40" fill="none" stroke="var(--gc-piece-highlight)" stroke-width="2.5"/>`
  },
  modern: {
    p: `<path d="M22 84h56l-5 9H27zM34 80c2-13 8-16 8-27h16c0 11 6 14 8 27z"/><circle cx="50" cy="19" r="12"/><path d="M35 85h30" fill="none" stroke="var(--gc-piece-highlight)" stroke-width="3"/>`,
    r: `<path d="M24 13h13v13h8V13h10v13h8V13h13v30H24zM31 43h38v38H31zM21 81h58v12H21z"/><path d="M40 48v28M60 48v28" fill="none" stroke="var(--gc-piece-highlight)" stroke-width="3"/>`,
    n: `<path d="M22 84h56l-5 9H27zM29 81c5-11 5-24 1-35l17-26 25 13 7 23-12 25z"/><path d="M47 25l-3 19 19 8 3 13-20-5-12-12" fill="none" stroke="var(--gc-piece-highlight)" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/><circle cx="51" cy="35" r="3" fill="var(--gc-piece-highlight)" stroke="none"/>`,
    b: `<path d="M22 84h56l-5 9H27zM34 80c3-11 8-15 8-25-9-10-5-25 8-38 13 13 17 28 8 38 0 10 5 14 8 25z"/><path d="M50 22l-7 20 8 7-7 18" fill="none" stroke="var(--gc-piece-highlight)" stroke-width="4" stroke-linecap="round"/>`,
    q: `<path d="M22 84h56l-5 9H27zM29 80l-7-39 18 16 10-31 10 31 18-16-7 39z"/><circle cx="22" cy="37" r="5"/><circle cx="50" cy="20" r="5"/><circle cx="78" cy="37" r="5"/><path d="M34 70h32" fill="none" stroke="var(--gc-piece-highlight)" stroke-width="3"/>`,
    k: `<path d="M22 84h56l-5 9H27zM32 80c2-12 7-16 7-27h22c0 11 5 15 7 27z"/><path d="M46 10h8v14h14v8H54v14h-8V32H32v-8h14z"/><path d="M34 70h32" fill="none" stroke="var(--gc-piece-highlight)" stroke-width="3"/>`
  }
};

const PAGE_BACKGROUNDS = {
  midnight: "Midnight",
  sky: "Open Sky",
  aurora: "Aurora Lights",
  fruit: "Colorful Fruit",
  sunset: "Sunset",
  ocean: "Deep Ocean",
  forest: "Forest",
  marble: "Marble"
};

const DEPTH = 10;

let selected = null;
let legalMoves = [];
let lastMove = null;
let flipped = false;
let thinking = false;
let engineReady = false;
let gameMode = "computer";
let premiumReplayLock = false;
let analysisBestMove = null;
let analysisDepth = 12;
let playerColor = "white";
let profile = "casual";
let gameToken = 0;
let resigned = false;
let winner = "";

let settings = {
  legalMoves: true,
  lastMove: true,
  coordinates: true,
  sounds: true,
  autoFlip: false,
  evaluation: true,
  theme: "midnight",
  background: "midnight",
  backgroundColor: "#18202f",
  pieceStyle: "glass",
  whitePieceColor: "#f7f2e9",
  blackPieceColor: "#263244"
};

try {
  settings = {
    ...settings,
    ...JSON.parse(localStorage.getItem("glass-chess-settings") || "{}")
  };
} catch {
  // Use default settings if saved settings are unavailable.
}

settings.theme = THEMES[settings.theme]
  ? settings.theme
  : (LEGACY_THEME_MAP[settings.theme] || "midnight");
settings.background = PAGE_BACKGROUNDS[settings.background] ? settings.background : "midnight";
settings.backgroundColor = /^#[0-9a-f]{6}$/i.test(settings.backgroundColor || "") ? settings.backgroundColor : "#18202f";
settings.pieceStyle = ["glass", "medieval", "modern"].includes(settings.pieceStyle)
  ? settings.pieceStyle
  : "glass";
settings.whitePieceColor = /^#[0-9a-f]{6}$/i.test(settings.whitePieceColor || "")
  ? settings.whitePieceColor
  : "#f7f2e9";
settings.blackPieceColor = /^#[0-9a-f]{6}$/i.test(settings.blackPieceColor || "")
  ? settings.blackPieceColor
  : "#263244";

// ============================================
// ELEMENTS AND STATUS
// ============================================

const board = $("board");
const boardEffects = createBoardEffects(board, () => settings.sounds);
let lastRenderedOrientation = null;

function setEngineStatus(message) {
  $("engine-status").textContent = message;
}

function saveSettings() {
  try {
    localStorage.setItem(
      "glass-chess-settings",
      JSON.stringify(settings)
    );
  } catch {
    console.warn("Settings could not be saved.");
  }
}

function applyPieceAppearance() {
  document.documentElement.style.setProperty("--gc-piece-white-color", settings.whitePieceColor);
  document.documentElement.style.setProperty("--gc-piece-black-color", settings.blackPieceColor);
  if (document.body) document.body.dataset.gcPieceStyle = settings.pieceStyle;
}

function applyPageBackground(background) {
  const selected = PAGE_BACKGROUNDS[background] ? background : "midnight";
  settings.background = selected;
  if (document.body) document.body.dataset.gcBackground = selected;
  saveSettings();
}

function applyBackgroundColor(color) {
  const selected = /^#[0-9a-f]{6}$/i.test(String(color || "")) ? String(color) : "#18202f";
  settings.backgroundColor = selected;
  document.documentElement.style.setProperty("--gc-page-background-color", selected);
  if (document.body) {
    const layered = `radial-gradient(ellipse at 18% 0%, rgba(255,255,255,.14), transparent 46%), radial-gradient(ellipse at 86% 100%, rgba(0,0,0,.30), transparent 48%), ${selected}`;
    document.body.style.setProperty("background", layered, "important");
    document.body.style.setProperty("background-attachment", "fixed", "important");
  }
  saveSettings();
}

function applyBoardTheme(theme, syncPremium = true, shouldRender = true) {
  const selectedTheme = THEMES[theme] ? theme : "midnight";
  settings.theme = selectedTheme;
  saveSettings();

  if (document.body) {
    Object.keys(THEMES).forEach(name => {
      document.body.classList.toggle(`gc-theme-${name}`, name === selectedTheme);
    });
  }

  const selector = $("gc-theme");
  if (selector && selector.value !== selectedTheme) selector.value = selectedTheme;

  if (shouldRender) render();
  if (syncPremium && window.GlassChessPremium?.setTheme) {
    window.GlassChessPremium.setTheme(selectedTheme);
  }
}

function getHumanSide() {
  return playerColor === "white" ? "w" : "b";
}

function isHumanTurn() {
  return gameMode === "local" || gameMode === "analysis" || game.turn() === getHumanSide();
}

// ============================================
// EXTRA INTERFACE
// ============================================

function createExtraControls() {
  const side = document.querySelector(".side-panel");

  if (side && !$("gc-options")) {
    const panel = document.createElement("section");

    panel.id = "gc-options";
    panel.className = "gc-extra-panel";

    panel.innerHTML = `
      <div class="divider"></div>
      <p class="eyebrow">BOARD OPTIONS</p>

      <label class="gc-option">
        <input id="gc-legal" type="checkbox">
        Legal move indicators
      </label>

      <label class="gc-option">
        <input id="gc-last" type="checkbox">
        Last move highlight
      </label>

      <label class="gc-option">
        <input id="gc-coordinates" type="checkbox">
        Board coordinates
      </label>

      <label class="gc-option">
        <input id="gc-sounds" type="checkbox">
        Move sounds
      </label>

      <label class="gc-option">
        <input id="gc-auto" type="checkbox">
        Auto-flip in Pass and Play
      </label>

      <label class="gc-option">
        <input id="gc-eval" type="checkbox">
        Show evaluation
      </label>

      <label class="gc-option-label" for="gc-theme">
        Board appearance
      </label>

      <select id="gc-theme" class="gc-theme-select">
        <option value="midnight">Midnight</option>
        <option value="forest">Forest</option>
        <option value="marble">Marble</option>
        <option value="ocean">Ocean</option>
        <option value="aurora">Aurora</option>
        <option value="royal">Royal</option>
        <option value="sunset">Sunset</option>
        <option value="carbon">Carbon</option>
      </select>
    `;

    side.appendChild(panel);
  }

  const controls = document.querySelector(".board-controls");

  if (controls && !$("gc-tools")) {
    const tools = document.createElement("div");

    tools.id = "gc-tools";
    tools.className = "gc-quick-tools";

    tools.innerHTML = `
      <button id="gc-resign">Resign</button>
      <button id="gc-copy-pgn">Copy PGN</button>
      <button id="gc-download-pgn">Download PGN</button>
      <button id="gc-copy-fen">Copy FEN</button>
    `;

    controls.insertAdjacentElement("afterend", tools);
  }

  const analysis = document.querySelector(".analysis-panel");

  if (analysis && !$("gc-captures")) {
    const captures = document.createElement("div");

    captures.id = "gc-captures";
    captures.className = "gc-captures";

    captures.innerHTML = `
      <div class="divider"></div>
      <p class="eyebrow">CAPTURED PIECES</p>
      <p>White: <span id="gc-white-captured">None</span></p>
      <p>Black: <span id="gc-black-captured">None</span></p>
    `;

    analysis.appendChild(captures);
  }

  if (!$("gc-promotion")) {
    const promotion = document.createElement("div");

    promotion.id = "gc-promotion";
    promotion.className = "gc-promotion";
    promotion.hidden = true;

    document.querySelector(".board-section")?.appendChild(promotion);
  }
}

// ============================================
// SETTINGS
// ============================================

function setupSettings() {
  const mapping = {
    "gc-legal": "legalMoves",
    "gc-last": "lastMove",
    "gc-coordinates": "coordinates",
    "gc-sounds": "sounds",
    "gc-auto": "autoFlip",
    "gc-eval": "evaluation"
  };

  for (const [id, key] of Object.entries(mapping)) {
    const control = $(id);

    if (!control) continue;

    control.checked = settings[key];

    control.addEventListener("change", () => {
      settings[key] = control.checked;
      saveSettings();
      if (key === "sounds") window.GlassChessPremium?.setSoundEnabled?.(control.checked);
      render();
    });
  }

  const theme = $("gc-theme");

  if (theme) {
    theme.value = settings.theme;
    theme.addEventListener("change", () => applyBoardTheme(theme.value));
  }
}

// ============================================
// BOARD ORIENTATION
// ============================================

function boardIsFlipped() {
  if (settings.autoFlip && gameMode === "local") {
    return game.turn() === "b";
  }

  return flipped;
}

// ============================================
// BOARD RENDERING
// ============================================

function renderBoard() {
  if (!board) throw new Error('Chessboard element not found: #board');

  // Reuse keyed square elements instead of replacing all 64 nodes. This preserves
  // background-color transitions and minimizes DOM allocation on every move.
  const existingSquares = new Map(
    Array.from(board.querySelectorAll('[data-square]')).map(element => [element.dataset.square, element])
  );
  const reverse = boardIsFlipped();
  const files = reverse ? "hgfedcba" : "abcdefgh";
  const ranks = reverse ? "12345678" : "87654321";
  const colors = THEMES[settings.theme] || THEMES.midnight;

  for (const rank of ranks) {
    for (const file of files) {
      const square = file + rank;
      const piece = game.get(square);
      let element = existingSquares.get(square);
      if (element) existingSquares.delete(square);
      else element = document.createElement("div");

      const light = ("abcdefgh".indexOf(file) + Number(rank)) % 2 === 0;
      element.className = "square " + (light ? "light" : "dark");
      element.style.backgroundColor = light ? colors[0] : colors[1];
      element.style.boxShadow = "";
      element.dataset.square = square;
      element.replaceChildren();

      if (selected === square) element.classList.add("selected");
      if (gameMode === "analysis" && analysisBestMove) {
        if (analysisBestMove.from === square) element.style.boxShadow = "inset 0 0 0 4px #e0a82e";
        if (analysisBestMove.to === square) element.style.boxShadow = "inset 0 0 0 5px #28a879";
      }
      const possibleMove = legalMoves.find(move => move.to === square);
      if (settings.legalMoves && possibleMove) element.classList.add(piece ? "capture" : "legal");
      if (settings.lastMove && lastMove && (lastMove.from === square || lastMove.to === square)) {
        element.classList.add("gc-last-move");
      }

      if (piece) {
        const span = document.createElement("span");
        const sideClass = piece.color === "w" ? "piece-white" : "piece-black";
        const pieceColor = piece.color === "w" ? settings.whitePieceColor : settings.blackPieceColor;
        span.className = "gc-piece " + sideClass + " gc-piece-" + settings.pieceStyle;
        span.style.setProperty("--gc-piece-color", pieceColor);
        if (settings.pieceStyle === "glass") {
          span.textContent = PIECES[piece.color + piece.type];
        } else {
          const art = PIECE_SVG[settings.pieceStyle]?.[piece.type] || PIECE_SVG.modern[piece.type];
          span.innerHTML = '<svg class="gc-piece-art" viewBox="0 0 100 100" aria-hidden="true" focusable="false"><g class="gc-svg-piece">' + art + '</g></svg>';
        }
        element.appendChild(span);
      }

      if (settings.coordinates) {
        if (file === files[0]) {
          const label = document.createElement("span");
          label.className = "gc-coordinate gc-rank";
          label.textContent = rank;
          element.appendChild(label);
        }
        if (rank === ranks[ranks.length - 1]) {
          const label = document.createElement("span");
          label.className = "gc-coordinate gc-file";
          label.textContent = file;
          element.appendChild(label);
        }
      }

      element.setAttribute("role", "button");
      element.setAttribute("aria-label", square);
      element.onclick = () => handleSquare(square);
      board.appendChild(element);
    }
  }
  for (const staleSquare of existingSquares.values()) staleSquare.remove();
}

// ============================================
// MOVE HISTORY
// ============================================

function updateHistory() {
  const moves = game.history();
  const rows = [];

  for (let i = 0; i < moves.length; i += 2) {
    const number = Math.floor(i / 2) + 1;

    rows.push(
      `${number}. ${moves[i]}${moves[i + 1] ? "   " + moves[i + 1] : ""}`
    );
  }

  $("move-history").textContent = rows.join("\n") || "No moves yet.";
}

// ============================================
// CAPTURED PIECES
// ============================================

function updateCaptured() {
  const white = [];
  const black = [];

  for (const move of game.history({ verbose: true })) {
    if (!move.captured) continue;

    if (move.color === "w") {
      black.push(PIECES["b" + move.captured]);
    } else {
      white.push(PIECES["w" + move.captured]);
    }
  }

  $("gc-white-captured").textContent = white.join(" ") || "None";
  $("gc-black-captured").textContent = black.join(" ") || "None";
}

// ============================================
// GAME STATUS
// ============================================

function updateGameStatus() {
  if (resigned) {
    $("coach-title").textContent = "Game resigned";
    $("coach-text").textContent = `${winner} wins by resignation.`;
    return;
  }

  if (game.isCheckmate()) {
    $("coach-title").textContent = "Checkmate!";
    $("coach-text").textContent =
      `${game.turn() === "w" ? "Black" : "White"} wins!`;
    return;
  }

  if (game.isStalemate()) {
    $("coach-title").textContent = "Stalemate";
    $("coach-text").textContent = "The game is a draw.";
    return;
  }

  if (game.isDraw()) {
    $("coach-title").textContent = "Draw!";
    $("coach-text").textContent = "The game has ended in a draw.";
    return;
  }

  if (game.isCheck()) {
    $("coach-title").textContent = "Check!";
    $("coach-text").textContent = "Your king is under attack.";
    return;
  }

  $("coach-title").textContent = "Your personal coach";

  $("coach-text").textContent =
    `${game.turn() === "w" ? "White" : "Black"} to move.`;
}

function updateLabels() {
  $("opponent-label").textContent =
    gameMode === "local" ? "Local player" :
    gameMode === "analysis" ? "Stockfish Analysis" : "Stockfish 19";

  $("player-label").textContent =
    gameMode === "local" ? "Both players" :
    gameMode === "analysis" ? (game.turn() === "w" ? "White to move" : "Black to move") :
    playerColor;
}

function render() {
  const orientation = boardIsFlipped();
  renderBoard();
  if (lastRenderedOrientation !== null && orientation !== lastRenderedOrientation) boardEffects.animateFlip();
  lastRenderedOrientation = orientation;
  updateHistory();
  updateCaptured();
  updateGameStatus();
  updateLabels();

  $("evaluation").hidden = !settings.evaluation;
  window.GlassChessGameplaySuite?.refresh?.();
}

// ============================================
// PROMOTION
// ============================================

function clearPromotion() {
  const panel = $("gc-promotion");

  panel.innerHTML = "";
  panel.hidden = true;
}

function choosePromotion(from, to, choices) {
  const panel = $("gc-promotion");
  const color = game.turn();

  const names = {
    q: "Queen",
    r: "Rook",
    b: "Bishop",
    n: "Knight"
  };

  panel.innerHTML = "<strong>Choose your promotion:</strong>";

  for (const choice of choices) {
    const button = document.createElement("button");

    button.textContent =
      `${PIECES[color + choice.promotion]} ${names[choice.promotion]}`;

    button.addEventListener("click", () => {
      clearPromotion();

      commitMove({
        from,
        to,
        promotion: choice.promotion
      });
    });

    panel.appendChild(button);
  }

  const cancel = document.createElement("button");

  cancel.textContent = "Cancel";
  cancel.addEventListener("click", clearPromotion);

  panel.appendChild(cancel);
  panel.hidden = false;
}

// ============================================
// PLAYING MOVES
// ============================================

function findKingSquare(color) {
  for (let rank = 1; rank <= 8; rank += 1) {
    for (const file of "abcdefgh") {
      const square = file + rank;
      const piece = game.get(square);
      if (piece && piece.type === "k" && piece.color === color) return square;
    }
  }
  return null;
}

function finishMoveFeedback(move, motionSnapshot) {
  boardEffects.animateMove(motionSnapshot, move);
  if (move.promotion) boardEffects.animatePromotion(move.to);
  if (game.isCheck()) {
    boardEffects.animateCheck(findKingSquare(game.turn()));
    boardEffects.playSound("check");
  } else {
    boardEffects.playSound(move.captured ? "capture" : (move.promotion ? "promotion" : "move"));
  }
}

function commitMove(input) {
  if (premiumReplayLock) return;
  if (thinking || resigned || game.isGameOver()) return;

  try {
    const move = game.move(input);

    if (!move) return;
    const motionSnapshot = boardEffects.captureMove(move);

    lastMove = {
      from: move.from,
      to: move.to
    };

    selected = null;
    legalMoves = [];

    render();
    finishMoveFeedback(move, motionSnapshot);

    if (
      gameMode === "computer" &&
      game.turn() !== getHumanSide() &&
      !game.isGameOver()
    ) {
      void computerMove();
    } else if (gameMode === "analysis" && !game.isGameOver() &&
      !window.GlassChessGameplaySuite?.shouldSkipAutoAnalysis?.()) {
      void analyzePosition();
    }
  } catch (error) {
    console.warn("Move rejected:", error);
  }
}

function handleSquare(square) {
  if (thinking || resigned || game.isGameOver()) return;
  if (!isHumanTurn()) return;

  if (selected) {
    const choices = legalMoves.filter(move => move.to === square);

    if (
      choices.length > 1 &&
      choices.every(move => Boolean(move.promotion))
    ) {
      choosePromotion(selected, square, choices);
      return;
    }

    if (choices.length === 1) {
      commitMove({
        from: selected,
        to: square,
        promotion: choices[0].promotion
      });

      return;
    }
  }

  const piece = game.get(square);

  if (piece && piece.color === game.turn()) {
    selected = square;

    legalMoves = game.moves({
      square,
      verbose: true
    });
  } else {
    selected = null;
    legalMoves = [];
  }

  render();
}

// ============================================
// STOCKFISH MOVE CONVERSION
// ============================================

function getEngineMove(uci) {
  if (!uci || uci.length < 4) return null;

  const from = uci.slice(0, 2);
  const to = uci.slice(2, 4);
  const promotion = uci[4];

  return game.moves({ verbose: true }).find(move =>
    move.from === from &&
    move.to === to &&
    (move.promotion || undefined) === promotion
  ) || null;
}

// ============================================
// ENGINE EVALUATION
// ============================================

function updateEvaluation(info, side) {
  window.GlassChessGameplaySuite?.setEvaluation?.(info, side);
  if (!settings.evaluation || !info) return;

  let type = "";
  let rawValue = null;

  if (typeof info === "string") {
    const cp = info.match(/\bscore cp (-?\d+)/);
    const mate = info.match(/\bscore mate (-?\d+)/);
    if (mate) { type = "mate"; rawValue = Number(mate[1]); }
    else if (cp) { type = "cp"; rawValue = Number(cp[1]); }
  } else if (typeof info === "object" && info.score) {
    type = String(info.score.type || "").toLowerCase();
    rawValue = Number(info.score.value);
  }

  if (!Number.isFinite(rawValue)) return;
  if (side === "b") rawValue *= -1;

  if (type === "mate") {
    $("evaluation").textContent = `M${rawValue}`;
  } else {
    const score = (rawValue / 100).toFixed(2);
    $("evaluation").textContent = rawValue > 0 ? `+${score}` : score;
  }
}

// ============================================
// COMPUTER TURN
// ============================================

async function computerMove() {
  if (
    !engineReady ||
    thinking ||
    game.isGameOver() ||
    resigned
  ) return;

  thinking = true;

  const token = gameToken;
  const side = game.turn();

  selected = null;
  legalMoves = [];

  setEngineStatus("Stockfish 19 is thinking...");
  $("best-move").textContent = "Calculating...";

  render();
  let playedMove = null;
  let moveMotionSnapshot = null;

  try {
    const result = await engine.search(game.fen(), {
      depth: window.GlassChessGameplaySuite?.getEngineDepth?.() ?? DEPTH,
      onInfo: info => updateEvaluation(info, side)
    });

    if (token !== gameToken || result.cancelled) return;

    const selectedUci = window.GlassChessGameplaySuite?.selectEngineMove?.(result) || result.bestMove;
    const move = getEngineMove(selectedUci);

    if (!move) {
      throw new Error("Stockfish returned an invalid move.");
    }

    moveMotionSnapshot = boardEffects.captureMove(move);
    const played = game.move({
      from: move.from,
      to: move.to,
      promotion: move.promotion
    });

    playedMove = played;
    lastMove = {
      from: played.from,
      to: played.to
    };

    $("best-move").textContent =
      `${played.san} (${played.from} → ${played.to})`;

    setEngineStatus("Stockfish 19 ready");
  } catch (error) {
    if (token === gameToken) {
      setEngineStatus("Engine error");

      $("coach-title").textContent = "Engine error";
      $("coach-text").textContent = error.message;

      console.error("Stockfish error:", error);
    }
  } finally {
    if (token === gameToken) {
      thinking = false;
      render();
      if (playedMove) finishMoveFeedback(playedMove, moveMotionSnapshot);
      window.GlassChessGameplaySuite?.onEngineTurnReady?.();
    }
  }
}

// ============================================
// ANALYSIS STUDIO
// ============================================

function createAnalysisStudio() {
  const panel = document.querySelector(".analysis-panel");
  if (!panel || $("gc-analysis-studio")) return;

  const studio = document.createElement("section");
  studio.id = "gc-analysis-studio";
  studio.style.marginTop = "18px";
  studio.style.paddingTop = "16px";
  studio.style.borderTop = "1px solid var(--border, #777)";

  studio.innerHTML = `
    <h3>Analysis Studio</h3>
    <p id="gc-analysis-status">Choose Analysis Studio to begin.</p>
    <label for="gc-analysis-depth">Analysis depth</label>
    <select id="gc-analysis-depth">
      <option value="7">Quick · Depth 7</option>
      <option value="12" selected>Balanced · Depth 12</option>
      <option value="18">Deep · Depth 18</option>
    </select>
    <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:12px">
      <button type="button" id="gc-analyze">Analyze position</button>
      <button type="button" id="gc-play-best">Play best move</button>
    </div>
    <p id="gc-analysis-recommendation">No recommendation yet.</p>
  `;

  panel.appendChild(studio);

  $("gc-analysis-depth").addEventListener("change", event => {
    analysisDepth = Number(event.target.value) || 12;
  });

  $("gc-analyze").addEventListener("click", () => {
    void analyzePosition();
  });

  $("gc-play-best").addEventListener("click", playBestMove);
}

async function analyzePosition() {
  if (gameMode !== "analysis" || !engineReady || game.isGameOver()) return;

  const token = gameToken;
  const fen = game.fen();
  const side = game.turn();

  analysisBestMove = null;
  thinking = true;

  $("gc-analysis-status").textContent =
    `Stockfish is analyzing ${side === "w" ? "White's" : "Black's"} position...`;
  $("gc-analysis-recommendation").textContent = "Calculating best move...";
  $("best-move").textContent = "Analyzing position...";

  render();

  try {
    const result = await engine.search(fen, {
      depth: analysisDepth,
      onInfo: info => {
        if (token === gameToken && game.fen() === fen) {
          updateEvaluation(info, side);
        }
      }
    });

    if (token !== gameToken || game.fen() !== fen) return;

    const move = getEngineMove(result.bestMove);

    if (move) {
      analysisBestMove = {
        from: move.from,
        to: move.to,
        uci: result.bestMove
      };

      const sideName = side === "w" ? "White" : "Black";
      const description =
        `${sideName}'s best move: ${move.san} (${move.from} → ${move.to})`;

      $("gc-analysis-status").textContent = "Analysis complete.";
      $("gc-analysis-recommendation").textContent = description;
      $("best-move").textContent = description;
    } else {
      $("gc-analysis-status").textContent = "No legal recommendation found.";
      $("gc-analysis-recommendation").textContent = "Check the current position.";
    }
  } catch (error) {
    if (token === gameToken) {
      $("gc-analysis-status").textContent = "Analysis failed: " + error.message;
      console.error("Analysis Studio error:", error);
    }
  } finally {
    if (token === gameToken) {
      thinking = false;
      render();
      window.GlassChessGameplaySuite?.refreshEngineArrows?.();
    }
  }
}

function playBestMove() {
  if (gameMode !== "analysis" || thinking || !analysisBestMove) return;

  const move = getEngineMove(analysisBestMove.uci);
  if (!move) {
    $("gc-analysis-status").textContent =
      "That recommendation is no longer legal. Analyze again.";
    return;
  }

  const input = { from: move.from, to: move.to };
  if (move.promotion) input.promotion = move.promotion;

  commitMove(input);
}

// ============================================
// NEW GAME
// ============================================

async function newGame() {
  const token = ++gameToken;

  thinking = false;
  await engine.stop();

  if (token !== gameToken) return;

  game.reset();
  gameStartFen = game.fen();

  selected = null;
  legalMoves = [];
  lastMove = null;
  resigned = false;
  winner = "";

  clearPromotion();

  $("evaluation").textContent = "—";
  $("best-move").textContent = "Ready to play.";

  flipped = playerColor === "black";

  render();

  if (gameMode === "computer" && playerColor === "black") {
    void computerMove();
  } else {
    setEngineStatus(
      engineReady ? "Stockfish 19 ready" : "Connecting to engine..."
    );
    if (gameMode === "analysis") {
      void analyzePosition();
    }
  }
}

// ============================================
// START GAME AND DIFFICULTY
// ============================================

async function startGame() {
  gameMode = $("mode").value;

  const chosen = $("color").value;

  playerColor = chosen === "random"
    ? (Math.random() < 0.5 ? "white" : "black")
    : chosen;

  profile = $("profile").value;

  if (engineReady) {
    try {
      const labOptions = window.GlassChessGameplaySuite?.getEngineOptions?.();
      await engine.configure(labOptions || {
        skillLevel: window.GlassChessOnlinePlus?.getEngineSkillLevel?.() ?? PROFILES[profile] ?? 10
      });
    } catch (error) {
      console.error("Could not change engine difficulty:", error);
    }
  }

  await newGame();
}

// ============================================
// UNDO
// ============================================

async function undoMove() {
  if (premiumReplayLock) return;
  const token = ++gameToken;

  thinking = false;
  await engine.stop();

  if (token !== gameToken) return;

  const count =
    gameMode === "computer" && game.history().length >= 2 ? 2 : 1;

  for (let i = 0; i < count; i++) {
    if (game.history().length) {
      game.undo();
    }
  }

  resigned = false;
  winner = "";
  selected = null;
  legalMoves = [];

  const history = game.history({ verbose: true });
  const previous = history[history.length - 1];

  lastMove = previous
    ? { from: previous.from, to: previous.to }
    : null;

  clearPromotion();
  render();

  setEngineStatus("Stockfish 19 ready");
}

// ============================================
// HINT
// ============================================

async function hint() {
  if (
    !engineReady ||
    thinking ||
    game.isGameOver() ||
    resigned
  ) return;

  thinking = true;

  const token = gameToken;
  const side = game.turn();

  $("best-move").textContent = "Finding a hint...";
  setEngineStatus("Calculating hint...");

  try {
    const result = await engine.search(game.fen(), {
      depth: DEPTH,
      onInfo: info => updateEvaluation(info, side)
    });

    if (token !== gameToken || result.cancelled) return;

    const move = getEngineMove(result.bestMove);

    $("best-move").textContent = move
      ? `Hint: ${move.san} (${move.from} → ${move.to})`
      : "No hint available.";

    setEngineStatus("Stockfish 19 ready");
  } catch (error) {
    if (token === gameToken) {
      $("best-move").textContent = "Hint unavailable.";
      setEngineStatus("Engine error");
      console.error(error);
    }
  } finally {
    if (token === gameToken) {
      thinking = false;
      render();
    }
  }
}

// ============================================
// RESIGNATION
// ============================================

function resign() {
  if (resigned || game.isGameOver()) return;

  if (!window.confirm("Are you sure you want to resign?")) return;

  const loser = gameMode === "computer"
    ? playerColor
    : game.turn() === "w" ? "white" : "black";

  winner = loser === "white" ? "Black" : "White";
  resigned = true;
  thinking = false;

  void engine.stop();
  render();
}

// ============================================
// EXPORT AND CLIPBOARD
// ============================================

async function copyText(value, message) {
  try {
    await navigator.clipboard.writeText(value);

    $("coach-title").textContent = "Copied!";
    $("coach-text").textContent = message;
  } catch {
    $("coach-title").textContent = "Copy unavailable";
    $("coach-text").textContent =
      "Clipboard permission was not available.";
  }
}

function downloadPGN() {
  const content = game.pgn() || '[Event "Glass Chess"]\n\n*';

  const blob = new Blob([content], {
    type: "application/x-chess-pgn"
  });

  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");

  link.href = url;
  link.download = "glass-chess-game.pgn";

  document.body.appendChild(link);
  link.click();
  link.remove();

  URL.revokeObjectURL(url);
}

// ============================================
// BUTTONS
// ============================================

function connectButtons() {
  $("new-game").addEventListener("click", startGame);
  $("start-game").addEventListener("click", startGame);

  $("undo").addEventListener("click", undoMove);

  $("flip").addEventListener("click", () => {
    flipped = !flipped;
    render();
  });

  $("hint").addEventListener("click", hint);

  $("gc-resign").addEventListener("click", resign);

  $("gc-copy-pgn").addEventListener("click", () => {
    void copyText(game.pgn(), "PGN copied successfully.");
  });

  $("gc-copy-fen").addEventListener("click", () => {
    void copyText(game.fen(), "FEN position copied successfully.");
  });

  $("gc-download-pgn").addEventListener("click", downloadPGN);
}

// ============================================
// RANDOM COLOR OPTION
// ============================================

function setupColorOptions() {
  const select = $("color");

  if (!select) return;

  if (![...select.options].some(option => option.value === "random")) {
    const option = document.createElement("option");

    option.value = "random";
    option.textContent = "Random";

    select.appendChild(option);
  }
}

// ============================================
// STARTUP
// ============================================

async function initialize() {
  try {
    setEngineStatus("Connecting to Stockfish 19...");
    $("best-move").textContent = "Loading engine...";

    await engine.start();

    engineReady = true;

    await engine.configure({
      skillLevel: PROFILES[profile]
    });

    setEngineStatus("Stockfish 19 ready");
    $("best-move").textContent =
      "Engine connected. Ready to play!";

    if (gameMode === "computer" && playerColor === "black") {
      void computerMove();
    }
  } catch (error) {
    engineReady = false;

    setEngineStatus("Engine connection failed");

    $("best-move").textContent =
      "Check the Stockfish engine files.";

    $("coach-title").textContent = "Engine connection problem";
    $("coach-text").textContent = error.message;

    console.error("Engine startup error:", error);
  }
}

// ============================================
// LAUNCH
// ============================================

function installGlassChessPremiumBridge() {
  if (window.GlassChess) return;

  window.GlassChess = {
    get game() { return game; },
    get mode() { return gameMode; },
    get playerColor() { return playerColor; },
    get engineReady() { return engineReady; },
    get thinking() { return thinking; },
    get profile() { return profile; },
    get initialFen() { return gameStartFen; },
    get startFen() { return gameStartFen; },
    get isFlipped() { return boardIsFlipped(); },
    get history() { return game.history({ verbose: true }); },
    get pgn() { return game.pgn(); },
    get fen() { return game.fen(); },
    get gameOver() { return game.isGameOver(); },
    get checkmate() { return game.isCheckmate(); },
    get draw() { return game.isDraw(); },
    get turn() { return game.turn(); },
    get soundsEnabled() { return Boolean(settings.sounds); },
    setSoundEnabled(enabled) {
      settings.sounds = Boolean(enabled);
      saveSettings();
      const control = $("gc-sounds");
      if (control) control.checked = settings.sounds;
      return settings.sounds;
    },
    get appearance() {
      return {
        theme: settings.theme,
        background: settings.background,
        backgroundColor: settings.backgroundColor,
        pieceStyle: settings.pieceStyle,
        whitePieceColor: settings.whitePieceColor,
        blackPieceColor: settings.blackPieceColor
      };
    },
    updateAppearance(patch = {}) {
      if (patch && typeof patch === "object") {
        if (PAGE_BACKGROUNDS[patch.background]) {
          settings.background = patch.background;
          applyPageBackground(patch.background);
        }
        if (typeof patch.backgroundColor === "string" && /^#[0-9a-f]{6}$/i.test(patch.backgroundColor)) {
          applyBackgroundColor(patch.backgroundColor);
        }
        if (["glass", "medieval", "modern"].includes(patch.pieceStyle)) {
          settings.pieceStyle = patch.pieceStyle;
        }
        if (typeof patch.whitePieceColor === "string" && /^#[0-9a-f]{6}$/i.test(patch.whitePieceColor)) {
          settings.whitePieceColor = patch.whitePieceColor;
        }
        if (typeof patch.blackPieceColor === "string" && /^#[0-9a-f]{6}$/i.test(patch.blackPieceColor)) {
          settings.blackPieceColor = patch.blackPieceColor;
        }
        if (THEMES[patch.theme]) {
          settings.theme = patch.theme;
          applyBoardTheme(patch.theme, false, false);
        }
      }
      applyPieceAppearance();
      saveSettings();
      render();
      return this.appearance;
    },
    render() { render(); },
    playMove(input) { return commitMove(input); },
    startEngineTurn() {
      if (gameMode === 'computer' && engineReady && !thinking && game.turn() !== getHumanSide() && !game.isGameOver()) {
        void computerMove();
      }
    },
    flip() { flipped = !flipped; render(); return flipped; },
    loadFen(fen) {
      const candidate = new Chess(fen);
      thinking = false;
      gameToken++;
      void engine.stop();
      game.load(candidate.fen());
      gameStartFen = game.fen();
      selected = null; legalMoves = []; lastMove = null; resigned = false; winner = "";
      clearPromotion(); analysisBestMove = null; premiumReplayLock = false;
      render();
      window.GlassChessPremium?.onLoadedGame?.([], game.fen());
      window.GlassChessGameplaySuite?.onPositionLoad?.(game.fen());
      return game.fen();
    },
    newGame() { return newGame(); },
    undo() { return undoMove(); },
    stopSearch() { return engine.stop(); },
    async search(fen, depth, onInfo) {
      if (!engineReady) throw new Error("Stockfish is not ready yet.");
      if (thinking) throw new Error("Stockfish is busy with another move or analysis.");
      thinking = true;
      try {
        return await engine.search(fen, { depth: depth || 12, onInfo: info => {
          onInfo?.(info);
          window.GlassChessGameplaySuite?.setEvaluation?.(info, String(fen).split(/\s+/)[1] || "w");
        } });
      } finally {
        thinking = false;
      }
    },
    configureEngine(options = {}) { return engine.configure(options || {}); },
    setMode(mode, shouldAnalyze = true) {
      if (!['computer', 'local', 'analysis'].includes(mode)) return;
      gameMode = mode;
      const selector = $('mode');
      if (selector) selector.value = mode;
      analysisBestMove = null;
      updateLabels();
      render();
      if (shouldAnalyze && mode === 'analysis' && engineReady && !game.isGameOver()) {
        void analyzePosition();
      }
    },
    setReplayLock(value) {
      premiumReplayLock = Boolean(value);
      render();
    },
    setOnlineSide(side) {
      if (side !== 'w' && side !== 'b') return;
      playerColor = side === 'w' ? 'white' : 'black';
      flipped = side === 'b';
      updateLabels();
      render();
    },
    rebuild(initialFen, moves) {
      const previousHistory = game.history({ verbose: true });
      const extendsByOne = Array.isArray(moves) && moves.length === previousHistory.length + 1 &&
        previousHistory.every((oldMove, index) =>
          oldMove.from === moves[index].from && oldMove.to === moves[index].to &&
          (oldMove.promotion || undefined) === (moves[index].promotion || undefined)
        );
      const latestMove = extendsByOne ? moves[moves.length - 1] : null;
      const motionSnapshot = latestMove ? boardEffects.captureMove(latestMove) : null;
      gameStartFen = initialFen;
      suppressGameCallbacks = true;
      try {
        game.load(initialFen);
        for (const move of moves) game.move({ from: move.from, to: move.to, promotion: move.promotion });
      } finally { suppressGameCallbacks = false; }
      render();
      if (latestMove && motionSnapshot) finishMoveFeedback(latestMove, motionSnapshot);
    },
    calculatePositions(initialFen, moveList) {
      const savedMoves = game.history({ verbose: true });
      const result = [];
      suppressGameCallbacks = true;
      try {
        game.load(initialFen);
        result.push(game.fen());
        for (const move of moveList) {
          game.move({ from: move.from, to: move.to, promotion: move.promotion });
          result.push(game.fen());
        }
        game.load(initialFen);
        for (const move of savedMoves) game.move({ from: move.from, to: move.to, promotion: move.promotion });
      } finally { suppressGameCallbacks = false; }
      render();
      return result;
    },
    loadPgn(pgn) {
      thinking = false;
      gameToken++;
      void engine.stop();
      game.loadPgn(pgn);
      const fenHeader = String(pgn).match(/\[FEN\s+"([^"]+)"\]/i);
      gameStartFen = fenHeader ? fenHeader[1] : new Chess().fen();
      updateLabels();
      render();
      if (window.GlassChessPremium && typeof window.GlassChessPremium.onLoadedGame === 'function') {
        window.GlassChessPremium.onLoadedGame(game.history({ verbose: true }), game.fen());
      }
      window.GlassChessGameplaySuite?.onPositionLoad?.(game.fen());
    }
  };

  const originalMove = game.move.bind(game);
  game.move = function (...args) {
    const beforeFen = game.fen();
    const move = originalMove(...args);
    if (move && !suppressGameCallbacks) {
      if (window.GlassChessPremium && typeof window.GlassChessPremium.onMove === 'function') {
        window.GlassChessPremium.onMove(move, beforeFen, game.fen());
      }
      window.GlassChessGameplaySuite?.onMove?.(move, beforeFen, game.fen());
    }
    return move;
  };

  const originalReset = game.reset.bind(game);
  game.reset = function (...args) {
    const result = originalReset(...args);
    if (window.GlassChessPremium && typeof window.GlassChessPremium.onReset === 'function') {
      window.GlassChessPremium.onReset(game.fen());
    }
    window.GlassChessGameplaySuite?.onReset?.(game.fen());
    return result;
  };

  const originalUndo = game.undo.bind(game);
  game.undo = function (...args) {
    const result = originalUndo(...args);
    if (result && window.GlassChessPremium && typeof window.GlassChessPremium.onUndo === 'function') {
      window.GlassChessPremium.onUndo(game.history({ verbose: true }), game.fen());
    }
    return result;
  };

  import('./premium.js')
    .then(async ({ mount }) => {
      mount(window.GlassChess);
      const { mountGameplaySuite } = await import('./gameplay-suite.js');
      mountGameplaySuite(window.GlassChess, document.getElementById('gc-premium'));
    })
    .catch(error => console.error('Glass Chess Premium / Game Lab could not start:', error));
}

function launch() {
  installGlassChessPremiumBridge();
  createExtraControls();
  setupColorOptions();
  setupSettings();
  createAnalysisStudio();
  connectButtons();

  applyPieceAppearance();
  applyPageBackground(settings.background);
  applyBackgroundColor(settings.backgroundColor);
  applyBoardTheme(settings.theme, false, false);
  render();
  void initialize();
}

launch();

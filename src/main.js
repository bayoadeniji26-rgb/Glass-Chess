import { Chess } from "chess.js";
import { engine } from "./engine.js";
import { calculatePositionHistory, isFlagFallDraw } from "./chess-position-tools.js";
import "./micro-polish.css";
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
let positionGeneration = 0;
let startRequestToken = 0;
let gameTermination = null;
let allowEngineMove = false;
const moveFeedback = new WeakMap();
let resigned = false;
let winner = "";
let moveClassifications = new Map();
let skipNextMoveAnimation = false;
let suppressNextBoardClick = false;
let activeBoardDrag = null;
let keyboardFocusSquare = null;
let activeHintMove = null;
const MOVE_QUALITY = {
  Brilliant: { key: "brilliant", symbol: "!!" }, Great: { key: "great", symbol: "!" },
  Best: { key: "best", symbol: "★" }, Inaccuracy: { key: "inaccuracy", symbol: "?!" },
  Mistake: { key: "mistake", symbol: "?" }, Blunder: { key: "blunder", symbol: "??" },
  Checkmate: { key: "checkmate", symbol: "#" }
};

function isGameOver() {
  return game.isGameOver() || Boolean(gameTermination);
}

async function ensureEngineReady() {
  try {
    await engine.start();
  } finally {
    engineReady = Boolean(engine.ready);
  }
  return engineReady;
}

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
const boardEffects = createBoardEffects(
  board,
  () => settings.sounds,
  () => !document.body?.classList.contains('gc-no-piece-motion')
);
window.addEventListener('pagehide', () => boardEffects.dispose(), { once: true });
let lastRenderedOrientation = null;
let lastAnnouncedMateFen = '';

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
  const online = window.GlassChessOnlinePlus;
  if (online?.isOnline?.()) return online.canMove?.(game.turn()) === true;
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

  if (controls && !$("gc-hint-status")) {
    const status = document.createElement("div");
    status.id = "gc-hint-status";
    status.hidden = true;
    status.setAttribute("role", "status");
    status.setAttribute("aria-live", "polite");
    controls.insertAdjacentElement("afterend", status);
  }

  if (controls && !$("gc-clear-hint")) {
    const clear = document.createElement("button");
    clear.type = "button";
    clear.id = "gc-clear-hint";
    clear.textContent = "Clear Hint";
    clear.title = "Clear the tactical hint and arrow";
    controls.appendChild(clear);
  }

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
  if (settings.autoFlip && gameMode === "local" && !window.GlassChessOnlinePlus?.isOnline?.()) {
    return game.turn() === "b";
  }

  return flipped;
}

function setBoardFocus(square, shouldFocus = false) {
  if (!board || !/^[a-h][1-8]$/.test(String(square || ""))) return;
  keyboardFocusSquare = square;
  for (const cell of board.querySelectorAll("[data-square]")) {
    cell.tabIndex = cell.dataset.square === square ? 0 : -1;
  }
  if (shouldFocus) board.querySelector('[data-square="' + square + '"]')?.focus();
}

function handleBoardSquareKeydown(event, square) {
  if (event.key === "Enter" || event.key === " ") {
    event.preventDefault();
    handleSquare(square);
    return;
  }
  if (!["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)) return;
  event.preventDefault();
  const reverse = boardIsFlipped();
  let file = square.charCodeAt(0) - 97;
  let rank = Number(square[1]);
  if (event.key === "ArrowLeft") file += reverse ? 1 : -1;
  if (event.key === "ArrowRight") file += reverse ? -1 : 1;
  if (event.key === "ArrowUp") rank += reverse ? -1 : 1;
  if (event.key === "ArrowDown") rank += reverse ? 1 : -1;
  if (file < 0 || file > 7 || rank < 1 || rank > 8) return;
  setBoardFocus(String.fromCharCode(97 + file) + rank, true);
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
  const currentReview = moveClassifications.get(game.history().length);

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
      const visibleHint = activeHintMove?.fen === game.fen() ? activeHintMove.move : null;
      if (visibleHint?.from === square) element.classList.add("gc-hint-origin");
      if (visibleHint?.to === square) element.classList.add("gc-hint-destination");
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

      if (currentReview && currentReview.to === square) {
        const badge = document.createElement("span");
        badge.className = "gc-move-quality-badge gc-quality-" + currentReview.key;
        badge.textContent = currentReview.symbol;
        badge.title = currentReview.label;
        badge.setAttribute("aria-label", currentReview.label + " move");
        element.appendChild(badge);
      }
      if (!keyboardFocusSquare) keyboardFocusSquare = reverse ? "h1" : "a8";
      element.setAttribute("role", "button");
      element.tabIndex = square === keyboardFocusSquare ? 0 : -1;
      const pieceName = piece
        ? ({ p: "pawn", n: "knight", b: "bishop", r: "rook", q: "queen", k: "king" }[piece.type])
        : "empty";
      element.setAttribute("aria-label", piece
        ? square + ", " + (piece.color === "w" ? "white " : "black ") + pieceName
        : square + ", empty");
      element.setAttribute("aria-pressed", selected === square ? "true" : "false");
      element.onfocus = () => setBoardFocus(square);
      element.onkeydown = event => handleBoardSquareKeydown(event, square);
      element.onclick = () => {
        setBoardFocus(square);
        handleSquare(square);
      };
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
  const bestMoveHeading = $("best-move")?.previousElementSibling;
  if (bestMoveHeading?.classList.contains("eyebrow")) bestMoveHeading.textContent = "BEST MOVE";

  if (gameTermination?.type === "timeout_draw") {
    $("coach-title").textContent = "Draw on time";
    $("coach-text").textContent = "The flagged side ran out of time, but the opponent did not have sufficient material to checkmate.";
    return;
  }

  if (gameTermination?.type === "timeout") {
    $("coach-title").textContent = "Time expired";
    $("coach-text").textContent = gameTermination.winner + " wins on time.";
    return;
  }

  if (resigned || gameTermination?.type === "resignation") {
    $("coach-title").textContent = "Game resigned";
    $("coach-text").textContent = `${winner} wins by resignation.`;
    return;
  }

  if (game.isCheckmate()) {
    const finalMove = game.history({ verbose: true }).at(-1);
    const bestMoveHeading = $("best-move")?.previousElementSibling;
    if (bestMoveHeading?.classList.contains("eyebrow")) bestMoveHeading.textContent = "CHECKMATE MOVE";
    $("evaluation").textContent = "MATE";
    $("best-move").textContent = finalMove
      ? `Checkmate · ${finalMove.san} (${finalMove.from} → ${finalMove.to})`
      : "Checkmate";
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

function getSignedInDisplayName() {
  const user = window.GlassChessCloud?.user;
  if (!user) return "Anonymous";
  const candidate = user.displayName || user.username || "";
  const cleaned = String(candidate).replace(/[<>]/g, "").trim().slice(0, 24);
  return cleaned || "Anonymous";
}

function normalizeSeatName(value, fallback = "Anonymous") {
  const cleaned = String(value || "").replace(/[<>]/g, "").trim().slice(0, 24);
  return cleaned || fallback;
}

function formatSeatRating(player) {
  const value = Number(player?.rating);
  return Number.isFinite(value) && value > 0
    ? `${Math.round(value)} Elo`
    : "Elo: Unrated";
}

function updateLabels() {
  const online = window.GlassChessOnlinePlus;
  const isOnlineMatch = online?.isOnline?.() === true;
  const topName = $("opponent-name");
  const bottomName = $("player-name");
  const topMeta = $("opponent-label");
  const bottomMeta = $("player-label");
  if (!topName || !bottomName || !topMeta || !bottomMeta) return;

  // Stockfish is a seat label only in a game where the computer is actually the opponent.
  if (gameMode === "computer" && !isOnlineMatch) {
    topName.textContent = "Stockfish";
    topMeta.textContent = "Computer";
    bottomName.textContent = "You";
    bottomMeta.textContent = playerColor === "white" ? "White" : "Black";
    return;
  }

  const topSide = boardIsFlipped() ? "w" : "b";
  const bottomSide = topSide === "w" ? "b" : "w";
  const sideName = side => side === "w" ? "White" : "Black";

  if (gameMode === "analysis" && !isOnlineMatch) {
    topName.textContent = sideName(topSide);
    topMeta.textContent = "Analysis board";
    bottomName.textContent = sideName(bottomSide);
    bottomMeta.textContent = "Analysis board";
    return;
  }

  const players = isOnlineMatch ? online.getPlayers?.() || null : null;
  const signedInName = getSignedInDisplayName();
  const signedInSide = playerColor === "white" ? "w" : "b";
  const nameForSide = side => {
    if (isOnlineMatch) {
      const player = players?.[side];
      return player ? normalizeSeatName(player.name) : `Waiting for ${sideName(side)}`;
    }
    return side === signedInSide ? signedInName : "Anonymous";
  };
  const ratingForSide = side => formatSeatRating(players?.[side]);

  topName.textContent = nameForSide(topSide);
  topMeta.textContent = `${sideName(topSide)} · ${ratingForSide(topSide)}`;
  bottomName.textContent = nameForSide(bottomSide);
  bottomMeta.textContent = `${sideName(bottomSide)} · ${ratingForSide(bottomSide)}`;
}

function render() {
  const orientation = boardIsFlipped();
  if (game.isCheckmate()) analysisBestMove = null;
  renderBoard();
  announceCheckmate();
  if (lastRenderedOrientation !== null && orientation !== lastRenderedOrientation) boardEffects.animateFlip();
  lastRenderedOrientation = orientation;
  updateHistory();
  updateCaptured();
  updateGameStatus();
  updateLabels();

  $("evaluation").hidden = !settings.evaluation;
  window.GlassChessGameplaySuite?.refresh?.();
  window.GlassChessAdvancedLab?.refresh?.();
  document.dispatchEvent(new CustomEvent("glasschess:statechange", {
    detail: {
      fen: game.fen(),
      pgn: game.pgn(),
      history: game.history({ verbose: true }),
      mode: gameMode,
      profile,
      gameOver: isGameOver(),
      turn: game.turn(),
      appearance: { ...settings }
    }
  }));
}

// ============================================
// PROMOTION
// ============================================

function clearPromotion() {
  const panel = $("gc-promotion");

  panel.innerHTML = "";
  panel.hidden = true;
}

function choosePromotion(from, to, choices, { skipAnimation = false } = {}) {
  const autoPromotion = window.GlassChessAdvancedLab?.getAutoPromotion?.();
  if (autoPromotion && autoPromotion !== 'ask') {
    const preferred = choices.find(choice => choice.promotion === autoPromotion);
    if (preferred) { commitMove({ from, to, promotion: preferred.promotion }, { skipAnimation }); return; }
  }
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
      }, { skipAnimation });
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

function announceCheckmate() {
  if (!game.isCheckmate()) {
    lastAnnouncedMateFen = '';
    return;
  }
  const fen = game.fen();
  if (fen === lastAnnouncedMateFen) return;
  lastAnnouncedMateFen = fen;
  boardEffects.animateCheckmate(findKingSquare(game.turn()));
  boardEffects.playSound('checkmate');
}

function finishMoveFeedback(move, motionSnapshot) {
  const travel = boardEffects.animateMove(motionSnapshot, move);
  if (move.promotion) Promise.resolve(travel).then(() => {
    if (game.get(move.to)?.type === move.promotion) boardEffects.animatePromotion(move.to);
  });
  if (game.isCheckmate()) return;
  if (game.isCheck()) {
    boardEffects.animateCheck(findKingSquare(game.turn()));
    boardEffects.playSound("check");
  } else {
    boardEffects.playSound(move.captured ? "capture" : (move.promotion ? "promotion" : "move"));
  }
}

function commitMove(input, options = {}) {
  if (premiumReplayLock) return;
  if (thinking || resigned || isGameOver()) return;
  const online = window.GlassChessOnlinePlus;
  if (!isHumanTurn()) {
    online?.showMoveDenied?.();
    return;
  }
  if (online?.isOnline?.() && online.canMove?.(game.turn()) !== true) {
    online.showMoveDenied?.();
    return;
  }

  try {
    let move;
    skipNextMoveAnimation = Boolean(options?.skipAnimation);
    try { move = game.move(input); }
    finally { skipNextMoveAnimation = false; }
    if (!move) return;
    const feedback = moveFeedback.get(move);
    if (feedback) moveFeedback.delete(move);
    if (feedback && !feedback.applied) {
      const history = game.history({ verbose: true });
      const previous = history[history.length - 1];
      lastMove = previous ? { from: previous.from, to: previous.to } : null;
      selected = null;
      legalMoves = [];
      render();
      return;
    }
    const motionSnapshot = feedback ? feedback.motionSnapshot : boardEffects.captureMove(move);

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
      !isGameOver()
    ) {
      void computerMove();
    } else if (gameMode === "analysis" && !isGameOver() &&
      !window.GlassChessGameplaySuite?.shouldSkipAutoAnalysis?.() &&
      !window.GlassChessPremium?.shouldSkipAutoAnalysis?.()) {
      void analyzePosition();
    }
  } catch (error) {
    console.warn("Move rejected:", error);
  }
}

function handleSquare(square) {
  if (suppressNextBoardClick) { suppressNextBoardClick = false; return; }
  if (thinking || resigned || isGameOver()) return;
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
  if (thinking || isGameOver() || resigned) return;

  thinking = true;

  const token = gameToken;
  const generation = positionGeneration;
  const fen = game.fen();
  const side = game.turn();

  selected = null;
  legalMoves = [];

  setEngineStatus("Stockfish 19 is thinking...");
  $("best-move").textContent = "Calculating...";

  render();
  let playedMove = null;
  let moveMotionSnapshot = null;

  try {
    await ensureEngineReady();
    if (token !== gameToken || generation !== positionGeneration || game.fen() !== fen) return;
    const result = await engine.search(fen, {
      depth: window.GlassChessGameplaySuite?.getEngineDepth?.() ?? DEPTH,
      onInfo: info => {
        if (token === gameToken && generation === positionGeneration && game.fen() === fen) {
          updateEvaluation(info, side);
        }
      }
    });

    if (token !== gameToken || generation !== positionGeneration || game.fen() !== fen || result.cancelled) return;

    const selectedUci = window.GlassChessGameplaySuite?.selectEngineMove?.(result) || result.bestMove;
    const move = getEngineMove(selectedUci);

    if (!move) {
      throw new Error("Stockfish returned an invalid move.");
    }

    moveMotionSnapshot = boardEffects.captureMove(move);
    let played;
    allowEngineMove = true;
    try {
      played = game.move({
        from: move.from,
        to: move.to,
        promotion: move.promotion
      });
    } finally {
      allowEngineMove = false;
    }

    if (!played) throw new Error("Stockfish returned a move that could not be applied.");
    const feedback = moveFeedback.get(played);
    if (feedback) moveFeedback.delete(played);
    if (feedback && !feedback.applied) {
      const history = game.history({ verbose: true });
      const previous = history[history.length - 1];
      lastMove = previous ? { from: previous.from, to: previous.to } : null;
      $("best-move").textContent = "Training move rejected. Try another move.";
      return;
    }
    if (feedback) moveMotionSnapshot = feedback.motionSnapshot;
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
  if (gameMode !== "analysis" || isGameOver() || thinking) return;

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
    await ensureEngineReady();
    if (token !== gameToken || game.fen() !== fen) return;
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

  gameTermination = null;
  game.reset();
  gameStartFen = game.fen();

  selected = null;
  legalMoves = [];
  lastMove = null;
  resigned = false;
  winner = "";
  gameTermination = null;

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
  const request = ++startRequestToken;
  const requestedMode = $("mode").value;
  const chosen = $("color").value;
  const requestedColor = chosen === "random"
    ? (Math.random() < 0.5 ? "white" : "black")
    : chosen;
  const requestedProfile = $("profile").value;
  const skillLevel = window.GlassChessOnlinePlus?.getEngineSkillLevel?.()
    ?? PROFILES[requestedProfile] ?? 10;
  const labOptions = window.GlassChessGameplaySuite?.getEngineOptions?.();
  const options = labOptions || { skillLevel };

  const token = ++gameToken;
  const onlineSession = window.GlassChessOnlinePlus;
  if (onlineSession?.isOnline?.() || onlineSession?.isMatchmaking?.()) {
    await onlineSession.exitOnlineSession?.({ restoreMode: false });
    if (request !== startRequestToken || token !== gameToken) return;
  }
  thinking = true;
  analysisBestMove = null;

  try {
    await engine.configure(options);
    engineReady = Boolean(engine.ready);
  } catch (error) {
    engineReady = Boolean(engine.ready);
    console.error("Could not configure Stockfish:", error);
  }

  if (request !== startRequestToken) return;
  if (token !== gameToken) {
    thinking = false;
    render();
    return;
  }
  gameMode = requestedMode;
  playerColor = requestedColor;
  profile = requestedProfile;
  thinking = false;
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

  const count = gameMode === "computer" && game.history().length >= 2 ? 2 : 1;
  resigned = false;
  winner = "";
  selected = null;
  legalMoves = [];
  gameTermination = null;
  clearPromotion();

  // Undo computer replies in sequence so each same DOM piece gets one clean return slide.
  for (let i = 0; i < count && game.history().length; i++) {
    const lastPlayed = game.history({ verbose: true }).at(-1);
    const reverseMotion = boardEffects.captureReverseMove(lastPlayed);
    game.undo();
    render();
    if (reverseMotion) await boardEffects.animateMove(reverseMotion);
    if (token !== gameToken) return;
  }

  const history = game.history({ verbose: true });
  const previous = history[history.length - 1];
  lastMove = previous ? { from: previous.from, to: previous.to } : null;
  positionGeneration++;
  window.GlassChessGameplaySuite?.onUserUndo?.();
  render();
  setEngineStatus("Stockfish 19 ready");
}

// ============================================
// HINT
// ============================================

function showHintStatus(message, kind = "success") {
  const status = $("gc-hint-status");
  if (!status) return;
  status.hidden = false;
  status.classList.toggle("is-error", kind === "error");
  status.classList.toggle("is-loading", kind === "loading");
  status.textContent = message;
}

function clearHint() {
  activeHintMove = null;
  $("board")?.querySelector(".gc-hint-arrow-layer")?.remove();
  renderBoard();
  showHintStatus("Hint cleared.", "success");
  document.dispatchEvent(new CustomEvent("glasschess:hint", { detail: { fen: game.fen(), move: null } }));
}

async function hint() {
  const hintButton = $("hint");
  if (thinking) {
    showHintStatus("Hint Error: Stockfish is already busy with another move or analysis.", "error");
    return;
  }
  if (isGameOver() || resigned) {
    showHintStatus("Hint Error: This game is already over. Start a new game to request a hint.", "error");
    document.dispatchEvent(new CustomEvent("glasschess:hint", { detail: { error: "Game is over." } }));
    return;
  }

  const token = gameToken;
  const generation = positionGeneration;
  const fen = game.fen();
  const side = game.turn();
  const isCurrentPosition = () =>
    token === gameToken && generation === positionGeneration && game.fen() === fen;
  let watchdog = null;
  let cancelled = false;

  try {
    // chess.js validates the complete FEN before it is sent to Stockfish.
    new Chess(fen);
    thinking = true;
    if (hintButton) {
      hintButton.disabled = true;
      hintButton.textContent = "Analyzing Position...";
    }
    activeHintMove = null;
    $("board")?.querySelector(".gc-hint-arrow-layer")?.remove();
    renderBoard();
    $("best-move").textContent = "Calculating hint…";
    setEngineStatus("Stockfish is calculating a hint…");
    showHintStatus("Calculating… Stockfish is checking this exact position.", "loading");

    const request = (async () => {
      await ensureEngineReady();
      if (!engine.ready) throw new Error("Stockfish did not finish initializing. Try restarting the engine.");
      if (cancelled || !isCurrentPosition()) return { cancelled: true };
      return engine.search(fen, {
        depth: DEPTH,
        timeoutMs: 5000,
        onInfo: info => {
          if (!isCurrentPosition()) return;
          updateEvaluation(info, side);
          setEngineStatus(info?.depth
            ? "Stockfish calculating hint · depth " + info.depth
            : "Stockfish calculating hint…");
        }
      });
    })();

    const result = await Promise.race([
      request,
      new Promise((resolve, reject) => {
        watchdog = window.setTimeout(() => reject(new Error("Stockfish failed to respond within 5 seconds.")), 5000);
      })
    ]);
    if (watchdog !== null) window.clearTimeout(watchdog);

    if (!isCurrentPosition()) {
      throw new Error("The board position changed while Stockfish was calculating. Request a new hint.");
    }
    if (result?.cancelled) throw new Error("The hint search was cancelled before a move was returned.");

    const move = getEngineMove(result?.bestMove);
    if (!move) throw new Error("Stockfish did not return a legal move for this position.");

    activeHintMove = { fen, move: { from: move.from, to: move.to, san: move.san } };
    render();
    document.dispatchEvent(new CustomEvent("glasschess:hint", {
      detail: { fen, move: { from: move.from, to: move.to, san: move.san } }
    }));
    $("best-move").textContent = "King Pawn’s Hint: Play " + move.san + " (" + move.from + " → " + move.to + ")";
    showHintStatus("King Pawn’s Hint: Play " + move.san + " · " + move.from + " → " + move.to, "success");
    setEngineStatus("Stockfish 19 ready");
  } catch (error) {
    cancelled = true;
    if (watchdog !== null) window.clearTimeout(watchdog);
    activeHintMove = null;
    $("board")?.querySelector(".gc-hint-arrow-layer")?.remove();
    if (token === gameToken) {
      const reason = error?.message || "Engine failed to analyze this position.";
      $("best-move").textContent = "Hint Error: " + reason;
      showHintStatus("Hint Error: " + reason, "error");
      setEngineStatus(engine.ready ? "Stockfish 19 ready" : "Stockfish recovering…");
      console.error("Stockfish Hint failed:", error);
    }
    // Wait for UCI to acknowledge cancellation before a new Hint search can start.
    await engine.stop().catch(() => {});
  } finally {
    if (watchdog !== null) window.clearTimeout(watchdog);
    if (token === gameToken) {
      thinking = false;
      render();
      if (engine.ready && !isGameOver()) setEngineStatus("Stockfish 19 ready");
    }
    if (hintButton) {
      hintButton.disabled = false;
      hintButton.textContent = "✦ Hint";
    }
  }
}

// ============================================
// RESIGNATION
// ============================================

function resign() {
  if (resigned || isGameOver()) return;

  if (!window.confirm("Are you sure you want to resign?")) return;

  const loser = gameMode === "computer"
    ? playerColor
    : game.turn() === "w" ? "white" : "black";

  winner = loser === "white" ? "Black" : "White";
  resigned = true;
  gameTermination = { type: "resignation", winner, loser };
  thinking = false;
  gameToken++;
  positionGeneration++;

  void engine.stop();
  render();
  window.GlassChessPremium?.onGameFinished?.();
  window.GlassChessGameplaySuite?.onGameEnded?.();
  window.GlassChessOnlinePlus?.onGameFinished?.();
}

function finishOnTime(loserSide) {
  if (!["w", "b"].includes(loserSide) || isGameOver()) return false;
  const draw = isFlagFallDraw(game.fen(), loserSide);
  const winningName = loserSide === "w" ? "Black" : "White";
  gameTermination = draw
    ? { type: "timeout_draw", draw: true, winner: null, loser: loserSide }
    : { type: "timeout", draw: false, winner: winningName, loser: loserSide };
  winner = draw ? "" : winningName;
  resigned = false;
  thinking = false;
  gameToken++;
  positionGeneration++;
  void engine.stop();
  setEngineStatus(draw ? "Draw on time" : winningName + " wins on time");
  render();
  window.GlassChessPremium?.onGameFinished?.();
  window.GlassChessGameplaySuite?.onGameEnded?.();
  window.GlassChessOnlinePlus?.onGameFinished?.();
  return true;
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

  // Give the browser time to begin the download before releasing the blob URL.
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
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
  $("gc-clear-hint")?.addEventListener("click", clearHint);

  $("gc-resign").addEventListener("click", resign);

  $("gc-copy-pgn").addEventListener("click", () => {
    void copyText(game.pgn(), "PGN copied successfully.");
  });

  $("gc-copy-fen").addEventListener("click", () => {
    void copyText(game.fen(), "FEN position copied successfully.");
  });

  $("gc-download-pgn").addEventListener("click", downloadPGN);
}

function installBoardDragDrop() {
  if (!board || board.dataset.gcDragDropReady === "true") return;
  board.dataset.gcDragDropReady = "true";
  const finishDrag = () => {
    const drag = activeBoardDrag;
    if (!drag) return null;
    if (drag.sourcePiece) {
      if (drag.previousVisibility) drag.sourcePiece.style.visibility = drag.previousVisibility;
      else drag.sourcePiece.style.removeProperty("visibility");
    }
    drag.ghost?.remove();
    activeBoardDrag = null;
    return drag;
  };
  board.addEventListener("pointerdown", event => {
    if (event.button !== 0 || event.isPrimary === false || thinking || resigned || isGameOver()) return;
    const squareElement = event.target.closest?.("[data-square]");
    const from = squareElement?.dataset.square, piece = from ? game.get(from) : null;
    if (!piece || piece.color !== game.turn() || !isHumanTurn()) return;
    const sourcePiece = squareElement.querySelector(".gc-piece");
    if (!sourcePiece) return;
    const rect = sourcePiece.getBoundingClientRect();
    activeBoardDrag = { pointerId:event.pointerId,from,startX:event.clientX,startY:event.clientY,rect,sourcePiece,previousVisibility:sourcePiece.style.visibility,dragging:false,ghost:null };
  });
  document.addEventListener("pointermove", event => {
    const drag = activeBoardDrag;
    if (!drag || drag.pointerId !== event.pointerId) return;
    const dx=event.clientX-drag.startX,dy=event.clientY-drag.startY;
    if (!drag.dragging && Math.hypot(dx,dy)<7) return;
    if (!drag.dragging) {
      drag.dragging=true;drag.sourcePiece.style.visibility="hidden";
      const ghost=document.createElement("div");ghost.className="gc-drag-ghost";
      Object.assign(ghost.style,{left:drag.rect.left+"px",top:drag.rect.top+"px",width:drag.rect.width+"px",height:drag.rect.height+"px"});
      ghost.appendChild(drag.sourcePiece.cloneNode(true));document.body.appendChild(ghost);drag.ghost=ghost;
    }
    drag.ghost.style.transform="translate3d("+dx+"px,"+dy+"px,0)";
    event.preventDefault();
  },{passive:false});
  document.addEventListener("pointerup", event => {
    const drag=activeBoardDrag;if(!drag||drag.pointerId!==event.pointerId)return;
    if(!drag.dragging){finishDrag();return;}
    const destination=document.elementFromPoint(event.clientX,event.clientY)?.closest?.("[data-square]")?.dataset.square;
    const from=drag.from;finishDrag();
    suppressNextBoardClick=true;window.setTimeout(()=>{suppressNextBoardClick=false;},0);
    if(!destination||destination===from||thinking||isGameOver())return;
    const choices=game.moves({square:from,verbose:true}).filter(move=>move.to===destination);
    if(!choices.length)return;
    if(choices.length>1&&choices.every(move=>Boolean(move.promotion))){
      choosePromotion(from,destination,choices);return;
    }
    const choice=choices[0];
    // Dragging only controls the input gesture; the landing move still gets the
    // same single-piece FLIP animation as a click-to-move.
    commitMove({from,to:destination,promotion:choice.promotion});
  });
  document.addEventListener("pointercancel",event=>{if(activeBoardDrag?.pointerId===event.pointerId)finishDrag();});
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
    get engineReady() { return Boolean(engine.ready); },
    get thinking() { return thinking; },
    get profile() { return profile; },
    get initialFen() { return gameStartFen; },
    get startFen() { return gameStartFen; },
    get isFlipped() { return boardIsFlipped(); },
    get history() { return game.history({ verbose: true }); },
    get pgn() { return game.pgn(); },
    get fen() { return game.fen(); },
    get gameOver() { return isGameOver(); },
    get checkmate() { return game.isCheckmate(); },
    get draw() { return game.isDraw() || Boolean(gameTermination?.draw); },
    get termination() { return gameTermination ? { ...gameTermination } : null; },
    get generation() { return positionGeneration; },
    getBoardEffectsDiagnostics() { return boardEffects.getDiagnostics(); },
    setMoveClassifications(items = []) {
      moveClassifications.clear();
      for (const item of Array.isArray(items) ? items : []) {
        const quality = MOVE_QUALITY[item?.label], ply = Number(item?.ply), to = item?.move?.to;
        if (!quality || !Number.isInteger(ply) || ply < 1 || !/^[a-h][1-8]$/.test(String(to || ""))) continue;
        moveClassifications.set(ply, { ...quality, label: item.label, to });
      }
      renderBoard();
      return moveClassifications.size;
    },
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
      if (gameMode === 'computer' && !thinking && game.turn() !== getHumanSide() && !isGameOver()) {
        void computerMove();
      }
    },
    setTimeoutResult(loserSide) { return finishOnTime(loserSide); },
    flip() { flipped = !flipped; render(); return flipped; },
    loadFen(fen) {
      const candidate = new Chess(fen);
      thinking = false;
      gameToken++;
      positionGeneration++;
      gameTermination = null;
      void engine.stop();
      game.load(candidate.fen());
      gameStartFen = game.fen();
      selected = null; legalMoves = []; lastMove = null; resigned = false; winner = "";
      clearPromotion(); analysisBestMove = null; premiumReplayLock = false;
      render();
      window.GlassChessPremium?.onLoadedGame?.([], game.fen());
      window.GlassChessGameplaySuite?.onPositionLoad?.(game.fen());
      window.GlassChessAdvancedLab?.onReset?.();
      return game.fen();
    },
    newGame() { return newGame(); },
    undo() { return undoMove(); },
    stopSearch() { return engine.stop(); },
    async search(fen, depth, onInfo) {
      if (thinking) throw new Error("Stockfish is busy with another move or analysis.");
      thinking = true;
      const token = gameToken;
      const generation = positionGeneration;
      try {
        await ensureEngineReady();
        return await engine.search(fen, { depth: depth || 12, onInfo: info => {
          if (token !== gameToken || generation !== positionGeneration) return;
          onInfo?.(info);
          window.GlassChessGameplaySuite?.setEvaluation?.(info, String(fen).split(/\s+/)[1] || "w");
        } });
      } finally {
        engineReady = Boolean(engine.ready);
        if (token === gameToken) thinking = false;
      }
    },
    configureEngine(options = {}) {
      return engine.configure(options || {}).then(result => {
        engineReady = Boolean(engine.ready);
        return result;
      });
    },
    setMode(mode, shouldAnalyze = true) {
      if (!['computer', 'local', 'analysis'].includes(mode)) return;
      const changed = mode !== gameMode;
      gameMode = mode;
      const selector = $('mode');
      if (selector) selector.value = mode;
      analysisBestMove = null;
      updateLabels();
      render();
      const canAnalyze = shouldAnalyze && mode === 'analysis' && !isGameOver()
        && !window.GlassChessGameplaySuite?.shouldSkipAutoAnalysis?.()
        && !window.GlassChessPremium?.shouldSkipAutoAnalysis?.();
      if (changed) {
        const token = ++gameToken;
        thinking = false;
        void engine.stop().then(() => {
          if (token === gameToken && canAnalyze) void analyzePosition();
        });
      } else if (canAnalyze && !thinking) {
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
      // Validate the complete remote/replay line before touching the live board.
      calculatePositionHistory(initialFen, moves);
      const previousHistory = game.history({ verbose: true });
      const sameMove = (a, b) => a && b && a.from === b.from && a.to === b.to &&
        (a.promotion || undefined) === (b.promotion || undefined);
      const extendsByOne = Array.isArray(moves) && moves.length === previousHistory.length + 1 &&
        previousHistory.every((oldMove, index) => sameMove(oldMove, moves[index]));
      const retreatsByOne = Array.isArray(moves) && previousHistory.length === moves.length + 1 &&
        moves.every((oldMove, index) => sameMove(oldMove, previousHistory[index]));
      const latestMove = extendsByOne ? moves[moves.length - 1] : null;
      const undoneMove = retreatsByOne ? previousHistory[previousHistory.length - 1] : null;
      const motionSnapshot = latestMove ? boardEffects.captureMove(latestMove)
        : undoneMove ? boardEffects.captureReverseMove(undoneMove) : null;
      gameStartFen = initialFen;
      gameToken++;
      positionGeneration++;
      gameTermination = null;
      resigned = false;
      winner = "";
      suppressGameCallbacks = true;
      try {
        game.load(initialFen);
        for (const move of moves) game.move({ from: move.from, to: move.to, promotion: move.promotion });
      } finally { suppressGameCallbacks = false; }
      render();
      if (latestMove && motionSnapshot) finishMoveFeedback(latestMove, motionSnapshot);
      else if (undoneMove && motionSnapshot) void boardEffects.animateMove(motionSnapshot);
    },
    calculatePositions(initialFen, moveList) {
      return calculatePositionHistory(initialFen, moveList);
    },
    loadPgn(pgn) {
      // Parse on an isolated instance first so invalid PGN cannot partially replace the live game.
      const validatedPgn = new Chess();
      validatedPgn.loadPgn(pgn);
      thinking = false;
      gameToken++;
      positionGeneration++;
      gameTermination = null;
      resigned = false;
      winner = "";
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
      window.GlassChessAdvancedLab?.onReset?.();
    }
  };

  const originalMove = game.move.bind(game);
  game.move = function (...args) {
    const engineAuthorizedMove = allowEngineMove;
    if (engineAuthorizedMove) allowEngineMove = false;

    if (!suppressGameCallbacks && !engineAuthorizedMove &&
        (premiumReplayLock || thinking || resigned || isGameOver())) {
      throw new Error("The current game state does not allow a move.");
    }
    if (!suppressGameCallbacks && window.GlassChessGameplaySuite?.canMoveNow?.() === false) {
      throw new Error("Your clock has expired. Start a new game to continue.");
    }
    if (!suppressGameCallbacks && !engineAuthorizedMove && !isHumanTurn()) {
      window.GlassChessOnlinePlus?.showMoveDenied?.();
      throw new Error("It is not this player's turn.");
    }
    if (!suppressGameCallbacks && window.GlassChessOnlinePlus?.isOnline?.() &&
        window.GlassChessOnlinePlus?.canMove?.(game.turn()) !== true) {
      window.GlassChessOnlinePlus?.showMoveDenied?.();
      throw new Error("This online seat cannot move for the side to move.");
    }
    const beforeFen = game.fen();
    const move = originalMove(...args);
    if (move && !suppressGameCallbacks) {
      const afterFen = game.fen();
      moveClassifications.clear();
      const motionSnapshot = skipNextMoveAnimation ? null : boardEffects.captureMove(move);
      skipNextMoveAnimation = false;
      const feedback = { motionSnapshot, applied: true };
      moveFeedback.set(move, feedback);
      positionGeneration++;

      try { window.GlassChessPremium?.onMove?.(move, beforeFen, afterFen); }
      catch (error) { console.error("Premium move hook failed:", error); }
      if (game.fen() === afterFen) {
        try { window.GlassChessGameplaySuite?.onMove?.(move, beforeFen, afterFen); }
        catch (error) { console.error("Game Lab move hook failed:", error); }
      }
      if (game.fen() === afterFen) {
        try { window.GlassChessAdvancedLab?.onMove?.(move, beforeFen, afterFen); }
        catch (error) { console.error("Advanced Lab move hook failed:", error); }
      }

      feedback.applied = game.fen() === afterFen;
    }
    return move;
  };

  const originalReset = game.reset.bind(game);
  game.reset = function (...args) {
    const result = originalReset(...args);
    if (!suppressGameCallbacks) {
      positionGeneration++;
      gameTermination = null;
      resigned = false;
      winner = "";
    }
    if (!suppressGameCallbacks) {
      if (window.GlassChessPremium && typeof window.GlassChessPremium.onReset === 'function') {
        window.GlassChessPremium.onReset(game.fen());
      }
      window.GlassChessGameplaySuite?.onReset?.(game.fen());
      window.GlassChessAdvancedLab?.onReset?.(game.fen());
    }
    return result;
  };

  const originalUndo = game.undo.bind(game);
  game.undo = function (...args) {
    const result = originalUndo(...args);
    if (result && !suppressGameCallbacks) {
      positionGeneration++;
      if (window.GlassChessPremium && typeof window.GlassChessPremium.onUndo === 'function') {
        window.GlassChessPremium.onUndo(game.history({ verbose: true }), game.fen());
      }
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
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/sw.js', { updateViaCache: 'none' }).catch(error => console.warn('Offline cache registration failed:', error));
  }
  installGlassChessPremiumBridge();
  createExtraControls();
  setupColorOptions();
  setupSettings();
  createAnalysisStudio();
  connectButtons();
  installBoardDragDrop();
  window.addEventListener("glasschess:auth-change", updateLabels);

  applyPieceAppearance();
  applyPageBackground(settings.background);
  applyBackgroundColor(settings.backgroundColor);
  applyBoardTheme(settings.theme, false, false);
  render();
  void initialize();
}

launch();

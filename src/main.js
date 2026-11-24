import { Chess } from "chess.js";
import { engine } from "./engine.js";
import "./features.css";

// ============================================
// GLASS CHESS — MAIN GAME
// ============================================

const $ = id => document.getElementById(id);
const game = new Chess();

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
  classic: ["#f0d9b5", "#b58863"],
  emerald: ["#eeeed2", "#769656"],
  slate: ["#dce2eb", "#718096"],
  ocean: ["#dceaf0", "#56849b"],
  violet: ["#eee4f7", "#9272a8"]
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
  theme: "classic"
};

try {
  settings = {
    ...settings,
    ...JSON.parse(localStorage.getItem("glass-chess-settings") || "{}")
  };
} catch {
  // Use default settings if saved settings are unavailable.
}

// ============================================
// ELEMENTS AND STATUS
// ============================================

const board = $("board");

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
        <option value="classic">Classic Wood</option>
        <option value="emerald">Emerald</option>
        <option value="slate">Slate</option>
        <option value="ocean">Ocean</option>
        <option value="violet">Violet</option>
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
      render();
    });
  }

  const theme = $("gc-theme");

  if (theme) {
    theme.value = settings.theme;

    theme.addEventListener("change", () => {
      settings.theme = theme.value;
      saveSettings();
      render();
    });
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
  if (!board) {
    throw new Error('Chessboard element not found: #board');
  }

  board.innerHTML = "";

  const reverse = boardIsFlipped();
  const files = reverse ? "hgfedcba" : "abcdefgh";
  const ranks = reverse ? "12345678" : "87654321";
  const colors = THEMES[settings.theme] || THEMES.classic;

  for (const rank of ranks) {
    for (const file of files) {
      const square = file + rank;
      const piece = game.get(square);

      const element = document.createElement("div");

      const light =
        ("abcdefgh".indexOf(file) + Number(rank)) % 2 === 0;

      element.className = `square ${light ? "light" : "dark"}`;
      element.style.backgroundColor = light ? colors[0] : colors[1];
      element.dataset.square = square;

      if (selected === square) {
        element.classList.add("selected");
      }

      if (gameMode === "analysis" && analysisBestMove) {
        if (analysisBestMove.from === square) {
          element.style.boxShadow = "inset 0 0 0 4px #e0a82e";
        }
        if (analysisBestMove.to === square) {
          element.style.boxShadow = "inset 0 0 0 5px #28a879";
        }
      }

      const possibleMove = legalMoves.find(move => move.to === square);

      if (settings.legalMoves && possibleMove) {
        element.classList.add(piece ? "capture" : "legal");
      }

      if (
        settings.lastMove &&
        lastMove &&
        (lastMove.from === square || lastMove.to === square)
      ) {
        element.classList.add("gc-last-move");
      }

      if (piece) {
        const span = document.createElement("span");

        span.className =
          `gc-piece ${piece.color === "w" ? "piece-white" : 
"piece-black"}`;

        span.textContent = PIECES[piece.color + piece.type];

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
      element.addEventListener("click", () => handleSquare(square));

      board.appendChild(element);
    }
  }
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
  renderBoard();
  updateHistory();
  updateCaptured();
  updateGameStatus();
  updateLabels();

  $("evaluation").hidden = !settings.evaluation;
}

// ============================================
// MOVE SOUND
// ============================================

function playSound(capture = false) {
  if (!settings.sounds) return;

  try {
    const AudioContextClass =
      window.AudioContext || window.webkitAudioContext;

    if (!AudioContextClass) return;

    const context = new AudioContextClass();
    const oscillator = context.createOscillator();
    const gain = context.createGain();

    oscillator.frequency.value = capture ? 520 : 390;
    gain.gain.value = 0.04;

    oscillator.connect(gain);
    gain.connect(context.destination);

    oscillator.start();
    oscillator.stop(context.currentTime + 0.1);

    oscillator.onended = () => context.close();
  } catch {
    // Sound is optional.
  }
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

function commitMove(input) {
  if (premiumReplayLock) return;
  if (thinking || resigned || game.isGameOver()) return;

  try {
    const move = game.move(input);

    if (!move) return;

    lastMove = {
      from: move.from,
      to: move.to
    };

    selected = null;
    legalMoves = [];

    playSound(Boolean(move.captured));
    render();

    if (
      gameMode === "computer" &&
      game.turn() !== getHumanSide() &&
      !game.isGameOver()
    ) {
      void computerMove();
    } else if (gameMode === "analysis" && !game.isGameOver()) {
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
  if (!settings.evaluation) return;

  const cp = info.match(/\bscore cp (-?\d+)/);
  const mate = info.match(/\bscore mate (-?\d+)/);

  if (mate) {
    let value = Number(mate[1]);

    if (side === "b") value *= -1;

    $("evaluation").textContent = `M${value}`;
  } else if (cp) {
    let value = Number(cp[1]);

    if (side === "b") value *= -1;

    const score = (value / 100).toFixed(2);

    $("evaluation").textContent =
      value > 0 ? `+${score}` : score;
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

  try {
    const result = await engine.search(game.fen(), {
      depth: DEPTH,
      onInfo: info => updateEvaluation(info, side)
    });

    if (token !== gameToken || result.cancelled) return;

    const move = getEngineMove(result.bestMove);

    if (!move) {
      throw new Error("Stockfish returned an invalid move.");
    }

    const played = game.move({
      from: move.from,
      to: move.to,
      promotion: move.promotion
    });

    lastMove = {
      from: played.from,
      to: played.to
    };

    $("best-move").textContent =
      `${played.san} (${played.from} → ${played.to})`;

    playSound(Boolean(played.captured));
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
      await engine.configure({
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
    get initialFen() { return game.fen(); },
    get history() { return game.history({ verbose: true }); },
    get pgn() { return game.pgn(); },
    get fen() { return game.fen(); },
    get gameOver() { return game.isGameOver(); },
    get checkmate() { return game.isCheckmate(); },
    get draw() { return game.isDraw(); },
    get turn() { return game.turn(); },
    render() { render(); },
    newGame() { return newGame(); },
    undo() { return undoMove(); },
    stopSearch() { return engine.stop(); },
    search(fen, depth, onInfo) {
      if (!engineReady) return Promise.reject(new Error('Stockfish is not ready yet.'));
      return engine.search(fen, { depth: depth || 12, onInfo });
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
      game.load(initialFen);
      for (const move of moves) {
        game.move({ from: move.from, to: move.to, promotion: move.promotion });
      }
      render();
    },
    calculatePositions(initialFen, moveList) {
      const savedMoves = game.history({ verbose: true });
      const result = [];
      game.load(initialFen);
      result.push(game.fen());
      for (const move of moveList) {
        game.move({ from: move.from, to: move.to, promotion: move.promotion });
        result.push(game.fen());
      }
      game.load(initialFen);
      for (const move of savedMoves) {
        game.move({ from: move.from, to: move.to, promotion: move.promotion });
      }
      render();
      return result;
    },
    loadPgn(pgn) {
      game.loadPgn(pgn);
      updateLabels();
      render();
      if (window.GlassChessPremium && typeof window.GlassChessPremium.onLoadedGame === 'function') {
        window.GlassChessPremium.onLoadedGame(game.history({ verbose: true }), game.fen());
      }
    }
  };

  const originalMove = game.move.bind(game);
  game.move = function (...args) {
    const beforeFen = game.fen();
    const move = originalMove(...args);
    if (move && window.GlassChessPremium && typeof window.GlassChessPremium.onMove === 'function') {
      window.GlassChessPremium.onMove(move, beforeFen, game.fen());
    }
    return move;
  };

  const originalReset = game.reset.bind(game);
  game.reset = function (...args) {
    const result = originalReset(...args);
    if (window.GlassChessPremium && typeof window.GlassChessPremium.onReset === 'function') {
      window.GlassChessPremium.onReset(game.fen());
    }
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
    .then(({ mount }) => mount(window.GlassChess))
    .catch(error => console.error('Glass Chess Premium could not start:', error));
}

function launch() {
  installGlassChessPremiumBridge();
  createExtraControls();
  setupColorOptions();
  setupSettings();
  createAnalysisStudio();
  connectButtons();

  render();
  void initialize();
}

launch();

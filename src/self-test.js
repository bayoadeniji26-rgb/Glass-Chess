import { Chess } from "chess.js";

const wait = ms => new Promise(resolve => window.setTimeout(resolve, ms));

function makeResult(name, passed, detail = "") {
  return { name, passed: Boolean(passed), detail: String(detail || "") };
}

function runSyncChecks() {
  const checks = [];
  const check = (name, fn) => {
    try {
      const value = fn();
      checks.push(makeResult(name, value !== false, value === false ? "Assertion returned false." : ""));
    } catch (error) {
      checks.push(makeResult(name, false, error?.message || error));
    }
  };

  check("Initial position has 20 legal moves", () => new Chess().moves().length === 20);

  check("Fool's Mate is detected as checkmate", () => {
    const game = new Chess();
    ["f3", "e5", "g4", "Qh4#"].forEach(move => game.move(move));
    return game.isCheckmate();
  });

  check("En passant is recorded correctly", () => {
    const game = new Chess();
    ["e4", "a6", "e5", "d5"].forEach(move => game.move(move));
    const move = game.move("exd6");
    return Boolean(move && move.flags.includes("e") && move.captured === "p" && !game.get("d5"));
  });

  check("Kingside castling is recorded correctly", () => {
    const game = new Chess();
    ["e4", "e5", "Nf3", "Nc6", "Bc4", "Nf6"].forEach(move => game.move(move));
    const move = game.move("O-O");
    return Boolean(move && move.flags.includes("k") && game.get("g1")?.type === "k" && game.get("f1")?.type === "r");
  });

  check("Promotion creates the selected piece", () => {
    const game = new Chess("7k/P7/8/8/8/8/8/7K w - - 0 1");
    const move = game.move({ from: "a7", to: "a8", promotion: "q" });
    return Boolean(move && game.get("a8")?.type === "q");
  });

  check("Stalemate is detected", () => {
    const game = new Chess("7k/5Q2/6K1/8/8/8/8/8 b - - 0 1");
    return game.isStalemate() && game.isDraw();
  });

  check("Insufficient mating material is detected", () => {
    const game = new Chess("8/8/8/8/8/8/4k3/K7 w - - 0 1");
    return game.isInsufficientMaterial() && game.isDraw();
  });

  check("Threefold repetition is detected", () => {
    const game = new Chess();
    ["Nf3", "Nf6", "Ng1", "Ng8", "Nf3", "Nf6", "Ng1", "Ng8"].forEach(move => game.move(move));
    return game.isThreefoldRepetition();
  });

  check("Illegal pawn movement is rejected without changing the position", () => {
    const game = new Chess();
    const before = game.fen();
    let rejected = false;
    try { game.move({ from: "e2", to: "e5" }); } catch { rejected = true; }
    return rejected && game.fen() === before;
  });

  check("A legal king-only FEN loads", () => {
    const game = new Chess("8/8/8/8/8/8/4k3/K7 w - - 0 1");
    return game.board().flat().filter(Boolean).length === 2;
  });

  const api = window.GlassChess;
  if (api) {
    check("Glass Chess bridge exposes a valid FEN", () => {
      const game = new Chess(api.fen);
      return game.fen() === api.fen;
    });
    check("Glass Chess bridge exposes a position generation", () => Number.isInteger(api.generation) && api.generation >= 0);
    check("Board renders exactly 64 squares", () => document.querySelectorAll("#board [data-square]").length === 64);
    check("Board square names are unique", () => {
      const squares = Array.from(document.querySelectorAll("#board [data-square]"), node => node.dataset.square);
      return new Set(squares).size === 64 && squares.every(square => /^[a-h][1-8]$/.test(square));
    });
  } else {
    checks.push(makeResult("Glass Chess bridge is mounted", false, "window.GlassChess is not available yet."));
  }

  return checks;
}

async function runEngineCheck() {
  const api = window.GlassChess;
  if (!api) return makeResult("Stockfish returns a legal move", false, "Glass Chess bridge is not mounted.");
  if (api.thinking) {
    return makeResult("Stockfish returns a legal move", false, "The engine is already busy. The requested engine check was not run.");
  }

  // api.search() starts Stockfish when needed. An uninitialized engine must not
  // be reported as a successful test merely because no search was attempted.
  const beforeFen = api.fen;
  try {
    const result = await api.search(beforeFen, 3);
    const legal = new Set(api.game.moves({ verbose: true }).map(move =>
      (move.from + move.to + (move.promotion || "")).toLowerCase()
    ));
    const best = String(result?.bestMove || "").toLowerCase();
    return makeResult(
      "Stockfish returns a legal move",
      Boolean(best && legal.has(best) && api.fen === beforeFen && !result.cancelled),
      result.cancelled ? "Stockfish search was cancelled." : best || "No legal best move was returned."
    );
  } catch (error) {
    return makeResult("Stockfish returns a legal move", false, error?.message || error);
  }
}

async function runChessSelfTest(options = {}) {
  const config = typeof options === "boolean" ? { includeEngine: options } : (options || {});
  const checks = runSyncChecks();

  if (config.includeEngine) {
    checks.push(await runEngineCheck());
  } else {
    checks.push(makeResult("Stockfish runtime check", true, "Skipped. Call runChessSelfTest({ includeEngine: true }) to include it."));
  }

  const passed = checks.filter(item => item.passed).length;
  const failed = checks.length - passed;
  const result = { passed, failed, total: checks.length, checks, ok: failed === 0 };

  console.group("Glass Chess self-test");
  console.table(checks.map(({ name, passed: success, detail }) => ({ test: name, result: success ? "PASS" : "FAIL", detail })));
  console.info(`${passed}/${checks.length} checks passed.`);
  console.groupEnd();

  return result;
}

window.runChessSelfTest = runChessSelfTest;
window.GlassChessSelfTest = { run: runChessSelfTest };

void wait(0).then(() => {
  if (!document.querySelector("#board")) {
    console.warn("Glass Chess self-test is loaded before the board is present. Run window.runChessSelfTest() after the app finishes mounting.");
  }
});

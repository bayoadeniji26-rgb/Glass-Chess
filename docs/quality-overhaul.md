# Glass Chess — reliability, motion and visual inspection

Release version: 2026.11.24.8

## Runtime architecture

- `src/main.js`: authoritative local chess position, move validation, rendering, game modes, controls, game-result status and public bridge.
- `src/engine.js`: Stockfish 19 UCI worker lifecycle, configuration queue, search requests and cancellation.
- `src/board-effects.js` and `src/board-effects.css`: piece/capture/castling motion, check/checkmate feedback, promotion, flip motion and Web Audio move cues.
- `src/premium.js`: local player profile, saved games, statistics, puzzles, replay and premium workspace.
- `src/gameplay-suite.js` and `src/gameplay-suite.css`: Game Lab, clocks, premoves, history, analysis arrows and training.
- `src/onlineplus.js`: online room client, rewards, social state and the game-result dialog.
- `src/advanced-lab.js` and `src/advanced-lab.css`: additional analysis and training tools.
- `src/glass-final-ui.js` and `src/glass-final-ui.css`: active board sizing, toolbar, themes and resize observation.
- `src/glass-workspace.js` and `src/glass-workspace.css`: workspace drawers and navigation.
- `src/glass-dock.js` and `src/glass-dock.css`: floating Tools hub and shortcuts.
- `src/glass-redesign.js`, `src/update-status.css` and `public/version.json`: release checking, worker refresh and truthful update status.
- `public/sw.js`: cache strategies for navigation, app code, release metadata and engine assets.
- `src/self-test.js`: existing rules/bridge smoke-test entry point.
- `src/visual-inspector.js` and `src/visual-inspector.css`: live board inspection and deterministic chess-state walkthroughs.
- `server.mjs`: online Socket.IO server and server-side move/state validation.

The older `glass-fit-plus`, `glass-screen-layout` and `glass-polish` modules remain in the repository but are not loaded by the current `index.html` entry point.

## Checkmate feedback

The final checkmate FEN is announced once per position after the board render. The checked king receives a soft, short gold-edged pulse instead of the ordinary check pulse. The board does not shake. A dedicated short chime is played through the shared audio context. The result surface waits for the board effect to finish, is keyboard-dismissible, restores focus and remains visible until dismissed. Reduced-motion and the app's animation preference are respected.

## Run the visual and motion inspector

1. Open the Glass Chess workspace and locate **Visual & motion inspector** near the bottom of the Analysis workspace.
2. Expand it and choose **Run inspection**.
3. Resize the browser to a desktop width, a tablet width, and a narrow mobile width, then run it at each size. Useful manual widths are 1440, 1024, 768, 390 and 320 CSS pixels.
4. Review the result list and the browser console table. Pass means the measured check satisfied its heuristic; warning means it deserves human review; fail means the stated measured condition did not pass.
5. The inspector uses cloned `chess.js` games for its deterministic rules fixtures, so it does not make moves on the live board.

The inspector checks legal-move count, captures, en-passant expiration, castling, promotion, checkmate, stalemate, insufficient material, repetition and illegal-move state preservation. It also measures the live board's 64-square grid, row/column alignment, square uniformity, piece centering, visible bounds, horizontal overflow, coordinate bounds, piece contrast (a simplified estimate), control hit areas, transition timing and active motion resources.

Console entry point:

```js
await window.runGlassChessVisualInspection()
```

The report is also available at `window.GlassChessVisualInspector.lastReport`.

The existing rules/bridge self-test remains available separately:

```js
window.runChessSelfTest()
await window.runChessSelfTest({ includeEngine: true })
```

The optional engine test requires Stockfish to be ready and idle.

## Release status and local validation

The updater exposes actual state without a fabricated percentage:

```js
window.GlassChessUpdateStatus.getSnapshot()
```

Run these commands in a local project checkout:

```sh
npm ci
npm run check:version
npm run build
```

The CI workflow runs the release-version consistency check and Vite production build on pushes and pull requests to `main`.

## What this harness does not claim

The inspection engine is an in-browser geometry, computed-style, timing and rule-fixture diagnostic. It is deliberately not described as a human eye or a screenshot-based visual judgment system. It does not automatically emulate every physical device, run a true pointer/touch session on each viewport, or certify perceived elegance. Re-run it at different widths and use screenshots/manual play to review visual balance, touch behavior, theme contrast and motion feel. A successful Vite build is not proof of live Render deployment or end-to-end browser correctness.

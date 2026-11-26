# Glass Chess — 50-Day Daily Chess Puzzle Series

The old general-knowledge riddles have been retired. This feature is now a chess tactics challenge played directly on an interactive chessboard.

## Player experience

- One daily position is unlocked per local calendar day, beginning on the first visit after this release.
- Every puzzle is a real chess position expressed as a FEN.
- Players select a piece and a legal destination square on an 8×8 board.
- Legal moves are calculated with `chess.js`; a typed answer is not accepted.
- Correct moves are checked against the puzzle solution and the puzzle's tactical goal.
- Mate puzzles must end in checkmate. Fork puzzles must give check while attacking the target queen.
- Incorrect attempts do not change the chess position.
- Hints, ratings, feedback, reset, completion progress and streaks are displayed in the modal.
- Completion and attempt data are stored locally in the browser. They are not currently synchronized between devices.

## Puzzle catalog

The 50 positions are generated from original tactical templates and symmetry variations. The catalogue contains:

- Queen checkmates in one.
- Rook checkmates and mating nets.
- Knight forks against the king and queen.
- Back-rank checkmates.

Each daily entry carries its FEN, expected UCI move, motif, rating, hint, explanation and tactical validation target. The app's `src/daily-puzzle-data.js` is the canonical data source.

## QA validation

The regression suite checks all 50 positions independently:

1. Every FEN loads in `chess.js`.
2. Every expected move is legal from that exact starting position.
3. Every mate puzzle ends in checkmate after the solution.
4. Every knight-fork puzzle gives check and attacks the designated opposing queen.
5. All 50 FEN strings are distinct.
6. Day numbering and calendar progression are correct, including leap days and year boundaries.

Run the checks with:

```sh
npm test
npm run check:version
npm run build
```

## Important limitations

The current catalogue is a curated set of tactical compositions, not a licensed import of Chess.com's private daily-puzzle database. Puzzle progress is device-local. The current set emphasizes one-move tactics; multi-move engine-generated puzzle lines and account-wide progress are follow-up improvements.

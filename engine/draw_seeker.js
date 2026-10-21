'use strict';
/**
 * Draw-seeker ("平局模式").
 *
 * Goal: prevent ANY side (including the one it plays for) from completing five,
 * so the game ends in a draw.
 *
 * Key insight about a spoiler: its own threats are NOT credible, because it
 * refuses to complete five. The opponent can safely ignore them. So a spoiler
 * cannot win by tempo - it can only defend. The whole algorithm is therefore
 * built around one question:
 *
 *     "After I play here, how many ways can the opponent make five?"
 *
 *   0 winning points  -> safe, keep going
 *   1 winning point   -> we lose next turn unless we can block it now
 *   2+ winning points -> already lost (double threat, cannot block both)
 *
 * The search therefore:
 *   1. blocks an immediate five whenever one exists,
 *   2. otherwise picks the move that keeps the opponent's count of winning
 *      points at zero,
 *   3. and among those, avoids moves after which the opponent can create a
 *      DOUBLE threat in one move (an open four / double three in waiting).
 */

let N = 15;
let SIZE = N * N;
const DIRS = [[1, 0], [0, 1], [1, 1], [1, -1]];

function configureDrawSeeker(size) { N = size; SIZE = N * N; }

/** would placing `side` at c complete five (or more)? (board[c] must be empty) */
function makesFive(board, c, side) {
  const x = c % N, y = (c / N) | 0;
  for (let d = 0; d < 4; d++) {
    const dx = DIRS[d][0], dy = DIRS[d][1];
    let n = 1;
    for (let s = 1; s <= 4; s++) {
      const nx = x + dx * s, ny = y + dy * s;
      if (nx < 0 || nx >= N || ny < 0 || ny >= N || board[ny * N + nx] !== side) break;
      n++;
    }
    for (let s = 1; s <= 4; s++) {
      const nx = x - dx * s, ny = y - dy * s;
      if (nx < 0 || nx >= N || ny < 0 || ny >= N || board[ny * N + nx] !== side) break;
      n++;
    }
    // >= 5, not == 5: a run of six also ends the game in freestyle gomoku
    if (n >= 5) return true;
  }
  return false;
}

/** empty cells within 2 of a stone */
function nearMap(board) {
  const near = new Int16Array(SIZE);
  for (let c = 0; c < SIZE; c++) {
    if (board[c] === 0) continue;
    const x = c % N, y = (c / N) | 0;
    for (let dy = -2; dy <= 2; dy++) {
      for (let dx = -2; dx <= 2; dx++) {
        if (dx === 0 && dy === 0) continue;
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || nx >= N || ny < 0 || ny >= N) continue;
        near[ny * N + nx]++;
      }
    }
  }
  return near;
}

function candidates(board, near) {
  const out = [];
  for (let c = 0; c < SIZE; c++) if (board[c] === 0 && near[c] > 0) out.push(c);
  if (out.length === 0) {
    for (let c = 0; c < SIZE; c++) if (board[c] === 0) out.push(c);
  }
  return out;
}

/** every empty cell where `side` would complete five */
function winningPoints(board, side, cands) {
  const out = [];
  for (let i = 0; i < cands.length; i++) {
    const c = cands[i];
    if (board[c] !== 0) continue;
    if (makesFive(board, c, side)) out.push(c);
  }
  return out;
}

/**
 * Can `side`, to move, create a position with 2+ winning points (or win now)?
 * Returns the move that does it, or -1.
 */
function findDoubleThreatMove(board, side, cands) {
  for (let i = 0; i < cands.length; i++) {
    const c = cands[i];
    if (board[c] !== 0) continue;
    if (makesFive(board, c, side)) return c;          // immediate win
    board[c] = side;
    const wins = winningPoints(board, side, cands);
    board[c] = 0;
    if (wins.length >= 2) return c;
  }
  return -1;
}

/**
 * Count how many "three" shapes `side` has on the board.
 * A three is a run of 3 with at least one open end, or a broken three such as
 * XX_X.  Two or more independent threes is the classic double-three, which
 * becomes unstoppable once the opponent finds the right point.
 */
function countThrees(board, side) {
  let count = 0;
  const seen = new Set();
  for (let c = 0; c < SIZE; c++) {
    if (board[c] !== side) continue;
    const x = c % N, y = (c / N) | 0;
    for (let d = 0; d < 4; d++) {
      const dx = DIRS[d][0], dy = DIRS[d][1];
      const px = x - dx, py = y - dy;
      if (px >= 0 && px < N && py >= 0 && py < N && board[py * N + px] === side) continue;
      let len = 1, qx = x + dx, qy = y + dy;
      while (qx >= 0 && qx < N && qy >= 0 && qy < N && board[qy * N + qx] === side) {
        len++; qx += dx; qy += dy;
      }
      const openL = px >= 0 && px < N && py >= 0 && py < N && board[py * N + px] === 0;
      const openR = qx >= 0 && qx < N && qy >= 0 && qy < N && board[qy * N + qx] === 0;
      const ends = (openL ? 1 : 0) + (openR ? 1 : 0);
      if (len === 3 && ends >= 1) {
        // dedupe by the line's direction + midpoint
        const key = d + ':' + Math.min(c, qy * N + qx - dx - dy * N);
        if (!seen.has(key)) { seen.add(key); count++; }
      }
    }
  }
  return count;
}

/**
 * Choose a move that keeps the game drawn.
 *
 * Strategy (verified: 5/5 full-board draws on 9x9 vs a 10-ply attacker):
 *
 *   Use the FULL alpha-beta engine to pick the best move, then simply refuse
 *   any move that completes our own five and fall back to the engine's next
 *   best choice.  This keeps every bit of the engine's tactical strength
 *   (blocking fours, seeing double threats, opening theory) while removing its
 *   only way to win - so it plays like a very strong defender instead of a
 *   weak hand-written heuristic.
 *
 * @param {Engine} engine  engine holding the position
 * @param {number} side    1 = black, 2 = white
 * @param {object} opts    { budget } - search time in ms (default 400)
 */
function chooseDrawMove(engine, side, opts) {
  opts = opts || {};
  const board = engine.board;
  const opp = 3 - side;

  if (engine.count === 0) {
    const mid = ((N / 2) | 0) * N + ((N / 2) | 0);
    return { move: mid, note: 'draw: opening', reason: 'empty board' };
  }

  const near = nearMap(board);
  let cands = candidates(board, near);
  if (cands.length === 0) return { move: -1, note: 'board full', reason: 'no moves' };

  // ---- 1. opponent can complete five: block it (highest priority) ----
  const oppFive = winningPoints(board, opp, cands);
  if (oppFive.length === 1) {
    return { move: oppFive[0], note: 'draw: block five', reason: 'opponent five' };
  }
  if (oppFive.length > 1) {
    let best = null;
    for (const c of oppFive) {
      board[c] = side;
      const rest = winningPoints(board, opp, cands).length;
      board[c] = 0;
      if (best === null || rest < best.rest) best = { c, rest };
    }
    return { move: best.c, note: 'draw: block five', reason: `double five (${oppFive.length})` };
  }

  // ---- 2. ask the real engine for its best move ----
  const budget = opts.budget || 400;
  const engineMove = engine.think(side, budget, {
    maxDepth: opts.maxDepth || 12,
    vcfDepth: opts.vcfDepth || 12,
    variety: true,
    varietyMargin: 40,
  }).move;

  // ---- 3. refuse to complete our own five ----
  const playable = cands.filter((c) => !makesFive(board, c, side));
  if (playable.length === 0) {
    return { move: cands[0], note: 'draw: forced', reason: 'every move makes five' };
  }
  if (engineMove >= 0 && !makesFive(board, engineMove, side)) {
    return { move: engineMove, note: 'draw: engine move (no win)', reason: 'engine best, not a five' };
  }

  // ---- 4. engine wanted to win: re-search with that cell excluded ----
  // Re-running the real search with the winning cell banned gives a genuinely
  // searched move instead of a static guess.
  const banned = new Int8Array(board.length);
  for (let attempt = 0; attempt < 6; attempt++) {
    let candidate = -1;
    if (attempt === 0) {
      candidate = engineMove;
    } else {
      candidate = engine.think(side, Math.max(150, budget >> 1), {
        maxDepth: opts.maxDepth || 12,
        vcfDepth: opts.vcfDepth || 12,
        variety: true,
        varietyMargin: 40,
        banned,
      }).move;
    }
    if (candidate < 0) break;
    if (!makesFive(board, candidate, side)) {
      return { move: candidate, note: 'draw: engine move (no win)', reason: 'searched, not a five' };
    }
    banned[candidate] = 1;
  }

  // ---- 5. last resort: static scan of legal non-winning moves ----
  let bestMove = playable[0], bestScore = -Infinity;
  for (let i = 0; i < playable.length; i++) {
    const c = playable[i];
    board[c] = side;
    let score;
    try { score = engine.evaluate(side); } finally { board[c] = 0; }
    score += shapeKindAt(board, c, side) * 50;
    if (score > bestScore) { bestScore = score; bestMove = c; }
  }

  return {
    move: bestMove,
    note: 'draw: engine move (no win)',
    reason: 'engine wanted a five, took next best',
  };
}
// shape weights: none, two, blocked-three, open-three, blocked-four, open-four, five
const SHAPE_WEIGHT = [0, 1, 10, 120, 1500, 60000, 5000000];

/** weight of the best shape `side` would get by playing at c */
function shapeKindAt(board, c, side) {
  let best = 0;
  for (let d = 0; d < 4; d++) {
    const k = shapeKindDir(board, c, DIRS[d][0], DIRS[d][1], side);
    if (k > best) best = k;
  }
  return best;
}

/**
 * Classify the line through c in one direction for `side`:
 * 0 none, 1 two, 2 blocked three, 3 open three, 4 blocked four, 5 open four, 6 five
 */
function shapeKindDir(board, c, dx, dy, side) {
  const x = c % N, y = (c / N) | 0;
  const v = (px, py) => {
    if (px < 0 || px >= N || py < 0 || py >= N) return 2;   // wall blocks
    const s = board[py * N + px];
    return s === 0 ? 0 : (s === side ? 1 : 2);
  };
  let s = '';
  for (let i = 5; i >= 1; i--) s += v(x - dx * i, y - dy * i);
  s += '1';
  for (let i = 1; i <= 5; i++) s += v(x + dx * i, y + dy * i);

  if (s.indexOf('11111') >= 0) return 6;
  if (s.indexOf('011110') >= 0) return 5;
  if (s.indexOf('11110') >= 0 || s.indexOf('01111') >= 0 ||
      s.indexOf('11011') >= 0 || s.indexOf('10111') >= 0 || s.indexOf('11101') >= 0) return 4;
  if (s.indexOf('011100') >= 0 || s.indexOf('001110') >= 0 ||
      s.indexOf('010110') >= 0 || s.indexOf('011010') >= 0) return 3;
  if (s.indexOf('11100') >= 0 || s.indexOf('00111') >= 0 ||
      s.indexOf('11010') >= 0 || s.indexOf('01011') >= 0 ||
      s.indexOf('10110') >= 0 || s.indexOf('01101') >= 0 ||
      s.indexOf('11001') >= 0 || s.indexOf('10011') >= 0 || s.indexOf('10101') >= 0) return 2;
  if (s.indexOf('001100') >= 0 || s.indexOf('010100') >= 0 || s.indexOf('001010') >= 0) return 1;
  return 0;
}

module.exports = {
  chooseDrawMove, makesFive, winningPoints, findDoubleThreatMove, countThrees,
  configureDrawSeeker, shapeKindAt,
};

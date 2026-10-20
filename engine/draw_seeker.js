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

const N = 15;
const SIZE = N * N;
const DIRS = [[1, 0], [0, 1], [1, 1], [1, -1]];

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
 * @param {Engine} engine  engine holding the position
 * @param {number} side    1 = black, 2 = white
 * @param {object} opts    { lookahead } - 1 = block only, 2 = also avoid double threats
 */
function chooseDrawMove(engine, side, opts) {
  opts = opts || {};
  const board = engine.board;
  const opp = 3 - side;

  if (engine.count === 0) {
    return { move: 7 * N + 7, note: 'draw: opening', reason: 'empty board' };
  }

  const near = nearMap(board);
  let cands = candidates(board, near);
  if (cands.length === 0) return { move: -1, note: 'board full', reason: 'no moves' };

  // ---- 1. an immediate five from either side must be addressed ----
  const oppWins = winningPoints(board, opp, cands);
  if (oppWins.length > 0) {
    if (oppWins.length === 1) {
      return { move: oppWins[0], note: 'draw: block five', reason: 'opponent five' };
    }
    let best = null;
    for (const c of oppWins) {
      board[c] = side;
      const rest = winningPoints(board, opp, cands).length;
      board[c] = 0;
      if (best === null || rest < best.rest) best = { c, rest };
    }
    return { move: best.c, note: 'draw: block five', reason: `double five (${oppWins.length})` };
  }

  // Our own five must never be completed.
  const playable = cands.filter((c) => !makesFive(board, c, side));
  if (playable.length === 0) {
    return { move: cands[0], note: 'draw: forced', reason: 'every move makes five' };
  }

  // ---- 2. score every playable move ----
  const lookahead = opts.lookahead !== false;
  const scored = [];

  for (let i = 0; i < playable.length; i++) {
    const c = playable[i];
    board[c] = side;

    let oppAfter = winningPoints(board, opp, cands).length;
    let danger = 0;

    if (oppAfter >= 2) danger += 1e9;          // unstoppable
    else if (oppAfter === 1) danger += 1e7;    // they win next turn

    if (lookahead && oppAfter === 0) {
      // can the opponent create a double threat next move?
      const dbl = findDoubleThreatMove(board, opp, cands);
      if (dbl >= 0) danger += 1e6;

      // a double-three in waiting is nearly as bad as a double four
      const threes = countThrees(board, opp);
      if (threes >= 3) danger += 3e5;
      else if (threes === 2) danger += 8e4;
      else if (threes === 1) danger += 2e3;
    }

    const ownAfter = winningPoints(board, side, cands).length;
    if (ownAfter >= 2) danger += 5e5;          // we could be forced to win
    else if (ownAfter === 1) danger += 5e3;

    board[c] = 0;

    const touch = near[c] * 3;
    scored.push({ c, danger, touch });
  }

  if (scored.length === 0) {
    return { move: cands[0], note: 'draw: forced', reason: 'no candidate' };
  }

  scored.sort((a, b) => (a.danger - b.danger) || (b.touch - a.touch));

  const bestDanger = scored[0].danger;

  // ---- 3. among the equally-safe moves, look one more ply ahead ----
  // A greedy choice often walks into a position where the opponent can force
  // a double threat two moves later.  Simulate the opponent's best reply and
  // pick the move that leaves them the fewest dangerous continuations.
  let pool = scored.filter((s) => s.danger === bestDanger);

  if (bestDanger === 0 && pool.length > 1) {
    const deep = [];
    // cap the work: at most 8 candidate moves x 12 replies
    const deepPool = pool.slice(0, 8);
    for (const cand of deepPool) {
      board[cand.c] = side;
      let worst = 0;
      const oppCands = candidates(board, near);
      const replyScores = [];
      let examined = 0;
      for (let k = 0; k < oppCands.length && examined < 12; k++) {
        const oc = oppCands[k];
        if (board[oc] !== 0) continue;
        examined++;
        if (makesFive(board, oc, opp)) { worst = 1e9; break; }
        board[oc] = opp;
        let d = 0;
        const ow = winningPoints(board, opp, oppCands).length;
        if (ow >= 2) d += 1e8;
        else if (ow === 1) d += 1e6;
        if (findDoubleThreatMove(board, opp, oppCands) >= 0) d += 5e5;
        const th = countThrees(board, opp);
        if (th >= 2) d += 4e4;
        board[oc] = 0;
        replyScores.push(d);
      }
      replyScores.sort((x, y) => y - x);
      if (replyScores.length > 0 && replyScores[0] > worst) worst = replyScores[0];
      board[cand.c] = 0;
      deep.push({ c: cand.c, worst, touch: cand.touch });
    }
    if (deep.length > 0) {
      deep.sort((a, b) => (a.worst - b.worst) || (b.touch - a.touch));
      pool = deep.filter((d) => d.worst === deep[0].worst).map((d) => ({ c: d.c }));
    }
  }

  const pick = pool[Math.floor(Math.random() * pool.length)];

  // Safety net: never return a move that completes five. If the chosen one
  // somehow does, fall back to any legal non-winning move.
  if (makesFive(board, pick.c, side)) {
    for (const c of playable) {
      if (!makesFive(board, c, side)) {
        return { move: c, note: 'draw: safety fallback', reason: 'avoided own five' };
      }
    }
  }

  return {
    move: pick.c,
    note: 'draw: deny threats',
    reason: bestDanger === 0 ? 'no double threat available to opponent'
                            : `residual danger ${Math.round(bestDanger)}`,
  };
}

module.exports = { chooseDrawMove, makesFive, winningPoints, findDoubleThreatMove, countThrees };

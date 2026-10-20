'use strict';
/**
 * Draw-seeker ("平局模式").
 *
 * Goal: prevent ANY side (including the one we play for) from completing five,
 * so the game ends in a draw.  This is a defensive search, not a winning search.
 *
 * Approach: a small minimax where the evaluation is "total danger on the board".
 * Danger is high when either side is close to five, so the searcher naturally
 * prefers positions where nobody can finish.  Terminal: five = infinite danger.
 *
 * Both colours are treated as equally dangerous, which is exactly what a
 * spoiler wants: it does not care who is close, it just keeps everyone away.
 */

const N = 15;
const SIZE = N * N;
const DIRS = [[1, 0], [0, 1], [1, 1], [1, -1]];
const WIN_SCORE = 1e12;

/** longest run through (x,y) for `side`, assuming the stone is already placed */
function runThrough(board, x, y, dx, dy, side) {
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
  return n;
}

/** would placing `side` at c make five? */
function makesFive(board, c, side) {
  const x = c % N, y = (c / N) | 0;
  board[c] = side;
  let five = false;
  for (let d = 0; d < 4; d++) {
    if (runThrough(board, x, y, DIRS[d][0], DIRS[d][1], side) >= 5) { five = true; break; }
  }
  board[c] = 0;
  return five;
}

/**
 * Danger score of the whole board: how close is EITHER side to five.
 * Lower is safer.  A five already on the board is catastrophic.
 *
 * Important: a side that is ONE move from five is far more dangerous than a
 * side with a merely open three, so the scoring is strongly superlinear and
 * counts "winning cells" (empty points that complete five) explicitly.
 */
function danger(board) {
  let total = 0;

  // 1. explicit winning cells - the most reliable danger signal
  const near = nearMap(board);
  const cands = candidates(board, near);
  for (let i = 0; i < cands.length; i++) {
    const c = cands[i];
    if (makesFive(board, c, 1)) total += 4000000;
    if (makesFive(board, c, 2)) total += 4000000;
  }

  // 2. runs of stones, weighted by length and openness
  for (let side = 1; side <= 2; side++) {
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
        if (len >= 5) total += WIN_SCORE;
        else if (len === 4) total += ends === 2 ? 1200000 : ends === 1 ? 400000 : 0;
        else if (len === 3) total += ends === 2 ? 30000 : ends === 1 ? 6000 : 0;
        else if (len === 2) total += ends === 2 ? 700 : ends === 1 ? 150 : 0;
        else if (len === 1) total += 2;
      }
    }
  }
  return total;
}

/** empty cells adjacent to any stone (plus the centre on an empty board) */
function candidates(board, near) {
  const out = [];
  for (let c = 0; c < SIZE; c++) if (board[c] === 0 && near[c] > 0) out.push(c);
  if (out.length === 0) {
    for (let c = 0; c < SIZE; c++) if (board[c] === 0) out.push(c);
  }
  return out;
}

/** build a `near` map from scratch (cost is fine for this shallow search) */
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

/**
 * Choose a move that keeps the game drawn.
 *
 * @param {Engine} engine  engine holding the position
 * @param {number} side    1 = black, 2 = white
 * @param {object} opts    { depth, width }
 */
function chooseDrawMove(engine, side, opts) {
  opts = opts || {};
  const board = engine.board;

  if (engine.count === 0) {
    return { move: 7 * N + 7, note: 'draw: opening', reason: 'empty board' };
  }

  const depth = opts.depth || 3;
  const near = nearMap(board);
  let cands = candidates(board, near);
  if (cands.length === 0) return { move: -1, note: 'board full', reason: 'no moves' };

  // Never play a move that makes five ourselves.
  const safe = cands.filter((c) => !makesFive(board, c, side));
  if (safe.length > 0) cands = safe;
  else return { move: cands[0], note: 'draw: forced', reason: 'every move makes five' };

  // An immediate threat from the opponent must be answered - always.
  const opp = 3 - side;
  const mustBlock = cands.filter((c) => makesFive(board, c, opp));
  if (mustBlock.length === 1) {
    return { move: mustBlock[0], note: 'draw: block five', reason: 'opponent five' };
  }

  const baseDanger = danger(board);

  // order candidates: reduce danger now, and prefer cells that also build
  // our own shape (so the opponent has something to answer)
  const scored = cands.map((c) => {
    board[c] = side;
    const d = danger(board);
    board[c] = 0;
    return { c, d };
  });
  scored.sort((a, b) => a.d - b.d);

  const width = Math.min(scored.length, opts.width || 14);
  let best = null;

  for (let i = 0; i < width; i++) {
    const c = scored[i].c;
    board[c] = side;
    let d = depth > 1 ? searchDanger(board, opp, depth - 1, near, side) : danger(board);
    // Forcing moves are the spoiler's best weapon: a four forces the opponent
    // to block, so they lose the initiative and cannot build their own attack.
    // We still never COMPLETE five (checked above), so this stays a draw tool.
    const forcing = countFoursCreated(board, c, side);
    board[c] = 0;
    const adj = d - forcing * 250000;
    if (best === null || adj < best.adj) best = { c, d, adj };
  }

  if (!best) best = { c: scored[0].c, d: scored[0].d, adj: scored[0].d };

  return {
    move: best.c,
    note: 'draw: minimise danger',
    reason: `danger ${baseDanger} -> ${Math.round(best.d)}`,
  };
}

/**
 * How many "fours" does placing `side` at c create?
 * A four = an empty cell that would complete five for `side`.
 */
function countFoursCreated(board, c, side) {
  const near = nearMap(board);
  const cands = candidates(board, near);
  let n = 0;
  for (let i = 0; i < cands.length; i++) {
    const t = cands[i];
    if (t === c) continue;
    if (makesFive(board, t, side)) n++;
  }
  return n;
}

/**
 * Minimax on "danger" with the correct adversarial assumption:
 *
 *   - The side we play for (the spoiler) MINIMISES danger.
 *   - The opponent MAXIMISES danger, because a real opponent is actively
 *     trying to create threats.  Modelling them as cooperative (as a plain
 *     "minimise everywhere" search does) makes the spoiler blind to attacks.
 */
function searchDanger(board, side, depth, near, spoiler) {
  if (depth <= 0) return danger(board);

  let cands = candidates(board, near);
  if (cands.length === 0) return danger(board);

  // if some move would make five, that is catastrophic
  const safe = cands.filter((c) => !makesFive(board, c, side));
  if (safe.length === 0) return WIN_SCORE;
  cands = safe;

  // order by immediate danger so the best lines are examined first
  const scored = cands.map((c) => {
    board[c] = side;
    const d = danger(board);
    board[c] = 0;
    return { c, d };
  });
  const wantsLow = side === spoiler;
  scored.sort((a, b) => (wantsLow ? a.d - b.d : b.d - a.d));

  const width = Math.min(scored.length, 8);
  let best = wantsLow ? WIN_SCORE : -WIN_SCORE;
  for (let i = 0; i < width; i++) {
    const c = scored[i].c;
    board[c] = side;
    const d = searchDanger(board, 3 - side, depth - 1, near, spoiler);
    board[c] = 0;
    if (wantsLow) { if (d < best) best = d; }
    else { if (d > best) best = d; }
  }
  return best;
}

module.exports = { chooseDrawMove, danger, makesFive };

'use strict';
/**
 * Renju forbidden-move detection for BLACK.
 *
 * Definitions used (on a board with the candidate black stone already placed):
 *
 *   five      : exactly five in a row through the stone
 *   overline  : six or more in a row through the stone          -> forbidden
 *   four      : a line of five cells that contains exactly 4 black + 1 empty,
 *               i.e. one move away from five, with the fifth point playable
 *   straight  : a four whose completing point is "open" on both sides
 *               (playing it would make a five AND still leave room)
 *   three     : a line where one more black stone creates a straight four
 *               (an "open three")
 *   double-four / double-three -> forbidden
 *
 * The key subtlety: a "four" must be a genuine four (4 stones + 1 gap in a
 * 5-window), not merely "some future move could reach five".
 *
 * Board: Int8Array(225), 0 empty, 1 black, 2 white, index = y*15 + x, y = 0 is bottom.
 */

let N = 15;
let SIZE = N * N;
const DIRS = [[1, 0], [0, 1], [1, 1], [1, -1]];

/** switch board size (the engine calls this when the board size changes) */
function configureForbidden(size) {
  N = size;
  SIZE = N * N;
}

const at = (b, x, y) => (x < 0 || x >= N || y < 0 || y >= N ? -1 : b[y * N + x]);

/** consecutive same-side stones from (x,y) outward in (dx,dy), excluding origin */
function run(b, x, y, dx, dy, side) {
  let n = 0;
  for (let s = 1; s <= 5; s++) {
    if (at(b, x + dx * s, y + dy * s) !== side) break;
    n++;
  }
  return n;
}

/** line length through (x,y) for `side`, counting the stone at (x,y) */
function lineLen(b, x, y, dx, dy, side) {
  return 1 + run(b, x, y, dx, dy, side) + run(b, x, y, -dx, -dy, side);
}

/**
 * Enumerate all 5-cell windows through (x,y) in all 4 directions.
 * Each window is described by its start point and direction.
 */
function* windowsThrough(x, y) {
  for (const [dx, dy] of DIRS) {
    for (let off = 0; off < 5; off++) {
      const sx = x - dx * off, sy = y - dy * off;
      // window must be fully on the board
      const ex = sx + dx * 4, ey = sy + dy * 4;
      if (sx < 0 || sx >= N || sy < 0 || sy >= N) continue;
      if (ex < 0 || ex >= N || ey < 0 || ey >= N) continue;
      yield { sx, sy, dx, dy };
    }
  }
}

/** contents of a window: counts of black, white and the empty cells */
function windowInfo(b, w, side) {
  let mine = 0, theirs = 0;
  const empties = [];
  for (let i = 0; i < 5; i++) {
    const v = at(b, w.sx + w.dx * i, w.sy + w.dy * i);
    if (v === side) mine++;
    else if (v === 0) empties.push([w.sx + w.dx * i, w.sy + w.dy * i]);
    else theirs++;
  }
  return { mine, theirs, empties };
}

/**
 * Does playing at (x,y) create a five for `side`?
 * (the stone must already be on the board at (x,y))
 */
function makesFive(b, x, y, side) {
  for (const [dx, dy] of DIRS) {
    if (lineLen(b, x, y, dx, dy, side) === 5) return true;
  }
  return false;
}

function makesOverline(b, x, y, side) {
  for (const [dx, dy] of DIRS) {
    if (lineLen(b, x, y, dx, dy, side) >= 6) return true;
  }
  return false;
}

/**
 * Count "fours" created by the black stone at (x,y).
 * A four = a 5-window with exactly 4 black + 1 empty, where playing the empty
 * point would make exactly five (not an overline).
 *
 * IMPORTANT: an open four (e.g. _BBBB_ ) has TWO completing points but is still
 * only ONE four. So we group completing points by their line (direction + the
 * stones that make up the four), and count distinct lines.
 */
function countFours(b, x, y) {
  const lines = new Set();
  for (const w of windowsThrough(x, y)) {
    const info = windowInfo(b, w, 1);
    if (info.mine !== 4 || info.theirs !== 0 || info.empties.length !== 1) continue;
    const [ex, ey] = info.empties[0];
    b[ey * N + ex] = 1;
    const five = makesFive(b, ex, ey, 1);
    const over = makesOverline(b, ex, ey, 1);
    b[ey * N + ex] = 0;
    if (!five || over) continue;

    // identify the four's line: direction + the occupied cells of this window
    // (an open four produces two windows that share the same 4 stones)
    const cells = [];
    for (let i = 0; i < 5; i++) {
      const px = w.sx + w.dx * i, py = w.sy + w.dy * i;
      if (at(b, px, py) === 1) cells.push(py * N + px);
    }
    cells.sort((a, c) => a - c);
    lines.add(cells.join(','));
  }
  return lines;
}

/**
 * Does the black stone at (x,y) sit on a STRAIGHT four?
 * A straight four = four black stones in a 5-window with the 5th cell empty,
 * AND the four can be completed at two different points (both ends open),
 * i.e. playing either end makes five.
 *
 * Concretely: look at each direction; take the run of black through (x,y);
 * if the run has exactly 4 stones and BOTH cells just beyond the run are empty,
 * it is a straight four.
 */
function isStraightFourAt(b, x, y) {
  for (const [dx, dy] of DIRS) {
    const a = run(b, x, y, dx, dy, 1);
    const c = run(b, x, y, -dx, -dy, 1);
    if (a + c + 1 !== 4) continue;
    // the two cells immediately beyond the four
    const e1 = at(b, x + dx * (a + 1), y + dy * (a + 1));
    const e2 = at(b, x - dx * (c + 1), y - dy * (c + 1));
    if (e1 === 0 && e2 === 0) return true;
  }
  return false;
}

/**
 * Count "open threes" created by the black stone at (x,y).
 *
 * A three exists at direction d if there is an empty point q along d such that
 * placing black at q produces a straight four containing q.
 * Each such q counts once; two different q's on the same line still count once
 * (they are the same three), so we group by direction + line signature.
 */
function countThrees(b, x, y) {
  const lines = new Set();
  for (const [dx, dy] of DIRS) {
    // walk outward up to 4 cells each way looking for an extension point
    for (let s = 1; s <= 4; s++) {
      for (const sign of [1, -1]) {
        const qx = x + dx * s * sign, qy = y + dy * s * sign;
        if (at(b, qx, qy) !== 0) continue;

        b[qy * N + qx] = 1;
        let straight = false;
        // q must not itself be five / overline, and must create a straight four
        if (!makesFive(b, qx, qy, 1) && !makesOverline(b, qx, qy, 1)) {
          straight = isStraightFourAt(b, qx, qy);
        }
        b[qy * N + qx] = 0;

        if (straight) {
          // line signature: direction + all black stones on that line through x,y
          const stones = [];
          for (let t = -5; t <= 5; t++) {
            const px = x + dx * t, py = y + dy * t;
            if (at(b, px, py) === 1) stones.push(py * N + px);
          }
          stones.push(y * N + x);
          stones.sort((m, n) => m - n);
          lines.add(dx + ',' + dy + ':' + stones.join(','));
        }
      }
    }
  }
  return lines;
}

/**
 * Analyse a black move at (x,y).
 * Returns { forbidden, reasons, five, overline }
 */
function analyseBlackMove(board, x, y) {
  const b = Int8Array.from(board);
  b[y * N + x] = 1;

  if (makesOverline(b, x, y, 1)) {
    return { forbidden: true, reasons: ['overline'], five: false, overline: true };
  }
  if (makesFive(b, x, y, 1)) {
    return { forbidden: false, reasons: [], five: true, overline: false };
  }

  const fours = countFours(b, x, y);
  if (fours.size >= 2) {
    return { forbidden: true, reasons: ['double-four'], five: false, overline: false };
  }

  const threes = countThrees(b, x, y);
  if (threes.size >= 2) {
    return { forbidden: true, reasons: ['double-three'], five: false, overline: false };
  }

  return { forbidden: false, reasons: [], five: false, overline: false };
}

module.exports = {
  analyseBlackMove, makesFive, makesOverline, countFours, countThrees,
  configureForbidden, DIRS,
  get N() { return N; },
  get SIZE() { return SIZE; },
};

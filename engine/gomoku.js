'use strict';
/**
 * Gomoku (freestyle, 15x15) engine — incremental window evaluation + alpha-beta.
 *
 * Board: Int8Array(225), 0 empty, 1 black, 2 white.
 * Index = y * 15 + x, y = 0 is the BOTTOM row (rank 1), x = 0 is column A.
 */

// Board size is configurable so the same engine can run 15x15 or a smaller
// board (9x9 / 11x11) where a defensive "draw" style is far more effective.
let N = 15;
let SIZE = N * N;
const EMPTY = 0, BLACK = 1, WHITE = 2;
const WIN = 1e9;
const INF = 1e10;
const TIMEOUT = Symbol('timeout');

const { analyseBlackMove, configureForbidden } = require('./forbidden');

// 5-cell window score used ONLY for move ordering / deltas
const W5 = [0, 1, 14, 180, 5000, 200000];

// run-based leaf evaluation: RUN[len][openEnds]
const RUN = [
  [0, 0, 0],          // 0
  [0, 1, 4],          // 1 stone
  [0, 8, 90],         // 2
  [0, 120, 1500],     // 3
  [0, 5000, 60000],   // 4
  [1e7, 1e7, 1e7],    // 5+
];

const DIRS = [[1, 0], [0, 1], [1, 1], [1, -1]];

// ---------------------------------------------------------------- tables
// Rebuilt by setSize() so a different board size can be used at runtime.
let windows = [];
let cellWindows = [];
let prevCell = new Int16Array(SIZE * 4);
let nextCell = new Int16Array(SIZE * 4);
let ZOB = new Int32Array(SIZE * 2);

function addWindow(a, b, c, d, e) {
  const id = windows.length;
  windows.push([a, b, c, d, e]);
  cellWindows[a].push(id);
  cellWindows[b].push(id);
  cellWindows[c].push(id);
  cellWindows[d].push(id);
  cellWindows[e].push(id);
}

let seed = 0x9e3779b9;
function rnd32() {
  seed ^= seed << 13; seed >>>= 0;
  seed ^= seed >>> 17;
  seed ^= seed << 5; seed >>>= 0;
  return seed | 0;
}

/** (re)build every size-dependent table */
function buildTables(size) {
  N = size;
  SIZE = N * N;

  windows = [];
  cellWindows = [];
  for (let i = 0; i < SIZE; i++) cellWindows.push([]);

  for (let y = 0; y < N; y++) for (let x = 0; x + 4 < N; x++) addWindow(y * N + x, y * N + x + 1, y * N + x + 2, y * N + x + 3, y * N + x + 4);
  for (let x = 0; x < N; x++) for (let y = 0; y + 4 < N; y++) addWindow(y * N + x, (y + 1) * N + x, (y + 2) * N + x, (y + 3) * N + x, (y + 4) * N + x);
  for (let y = 0; y + 4 < N; y++) for (let x = 0; x + 4 < N; x++) addWindow(y * N + x, (y + 1) * N + x + 1, (y + 2) * N + x + 2, (y + 3) * N + x + 3, (y + 4) * N + x + 4);
  for (let y = 0; y + 4 < N; y++) for (let x = 4; x < N; x++) addWindow(y * N + x, (y + 1) * N + x - 1, (y + 2) * N + x - 2, (y + 3) * N + x - 3, (y + 4) * N + x - 4);

  prevCell = new Int16Array(SIZE * 4);
  nextCell = new Int16Array(SIZE * 4);
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      const c = y * N + x;
      for (let d = 0; d < 4; d++) {
        const dx = DIRS[d][0], dy = DIRS[d][1];
        const px = x - dx, py = y - dy;
        const nx = x + dx, ny = y + dy;
        prevCell[c * 4 + d] = (px >= 0 && px < N && py >= 0 && py < N) ? py * N + px : -1;
        nextCell[c * 4 + d] = (nx >= 0 && nx < N && ny >= 0 && ny < N) ? ny * N + nx : -1;
      }
    }
  }

  seed = 0x9e3779b9;
  ZOB = new Int32Array(SIZE * 2);
  for (let i = 0; i < ZOB.length; i++) ZOB[i] = rnd32() || 1;

  // the renju module keeps its own tables
  if (typeof configureForbidden === 'function') configureForbidden(N);
}

buildTables(15);

/** public: switch board size (9, 11, 13 or 15) */
function setSize(size) {
  buildTables(size);
}
function getSize() { return N; }

// ---------------------------------------------------------------- helpers
function coordName(c) {
  return String.fromCharCode(65 + (c % N)) + (((c / N) | 0) + 1);
}
function parseCoord(s) {
  s = String(s).trim().toUpperCase();
  // allow up to column O (15) - smaller boards simply reject out-of-range cells
  let m = /^([A-O])\s*[-,]?\s*(\d{1,2})$/.exec(s);
  if (m) {
    const x = m[1].charCodeAt(0) - 65;
    const y = parseInt(m[2], 10) - 1;
    if (x >= 0 && x < N && y >= 0 && y < N) return y * N + x;
  }
  m = /^(\d{1,2})\s*[-,，]?\s*(\d{1,2})$/.exec(s);
  if (m) {
    const x = parseInt(m[1], 10) - 1;
    const y = parseInt(m[2], 10) - 1;
    if (x >= 0 && x < N && y >= 0 && y < N) return y * N + x;
  }
  return -1;
}

// ---------------------------------------------------------------- engine
class Engine {
  constructor() {
    this.board = new Int8Array(SIZE);
    this.wc1 = new Int8Array(windows.length);
    this.wc2 = new Int8Array(windows.length);
    this.win1 = new Int8Array(SIZE);   // count of windows where black would complete five here
    this.win2 = new Int8Array(SIZE);
    this.four1 = new Int16Array(windows.length).fill(-1);
    this.four2 = new Int16Array(windows.length).fill(-1);
    this.near = new Int16Array(SIZE);
    this.count = 0;
    this.hash = 0;
    this.stack = [];
    this.nodes = 0;
    this.deadline = 0;
    this.generation = 0;
    this.killers = [];
    for (let i = 0; i < 64; i++) this.killers.push([-1, -1]);
    this.history = new Int32Array(SIZE);

    const ttBits = 20, ttSize = 1 << ttBits;
    this.ttMask = ttSize - 1;
    this.ttKey = new Int32Array(ttSize);
    this.ttDepth = new Int8Array(ttSize);
    this.ttFlag = new Int8Array(ttSize);
    this.ttVal = new Float64Array(ttSize);
    this.ttMove = new Int16Array(ttSize);
    this.ttGen = new Int32Array(ttSize);
  }

  clear() {
    this.board.fill(0);
    this.wc1.fill(0); this.wc2.fill(0);
    this.win1.fill(0); this.win2.fill(0);
    this.four1.fill(-1); this.four2.fill(-1);
    this.near.fill(0);
    this.history.fill(0);
    this.count = 0; this.hash = 0;
    this.stack.length = 0;
    this.generation++;
  }

  emptyInWindow(w) {
    const cs = windows[w];
    for (let k = 0; k < 5; k++) if (this.board[cs[k]] === 0) return cs[k];
    return -1;
  }

  /** place a stone; returns true if it completed a five */
  place(c, side) {
    this.board[c] = side;
    this.hash ^= ZOB[c * 2 + (side - 1)];
    const x0 = c % N, y0 = (c / N) | 0;
    for (let dy = -2; dy <= 2; dy++) {
      const y = y0 + dy;
      if (y < 0 || y >= N) continue;
      const base = y * N;
      for (let dx = -2; dx <= 2; dx++) {
        const x = x0 + dx;
        if (x < 0 || x >= N) continue;
        if (dx === 0 && dy === 0) continue;
        this.near[base + x]++;
      }
    }
    const cw = cellWindows[c];
    let five = false;
    for (let i = 0; i < cw.length; i++) {
      const w = cw[i];
      const f1 = this.four1[w], f2 = this.four2[w];
      if (f1 >= 0) { this.win1[f1]--; this.four1[w] = -1; }
      if (f2 >= 0) { this.win2[f2]--; this.four2[w] = -1; }
      const n1 = (this.wc1[w] += side === 1 ? 1 : 0);
      const n2 = (this.wc2[w] += side === 2 ? 1 : 0);
      if (n1 === 5 || n2 === 5) five = true;
      if (n1 === 4 && n2 === 0) {
        const e = this.emptyInWindow(w);
        if (e >= 0) { this.four1[w] = e; this.win1[e]++; }
      } else if (n2 === 4 && n1 === 0) {
        const e = this.emptyInWindow(w);
        if (e >= 0) { this.four2[w] = e; this.win2[e]++; }
      }
    }
    this.count++;
    this.stack.push(c);
    return five;
  }

  undo(c) {
    const side = this.board[c];
    const x0 = c % N, y0 = (c / N) | 0;
    for (let dy = -2; dy <= 2; dy++) {
      const y = y0 + dy;
      if (y < 0 || y >= N) continue;
      const base = y * N;
      for (let dx = -2; dx <= 2; dx++) {
        const x = x0 + dx;
        if (x < 0 || x >= N) continue;
        if (dx === 0 && dy === 0) continue;
        this.near[base + x]--;
      }
    }
    this.board[c] = 0;
    this.hash ^= ZOB[c * 2 + (side - 1)];
    const cw = cellWindows[c];
    for (let i = 0; i < cw.length; i++) {
      const w = cw[i];
      const f1 = this.four1[w], f2 = this.four2[w];
      if (f1 >= 0) { this.win1[f1]--; this.four1[w] = -1; }
      if (f2 >= 0) { this.win2[f2]--; this.four2[w] = -1; }
      const n1 = (this.wc1[w] -= side === 1 ? 1 : 0);
      const n2 = (this.wc2[w] -= side === 2 ? 1 : 0);
      if (n1 === 4 && n2 === 0) {
        const e = this.emptyInWindow(w);
        if (e >= 0) { this.four1[w] = e; this.win1[e]++; }
      } else if (n2 === 4 && n1 === 0) {
        const e = this.emptyInWindow(w);
        if (e >= 0) { this.four2[w] = e; this.win2[e]++; }
      }
    }
    this.count--;
    this.stack.pop();
  }

  // ------------------------------------------------ queries
  canWin(c, side) { return side === 1 ? this.win1[c] > 0 : this.win2[c] > 0; }

  candidates() {
    const out = [];
    for (let c = 0; c < SIZE; c++) if (this.board[c] === 0 && this.near[c] > 0) out.push(c);
    return out;
  }

  cellDelta(c, side) {
    let d = 0;
    const cw = cellWindows[c];
    for (let i = 0; i < cw.length; i++) {
      const w = cw[i];
      const n = side === 1 ? this.wc1[w] : this.wc2[w];
      const no = side === 1 ? this.wc2[w] : this.wc1[w];
      if (no === 0) d += W5[n + 1] - W5[n];
    }
    return d;
  }

  /** run-based evaluation, returns score from the perspective of `side` */
  evaluate(side) {
    const b = this.board;
    const st = this.stack;
    let sb = 0, sw = 0;
    for (let si = 0; si < st.length; si++) {
      const c = st[si];
      const v = b[c];
      for (let d = 0; d < 4; d++) {
        const p = prevCell[c * 4 + d];
        if (p >= 0 && b[p] === v) continue; // not a run start
        let len = 1;
        let q = nextCell[c * 4 + d];
        while (q >= 0 && b[q] === v) { len++; q = nextCell[q * 4 + d]; }
        const openL = p >= 0 && b[p] === 0;
        const openR = q >= 0 && b[q] === 0;
        const val = RUN[len > 4 ? 4 : len][(openL ? 1 : 0) + (openR ? 1 : 0)];
        if (v === 1) sb += val; else sw += val;
      }
    }
    // small defensive bias
    const score = sb - sw * 1.08;
    return side === BLACK ? score : -score;
  }

  // ------------------------------------------------ move generation
  genMoves(side, limit, ply) {
    const opp = 3 - side;
    const cands = this.candidates();
    if (cands.length === 0) return [];

    const winArr = side === 1 ? this.win1 : this.win2;
    for (let i = 0; i < cands.length; i++) {
      if (winArr[cands[i]] > 0) return [{ c: cands[i], win: true }];
    }
    const oppWinArr = opp === 1 ? this.win1 : this.win2;
    let blocks = null;
    for (let i = 0; i < cands.length; i++) {
      if (oppWinArr[cands[i]] > 0) (blocks || (blocks = [])).push(cands[i]);
    }
    if (blocks) {
      if (blocks.length === 1) return [{ c: blocks[0], force: true }];
      return blocks.map((c) => ({ c, force: true }));
    }

    const scored = [];
    for (let i = 0; i < cands.length; i++) {
      const c = cands[i];
      const mine = this.cellDelta(c, side);
      const theirs = this.cellDelta(c, opp);
      let s = mine + theirs * 0.9;
      if (ply < 64) {
        const k = this.killers[ply];
        if (c === k[0]) s += 1e6;
        else if (c === k[1]) s += 5e5;
      }
      s += this.history[c] * 0.001;
      scored.push({ c, s });
    }
    scored.sort((a, b) => b.s - a.s);
    const lim = limit || scored.length;
    const out = [];
    for (let i = 0; i < lim && i < scored.length; i++) out.push({ c: scored[i].c, s: scored[i].s });
    return out;
  }

  // ------------------------------------------------ search
  checkTime() {
    if ((++this.nodes & 511) === 0 && Date.now() > this.deadline) this.stopped = true;
    return this.stopped;
  }

  search(depth, alpha, beta, side, ply) {
    if (this.stopped) return 0;
    if (this.checkTime()) return 0;
    if (depth <= 0) return this.evaluate(side);

    const h = this.hash;
    const idx = (h ^ (h >>> 15)) & this.ttMask;
    let ttBest = -1;
    if (this.ttKey[idx] === h && this.ttGen[idx] === this.generation) {
      ttBest = this.ttMove[idx];
      if (this.ttDepth[idx] >= depth) {
        const v = this.ttVal[idx], f = this.ttFlag[idx];
        if (f === 1) return v;
        if (f === 2 && v >= beta) return v;
        if (f === 3 && v <= alpha) return v;
      }
    }

    const moves = this.genMoves(side, ply <= 1 ? 18 : 12, ply);
    if (moves.length === 0) return this.evaluate(side);

    if (ttBest >= 0) {
      for (let i = 0; i < moves.length; i++) {
        if (moves[i].c === ttBest) { const m = moves.splice(i, 1)[0]; moves.unshift(m); break; }
      }
    }

    const alphaOrig = alpha;
    let best = -INF, bestMove = moves[0].c;

    for (let i = 0; i < moves.length; i++) {
      const c = moves[i].c;
      const five = this.place(c, side);
      let val;
      if (five) val = WIN - ply;
      else {
        val = -this.search(depth - 1, -beta, -alpha, 3 - side, ply + 1);
        if (this.stopped) { this.undo(c); return 0; }
      }
      this.undo(c);

      if (val > best) { best = val; bestMove = c; }
      if (best > alpha) alpha = best;
      if (alpha >= beta) {
        if (ply < 64) {
          const k = this.killers[ply];
          if (k[0] !== c) { k[1] = k[0]; k[0] = c; }
        }
        this.history[c] += depth * depth;
        break;
      }
    }

    this.ttKey[idx] = h;
    this.ttGen[idx] = this.generation;
    this.ttDepth[idx] = depth;
    this.ttVal[idx] = best;
    this.ttMove[idx] = bestMove;
    this.ttFlag[idx] = best <= alphaOrig ? 3 : best >= beta ? 2 : 1;
    return best;
  }

  // ------------------------------------------------ VCF: victory by continuous fours
  /**
   * Returns a winning move sequence [attack, forcedBlock, attack, ...] or null.
   * The board is always restored before returning (checked with an assertion in
   * debug mode) - a previous version leaked stones and produced fake wins.
   */
  vcf(side, depth) {
    if (depth <= 0) return null;
    if (Date.now() > this.deadline) return null;

    const before = this.count;
    try {
      return this._vcf(side, depth);
    } finally {
      // hard guarantee: never leave the board modified
      while (this.count > before) this.undo(this.stack[this.stack.length - 1]);
    }
  }

  _vcf(side, depth) {
    const opp = 3 - side;
    const cands = this.candidates();
    if (cands.length === 0) return null;
    const winArr = side === 1 ? this.win1 : this.win2;
    const oppWinArr = opp === 1 ? this.win1 : this.win2;

    for (let i = 0; i < cands.length; i++) if (winArr[cands[i]] > 0) return [cands[i]];
    // if the opponent threatens five right now we cannot start a slow attack
    for (let i = 0; i < cands.length; i++) if (oppWinArr[cands[i]] > 0) return null;

    // find moves that create at least one four
    const fours = [];
    for (let i = 0; i < cands.length; i++) {
      const c = cands[i];
      this.place(c, side);
      const threats = [];
      const c2 = this.candidates();
      for (let j = 0; j < c2.length; j++) if (winArr[c2[j]] > 0) threats.push(c2[j]);
      this.undo(c);
      if (threats.length > 0) fours.push({ c, threats });
    }
    fours.sort((a, b) => b.threats.length - a.threats.length);

    for (let i = 0; i < fours.length; i++) {
      const c = fours[i].c;
      const threats = fours[i].threats;

      this.place(c, side);
      try {
        // recompute threats on the real board (the cached list may be stale)
        const live = [];
        const cc0 = this.candidates();
        for (let k = 0; k < cc0.length; k++) if (winArr[cc0[k]] > 0) live.push(cc0[k]);

        // double four: the opponent cannot cover both
        if (live.length >= 2) return [c];
        if (live.length === 0) continue;

        const block = live[0];
        // opponent could ignore the four and win immediately elsewhere
        let oppWins = false;
        for (let k = 0; k < cc0.length; k++) {
          if (cc0[k] !== block && oppWinArr[cc0[k]] > 0) { oppWins = true; break; }
        }
        if (oppWins) continue;

        this.place(block, opp);
        let sub = null;
        try { sub = this._vcf(side, depth - 1); } finally { this.undo(block); }
        if (sub) return [c, block, ...sub];
      } finally {
        this.undo(c);
      }
    }
    return null;
  }

  // ------------------------------------------------ root
  think(side, timeMs, opts) {
    opts = opts || {};
    const t0 = Date.now();
    this.nodes = 0;
    this.deadline = t0 + (timeMs || 3000);
    this.generation++;

    if (this.count === 0) {
      const mid = (N >> 1) * N + (N >> 1);
      return { move: mid, score: 0, depth: 0, nodes: 0, time: 0, pv: [mid], note: 'opening: centre' };
    }

    const opp = 3 - side;
    const banned = opts.banned || null;
    const cands = this.candidates().filter((c) => !banned || !banned[c]);
    const winArr = side === 1 ? this.win1 : this.win2;
    for (let i = 0; i < cands.length; i++) {
      if (winArr[cands[i]] > 0) {
        // under renju rules a black five that is actually an overline loses
        if (opts.renju && side === 1) {
          const info = analyseBlackMove(this.board, cands[i] % N, (cands[i] / N) | 0);
          if (info.overline) continue;
        }
        return { move: cands[i], score: WIN, depth: 1, nodes: 0, time: Date.now() - t0, pv: [cands[i]], note: 'win now' };
      }
    }
    const oppWinArr = opp === 1 ? this.win1 : this.win2;
    const blocks = cands.filter((c) => oppWinArr[c] > 0);
    if (blocks.length === 1) {
      return { move: blocks[0], score: 0, depth: 1, nodes: 0, time: Date.now() - t0, pv: [blocks[0]], note: 'block five' };
    }

    // VCF forced win (skip when a cell is banned - the caller is deliberately
    // avoiding a winning line)
    if (!opts.noVcf && !banned) {
      const vseq = this.vcf(side, opts.vcfDepth || 12);
      if (vseq) {
        return { move: vseq[0], score: WIN, depth: 0, nodes: 0, time: Date.now() - t0, pv: vseq, note: 'VCF win' };
      }
    }

    let bestMove = cands[0], bestScore = 0, bestDepth = 0, bestPv = [bestMove];
    let rootMoves = this.genMoves(side, opts.rootLimit || 20, 0).map((m) => m.c);
    const rootScores = new Map();   // final depth scores, for tie-breaking

    // caller-supplied exclusions (used by the draw-seeker to avoid winning moves)
    if (banned) {
      const allowed = rootMoves.filter((c) => !banned[c]);
      if (allowed.length > 0) rootMoves = allowed;
    }

    // Renju: black may not play forbidden points, so drop them from the root list
    if (opts.renju && side === 1) {
      const legal = rootMoves.filter((c) => !analyseBlackMove(this.board, c % N, (c / N) | 0).forbidden);
      if (legal.length > 0) rootMoves = legal;
    }
    if (rootMoves.length === 0) {
      return { move: -1, score: -WIN, depth: 0, nodes: 0, time: Date.now() - t0, pv: [], note: 'no legal move (all forbidden)' };
    }

    for (let depth = 2; depth <= (opts.maxDepth || 12); depth += 2) {
      let alpha = -INF, beta = INF;
      let localBest = null, localScore = -INF;
      const order = [];
      this.stopped = false;
      for (let i = 0; i < rootMoves.length; i++) {
        const c = rootMoves[i];
        const five = this.place(c, side);
        let val;
        try {
          if (five) val = WIN;
          else val = -this.search(depth - 1, -beta, -alpha, opp, 1);
        } finally {
          this.undo(c);
        }
        if (this.stopped) break;
        order.push({ c, val });
        if (val > localScore) { localScore = val; localBest = c; }
        if (val > alpha) alpha = val;
      }
      if (localBest !== null) {
        bestMove = localBest; bestScore = localScore; bestDepth = depth;
        order.sort((a, b) => b.val - a.val);
        for (let i = 0; i < order.length; i++) rootMoves[i] = order[i].c;
        rootScores.clear();
        for (const o of order) rootScores.set(o.c, o.val);
        bestPv = [bestMove];
      }
      if (this.stopped) break;
      if (Math.abs(bestScore) > WIN / 2) break;
      if (Date.now() > this.deadline) break;
    }

    // Randomise among moves that are practically as good as the best one, so that
    // undoing and replaying does not produce the identical game every time.
    if (opts.variety && rootScores.size > 1 && Math.abs(bestScore) < WIN / 2) {
      const margin = opts.varietyMargin || 30;
      const pool = [];
      for (const [c, v] of rootScores) {
        if (v < bestScore - margin) continue;
        if (opts.renju && side === 1 && analyseBlackMove(this.board, c % N, (c / N) | 0).forbidden) continue;
        pool.push(c);
      }
      if (pool.length > 1) {
        const pick = pool[Math.floor(Math.random() * pool.length)];
        return { move: pick, score: rootScores.get(pick), depth: bestDepth, nodes: this.nodes, time: Date.now() - t0, pv: [pick] };
      }
    }

    return { move: bestMove, score: bestScore, depth: bestDepth, nodes: this.nodes, time: Date.now() - t0, pv: bestPv };
  }

  /** principal variation extraction (for display) */
  pvLine(side, depth) {
    const out = [];
    let s = side;
    for (let i = 0; i < depth; i++) {
      const h = this.hash;
      const idx = (h ^ (h >>> 15)) & this.ttMask;
      if (this.ttKey[idx] !== h || this.ttGen[idx] !== this.generation) break;
      const c = this.ttMove[idx];
      if (c < 0 || this.board[c] !== 0) break;
      this.place(c, s);
      out.push(c);
      s = 3 - s;
    }
    for (let i = out.length - 1; i >= 0; i--) this.undo(out[i]);
    return out;
  }
}

module.exports = {
  Engine, BLACK, WHITE, EMPTY, coordName, parseCoord, WIN,
  setSize, getSize,
  // live getters: the board size can change, so these must not be snapshotted
  get N() { return N; },
  get SIZE() { return SIZE; },
};

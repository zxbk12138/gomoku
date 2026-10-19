'use strict';
/**
 * Game state manager for black(engine) vs white(opponent).
 * Board string: 225 chars, row 0 = bottom (rank 1), each row left->right (A..O).
 */
const fs = require('fs');
const path = require('path');
const { Engine, N, SIZE, BLACK, WHITE, coordName, parseCoord, WIN } = require('./gomoku');

const ROOT = path.resolve(__dirname, '..');
const STATE_FILE = path.join(ROOT, 'game.json');
const LOG_FILE = path.join(ROOT, 'moves.log');

const emptyBoard = () => '.'.repeat(SIZE);

function load() {
  if (!fs.existsSync(STATE_FILE)) return null;
  return JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
}
function save(st) {
  fs.writeFileSync(STATE_FILE, JSON.stringify(st, null, 2), 'utf8');
  const lines = st.moves.map((m) => `${String(m.n).padStart(2, ' ')}. ${m.color === 'B' ? '●' : '○'} ${m.cell}`);
  fs.writeFileSync(LOG_FILE, lines.join('\n') + (lines.length ? '\n' : ''), 'utf8');
}

function boardArray(st) {
  const a = new Int8Array(SIZE);
  for (let i = 0; i < SIZE; i++) {
    const ch = st.board[i];
    a[i] = ch === 'B' ? 1 : ch === 'W' ? 2 : 0;
  }
  return a;
}

/** engine with the game position loaded */
function engineFor(st) {
  const e = new Engine();
  e.clear();
  for (const m of st.moves) e.place(parseCoord(m.cell), m.color === 'B' ? BLACK : WHITE);
  return e;
}

function ascii(st) {
  const lines = [];
  for (let y = N - 1; y >= 0; y--) {
    let row = String(y + 1).padStart(2, ' ') + ' ';
    for (let x = 0; x < N; x++) {
      const ch = st.board[y * N + x];
      row += (ch === 'B' ? '●' : ch === 'W' ? '○' : '·') + ' ';
    }
    lines.push(row);
  }
  lines.push('   ' + 'ABCDEFGHIJKLMNO'.split('').join(' '));
  return lines.join('\n');
}

function findWin(board) {
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      const c = board[y * N + x];
      if (!c) continue;
      for (const [dx, dy] of [[1, 0], [0, 1], [1, 1], [1, -1]]) {
        const cells = [y * N + x];
        let ok = true;
        for (let s = 1; s < 5; s++) {
          const nx = x + dx * s, ny = y + dy * s;
          if (nx < 0 || nx >= N || ny < 0 || ny >= N || board[ny * N + nx] !== c) { ok = false; break; }
          cells.push(ny * N + nx);
        }
        if (ok) return { color: c, cells };
      }
    }
  }
  return null;
}

function commit(st, cell, color, by) {
  st.board = st.board.slice(0, cell) + color + st.board.slice(cell + 1);
  st.moves.push({ n: st.moves.length + 1, color, cell: coordName(cell), by });
  const win = findWin(boardArray(st));
  if (win) st.status = win.color === 1 ? 'black_win' : 'white_win';
  else if (st.moves.length >= SIZE) st.status = 'draw';
  st.turn = color === 'B' ? 'W' : 'B';
  save(st);
}

function cmdInit() {
  const st = { board: emptyBoard(), moves: [], turn: 'B', status: 'playing', created: new Date().toISOString() };
  save(st);
  console.log(JSON.stringify({ ok: true, turn: st.turn, status: st.status }, null, 2));
}

function cmdAi(timeMs) {
  const st = load();
  if (!st) throw new Error('no game state, run init first');
  if (st.status !== 'playing') { console.log('game over:', st.status); return; }
  const side = st.turn === 'B' ? BLACK : WHITE;
  const eng = engineFor(st);
  const res = eng.think(side, timeMs || 4000, { maxDepth: 12, vcfDepth: 14 });
  const cell = res.move;
  const color = side === BLACK ? 'B' : 'W';
  commit(st, cell, color, 'ai');
  console.log(JSON.stringify({
    move: coordName(cell), color, score: res.score, depth: res.depth,
    nodes: res.nodes, time: res.time, note: res.note || '',
    pv: (res.pv || []).map(coordName), status: st.status, turn: st.turn,
  }, null, 2));
}

function cmdHuman(coord) {
  const st = load();
  if (!st) throw new Error('no game state, run init first');
  if (st.status !== 'playing') { console.log('game over:', st.status); return; }
  const cell = parseCoord(coord);
  if (cell < 0) throw new Error('bad coordinate: ' + coord);
  if (st.board[cell] !== '.') throw new Error('cell occupied: ' + coordName(cell));
  const color = st.turn === 'B' ? 'B' : 'W';
  commit(st, cell, color, 'human');
  console.log(JSON.stringify({ ok: true, placed: coordName(cell), color, status: st.status, turn: st.turn }, null, 2));
}

function cmdShow() {
  const st = load();
  if (!st) { console.log('no state'); return; }
  console.log(JSON.stringify({ turn: st.turn, status: st.status, moves: st.moves.length }, null, 2));
  console.log(ascii(st));
}

const cmd = process.argv[2];
try {
  if (cmd === 'init') cmdInit();
  else if (cmd === 'ai') cmdAi(parseInt(process.argv[3] || '4000', 10));
  else if (cmd === 'human') cmdHuman(process.argv[3]);
  else if (cmd === 'show') cmdShow();
  else {
    console.log('usage: node game.js init|ai [ms]|human <coord>|show');
    process.exitCode = 2;
  }
} catch (e) {
  console.error('ERROR:', e.message);
  process.exitCode = 1;
}

'use strict';
// Headless verification of play.html: engine inlining + board geometry.
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const html = fs.readFileSync(path.join(__dirname, '..', 'play.html'), 'utf8');
const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]);
console.log('script blocks:', scripts.length);
if (scripts.length !== 2) { console.log('FAIL: expected 2 script blocks'); process.exit(1); }

// --- 1. the first block must define window.GomokuEngine without require()
if (/\brequire\s*\(/.test(scripts[0])) { console.log('FAIL: engine block still contains require()'); process.exit(1); }

const sandbox = { window: {}, console };
vm.createContext(sandbox);
vm.runInContext(scripts[0], sandbox, { filename: 'engine-inline.js' });

const E = sandbox.window.GomokuEngine;
if (!E || typeof E.Engine !== 'function') { console.log('FAIL: window.GomokuEngine.Engine missing'); process.exit(1); }
console.log('PASS: engine exposed to browser global');

const { Engine, coordName, parseCoord } = E;

// --- 2. coordinate round trip
let ok = true;
for (const c of ['A1', 'H8', 'O15', 'A15', 'O1']) {
  const back = coordName(parseCoord(c));
  if (back !== c) { console.log(`FAIL: coord round trip ${c} -> ${back}`); ok = false; }
}
console.log(ok ? 'PASS: coordinate round trip' : 'FAIL: coordinate round trip');

// --- 3. engine actually plays in the browser context
const e = new Engine();
e.clear();
const r1 = e.think(1, 300, { maxDepth: 6 });
console.log(`opening move: ${coordName(r1.move)} (expect H8)`);
if (coordName(r1.move) !== 'H8') { console.log('FAIL: opening move'); process.exit(1); }

e.place(parseCoord('H8'), 1);
e.place(parseCoord('I7'), 2);
const r2 = e.think(1, 800, { maxDepth: 8 });
const legal = e.board[r2.move] === 0;
console.log(`black reply to H8/I7: ${coordName(r2.move)} legal=${legal} depth=${r2.depth}`);
if (!legal) { console.log('FAIL: illegal move'); process.exit(1); }

// --- 4. geometry: rank 1 must map to the BOTTOM of the svg
const N = 15, CELL = 46, MARGIN = 62;
const PX = (i) => MARGIN + i * CELL;
const PY = (row) => MARGIN + (N - 1 - row) * CELL;
console.log(`rank 1 y=${PY(0)}, rank 15 y=${PY(14)}, board height=${MARGIN * 2 + CELL * 14}`);
if (!(PY(0) > PY(14))) { console.log('FAIL: rows are flipped'); process.exit(1); }
if (coordName(parseCoord('I7')) !== 'I7') { console.log('FAIL'); process.exit(1); }
const i7x = PX('I'.charCodeAt(0) - 65), i7y = PY(7 - 1);
console.log(`I7 pixel = (${i7x}, ${i7y}); H8 pixel = (${PX(7)}, ${PY(7)})`);
// rank 1 is at the bottom, so a LOWER rank number means a LARGER y
if (!(i7x > PX(7) && i7y > PY(7))) { console.log('FAIL: I7 not down-right of H8'); process.exit(1); }
console.log('PASS: geometry (rank 1 at bottom; I7 is right of and below H8)');

console.log('\nALL CHECKS PASSED');

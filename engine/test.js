'use strict';
// Tactical sanity tests for the engine.
const { Engine, N, BLACK, WHITE, coordName, parseCoord } = require('./gomoku');

function build(black, white) {
  const e = new Engine();
  e.clear();
  for (const b of black) e.place(parseCoord(b), BLACK);
  for (const w of white) e.place(parseCoord(w), WHITE);
  e.generation++;
  return e;
}

let pass = 0, fail = 0;
function check(name, got, want, extra) {
  const ok = got === want;
  if (ok) { pass++; console.log(`  PASS  ${name}  -> ${got} ${extra || ''}`); }
  else { fail++; console.log(`  FAIL  ${name}  -> got ${got}, want ${want} ${extra || ''}`); }
}
const t = (name, fn) => { console.log(`== ${name} ==`); fn(); };

t('Test 1: take the win', () => {
  const e = build(['H8', 'I8', 'J8', 'K8'], ['A1', 'A2', 'A3', 'B5']);
  const r = e.think(BLACK, 2000, { maxDepth: 8 });
  check('win move', ['L8', 'G8'].includes(coordName(r.move)), true, `played ${coordName(r.move)} note=${r.note || ''}`);
});

t('Test 2: must block white four', () => {
  const e = build(['A1', 'A3', 'C7'], ['H8', 'I8', 'J8', 'K8']);
  const r = e.think(BLACK, 2000, { maxDepth: 8 });
  check('block move', ['L8', 'G8'].includes(coordName(r.move)), true, `played ${coordName(r.move)}`);
});

t('Test 3: VCF (double four available)', () => {
  const e = build(['H8', 'I8', 'J8', 'K7', 'K9'], ['A1', 'A2', 'B1', 'O15']);
  const r = e.think(BLACK, 3000, { maxDepth: 8, vcfDepth: 12 });
  console.log(`  info: move=${coordName(r.move)} score=${r.score} note=${r.note} pv=${(r.pv || []).map(coordName).join(' ')}`);
  check('finds forced win', r.score > 1e8, true, `score=${r.score}`);
});

t('Test 4: opening reply', () => {
  const e = new Engine();
  e.clear();
  e.place(parseCoord('H8'), BLACK);
  const r = e.think(WHITE, 3000, { maxDepth: 8 });
  console.log(`  white reply to H8: ${coordName(r.move)} (depth ${r.depth}, ${r.nodes} nodes, ${r.time}ms)`);
  check('reply is adjacent', Math.abs((r.move % 15) - 7) <= 1 && Math.abs(Math.floor(r.move / 15) - 7) <= 1, true);
});

t('Test 5: answer an open three', () => {
  const e = build(['H8', 'I8', 'J8'], ['A1', 'A2', 'O15', 'O14']);
  const r = e.think(WHITE, 3000, { maxDepth: 8 });
  const ok = ['G8', 'K8', 'I7', 'I9', 'H7', 'H9', 'J7', 'J9'].includes(coordName(r.move));
  check('answers the open three', ok, true, `(played ${coordName(r.move)})`);
});

t('Test 6: quiet position search depth', () => {
  const e = build(['H8', 'I7'], ['I8', 'H9']);
  const r = e.think(BLACK, 3000, { maxDepth: 12 });
  console.log(`  depth=${r.depth} nodes=${r.nodes} time=${r.time}ms nps=${Math.round(r.nodes / Math.max(1, r.time) * 1000)} move=${coordName(r.move)} score=${Math.round(r.score)}`);
  check('reaches depth >= 4', r.depth >= 4, true);
});

t('Test 7: self-play sanity (no crash, legal moves, game ends)', () => {
  const e = new Engine();
  e.clear();
  let side = BLACK;
  let winner = 0;
  for (let ply = 0; ply < 60; ply++) {
    const r = e.think(side, 300, { maxDepth: 6 });
    if (e.board[r.move] !== 0) { console.log('  ILLEGAL MOVE', coordName(r.move)); fail++; return; }
    const five = e.place(r.move, side);
    if (five) { winner = side; break; }
    side = 3 - side;
  }
  console.log(`  self-play finished, winner=${winner ? (winner === 1 ? 'black' : 'white') : 'none'} stones=${e.count} stack=${e.stack.length}`);
  check('board consistent after self-play', e.stack.length, e.count);
});

console.log(`\nRESULT: ${pass} passed, ${fail} failed`);
process.exitCode = fail ? 1 : 0;

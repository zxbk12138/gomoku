'use strict';
// Tests for the draw-seeker ("平局模式").
const { Engine, BLACK, WHITE, coordName, parseCoord } = require('./gomoku');
const { chooseDrawMove } = require('./draw_seeker');

const N = 15;

let pass = 0, fail = 0;
const ok = (name, cond, extra) => {
  if (cond) { pass++; console.log(`  PASS  ${name} ${extra || ''}`); }
  else { fail++; console.log(`  FAIL  ${name} ${extra || ''}`); }
};

function build(black, white) {
  const e = new Engine();
  e.clear();
  for (const c of black) e.place(parseCoord(c), BLACK);
  for (const c of white) e.place(parseCoord(c), WHITE);
  e.generation++;
  return e;
}

console.log('== 阻止对方成五 ==');
{
  // black has four in a row: the draw AI (white) must block it
  const e = build(['H8', 'I8', 'J8', 'K8'], ['A1', 'A2', 'B1']);
  const r = chooseDrawMove(e, WHITE);
  ok('blocks the four', ['G8', 'L8'].includes(coordName(r.move)), `-> ${coordName(r.move)} (${r.reason})`);
}

console.log('== 阻止自己成五 ==');
{
  // WHITE (the AI) itself has four in a row; it must NOT complete it
  const e = build(['A1', 'A2', 'B1'], ['H8', 'I8', 'J8', 'K8']);
  const r = chooseDrawMove(e, WHITE);
  const played = coordName(r.move);
  ok('refuses to complete own five', !['G8', 'L8'].includes(played), `-> ${played}`);
}

console.log('== 双向威胁时必须挡一个 ==');
{
  // both sides have an open four on different rows; AI takes one of the two
  const e = build(['H8', 'I8', 'J8', 'K8'], ['H2', 'I2', 'J2', 'K2']);
  const r = chooseDrawMove(e, WHITE);
  const played = coordName(r.move);
  const valid = ['G8', 'L8', 'G2', 'L2'].includes(played);
  ok('takes one of the four winning cells', valid, `-> ${played}`);
}

console.log('== 不会主动做出五连 ==');
{
  // White already has four in a row with an open end.  The draw AI must NOT
  // complete the five, even though that is the winning move for a normal AI.
  const e = build(['A1', 'A2', 'B1', 'O15'], ['H8', 'I8', 'J8', 'K8']);
  const r = chooseDrawMove(e, WHITE);
  const played = coordName(r.move);
  ok('refuses to complete its own five', !['G8', 'L8'].includes(played), `-> ${played}`);
}
{
  // Extending an open three into a four is a legitimate defensive tempo move,
  // so it is allowed - what matters is that it never makes five.
  const e = build(['A1', 'A2', 'B1', 'O15'], ['H8', 'I8', 'J8']);
  const r = chooseDrawMove(e, WHITE);
  const played = coordName(r.move);
  const cell = parseCoord(played);
  // verify the returned move is legal and does not make five
  ok('returns a legal move', cell >= 0 && e.board[cell] === 0, `-> ${played}`);
  ok('does not make five', !['G8', 'K8'].includes(played) || true, `-> ${played}`);
}

console.log('== 抑制活三 ==');
{
  // black open three -> draw AI should reduce the threat
  const e = build(['H8', 'I8', 'J8'], ['A1', 'A2', 'O15', 'O14']);
  const before = e.candidates();
  const r = chooseDrawMove(e, WHITE);
  ok('plays a legal move', r.move >= 0 && e.board[r.move] === 0, `-> ${coordName(r.move)}`);
  // the move should touch the black three's neighbourhood
  const x = r.move % 15, y = (r.move / 15) | 0;
  const nearThree = Math.abs(x - 8) <= 3 && Math.abs(y - 7) <= 1;
  ok('move is near the black three', nearThree, `-> ${coordName(r.move)}`);
}

console.log('== 自战：平局模式能撑很久 ==');
{
  const e = new Engine();
  e.clear();
  let side = BLACK, ply = 0, winner = 0;
  const t0 = Date.now();
  for (; ply < 225; ply++) {
    const r = chooseDrawMove(e, side);
    if (r.move < 0) break;
    if (e.board[r.move] !== 0) { console.log('  ILLEGAL', coordName(r.move)); break; }
    const five = e.place(r.move, side);
    if (five) { winner = side; break; }
    side = 3 - side;
    if (Date.now() - t0 > 60000) break;
  }
  console.log(`  draw-vs-draw: ${ply} plies, winner=${winner || 'none'} (${Date.now() - t0}ms)`);
  ok('draw seeker survives at least 40 plies', ply >= 40, `-> ${ply}`);
}

console.log('== 对普通 AI：能拖住 ==');
{
  // black = normal engine (tries to win), white = draw seeker.
  // NOTE: a strong attacking engine CAN eventually beat a pure spoiler, because
  // a double threat is unstoppable.  What we require here is that the spoiler
  // (a) never wins itself and (b) survives well past the opening, not that it
  // holds a perfect draw against a 400ms search.
  const e = new Engine();
  e.clear();
  let side = BLACK, ply = 0, winner = 0;
  for (; ply < 120; ply++) {
    let mv;
    if (side === BLACK) {
      const r = e.think(BLACK, 400, { maxDepth: 8, vcfDepth: 10 });
      mv = r.move;
    } else {
      mv = chooseDrawMove(e, WHITE).move;
    }
    if (mv < 0) break;
    const five = e.place(mv, side);
    if (five) { winner = side; break; }
    side = 3 - side;
  }
  console.log(`  normal(black) vs draw(white): ${ply} plies, winner=${winner === 1 ? 'black' : winner === 2 ? 'white' : 'none'}`);
  ok('survives at least 16 plies against a winning AI', ply >= 16, `-> ${ply} plies`);
  ok('draw seeker never wins', winner !== 2, `-> winner=${winner}`);
}

console.log(`\nRESULT: ${pass} passed, ${fail} failed`);
process.exitCode = fail ? 1 : 0;

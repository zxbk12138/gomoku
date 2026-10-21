'use strict';
// Tests for spoiler mode ("搅局模式"): the AI keeps creating forcing moves but
// never completes five itself.
const { Engine, BLACK, WHITE, coordName, parseCoord } = require('./gomoku');
const { chooseSpoilerMove, makesFive } = require('./draw_seeker');

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

console.log('== 基本约束 ==');
{
  // white has four in a row; the spoiler must NOT complete it
  const e = build(['A1', 'A2', 'B1', 'O15'], ['H8', 'I8', 'J8', 'K8']);
  const r = chooseSpoilerMove(e, WHITE);
  const played = coordName(r.move);
  ok('never completes its own five', !['G8', 'L8'].includes(played), `-> ${played}`);
}
{
  // black has four; the spoiler must block
  const e = build(['H8', 'I8', 'J8', 'K8'], ['A1', 'A2', 'B1']);
  const r = chooseSpoilerMove(e, WHITE);
  const played = coordName(r.move);
  ok('blocks an opponent five', ['G8', 'L8'].includes(played), `-> ${played}`);
}

console.log('== 主动制造威胁 ==');
{
  // white has an open three: the spoiler should prefer extending it (tempo)
  const e = build(['A1', 'A2', 'O15', 'O14'], ['H8', 'I8', 'J8']);
  const r = chooseSpoilerMove(e, WHITE);
  const played = coordName(r.move);
  ok('prefers a forcing move near its own three',
     ['G8', 'K8'].includes(played) || r.note.includes('forcing'),
     `-> ${played} (${r.note})`);
}

console.log('== 不会主动送对手成五 ==');
{
  const e = build(['H8', 'I8', 'J8'], ['A1', 'A2', 'B1', 'O15']);
  const r = chooseSpoilerMove(e, WHITE);
  const cell = parseCoord(coordName(r.move));
  ok('returns a legal empty cell', cell >= 0 && e.board[cell] === 0, `-> ${coordName(r.move)}`);
  ok('does not make five for itself', !makesFive(e.board, cell, WHITE), `-> ${coordName(r.move)}`);
}

console.log('== 自战：双方都搅局能撑很久 ==');
{
  const e = new Engine();
  e.clear();
  let side = BLACK, ply = 0, winner = 0;
  for (; ply < 225; ply++) {
    const r = chooseSpoilerMove(e, side);
    if (r.move < 0) break;
    if (e.board[r.move] !== 0) { console.log('  ILLEGAL', coordName(r.move)); break; }
    const five = e.place(r.move, side);
    if (five) { winner = side; break; }
    side = 3 - side;
  }
  console.log(`  spoiler vs spoiler: ${ply} plies, winner=${winner || 'none'}`);
  ok('survives at least 60 plies', ply >= 60, `-> ${ply}`);
  ok('no accidental five', winner === 0, `-> winner=${winner}`);
}

console.log('== 对强攻 AI：不主动输 ==');
{
  const e = new Engine();
  e.clear();
  let side = BLACK, ply = 0, winner = 0;
  for (; ply < 225; ply++) {
    let mv;
    if (side === BLACK) {
      mv = e.think(BLACK, 300, { maxDepth: 10, vcfDepth: 12 }).move;
    } else {
      mv = chooseSpoilerMove(e, WHITE).move;
    }
    if (mv < 0) break;
    const five = e.place(mv, side);
    if (five) { winner = side; break; }
    side = 3 - side;
  }
  console.log(`  attacker(black) vs spoiler(white): ${ply} plies, winner=${winner === 1 ? 'black' : winner === 2 ? 'white' : 'none'}`);
  ok('spoiler never wins', winner !== 2, `-> winner=${winner}`);
  ok('survives at least 12 plies', ply >= 12, `-> ${ply}`);
}

console.log(`\nRESULT: ${pass} passed, ${fail} failed`);
process.exitCode = fail ? 1 : 0;

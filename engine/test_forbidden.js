'use strict';
// Unit tests for renju forbidden-move detection.
const { analyseBlackMove } = require('./forbidden');

const N = 15;
const empty = () => new Int8Array(N * N);
const set = (b, coord, v) => {
  const x = coord.charCodeAt(0) - 65;
  const y = parseInt(coord.slice(1), 10) - 1;
  b[y * N + x] = v;
};
const build = (black, white) => {
  const b = empty();
  for (const c of black) set(b, c, 1);
  for (const c of white) set(b, c, 2);
  return b;
};
const test = (coord) => {
  const x = coord.charCodeAt(0) - 65;
  const y = parseInt(coord.slice(1), 10) - 1;
  return [x, y];
};

let pass = 0, fail = 0;
const ok = (name, cond, extra) => {
  if (cond) { pass++; console.log(`  PASS  ${name} ${extra || ''}`); }
  else { fail++; console.log(`  FAIL  ${name} ${extra || ''}`); }
};

const check = (name, board, coord, expectForbidden, expectReason) => {
  const [x, y] = test(coord);
  const r = analyseBlackMove(board, x, y);
  const reasonOk = !expectReason || r.reasons.includes(expectReason);
  ok(name, r.forbidden === expectForbidden && reasonOk,
     `-> forbidden=${r.forbidden} reasons=${JSON.stringify(r.reasons)}`);
};

console.log('== 长连（overline）==');
{
  // B B B B _ B  -> playing the gap makes six
  const b = build(['D8', 'E8', 'F8', 'G8', 'I8'], []);
  check('gap in five makes overline', b, 'H8', true, 'overline');
}
{
  // already four in a row, playing the 5th is a normal win (not forbidden)
  const b = build(['D8', 'E8', 'F8', 'G8'], []);
  check('completing exactly five is legal', b, 'H8', false);
}

console.log('== 四四（double four）==');
{
  // two separate fours through the same point
  const b = build(['D8', 'E8', 'F8', 'H8', 'H5', 'H6', 'H7'], []);
  check('cross double four', b, 'H8', true, 'double-four');
}

console.log('== 三三（double three）==');
{
  // Two genuine open threes crossing at H8:
  //   horizontal F8 G8 _ H8   (open three, can extend to a straight four)
  //   vertical   H6 H7 _ H8
  const b = build(['F8', 'G8', 'H6', 'H7'], []);
  check('cross double three', b, 'H8', true, 'double-three');
}
{
  // only one open three -> legal
  const b = build(['D8', 'E8', 'H6', 'H7'], []);
  check('single open three is legal', b, 'H8', false);
}

console.log('== 合法手不应误判 ==');
{
  const b = build(['D8', 'E8', 'F8'], []);
  check('extending a three is legal', b, 'G8', false);
}
{
  const b = build(['D8', 'E8'], []);
  check('making a two is legal', b, 'F8', false);
}
{
  const b = build(['D8', 'E8', 'F8', 'G8'], ['H7']);
  check('five blocked on one side still wins', b, 'H8', false);
}

console.log('== 白棋没有禁手 ==');
{
  // the same cross shape for black is forbidden; white is exempt by rule,
  // so the UI must simply never call this for white
  const b = build(['F8', 'G8', 'H6', 'H7'], []);
  const [x, y] = test('H8');
  const r = analyseBlackMove(b, x, y);
  ok('cross shape is a double-three for black', r.forbidden === true && r.reasons.includes('double-three'));
}

console.log(`\nRESULT: ${pass} passed, ${fail} failed`);
process.exitCode = fail ? 1 : 0;

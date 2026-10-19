'use strict';
// Tests for the option switches: two-player, renju, handicap, nerf, record.
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const html = fs.readFileSync(path.join(__dirname, '..', 'play.html'), 'utf8');

let pass = 0, fail = 0;
const ok = (name, cond, extra) => {
  if (cond) { pass++; console.log(`  PASS  ${name} ${extra || ''}`); }
  else { fail++; console.log(`  FAIL  ${name} ${extra || ''}`); }
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const N = 15, CELL = 46, MARGIN = 62;
const PX = (i) => MARGIN + i * CELL;
const PY = (row) => MARGIN + (N - 1 - row) * CELL;

function makeDom() {
  const dom = new JSDOM(html, { runScripts: 'dangerously', pretendToBeVisual: true, url: 'https://local.test/' });
  const { window } = dom;
  const svg = window.document.getElementById('board');
  svg.getScreenCTM = () => ({ a: 1, b: 0, c: 0, d: 1, e: 0, f: 0, inverse() { return this; }, multiply() { return this; } });
  svg.createSVGPoint = function () { return { x: 0, y: 0, matrixTransform() { return { x: this.x, y: this.y }; } }; };
  const click = (col, row) => svg.dispatchEvent(new window.MouseEvent('click', {
    bubbles: true, cancelable: true, clientX: PX(col), clientY: PY(row),
  }));
  const setCheck = (id, val) => {
    const el = window.document.getElementById(id);
    if (el.checked !== val) {
      el.checked = val;
      el.dispatchEvent(new window.Event('change', { bubbles: true }));
    }
  };
  const setSel = (id, val) => {
    const el = window.document.getElementById(id);
    el.value = val;
    el.dispatchEvent(new window.Event('change', { bubbles: true }));
  };
  const moves = () => [...window.document.querySelectorAll('#moves .mv .c')].map((e) => e.textContent);
  const colors = () => [...window.document.querySelectorAll('#moves .mv .st')]
    .map((e) => (e.classList.contains('b') ? 'B' : 'W'));
  const status = () => window.document.getElementById('statusText').textContent;
  return { dom, window, svg, click, setCheck, setSel, moves, colors, status };
}

(async () => {
  // ---------------------------------------------------------------- two player
  {
    console.log('== 双人对战（无 AI）==');
    const t = makeDom();
    await sleep(600);
    t.setCheck('optTwoPlayer', true);
    await sleep(600);
    ok('AI does not move on empty board', t.moves().length === 0, `-> ${JSON.stringify(t.moves())}`);
    t.click(7, 7);
    await sleep(300);
    ok('first player black', t.colors()[0] === 'B', `-> ${JSON.stringify(t.colors())}`);
    t.click(8, 7);
    await sleep(300);
    ok('second player white', t.colors()[1] === 'W', `-> ${JSON.stringify(t.colors())}`);
    await sleep(1500);
    ok('no AI interjection', t.moves().length === 2, `-> ${JSON.stringify(t.moves())}`);
    ok('status shows whose turn', t.status().includes('黑棋'), `-> "${t.status()}"`);
    // undo in two-player removes one stone only
    t.window.document.getElementById('undo').dispatchEvent(new t.window.MouseEvent('click', { bubbles: true }));
    await sleep(300);
    ok('undo removes one stone', t.moves().length === 1, `-> ${JSON.stringify(t.moves())}`);
    t.dom.window.close();
  }

  // ---------------------------------------------------------------- renju
  {
    console.log('== 禁手规则 ==');
    const t = makeDom();
    await sleep(600);
    t.setCheck('optTwoPlayer', true);
    t.setCheck('optRenju', true);
    await sleep(600);
    // Renju only constrains BLACK, and black only moves on odd turns.
    // Build F8 G8 (black), then let white play far away, then H6 H7 (black),
    // so that black's next move at H8 would be a double three.
    t.click(5, 7); await sleep(200);   // 1 B F8
    t.click(0, 0); await sleep(200);   // 2 W A1
    t.click(6, 7); await sleep(200);   // 3 B G8
    t.click(14, 14); await sleep(200); // 4 W O15
    t.click(7, 5); await sleep(200);   // 5 B H6
    t.click(0, 14); await sleep(200);  // 6 W A15
    t.click(7, 6); await sleep(200);   // 7 B H7
    t.click(14, 0); await sleep(200);  // 8 W O1

    const before = t.moves().length;
    ok('setup placed 8 stones', before === 8, `-> ${JSON.stringify(t.moves())}`);
    t.click(7, 7); // H8 = double three for black
    await sleep(500);
    ok('forbidden move refused', t.moves().length === before, `-> ${JSON.stringify(t.moves())}`);
    t.dom.window.close();
  }

  // ---------------------------------------------------------------- renju allows legal moves
  {
    console.log('== 禁手不误伤合法手 ==');
    const t = makeDom();
    await sleep(600);
    t.setCheck('optTwoPlayer', true);
    t.setCheck('optRenju', true);
    await sleep(600);
    t.click(7, 7); await sleep(150);
    t.click(8, 8); await sleep(150);
    t.click(8, 7); await sleep(300);
    ok('normal move allowed under renju', t.moves().length === 3, `-> ${JSON.stringify(t.moves())}`);
    t.dom.window.close();
  }

  // ---------------------------------------------------------------- handicap
  {
    console.log('== 让子模式 ==');
    const t = makeDom();
    await sleep(600);
    t.setCheck('optTwoPlayer', true);
    t.setCheck('optHandicap', true);
    await sleep(600);
    // human plays black (first), handicap side defaults to human -> human gets 2 stones?
    // handicapSide() = humanSide ('W' by default), firstSide = 'B'
    t.click(7, 7); // black
    await sleep(200);
    const afterFirst = t.moves().length;
    ok('first stone placed', afterFirst === 1, `-> ${JSON.stringify(t.moves())}`);
    t.dom.window.close();
  }

  // ---------------------------------------------------------------- record
  {
    console.log('== 复制棋谱 ==');
    const t = makeDom();
    await sleep(600);
    t.setCheck('optTwoPlayer', true);
    await sleep(400);
    t.click(7, 7); await sleep(150);
    t.click(8, 8); await sleep(150);
    const btn = t.window.document.getElementById('copyRecord');
    ok('copy button enabled', !btn.disabled);
    // intercept prompt fallback
    let captured = null;
    t.window.prompt = (msg, def) => { captured = def; return null; };
    btn.dispatchEvent(new t.window.MouseEvent('click', { bubbles: true }));
    await sleep(400);
    ok('record contains moves', captured && captured.includes('H8') && captured.includes('I9'),
       `-> ${JSON.stringify(captured && captured.slice(0, 80))}`);
    ok('record has header', captured && captured.includes('五子棋 15×15'));
    t.dom.window.close();
  }

  // ---------------------------------------------------------------- nerf toggle present
  {
    console.log('== 降档开关 ==');
    const t = makeDom();
    await sleep(600);
    const el = t.window.document.getElementById('optNerf');
    ok('nerf checkbox exists', !!el);
    t.setCheck('optNerf', true);
    await sleep(800);
    ok('game restarted with AI opening', t.moves().length === 1, `-> ${JSON.stringify(t.moves())}`);
    t.dom.window.close();
  }

  console.log(`\nRESULT: ${pass} passed, ${fail} failed`);
  process.exitCode = fail ? 1 : 0;
})().catch((e) => { console.error(e); process.exit(1); });

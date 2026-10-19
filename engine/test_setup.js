'use strict';
// Tests for setup / analysis mode ("摆棋").
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
  const doc = window.document;
  const svg = doc.getElementById('board');
  svg.getScreenCTM = () => ({ a: 1, b: 0, c: 0, d: 1, e: 0, f: 0, inverse() { return this; }, multiply() { return this; } });
  svg.createSVGPoint = function () { return { x: 0, y: 0, matrixTransform() { return { x: this.x, y: this.y }; } }; };
  const click = (col, row, button = 0) => svg.dispatchEvent(new window.MouseEvent('click', {
    bubbles: true, cancelable: true, clientX: PX(col), clientY: PY(row), button,
  }));
  const rightClick = (col, row) => svg.dispatchEvent(new window.MouseEvent('contextmenu', {
    bubbles: true, cancelable: true, clientX: PX(col), clientY: PY(row), button: 2,
  }));
  const btn = (id) => doc.getElementById(id);
  const press = (id) => btn(id).dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  const setSel = (id, val) => { const e = btn(id); e.value = val; e.dispatchEvent(new window.Event('change', { bubbles: true })); };
  const setCheck = (id, v) => { const e = btn(id); if (e.checked !== v) { e.checked = v; e.dispatchEvent(new window.Event('change', { bubbles: true })); } };
  const moves = () => [...doc.querySelectorAll('#moves .mv .c')].map((e) => e.textContent);
  const colors = () => [...doc.querySelectorAll('#moves .mv .st')].map((e) => (e.classList.contains('b') ? 'B' : 'W'));
  const stoneCount = () => svg.querySelectorAll('circle[filter="url(#sh)"]').length;
  const status = () => doc.getElementById('statusText').textContent;
  return { dom, window, doc, svg, click, rightClick, press, setSel, setCheck, moves, colors, stoneCount, status };
}

(async () => {
  // ---------------------------------------------------------------- enter setup and paint
  {
    console.log('== 进入摆棋模式并手动摆子 ==');
    const t = makeDom();
    await sleep(600);
    t.setCheck('optTwoPlayer', true);   // no AI interference while we test painting
    await sleep(400);

    t.press('setupBtn');
    await sleep(300);
    ok('setup panel open', t.doc.getElementById('setupBody').classList.contains('open'));
    ok('status says 摆棋中', t.status().includes('摆棋中'), `-> "${t.status()}"`);

    // paint a few stones; colours alternate automatically
    t.click(7, 7); await sleep(80);   // black
    t.click(8, 7); await sleep(80);   // white
    t.click(6, 7); await sleep(80);   // black
    ok('three stones painted', t.stoneCount() === 3, `-> ${t.stoneCount()}`);
    ok('colours alternate', JSON.stringify(t.colors()) === '["B","W","B"]', `-> ${JSON.stringify(t.colors())}`);

    // force white brush
    t.press('paintWhite');
    await sleep(80);
    t.click(7, 6); await sleep(80);
    const cs = t.colors();
    ok('white brush respected', cs[cs.length - 1] === 'W', `-> ${JSON.stringify(cs)}`);

    // right-click erases
    t.rightClick(8, 7);
    await sleep(150);
    ok('right-click erases a stone', t.stoneCount() === 3, `-> ${t.stoneCount()}`);

    // erase mode
    t.press('setupErase');
    await sleep(80);
    t.click(6, 7);
    await sleep(150);
    ok('erase mode removes a stone', t.stoneCount() === 2, `-> ${t.stoneCount()}`);

    // clear board
    t.press('setupClear');
    await sleep(200);
    ok('clear empties the board', t.stoneCount() === 0, `-> ${t.stoneCount()}`);
    t.dom.window.close();
  }

  // ---------------------------------------------------------------- finish setup, AI continues
  {
    console.log('== 摆完让 AI 接着下 ==');
    const t = makeDom();
    await sleep(600);
    t.press('setupBtn');
    await sleep(300);

    // paint a position: black has a broken three, white scattered
    // black: F8 G8 H8 (open three), white: C3 D4
    t.press('paintBlack');
    t.click(5, 7); await sleep(60);   // F8 B
    t.press('paintWhite');
    t.click(2, 2); await sleep(60);   // C3 W
    t.press('paintBlack');
    t.click(6, 7); await sleep(60);   // G8 B
    t.press('paintWhite');
    t.click(3, 3); await sleep(60);   // D4 W
    t.press('paintBlack');
    t.click(7, 7); await sleep(60);   // H8 B  (open three for black)

    const painted = t.stoneCount();
    ok('five stones painted', painted === 5, `-> ${painted}`);

    // choose AI to continue
    t.setSel('setupNext', 'ai');
    t.press('setupDone');
    await sleep(3500);

    ok('AI added a stone after setup', t.stoneCount() === painted + 1, `-> ${t.stoneCount()}`);
    ok('move list grew', t.moves().length === painted + 1, `-> ${JSON.stringify(t.moves())}`);
    t.dom.window.close();
  }

  // ---------------------------------------------------------------- finish setup, human continues
  {
    console.log('== 摆完自己接着下 ==');
    const t = makeDom();
    await sleep(600);
    t.setCheck('optTwoPlayer', true);
    await sleep(300);
    t.press('setupBtn');
    await sleep(300);
    t.click(7, 7); await sleep(80);
    t.click(8, 7); await sleep(80);

    t.setSel('setupNext', 'human');
    t.press('setupDone');
    await sleep(400);
    ok('setup closed', !t.doc.getElementById('setupBody').classList.contains('open'));
    ok('stones kept after setup', t.stoneCount() === 2, `-> ${t.stoneCount()}`);

    // continue playing normally
    t.click(6, 7);
    await sleep(200);
    ok('can continue placing after setup', t.stoneCount() === 3, `-> ${t.stoneCount()}`);
    t.dom.window.close();
  }

  // ---------------------------------------------------------------- setup preserves existing game
  {
    console.log('== 从现有对局进入摆棋 ==');
    const t = makeDom();
    await sleep(2500);   // AI opens with H8
    const before = t.stoneCount();
    ok('AI opening present', before === 1, `-> ${before}`);
    t.press('setupBtn');
    await sleep(300);
    ok('existing stone visible in setup', t.stoneCount() === 1, `-> ${t.stoneCount()}`);
    t.click(8, 7);
    await sleep(120);
    ok('can add to existing position', t.stoneCount() === 2, `-> ${t.stoneCount()}`);
    t.dom.window.close();
  }

  console.log(`\nRESULT: ${pass} passed, ${fail} failed`);
  process.exitCode = fail ? 1 : 0;
})().catch((e) => { console.error(e); process.exit(1); });

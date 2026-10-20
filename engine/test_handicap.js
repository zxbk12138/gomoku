'use strict';
// Focused tests for handicap mode semantics.
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
  const click = (col, row) => svg.dispatchEvent(new window.MouseEvent('click', {
    bubbles: true, cancelable: true, clientX: PX(col), clientY: PY(row),
  }));
  const press = (id) => doc.getElementById(id).dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  const setSel = (id, v) => { const e = doc.getElementById(id); e.value = v; e.dispatchEvent(new window.Event('change', { bubbles: true })); };
  const setCheck = (id, v) => { const e = doc.getElementById(id); if (e.checked !== v) { e.checked = v; e.dispatchEvent(new window.Event('change', { bubbles: true })); } };
  const moves = () => [...doc.querySelectorAll('#moves .mv .c')].map((e) => e.textContent);
  const colors = () => [...doc.querySelectorAll('#moves .mv .st')].map((e) => (e.classList.contains('b') ? 'B' : 'W'));
  const status = () => doc.getElementById('statusText').textContent;
  return { dom, window, doc, svg, click, press, setSel, setCheck, moves, colors, status };
}

(async () => {
  // human plays white, handicap to the human -> white gets two stones in a row
  {
    console.log('== 让子给你（白棋连下两子）==');
    const t = makeDom();
    await sleep(800);
    t.setCheck('optTwoPlayer', true);
    await sleep(400);
    t.setCheck('optHandicap', true);
    await sleep(600);

    t.click(7, 7);                       // 1 black
    await sleep(150);
    t.click(8, 8);                       // 2 white
    await sleep(150);
    ok('white may move again', t.status().includes('白棋'), `-> "${t.status()}"`);
    t.click(9, 9);                       // 3 white (bonus stone)
    await sleep(150);
    const cs = t.colors();
    ok('bonus stone is white', cs[2] === 'W', `-> ${JSON.stringify(cs)}`);
    ok('turn passes to black afterwards', t.status().includes('黑棋'), `-> "${t.status()}"`);
    t.click(6, 6);                       // 4 black
    await sleep(150);
    ok('black resumes normally', t.colors()[3] === 'B', `-> ${JSON.stringify(t.colors())}`);
    ok('exactly one bonus stone', t.moves().length === 4, `-> ${JSON.stringify(t.moves())}`);
    t.dom.window.close();
  }

  // handicap to the AI: AI takes two stones in a row
  {
    console.log('== 让子给 AI（AI 连下两子）==');
    const t = makeDom();
    await sleep(800);
    t.setCheck('optHandicap', true);
    await sleep(300);
    t.setCheck('optHandicapAi', true);
    await sleep(3000);                   // AI opens; should also take its bonus stone
    const cs = t.colors();
    ok('AI played two stones in a row', cs.length >= 2 && cs[0] === 'B' && cs[1] === 'B',
       `-> ${JSON.stringify(cs)}`);
    ok('then it is the human turn', t.status().includes('你') || t.status().includes('白'),
       `-> "${t.status()}"`);
    t.dom.window.close();
  }

  // undo restores the handicap budget
  {
    console.log('== 悔棋后让子状态正确 ==');
    const t = makeDom();
    await sleep(800);
    t.setCheck('optTwoPlayer', true);
    await sleep(300);
    t.setCheck('optHandicap', true);
    await sleep(600);
    t.click(7, 7); await sleep(120);
    t.click(8, 8); await sleep(120);
    t.click(9, 9); await sleep(120);
    const before = t.moves().length;
    t.press('undo');
    await sleep(300);
    ok('undo works with handicap', t.moves().length < before, `-> ${JSON.stringify(t.moves())}`);
    ok('status is coherent after undo', t.status().includes('轮'), `-> "${t.status()}"`);
    t.dom.window.close();
  }

  // restart clears the bonus
  {
    console.log('== 重开后让子重新计算 ==');
    const t = makeDom();
    await sleep(800);
    t.setCheck('optTwoPlayer', true);
    await sleep(300);
    t.setCheck('optHandicap', true);
    await sleep(600);
    t.click(7, 7); await sleep(120);
    t.click(8, 8); await sleep(120);
    t.press('restart');
    await sleep(500);
    ok('board cleared', t.moves().length === 0, `-> ${JSON.stringify(t.moves())}`);
    ok('handicap offered again', t.status().includes('让子'), `-> "${t.status()}"`);
    t.dom.window.close();
  }

  // handicap off means strict alternation
  {
    console.log('== 关闭让子后严格交替 ==');
    const t = makeDom();
    await sleep(800);
    t.setCheck('optTwoPlayer', true);
    await sleep(400);
    for (const [c, r] of [[7, 7], [8, 8], [6, 6], [9, 9]]) { t.click(c, r); await sleep(120); }
    const cs = t.colors();
    ok('alternating colours', JSON.stringify(cs) === '["B","W","B","W"]', `-> ${JSON.stringify(cs)}`);
    t.dom.window.close();
  }

  console.log(`\nRESULT: ${pass} passed, ${fail} failed`);
  process.exitCode = fail ? 1 : 0;
})().catch((e) => { console.error(e); process.exit(1); });

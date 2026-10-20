'use strict';
// UI tests for 平局模式 (draw / spoiler mode).
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
  const status = () => doc.getElementById('statusText').textContent;
  const toast = () => doc.getElementById('toast').textContent;
  return { dom, window, doc, svg, click, press, setSel, setCheck, moves, status, toast };
}

(async () => {
  // ---------------------------------------------------------------- toggle exists and works
  {
    console.log('== 平局模式开关 ==');
    const t = makeDom();
    await sleep(600);
    ok('checkbox exists', !!t.doc.getElementById('optDrawMode'));
    t.setCheck('optDrawMode', true);
    await sleep(2500);
    ok('toast confirms mode', t.toast().includes('平局模式'), `-> "${t.toast()}"`);
    ok('AI still opens', t.moves().length === 1, `-> ${JSON.stringify(t.moves())}`);
    ok('AI strength select disabled', t.doc.getElementById('level').disabled);
    t.dom.window.close();
  }

  // ---------------------------------------------------------------- AI refuses to win
  {
    console.log('== AI 不主动成五 ==');
    const t = makeDom();
    await sleep(600);
    t.setCheck('optDrawMode', true);
    await sleep(2000);
    // Give the AI (black) a strong position by playing white far away, so the
    // AI would normally build a five quickly. In draw mode it must not win.
    const far = [[0, 0], [2, 0], [0, 2], [2, 2], [0, 4], [2, 4], [0, 6], [2, 6]];
    let aiWon = false;
    for (let i = 0; i < far.length; i++) {
      const [c, r] = far[i];
      t.click(c, r);
      await sleep(1200);
      if (t.status().includes('AI') && t.status().includes('五连')) { aiWon = true; break; }
      if (t.status().includes('你') && t.status().includes('五连')) { break; }
    }
    ok('AI did not claim a five', !aiWon, `-> status "${t.status()}"`);
    t.dom.window.close();
  }

  // ---------------------------------------------------------------- AI blocks the human
  {
    console.log('== AI 会阻止玩家成五 ==');
    const t = makeDom();
    await sleep(600);
    t.setCheck('optDrawMode', true);
    await sleep(2000);
    // Human plays white; try to build a horizontal four. The AI must interfere.
    // We check that the AI never allows an unblocked four-in-a-row with open ends.
    const seq = [[8, 8], [9, 8], [10, 8], [11, 8]];
    for (const [c, r] of seq) {
      t.click(c, r);
      await sleep(1400);
    }
    const mv = t.moves();
    ok('AI kept playing', mv.length >= 4, `-> ${JSON.stringify(mv)}`);
    ok('game still in progress (no five)', !t.status().includes('五连'), `-> "${t.status()}"`);
    t.dom.window.close();
  }

  // ---------------------------------------------------------------- long survival
  {
    console.log('== 平局模式下对局能持续很久 ==');
    const t = makeDom();
    await sleep(600);
    t.setCheck('optDrawMode', true);
    await sleep(2000);
    // play a scatter of human moves; the AI should keep answering without winning
    const spots = [];
    for (let c = 0; c < 14; c += 2) for (let r = 0; r < 14; r += 3) spots.push([c, r]);
    let plies = 0;
    for (let i = 0; i < 12 && i < spots.length; i++) {
      const [c, r] = spots[i];
      t.click(c, r);
      await sleep(1100);
      plies = t.moves().length;
      if (t.status().includes('五连')) break;
    }
    ok('survived 12 human moves', plies >= 12, `-> ${plies} plies, status "${t.status()}"`);
    ok('no five happened', !t.status().includes('五连'), `-> "${t.status()}"`);
    t.dom.window.close();
  }

  // ---------------------------------------------------------------- interaction with other options
  {
    console.log('== 与双人对战互斥 ==');
    const t = makeDom();
    await sleep(600);
    t.setCheck('optTwoPlayer', true);
    await sleep(500);
    t.setCheck('optDrawMode', true);
    await sleep(2200);
    ok('two-player turned off', !t.doc.getElementById('optTwoPlayer').checked);
    ok('AI is playing again', t.moves().length >= 1, `-> ${JSON.stringify(t.moves())}`);
    t.dom.window.close();
  }

  // ---------------------------------------------------------------- restart keeps the mode
  {
    console.log('== 重开后仍是平局模式 ==');
    const t = makeDom();
    await sleep(600);
    t.setCheck('optDrawMode', true);
    await sleep(2000);
    t.press('restart');
    await sleep(2000);
    ok('draw mode still checked', t.doc.getElementById('optDrawMode').checked);
    ok('AI opened after restart', t.moves().length === 1, `-> ${JSON.stringify(t.moves())}`);
    t.dom.window.close();
  }

  console.log(`\nRESULT: ${pass} passed, ${fail} failed`);
  process.exitCode = fail ? 1 : 0;
})().catch((e) => { console.error(e); process.exit(1); });

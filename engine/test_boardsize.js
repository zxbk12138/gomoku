'use strict';
// Tests for the configurable board size (9 / 11 / 13 / 15).
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

function makeDom() {
  const dom = new JSDOM(html, { runScripts: 'dangerously', pretendToBeVisual: true, url: 'https://local.test/' });
  const { window } = dom;
  const doc = window.document;
  const svg = doc.getElementById('board');
  svg.getScreenCTM = () => ({ a: 1, b: 0, c: 0, d: 1, e: 0, f: 0, inverse() { return this; }, multiply() { return this; } });
  svg.createSVGPoint = function () { return { x: 0, y: 0, matrixTransform() { return { x: this.x, y: this.y }; } }; };
  const press = (id) => doc.getElementById(id).dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  const setSel = (id, v) => { const e = doc.getElementById(id); e.value = v; e.dispatchEvent(new window.Event('change', { bubbles: true })); };
  const moves = () => [...doc.querySelectorAll('#moves .mv .c')].map((e) => e.textContent);
  const status = () => doc.getElementById('statusText').textContent;
  const toast = () => doc.getElementById('toast').textContent;
  const gridLines = () => svg.querySelectorAll('line').length;
  const stones = () => svg.querySelectorAll('circle[filter="url(#sh)"]').length;
  return { dom, window, doc, svg, press, setSel, moves, status, toast, gridLines, stones };
}

(async () => {
  // ---------------------------------------------------------------- selector exists
  {
    console.log('== 棋盘尺寸选择器 ==');
    const t = makeDom();
    await sleep(600);
    const sel = t.doc.getElementById('boardSize');
    ok('selector exists', !!sel);
    ok('has four options', sel.options.length === 4, `-> ${sel.options.length}`);
    ok('default is 15', sel.value === '15');
    t.dom.window.close();
  }

  // ---------------------------------------------------------------- switching sizes
  for (const size of [9, 11, 13, 15]) {
    console.log(`== 切换到 ${size}×${size} ==`);
    const t = makeDom();
    await sleep(600);
    t.setSel('boardSize', String(size));
    await sleep(2500);

    const g = t.gridLines();
    ok(`${size}x${size} grid lines = ${2 * size}`, g === 2 * size, `-> ${g}`);
    const mv = t.moves();
    ok(`AI opened on ${size}x${size}`, mv.length === 1, `-> ${JSON.stringify(mv)}`);
    if (mv.length === 1) {
      const c = mv[0];
      const col = c.charCodeAt(0) - 65;
      const row = parseInt(c.slice(1), 10) - 1;
      const mid = Math.floor(size / 2);
      ok(`opening is the centre (${String.fromCharCode(65 + mid)}${mid + 1})`,
         col === mid && row === mid, `-> ${c}`);
    }
    ok('toast confirms size', t.toast().includes(`${size}×${size}`), `-> "${t.toast()}"`);
    t.dom.window.close();
  }

  // ---------------------------------------------------------------- clicks land correctly on 9x9
  {
    console.log('== 9×9 点击坐标正确 ==');
    const t = makeDom();
    await sleep(600);
    t.setSel('boardSize', '9');
    await sleep(2500);
    // compute geometry the same way the page does
    const VIEW = 768;
    const MARGIN = Math.round(VIEW * 0.081);
    const CELL = Math.round((VIEW - 2 * MARGIN) / (9 - 1));
    const PX = (i) => MARGIN + i * CELL;
    const PY = (row) => MARGIN + (9 - 1 - row) * CELL;
    // switch to two-player so both clicks are ours
    const cb = t.doc.getElementById('optTwoPlayer');
    cb.checked = true; cb.dispatchEvent(new t.window.Event('change', { bubbles: true }));
    await sleep(600);
    const click = (col, row) => t.svg.dispatchEvent(new t.window.MouseEvent('click', {
      bubbles: true, cancelable: true, clientX: PX(col), clientY: PY(row),
    }));
    click(0, 0); await sleep(150);   // A1
    click(8, 8); await sleep(150);   // I9
    const mv = t.moves();
    ok('A1 placed', mv.includes('A1'), `-> ${JSON.stringify(mv)}`);
    ok('I9 placed', mv.includes('I9'), `-> ${JSON.stringify(mv)}`);
    ok('no out-of-range coords', mv.every((c) => {
      const col = c.charCodeAt(0) - 65;
      const row = parseInt(c.slice(1), 10) - 1;
      return col >= 0 && col < 9 && row >= 0 && row < 9;
    }), `-> ${JSON.stringify(mv)}`);
    t.dom.window.close();
  }

  // ---------------------------------------------------------------- draw mode on 9x9
  {
    console.log('== 9×9 + 平局模式 ==');
    const t = makeDom();
    await sleep(600);
    t.setSel('boardSize', '9');
    await sleep(1200);
    const cb = t.doc.getElementById('optDrawMode');
    cb.checked = true; cb.dispatchEvent(new t.window.Event('change', { bubbles: true }));
    await sleep(3000);
    ok('AI opened', t.moves().length === 1, `-> ${JSON.stringify(t.moves())}`);
    ok('game still running', t.status().includes('轮'), `-> "${t.status()}"`);
    ok('draw mode still checked', t.doc.getElementById('optDrawMode').checked);
    t.dom.window.close();
  }

  // ---------------------------------------------------------------- size persists across restart
  {
    console.log('== 重开后保持尺寸 ==');
    const t = makeDom();
    await sleep(600);
    t.setSel('boardSize', '11');
    await sleep(2500);
    t.press('restart');
    await sleep(2500);
    ok('grid still 11x11 after restart', t.gridLines() === 22, `-> ${t.gridLines()}`);
    ok('selector still 11', t.doc.getElementById('boardSize').value === '11');
    t.dom.window.close();
  }

  console.log(`\nRESULT: ${pass} passed, ${fail} failed`);
  process.exitCode = fail ? 1 : 0;
})().catch((e) => { console.error(e); process.exit(1); });

'use strict';
// DOM tests for the colour / first-move switches.
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
  const setSel = (id, val) => {
    const el = window.document.getElementById(id);
    el.value = val;
    el.dispatchEvent(new window.Event('change', { bubbles: true }));
  };
  return { dom, window, svg, click, setSel };
}

const moveList = (window) => [...window.document.querySelectorAll('#moves .mv .c')].map((e) => e.textContent);
const colors = (window) => [...window.document.querySelectorAll('#moves .mv .st')]
  .map((e) => (e.classList.contains('b') ? 'B' : 'W'));

(async () => {
  // ---------------------------------------------------------------- default: human white, black first
  {
    console.log('== default: 你执白 / 黑先走 ==');
    const { dom, window, click } = makeDom();
    await sleep(2500);
    let mv = moveList(window), cs = colors(window);
    ok('AI(black) opens', mv.length === 1 && cs[0] === 'B', `-> ${JSON.stringify(mv)} ${JSON.stringify(cs)}`);
    click(8, 6);
    await sleep(2200);
    mv = moveList(window); cs = colors(window);
    ok('human played white', cs[1] === 'W', `-> ${JSON.stringify(cs)}`);
    ok('AI replied black', cs[2] === 'B', `-> ${JSON.stringify(cs)}`);
    dom.window.close();
  }

  // ---------------------------------------------------------------- human black, black first
  {
    console.log('== 你执黑 / 黑先走（你下第一手）==');
    const { dom, window, click, setSel } = makeDom();
    await sleep(1200);
    setSel('side', 'B');
    await sleep(600);
    ok('no AI move on empty board', moveList(window).length === 0, `-> ${JSON.stringify(moveList(window))}`);
    click(7, 7);
    await sleep(2200);
    const mv = moveList(window), cs = colors(window);
    ok('human black stone placed', cs[0] === 'B' && mv[0] === 'H8', `-> ${JSON.stringify(cs)} ${JSON.stringify(mv)}`);
    ok('AI replied as white', cs[1] === 'W', `-> ${JSON.stringify(cs)}`);
    dom.window.close();
  }

  // ---------------------------------------------------------------- human black, white first
  {
    console.log('== 你执黑 / 白先走（交换先手）==');
    const { dom, window, click, setSel } = makeDom();
    await sleep(1200);
    setSel('side', 'B');
    await sleep(400);
    setSel('firstColor', 'W');
    await sleep(2500);
    let mv = moveList(window), cs = colors(window);
    ok('AI(white) opens', mv.length === 1 && cs[0] === 'W', `-> ${JSON.stringify(cs)}`);
    // the AI opening is the centre H8, so pick a different, free point
    const taken = new Set(mv);
    const target = taken.has('I7') ? [6, 6] : [8, 6];
    click(target[0], target[1]);
    await sleep(2200);
    cs = colors(window);
    ok('human plays black second', cs[1] === 'B', `-> ${JSON.stringify(cs)}`);
    ok('AI replies white', cs[2] === 'W', `-> ${JSON.stringify(cs)}`);
    dom.window.close();
  }

  // ---------------------------------------------------------------- human white, white first (AI black but second)
  {
    console.log('== 你执白 / 白先走（你先下）==');
    const { dom, window, click, setSel } = makeDom();
    await sleep(1200);
    setSel('firstColor', 'W');
    await sleep(900);
    ok('board empty, waiting for human', moveList(window).length === 0, `-> ${JSON.stringify(moveList(window))}`);
    click(7, 7);
    await sleep(2200);
    const cs = colors(window);
    ok('human white first', cs[0] === 'W', `-> ${JSON.stringify(cs)}`);
    ok('AI black second', cs[1] === 'B', `-> ${JSON.stringify(cs)}`);
    dom.window.close();
  }

  // ---------------------------------------------------------------- undo respects the configured colour
  {
    console.log('== 悔棋（你执黑）==');
    const { dom, window, click, setSel } = makeDom();
    await sleep(1200);
    setSel('side', 'B');
    await sleep(500);
    click(7, 7);
    await sleep(2200);
    ok('two stones before undo', moveList(window).length === 2, `-> ${JSON.stringify(moveList(window))}`);
    window.document.getElementById('undo').dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
    await sleep(2200);
    const mv = moveList(window), cs = colors(window);
    ok('undo removed both stones', mv.length === 0, `-> ${JSON.stringify(mv)}`);
    ok('no AI move when human must move first', cs.length === 0, `-> ${JSON.stringify(cs)}`);
    dom.window.close();
  }

  console.log(`\nRESULT: ${pass} passed, ${fail} failed`);
  process.exitCode = fail ? 1 : 0;
})().catch((e) => { console.error(e); process.exit(1); });

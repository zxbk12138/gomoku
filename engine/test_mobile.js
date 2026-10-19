'use strict';
// Simulate a phone: coarse pointer + touch events, verify tap placement and no double fire.
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

(async () => {
  const dom = new JSDOM(html, { runScripts: 'dangerously', pretendToBeVisual: true, url: 'https://local.test/' });
  const { window } = dom;
  const doc = window.document;
  const svg = doc.getElementById('board');

  // pretend to be a phone
  window.matchMedia = (q) => ({
    matches: q.includes('pointer: coarse') || q.includes('max-width'),
    media: q, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {},
  });

  svg.getScreenCTM = () => ({ a: 1, b: 0, c: 0, d: 1, e: 0, f: 0, inverse() { return this; }, multiply() { return this; } });
  svg.createSVGPoint = function () { return { x: 0, y: 0, matrixTransform() { return { x: this.x, y: this.y }; } }; };

  const touch = (col, row, dx = 0, dy = 0) => {
    const t = { clientX: PX(col) + dx, clientY: PY(row) + dy, identifier: 1, target: svg };
    const ev = new window.Event('touchend', { bubbles: true, cancelable: true });
    ev.changedTouches = [t];
    ev.touches = [];
    svg.dispatchEvent(ev);
  };
  const mouseClick = (col, row) => svg.dispatchEvent(new window.MouseEvent('click', {
    bubbles: true, cancelable: true, clientX: PX(col), clientY: PY(row),
  }));

  const moveList = () => [...doc.querySelectorAll('#moves .mv .c')].map((e) => e.textContent);

  await sleep(2500);
  ok('AI opened', moveList().length === 1, `-> ${JSON.stringify(moveList())}`);

  // tap slightly off-centre, like a real finger
  touch(8, 6, 9, -11);
  await sleep(2300);
  let mv = moveList();
  ok('off-centre tap still lands on I7', mv[1] === 'I7', `-> ${JSON.stringify(mv)}`);

  const before = mv.length;
  // the emulated click that browsers fire after touchend must NOT place a second stone
  mouseClick(8, 6);
  await sleep(300);
  ok('synthetic click after tap ignored', moveList().length === before, `-> ${moveList().length}`);

  // a plain mouse click long after the tap should work (desktop users)
  await sleep(800);
  mouseClick(10, 9);
  await sleep(2300);
  mv = moveList();
  ok('mouse click still works later', mv.length === before + 2, `-> ${JSON.stringify(mv)}`);

  // a tap halfway between two intersections must be rejected (beyond tolerance)
  const n = moveList().length;
  touch(7, 7, CELL * 0.5, CELL * 0.5);
  await sleep(400);
  ok('tap far from intersection ignored', moveList().length === n, `-> ${moveList().length}`);

  console.log(`\nRESULT: ${pass} passed, ${fail} failed`);
  dom.window.close();
  process.exitCode = fail ? 1 : 0;
})().catch((e) => { console.error(e); process.exit(1); });

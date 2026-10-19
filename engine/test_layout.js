'use strict';
// Layout regression tests: the board must not move when the side panel changes height.
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

function makeDom({ width = 1440, height = 900, coarse = false } = {}) {
  const dom = new JSDOM(html, {
    runScripts: 'dangerously', pretendToBeVisual: true, url: 'https://local.test/',
    beforeParse(w) {
      w.innerWidth = width;
      w.innerHeight = height;
      w.matchMedia = (q) => ({
        matches: q.includes('min-width: 821px') ? width >= 821
               : q.includes('pointer: coarse') ? coarse
               : q.includes('max-width: 820px') ? width <= 820
               : false,
        media: q, addListener() {}, removeListener() {},
        addEventListener() {}, removeEventListener() {},
      });
    },
  });
  const { window } = dom;
  const doc = window.document;
  const svg = doc.getElementById('board');
  svg.getScreenCTM = () => ({ a: 1, b: 0, c: 0, d: 1, e: 0, f: 0, inverse() { return this; }, multiply() { return this; } });
  svg.createSVGPoint = function () { return { x: 0, y: 0, matrixTransform() { return { x: this.x, y: this.y }; } }; };
  return { dom, window, doc, svg };
}

const N = 15, CELL = 46, MARGIN = 62;
const PX = (i) => MARGIN + i * CELL;
const PY = (r) => MARGIN + (N - 1 - r) * CELL;

(async () => {
  // ---------------------------------------------------------------- desktop: pinned size
  {
    console.log('== 桌面：面板变高时棋盘尺寸不变 ==');
    const t = makeDom({ width: 1440, height: 900 });
    await sleep(2500);
    const before = t.svg.style.width;
    ok('board size locked by JS', /px$/.test(before), `-> "${before}"`);
    ok('board fits in viewport', parseFloat(before) <= 900 * 0.72 + 1, `-> ${before} vs vh*0.72=${900 * 0.72}`);

    // opening the setup panel (and playing many moves) must not change the size
    t.doc.getElementById('setupBtn').dispatchEvent(new t.window.MouseEvent('click', { bubbles: true }));
    await sleep(300);
    ok('size unchanged after opening setup', t.svg.style.width === before, `-> "${t.svg.style.width}"`);

    // simulate a long move list
    const box = t.doc.getElementById('moves');
    for (let i = 0; i < 40; i++) {
      const d = t.doc.createElement('div');
      d.className = 'mv';
      d.textContent = 'x';
      box.appendChild(d);
    }
    await sleep(200);
    ok('size unchanged after list grows', t.svg.style.width === before, `-> "${t.svg.style.width}"`);
    t.dom.window.close();
  }

  // ---------------------------------------------------------------- body scrolls when tall
  {
    console.log('== 内容超高时顶部不被裁掉 ==');
    const t = makeDom({ width: 1000, height: 620 });
    await sleep(600);
    const bodyStyle = t.window.getComputedStyle(t.doc.body);
    ok('body is not a centred flex container', bodyStyle.display !== 'flex' || bodyStyle.alignItems !== 'center',
       `-> display=${bodyStyle.display} align=${bodyStyle.alignItems}`);
    ok('body allows vertical scrolling', ['auto', 'scroll', 'visible'].includes(bodyStyle.overflowY),
       `-> overflow-y=${bodyStyle.overflowY}`);
    t.dom.window.close();
  }

  // ---------------------------------------------------------------- short window shrinks board
  {
    console.log('== 矮窗口自动缩小棋盘 ==');
    const tall = makeDom({ width: 1440, height: 1000 });
    await sleep(600);
    const tallW = parseFloat(tall.svg.style.width);
    tall.dom.window.close();

    const short = makeDom({ width: 1440, height: 640 });
    await sleep(600);
    const shortW = parseFloat(short.svg.style.width);
    ok('short window gives a smaller board', shortW < tallW, `-> short=${shortW} tall=${tallW}`);
    ok('short board still usable', shortW >= 260, `-> ${shortW}`);
    short.dom.window.close();
  }

  // ---------------------------------------------------------------- phone: CSS sizing
  {
    console.log('== 手机：交给 CSS ==');
    const t = makeDom({ width: 390, height: 844, coarse: true });
    await sleep(600);
    ok('no JS inline width on phone', !t.svg.style.width || t.svg.style.width === '',
       `-> "${t.svg.style.width}"`);
    t.dom.window.close();
  }

  // ---------------------------------------------------------------- resize updates size
  {
    console.log('== 窗口缩放后重新计算 ==');
    const t = makeDom({ width: 1440, height: 900 });
    await sleep(600);
    const before = parseFloat(t.svg.style.width);
    t.window.innerHeight = 600;
    t.window.dispatchEvent(new t.window.Event('resize'));
    await sleep(300);
    const after = parseFloat(t.svg.style.width);
    ok('board shrinks after window shrinks', after < before, `-> before=${before} after=${after}`);
    t.dom.window.close();
  }

  // ---------------------------------------------------------------- clicking still accurate
  {
    console.log('== 固定尺寸后点击仍准确 ==');
    const t = makeDom({ width: 1440, height: 900 });
    await sleep(2500);
    const svg = t.svg;
    const click = (col, row) => svg.dispatchEvent(new t.window.MouseEvent('click', {
      bubbles: true, cancelable: true, clientX: PX(col), clientY: PY(row),
    }));
    click(8, 6); // I7
    await sleep(2500);
    const cells = [...t.doc.querySelectorAll('#moves .mv .c')].map((e) => e.textContent);
    ok('click still lands on I7', cells[1] === 'I7', `-> ${JSON.stringify(cells)}`);
    t.dom.window.close();
  }

  console.log(`\nRESULT: ${pass} passed, ${fail} failed`);
  process.exitCode = fail ? 1 : 0;
})().catch((e) => { console.error(e); process.exit(1); });

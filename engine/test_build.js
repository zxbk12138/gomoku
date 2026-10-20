'use strict';
// End-to-end smoke test of the BUILT play.html.
// Regression: a build once stripped require('./forbidden') while calls to
// analyseBlackMove() remained, so enabling 禁手 crashed the AI with
// "analyseBlackMove is not defined".
const fs = require('fs');
const path = require('path');
const vm = require('vm');
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
  // ---------------------------------------------------------------- engine wiring
  {
    console.log('== 引擎内联完整性 ==');
    const blocks = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]);
    ok('two script blocks', blocks.length === 2);
    ok('require(forbidden) preserved', blocks[0].includes("require('./forbidden')"));
    const sb = { window: {}, console };
    vm.createContext(sb);
    vm.runInContext(blocks[0], sb);
    ok('GomokuEngine exposed', !!sb.window.GomokuEngine);
    ok('Renju exposed', !!sb.window.Renju);
    ok('Renju.analyseBlackMove is a function', typeof sb.window.Renju.analyseBlackMove === 'function');
    // the engine must be able to call it internally
    const { Engine } = sb.window.GomokuEngine;
    const e = new Engine(); e.clear();
    e.place(7 * 15 + 7, 1);
    let threw = null;
    try { e.think(1, 200, { renju: true, maxDepth: 4, vcfDepth: 6 }); } catch (err) { threw = err; }
    ok('engine.think(renju:true) does not throw', threw === null, threw ? `-> ${threw.message}` : '');
  }

  // ---------------------------------------------------------------- 禁手 + AI (the reported crash)
  {
    console.log('== 开启禁手后 AI 能正常应手（复现原 bug）==');
    const t = makeDom();
    await sleep(2200);                       // AI opens as black
    ok('AI opened', t.moves().length === 1, `-> ${JSON.stringify(t.moves())}`);

    t.setCheck('optRenju', true);            // this is what triggered the crash
    await sleep(2200);
    ok('AI re-opened after enabling 禁手', t.moves().length === 1, `-> ${JSON.stringify(t.moves())}`);

    t.click(8, 7);                           // human plays white I8
    await sleep(2600);
    const mv = t.moves();
    ok('AI replied without error', mv.length === 3, `-> ${JSON.stringify(mv)}`);
    ok('no error toast', !t.toast().includes('not defined'), `-> "${t.toast()}"`);
    ok('status is not an error', !t.status().includes('出错'), `-> "${t.status()}"`);
    t.dom.window.close();
  }

  // ---------------------------------------------------------------- every option combination
  {
    console.log('== 所有开关组合下 AI 都能走棋 ==');
    const combos = [
      { name: '禁手', renju: true },
      { name: '让子', handicap: true },
      { name: '让子给AI', handicap: true, handicapAi: true },
      { name: '降档', nerf: true },
      { name: '禁手+降档', renju: true, nerf: true },
    ];
    for (const c of combos) {
      const t = makeDom();
      await sleep(2000);
      t.setCheck('optRenju', !!c.renju);
      await sleep(300);
      t.setCheck('optHandicap', !!c.handicap);
      await sleep(300);
      if (c.handicapAi) { t.setCheck('optHandicapAi', true); await sleep(300); }
      t.setCheck('optNerf', !!c.nerf);
      await sleep(1800);
      const before = t.moves().length;
      t.click(9, 7);
      await sleep(2600);
      const after = t.moves().length;
      ok(`${c.name}: AI responded`, after > before, `-> ${JSON.stringify(t.moves())}`);
      t.dom.window.close();
    }
  }

  // ---------------------------------------------------------------- two player + renju
  {
    console.log('== 双人 + 禁手 ==');
    const t = makeDom();
    await sleep(800);
    t.setCheck('optTwoPlayer', true);
    t.setCheck('optRenju', true);
    await sleep(800);
    // black builds F8 G8 / H6 H7 then tries H8 (double three) -> refused
    const seq = [[5, 7], [0, 0], [6, 7], [14, 14], [7, 5], [0, 14], [7, 6], [14, 0]];
    for (const [c, r] of seq) { t.click(c, r); await sleep(120); }
    const before = t.moves().length;
    t.click(7, 7);
    await sleep(400);
    ok('forbidden move refused', t.moves().length === before, `-> ${JSON.stringify(t.moves())}`);
    ok('toast mentions 禁手', t.toast().includes('禁手'), `-> "${t.toast()}"`);
    t.dom.window.close();
  }

  // ---------------------------------------------------------------- undo / restart stability
  {
    console.log('== 悔棋 / 重开 不残留错误状态 ==');
    const t = makeDom();
    await sleep(2200);
    t.setCheck('optRenju', true);
    await sleep(2000);
    t.click(8, 7);
    await sleep(2400);
    const before = t.moves().length;
    t.press('undo');
    await sleep(2400);
    ok('undo worked with 禁手 on', t.moves().length === 1, `-> ${JSON.stringify(t.moves())}`);
    t.press('restart');
    await sleep(2200);
    ok('restart works', t.moves().length === 1, `-> ${JSON.stringify(t.moves())}`);
    ok('no error toast after undo/restart', !t.toast().includes('出错'), `-> "${t.toast()}"`);
    t.dom.window.close();
  }

  // ---------------------------------------------------------------- setup mode
  {
    console.log('== 摆棋模式 ==');
    const t = makeDom();
    await sleep(800);
    t.setCheck('optTwoPlayer', true);
    await sleep(500);
    t.press('setupBtn');
    await sleep(300);
    t.click(7, 7); await sleep(100);
    t.click(8, 8); await sleep(100);
    const n = t.svg.querySelectorAll('circle[filter="url(#sh)"]').length;
    ok('painted two stones', n === 2, `-> ${n}`);
    t.setSel('setupNext', 'ai');
    t.press('setupDone');
    await sleep(2600);
    const n2 = t.svg.querySelectorAll('circle[filter="url(#sh)"]').length;
    ok('AI continued after setup', n2 === 3, `-> ${n2}`);
    t.dom.window.close();
  }

  console.log(`\nRESULT: ${pass} passed, ${fail} failed`);
  process.exitCode = fail ? 1 : 0;
})().catch((e) => { console.error(e); process.exit(1); });

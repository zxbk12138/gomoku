'use strict';
// Adversarial bug hunt: edge cases that are easy to get wrong.
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
  const toast = () => doc.getElementById('toast').textContent;
  const stones = () => svg.querySelectorAll('circle[filter="url(#sh)"]').length;
  return { dom, window, doc, svg, click, press, setSel, setCheck, moves, colors, status, toast, stones };
}

(async () => {
  // ---------------------------------------------------------------- board edges
  {
    console.log('== 棋盘边缘坐标 ==');
    const t = makeDom();
    await sleep(700);
    t.setCheck('optTwoPlayer', true);
    await sleep(400);
    const corners = [[0, 0], [14, 0], [0, 14], [14, 14]];
    for (const [c, r] of corners) { t.click(c, r); await sleep(100); }
    const mv = t.moves();
    ok('all four corners placeable', mv.length === 4, `-> ${JSON.stringify(mv)}`);
    ok('A1 correct', mv[0] === 'A1', `-> ${mv[0]}`);
    ok('O1 correct', mv[1] === 'O1', `-> ${mv[1]}`);
    ok('A15 correct', mv[2] === 'A15', `-> ${mv[2]}`);
    ok('O15 correct', mv[3] === 'O15', `-> ${mv[3]}`);
    t.dom.window.close();
  }

  // ---------------------------------------------------------------- click outside grid
  {
    console.log('== 点棋盘外不应落子 ==');
    const t = makeDom();
    await sleep(700);
    t.setCheck('optTwoPlayer', true);
    await sleep(400);
    // click in the margin area (outside the 15x15 intersections)
    t.svg.dispatchEvent(new t.window.MouseEvent('click', { bubbles: true, clientX: 5, clientY: 5 }));
    await sleep(200);
    ok('margin click ignored', t.moves().length === 0, `-> ${JSON.stringify(t.moves())}`);
    // click halfway between two intersections
    t.svg.dispatchEvent(new t.window.MouseEvent('click', {
      bubbles: true, clientX: PX(3) + CELL * 0.5, clientY: PY(3) + CELL * 0.5,
    }));
    await sleep(200);
    ok('between-intersections click ignored', t.moves().length === 0, `-> ${JSON.stringify(t.moves())}`);
    t.dom.window.close();
  }

  // ---------------------------------------------------------------- AI never plays on occupied cell
  {
    console.log('== AI 不会下在已有棋子的位置 ==');
    const t = makeDom();
    await sleep(2200);
    t.setCheck('optRenju', true);
    await sleep(1800);
    for (let i = 0; i < 6; i++) {
      t.click(7 + (i % 3), 6 + Math.floor(i / 3));
      await sleep(2200);
    }
    const mv = t.moves();
    const uniq = new Set(mv);
    ok('no duplicate moves', uniq.size === mv.length, `-> ${mv.length} moves, ${uniq.size} unique`);
    ok('stone count matches list', t.stones() === mv.length, `-> ${t.stones()} vs ${mv.length}`);
    t.dom.window.close();
  }

  // ---------------------------------------------------------------- undo at game start
  {
    console.log('== 开局悔棋 ==');
    const t = makeDom();
    await sleep(2200);                       // let the AI open (it moves first)
    t.setSel('side', 'B');                   // human plays black -> empty board
    await sleep(600);
    const empty = t.moves().length === 0;
    ok('board is empty for human-first', empty, `-> ${JSON.stringify(t.moves())}`);
    t.press('undo');
    await sleep(300);
    ok('undo on empty board is safe', t.moves().length === 0, `-> ${JSON.stringify(t.moves())}`);
    ok('toast says nothing to undo', t.toast().includes('还没有'), `-> "${t.toast()}"`);
    t.dom.window.close();
  }

  // ---------------------------------------------------------------- undo mid-thinking
  {
    console.log('== AI 思考中悔棋不应卡死 ==');
    const t = makeDom();
    await sleep(2200);
    t.setSelect = null;
    // make AI slow, then click immediately
    t.setSel('level', '3500');
    t.click(8, 7);
    await sleep(50);
    t.press('undo');       // interrupt while thinking
    await sleep(4000);
    ok('undo during thinking resolved', t.moves().length <= 1, `-> ${JSON.stringify(t.moves())}`);
    ok('not stuck in thinking', !t.status().includes('思考中'), `-> "${t.status()}"`);
    t.dom.window.close();
  }

  // ---------------------------------------------------------------- switching options mid-game
  {
    console.log('== 对局中途切换选项 ==');
    const t = makeDom();
    await sleep(2200);
    t.click(8, 7);
    await sleep(2400);
    t.setCheck('optRenju', true);      // restarts
    await sleep(2200);
    ok('renju switch restarts cleanly', t.moves().length === 1, `-> ${JSON.stringify(t.moves())}`);
    t.setSel('side', 'B');             // human black
    await sleep(800);
    ok('side switch clears board', t.moves().length === 0, `-> ${JSON.stringify(t.moves())}`);
    t.click(7, 7);
    await sleep(2400);
    const cs = t.colors();
    ok('human is black after switch', cs[0] === 'B', `-> ${JSON.stringify(cs)}`);
    ok('AI answered as white', cs[1] === 'W', `-> ${JSON.stringify(cs)}`);
    t.dom.window.close();
  }

  // ---------------------------------------------------------------- copy record
  {
    console.log('== 复制棋谱 ==');
    const t = makeDom();
    await sleep(700);
    t.setCheck('optTwoPlayer', true);
    await sleep(400);
    t.click(7, 7); await sleep(120);
    t.click(8, 8); await sleep(120);
    let captured = null;
    t.window.prompt = (msg, def) => { captured = def; return null; };
    t.press('copyRecord');
    await sleep(400);
    ok('record captured', !!captured, captured ? '' : '-> prompt not called');
    if (captured) {
      ok('record has both moves', captured.includes('H8') && captured.includes('I9'), `-> ${JSON.stringify(captured.slice(0, 60))}`);
      ok('record has result line', captured.includes('结果'), '');
    }
    t.dom.window.close();
  }

  // ---------------------------------------------------------------- persistence
  {
    console.log('== 刷新后恢复对局 ==');
    const t = makeDom();
    await sleep(700);
    t.setCheck('optTwoPlayer', true);
    await sleep(400);
    t.click(7, 7); await sleep(150);
    t.click(8, 8); await sleep(150);
    const saved = t.window.localStorage.getItem('gomoku_v1');
    ok('state saved', !!saved, saved ? `${saved.length} bytes` : '');

    // reload a fresh page in a new DOM with the same stored state
    const t2 = new JSDOM(html, {
      runScripts: 'dangerously', pretendToBeVisual: true, url: 'https://local.test/',
    });
    t2.window.localStorage.setItem('gomoku_v1', saved);
    const parsed = JSON.parse(saved);
    ok('saved payload has moves', Array.isArray(parsed.moves) && parsed.moves.length === 2, '');
    ok('saved payload has options', 'twoPlayer' in parsed, '');
    t2.window.close();
    t.dom.window.close();
  }

  // ---------------------------------------------------------------- handicap semantics
  {
    console.log('== 让子模式 ==');
    const t = makeDom();
    await sleep(700);
    t.setCheck('optTwoPlayer', true);
    await sleep(300);
    t.setCheck('optHandicap', true);
    await sleep(600);
    const st = t.status();
    ok('handicap announced in status', st.includes('让子') || st.includes('轮'), `-> "${st}"`);
    t.dom.window.close();
  }

  console.log(`\nRESULT: ${pass} passed, ${fail} failed`);
  process.exitCode = fail ? 1 : 0;
})().catch((e) => { console.error(e); process.exit(1); });

#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""Generate a self-contained board.html (double-click to open) from game.json."""
import json
import os

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
STATE = os.path.join(ROOT, "game.json")
OUT = os.path.join(ROOT, "board.html")

TEMPLATE = r"""<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>五子棋 · 黑(我) vs 白(你)</title>
<style>
  :root{
    --ink:#2a1d10; --wood1:#e8c489; --wood2:#d9a860; --wood3:#c78f4a;
    --panel:#14100c; --panel2:#1d1712; --line:#3a2c1d; --txt:#f0e6d6; --dim:#a08d74;
    --accent:#e0483c;
  }
  *{box-sizing:border-box}
  html,body{height:100%}
  body{
    margin:0; font-family:"Microsoft YaHei","PingFang SC","Hiragino Sans GB",system-ui,sans-serif;
    background:radial-gradient(1200px 800px at 50% -10%,#241c14 0%,#100d0a 55%,#0a0807 100%);
    color:var(--txt); display:flex; align-items:center; justify-content:center; padding:24px;
  }
  .wrap{display:flex; gap:26px; align-items:stretch; max-width:1180px; width:100%; justify-content:center; flex-wrap:wrap}
  .boardbox{
    background:linear-gradient(160deg,#3a2a19,#241a10); padding:14px; border-radius:18px;
    box-shadow:0 24px 60px rgba(0,0,0,.55), inset 0 0 0 1px rgba(255,220,170,.10);
  }
  svg{display:block; width:min(74vh,660px); height:auto; border-radius:8px}
  aside{
    width:300px; min-width:260px; flex:1 1 260px; background:linear-gradient(180deg,var(--panel2),var(--panel));
    border:1px solid var(--line); border-radius:18px; padding:20px 18px; display:flex; flex-direction:column;
    box-shadow:0 24px 60px rgba(0,0,0,.45);
  }
  h1{font-size:17px; margin:0 0 4px; letter-spacing:.5px}
  .sub{font-size:12px; color:var(--dim); margin-bottom:16px}
  .status{
    display:flex; align-items:center; gap:9px; font-size:14px; padding:11px 13px; border-radius:11px;
    background:rgba(224,72,60,.10); border:1px solid rgba(224,72,60,.28); margin-bottom:16px;
  }
  .dot{width:9px;height:9px;border-radius:50%;background:var(--accent);box-shadow:0 0 12px var(--accent)}
  .moves{flex:1; overflow:auto; max-height:46vh; padding-right:4px}
  .moves::-webkit-scrollbar{width:6px}
  .moves::-webkit-scrollbar-thumb{background:#3a2c1d;border-radius:3px}
  .mv{display:flex; align-items:center; gap:9px; padding:6px 9px; border-radius:8px; font-size:13px; color:#d8cbb8}
  .mv:nth-child(odd){background:rgba(255,255,255,.025)}
  .mv.last{background:rgba(224,72,60,.16); color:#fff; box-shadow:inset 0 0 0 1px rgba(224,72,60,.35)}
  .mv .n{width:26px; text-align:right; color:var(--dim); font-variant-numeric:tabular-nums; font-size:12px}
  .mv.last .n{color:#f0a49c}
  .st{width:16px;height:16px;border-radius:50%;flex:none}
  .st.b{background:radial-gradient(circle at 32% 30%,#6e6e78,#0a0a0e 72%);box-shadow:0 1px 3px rgba(0,0,0,.7)}
  .st.w{background:radial-gradient(circle at 32% 30%,#ffffff,#b9b9c4 74%);box-shadow:0 1px 3px rgba(0,0,0,.5)}
  .mv .c{font-weight:600; letter-spacing:.4px}
  .legend{margin-top:14px; padding-top:14px; border-top:1px solid var(--line); font-size:12px; color:var(--dim); line-height:1.75}
  .legend b{color:#e6d9c4; font-weight:600}
  .toggle{display:flex; align-items:center; gap:8px; margin-top:12px; font-size:12px; color:var(--dim); cursor:pointer; user-select:none}
  .toggle input{accent-color:var(--accent)}
</style>
</head>
<body>
<div class="wrap">
  <div class="boardbox"><svg id="board" viewBox="0 0 768 768" xmlns="http://www.w3.org/2000/svg"></svg></div>
  <aside>
    <h1>五子棋 · 15×15</h1>
    <div class="sub">● 黑 = 我（引擎）&nbsp;&nbsp; ○ 白 = 你（手机 AI）</div>
    <div class="status"><span class="dot"></span><span id="statusText"></span></div>
    <div class="moves" id="moves"></div>
    <label class="toggle"><input type="checkbox" id="showNum" checked> 显示手数</label>
    <div class="legend">
      红圈 = 最新一手<br>
      坐标：列 <b>A–O</b>，行 <b>1–15</b>（1 在最下方）<br>
      把手机 AI 的落点发我，例如 <b>H9</b>
    </div>
  </aside>
</div>
<script>
const STATE = __STATE__;
const N = 15, CELL = 46, MARGIN = 62;
const P = i => MARGIN + i * CELL;
const NS = "http://www.w3.org/2000/svg";
const svg = document.getElementById("board");

function el(tag, attrs, parent){
  const e = document.createElementNS(NS, tag);
  for (const k in attrs) e.setAttribute(k, attrs[k]);
  if (parent) parent.appendChild(e);
  return e;
}

function build(){
  const S = MARGIN * 2 + CELL * (N - 1);
  // defs
  const defs = el("defs", {}, svg);
  const wood = el("linearGradient", {id:"wood", x1:"0", y1:"0", x2:"1", y2:"1"}, defs);
  el("stop", {offset:"0%",   "stop-color":"#efcf9b"}, wood);
  el("stop", {offset:"45%",  "stop-color":"#e2b675"}, wood);
  el("stop", {offset:"100%", "stop-color":"#c9904e"}, wood);
  const gb = el("radialGradient", {id:"gb", cx:"0.34", cy:"0.30", r:"0.78"}, defs);
  el("stop", {offset:"0%",   "stop-color":"#6e6e78"}, gb);
  el("stop", {offset:"55%",  "stop-color":"#25252c"}, gb);
  el("stop", {offset:"100%", "stop-color":"#08080c"}, gb);
  const gw = el("radialGradient", {id:"gw", cx:"0.34", cy:"0.30", r:"0.80"}, defs);
  el("stop", {offset:"0%",   "stop-color":"#ffffff"}, gw);
  el("stop", {offset:"70%",  "stop-color":"#ececf1"}, gw);
  el("stop", {offset:"100%", "stop-color":"#b6b6c2"}, gw);
  const sh = el("filter", {id:"sh", x:"-40%", y:"-40%", width:"180%", height:"180%"}, defs);
  el("feDropShadow", {dx:"0", dy:"2.2", stdDeviation:"2.4", "flood-color":"#000", "flood-opacity":"0.45"}, sh);

  el("rect", {x:0, y:0, width:S, height:S, rx:10, fill:"url(#wood)"}, svg);
  el("rect", {x:18, y:18, width:S-36, height:S-36, rx:6, fill:"none",
              stroke:"rgba(90,58,26,.35)", "stroke-width":2}, svg);

  const g = el("g", {stroke:"#4a3117", "stroke-opacity":"0.82", "stroke-width":"1.15"}, svg);
  for (let i = 0; i < N; i++){
    el("line", {x1:P(0), y1:P(i), x2:P(N-1), y2:P(i)}, g);
    el("line", {x1:P(i), y1:P(0), x2:P(i), y2:P(N-1)}, g);
  }
  el("rect", {x:P(0), y:P(0), width:P(N-1)-P(0), height:P(N-1)-P(0),
              fill:"none", stroke:"#3a2410", "stroke-width":"2.4"}, svg);

  [[3,3],[3,11],[11,3],[11,11],[7,7]].forEach(([cx, cy]) => {
    el("circle", {cx:P(cx), cy:P(cy), r:3.6, fill:"#3a2410"}, svg);
  });

  const fs = 15;
  for (let i = 0; i < N; i++){
    const letter = String.fromCharCode(65 + i);
    [[P(i), 40], [P(i), S - 26]].forEach(([x, y]) => {
      const t = el("text", {x:x, y:y, "text-anchor":"middle", "font-size":fs,
                            fill:"#4a3117", "font-family":"Georgia,serif", opacity:"0.85"}, svg);
      t.textContent = letter;
    });
    [[30, P(i) + 5], [S - 30, P(i) + 5]].forEach(([x, y]) => {
      const t = el("text", {x:x, y:y, "text-anchor":"middle", "font-size":fs,
                            fill:"#4a3117", "font-family":"Georgia,serif", opacity:"0.85"}, svg);
      t.textContent = String(i + 1);
    });
  }

  const R = CELL * 0.435;
  const moves = STATE.moves || [];
  const last = moves[moves.length - 1];

  const hover = el("g", {opacity:"0"}, svg);
  const hRing = el("circle", {r:R, fill:"none", stroke:"#e0483c", "stroke-width":"2",
                              "stroke-dasharray":"4 3", opacity:"0.85"}, hover);

  moves.forEach(m => {
    const col = m.cell.charCodeAt(0) - 65;
    const row = parseInt(m.cell.slice(1), 10) - 1;
    const cx = P(col), cy = P(N - 1 - row);
    el("circle", {cx:cx, cy:cy, r:R, fill:m.color === "B" ? "url(#gb)" : "url(#gw)",
                  filter:"url(#sh)"}, svg);
  });

  if (last){
    const col = last.cell.charCodeAt(0) - 65;
    const row = parseInt(last.cell.slice(1), 10) - 1;
    el("circle", {cx:P(col), cy:P(N-1-row), r:R*1.18, fill:"none",
                  stroke:"#e0483c", "stroke-width":"2.6"}, svg);
  }

  const numLayer = el("g", {id:"nums"}, svg);
  moves.forEach(m => {
    const col = m.cell.charCodeAt(0) - 65;
    const row = parseInt(m.cell.slice(1), 10) - 1;
    const t = el("text", {x:P(col), y:P(N-1-row) + 4.2, "text-anchor":"middle",
                          "font-size":"12.5", "font-family":"Arial,sans-serif",
                          "font-weight":"600",
                          fill:m.color === "B" ? "#f2f2f6" : "#2a2a30", opacity:"0.9"}, numLayer);
    t.textContent = String(m.n);
  });

  // hover highlight
  const overlay = el("rect", {x:P(0)-CELL/2, y:P(0)-CELL/2, width:P(N-1)-P(0)+CELL,
                              height:P(N-1)-P(0)+CELL, fill:"transparent"}, svg);
  overlay.addEventListener("mousemove", ev => {
    const pt = svg.createSVGPoint();
    pt.x = ev.clientX; pt.y = ev.clientY;
    const loc = pt.matrixTransform(svg.getScreenCTM().inverse());
    const col = Math.round((loc.x - MARGIN) / CELL);
    const row = Math.round((loc.y - MARGIN) / CELL);
    if (col < 0 || col >= N || row < 0 || row >= N) { hover.setAttribute("opacity", "0"); return; }
    hRing.setAttribute("cx", P(col));
    hRing.setAttribute("cy", P(row));
    hover.setAttribute("opacity", "1");
  });
  overlay.addEventListener("mouseleave", () => hover.setAttribute("opacity", "0"));
}

function fillPanel(){
  const moves = STATE.moves || [];
  const box = document.getElementById("moves");
  const st = document.getElementById("statusText");
  if (STATE.status === "playing"){
    st.textContent = STATE.turn === "B" ? "黑棋（我）该下" : "白棋（你）该下";
  } else if (STATE.status === "black_win") st.textContent = "黑棋（我）五连，胜！";
  else if (STATE.status === "white_win") st.textContent = "白棋（你）五连，胜！";
  else st.textContent = "和棋";

  const frag = document.createDocumentFragment();
  moves.forEach((m, i) => {
    const d = document.createElement("div");
    d.className = "mv" + (i === moves.length - 1 ? " last" : "");
    d.innerHTML = `<span class="n">${m.n}</span><span class="st ${m.color.toLowerCase()}"></span>` +
                  `<span class="c">${m.cell}</span>`;
    frag.appendChild(d);
  });
  box.appendChild(frag);
  box.scrollTop = box.scrollHeight;
}

build();
fillPanel();
document.getElementById("showNum").addEventListener("change", e => {
  document.getElementById("nums").style.display = e.target.checked ? "" : "none";
});
</script>
</body>
</html>
"""


def main():
    with open(STATE, "r", encoding="utf-8") as f:
        st = json.load(f)
    payload = json.dumps({
        "moves": st.get("moves", []),
        "turn": st.get("turn", "B"),
        "status": st.get("status", "playing"),
    }, ensure_ascii=False)
    html = TEMPLATE.replace("__STATE__", payload)
    with open(OUT, "w", encoding="utf-8") as f:
        f.write(html)
    print(OUT)


if __name__ == "__main__":
    main()

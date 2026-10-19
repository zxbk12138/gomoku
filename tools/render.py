#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""Render the 15x15 gomoku board from game.json to a PNG."""
import json
import os
import sys

import numpy as np
from PIL import Image, ImageDraw, ImageFont

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
STATE = os.path.join(ROOT, "game.json")
OUT = os.path.join(ROOT, "board.png")

N = 15
S = 46          # cell size (px)
M = 78          # margin
W = M * 2 + S * (N - 1)
SCALE = 2       # supersampling

FONT_CANDIDATES = [
    r"C:\Windows\Fonts\msyh.ttc",
    r"C:\Windows\Fonts\msyhbd.ttc",
    r"C:\Windows\Fonts\simhei.ttf",
    r"C:\Windows\Fonts\Deng.ttf",
]


def load_font(size):
    for p in FONT_CANDIDATES:
        if os.path.exists(p):
            try:
                return ImageFont.truetype(p, size)
            except Exception:
                continue
    return ImageFont.load_default()


def wood_background(w, h):
    """Warm wood-grain background."""
    rng = np.random.default_rng(20240607)
    yy, xx = np.mgrid[0:h, 0:w].astype(np.float32)
    base = np.zeros((h, w, 3), np.float32)
    base[..., 0] = 222 + 10 * np.sin(xx / 190.0 + 0.6) + 6 * np.sin(yy / 37.0)
    base[..., 1] = 176 + 8 * np.sin(xx / 210.0 + 1.4) + 5 * np.sin(yy / 29.0)
    base[..., 2] = 116 + 6 * np.sin(xx / 240.0 + 2.2) + 4 * np.sin(yy / 41.0)

    grain = np.zeros((h, w), np.float32)
    for k in range(26):
        amp = rng.uniform(1.5, 5.0)
        freq = rng.uniform(0.004, 0.02)
        phase = rng.uniform(0, 6.28)
        tilt = rng.uniform(-0.05, 0.05)
        grain += amp * np.sin((yy + xx * tilt) * freq + phase)
    base += grain[..., None] * np.array([1.0, 0.85, 0.65], np.float32)

    # soft vignette
    cx, cy = w / 2.0, h / 2.0
    d = np.sqrt(((xx - cx) / cx) ** 2 + ((yy - cy) / cy) ** 2)
    shade = np.clip(1.06 - 0.16 * d ** 2, 0.86, 1.05)
    base *= shade[..., None]
    return Image.fromarray(np.clip(base, 0, 255).astype(np.uint8), "RGB")


def draw_stone(img, cx, cy, r, color):
    """Anti-aliased stone with radial shading and shadow, drawn at SCALE."""
    pad = int(r * 1.5)
    size = pad * 2
    yy, xx = np.mgrid[0:size, 0:size].astype(np.float32)
    dx = (xx - pad) / r
    dy = (yy - pad) / r
    dist = np.sqrt(dx * dx + dy * dy)
    alpha = np.clip((1.0 - dist) * r * 1.15, 0.0, 1.0)

    if color == "B":
        light = np.array([105, 105, 112], np.float32)
        dark = np.array([8, 8, 12], np.float32)
    else:
        light = np.array([255, 255, 255], np.float32)
        dark = np.array([176, 176, 186], np.float32)

    # light from upper-left
    t = np.clip(0.5 - 0.42 * (dx * 0.72 + dy * 0.72), 0.0, 1.0)
    t = t ** 1.25
    rgb = dark[None, None, :] + (light - dark)[None, None, :] * t[..., None]

    # specular highlight
    hx, hy = -0.42, -0.42
    hd = np.sqrt((dx - hx) ** 2 + (dy - hy) ** 2)
    spec = np.clip(1.0 - hd / 0.55, 0.0, 1.0) ** 2.2
    if color == "B":
        rgb += spec[..., None] * 95
    else:
        rgb += spec[..., None] * 40

    # rim darkening
    rim = np.clip((dist - 0.80) / 0.20, 0.0, 1.0)
    rgb *= (1.0 - 0.30 * rim)[..., None]

    stone = Image.fromarray(np.clip(rgb, 0, 255).astype(np.uint8), "RGB").convert("RGBA")
    a = Image.fromarray((alpha * 255).astype(np.uint8), "L")
    stone.putalpha(a)

    # drop shadow
    sh_off = int(r * 0.18)
    shadow = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    sdraw = ImageDraw.Draw(shadow)
    sdraw.ellipse([pad - r + sh_off * 0.4, pad - r + sh_off, pad + r + sh_off * 0.4, pad + r + sh_off],
                  fill=(0, 0, 0, 70))
    from PIL import ImageFilter
    shadow = shadow.filter(ImageFilter.GaussianBlur(r * 0.16))
    img.alpha_composite(shadow, (cx - pad, cy - pad))
    img.alpha_composite(stone, (cx - pad, cy - pad))


def main():
    with open(STATE, "r", encoding="utf-8") as f:
        st = json.load(f)

    board = st["board"]
    moves = st.get("moves", [])

    # board grid area in device pixels
    px = lambda i: (M + i * S) * SCALE
    # screen row for a board row (board row 0 = rank 1 = BOTTOM of the image)
    sy = lambda row: px(N - 1 - row)
    w = W * SCALE
    img = wood_background(w, w).convert("RGBA")

    # thin inner frame
    d = ImageDraw.Draw(img, "RGBA")
    d.rectangle([px(0) - 26, px(0) - 26, px(N - 1) + 26, px(N - 1) + 26],
                outline=(96, 62, 26, 110), width=3)

    # grid
    lw = 2
    for i in range(N):
        d.line([px(0), px(i), px(N - 1), px(i)], fill=(58, 36, 16, 205), width=lw)
        d.line([px(i), px(0), px(i), px(N - 1)], fill=(58, 36, 16, 205), width=lw)

    # border
    d.rectangle([px(0), px(0), px(N - 1), px(N - 1)], outline=(42, 24, 8, 235), width=4)

    # star points
    star_r = 5 * SCALE // 2
    for (sx, srow) in [(3, 3), (3, 11), (11, 3), (11, 11), (7, 7)]:
        cx, cy = px(sx), sy(srow)
        d.ellipse([cx - star_r, cy - star_r, cx + star_r, cy + star_r], fill=(42, 24, 8, 255))

    # coordinates
    font_c = load_font(int(21 * SCALE))
    font_cb = load_font(int(21 * SCALE))
    for i in range(N):
        letter = chr(ord("A") + i)
        # bottom letters / top letters
        for ytxt in (px(N - 1) + 30 * SCALE, px(0) - 34 * SCALE):
            tw = d.textlength(letter, font=font_c)
            d.text((px(i) - tw / 2, ytxt - 12 * SCALE), letter, font=font_c, fill=(70, 44, 20, 255))
        # rank numbers: i=0 is rank 1 and must sit at the BOTTOM
        num = str(i + 1)
        for xtxt in (px(0) - 36 * SCALE, px(N - 1) + 22 * SCALE):
            th = 22 * SCALE
            d.text((xtxt, sy(i) - th / 2), num, font=font_cb, fill=(70, 44, 20, 255))

    # stones
    radius = S * SCALE * 0.435
    stone_at = {}
    for m in moves:
        col = ord(m["cell"][0]) - ord("A")
        row = int(m["cell"][1:]) - 1
        stone_at[(col, row)] = m

    order = sorted(stone_at.values(), key=lambda m: m["n"])
    for m in order:
        col = ord(m["cell"][0]) - ord("A")
        row = int(m["cell"][1:]) - 1
        draw_stone(img, px(col), sy(row), radius, m["color"])

    # move numbers on the last 20 stones, tiny
    font_n = load_font(int(15 * SCALE))
    for m in order[-24:]:
        col = ord(m["cell"][0]) - ord("A")
        row = int(m["cell"][1:]) - 1
        txt = str(m["n"])
        tw = d.textlength(txt, font=font_n)
        th = 16 * SCALE
        fill = (245, 245, 245, 230) if m["color"] == "B" else (40, 40, 40, 230)
        d.text((px(col) - tw / 2, sy(row) - th / 2 + 1 * SCALE), txt, font=font_n, fill=fill)

    # last-move marker
    if moves:
        last = moves[-1]
        col = ord(last["cell"][0]) - ord("A")
        row = int(last["cell"][1:]) - 1
        r = radius * 1.22
        d.ellipse([px(col) - r, sy(row) - r, px(col) + r, sy(row) + r],
                  outline=(220, 40, 40, 255), width=int(3.2 * SCALE))

    # caption strip at the bottom
    cap_h = int(66 * SCALE)
    out = Image.new("RGBA", (w, w + cap_h), (250, 246, 238, 255))
    out.alpha_composite(img, (0, 0))
    dc = ImageDraw.Draw(out, "RGBA")
    font_cap = load_font(int(24 * SCALE))
    turn = st.get("turn", "B")
    status = st.get("status", "playing")
    if status == "playing":
        who = "黑棋（我）该下" if turn == "B" else "白棋（你）该下"
        msg = f"第 {len(moves)} 手   ·   {who}"
    elif status == "black_win":
        msg = f"第 {len(moves)} 手   ·   黑棋（我）五子连珠，胜！"
    elif status == "white_win":
        msg = f"第 {len(moves)} 手   ·   白棋（你）五子连珠，胜！"
    else:
        msg = "和棋"
    tw = dc.textlength(msg, font=font_cap)
    dc.text(((w - tw) / 2, w + cap_h * 0.30), msg, font=font_cap, fill=(60, 40, 20, 255))

    out = out.convert("RGB").resize((w // SCALE, (w + cap_h) // SCALE), Image.LANCZOS)
    out.save(OUT, "PNG")
    print(OUT)


if __name__ == "__main__":
    main()

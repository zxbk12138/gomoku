#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""Build the standalone interactive board (play.html).

Inlines engine/gomoku.js + engine/forbidden.js as browser globals:
    window.GomokuEngine = { Engine, coordName, parseCoord, ... }
"""
import os
import re

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ENGINE_DIR = os.path.join(ROOT, "engine")
TEMPLATE = os.path.join(ROOT, "tools", "play_template.html")
OUT = os.path.join(ROOT, "play.html")

SHIM = r"""
(function(){
  // ---- module scaffolding for the CommonJS engine sources ----
  var __modules = {};
  var __cache = {};
  function __req(name){
    name = String(name).replace(/^\.\//, '').replace(/\.js$/, '');
    if (__cache[name]) return __cache[name].exports;
    var fn = __modules[name];
    if (!fn) throw new Error('module not found: ' + name);
    var m = { exports: {} };
    __cache[name] = m;
    fn(m, m.exports, __req);
    return m.exports;
  }

%(modules)s

  window.GomokuEngine = __req('gomoku');
  window.Renju = __req('forbidden');
})();
"""

MODULE_WRAP = r"""  __modules[%(name)r] = function(module, exports, require){
%(body)s
  };
"""


def strip_module_noise(src: str) -> str:
    src = src.replace("'use strict';", "", 1)
    src = re.sub(r"^\s*const\s+\{[^}]*\}\s*=\s*require\([^)]*\);?\s*$", "", src, flags=re.M)
    src = re.sub(r"^\s*const\s+\w+\s*=\s*require\([^)]*\);?\s*$", "", src, flags=re.M)
    src = re.sub(r"^\s*import .*$", "", src, flags=re.M)
    return src


def build():
    parts = []
    for name in ("forbidden", "gomoku"):
        with open(os.path.join(ENGINE_DIR, name + ".js"), "r", encoding="utf-8") as f:
            body = strip_module_noise(f.read())
        body = "\n".join("    " + ln if ln.strip() else ln for ln in body.splitlines())
        parts.append(MODULE_WRAP % {"name": name, "body": body})

    payload = SHIM % {"modules": "\n".join(parts)}
    payload = payload.replace("</script>", "<\\/script>")

    with open(TEMPLATE, "r", encoding="utf-8") as f:
        html = f.read()

    if "/*__ENGINE__*/" not in html:
        raise SystemExit("template marker /*__ENGINE__*/ not found")

    html = html.replace("/*__ENGINE__*/", payload)
    with open(OUT, "w", encoding="utf-8") as f:
        f.write(html)
    print(OUT, len(html), "bytes")


if __name__ == "__main__":
    build()

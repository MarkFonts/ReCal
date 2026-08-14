#!/usr/bin/env python3
"""Build /recalsans/geom/ -- the GEOM substitution table as a static, indexable page.

The table already exists inside the app as a live React component, which means it is
invisible to a crawler and unlinkable: you cannot send anyone to "the row where the a
changes". This renders the same information as server-rendered HTML with the outlines
inlined as SVG paths, one addressable section per glyph.

Everything comes from the font and from src/data/substitutions.json (itself generated from
the font's FeatureVariations), so the page cannot drift from what ships. The preset marks
come from src/instrument/presets.ts for the same reason.

    .venv/bin/python3 scripts/gen_geom_table.py        # -> public/geom/index.html
"""
import json
import re
from pathlib import Path

from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.ttLib import TTFont
from fontTools.varLib.instancer import instantiateVariableFont

ROOT = Path(__file__).resolve().parent.parent
FONT = ROOT / "public/fonts/CalSansVF.ttf"
SUBS = ROOT / "src/data/substitutions.json"
PRESETS_TS = ROOT / "src/instrument/presets.ts"
OUT = ROOT / "public/geom/index.html"
ORIGIN, BASE = "https://wordmark.nyc", "/recalsans"

ZONES = [  # the four landings, straight from GlyphGroups.tsx
    ("A11Y", 0, 10, "#c97050"),
    ("UI", 15, 30, "#9a9a9a"),
    ("Base", 40, 60, "#4a7fd4"),
    ("Geo", 80, 100, "#4aad5c"),
]


def esc(s):
    return (str(s).replace("&", "&amp;").replace("<", "&lt;")
            .replace(">", "&gt;").replace('"', "&quot;"))


def presets():
    """name + frozen GEOM, parsed rather than copied so it tracks presets.ts."""
    src = PRESETS_TS.read_text()
    out = []
    for m in re.finditer(r"name:\s*'([^']+)',\s*geom:\s*(\d+)", src):
        out.append((m.group(1), int(m.group(2))))
    return out


def glyph_svg(glyphset, upm, asc, desc, name, height=88):
    """One glyph as an inline <svg>. No JS, no font load -- a crawler sees the shape."""
    pen = SVGPathPen(glyphset)
    glyphset[name].draw(pen)
    path = pen.getCommands()
    width = glyphset[name].width
    box_h = asc - desc
    scale = height / box_h
    return (f'<svg class="g" viewBox="0 0 {width} {box_h}" '
            f'width="{round(width * scale, 1)}" height="{height}" '
            f'role="img" aria-label="{esc(name)}">'
            f'<g transform="translate(0 {asc}) scale(1 -1)"><path d="{path}"/></g></svg>')


def outline_key(glyf, name):
    g = glyf[name]
    g.expand(glyf)
    co, end, _ = g.getCoordinates(glyf)
    return (tuple(map(tuple, co)), tuple(end))


def main():
    font = TTFont(FONT)
    subs = json.loads(SUBS.read_text())
    upm = font["head"].unitsPerEm
    asc, desc = font["hhea"].ascent, font["hhea"].descent

    # One neutral instance for drawing. Which variant a reader lands on is a threshold
    # question; what each variant looks like is not, so the shapes are drawn at one place
    # and the thresholds are stated as numbers.
    inst = instantiateVariableFont(
        font, {"GEOM": 50, "opsz": 16, "wght": 400, "YTAS": 720, "SHRP": 0, "ital": 0},
        inplace=False)
    gset, glyf = inst.getGlyphSet(), inst["glyf"]
    order = set(inst.getGlyphOrder())

    # Which cv/ss reaches each form statically. Matched on outlines, not on names: the
    # feature glyphs are separate outlines that happen to coincide, and only the font can
    # say which ones.
    twin = {}
    for coll in (subs["stylisticSets"], subs["charVariants"]):
        for ft in coll:
            for base, tgt in ft["subs"].items():
                if "." in base or tgt not in order or base not in order:
                    continue
                twin.setdefault((base, outline_key(glyf, tgt)), []).append(ft["tag"])

    rows = []
    for grp in subs["geomGroups"]:
        head, thr = grp["headline"], grp["thresholds"]
        cells = []
        for i, v in enumerate(grp["variants"]):
            name = head if v["suffix"] is None else f"{head}.{v['suffix']}"
            if name not in order:
                continue
            lo = 0 if i == 0 else thr[i - 1]
            hi = 100 if i == len(grp["variants"]) - 1 else thr[i]
            tags = twin.get((head, outline_key(glyf, name)), [])
            static = (" &middot; ".join(f"<code>{t}</code>" for t in sorted(tags))
                      if tags else "<span class=axisonly>axis only</span>")
            cells.append(
                f'<div class="cell">{glyph_svg(gset, upm, asc, desc, name)}'
                f'<div class="vlabel">{esc(v["label"])}</div>'
                f'<div class="range">GEOM {lo}&ndash;{hi}</div>'
                f'<div class="twin">{static}</div>'
                f'<div class="gname"><code>{esc(name)}</code></div></div>')
        anchor = f"g-{ord(head):04x}"
        rows.append(f"""<section class="row" id="{anchor}">
  <h2><span class="head">{esc(head)}</span>
      <a class="perma" href="#{anchor}" aria-label="Link to the {esc(head)} row">#</a></h2>
  <p class="rowsum">{esc(head)} has {len(cells)} forms on GEOM, switching at
     {esc(' and '.join(str(t) for t in thr))}.</p>
  <div class="cells">{''.join(cells)}</div>
</section>""")

    # Six presets sit on GEOM 25 and three on 50, so they are grouped by value and stacked.
    # One label per preset laid out independently just overprints into a smear.
    by_value = {}
    for name, g in presets():
        by_value.setdefault(g, []).append(name)
    marks = []
    for g, names in sorted(by_value.items()):
        stack = "".join(f"<span>{esc(n)}</span>" for n in sorted(names))
        marks.append(f'<div class="mark" style="left:{g}%">'
                     f'<span class="dot"></span>'
                     f'<span class="mlabel"><em>{g}</em>{stack}</span></div>')
    bands = "".join(
        f'<div class="band" style="left:{a}%;width:{b - a}%;--z:{c}">'
        f'<span>{esc(n)}</span></div>' for n, a, b, c in ZONES)

    html = f"""<!doctype html>
<html lang="en"><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>The GEOM axis, glyph by glyph &mdash; ReCal Sans</title>
<meta name="description" content="Every letterform Cal Sans swaps along its GEOM axis, with
the exact value each swap fires at, the static cv/ss equivalent, and where each ReCal preset
parks. Free and open source under the OFL.">
<link rel="canonical" href="{ORIGIN}{BASE}/geom/">
<style>
:root{{--bg:#0f0f0f;--ink:#e8e8e8;--dim:#8a8a8a;--line:#262626;--acid:#d8d63f}}
*{{box-sizing:border-box}}
body{{margin:0;background:var(--bg);color:var(--ink);
  font:16px/1.6 ui-sans-serif,system-ui,sans-serif;-webkit-font-smoothing:antialiased}}
.wrap{{max-width:900px;margin:0 auto;padding:48px 24px 96px}}
a{{color:var(--ink)}}
h1{{font-size:34px;line-height:1.2;margin:0 0 16px;text-wrap:balance}}
.lede{{font-size:18px;color:#c4c4c4;margin:0 0 8px}}
.crumb{{font-size:14px;color:var(--dim);margin:0 0 28px}}
.ruler{{position:relative;height:34px;margin:40px 0 8px;border-radius:6px;overflow:hidden;
  background:#151515;border:1px solid var(--line)}}
.band{{position:absolute;top:0;bottom:0;background:color-mix(in srgb,var(--z) 16%,transparent)}}
.band span{{position:absolute;left:6px;top:6px;font-size:11px;letter-spacing:.14em;
  text-transform:uppercase;color:var(--z)}}
.marks{{position:relative;height:132px;margin-bottom:26px}}
.mark{{position:absolute;top:0;transform:translateX(-50%)}}
.mark:first-child{{transform:none}}
.mark:last-child{{transform:translateX(-100%)}}
.dot{{display:block;width:9px;height:9px;border-radius:50%;background:var(--acid);
  margin:0 auto}}
.mlabel{{display:block;margin-top:8px;font-size:12px;color:var(--dim);text-align:center;
  white-space:nowrap}}
.mlabel em{{display:block;font-style:normal;color:var(--acid);
  font-variant-numeric:tabular-nums;margin-bottom:3px}}
.mlabel span{{display:block}}
.row{{border-top:1px solid var(--line);padding:26px 0 8px}}
h2{{font-size:15px;margin:0 0 4px;color:var(--dim);font-weight:400}}
h2 .head{{color:var(--ink);font-size:19px;font-family:ui-monospace,SFMono-Regular,Menlo,
  monospace}}
.perma{{color:#3a3a3a;text-decoration:none;margin-left:8px}}
.rowsum{{margin:0 0 18px;font-size:14px;color:var(--dim)}}
.cells{{display:flex;flex-wrap:wrap;gap:28px}}
.cell{{min-width:118px}}
svg.g{{display:block;fill:var(--ink)}}
.vlabel{{margin-top:10px;font-size:13px}}
.range,.twin,.gname{{font-size:12px;color:var(--dim)}}
code{{font:12px/1.4 ui-monospace,SFMono-Regular,Menlo,monospace;color:#b9b76a}}
.axisonly{{color:#5a5a5a}}
footer{{margin-top:56px;padding-top:24px;border-top:1px solid var(--line);
  font-size:14px;color:var(--dim)}}
@media(prefers-color-scheme:light){{
  :root{{--bg:#fff;--ink:#141414;--dim:#666;--line:#e6e6e6;--acid:#8a8817}}
  .ruler{{background:#fafafa}} code{{color:#6a6800}} .axisonly{{color:#aaa}}
}}
</style></head>
<body><div class="wrap">
<nav class="crumb"><a href="{ORIGIN}/">WORDMARK</a> &rsaquo;
  <a href="{BASE}/">ReCal Sans</a> &rsaquo; the GEOM axis</nav>

<h1>The GEOM axis, glyph by glyph</h1>
<p class="lede">Cal Sans redraws {len(subs['geomGroups'])} letters as one axis moves. This is
every one of them, the value each swap fires at, and the static <code>cv</code>/<code>ss</code>
feature that reaches the same form when you cannot move an axis.</p>
<p class="lede">The presets below are parked positions, not the product. ReCal exists so you
can put GEOM wherever you want, move the switching points yourself, and download a static
font with your decisions baked in.</p>

<div class="ruler">{bands}</div>
<div class="marks">{''.join(marks)}</div>

{''.join(rows)}

<footer>Generated from <code>CalSansVF.ttf</code> and its own FeatureVariations, so this page
cannot disagree with the font that ships. Free under the OFL &mdash;
<a href="{BASE}/">open the customizer</a>.</footer>
</div></body></html>
"""
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(html)
    print(f"[geom] {OUT.relative_to(ROOT)} — {len(rows)} glyph rows, "
          f"{len(presets())} preset marks, {len(html) // 1024}KB")


if __name__ == "__main__":
    main()

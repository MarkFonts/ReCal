#!/usr/bin/env python3
"""Render static compare-specimen SVGs from the commercial reference OTFs in ref/.

The four no-webfont referents (Gotham, GT America, Circular, Neutraface) can't be
webfont-embedded, so their compare view shows a STATIC SVG of the pitch text rendered
from real outlines. CI can't do this (ref/*.otf is gitignored) — run locally and commit
public/compare/<slug>.svg. Pitch text is parsed from seo-presets.mjs so it stays in sync.

Design notes:
- Full 6-decimal precision in every coordinate; no minify, no rounding to ints.
- fill="currentColor" so the inlined SVG inherits the page's --text (theme-aware).
- Greedy word-wrap using real glyph advances; kerning is skipped (fine for a specimen).

Regenerate:  .venv/bin/python scripts/gen_compare_svg.py
"""
import os, re

from fontTools.ttLib import TTFont
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen

HERE = os.path.dirname(__file__)
REF = os.path.join(HERE, "..", "ref")
OUT = os.path.join(HERE, "..", "public", "compare")

WIDTH = 544.0        # px — the app's paragraph column (measure 34em @ 16px base)
H1_SIZE = 57.0       # matches DEFAULT_PARA_STYLES.h1
H1_LEADING = 1.1
BODY_SIZE = 18.0     # matches DEFAULT_PARA_STYLES.p
BODY_LEADING = 1.6
PARA_GAP = 20.0
TOP_PAD = 8.0
BOTTOM_PAD = 12.0

# slug -> (headline OTF, body OTF). Book/Regular for body, Bold for the headline.
FONTS = {
    "gotham":     ("Gotham Bold.otf",              "Gotham-Book.otf"),
    "gt-america": ("GTAmerica Bold.otf",           "GTAmerica Regular.otf"),
    "circular":   ("CircularStd-Bold.otf",         "CircularStd-Book.otf"),
    "neutra":     ("Neutraface2Display-Bold.otf",  "Neutra2Text-Book.otf"),
}


def parse_pitch(slug):
    """Pull the pitch title + paragraphs for a slug out of seo-presets.mjs."""
    src = open(os.path.join(HERE, "seo-presets.mjs"), encoding="utf-8").read()
    i = src.find("slug: '%s'" % slug)
    block = src[i:i + 4000]
    title = re.search(r"pitch:\s*\{\s*title:\s*'([^']+)'", block).group(1)
    paras_blk = re.search(r"paragraphs:\s*\[(.*?)\]", block, re.S).group(1)
    paras = re.findall(r"'([^']+)'", paras_blk)
    return title, paras


def ntos(v):
    return "%.6f" % v          # 6 decimals everywhere — we hate minify


def load(name):
    f = TTFont(os.path.join(REF, name))
    return f.getBestCmap(), f.getGlyphSet(), f["head"].unitsPerEm


def glyph_and_adv(cmap, gs, ch):
    gn = cmap.get(ord(ch))
    if gn is None:
        return None, None
    g = gs[gn]
    return g, g.width


def text_width(cmap, gs, upm, text, size):
    scale = size / upm
    _, space_adv = glyph_and_adv(cmap, gs, " ")
    space_adv = space_adv if space_adv else upm * 0.3
    w = 0.0
    for ch in text:
        _, adv = glyph_and_adv(cmap, gs, ch)
        w += (adv if adv is not None else space_adv) * scale
    return w


def wrap(cmap, gs, upm, text, size, maxw):
    lines, cur = [], ""
    for word in text.split(" "):
        trial = word if not cur else cur + " " + word
        if not cur or text_width(cmap, gs, upm, trial, size) <= maxw:
            cur = trial
        else:
            lines.append(cur)
            cur = word
    if cur:
        lines.append(cur)
    return lines


def render_line(cmap, gs, upm, text, size, baseline, paths):
    scale = size / upm
    _, space_adv = glyph_and_adv(cmap, gs, " ")
    space_adv = space_adv if space_adv else upm * 0.3
    x = 0.0
    for ch in text:
        g, adv = glyph_and_adv(cmap, gs, ch)
        if g is None:
            x += space_adv * scale
            continue
        pen = SVGPathPen(gs, ntos=ntos)
        # font units are y-up; flip to SVG y-down and place at (x, baseline)
        g.draw(TransformPen(pen, (scale, 0.0, 0.0, -scale, x, baseline)))
        d = pen.getCommands()
        if d:
            paths.append(d)
        x += adv * scale


def build(slug):
    title, body = parse_pitch(slug)
    bold, book = FONTS[slug]
    h_cmap, h_gs, h_upm = load(bold)
    b_cmap, b_gs, b_upm = load(book)

    paths, y = [], TOP_PAD
    for ln in wrap(h_cmap, h_gs, h_upm, title, H1_SIZE, WIDTH):
        y += H1_SIZE * H1_LEADING
        render_line(h_cmap, h_gs, h_upm, ln, H1_SIZE, y, paths)
    y += PARA_GAP
    for para in body:
        for ln in wrap(b_cmap, b_gs, b_upm, para, BODY_SIZE, WIDTH):
            y += BODY_SIZE * BODY_LEADING
            render_line(b_cmap, b_gs, b_upm, ln, BODY_SIZE, y, paths)
        y += PARA_GAP
    height = y + BOTTOM_PAD

    svg = ['<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 %s %s" '
           'fill="currentColor" role="img" aria-label="%s specimen">'
           % (ntos(WIDTH), ntos(height), title)]
    for d in paths:
        svg.append('  <path d="%s"/>' % d)
    svg.append("</svg>")
    svg = "\n".join(svg) + "\n"

    os.makedirs(OUT, exist_ok=True)
    with open(os.path.join(OUT, slug + ".svg"), "w", encoding="utf-8") as fp:
        fp.write(svg)
    print("wrote %-11s %3d paths  %6d bytes" % (slug, len(paths), len(svg)))


if __name__ == "__main__":
    for slug in FONTS:
        build(slug)

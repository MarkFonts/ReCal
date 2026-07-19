#!/usr/bin/env python3
"""Generate src/instrument/rcltSwaps.ts from CalSansVF's rclt FeatureVariations.

The Glyphs grid colours every cell whose glyph is a GEOM `rclt` swap — base glyphs
(five → five.rcltGeo) AND aalt-accessible compounds (five.numr → five.numr.rcltGeo).
This derives that map from the font itself instead of the hand-listed GROUP_DEFS, so
coverage is complete (~165 cells) and correct (stylistic-set alternates, which GEOM
does NOT drive, stay out).

Zone per swap is decided by the target's ONSET GEOM (which landing zone it turns on
in) — matching the designer's GROUP_DEFS assignments — not by the glyph-name suffix
(G.rcltGeo turns on at 40 = the Base zone, so it's Base, exactly like GROUP_DEFS).
opsz-gated conditions (the small-opsz A11y extensions) are excluded.

Run:  .venv/bin/python scripts/gen_rclt_swaps.py
"""
import os, re, json
from collections import defaultdict
from fontTools.ttLib import TTFont

PATH = next(p for p in ('public/fonts/CalSansVF.ttf', 'dist/fonts/CalSansVF.ttf') if os.path.exists(p))
OUT = 'src/instrument/rcltSwaps.ts'

f = TTFont(PATH)
fvar = f['fvar']; axes = [a.axisTag for a in fvar.axes]
gA = next(a for a in fvar.axes if a.axisTag == 'GEOM')
gi, oi = axes.index('GEOM'), axes.index('opsz')
gmin, gdef, gmax = gA.minValue, gA.defaultValue, gA.maxValue
den = lambda n: None if n is None else gdef + n * ((gdef - gmin) if n < 0 else (gmax - gdef))

gsub = f['GSUB'].table
def lookup_pairs(li):
    p = {}
    for st in gsub.LookupList.Lookup[li].SubTable:
        if hasattr(st, 'mapping'): p.update(st.mapping)
        elif hasattr(st, 'alternates'):
            for b, s in st.alternates.items(): p[b] = s[0]
    return p

# base glyph -> [(geom_lo, geom_hi, target)] for rclt targets, opsz-default only
swaps = defaultdict(list)
for rec in gsub.FeatureVariations.FeatureVariationRecord:
    geom, opsz_ok = None, True
    for c in rec.ConditionSet.ConditionTable:
        if getattr(c, 'Format', 1) != 1: continue
        if c.AxisIndex == gi: geom = (c.FilterRangeMinValue, c.FilterRangeMaxValue)
        elif c.AxisIndex == oi: opsz_ok = (c.FilterRangeMinValue <= 0 <= c.FilterRangeMaxValue)
    if geom is None or not opsz_ok: continue
    pairs = {}
    for sr in rec.FeatureTableSubstitution.SubstitutionRecord:
        for li in sr.Feature.LookupListIndex: pairs.update(lookup_pairs(li))
    for base, tgt in pairs.items():
        if re.search(r'\.rclt', tgt): swaps[base].append((den(geom[0]), den(geom[1]), tgt))

def bands(g):
    """→ (thresholds, zone-per-band string). Merge each target's sub-bands, zone by onset."""
    by_target = defaultdict(lambda: [1e9, -1e9])
    for lo, hi, t in swaps[g]:
        by_target[t][0] = min(by_target[t][0], lo); by_target[t][1] = max(by_target[t][1], hi)
    za = [None] * 101
    for (lo, hi) in by_target.values():
        zc = 'A' if lo < 15 else ('B' if lo < 55 else 'G')
        for x in range(int(round(lo)), int(round(hi)) + 1):
            if 0 <= x <= 100: za[x] = zc
    thr, zon, cur = [], [za[0] or '-'], za[0]
    for x in range(1, 101):
        if za[x] != cur: thr.append(x); zon.append(za[x] or '-'); cur = za[x]
    return thr, ''.join(zon)

FONT = {g: bands(g) for g in swaps}

cmap = f.getBestCmap()
aalt_lk = {li for fr in gsub.FeatureList.FeatureRecord if fr.FeatureTag == 'aalt'
           for li in fr.Feature.LookupListIndex}
alts = defaultdict(list)
for li in aalt_lk:
    for st in gsub.LookupList.Lookup[li].SubTable:
        if hasattr(st, 'alternates'):
            for b, s in st.alternates.items(): alts[b] = s

grid = {}
for cp, base in cmap.items():
    for aalt, gname in [(0, base)] + [(i, a) for i, a in enumerate(alts.get(base, []), 1)]:
        if gname in FONT:
            t, z = FONT[gname]; grid[f'{cp}:{aalt}'] = {'t': t, 'z': z}

lines = [
    "// GENERATED from CalSansVF's rclt FeatureVariations (opsz-default conditions only).",
    "// Regenerate: .venv/bin/python scripts/gen_rclt_swaps.py",
    "// Key `cp:aaltIndex` (0 = base cmap glyph). t = GEOM thresholds; z = zone per band",
    "// (length t+1): A=A11y · B=Base · G=Geo · '-' = default (no colour).",
    "export type CellSwap = { t: number[]; z: string }",
    "export const GRID_SWAPS: Record<string, CellSwap> = {",
]
for k in sorted(grid, key=lambda s: (int(s.split(':')[0]), int(s.split(':')[1]))):
    v = grid[k]; lines.append(f'  "{k}": {{ t: {json.dumps(v["t"])}, z: "{v["z"]}" }},')
lines.append("}")
open(OUT, 'w').write("\n".join(lines) + "\n")
print(f"wrote {OUT}: {len(grid)} cells from {len(FONT)} source glyphs")

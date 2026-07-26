#!/usr/bin/env python3
"""Generate the CANONICAL substitution table from CalSansVF's GSUB.

This is the single source of truth for glyph substitution (VISION §7). Everything
else — GROUP_DEFS (Matrix + flash), GRID_SWAPS (glyph grid), the worker's rebuild
maps, the stylistic-set freezer, and the future fontmake/Glyphs build formats — is a
projection of this one table. Derived from the font itself, so it can't drift.

Emits:
  src/data/substitutions.json  — the canonical data (checked in; the app imports it)
  src/data/substitutions.ts    — types + typed re-export

Covers:
  · geomGroups     GEOM rclt swaps, grouped by headline glyph (ordered variants,
                   font-derived thresholds, and every member glyph with its cp:aalt)
  · stylisticSets  ssXX — the MANUAL override for the same forms GEOM drives; each
                   with its font name, base→variant subs, linked family, and whether
                   it also remaps GEOM forms (overridesGeom)
  · charVariants   cvXX — per-character variants (same shape as ss)

Run:  .venv/bin/python scripts/gen_substitutions.py
"""
import os, re, json, unicodedata
from collections import defaultdict
from fontTools.ttLib import TTFont

PATH = next(p for p in ('public/fonts/CalSansVF.ttf', 'dist/fonts/CalSansVF.ttf') if os.path.exists(p))
OUT_JSON = 'src/data/substitutions.json'
OUT_TS = 'src/data/substitutions.ts'

# Zone palette + landing bands are a design choice (not in the font). Kept here as the
# ONE place they're defined; GROUP_DEFS/LANDING_ZONES will import these.
ZONES = [
    {'label': 'A11Y', 'suffix': 'rcltA11y', 'char': 'A', 'color': '#c97050', 'start': 0,  'end': 10,  'sampleGeom': 3},
    {'label': 'UI',   'suffix': None,       'char': 'U', 'color': '#999999', 'start': 15, 'end': 30,  'sampleGeom': 22},
    {'label': 'Base', 'suffix': 'rcltBase', 'char': 'B', 'color': '#4a7fd4', 'start': 40, 'end': 60,  'sampleGeom': 50},
    {'label': 'Geo',  'suffix': 'rcltGeo',  'char': 'G', 'color': '#4aad5c', 'start': 80, 'end': 100, 'sampleGeom': 90},
]
# zone-string char (from the GEOM extractor) → variant label + suffix. '-' = master.
CHAR_TO_VARIANT = {
    'A': ('A11Y', 'rcltA11y'),
    'B': ('Base', 'rcltBase'),
    'G': ('Geo', 'rcltGeo'),
    '-': ('default', None),
}

# Irreducible hand-authored inputs: glyph names GSUB can't decode to a headline char,
# and ligatures that follow a headline. (Documented; the only non-font input.)
_NAME = {'IJ': 'I', 'ij': 'I', 'lslash': 'l', 'ldot': 'l', 'tbar': 't',
         'Mcommaaccent': 'M', 'uni006A0301': 'j', 'uni0237': 'j'}
_LIG = {'fi': 'f', 'fl': 'f', 'f_f_i': 'f', 'f_f_l': 'f', 'f_t': 'f'}

f = TTFont(PATH)
fvar = f['fvar']
axes = [a.axisTag for a in fvar.axes]
gA = next(a for a in fvar.axes if a.axisTag == 'GEOM')
gi, oi = axes.index('GEOM'), axes.index('opsz')
gmin, gdef, gmax = gA.minValue, gA.defaultValue, gA.maxValue
den = lambda n: None if n is None else gdef + n * ((gdef - gmin) if n < 0 else (gmax - gdef))

gsub = f['GSUB'].table
FL = gsub.FeatureList.FeatureRecord
LL = gsub.LookupList.Lookup
cmap = f.getBestCmap()
rev = {}
for cp, gn in cmap.items():
    rev.setdefault(gn, cp)
name = f['name']


def nm(nid):
    r = name.getName(nid, 3, 1, 0x409) or name.getName(nid, 1, 0, 0)
    return r.toUnicode() if r else None


def lookup_pairs(li):
    p = {}
    for st in LL[li].SubTable:
        if hasattr(st, 'mapping'):
            p.update(st.mapping)
        elif hasattr(st, 'alternates'):
            for b, s in st.alternates.items():
                p[b] = s[0]
    return p


# ── GEOM swaps (rclt FeatureVariations, opsz-default conditions only) ──────────────
swaps = defaultdict(list)
if getattr(gsub, 'FeatureVariations', None):
    for rec in gsub.FeatureVariations.FeatureVariationRecord:
        geom, opsz_ok = None, True
        for c in rec.ConditionSet.ConditionTable:
            if getattr(c, 'Format', 1) != 1:
                continue
            if c.AxisIndex == gi:
                geom = (c.FilterRangeMinValue, c.FilterRangeMaxValue)
            elif c.AxisIndex == oi:
                opsz_ok = (c.FilterRangeMinValue <= 0 <= c.FilterRangeMaxValue)
        if geom is None or not opsz_ok:
            continue
        pairs = {}
        for sr in rec.FeatureTableSubstitution.SubstitutionRecord:
            for li in sr.Feature.LookupListIndex:
                pairs.update(lookup_pairs(li))
        for base, tgt in pairs.items():
            if re.search(r'\.rclt', tgt):
                swaps[base].append((den(geom[0]), den(geom[1]), tgt))


def bands(g):
    """→ (thresholds, zone-per-band string), zone by each target's onset GEOM."""
    by_target = defaultdict(lambda: [1e9, -1e9])
    for lo, hi, t in swaps[g]:
        by_target[t][0] = min(by_target[t][0], lo)
        by_target[t][1] = max(by_target[t][1], hi)
    za = [None] * 101
    for lo, hi in by_target.values():
        zc = 'A' if lo < 15 else ('B' if lo < 55 else 'G')
        for x in range(int(round(lo)), int(round(hi)) + 1):
            if 0 <= x <= 100:
                za[x] = zc
    thr, zon, cur = [], [za[0] or '-'], za[0]
    for x in range(1, 101):
        if za[x] != cur:
            thr.append(x)
            zon.append(za[x] or '-')
            cur = za[x]
    return thr, ''.join(zon)


FONT = {g: bands(g) for g in swaps}

# headline reps: the ASCII letterform families that GEOM-swaps (I l a G g f j t y u
# C c M 0 1 5). Non-ASCII swappers (ª æ µ ﬁ superscripts fractions €…) are MEMBERS
# that fold into these via headline(), not groups of their own.
rep_chars = {chr(rev[g]) for g in FONT
             if rev.get(g) is not None and chr(rev[g]).isascii() and chr(rev[g]).isalnum()}


def headline(base):
    """Fold a swapping glyph to its rep letterform, or None (kept as an ungrouped cell)."""
    core = base.split('.')[0]
    if core in _NAME:
        return _NAME[core]
    for pre, h in _NAME.items():
        if core.startswith(pre):
            return h
    if core in _LIG:
        return _LIG[core]
    cp = rev.get(core)
    if cp is None:
        return None
    ch = chr(cp)
    if ch in rep_chars:
        return ch
    for norm in (unicodedata.normalize('NFD', ch), unicodedata.normalize('NFKD', ch)):
        for c in norm:                    # first rep char in the decomposition
            if c in rep_chars:
                return c
    return None


# aalt order, for the flat cp:aalt cell keys (0 = base cmap glyph)
alts = defaultdict(list)
for fr in FL:
    if fr.FeatureTag == 'aalt':
        for li in fr.Feature.LookupListIndex:
            for st in LL[li].SubTable:
                if hasattr(st, 'alternates'):
                    for b, s in st.alternates.items():
                        alts[b] = s


def variant_seq(zonestr):
    out = []
    for c in zonestr:
        label, suffix = CHAR_TO_VARIANT[c]
        out.append({'label': label, 'suffix': suffix, 'zone': None if c == '-' else
                    next(z['label'] for z in ZONES if z['char'] == c)})
    return out


# geomGroups: the 16 rep letterforms — the Matrix lanes / GROUP_DEFS. Ordered by the
# shape-grouped lane order the Matrix has always shown (a design choice, kept here).
ORDER = ['I', 'l', 'a', 'G', 'g', 'f', 'j', 't', 'y', 'u', 'C', 'c', 'M', '0', '1', '5']
geom_groups = []
for ch in sorted(rep_chars, key=lambda c: ORDER.index(c) if c in ORDER else 99):
    thr, zonestr = FONT[cmap[ord(ch)]]
    geom_groups.append({
        'headline': ch, 'cp': ord(ch),
        'thresholds': thr, 'variants': variant_seq(zonestr),
    })

# geomCells: every swapping cmap cell (cp:aalt) — the glyph-grid coloring source and
# the font-derived flash set. Each carries its own thresholds/zones + its rep (or null).
geom_cells = []
for cp, base in cmap.items():
    for aalt, gname in [(0, base)] + [(i, a) for i, a in enumerate(alts.get(base, []), 1)]:
        if gname in FONT:
            thr, zonestr = FONT[gname]
            geom_cells.append({'cp': cp, 'aalt': aalt, 'name': gname,
                               'thresholds': thr, 'zones': zonestr, 'headline': headline(gname)})
geom_cells.sort(key=lambda c: (c['cp'], c['aalt']))


# ── Stylistic sets + character variants ───────────────────────────────────────────
def feature_table(prefix):
    out = []
    for fr in FL:
        tag = fr.FeatureTag
        if not (tag.startswith(prefix) and tag[2:].isdigit()):
            continue
        subs = {}
        for li in fr.Feature.LookupListIndex:
            subs.update(lookup_pairs(li))
        fam = sorted({headline(b) for b in subs if headline(b)})
        label = None
        fp = getattr(fr.Feature, 'FeatureParams', None)
        if fp is not None:
            uid = getattr(fp, 'UINameID', None) or getattr(fp, 'FeatUILabelNameID', None)
            if uid:
                label = nm(uid)
        out.append({
            'tag': tag,
            'name': label,
            'families': fam,
            'overridesGeom': any('.rclt' in b for b in subs),
            'subs': dict(sorted(subs.items())),
        })
    return sorted(out, key=lambda x: x['tag'])


stylistic_sets = feature_table('ss')
char_variants = feature_table('cv')

canon = {
    '_generated': 'from CalSansVF.ttf GSUB — regenerate: .venv/bin/python scripts/gen_substitutions.py',
    'axis': {'tag': 'GEOM', 'min': gmin, 'default': gdef, 'max': gmax},
    'zones': ZONES,
    'geomGroups': geom_groups,
    'geomCells': geom_cells,
    'stylisticSets': stylistic_sets,
    'charVariants': char_variants,
}

os.makedirs('src/data', exist_ok=True)
with open(OUT_JSON, 'w') as fp:
    json.dump(canon, fp, indent=2, ensure_ascii=False)
    fp.write('\n')

TS = '''// GENERATED — do not edit. Source: scripts/gen_substitutions.py (reads CalSansVF GSUB).
// The canonical substitution table (VISION §7). Everything derives from this.
import data from './substitutions.json'

export type Variant = { label: string; suffix: string | null; zone: string | null }
export type GeomGroup = { headline: string; cp: number; thresholds: number[]; variants: Variant[] }
export type GeomCell = { cp: number; aalt: number; name: string; thresholds: number[]; zones: string; headline: string | null }
export type FeatureSet = { tag: string; name: string | null; families: string[]; overridesGeom: boolean; subs: Record<string, string> }
export type Zone = { label: string; suffix: string | null; char: string; color: string; start: number; end: number; sampleGeom: number }
export type Substitutions = {
  axis: { tag: string; min: number; default: number; max: number }
  zones: Zone[]
  geomGroups: GeomGroup[]
  geomCells: GeomCell[]
  stylisticSets: FeatureSet[]
  charVariants: FeatureSet[]
}
export const SUBS = data as unknown as Substitutions
'''
with open(OUT_TS, 'w') as fp:
    fp.write(TS)

# ── Drift report: canonical (font) vs the current hand-authored GROUP_DEFS ─────────
CURRENT = {  # from src/GlyphGroups.tsx, for comparison only
    'I': [11], 'l': [11], 'a': [13, 34], 'G': [40], 'g': [16], 'f': [39, 76],
    'j': [39, 74], 't': [39, 74], 'y': [39, 59], 'u': [59], 'C': [79], 'c': [79],
    'M': [79], '0': [79], '1': [79], '5': [79],
}
canon_thr = {g['headline']: g['thresholds'] for g in geom_groups}
grouped = sum(1 for c in geom_cells if c['headline'])
print(f'wrote {OUT_JSON}  ({len(geom_groups)} geom groups, {len(geom_cells)} cells '
      f'[{grouped} grouped], {len(stylistic_sets)} ss, {len(char_variants)} cv)')
print('\n=== DRIFT: current GROUP_DEFS thresholds vs font-derived canonical ===')
drift = 0
for g in sorted(set(CURRENT) | set(canon_thr)):
    cur, can = CURRENT.get(g), canon_thr.get(g)
    flag = '' if cur == can else '   <-- DIFFERS'
    if cur != can:
        drift += 1
    print(f'  {g!r:>4}: current {str(cur):<12} font {str(can):<12}{flag}')
print(f'\n{drift} group(s) differ — the font is authoritative; each is a decision.')

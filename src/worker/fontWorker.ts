/// <reference lib="webworker" />

export type AxisInfo = { tag: string; name: string; min: number; default: number; max: number }

type MainToWorker =
  | { type: 'loadFont'; fontBytes: ArrayBuffer }
  | { type: 'applyConfig'; configJson: string }
  | { type: 'previewFont'; thresholdsJson: string }
  | { type: 'measureWords'; wordsJson: string; geomValuesJson: string; axisDefaultsJson: string }

type WorkerToMain =
  | { type: 'status'; message: string }
  | { type: 'ready' }
  | { type: 'axisInfo'; axisInfoJson: string }
  | { type: 'fontResult'; ttf: ArrayBuffer }
  | { type: 'previewFontResult'; ttf: ArrayBuffer }
  | { type: 'measureWordsResult'; dataJson: string }
  | { type: 'error'; message: string }

function post(msg: WorkerToMain, transfer?: Transferable[]) {
  self.postMessage(msg, transfer ?? [])
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let pyodide: any = null

async function init() {
  post({ type: 'status', message: 'Loading Python runtime...' })

  // @ts-ignore — CDN import, no types at compile time
  const { loadPyodide } = await import(/* @vite-ignore */ 'https://cdn.jsdelivr.net/pyodide/v0.26.4/full/pyodide.mjs')

  pyodide = await loadPyodide({
    indexURL: 'https://cdn.jsdelivr.net/pyodide/v0.26.4/full/',
  })

  post({ type: 'status', message: 'Loading fontTools...' })
  await pyodide.loadPackage('fonttools')

  post({ type: 'ready' })
}

self.onmessage = async (e: MessageEvent<MainToWorker>) => {
  const msg = e.data
  try {
    if (msg.type === 'loadFont') {
      const fontUint8 = new Uint8Array(msg.fontBytes)
      pyodide.globals.set('_font_bytes_js', fontUint8)

      // Store _font_data + define helpers as Python globals; return fvar axis info
      const axisInfoJson: string = await pyodide.runPythonAsync(`
import io, json
from fontTools.ttLib import TTFont

_font_data = bytes(_font_bytes_js.to_py())
buf = io.BytesIO(_font_data)
_font_cache = TTFont(buf)

def _set_recal_names(font, family='ReCal Sans'):
    nt = font['name']
    ps = family.replace(' ', '')
    for nameID, value in [(1, family), (2, 'Regular'), (4, family), (6, ps), (16, family), (17, 'Regular')]:
        nt.setName(value, nameID, 3, 1, 0x0409)

# Variant order per headline glyph (font's actual rclt suffixes). 'f' reverts to
# the master above its upper threshold (default · Base · default).
_GV = {
    'I': ['rcltA11y', 'default'], 'l': ['rcltA11y', 'default'],
    'a': ['rcltA11y', 'default', 'rcltBase'], 'G': ['default', 'rcltGeo'],
    'g': ['rcltA11y', 'default'], 'f': ['default', 'rcltBase', 'default'],
    'j': ['default', 'rcltBase', 'rcltGeo'], 't': ['default', 'rcltBase', 'rcltGeo'],
    'y': ['default', 'rcltBase', 'rcltGeo'], 'u': ['default', 'rcltGeo'],
    'C': ['default', 'rcltGeo'], 'c': ['default', 'rcltGeo'], 'M': ['default', 'rcltGeo'],
    '0': ['default', 'rcltGeo'], '1': ['default', 'rcltGeo'],
}
_SUF = {'rcltA11y', 'rcltBase', 'rcltGeo'}
_NAME = {'IJ': 'I', 'ij': 'I', 'lslash': 'l', 'ldot': 'l', 'tbar': 't',
         'Mcommaaccent': 'M', 'uni006A0301': 'j', 'uni0237': 'j'}
_LIG = {'fi': 'f', 'fl': 'f', 'f_f_i': 'f', 'f_f_l': 'f', 'f_t': 'f'}

# Rebuild GSUB FeatureVariations from a user threshold map (GEOM userspace 0-100).
# Each band gets ONE fresh SingleSubst lookup containing exactly the glyphs active
# in that band (incl. accented siblings) — no shared-lookup carryover. This both
# fixes the live preview and is reused by the download path so they match.
def _rebuild_fv(font, thresh):
    import unicodedata
    from fontTools.ttLib.tables import otTables as ot
    gvars = font['fvar'].axes
    ga = next((a for a in gvars if a.axisTag == 'GEOM'), None)
    if not ga:
        return
    gmin, gdef, gmax = ga.minValue, ga.defaultValue, ga.maxValue
    gi = [a.axisTag for a in gvars].index('GEOM')
    def u2n(v):
        v = min(max(float(v), gmin), gmax)
        d = (gdef - gmin) if v <= gdef else (gmax - gdef)
        return (v - gdef) / d if d else 0.0
    gsub = font['GSUB'].table
    LK = gsub.LookupList.Lookup
    rev = {}
    for cp, gn in (font.getBestCmap() or {}).items():
        rev.setdefault(gn, cp)
    # collect base -> variant glyph name, per suffix, across all existing lookups
    sub_map = {s: {} for s in _SUF}
    for lk in LK:
        for st in lk.SubTable:
            for b, v in (getattr(st, 'mapping', {}) or {}).items():
                if '.' in v and v.rsplit('.', 1)[1] in _SUF:
                    sub_map[v.rsplit('.', 1)[1]][b] = v
    gvk = set(_GV)
    def headline(b):
        core = b.split('.')[0]
        if core in _NAME:
            return _NAME[core]
        for pre, h in _NAME.items():
            if core.startswith(pre):
                return h
        if core in _LIG:
            return _LIG[core]
        cp = rev.get(core)
        if cp is not None:
            ch = chr(cp)
            if ch in gvk: return ch
            base = unicodedata.normalize('NFD', ch)[0]
            if base in gvk: return base
        return None
    # group every variant base glyph under its headline
    groups = {}
    for s in _SUF:
        for b in sub_map[s]:
            h = headline(b)
            if h:
                groups.setdefault(h, set()).add(b)
    def variant_at(h, geom):
        ts = thresh.get(h, [])
        vi = min(sum(1 for t in ts if geom >= float(t)), len(_GV[h]) - 1)
        return _GV[h][vi]
    all_t = sorted({float(x) for ts in thresh.values() for x in ts})
    bounds = [0.0] + all_t + [100.0]
    segs = [(bounds[i], bounds[i + 1]) for i in range(len(bounds) - 1)]
    rclt = [i for i, r in enumerate(gsub.FeatureList.FeatureRecord) if r.FeatureTag == 'rclt']
    if not rclt or not segs:
        return
    gsub.Version = 0x00010001
    fv = ot.FeatureVariations()
    fv.Version = 0x00010000
    fv.FeatureVariationRecord = []
    for lo, hi in segs:
        mid = (lo + hi) / 2.0
        mapping = {}
        for h in _GV:
            suf = variant_at(h, mid)
            if suf == 'default':
                continue
            for b in groups.get(h, ()):  # active glyphs only; inactive omitted
                if b in sub_map[suf]:
                    mapping[b] = sub_map[suf][b]
        sub = ot.SingleSubst()
        sub.mapping = mapping
        nlk = ot.Lookup()
        nlk.LookupType = 1
        nlk.LookupFlag = 0
        nlk.SubTable = [sub]
        nlk.SubTableCount = 1
        LK.append(nlk)
        idx = len(LK) - 1
        rec = ot.FeatureVariationRecord()
        cs = ot.ConditionSet()
        cs.ConditionTable = []
        cond = ot.ConditionTable()
        cond.Format = 1
        cond.AxisIndex = gi
        cond.FilterRangeMinValue = u2n(lo)
        cond.FilterRangeMaxValue = u2n(hi)
        cs.ConditionTable.append(cond)
        rec.ConditionSet = cs
        fts = ot.FeatureTableSubstitution()
        fts.Version = 0x00010000
        fts.SubstitutionRecord = []
        for ri in rclt:
            sr = ot.FeatureTableSubstitutionRecord()
            sr.FeatureIndex = ri
            alt = ot.Feature()
            alt.FeatureParams = None
            alt.LookupListIndex = [idx]
            sr.Feature = alt
            fts.SubstitutionRecord.append(sr)
        rec.FeatureTableSubstitution = fts
        fv.FeatureVariationRecord.append(rec)
    gsub.LookupList.LookupCount = len(LK)
    gsub.FeatureVariations = fv

axes_out = []
for axis in _font_cache['fvar'].axes:
    name = _font_cache['name'].getDebugName(axis.axisNameID) or axis.axisTag
    axes_out.append({
        'tag': axis.axisTag,
        'name': name,
        'min': float(axis.minValue),
        'default': float(axis.defaultValue),
        'max': float(axis.maxValue),
    })

json.dumps(axes_out)
`)

      post({ type: 'axisInfo', axisInfoJson })

    } else if (msg.type === 'previewFont') {
      pyodide.globals.set('_thresholds_json', msg.thresholdsJson)
      const ttfPy = await pyodide.runPythonAsync(`
import io, json
from fontTools.ttLib import TTFont

def _do_preview():
    thresh = json.loads(_thresholds_json)
    fnt = TTFont(io.BytesIO(_font_data))
    _rebuild_fv(fnt, thresh)
    out = io.BytesIO(); fnt.save(out); return out.getvalue()

_do_preview()
`)
      const ttfBytes: Uint8Array = ttfPy.toJs()
      post(
        { type: 'previewFontResult', ttf: ttfBytes.buffer as ArrayBuffer },
        [ttfBytes.buffer as ArrayBuffer]
      )

    } else if (msg.type === 'measureWords') {
      pyodide.globals.set('_mw_words_json', msg.wordsJson)
      pyodide.globals.set('_mw_geoms_json', msg.geomValuesJson)
      pyodide.globals.set('_mw_axis_defaults_json', msg.axisDefaultsJson)

      const dataJson: string = await pyodide.runPythonAsync(`
import io, json
from fontTools.ttLib import TTFont

def _measure_words():
    words = json.loads(_mw_words_json)
    geom_values = json.loads(_mw_geoms_json)
    axis_defaults = json.loads(_mw_axis_defaults_json)
    fnt = TTFont(io.BytesIO(_font_data))

    cmap = fnt.getBestCmap() or {}
    upm = fnt['head'].unitsPerEm

    ga = next((a for a in fnt['fvar'].axes if a.axisTag == 'GEOM'), None)
    if not ga:
        return json.dumps({'upm': upm, 'widths': {}})
    gmin, gdef, gmax = ga.minValue, ga.defaultValue, ga.maxValue
    gi = next(i for i, a in enumerate(fnt['fvar'].axes) if a.axisTag == 'GEOM')

    def u2n(v):
        v = min(max(float(v), gmin), gmax)
        d = (gdef - gmin) if v <= gdef else (gmax - gdef)
        return (v - gdef) / d if d else 0.0

    # Build non-GEOM location from current user defaults for weight-accurate advances
    base_loc = {}
    for a in fnt['fvar'].axes:
        if a.axisTag == 'GEOM':
            continue
        val = float(axis_defaults.get(a.axisTag, a.defaultValue))
        base_loc[a.axisTag] = min(max(val, a.minValue), a.maxValue)

    # One glyphset at current weight/other axes — HVAR deltas applied by fontTools
    glyphset = fnt.getGlyphSet(location=base_loc, normalized=False)

    gsub = fnt.get('GSUB')
    fv = fnt.get('FeatureVariations')

    def get_subs(geom_norm):
        if not gsub or not fv:
            return {}
        subs = {}
        for rec in fv.FeatureVariationRecord:
            geom_conds = [c for c in rec.ConditionSet.ConditionTable if getattr(c, 'AxisIndex', None) == gi]
            if not geom_conds:
                continue
            if not all(c.FilterRangeMinValue <= geom_norm <= c.FilterRangeMaxValue for c in geom_conds):
                continue
            for sr in rec.FeatureTableSubstitution.SubstitutionRecord:
                for li in sr.Feature.LookupListIndex:
                    lk = gsub.table.LookupList.Lookup[li]
                    for sub in lk.SubTable:
                        if hasattr(sub, 'mapping'):
                            subs.update(sub.mapping)
        return subs

    def get_adv(glyph):
        try:
            return glyphset[glyph].width
        except Exception:
            return fnt['hmtx'].metrics.get(glyph, (0, 0))[0]

    def measure(word, subs):
        total = 0
        for ch in word:
            g = cmap.get(ord(ch))
            if g:
                total += get_adv(subs.get(g, g))
        return total

    widths = {}
    for geom in geom_values:
        norm = u2n(geom)
        subs = get_subs(norm)
        widths[str(geom)] = {w: measure(w, subs) for w in words}

    return json.dumps({'upm': upm, 'widths': widths})

_measure_words()
`)
      post({ type: 'measureWordsResult', dataJson })

    } else if (msg.type === 'applyConfig') {
      // Only called on download — no live debouncing
      pyodide.globals.set('_config_json', msg.configJson)

      const ttfPy = await pyodide.runPythonAsync(`
import io, json, logging
from fontTools.ttLib import TTFont
from fontTools.varLib.instancer import instantiateVariableFont

logging.disable(logging.WARNING)

config = json.loads(_config_json)
new_defaults = config['axisDefaults']      # excludes opsz
opsz_m = float(config.get('opszMultiplier', 1))
freeze_opsz = bool(config.get('freezeOpsz', False))
thresh = config.get('thresholds', {})

buf = io.BytesIO(_font_data)
font = TTFont(buf)

# Bake the user's glyph thresholds into FeatureVariations using the SAME rebuild
# as the live preview, BEFORE instancing — so the default shift re-normalizes
# the new conditions. This closes the "what you preview is what you get" gap.
if thresh:
    _rebuild_fv(font, thresh)

# Shift non-opsz axis defaults via instancer
axis_limits = {}
for axis in font['fvar'].axes:
    tag = axis.axisTag
    if tag == 'opsz':
        continue  # handled separately below
    nd = float(new_defaults.get(tag, axis.defaultValue))
    nd = min(max(nd, axis.minValue), axis.maxValue)
    axis_limits[tag] = (axis.minValue, nd, axis.maxValue)

result = instantiateVariableFont(font, axis_limits, inplace=True) if axis_limits else font

# opsz: either freeze to a fixed optical size (pin the axis, no variable opsz),
# or scale the axis by the multiplier. Scaling all user-space values preserves
# normalized ratios (gvar untouched), so CSS opsz=8 at x3 shows the design that
# was originally at opsz=24.
if freeze_opsz:
    oa = next((a for a in result['fvar'].axes if a.axisTag == 'opsz'), None)
    if oa is not None:
        instantiateVariableFont(result, {'opsz': oa.defaultValue}, inplace=True)
elif opsz_m != 1:
    for axis in result['fvar'].axes:
        if axis.axisTag == 'opsz':
            axis.minValue *= opsz_m
            axis.defaultValue *= opsz_m
            axis.maxValue *= opsz_m
    for instance in result['fvar'].instances:
        if 'opsz' in instance.coordinates:
            instance.coordinates['opsz'] *= opsz_m

_set_recal_names(result)
out = io.BytesIO()
result.save(out)
out.getvalue()
`)
      const ttfBytes: Uint8Array = ttfPy.toJs()
      post(
        { type: 'fontResult', ttf: ttfBytes.buffer as ArrayBuffer },
        [ttfBytes.buffer as ArrayBuffer]
      )
    }
  } catch (err) {
    post({ type: 'error', message: String(err) })
  }
}

init().catch((err) => {
  post({ type: 'error', message: `Worker init failed: ${err}` })
})

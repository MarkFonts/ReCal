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
    from fontTools.ttLib.tables import otTables as ot
    thresh = json.loads(_thresholds_json)
    fnt = TTFont(io.BytesIO(_font_data))
    ga = next((a for a in fnt['fvar'].axes if a.axisTag == 'GEOM'), None)
    if not ga:
        out = io.BytesIO(); fnt.save(out); return out.getvalue()
    gmin, gdef, gmax = ga.minValue, ga.defaultValue, ga.maxValue
    gi = next(i for i, a in enumerate(fnt['fvar'].axes) if a.axisTag == 'GEOM')
    def u2n(v):
        v = min(max(float(v), gmin), gmax)
        d = (gdef - gmin) if v <= gdef else (gmax - gdef)
        return (v - gdef) / d if d else 0.0
    gsub = fnt['GSUB']
    BASE = {'I', 'l', 'a', 'G', 'g', 'f', 'j', 't', 'y', 'u', 'C', 'c', 'M'}
    # Discover (glyph, variant_suffix) → first lookup index that provides that sub
    var_lk = {}
    for i, lk in enumerate(gsub.table.LookupList.Lookup):
        for sub in lk.SubTable:
            if not hasattr(sub, 'mapping'):
                continue
            for base, variant in sub.mapping.items():
                if base in BASE and '.' in variant:
                    key = (base, variant.rsplit('.', 1)[1])
                    if key not in var_lk:
                        var_lk[key] = i
    # Normalize suffix aliases so both CalSansVariable2 (rcltText/rcltA11Y)
    # and ReCalSans-Variable (rcltBase/rcltA11y) resolve correctly.
    for (g, suf), lk_idx in list(var_lk.items()):
        for old, new in [('rcltA11y','rcltA11Y'),('rcltBase','rcltText')]:
            if suf == old and (g, new) not in var_lk:
                var_lk[(g, new)] = lk_idx
    # Digit glyphs: font uses 'zero'/'one' as glyph names; we key on '0'/'1'.
    digit_chars = {'zero': '0', 'one': '1'}
    for i2, lk2 in enumerate(gsub.table.LookupList.Lookup):
        for sub2 in lk2.SubTable:
            if not hasattr(sub2, 'mapping'):
                continue
            for base2, variant2 in sub2.mapping.items():
                char = digit_chars.get(base2)
                if char and '.' in variant2:
                    key2 = (char, variant2.rsplit('.', 1)[1])
                    if key2 not in var_lk:
                        var_lk[key2] = i2
    # Variant order per glyph — must match GROUP_DEFS in GlyphGroups.tsx
    GV = {
        'I': ['rcltA11Y', 'default'],
        'l': ['rcltA11Y', 'default'],
        'a': ['rcltA11Y', 'default', 'rcltText'],
        'G': ['rcltUI', 'default'],
        'g': ['rcltA11Y', 'default'],
        'f': ['default', 'rcltText'],
        'j': ['default', 'rcltText', 'rcltGeo'],
        't': ['default', 'rcltText', 'rcltGeo'],
        'y': ['default', 'rcltText', 'rcltGeo'],
        'u': ['default', 'rcltGeo'],
        'C': ['default', 'rcltGeo'],
        'c': ['default', 'rcltGeo'],
        'M': ['default', 'rcltGeo'],
        '0': ['default', 'rcltGeo'],
        '1': ['default', 'rcltGeo'],
    }
    def lks_at(geom):
        seen, result = set(), []
        for glyph, variants in GV.items():
            ts = thresh.get(glyph, [])
            vi = min(sum(1 for t in ts if geom >= float(t)), len(variants) - 1)
            suf = variants[vi]
            if suf == 'default':
                continue
            key = (glyph, suf)
            if key in var_lk and var_lk[key] not in seen:
                seen.add(var_lk[key])
                result.append(var_lk[key])
        return sorted(result)
    # Find ALL rclt feature indices (FeatureList can have one per script/language)
    rclt_indices = [
        i for i, r in enumerate(gsub.table.FeatureList.FeatureRecord) if r.FeatureTag == 'rclt'
    ]
    if not rclt_indices:
        out = io.BytesIO(); fnt.save(out); return out.getvalue()
    # Compute GEOM segments from the union of all user threshold values
    all_t = sorted(set(float(v) for ts in thresh.values() for v in ts))
    bounds = [0.0] + all_t + [100.0]
    segs = [(bounds[i], bounds[i + 1]) for i in range(len(bounds) - 1)]
    # Build FeatureVariations table
    gsub.table.Version = 0x00010001
    fv_tbl = ot.FeatureVariations()
    fv_tbl.Version = 0x00010000
    fv_tbl.FeatureVariationRecord = []
    for lo, hi in segs:
        mid = (lo + hi) / 2.0
        lks = lks_at(mid)
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
        for rclt_idx in rclt_indices:
            sr = ot.FeatureTableSubstitutionRecord()
            sr.FeatureIndex = rclt_idx
            alt = ot.Feature()
            alt.FeatureParams = None
            alt.LookupListIndex = lks
            sr.Feature = alt
            fts.SubstitutionRecord.append(sr)
        rec.FeatureTableSubstitution = fts
        fv_tbl.FeatureVariationRecord.append(rec)
    gsub.table.FeatureVariations = fv_tbl
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

buf = io.BytesIO(_font_data)
font = TTFont(buf)

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

# Scale opsz fvar axis and instance coordinates by 1/multiplier.
# Dividing all user-space values preserves normalized ratios (gvar untouched),
# so CSS opsz=8 with x3 shows the design that was originally at opsz=24.
if opsz_m != 1:
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

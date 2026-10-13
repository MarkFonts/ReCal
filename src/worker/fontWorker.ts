/// <reference lib="webworker" />

export type AxisInfo = { tag: string; name: string; min: number; default: number; max: number }

type MainToWorker =
  | { type: 'loadFont'; fontBytes: ArrayBuffer }
  | { type: 'loadFlexAvar'; fontBytes: ArrayBuffer }
  | { type: 'applyConfig'; configJson: string; id: number }
  | { type: 'previewFont'; thresholdsJson: string; autoAscender?: boolean; opszMultiplier?: number; freezeOpsz?: boolean; frozenOpszValue?: number | null }
  | { type: 'measureWords'; wordsJson: string; geomValuesJson: string; axisDefaultsJson: string }

type WorkerToMain =
  | { type: 'status'; message: string }
  | { type: 'ready' }
  | { type: 'axisInfo'; axisInfoJson: string }
  | { type: 'fontResult'; ttf: ArrayBuffer; kind: 'ttf' | 'zip'; id: number }   // zip = statics export
  | { type: 'progress'; message: string }
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

# Drop the avar2 axis-to-axis VarStore (Flex's YTAS<-opsz auto-ascender) and
# unhide YTAS. avar1 segment maps are preserved; no-op on avar v1 fonts.
def _strip_avar2(font):
    av = font.get('avar')
    if av is not None and getattr(av, 'majorVersion', 1) >= 2:
        av.majorVersion = 1
        av.minorVersion = 0
    for a in font['fvar'].axes:
        if a.axisTag == 'YTAS':
            a.flags &= ~0x0001

# Graft Flex's cached avar2 store (opsz->YTAS) onto any font (CalSansVF or Flex),
# keeping the font's own v1 segment maps, and hide YTAS. Both fonts share axis
# order so the store's deltas/indices stay valid. No-op until Flex's store is
# cached (loadFlexAvar) — and must run AFTER instancer (which can't touch avar2).
def _graft_avar2(font):
    from fontTools.ttLib.tables import otTables as ot
    store = globals().get('_FLEX_AVAR_STORE')
    if store is None:
        return
    av = font.get('avar')
    if av is None:
        return
    av.majorVersion = 2
    av.minorVersion = 0
    if getattr(av, 'table', None) is None:
        av.table = ot.avar()
    av.table.VarStore = store
    av.table.VarIdxMap = globals().get('_FLEX_AVAR_MAP')
    av.table.Reserved = 0
    for a in font['fvar'].axes:
        if a.axisTag == 'YTAS':
            a.flags |= 0x0001

# Variant order per headline glyph (font's actual rclt suffixes). 'f' reverts to
# the master above its upper threshold (default · Base · default).
_GV = {
    'I': ['rcltA11y', 'default'], 'l': ['rcltA11y', 'default'],
    'a': ['rcltA11y', 'default', 'rcltBase'], 'G': ['default', 'rcltGeo'],
    'g': ['rcltA11y', 'default'], 'f': ['default', 'rcltBase', 'default'],
    'j': ['default', 'rcltBase', 'rcltGeo'], 't': ['default', 'rcltBase', 'rcltGeo'],
    'y': ['default', 'rcltBase', 'rcltGeo'], 'u': ['default', 'rcltGeo'],
    'C': ['default', 'rcltGeo'], 'c': ['default', 'rcltGeo'], 'M': ['default', 'rcltGeo'],
    '0': ['default', 'rcltGeo'], '1': ['default', 'rcltGeo'], '5': ['default', 'rcltGeo'],
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

# ── Feature freezer ──────────────────────────────────────────────────────────────
# "Freeze" a SingleSubst OpenType feature (ssXX/cvXX/tnum/zero/case/…) by fusing the
# form it produces into the default cmap, so the exported font shows it with no
# font-feature-settings. Replicates the browser exactly: apply rclt (at the baked GEOM
# default) THEN each frozen feature in order to each codepoint's glyph — the same
# composition font-feature-settings does live, so what you preview is what you bake.
# Only SingleSubst lookups fuse (glyph→glyph); ligature/contextual features are a no-op
# here and aren't offered in the UI.

# The base→variant map the GEOM rclt substitution yields at a given GEOM (userspace),
# read straight back out of the FeatureVariations _rebuild_fv just built.
def _rclt_map_at(font, geom):
    gsub = font.get('GSUB')
    if gsub is None:
        return {}
    gt = gsub.table
    fv = getattr(gt, 'FeatureVariations', None)
    axes = font['fvar'].axes
    ga = next((a for a in axes if a.axisTag == 'GEOM'), None)
    if fv is None or ga is None:
        return {}
    gi = [a.axisTag for a in axes].index('GEOM')
    gmin, gdef, gmax = ga.minValue, ga.defaultValue, ga.maxValue
    v = min(max(float(geom), gmin), gmax)
    d = (gdef - gmin) if v <= gdef else (gmax - gdef)
    gn = (v - gdef) / d if d else 0.0
    for rec in fv.FeatureVariationRecord:
        conds = [c for c in rec.ConditionSet.ConditionTable if getattr(c, 'AxisIndex', None) == gi]
        if conds and all(c.FilterRangeMinValue <= gn <= c.FilterRangeMaxValue for c in conds):
            m = {}
            for sr in rec.FeatureTableSubstitution.SubstitutionRecord:
                for li in sr.Feature.LookupListIndex:
                    lk = gt.LookupList.Lookup[li]
                    for st in lk.SubTable:
                        m.update(getattr(st, 'mapping', {}) or {})
            return m
    return {}

# Every SingleSubst base→variant pair a feature tag drives (across all its lookups).
def _feature_map(font, tag):
    gsub = font.get('GSUB')
    if gsub is None:
        return {}
    gt = gsub.table
    lset = []
    for fr in gt.FeatureList.FeatureRecord:
        if fr.FeatureTag == tag:
            for li in fr.Feature.LookupListIndex:
                if li not in lset:
                    lset.append(li)
    m = {}
    for li in lset:
        lk = gt.LookupList.Lookup[li]
        for st in lk.SubTable:
            m.update(getattr(st, 'mapping', {}) or {})
    return m

def _freeze_features(font, tags, geom):
    tags = [t for t in (tags or [])]
    if not tags:
        return
    rmap = _rclt_map_at(font, geom)
    fmaps = [(t, _feature_map(font, t)) for t in tags]
    best = font.getBestCmap() or {}
    remap = {}
    for cp, g in best.items():
        rclt_form = rmap.get(g, g)        # what GEOM's rclt yields at the baked default
        cur = rclt_form
        for _t, fm in fmaps:              # rclt first, then each feature in order (ssXX, …)
            cur = fm.get(cur, cur)
        if cur != rclt_form:
            # ss-style: the feature's subs carry rclt-suffixed keys (a.rcltA11y → a.ss01),
            # so composing onto the rclt form works directly. Bake that glyph.
            remap[cp] = cur
        else:
            # zero/tnum-style: the feature maps only the base glyph (zero → zero.zero, no
            # rclt-suffixed keys), so rclt-first no-ops at a non-default GEOM. Apply the
            # feature to the base and remap to THAT — rclt keeps driving it (cmap 0 →
            # zero.zero, and rclt still yields zero.zero.rcltGeo in the Geo zone), so the
            # frozen glyph stays GEOM-live instead of silently not freezing.
            base = g
            for _t, fm in fmaps:
                base = fm.get(base, base)
            if base != g:
                remap[cp] = base
        # else: no frozen feature touches this glyph — leave it for GEOM to drive live.
    if not remap:
        return
    for tbl in font['cmap'].tables:
        if not tbl.isUnicode():
            continue
        for cp, ng in remap.items():
            if cp in tbl.cmap:
                tbl.cmap[cp] = ng

# ── Static instances ─────────────────────────────────────────────────────────────
# Optional "statics" export: wght 400/500/600/700 (x roman/italic when the font has an
# ital axis), each a fully-instanced non-variable TTF cut from the processed font.
_STATIC_WEIGHTS = [(400, 'Regular'), (500, 'Medium'), (600, 'SemiBold'), (700, 'Bold')]

# Legacy four-style naming, extended in _set_recal_names' style. Regular and Bold share
# the plain family in nameID 1; Medium/SemiBold get their own nameID-1 family
# ("<family> Medium") with subfamily Regular/Italic so Word-style menus still resolve.
# 16/17 always carry the typographic family + full style name.
def _set_static_names(font, family, wght, wname, italic, version):
    nt = font['name']
    for n in list(nt.names):
        if n.nameID in (16, 17, 21, 22, 25) or n.nameID >= 256:
            nt.removeNames(nameID=n.nameID)
    typo_style = wname if not italic else ('Italic' if wname == 'Regular' else wname + ' Italic')
    legacy_fam = family if wname in ('Regular', 'Bold') else family + ' ' + wname
    legacy_sub = ('Bold' if wname == 'Bold' else 'Regular')
    if italic:
        legacy_sub = 'Bold Italic' if wname == 'Bold' else 'Italic'
    ps = family.replace(' ', '') + '-' + typo_style.replace(' ', '')
    for nameID, value in [(1, legacy_fam), (2, legacy_sub), (3, '%s;%s' % (version, ps)),
                          (4, family + ' ' + typo_style), (6, ps), (16, family), (17, typo_style)]:
        nt.setName(value, nameID, 3, 1, 0x0409)
    os2 = font['OS/2']
    os2.usWeightClass = int(wght)
    fs = os2.fsSelection & ~((1 << 0) | (1 << 5) | (1 << 6))     # keep USE_TYPO_METRICS (bit 7) etc.
    if italic:
        fs |= 1 << 0
    if wname == 'Bold':
        fs |= 1 << 5
    if not italic and wname != 'Bold':
        fs |= 1 << 6
    os2.fsSelection = fs
    font['head'].macStyle = (1 if wname == 'Bold' else 0) | (2 if italic else 0)
    return ps

# Slant (degrees, post.italicAngle sign: negative = leaning right) read off the longest
# near-vertical edge of "I" — the instancer leaves post.italicAngle at 0 (no MVAR entry).
def _measure_italic_angle(font):
    import math
    from fontTools.pens.recordingPen import RecordingPen
    try:
        cmap = font.getBestCmap()
        gn = cmap.get(ord('I')) or cmap.get(ord('H'))
        pen = RecordingPen()
        font.getGlyphSet()[gn].draw(pen)
        contours, cur = [], []
        for op, args in pen.value:
            if op in ('moveTo', 'lineTo'):
                if op == 'moveTo' and cur:
                    contours.append(cur); cur = []
                cur.append(args[0])
        if cur:
            contours.append(cur)
        best, best_len = None, 0.0
        for c in contours:
            for (x0, y0), (x1, y1) in zip(c, c[1:] + c[:1]):
                dx, dy = x1 - x0, y1 - y0
                if abs(dy) > abs(dx) and math.hypot(dx, dy) > best_len:
                    best_len = math.hypot(dx, dy)
                    if dy < 0:
                        dx, dy = -dx, -dy
                    best = -math.degrees(math.atan2(dx, dy))
        return None if best is None else round(best, 2)
    except Exception:
        return None

# Pin EVERY axis of the processed font for a static cut: wght/ital per style, opsz to the
# frozen value (else the axis default), everything else (GEOM, YTAS, SHRP…) to the user's
# shifted default. Each cut re-loads the snapshot bytes, so cuts can't contaminate each
# other or the variable font.
def _build_static(snapshot, family, wght, wname, italic, freeze_opsz, frozen_opsz, auto_ascender, version):
    f = TTFont(io.BytesIO(snapshot))
    pins = {}
    for a in f['fvar'].axes:
        t = a.axisTag
        if t == 'wght':
            v = float(wght)
        elif t == 'ital':
            v = 1.0 if italic else 0.0
        elif t == 'opsz' and freeze_opsz and auto_ascender:
            # Freeze is disabled under auto ascender, so the variable font still carries
            # opsz. Cal Sans's avar2 only maps YTAS from opsz across 8–14 and nothing at
            # >=14, so pinning opsz >= 14 with YTAS at its default is exact. A frozen
            # value below 14 would change YTAS in the VF — fall back to 14 (the default).
            v = float(frozen_opsz) if frozen_opsz is not None and float(frozen_opsz) >= 14 else a.defaultValue
        else:
            v = a.defaultValue
        pins[t] = min(max(float(v), a.minValue), a.maxValue)
    # only some builds list ital; a roman-only source just gets the roman set (see caller)
    f = instantiateVariableFont(f, pins, inplace=True)
    for tag in ('STAT', 'fvar', 'avar', 'gvar', 'HVAR', 'MVAR', 'VVAR'):
        if tag in f:
            del f[tag]
    ps = _set_static_names(f, family, wght, wname, italic, version)
    if italic:
        ang = _measure_italic_angle(f)
        if ang is not None:
            import math
            f['post'].italicAngle = ang
            f['hhea'].caretSlopeRise = 1000
            f['hhea'].caretSlopeRun = int(round(-1000 * math.tan(math.radians(ang))))
    out = io.BytesIO(); f.save(out)
    return ps + '.ttf', out.getvalue()

def _build_statics_zip(snapshot, vf_bytes, family, freeze_opsz, frozen_opsz, auto_ascender, progress=None):
    import zipfile
    probe = TTFont(io.BytesIO(snapshot))
    has_ital = any(a.axisTag == 'ital' for a in probe['fvar'].axes)
    version = '%.3f' % probe['head'].fontRevision
    del probe
    ps_fam = family.replace(' ', '')
    jobs = [(w, n, it) for it in ([False, True] if has_ital else [False]) for (w, n) in _STATIC_WEIGHTS]
    zbuf = io.BytesIO()
    with zipfile.ZipFile(zbuf, 'w', zipfile.ZIP_DEFLATED) as z:
        z.writestr(ps_fam + '-Variable.ttf', vf_bytes)
        for i, (w, n, it) in enumerate(jobs):
            if progress:
                progress('Static %d/%d: %s' % (i + 1, len(jobs), n + (' Italic' if it else '')))
            fname, data = _build_static(snapshot, family, w, n, it, freeze_opsz, frozen_opsz, auto_ascender, version)
            z.writestr(fname, data)
    return zbuf.getvalue()

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

    } else if (msg.type === 'loadFlexAvar') {
      // Cache CalSansFlexVF's avar2 store so Auto Ascender can graft it onto any
      // active font (independent of HOI). Both fonts share axis order.
      const flexUint8 = new Uint8Array(msg.fontBytes)
      pyodide.globals.set('_flex_bytes_js', flexUint8)
      await pyodide.runPythonAsync(`
import io as _io
from fontTools.ttLib import TTFont as _TTFont
_flex_font = _TTFont(_io.BytesIO(bytes(_flex_bytes_js.to_py())))
_fav = _flex_font.get('avar')
if _fav is not None and getattr(_fav, 'majorVersion', 1) >= 2:
    _FLEX_AVAR_STORE = _fav.table.VarStore
    _FLEX_AVAR_MAP = _fav.table.VarIdxMap
`)

    } else if (msg.type === 'previewFont') {
      pyodide.globals.set('_thresholds_json', msg.thresholdsJson)
      pyodide.globals.set('_auto_ascender', !!msg.autoAscender)
      pyodide.globals.set('_opsz_mult', Number(msg.opszMultiplier ?? 1))
      pyodide.globals.set('_freeze_opsz', !!msg.freezeOpsz)
      pyodide.globals.set('_frozen_opsz', msg.frozenOpszValue == null ? null : Number(msg.frozenOpszValue))
      const ttfPy = await pyodide.runPythonAsync(`
import io, json
from fontTools.ttLib import TTFont
from fontTools.varLib.instancer import instantiateVariableFont

def _do_preview():
    thresh = json.loads(_thresholds_json)
    fnt = TTFont(io.BytesIO(_font_data))
    _rebuild_fv(fnt, thresh)
    _strip_avar2(fnt)   # instancer can't partial-instance avar2; re-graft below if needed
    # opsz: rescale the axis by the multiplier so font-optical-sizing:auto remaps to
    # point size in the preview EXACTLY as the export does (axis defaults stay stock —
    # the instrument applies those live via CSS font-variation-settings).
    opsz_m = float(_opsz_mult)
    # opsz FREEZE is NOT baked in the preview anymore — the specimen applies it live via
    # CSS ('opsz' N + font-optical-sizing:none), which the browser interpolates for free.
    # The ~5s instancer + gvar re-save it caused only ever mattered for the static
    # download. Only the cheap SCALER relabel stays here (optical-sizing:auto maps size).
    if opsz_m != 1:
        for axis in fnt['fvar'].axes:
            if axis.axisTag == 'opsz':
                axis.minValue *= opsz_m; axis.defaultValue *= opsz_m; axis.maxValue *= opsz_m
        for inst in fnt['fvar'].instances:
            if 'opsz' in inst.coordinates:
                inst.coordinates['opsz'] *= opsz_m
    if _auto_ascender:
        _graft_avar2(fnt)   # opsz->YTAS auto-ascender (works on VF or Flex)
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
      pyodide.globals.set('_bake_progress', (m: string) => post({ type: 'progress', message: String(m) }))

      const ttfPy = await pyodide.runPythonAsync(`
import io, json, logging, time
from fontTools.ttLib import TTFont
from fontTools.varLib.instancer import instantiateVariableFont

logging.disable(logging.WARNING)

config = json.loads(_config_json)
new_defaults = config['axisDefaults']      # excludes opsz
opsz_m = float(config.get('opszMultiplier', 1))
freeze_opsz = bool(config.get('freezeOpsz', False))
frozen_opsz = config.get('frozenOpszValue', None)   # opsz to pin to when frozen
auto_ascender = bool(config.get('autoAscender', False))
thresh = config.get('thresholds', {})

_t0 = time.perf_counter()
buf = io.BytesIO(_font_data)
font = TTFont(buf)
_t_parse = time.perf_counter()

# Bake the user's glyph thresholds into FeatureVariations using the same rebuild
# as the live preview, BEFORE instancing — so the default shift re-normalizes
# the new conditions. This closes the "what you preview is what you get" gap.
if thresh:
    _rebuild_fv(font, thresh)
_t_fv = time.perf_counter()

# Fuse any frozen features into the default cmap (before instancing — cmap is
# axis-independent). Uses the baked GEOM default to pick the rclt form each feature
# composes onto, so preview and export agree at that GEOM.
frozen_features = config.get('frozenFeatures', [])
if frozen_features:
    _freeze_features(font, frozen_features, float(new_defaults.get('GEOM', 25)))
_t_freeze = time.perf_counter()

# instancer can't partial-instance an avar2 table, so always strip first; auto
# ascender re-grafts Flex's avar2 store at the very end (opsz/YTAS aren't shifted,
# so its deltas stay valid).
_strip_avar2(font)

# Shift non-opsz axis defaults via instancer — but only for axes that actually move.
# instantiateVariableFont is ~expensive (seconds in Pyodide) even when the "shift" is a
# no-op, so a preset like Circular (GEOM 25 = the stock default) was paying a full
# instancer pass to change nothing. Skip any axis whose new default equals its current.
axis_limits = {}
for axis in font['fvar'].axes:
    tag = axis.axisTag
    if tag == 'opsz':
        continue  # handled separately below
    nd = float(new_defaults.get(tag, axis.defaultValue))
    nd = min(max(nd, axis.minValue), axis.maxValue)
    if nd != axis.defaultValue:
        axis_limits[tag] = (axis.minValue, nd, axis.maxValue)

result = instantiateVariableFont(font, axis_limits, inplace=True) if axis_limits else font
_t_shift = time.perf_counter()

# opsz: freeze to a fixed optical size (pin the axis), or scale by the multiplier.
# Scaling all user-space values preserves normalized ratios. Freeze is skipped when
# auto-ascender is on (the grafted avar2 needs the opsz axis to remain).
if freeze_opsz and not auto_ascender:
    oa = next((a for a in result['fvar'].axes if a.axisTag == 'opsz'), None)
    if oa is not None:
        fv = oa.defaultValue if frozen_opsz is None else float(frozen_opsz)
        fv = min(max(fv, oa.minValue), oa.maxValue)
        instantiateVariableFont(result, {'opsz': fv}, inplace=True)
elif opsz_m != 1:
    for axis in result['fvar'].axes:
        if axis.axisTag == 'opsz':
            axis.minValue *= opsz_m
            axis.defaultValue *= opsz_m
            axis.maxValue *= opsz_m
    for instance in result['fvar'].instances:
        if 'opsz' in instance.coordinates:
            instance.coordinates['opsz'] *= opsz_m
_t_inst = time.perf_counter()

# Vertical metrics → OS/2 (typo asc/desc/gap, win asc/desc, USE_TYPO bit) + hhea
# (asc/desc/gap). Metrics are global, so this is safe after instancing. The WORDMARK
# default equals the shipped values, so a default config writes them back unchanged.
vm = config.get('vmetrics')
if vm:
    _os2 = result['OS/2']
    _hh = result['hhea']
    _os2.sTypoAscender = int(vm['typo']['asc'])
    _os2.sTypoDescender = int(vm['typo']['desc'])
    _os2.sTypoLineGap = int(vm['typo']['gap'])
    _os2.usWinAscent = int(vm['win']['asc'])
    _os2.usWinDescent = int(vm['win']['desc'])
    _hh.ascent = int(vm['hhea']['asc'])
    _hh.descent = int(vm['hhea']['desc'])
    _hh.lineGap = int(vm['hhea']['gap'])
    if vm['useTypo']:
        _os2.fsSelection |= (1 << 7)          # USE_TYPO_METRICS
    else:
        _os2.fsSelection &= ~(1 << 7)

# Statics are cut from the font as it stands HERE — defaults shifted, features frozen,
# vmetrics written — but BEFORE the avar2 graft, so they carry no avar2 at all.
statics = bool(config.get('statics', False))
if statics:
    _static_snapshot = io.BytesIO(); result.save(_static_snapshot)
    _static_snapshot = _static_snapshot.getvalue()

# Auto Ascender → graft Flex's avar2 (opsz->YTAS) onto the result + hide YTAS.
# (After the vmetrics write — they touch disjoint tables, so the VF is byte-identical
# to the old order.)
if auto_ascender:
    _graft_avar2(result)

# The VF keeps the stock 'ReCal Sans' name unless statics are on, where it must share
# the cuts' family so the zip installs as one family.
family = (config.get('familyName') or 'ReCal Sans').strip() or 'ReCal Sans'
if statics:
    _set_recal_names(result, family)
else:
    _set_recal_names(result)
out = io.BytesIO()
result.save(out)
_t_save = time.perf_counter()

_bake_kind = 'ttf'
_bake_bytes = out.getvalue()
if statics:
    _bake_bytes = _build_statics_zip(_static_snapshot, _bake_bytes, family, freeze_opsz,
                                     frozen_opsz, auto_ascender,
                                     globals().get('_bake_progress'))
    _bake_kind = 'zip'
_t_statics = time.perf_counter()

_ms = lambda a, b: round(1000 * (b - a))
_bake_timing = (
    "[bake] parse=%dms rebuild_fv=%dms freeze=%dms axis_shift=%dms opsz=%dms snapshot+save=%dms statics=%dms | total=%dms"
    % (_ms(_t0, _t_parse), _ms(_t_parse, _t_fv), _ms(_t_fv, _t_freeze),
       _ms(_t_freeze, _t_shift), _ms(_t_shift, _t_inst), _ms(_t_inst, _t_save), _ms(_t_save, _t_statics),
       _ms(_t0, _t_statics))
)
_bake_bytes
`)
      const ttfBytes: Uint8Array = ttfPy.toJs()
      const kind: 'ttf' | 'zip' = pyodide.globals.get('_bake_kind') === 'zip' ? 'zip' : 'ttf'
      try { post({ type: 'status', message: String(pyodide.globals.get('_bake_timing') ?? '') }) } catch { /* best-effort */ }
      post(
        { type: 'fontResult', ttf: ttfBytes.buffer as ArrayBuffer, kind, id: msg.id },
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

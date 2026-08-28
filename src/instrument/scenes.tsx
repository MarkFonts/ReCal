// Phase 4 — canvas scenes + the modebar. Content types only. Scene-specific
// controls (feature chips, measure, body pairings) live in the bottom play bar and
// are passed in as props; scenes here only read them. Everything renders through
// effective() (renderVarSettings) — one engine. Models ported from font-proofer.
import './scenes.css'
import { ZONE_COLOR_SHORT } from '../zoneColors'
import { useState, useEffect, useLayoutEffect, useMemo, useCallback, useRef, lazy, Suspense, Fragment, type CSSProperties, type ReactNode, type KeyboardEvent } from 'react'
import { useInstrument } from './InstrumentProvider'
import { placeCaretAtStart, placeCaretAtEnd, placeCaretAtOffset, caretCharOffset, splitInlineMarkup, isPlainRun, EditableTextBlock, GlyphPicker, measureGlyphMetrics, FittedParagraph, fitOptionsFor, PARA_STYLE_DEFAULTS, PARA_STYLE_ORDER, PARA_STYLE_LABEL, loadSpecimen, specimenChunks, SpecimenNav, type ParaStyleBase, type ParaStyleKey, type FitOptions, type GlyphPickerGroup, type GlyphPickerMetrics, type GlyphCellState } from '../../shared/index' // wm-primitives
import { effectiveAxes, effectiveThresholds } from './store'
import { renderVarSettings, opszForSize, opszCss, compareStyle } from './render'
import { GLYPH_SETS, GLYPH_SET_KEYS, parseCmapRanges, isSupported, allGlyphsWithAlternates, type CmapRanges, type GlyphCell } from './glyphset'
import { GROUP_DEFS } from '../GlyphGroups'
import { GRID_SWAPS } from './rcltSwaps'
import { SUBS } from '../data/substitutions'
import { BOOT, type CompareSpec } from './boot'
import { effectiveLineHeightEm, capShiftEm } from './vmetrics'

export type SceneMode = 'words' | 'paragraph' | 'scale' | 'glyphs' | 'ui'
export const SCENES: { mode: SceneMode; label: string }[] = [
  { mode: 'words', label: 'Words' },
  { mode: 'paragraph', label: 'Paragraph' },
  { mode: 'scale', label: 'Scale' },
  { mode: 'glyphs', label: 'Glyphs' },
  { mode: 'ui', label: 'UI' },
]

// INFO sits in the tab row (content type), but toggles the right-side opaque overlay
// rather than replacing the content scene.
export function Modebar({ mode, setMode, showInfo, toggleInfo }: {
  mode: SceneMode; setMode: (m: SceneMode) => void
  showInfo: boolean; toggleInfo: () => void
}) {
  return (
    <div className="modebar">
      {SCENES.map(s => (
        <button key={s.mode} data-label={s.label} className={`mode-btn${mode === s.mode ? ' on' : ''}`}
          onClick={() => setMode(s.mode)}>{s.label}</button>
      ))}
      <button data-label="Info" className={`mode-btn${showInfo ? ' on' : ''}`}
        aria-pressed={showInfo} onClick={toggleInfo}>Info</button>
    </div>
  )
}

// Persistent per-scene control bar — lives in the canvas above the stage (not in
// the scroll area, so it never covers scene content). Only some scenes have controls.
export function SceneControls({ mode, source, setSource, pairs, togglePair, glyphSet, setGlyphSet }: {
  mode: SceneMode
  source: string; setSource: (s: string) => void
  pairs: Set<string>; togglePair: (k: string) => void
  glyphSet: string; setGlyphSet: (k: string) => void
}) {
  if (mode === 'glyphs') return (
    <div className="scene-bar">
      <div className="text-tabs">
        {GLYPH_SET_KEYS.map(k => (
          <button key={k} data-label={k} className={`text-tab${glyphSet === k ? ' on' : ''}`} onClick={() => setGlyphSet(k)}>{k}</button>
        ))}
      </div>
    </div>
  )
  if (mode === 'paragraph') return (
    <div className="scene-bar">
      <div className="text-tabs">
        {TEXT_SOURCES.map(k => (
          <button key={k} data-label={k} className={`text-tab${source === k ? ' on' : ''}`} onClick={() => setSource(k)}>{k}</button>
        ))}
      </div>
    </div>
  )
  if (mode === 'scale') return (
    <div className="scene-bar">
      <div className="body-pairing">
        <span className="drawer-label">Body pairing</span>
        <div className="feature-chips">
          {BODY_TIERS.map(t => (
            <button key={t.key} data-label={t.key} className={`chip${pairs.has(t.key) ? ' on' : ''}`} onClick={() => togglePair(t.key)}>{t.key}</button>
          ))}
        </div>
      </div>
    </div>
  )
  if (mode === 'ui') return (
    <div className="scene-bar">
      <span className="ui-credit">
        These are <a className="ui-credit-link" href="https://coss.com/ui" target="_blank" rel="noreferrer">COSS ui</a>
        {' '}— accessible React components on Base UI + Tailwind by <a className="ui-credit-link" href="https://github.com/pasqualevitiello" target="_blank" rel="noreferrer">Pasquale Vitiello</a>, adopted across Cal.com — rendered here in Cal Sans
      </span>
    </div>
  )
  return null
}

// TEXT_SOURCES is declared after TEXT_PRESETS below; forward use is fine (const hoist
// at module eval — SceneControls only reads it at render time).
// ── Ported data ────────────────────────────────────────────────────────────────
// Editable per-block styles (ported from font-proofer's DEFAULT_PARA_STYLES). Each
// style carries size/leading/tracking + a weight (so H1 renders bold). opsz is auto
// per block (font-optical-sizing tracks the block's size).
/* The keys, labels and shared fields are wm-primitives' (src/paraStyles.ts) -- both
   paragraph views show the same four styles. What is this app's is the one field it
   draws with: a wght off the instrument. */
export type { ParaStyleKey } from '../../shared/index'
/* Shell imports the order and labels from here, where they have always been. */
export { PARA_STYLE_ORDER, PARA_STYLE_LABEL }
export type ParaStyle = ParaStyleBase & { wght: number }
export type ParaStyles = Record<ParaStyleKey, ParaStyle>
export const DEFAULT_PARA_STYLES: ParaStyles = {
  h1: { ...PARA_STYLE_DEFAULTS.h1, wght: 700 },
  h2: { ...PARA_STYLE_DEFAULTS.h2, wght: 400 },
  h3: { ...PARA_STYLE_DEFAULTS.h3, wght: 400 },
  p:  { ...PARA_STYLE_DEFAULTS.p,  wght: 400 },
}

type Block = { type: ParaStyleKey; text: string }
// Full text ported from font-proofer's TEXT_PRESETS.
// Works are specimens: one authored file each in wm-primitives, fetched in chunks, the
// same route in both apps. Compare is the exception and stays an array, because it is
// generated from BOOT for the landing pages rather than being a text anyone wrote.
const TEXT_PRESETS: Record<string, Block[] | { specimen: string }> = {
  Sample: { specimen: 'sample' },
  'A Tale of Two Cities': { specimen: 'tale-of-two-cities' },
  'Kern King': { specimen: 'kern-king' },
}

// Display tiers (font-proofer TAILWIND_XL), largest → smallest.
export const DISPLAY_TIERS = [
  { key: 'text-9xl', px: 128 }, { key: 'text-8xl', px: 96 }, { key: 'text-7xl', px: 72 },
  { key: 'text-6xl', px: 60 }, { key: 'text-5xl', px: 48 }, { key: 'text-4xl', px: 36 },
  { key: 'text-3xl', px: 30 }, { key: 'text-2xl', px: 24 }, { key: 'text-xl', px: 20 },
]
// Body tiers paired under each display head.
export const BODY_TIERS = [
  { key: 'text-lg', px: 18 }, { key: 'text-base', px: 16 }, { key: 'text-sm', px: 14 }, { key: 'text-xs', px: 12 },
]
// Every tier (largest → smallest) for the Scale style menu. Sizes are Tailwind-fixed;
// only tracking/leading (+ axes later) are per-tier editable.
export const SCALE_TIERS = [...DISPLAY_TIERS, ...BODY_TIERS]
export type ScaleTierStyle = { tracking: number; leading: number }
export type ScaleStyles = Record<string, ScaleTierStyle>
export const DEFAULT_SCALE_STYLES: ScaleStyles = Object.fromEntries(
  SCALE_TIERS.map(t => [t.key, { tracking: 0, leading: t.px >= 44 ? 1.05 : 1.4 }]),
)
const HEAD_WORD = 'Cal Sans'
const PAIR_BODY = 'A wonderful serenity has taken possession of my entire soul, like these sweet mornings of spring which I enjoy with my whole heart. I am alone, and feel the charm of existence in this spot, which was created for the bliss of souls like mine.'

// Curated OpenType feature chips from Cal Sans's real GSUB tags. The ss family is
// the manual override for the same variants GEOM drives automatically.
export const FEATURE_CHIPS: { tag: string; label: string }[] = [
  { tag: 'liga', label: 'Ligatures' },
  { tag: 'dlig', label: 'Discretionary ligatures' },
  { tag: 'case', label: 'Case-sensitive' },
  { tag: 'tnum', label: 'Tabular figures' },
  { tag: 'pnum', label: 'Proportional figures' },
  { tag: 'zero', label: 'Slashed zero' },
  { tag: 'frac', label: 'Fractions' },
  { tag: 'ordn', label: 'Ordinals' },
]

// Real stylistic-set names from CalSansVF's GSUB FeatureParams. Shown as compact
// ssNN tokens; the full name lives in title + aria-label. The ss family is the
// manual override for the same variants GEOM drives automatically.
export const SS_FEATURES: { tag: string; name: string }[] = [
  { tag: 'ss01', name: 'Geometric a' },
  { tag: 'ss02', name: 'Humanist a' },
  { tag: 'ss03', name: 'Tailed a' },
  { tag: 'ss04', name: 'Geometric g' },
  { tag: 'ss05', name: 'Gothic g' },
  { tag: 'ss06', name: 'Geometric G' },
  { tag: 'ss07', name: 'Humanist G' },
  { tag: 'ss08', name: 'Constructed j and y' },
  { tag: 'ss09', name: 'Humanist j and y' },
  { tag: 'ss10', name: 'Futura alternatives' },
  { tag: 'ss11', name: 'Futura alternatives and ligations' },
  { tag: 'ss12', name: 'Angular M' },
  { tag: 'ss13', name: 'Square M' },
  { tag: 'ss14', name: 'Constructed f and t' },
  { tag: 'ss15', name: 'Humanist f and t' },
  { tag: 'ss16', name: 'Humanist/Grotesk 6 and 9' },
  { tag: 'ss17', name: 'Geometric/legible 6 and 9' },
  { tag: 'ss18', name: 'A11Y I l a' },
  { tag: 'ss19', name: 'Constructed l' },
  { tag: 'ss20', name: 'Horizontal Sharps' },
]

// ── Scenes ──────────────────────────────────────────────────────────────────────
// SEO landing pages boot Paragraph with a referent-aware pitch as its own source tab.
if (BOOT.pitch) {
  TEXT_PRESETS.Compare = [
    { type: 'h1', text: BOOT.pitch.title },
    ...BOOT.pitch.paragraphs.map((t): Block => ({ type: 'p', text: t })),
  ]
}
export const TEXT_SOURCES = Object.keys(TEXT_PRESETS)

export type SceneProps = {
  size: number; ls: string; leading: number; featStr: string
  source: string; measure: number; pairs: Set<string>; glyphSet: string; opszAuto: boolean
  paraStyles: ParaStyles
  scaleStyles: ScaleStyles; selectedTiers: Set<string>
  /** Line fitting, from the Type panel. Paragraph only; other scenes ignore it. */
  fit?: Partial<FitOptions>
  /** Paragraph only: the tail's "next specimen" moves the source tab from inside the
   *  document, so a reader who has finished a work can leave without going back up. */
  setSource?: (s: string) => void
  /** UI scene only: the measured height of the canvas-bar + mode-row nav, which floats
   *  OVER the full-height board in that mode (see Shell.tsx) — tells UiKitBoard where
   *  row 0 should rest so it clears the nav on load, same as before the nav overlaid it. */
  topInset?: number
}

// When opsz-auto is on, omit opsz from the settings and set font-optical-sizing:auto
// so the browser tracks opsz to each element's rendered size (per font-proofer).
const optical = (auto: boolean): 'auto' | 'none' => (auto ? 'auto' : 'none')

// Which variant a glyph shows at a given GEOM = how many of its swap thresholds
// GEOM has passed (matches the non-HOI font's rclt band edges in GROUP_DEFS).
const variantIndex = (geom: number, thresholds: number[]): number =>
  thresholds.reduce((n, t) => n + (geom >= t ? 1 : 0), 0)

const SWAP_GLYPHS = new Set(GROUP_DEFS.map(d => d.glyph))

// Resolve a character to its swap GROUP key (the GROUP_DEFS representative), so
// diacritic composites flash with their base group: à→a, ç→c, Ç→C, ª→a. Composites
// share their base's `rclt` condition, so they inherit its thresholds/zone/color.
// NFKD handles diacritics + compatibility forms (ª→a); EXTRA_MEMBERS covers
// non-decomposing look-alikes. Returns undefined for non-swap glyphs.
// Font-derived swap zone → color (matches the GROUP_DEFS zone palette). '-'/'U' → none.
const ZONE_COLOR = ZONE_COLOR_SHORT
// Codepoint behind a grid cell's char (skip the ◌ U+25CC carrier on combining marks).
const cpOf = (ch: string): number => (ch.charCodeAt(0) === 0x25CC ? ch.codePointAt(1)! : ch.codePointAt(0)!)
// Grid flash entries: every rclt-swap cell (base + aalt compounds) with its thresholds
// and per-band color, precomputed from the font-derived GRID_SWAPS.
const GRID_ENTRIES = Object.entries(GRID_SWAPS).map(([key, s]) => ({
  key, t: s.t, colors: [...s.z].map(z => ZONE_COLOR[z] ?? null),
}))

const EXTRA_MEMBERS: Record<string, string> = { 'ɑ': 'a' }
const groupKeyOf = (ch: string): string | undefined => {
  if (SWAP_GLYPHS.has(ch)) return ch
  const base = ch.normalize('NFKD')[0]
  if (base && SWAP_GLYPHS.has(base)) return base
  return EXTRA_MEMBERS[ch]
}

type Flashes = Record<string, { color: string; nonce: number }>

// ── Freezer gold ─────────────────────────────────────────────────────────────────
// Characters a frozen feature swaps get painted gold in the specimen — the freezer's
// zone-like color language ("held off GEOM", distinct from the four GEOM zone hues).
// ss/cv derive their chars from `families`; figure/case features from an explicit list.
const FEATURE_CHARS: Record<string, string> = {
  tnum: '0123456789', pnum: '0123456789', zero: '0', case: '-–—()[]{}',
}
const FEATURE_FAMILIES: Record<string, string[]> =
  Object.fromEntries([...SUBS.stylisticSets, ...SUBS.charVariants].map(f => [f.tag, f.families]))
function frozenCharSet(tags: string[]): Set<string> {
  const s = new Set<string>()
  for (const t of tags) {
    for (const c of FEATURE_FAMILIES[t] ?? []) s.add(c)
    for (const c of FEATURE_CHARS[t] ?? '') s.add(c)
  }
  return s
}

// Shared GEOM-crossing detector (EDIT mode only). As GEOM crosses a swapping
// glyph's threshold, that glyph is flagged with the zone color of the variant it
// just entered — a persistent per-glyph color, not a one-shot pulse. Landing on
// the neutral `default` master hard-clears the glyph (no color). Only the active
// scene mounts, so exactly one detector runs.
//
// v2 behaviour, gated on `dragging` (= rail GEOM slider held, store.geomDragging):
//   dragging  → glyphs HOLD their color; crossings hard-switch / hard-off in place.
//   released  → each held glyph runs the glyph-flash keyframe back to rest, then
//               `clear`s (so text glyphs un-wrap and ligatures restore).
// A chip-click / keyboard nudge changes GEOM while not dragging, so it reads as a
// one-shot flash (hard-on → fade), matching the old behaviour.
function useGeomFlash(): { flashes: Flashes; clear: (ch: string) => void; dragging: boolean } {
  const { state } = useInstrument()
  const geom = effectiveAxes(state).GEOM
  // Live thresholds — so the flash fires at the user's CURRENT swap positions
  // (matrix/preset edits), not the static GROUP_DEFS seed.
  const thresholds = effectiveThresholds(state)
  const editing = state.recalMode === 'edit'
  const dragging = state.geomDragging
  const [flashes, setFlashes] = useState<Flashes>({})
  const prevGeom = useRef(geom)
  const prevEditing = useRef(editing)
  const nonce = useRef(0)
  useEffect(() => {
    const from = prevGeom.current, wasEditing = prevEditing.current
    prevGeom.current = geom
    prevEditing.current = editing
    if (!editing || !wasEditing || from === geom) return   // real GEOM moves only, while editing
    setFlashes(prev => {
      const next = { ...prev }
      let changed = false
      for (const def of GROUP_DEFS) {
        const thr = thresholds[def.glyph] ?? def.defaultThresholds
        const after = variantIndex(geom, thr)
        if (after === variantIndex(from, thr)) continue   // this glyph didn't cross
        const variant = def.variants[after]
        if (variant.label === 'default') {                  // swapped back to the neutral master → hard-off
          if (def.glyph in next) { delete next[def.glyph]; changed = true }
        } else {                                            // hard-on / hard-switch to a zone color
          next[def.glyph] = { color: variant.color, nonce: ++nonce.current }
          changed = true
        }
      }
      return changed ? next : prev
    })
  }, [geom, editing])
  // Release cleanup: on drag-release the held spans swap in place from
  // `geom-flash-hold` to `geom-flash`, and that in-place swap's animationend does
  // NOT reach React's per-span onAnimationEnd — so un-wrap them here once the fade
  // (.5s keyframe) has played. Re-grabbing before then cancels the sweep.
  const wasDragging = useRef(dragging)
  useEffect(() => {
    const was = wasDragging.current
    wasDragging.current = dragging
    if (was && !dragging) {
      const t = setTimeout(() => setFlashes({}), 520)
      return () => clearTimeout(t)
    }
  }, [dragging])
  const clear = (ch: string) => setFlashes(f => (ch in f ? (({ [ch]: _, ...rest }) => rest)(f) : f))
  return { flashes, clear, dragging }
}

// Freezer gold trigger (A + B). The frozen glyphs light gold transiently — never
// persistently — so the specimen is clean at rest:
//   A) toggling a freeze pulses just the changed feature's glyphs, then fades;
//   B) dragging GEOM holds all frozen glyphs gold, fading a beat after release.
// Reuses the geom-flash hold/fade timing; the hold-vs-fade class is picked in flashText
// off the same `dragging` flag.
const symDiff = (a: string[], b: string[]): string[] =>
  [...a.filter(x => !b.includes(x)), ...b.filter(x => !a.includes(x))]

function useFrozenGold(tags: string[]): { chars: Set<string> } | null {
  const { state } = useInstrument()
  const dragging = state.geomDragging
  const [pulse, setPulse] = useState<Set<string> | null>(null)   // A: toggle-triggered fade set
  const [dragFade, setDragFade] = useState(false)                // B: post-release fade window
  const prevTags = useRef(tags)
  const wasDragging = useRef(dragging)
  useEffect(() => {   // A — a freeze was toggled: pulse the changed feature's glyphs
    const prev = prevTags.current; prevTags.current = tags
    if (prev === tags) return
    const changed = symDiff(prev, tags)
    if (!changed.length) return
    setPulse(frozenCharSet(changed))
    const t = setTimeout(() => setPulse(null), 560)
    return () => clearTimeout(t)
  }, [tags])
  useEffect(() => {   // B — GEOM drag released: run the fade beat
    const was = wasDragging.current; wasDragging.current = dragging
    if (dragging) { setDragFade(false); return }
    if (was) { setDragFade(true); const t = setTimeout(() => setDragFade(false), 560); return () => clearTimeout(t) }
  }, [dragging])
  if (dragging || dragFade) return { chars: frozenCharSet(tags) }   // B wins → all frozen glyphs
  if (pulse) return { chars: pulse }                                // A → just the toggled one
  return null
}

// Glyphs-grid flash: same hold-while-dragging / fade-on-release model as useGeomFlash,
// but detects crossings over the FULL font-derived swap set (GRID_ENTRIES, keyed by
// "cp:aaltIndex") — so base glyphs AND every rclt alternate/compound flash, not just
// the 16 GROUP_DEFS groups. Static font thresholds (grid is a specimen of the font).
function useGridFlash(): { flashes: Flashes; clear: (k: string) => void; dragging: boolean } {
  const { state } = useInstrument()
  const geom = effectiveAxes(state).GEOM
  const editing = state.recalMode === 'edit'
  const dragging = state.geomDragging
  const [flashes, setFlashes] = useState<Flashes>({})
  const prevGeom = useRef(geom)
  const prevEditing = useRef(editing)
  const nonce = useRef(0)
  useEffect(() => {
    const from = prevGeom.current, wasEditing = prevEditing.current
    prevGeom.current = geom
    prevEditing.current = editing
    if (!editing || !wasEditing || from === geom) return
    setFlashes(prev => {
      const next = { ...prev }
      let changed = false
      for (const e of GRID_ENTRIES) {
        const after = variantIndex(geom, e.t)
        if (after === variantIndex(from, e.t)) continue
        const color = e.colors[after]
        if (!color) { if (e.key in next) { delete next[e.key]; changed = true } }
        else { next[e.key] = { color, nonce: ++nonce.current }; changed = true }
      }
      return changed ? next : prev
    })
  }, [geom, editing])
  const wasDragging = useRef(dragging)
  useEffect(() => {
    const was = wasDragging.current
    wasDragging.current = dragging
    if (was && !dragging) {
      const t = setTimeout(() => setFlashes({}), 520)
      return () => clearTimeout(t)
    }
  }, [dragging])
  const clear = (k: string) => setFlashes(f => (k in f ? (({ [k]: _, ...rest }) => rest)(f) : f))
  return { flashes, clear, dragging }
}

// Render a string, wrapping a glyph in its own span ONLY while it's flashing — so
// normal text keeps its kerning/ligatures and only the flashing glyph splits out.
// While `dragging`, the span holds its color (`geom-flash-hold`, no animation);
// on release it runs the keyframe fade (`geom-flash`) and `clear`s on animation end.
// Non-flashing runs stay plain (Fragment, no DOM).
function flashText(text: string, flashes: Flashes, clear: (ch: string) => void, dragging: boolean, kp = '', frozen?: Set<string>): ReactNode {
  const anyFrozen = !!frozen && frozen.size > 0
  const hasFlash = [...text].some(ch => { const gk = groupKeyOf(ch); return gk && flashes[gk] })
  const hasFrozen = anyFrozen && [...text].some(ch => frozen!.has(ch))
  if (!hasFlash && !hasFrozen) return text   // fast path: nothing to wrap
  const out: ReactNode[] = []
  let buf = '', runStart = 0
  const flush = () => { if (buf) { out.push(<Fragment key={`${kp}t${runStart}`}>{buf}</Fragment>); buf = '' } }
  ;[...text].forEach((ch, i) => {
    // A frozen glyph flashes gold (hold while dragging GEOM, else the fade beat) and
    // never GEOM-flashes its zone color.
    if (anyFrozen && frozen!.has(ch)) {
      flush()
      out.push(<span key={`${kp}f${i}`} className={dragging ? 'freeze-gold-hold' : 'freeze-gold'}>{ch}</span>)
      return
    }
    const gk = groupKeyOf(ch)
    const fl = gk ? flashes[gk] : undefined
    if (fl) {
      flush()
      out.push(
        <span key={`${kp}g${i}-${fl.nonce}`} className={dragging ? 'geom-flash-hold' : 'geom-flash'}
          onAnimationEnd={dragging ? undefined : () => clear(gk!)}
          style={{ ['--flash-color' as string]: fl.color } as CSSProperties}>{ch}</span>,
      )
    } else { if (!buf) runStart = i; buf += ch }
  })
  flush()
  return out
}

// Flash context threaded into the markdown inline renderer so Paragraph/Scale glyphs
// flash too (same focused/unfocused model as Words).
type FlashCtx = { flashes: Flashes; clear: (ch: string) => void; dragging: boolean; frozen?: Set<string> }

// Markdown inline renderer that ALSO flash-wraps swap glyphs (composites included).
// Mirrors renderInline's delimiters; each text run and each bold/italic/underline
// inner run is flash-wrapped with a unique key prefix so sibling runs never collide.
function flashInline(text: string, boldVs: string, italVs: string, fc: FlashCtx, cmp?: CompareSpec | null): ReactNode {
  const F = (s: string, kp: string) => flashText(s, fc.flashes, fc.clear, fc.dragging, kp, fc.frozen)
  const toks = splitInlineMarkup(text)
  if (isPlainRun(toks)) return F(text, '')
  return toks.map((t, k) =>
    t.type === 'bold' ? <strong key={`b${k}`} style={cmp ? cmpBold(cmp) : { fontVariationSettings: boldVs, fontWeight: 'normal', fontSynthesis: 'none' }}>{F(t.value, `b${k}-`)}</strong>
      : t.type === 'italic' ? <em key={`i${k}`} style={cmp ? cmpItal(cmp) : { fontVariationSettings: italVs, fontStyle: 'normal', fontSynthesis: 'none' }}>{F(t.value, `i${k}-`)}</em>
        : t.type === 'underline' ? <u key={`u${k}`}>{F(t.value, `u${k}-`)}</u>
          : <Fragment key={`s${k}`}>{F(t.value, `s${k}-`)}</Fragment>)
}

// Compare-mode replacements for the markdown bold/italic spans: the referent font
// can't read wght/ital variation settings, so **bold** rides font-weight and *italic*
// snaps to the real italic style (or stays upright if the referent has none).
const cmpBold = (c: CompareSpec): CSSProperties => {
  const w = Math.min(700, c.wghtRange?.[1] ?? 700)
  const heavy = c.heavy && w >= c.heavy.from
  return {
    fontVariationSettings: 'normal', fontSynthesis: 'none',
    fontWeight: heavy ? c.heavy!.weight : w,
    ...(heavy ? { fontFamily: c.heavy!.family } : {}),
  }
}
const cmpItal = (c: CompareSpec): CSSProperties =>
  ({ fontVariationSettings: 'normal', fontStyle: c.italic ? 'italic' : 'normal', fontSynthesis: 'none' })

// ── Editable-markdown plumbing (ported/extended from font-proofer) ───────────────
// Caret utilities.
// caret helpers imported from wm-primitives (see import at top).

// Inline markdown → styled nodes: **bold** (wght axis), *italic* (ital axis),
// __underline__. Parsing shared (splitInlineMarkup); nesting is not handled.
function renderInline(text: string, boldVs: string, italVs: string, cmp?: CompareSpec | null): ReactNode {
  const toks = splitInlineMarkup(text)
  if (isPlainRun(toks)) return text
  return toks.map((t, k) =>
    t.type === 'bold' ? <strong key={k} style={cmp ? cmpBold(cmp) : { fontVariationSettings: boldVs, fontWeight: 'normal', fontSynthesis: 'none' }}>{t.value}</strong>
      : t.type === 'italic' ? <em key={k} style={cmp ? cmpItal(cmp) : { fontVariationSettings: italVs, fontStyle: 'normal', fontSynthesis: 'none' }}>{t.value}</em>
        : t.type === 'underline' ? <u key={k}>{t.value}</u>
          : t.value)
}

// A single contentEditable region: raw markdown while focused (browser owns the DOM,
// caret stable), styled preview when not. `onCommit` fires live (input) + on blur.
// Thin wrapper over the shared EditableTextBlock: ReCal's blurred view renders the
// GEOM-flash / compare-aware inline markup.
function EditableText({ value, onCommit, className, style, boldVs, italVs, flash, cmp }: {
  value: string; onCommit: (t: string) => void
  className?: string; style?: CSSProperties; boldVs: string; italVs: string; flash?: FlashCtx
  cmp?: CompareSpec | null
}) {
  return (
    <EditableTextBlock value={value} onCommit={onCommit} className={className} style={style} liveCommit
      render={v => flash ? flashInline(v, boldVs, italVs, flash, cmp) : renderInline(v, boldVs, italVs, cmp)} />
  )
}

function Words({ size, ls, leading, featStr, opszAuto }: SceneProps) {
  const { state } = useInstrument()
  const op = opszCss(state.defaults, opszAuto)
  const vs = renderVarSettings(effectiveAxes(state), op.renderOpts)
  // Words/Scale only swap for a live webfont; static-SVG referents render only their
  // Paragraph specimen, so here they fall back to Cal Sans.
  const cmp = state.compareOn && state.compare?.css ? state.compare : null
  const { flashes, clear, dragging } = useGeomFlash()
  const gold = useFrozenGold(state.defaults.frozenFeatures)
  const [text, setText] = useState('2160 just Groovy, I’ll Magic')
  const [focused, setFocused] = useState(false)
  return (
    <div className="stage-pad words-scene">
      <div className="words-edit specimen edit-rail" contentEditable suppressContentEditableWarning
        style={{ fontSize: size, lineHeight: leading, textAlign: 'center', whiteSpace: 'pre-wrap', fontVariationSettings: vs, fontOpticalSizing: op.optical, fontFeatureSettings: featStr, letterSpacing: ls, ...(cmp ? compareStyle(cmp, effectiveAxes(state), { opszAuto }) : {}) }}
        onFocus={() => setFocused(true)}
        // innerText (not textContent) preserves soft line breaks: Enter inserts <br>/<div>
        // nodes that textContent would concatenate with no \n, flattening the layout.
        onBlur={e => { setText(e.currentTarget.innerText ?? ''); setFocused(false) }}>
        {/* Uncontrolled while focused: no onInput→setState, so typing never re-renders
            and never resets the caret. Text is captured on blur, then flash-wrapped. */}
        {focused ? text : flashText(text, flashes, clear, dragging, '', gold?.chars)}
      </div>
    </div>
  )
}

type EBlock = { id: string; type: Block['type']; text: string }
const specimenOf = (source: string): string | null => {
  const p = TEXT_PRESETS[source]
  return p && !Array.isArray(p) ? p.specimen : null
}

/** A specimen starts empty and fills in asynchronously — see the effect below. */
const presetBlocks = (source: string): EBlock[] => {
  const p = TEXT_PRESETS[source] ?? TEXT_PRESETS.Sample
  if (!Array.isArray(p)) return []
  return p.map((b, i) => ({ id: `${source}-${i}`, type: b.type, text: b.text }))
}

// Compare-page font swap, sitting under the paragraph like a line of text (fused SEO
// pages only — state.compare comes from BOOT). The target name renders in the font
// you'd switch TO, so "compare to (Geist ⇄)" already shows what Geist looks like.
function CompareInline() {
  const { state, dispatch } = useInstrument()
  const cmp = state.compare
  if (!cmp) return null
  const swappable = !!cmp.css || !!cmp.svg   // live webfont OR a static specimen SVG
  // No webfont AND no rendered specimen → grayed control; the specimen above stays
  // Cal Sans tuned to resemble the referent.
  if (!swappable) {
    return (
      <div className="compare-inline compare-inline--disabled"
        title={`${cmp.label} webfont currently not available to ReCal — the specimen above is Cal Sans tuned to resemble it`}>
        compare to <span className="compare-inline-btn" aria-disabled="true">({cmp.label} ⇄)</span>
        <span className="compare-inline-note"> — webfont currently not available to ReCal</span>
      </div>
    )
  }
  const on = state.compareOn
  return (
    <div className="compare-inline">
      {on ? 'comparing — back to ' : 'compare to '}
      <button className="compare-inline-btn"
        // Live-font labels preview in that font; SVG specimens have no live face, so
        // the label stays in the UI font.
        style={{ fontFamily: on || !cmp.css ? "'CalSansPreview', 'CalSansVF', sans-serif" : cmp.family }}
        title={on ? 'Back to ReCal Sans' : `Show this text in ${cmp.label}`}
        onClick={() => dispatch({ type: 'setCompareOn', on: !on })}>
        ({on ? 'ReCal Sans' : cmp.label} ⇄)
      </button>
    </div>
  )
}

// Names the font the specimen is actually set in — flips with the toggle so the copy
// itself never has to claim "this is ReCal Sans" (which read wrong under a referent).
function CompareCaption() {
  const { state } = useInstrument()
  const cmp = state.compare
  if (!cmp) return null
  return <div className="compare-caption">Set in {state.compareOn ? cmp.label : 'ReCal Sans'}</div>
}

// Static referent specimen (Gotham/Neutraface/Circular/GT America): fetch the
// pre-rendered SVG once and inline it so fill="currentColor" inherits the theme.
function CompareSvg({ url }: { url: string }) {
  const [markup, setMarkup] = useState('')
  useEffect(() => {
    let live = true
    fetch(url).then(r => r.text()).then(t => { if (live) setMarkup(t) }).catch(() => {})
    return () => { live = false }
  }, [url])
  return <div className="compare-svg" dangerouslySetInnerHTML={{ __html: markup }} />
}

function Paragraph({ featStr, source, measure, opszAuto, paraStyles, fit, setSource }: SceneProps) {
  const { state } = useInstrument()
  const axes = effectiveAxes(state)
  const op = opszCss(state.defaults, opszAuto)
  const boldVs = renderVarSettings({ ...axes, wght: 700 }, op.renderOpts)
  const italVs = renderVarSettings({ ...axes, ital: 1 }, op.renderOpts)
  // Comparing to a referent with a live webfont → restyle the blocks (compareStyle).
  // Comparing to a no-webfont referent with a static specimen → show the SVG instead.
  const cmp = state.compareOn && state.compare?.css ? state.compare : null
  const svgUrl = state.compareOn ? state.compare?.svg : undefined
  const flash: FlashCtx = { ...useGeomFlash(), frozen: useFrozenGold(state.defaults.frozenFeatures)?.chars }
  // On the Vertical Metrics tab, drive line spacing (vmLH) and the cap-position shift
  // (vmShift) from the chosen metrics, so a preset change reflows the paragraph and slides
  // the caps within each line — a simulation of the export's line box, no re-baking.
  const vmLH = state.railGroup === 3 ? effectiveLineHeightEm(state.defaults.vmetrics) : null
  const vmShift = state.railGroup === 3 ? capShiftEm(state.defaults.vmetrics) : 0

  const [blocks, setBlocks] = useState<EBlock[]>(() => presetBlocks(source))
  const [focusedId, setFocusedId] = useState<string | null>(null)
  const refs = useRef<Record<string, HTMLElement>>({})
  const pending = useRef<{ id: string; offset: number } | null>(null)
  const seq = useRef(0)
  // Tracks the truly-active block synchronously so a stray blur (e.g. after Enter
  // re-renders the old block styled) doesn't commit stripped text over the raw markdown.
  const activeId = useRef<string | null>(null)
  const focus = (id: string | null) => { activeId.current = id; setFocusedId(id) }

  // Which work is on screen and how far it has been fetched; null for the short presets,
  // which are plain arrays. Edits live in `blocks` and are never written back, so leaving
  // a work and returning re-fetches it clean.
  const [spec, setSpec] = useState<{ slug: string; loaded: number } | null>(null)
  const withIds = (bs: { type: string; text: string }[], off = 0): EBlock[] =>
    bs.map((b, i) => ({ id: `${source}-${off + i}`, type: b.type as EBlock['type'], text: b.text }))

  const loadSource = (src: string) => {
    const slug = specimenOf(src)
    if (!slug) { setSpec(null); setBlocks(presetBlocks(src)); return }
    setSpec({ slug, loaded: 1 })
    setBlocks([])
    loadSpecimen(slug, 0).then(bs => setBlocks(withIds(bs)))
  }

  const readMore = () => {
    if (!spec || spec.loaded >= specimenChunks(spec.slug)) return
    const next = spec.loaded
    setSpec(s => (s ? { ...s, loaded: s.loaded + 1 } : s))
    loadSpecimen(spec.slug, next).then(bs => setBlocks(prev => [...prev, ...withIds(bs, prev.length)]))
  }

  // Reload blocks when the source preset changes.
  const prevSource = useRef(source)
  useEffect(() => {
    if (prevSource.current !== source) { prevSource.current = source; loadSource(source); focus(null) }
  }, [source])
  // …and on mount, when the app boots straight into a work.
  useEffect(() => { if (specimenOf(source)) loadSource(source) }, [])

  // Restore caret to the click point after a block swaps to raw markdown on focus.
  useLayoutEffect(() => {
    if (focusedId && pending.current?.id === focusedId) {
      const el = refs.current[focusedId]; if (el) placeCaretAtOffset(el, pending.current.offset)
    }
    pending.current = null
  }, [focusedId])

  const onKeyDown = (id: string, e: KeyboardEvent<HTMLElement>) => {
    const el = refs.current[id]; if (!el) return
    const text = el.textContent ?? ''
    if (e.key === ' ') {
      const md = text === '#' ? 'h1' : text === '##' ? 'h2' : text === '###' ? 'h3' : null
      if (md) {
        e.preventDefault(); el.textContent = ''
        setBlocks(prev => prev.map(b => b.id === id ? { ...b, type: md, text: '' } : b))
        requestAnimationFrame(() => { const n = refs.current[id]; if (n) { n.focus(); placeCaretAtStart(n) } })
      }
    } else if (e.key === 'Enter') {
      e.preventDefault()
      el.textContent = ''   // clear before the block re-renders styled (avoids duplicate)
      const newId = `n${seq.current++}`
      setBlocks(prev => {
        const idx = prev.findIndex(b => b.id === id); if (idx < 0) return prev
        const next = [...prev]
        next[idx] = { ...next[idx], text }
        next.splice(idx + 1, 0, { id: newId, type: 'p', text: '' })
        return next
      })
      focus(newId)
      requestAnimationFrame(() => { const n = refs.current[newId]; if (n) { n.focus(); placeCaretAtStart(n) } })
    } else if (e.key === 'Backspace' && text === '') {
      e.preventDefault()
      setBlocks(prev => {
        if (prev.length <= 1) return prev
        const idx = prev.findIndex(b => b.id === id)
        const target = prev[Math.max(0, idx - 1)]
        if (target) { focus(target.id); requestAnimationFrame(() => { const n = refs.current[target.id]; if (n) { n.focus(); placeCaretAtEnd(n) } }) }
        return prev.filter(b => b.id !== id)
      })
    }
  }

  // Static specimen view: the referent has no live webfont, so show the pre-rendered
  // SVG (real outlines) in place of the editable blocks. Toggle stays available.
  if (svgUrl) {
    return (
      <div className="stage-pad">
        <div className="para-doc" style={{ maxWidth: `${measure}em` }}>
          <CompareSvg url={svgUrl} />
          <CompareCaption />
          <CompareInline />
        </div>
      </div>
    )
  }

  return (
    <div className="stage-pad">
      {/* Alignment is set per BLOCK, from its style — the document has no alignment of
          its own to inherit from. */}
      <div className="para-doc" style={{ maxWidth: `${measure}em` }}>
        {blocks.map((b, i) => {
          const st = paraStyles[b.type]
          const blockVs = renderVarSettings({ ...axes, wght: st.wght }, op.renderOpts)
          const focused = focusedId === b.id
          return (
            <div key={b.id}
              ref={el => { if (el) { refs.current[b.id] = el; if (!el.textContent) el.textContent = b.text } else delete refs.current[b.id] }}
              contentEditable suppressContentEditableWarning spellCheck={false}
              className={`para-block para-block--${b.type} edit-rail`}
              style={{ textAlign: st.align, fontSize: st.size, lineHeight: vmLH ?? st.leading, transform: vmShift ? `translateY(${vmShift}em)` : undefined, fontVariationSettings: blockVs, fontOpticalSizing: op.optical, fontFeatureSettings: featStr, letterSpacing: `${st.tracking / 100}em`, ...(cmp ? compareStyle(cmp, { ...axes, wght: cmp.headingWght && b.type !== 'p' ? cmp.headingWght : st.wght }, { opszAuto }) : {}) }}
              onMouseDown={e => { if (!focused) pending.current = { id: b.id, offset: caretCharOffset(e.currentTarget, e.clientX, e.clientY) } }}
              onFocus={() => focus(b.id)}
              onBlur={e => {
                if (activeId.current !== b.id) return   // stale blur (Enter moved focus) — keep raw text
                const t = e.currentTarget.textContent ?? ''
                e.currentTarget.textContent = ''
                setBlocks(prev => prev.map(x => x.id === b.id ? { ...x, text: t } : x))
                focus(null)
              }}
              onKeyDown={e => onKeyDown(b.id, e)}>
              {focused ? null : (() => {
                const inline = flashInline(b.text, boldVs, italVs, flash, cmp)
                // A marked-up block used to fall back to browser flow here: a fitted line
                // was one span and a span cannot carry italic in its middle. Lines are
                // runs now, so emphasis is measured in its own face and set in it too —
                // which for this app means the ital axis, not a synthesised slant.
                // The block answers for itself: its own alignment, rag and hyphenation,
                // fitted to the bands `fit` carries for the whole typeface.
                if (!fit) return inline
                const opts = fitOptionsFor(st, fit)
                if (opts.mode === 'off') return inline
                return <FittedParagraph text={b.text} opts={opts} fallback={inline}
                  indentPx={i === 0 ? fit.firstIndent ?? 0 : fit.indent ?? 0}
                  runStyle={kind =>
                    kind === 'bold'
                      ? (cmp ? cmpBold(cmp) : { fontVariationSettings: boldVs, fontWeight: 'normal', fontSynthesis: 'none' })
                      : kind === 'italic'
                        ? (cmp ? cmpItal(cmp) : { fontVariationSettings: italVs, fontStyle: 'normal', fontSynthesis: 'none' })
                        : { textDecoration: 'underline' }} />
              })()}
            </div>
          )
        })}
        <SpecimenNav
          more={!!spec && spec.loaded < specimenChunks(spec.slug)}
          onMore={readMore}
          nextLabel={setSource ? TEXT_SOURCES[(TEXT_SOURCES.indexOf(source) + 1) % TEXT_SOURCES.length] : undefined}
          onNext={setSource ? () => setSource(TEXT_SOURCES[(TEXT_SOURCES.indexOf(source) + 1) % TEXT_SOURCES.length]) : undefined}
        />
        <CompareCaption />
        <CompareInline />
      </div>
    </div>
  )
}

function Scale({ featStr, pairs, measure, scaleStyles, selectedTiers }: SceneProps) {
  const { state } = useInstrument()
  const axes = effectiveAxes(state)
  const mult = state.defaults.opszMultiplier
  const boldVs = renderVarSettings({ ...axes, wght: 700 }, {})
  const italVs = renderVarSettings({ ...axes, ital: 1 }, {})
  const cmp = state.compareOn && state.compare?.css ? state.compare : null
  // Compare mode: the referent tracks size via font-optical-sizing: auto (if it has
  // opsz at all) — Cal Sans's multiplier math doesn't apply to another font.
  const cmpSt = cmp ? compareStyle(cmp, axes, { opszAuto: true }) : {}
  // Freeze pins every size to the frozen opsz; otherwise the waterfall shows opsz
  // following size (the export's multiplier). Both live in CSS now — no re-bake.
  const frozen = state.defaults.freezeOpsz ? Math.min(Math.max(state.defaults.frozenOpszValue ?? 14, 8), 45) : null
  const vsFor = (px: number) => renderVarSettings(axes, { opszOverride: frozen ?? opszForSize(px, mult) })
  const use = BODY_TIERS.filter(t => pairs.has(t.key))   // none selected → no body pairings
  const flash: FlashCtx = { ...useGeomFlash(), frozen: useFrozenGold(state.defaults.frozenFeatures)?.chars }
  const [head, setHead] = useState(HEAD_WORD)
  const [body, setBody] = useState(PAIR_BODY)
  // On the Vertical Metrics tab, line height + the cap-position shift come from the metrics
  // (a preset change reflows the waterfall and slides the caps — visible at these sizes).
  const vmLH = state.railGroup === 3 ? effectiveLineHeightEm(state.defaults.vmetrics) : null
  const vmShift = state.railGroup === 3 ? capShiftEm(state.defaults.vmetrics) : 0
  // Per-tier tracking/leading (Scale style menu); size stays Tailwind-fixed.
  const tierStyle = (key: string) => {
    const st = scaleStyles[key] ?? { tracking: 0, leading: 1.4 }
    return { letterSpacing: `${st.tracking / 100}em`, lineHeight: vmLH ?? st.leading, transform: vmShift ? `translateY(${vmShift}em)` : undefined }
  }
  return (
    <div className="stage-pad">
      {DISPLAY_TIERS.map(d => (
        <div key={d.key} className="tier-block" style={{ width: `${measure}em` }}>
          <div className="tier-label">
            <span className="tier-token tnum">{d.key}<span className="tier-px">{d.px}px</span></span>
            {use.length > 0 && (
              <span className="tier-with tnum">paired with {use.map(b => `${b.key} ${b.px}px`).join(', ')}</span>
            )}
          </div>
          {/* Headline + body are editable and synced live across every size tier. */}
          <EditableText value={head} onCommit={setHead} className={`tier-head edit-rail${selectedTiers.has(d.key) ? ' edit-rail--target' : ''}`} boldVs={boldVs} italVs={italVs} flash={flash} cmp={cmp}
            style={{ fontSize: d.px, fontVariationSettings: vsFor(d.px), fontFeatureSettings: featStr, ...tierStyle(d.key), ...cmpSt }} />
          {use.map(b => (
            <EditableText key={b.key} value={body} onCommit={setBody} className={`tier-body edit-rail${selectedTiers.has(b.key) ? ' edit-rail--target' : ''}`} boldVs={boldVs} italVs={italVs} flash={flash} cmp={cmp}
              style={{ fontSize: b.px, fontVariationSettings: vsFor(b.px), fontFeatureSettings: featStr, ...tierStyle(b.key), ...cmpSt }} />
          ))}
        </div>
      ))}
    </div>
  )
}

// Cmap the cmap once — CalSansVF is already the loaded UI font.
let cmapPromise: Promise<CmapRanges | null> | null = null
function loadCmap(): Promise<CmapRanges | null> {
  if (!cmapPromise) {
    cmapPromise = fetch(`${import.meta.env.BASE_URL}fonts/CalSansVF.ttf`)
      .then(r => r.arrayBuffer()).then(parseCmapRanges).catch(() => null)
  }
  return cmapPromise
}

function Glyphs({ featStr, glyphSet, opszAuto }: SceneProps) {
  const { state } = useInstrument()
  const op = opszCss(state.defaults, opszAuto)
  const vs = renderVarSettings(effectiveAxes(state), op.renderOpts)
  const { flashes, clear, dragging } = useGridFlash()
  const [ranges, setRanges] = useState<CmapRanges | null>(null)
  useEffect(() => { let alive = true; loadCmap().then(r => { if (alive) setRanges(r) }); return () => { alive = false } }, [])

  const family = "'CalSansPreview', 'CalSansVF', sans-serif"
  // Live design metrics for the specimen rules — measured off the rendered instance,
  // so they track wght/opsz/YTAS as the ◆ moves (re-measured per vs change).
  const [metrics, setMetrics] = useState<GlyphPickerMetrics | undefined>()
  useEffect(() => {
    const m = () => { const r = measureGlyphMetrics(family, vs); if (r) setMetrics(r) }
    m()
    document.fonts?.ready.then(m).catch(() => {})
  }, [vs])

  // "All" = every cmap codepoint + its aalt alternates (the unencoded variants) as
  // explicit pre-scoped cells; the named sets are curated base-character subsets.
  // aalt/case cells enable 'rclt' too, so their GEOM swap actually renders.
  const groups: GlyphPickerGroup[] = useMemo(() => glyphSet === 'All'
    ? [{
        label: 'All + alternates',
        cells: allGlyphsWithAlternates(ranges).map(c => ({
          ch: c.ch,
          ffs: `${c.caps ? "'case' 1" : c.aalt ? `'aalt' ${c.aalt}, 'rclt' 1` : featStr}, 'mark' 1, 'mkmk' 1`,
          note: c.caps ? 'case' : c.aalt ? `aalt ${c.aalt}` : undefined,
          key: `${cpOf(c.ch)}:${c.aalt}${c.caps ? ':case' : ''}`,
        })),
      }]
    : [{ label: glyphSet, chars: (GLYPH_SETS[glyphSet] ?? []).join(''), ffs: `${featStr}, 'mark' 1, 'mkmk' 1` }],
  [glyphSet, ranges, featStr])

  // Flash (hold-while-dragging / fade-on-release) any cell whose glyph rclt-swaps —
  // base OR alternate/compound — via the font-derived map, through the picker's
  // cellState hook. Named-set cells (no key) flash on their base form.
  const cellState: GlyphCellState = useCallback(cell => {
    if (cell.key?.endsWith(':case')) return undefined
    const k = cell.key ?? `${cpOf(cell.ch)}:0`
    const fl = flashes[k]
    if (!fl) return undefined
    return {
      className: dragging ? 'geom-flash-hold' : 'geom-flash',
      style: { ['--flash-color' as string]: fl.color },
      nonce: fl.nonce,
      onAnimationEnd: dragging ? undefined : () => clear(k),
    }
  }, [flashes, dragging, clear])

  return (
    <div className="stage-pad stage-pad--glyphs">
      <GlyphPicker
        groups={groups} ranges={ranges} metrics={metrics}
        fontFamily={family} fontVariationSettings={vs} fontOpticalSizing={op.optical}
        cellState={cellState} names="nice" layout="side" />
    </div>
  )
}

// COSS module gallery — lazy-loaded so its component + coss.css + markup ship in a
// SEPARATE chunk fetched only when the tab is first opened (replaces the old UI mock).
const CossScene = lazy(() => import('./CossScene'))

export function Scene({ mode, ...props }: { mode: SceneMode } & SceneProps) {
  switch (mode) {
    case 'words': return <Words {...props} />
    case 'paragraph': return <Paragraph {...props} />
    case 'scale': return <Scale {...props} />
    case 'glyphs': return <Glyphs {...props} />
    case 'ui': return (
      <Suspense fallback={<div className="scene-loading"><span className="mode-throb" aria-hidden /> Loading…</div>}>
        <CossScene {...props} />
      </Suspense>
    )
  }
}

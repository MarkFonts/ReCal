// Phase 4 — canvas scenes + the modebar. Content types only. Scene-specific
// controls (feature chips, measure, body pairings) live in the bottom play bar and
// are passed in as props; scenes here only read them. Everything renders through
// effective() (renderVarSettings) — one engine. Models ported from font-proofer.
import './scenes.css'
import { useState, useEffect, useLayoutEffect, useRef, Fragment, type CSSProperties, type ReactNode, type KeyboardEvent } from 'react'
import { useInstrument } from './InstrumentProvider'
import { effectiveAxes, effectiveThresholds } from './store'
import { renderVarSettings, opszForSize } from './render'
import { GLYPH_SETS, GLYPH_SET_KEYS, parseCmapRanges, isSupported, allGlyphsWithAlternates, type CmapRanges, type GlyphCell } from './glyphset'
import { GROUP_DEFS } from '../GlyphGroups'
import { GRID_SWAPS } from './rcltSwaps'

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
  return null
}

// TEXT_SOURCES is declared after TEXT_PRESETS below; forward use is fine (const hoist
// at module eval — SceneControls only reads it at render time).
// ── Ported data ────────────────────────────────────────────────────────────────
// Editable per-block styles (ported from font-proofer's DEFAULT_PARA_STYLES). Each
// style carries size/leading/tracking + a weight (so H1 renders bold). opsz is auto
// per block (font-optical-sizing tracks the block's size).
export type ParaStyleKey = 'h1' | 'h2' | 'h3' | 'p'
export type ParaStyle = { size: number; leading: number; tracking: number; wght: number }
export type ParaStyles = Record<ParaStyleKey, ParaStyle>
export const PARA_STYLE_ORDER: ParaStyleKey[] = ['h1', 'h2', 'h3', 'p']
export const PARA_STYLE_LABEL: Record<ParaStyleKey, string> = { h1: 'Heading 1', h2: 'Heading 2', h3: 'Heading 3', p: 'Paragraph' }
export const DEFAULT_PARA_STYLES: ParaStyles = {
  h1: { size: 57, leading: 1.1, tracking: 0, wght: 700 },
  h2: { size: 32, leading: 1.2, tracking: 0, wght: 400 },
  h3: { size: 22, leading: 1.3, tracking: 0, wght: 400 },
  p: { size: 18, leading: 1.6, tracking: 0, wght: 400 },
}

type Block = { type: ParaStyleKey; text: string }
// Full text ported from font-proofer's TEXT_PRESETS.
const TEXT_PRESETS: Record<string, Block[]> = {
  Sample: [
    { type: 'h1', text: `Hand gloves` },
    { type: 'p', text: `Typography is the art and technique of arranging type to make written language legible, readable, and appealing when displayed. The arrangement of type involves selecting typefaces, point sizes, line lengths, line-spacing, and letter-spacing, as well as adjusting the space between pairs of letters.` },
    { type: 'p', text: `The term typography is also applied to the style, arrangement, and appearance of the letters, numbers, and symbols created by the process. Type design is a closely related craft, sometimes considered part of typography.` },
  ],
  'A Tale of Two Cities': [
    { type: 'h2', text: `Chapter I` },
    { type: 'h1', text: `A Tale of Two Cities` },
    { type: 'p', text: `It was the best of times, it was the worst of times, it was the age of wisdom, it was the age of foolishness, it was the epoch of belief, it was the epoch of incredulity, it was the season of Light, it was the season of Darkness, it was the spring of hope, it was the winter of despair, we had everything before us, we had nothing before us, we were all going direct to Heaven, we were all going direct the other way—in short, the period was so far like the present period, that some of its noisiest authorities insisted on its being received, for good or for evil, in the superlative degree of comparison only.` },
    { type: 'p', text: `There were a king with a large jaw and a queen with a plain face, on the throne of England; there were a king with a large jaw and a queen with a fair face, on the throne of France. In both countries it was clearer than crystal to the lords of the State preserves of loaves and fishes, that things in general were settled for ever.` },
    { type: 'p', text: `It was the year of Our Lord one thousand seven hundred and seventy-five. Spiritual revelations were conceded to England at that favoured period, as at this. Mrs. Southcott had recently attained her five-and-twentieth blessed birthday, of whom a prophetic private in the Life Guards had heralded the sublime appearance by announcing that arrangements were made for the swallowing up of London and Westminster. Even the Cock-lane ghost had been laid only a round dozen of years, after rapping out its messages, as the spirits of this very year last past (supernaturally deficient in originality) rapped out theirs. Mere messages in the earthly order of events had lately come to the English Crown and People, from a congress of British subjects in America: which, strange to relate, have proved more important to the human race than any communications yet received through any of the chickens of the Cock-lane brood.` },
    { type: 'p', text: `France, less favoured on the whole as to matters spiritual than her sister of the shield and trident, rolled with exceeding smoothness down hill, making paper money and spending it. Under the guidance of her Christian pastors, she entertained herself, besides, with such humane achievements as sentencing a youth to have his hands cut off, his tongue torn out with pincers, and his body burned alive, because he had not kneeled down in the rain to do honour to a dirty procession of monks which passed within his view, at a distance of some fifty or sixty yards.` },
    { type: 'p', text: `In England, there was scarcely an amount of order and protection to justify much national boasting. Daring burglaries by armed men, and highway robberies, took place in the capital itself every night; families were publicly cautioned not to go out of town without removing their furniture to upholsterers' warehouses for security; the highwayman in the dark was a City tradesman in the light, and, being recognised and challenged by his fellow-tradesman whom he stopped in his character of "the Captain," gallantly shot him through the head and rode away.` },
    { type: 'h2', text: `Chapter II — The Mail` },
    { type: 'p', text: `It was the Dover road that lay, on a Friday night late in November, before the first of the persons with whom this history has business. The Dover road lay, as to him, beyond the Dover mail, as it lumbered up Shooter's Hill. He walked up hill in the mire by the side of the mail, as the rest of the passengers did; not because they had the least relish for walking exercise, under the circumstances, but because the hill, and the harness, and the mud, and the mail, were all so heavy, that the horses had three times already come to a stop.` },
    { type: 'p', text: `There was a steaming mist in all the hollows, and it had roamed in its forlornness up the hill, like an evil spirit, seeking rest and finding none. A clammy and intensely cold mist, it made its slow way through the air in ripples that visibly followed and overspread one another, as the waves of an unwholesome sea might do.` },
  ],
  'Kern King': [
    { type: 'h1', text: `Kern King` },
    { type: 'h2', text: `Part 1 — Lowercase` },
    { type: 'p', text: `lynx tuft frogs, dolphins abduct by proxy the ever awkward klutz, dud, dummkopf, jinx snubnose filmgoer, orphan sgt. renfruw grudgek reyfus, md. sikh psych if halt tympany jewelry sri heh! twyer vs jojo pneu fylfot alcaaba son of nonplussed halfbreed bubbly playboy guggenheim daddy coccyx sgraffito effect, vacuum dirndle impossible attempt to disvalue, muzzle the afghan czech czar and exninja, bob bixby dvorak wood dhurrie savvy, dizzy eye aeon circumcision uvula scrungy picnic luxurious special type carbohydrate ovoid adzuki kumquat bomb? afterglows gold girl pygmy gnome lb. ankhs acme aggroupment akmed brouhha tv wt. ujjain ms. oz abacus mnemonics bhikku khaki bwana aorta embolism vivid owls often kvetch otherwise, wysiwyg densfort wright you've absorbed rhythm, put obstacle kyaks krieg kern wurst subject enmity equity coquet quorum pique tzetse hepzibah sulfhydryl briefcase ajax ehler kafka fjord elfship halfdressed jugful eggcup hummingbirds swingdevil bagpipe legwork reproachful hunchback archknave baghdad wejh rijswijk rajbansi rajput ajdir okay weekday obfuscate subpoena liebknecht marcgravia ecbolic arcticward dickcissel pincpinc boldface maidkin adjective adcraft adman dwarfness applejack darkbrown kiln palzy always farmland flimflam unbossy nonlineal stepbrother lapdog stopgap.` },
    { type: 'h2', text: `Part 2 — Uppercase` },
    { type: 'p', text: `LYNX TUFT FROGS, DOLPHINS ABDUCT BY PROXY THE EVER AWKWARD KLUTZ, DUD, DUMMKOPF, JINX SNUBNOSE FILMGOER, ORPHAN SGT. RENFRUW GRUDGEK REYFUS, MD. SIKH PSYCH IF HALT TYMPANY JEWELRY SRI HEH! TWYER VS JOJO PNEU FYLFOT ALCAABA SON OF NONPLUSSED HALFBREED BUBBLY PLAYBOY GUGGENHEIM DADDY COCCYX SGRAFFITO EFFECT, VACUUM DIRNDLE IMPOSSIBLE ATTEMPT TO DISVALUE, MUZZLE THE AFGHAN CZECH CZAR AND EXNINJA, BOB BIXBY DVORAK WOOD DHURRIE SAVVY, DIZZY EYE AEON CIRCUMCISION UVULA SCRUNGY PICNIC LUXURIOUS SPECIAL TYPE CARBOHYDRATE OVOID ADZUKI KUMQUAT BOMB? AFTERGLOWS GOLD GIRL PYGMY GNOME LB. ANKHS ACME AGGROUPMENT AKMED BROUHHA TV WT. UJJAIN MS. OZ ABACUS MNEMONICS BHIKKU KHAKI BWANA AORTA EMBOLISM VIVID OWLS OFTEN KVETCH OTHERWISE.` },
    { type: 'h2', text: `Part 4 — Numbers` },
    { type: 'p', text: `0010203040500607080900 10112131415116171819100 20212232425226272829200 30313233435336373839300 40414243445446474849400 (1)(2)(3)(4)(5)(6)(7)(8)(9)(0) $00 $10 $20 $30 £40 £50 £60 £70 00¢ 11¢ 22¢ 33¢ 44¢ 00% 0‰ 0-0.0,0…0° 11% 1‰ 1-1.1,1…1° 12% 2‰ 2-2.2,2…2°` },
  ],
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
export const TEXT_SOURCES = Object.keys(TEXT_PRESETS)

type SceneProps = {
  size: number; ls: string; leading: number; featStr: string
  source: string; measure: number; pairs: Set<string>; glyphSet: string; opszAuto: boolean
  paraStyles: ParaStyles
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
// share their base's `rclt` condition, so they inherit its thresholds/zone/colour.
// NFKD handles diacritics + compatibility forms (ª→a); EXTRA_MEMBERS covers
// non-decomposing look-alikes. Returns undefined for non-swap glyphs.
// Font-derived swap zone → colour (matches the GROUP_DEFS zone palette). '-'/'U' → none.
const ZONE_COLOR: Record<string, string> = { A: '#c97050', B: '#4a7fd4', G: '#4aad5c' }
// Codepoint behind a grid cell's char (skip the ◌ U+25CC carrier on combining marks).
const cpOf = (ch: string): number => (ch.charCodeAt(0) === 0x25CC ? ch.codePointAt(1)! : ch.codePointAt(0)!)
// Grid flash entries: every rclt-swap cell (base + aalt compounds) with its thresholds
// and per-band colour, precomputed from the font-derived GRID_SWAPS.
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

// Shared GEOM-crossing detector (EDIT mode only). As GEOM crosses a swapping
// glyph's threshold, that glyph is flagged with the zone colour of the variant it
// just entered — a persistent per-glyph colour, not a one-shot pulse. Landing on
// the neutral `default` master hard-clears the glyph (no colour). Only the active
// scene mounts, so exactly one detector runs.
//
// v2 behaviour, gated on `dragging` (= rail GEOM slider held, store.geomDragging):
//   dragging  → glyphs HOLD their colour; crossings hard-switch / hard-off in place.
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
        } else {                                            // hard-on / hard-switch to a zone colour
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
// While `dragging`, the span holds its colour (`geom-flash-hold`, no animation);
// on release it runs the keyframe fade (`geom-flash`) and `clear`s on animation end.
// Non-flashing runs stay plain (Fragment, no DOM).
function flashText(text: string, flashes: Flashes, clear: (ch: string) => void, dragging: boolean, kp = ''): ReactNode {
  // fast path: nothing here maps to a flashing group (composites resolve via groupKeyOf)
  if (![...text].some(ch => { const gk = groupKeyOf(ch); return gk && flashes[gk] })) return text
  const out: ReactNode[] = []
  let buf = '', runStart = 0
  const flush = () => { if (buf) { out.push(<Fragment key={`${kp}t${runStart}`}>{buf}</Fragment>); buf = '' } }
  ;[...text].forEach((ch, i) => {
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
type FlashCtx = { flashes: Flashes; clear: (ch: string) => void; dragging: boolean }

// Markdown inline renderer that ALSO flash-wraps swap glyphs (composites included).
// Mirrors renderInline's delimiters; each text run and each bold/italic/underline
// inner run is flash-wrapped with a unique key prefix so sibling runs never collide.
function flashInline(text: string, boldVs: string, italVs: string, fc: FlashCtx): ReactNode {
  const F = (s: string, kp: string) => flashText(s, fc.flashes, fc.clear, fc.dragging, kp)
  if (!/[*_]/.test(text)) return F(text, '')
  const out: ReactNode[] = []
  let last = 0, k = 0, m: RegExpExecArray | null
  const re = new RegExp(INLINE_RE)
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(<Fragment key={`s${k}`}>{F(text.slice(last, m.index), `s${k}-`)}</Fragment>)
    const delim = m[1], inner = m[2]
    if (delim === '**') out.push(<strong key={`b${k}`} style={{ fontVariationSettings: boldVs, fontWeight: 'normal', fontSynthesis: 'none' }}>{F(inner, `b${k}-`)}</strong>)
    else if (delim === '*') out.push(<em key={`i${k}`} style={{ fontVariationSettings: italVs, fontStyle: 'normal', fontSynthesis: 'none' }}>{F(inner, `i${k}-`)}</em>)
    else out.push(<u key={`u${k}`}>{F(inner, `u${k}-`)}</u>)
    k++
    last = m.index + m[0].length
  }
  if (last < text.length) out.push(<Fragment key={`s${k}`}>{F(text.slice(last), `s${k}-`)}</Fragment>)
  return out
}

// ── Editable-markdown plumbing (ported/extended from font-proofer) ───────────────
// Caret utilities.
function placeCaretAtStart(el: HTMLElement) {
  const r = document.createRange(), s = window.getSelection()
  r.setStart(el, 0); r.collapse(true); s?.removeAllRanges(); s?.addRange(r)
}
function placeCaretAtEnd(el: HTMLElement) {
  const r = document.createRange(), s = window.getSelection()
  r.selectNodeContents(el); r.collapse(false); s?.removeAllRanges(); s?.addRange(r)
}
function placeCaretAtOffset(el: HTMLElement, offset: number) {
  const tn = el.firstChild, len = tn?.textContent?.length ?? 0
  const r = document.createRange(), s = window.getSelection()
  r.setStart(tn ?? el, Math.min(Math.max(offset, 0), len)); r.collapse(true)
  s?.removeAllRanges(); s?.addRange(r)
}
// Character offset within el at a viewport point (so a click into a styled block
// lands the caret where you clicked, not at the start).
function caretCharOffset(el: HTMLElement, x: number, y: number): number {
  const doc = el.ownerDocument as Document & {
    caretPositionFromPoint?: (x: number, y: number) => { offsetNode: Node; offset: number } | null
    caretRangeFromPoint?: (x: number, y: number) => Range | null
  }
  let node: Node | null = null, offset = 0
  if (doc.caretPositionFromPoint) { const p = doc.caretPositionFromPoint(x, y); if (p) { node = p.offsetNode; offset = p.offset } }
  else if (doc.caretRangeFromPoint) { const rr = doc.caretRangeFromPoint(x, y); if (rr) { node = rr.startContainer; offset = rr.startOffset } }
  if (!node || !el.contains(node)) return el.textContent?.length ?? 0
  const r = document.createRange(); r.selectNodeContents(el); r.setEnd(node, offset)
  return r.toString().length
}

// Inline markdown → styled nodes: **bold** (wght axis), *italic* (ital axis),
// __underline__. Matched delimiters, non-greedy; nesting is not handled.
const INLINE_RE = /(\*\*|__|\*)(.+?)\1/g
function renderInline(text: string, boldVs: string, italVs: string): ReactNode {
  if (!/[*_]/.test(text)) return text
  const out: ReactNode[] = []
  let last = 0, k = 0, m: RegExpExecArray | null
  const re = new RegExp(INLINE_RE)
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index))
    const delim = m[1], inner = m[2]
    if (delim === '**') out.push(<strong key={k++} style={{ fontVariationSettings: boldVs, fontWeight: 'normal', fontSynthesis: 'none' }}>{inner}</strong>)
    else if (delim === '*') out.push(<em key={k++} style={{ fontVariationSettings: italVs, fontStyle: 'normal', fontSynthesis: 'none' }}>{inner}</em>)
    else out.push(<u key={k++}>{inner}</u>)
    last = m.index + m[0].length
  }
  if (last < text.length) out.push(text.slice(last))
  return out
}

// A single contentEditable region: raw markdown while focused (browser owns the DOM,
// caret stable), styled preview when not. `onCommit` fires live (input) + on blur.
function EditableText({ value, onCommit, className, style, boldVs, italVs, flash }: {
  value: string; onCommit: (t: string) => void
  className?: string; style?: CSSProperties; boldVs: string; italVs: string; flash?: FlashCtx
}) {
  const [focused, setFocused] = useState(false)
  const elRef = useRef<HTMLElement | null>(null)
  const pending = useRef<number | null>(null)
  useLayoutEffect(() => {
    if (focused && pending.current != null && elRef.current) placeCaretAtOffset(elRef.current, pending.current)
    pending.current = null
  }, [focused])
  return (
    <div
      ref={el => { elRef.current = el; if (el && !el.textContent) el.textContent = value }}
      contentEditable suppressContentEditableWarning spellCheck={false}
      className={className} style={style}
      onMouseDown={e => { if (!focused) pending.current = caretCharOffset(e.currentTarget, e.clientX, e.clientY) }}
      onFocus={() => setFocused(true)}
      onBlur={e => { const t = e.currentTarget.textContent ?? ''; e.currentTarget.textContent = ''; onCommit(t); setFocused(false) }}
      onInput={e => { if (focused) onCommit(e.currentTarget.textContent ?? '') }}>
      {focused ? null : (flash ? flashInline(value, boldVs, italVs, flash) : renderInline(value, boldVs, italVs))}
    </div>
  )
}

function Words({ size, ls, leading, featStr, opszAuto }: SceneProps) {
  const { state } = useInstrument()
  const vs = renderVarSettings(effectiveAxes(state), { skipOpsz: opszAuto })
  const { flashes, clear, dragging } = useGeomFlash()
  const [text, setText] = useState('Iʼll jag My cat, Guv 2160')
  const [focused, setFocused] = useState(false)
  return (
    <div className="stage-pad words-scene">
      <div className="words-edit specimen" contentEditable suppressContentEditableWarning
        style={{ fontSize: size, lineHeight: leading, textAlign: 'center', fontVariationSettings: vs, fontOpticalSizing: optical(opszAuto), fontFeatureSettings: featStr, letterSpacing: ls }}
        onFocus={() => setFocused(true)}
        onBlur={e => { setText(e.currentTarget.textContent ?? ''); setFocused(false) }}>
        {/* Uncontrolled while focused: no onInput→setState, so typing never re-renders
            and never resets the caret. Text is captured on blur, then flash-wrapped. */}
        {focused ? text : flashText(text, flashes, clear, dragging)}
      </div>
    </div>
  )
}

type EBlock = { id: string; type: Block['type']; text: string }
const presetBlocks = (source: string): EBlock[] =>
  (TEXT_PRESETS[source] ?? TEXT_PRESETS.Sample).map((b, i) => ({ id: `${source}-${i}`, type: b.type, text: b.text }))

function Paragraph({ featStr, source, measure, opszAuto, paraStyles }: SceneProps) {
  const { state } = useInstrument()
  const axes = effectiveAxes(state)
  const boldVs = renderVarSettings({ ...axes, wght: 700 }, { skipOpsz: opszAuto })
  const italVs = renderVarSettings({ ...axes, ital: 1 }, { skipOpsz: opszAuto })
  const flash = useGeomFlash()

  const [blocks, setBlocks] = useState<EBlock[]>(() => presetBlocks(source))
  const [focusedId, setFocusedId] = useState<string | null>(null)
  const refs = useRef<Record<string, HTMLElement>>({})
  const pending = useRef<{ id: string; offset: number } | null>(null)
  const seq = useRef(0)
  // Tracks the truly-active block synchronously so a stray blur (e.g. after Enter
  // re-renders the old block styled) doesn't commit stripped text over the raw markdown.
  const activeId = useRef<string | null>(null)
  const focus = (id: string | null) => { activeId.current = id; setFocusedId(id) }

  // Reload blocks when the source preset changes.
  const prevSource = useRef(source)
  useEffect(() => {
    if (prevSource.current !== source) { prevSource.current = source; setBlocks(presetBlocks(source)); focus(null) }
  }, [source])

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

  return (
    <div className="stage-pad">
      <div className="para-doc" style={{ maxWidth: `${measure}em` }}>
        {blocks.map(b => {
          const st = paraStyles[b.type]
          const blockVs = renderVarSettings({ ...axes, wght: st.wght }, { skipOpsz: opszAuto })
          const focused = focusedId === b.id
          return (
            <div key={b.id}
              ref={el => { if (el) { refs.current[b.id] = el; if (!el.textContent) el.textContent = b.text } else delete refs.current[b.id] }}
              contentEditable suppressContentEditableWarning spellCheck={false}
              className={`para-block para-block--${b.type}`}
              style={{ fontSize: st.size, lineHeight: st.leading, fontVariationSettings: blockVs, fontOpticalSizing: optical(opszAuto), fontFeatureSettings: featStr, letterSpacing: `${st.tracking / 100}em` }}
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
              {focused ? null : flashInline(b.text, boldVs, italVs, flash)}
            </div>
          )
        })}
      </div>
    </div>
  )
}

function Scale({ featStr, pairs, measure, ls, leading }: SceneProps) {
  const { state } = useInstrument()
  const axes = effectiveAxes(state)
  const mult = state.defaults.opszMultiplier
  const boldVs = renderVarSettings({ ...axes, wght: 700 }, {})
  const italVs = renderVarSettings({ ...axes, ital: 1 }, {})
  const vsFor = (px: number) => renderVarSettings(axes, { opszOverride: opszForSize(px, mult) })
  const use = BODY_TIERS.filter(t => pairs.has(t.key))   // none selected → no body pairings
  const flash = useGeomFlash()
  const [head, setHead] = useState(HEAD_WORD)
  const [body, setBody] = useState(PAIR_BODY)
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
          <EditableText value={head} onCommit={setHead} className="tier-head" boldVs={boldVs} italVs={italVs} flash={flash}
            style={{ fontSize: d.px, fontVariationSettings: vsFor(d.px), fontFeatureSettings: featStr, letterSpacing: ls, lineHeight: leading }} />
          {use.map(b => (
            <EditableText key={b.key} value={body} onCommit={setBody} className="tier-body" boldVs={boldVs} italVs={italVs} flash={flash}
              style={{ fontSize: b.px, fontVariationSettings: vsFor(b.px), fontFeatureSettings: featStr, letterSpacing: ls, lineHeight: leading }} />
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
  const vs = renderVarSettings(effectiveAxes(state), { skipOpsz: opszAuto })
  const { flashes, clear, dragging } = useGridFlash()
  const [ranges, setRanges] = useState<CmapRanges | null>(null)
  useEffect(() => { let alive = true; loadCmap().then(r => { if (alive) setRanges(r) }); return () => { alive = false } }, [])

  // "All" = every cmap codepoint + its aalt alternates (the unencoded variants);
  // the named sets are curated base-character subsets.
  const cells: GlyphCell[] = glyphSet === 'All'
    ? allGlyphsWithAlternates(ranges)
    : (GLYPH_SETS[glyphSet] ?? []).filter(g => isSupported(g, ranges)).map(ch => ({ ch, aalt: 0 }))
  return (
    <div className="stage-pad">
      <div className="glyph-grid">
        {cells.map((c, i) => {
          // aalt/case cells now enable 'rclt' too, so their GEOM swap actually renders.
          const base = c.caps ? "'case' 1" : c.aalt ? `'aalt' ${c.aalt}, 'rclt' 1` : featStr
          // Flash (hold-while-dragging / fade-on-release) any cell whose glyph rclt-swaps —
          // base OR alternate/compound (five.numr.rcltGeo…) — via the font-derived map.
          const fl = c.caps ? undefined : flashes[`${cpOf(c.ch)}:${c.aalt}`]
          return (
            <span key={`${i}-${fl?.nonce ?? 0}`}
              className={`glyph-cell${fl ? (dragging ? ' geom-flash-hold' : ' geom-flash') : ''}`}
              onAnimationEnd={fl && !dragging ? () => clear(`${cpOf(c.ch)}:${c.aalt}`) : undefined}
              style={{ fontVariationSettings: vs, fontOpticalSizing: optical(opszAuto), fontFeatureSettings: `${base}, 'mark' 1, 'mkmk' 1`, ...(fl && { ['--flash-color' as string]: fl.color }) }}>
              {c.ch}
            </span>
          )
        })}
      </div>
    </div>
  )
}

// UI: booking mock set with the baked ◆ defaults (ignores ● play) — "what shipping
// your ◆ looks like." Includes an Il1 stress line.
function UI({ featStr, opszAuto }: SceneProps) {
  const { state } = useInstrument()
  const vs = renderVarSettings(state.defaults.axes, { skipOpsz: opszAuto })
  const days = ['Mon 14', 'Tue 15', 'Wed 16', 'Thu 17']
  const times = ['9:00', '9:30', '10:00', '11:15', '1:00', '2:30']
  return (
    <div className="stage-pad">
      <div className="ui-card" style={{ fontVariationSettings: vs, fontOpticalSizing: optical(opszAuto), fontFeatureSettings: featStr }}>
        <div className="ui-h1">Book a call</div>
        <div className="ui-sub">30 min · Illustration review — Il1 lIeg0</div>
        <div className="ui-days">{days.map(d => <button key={d} className="ui-day">{d}</button>)}</div>
        <div className="ui-times">{times.map(t => <button key={t} className="ui-time">{t}</button>)}</div>
        <button className="ui-confirm">Confirm booking</button>
      </div>
    </div>
  )
}

export function Scene({ mode, ...props }: { mode: SceneMode } & SceneProps) {
  switch (mode) {
    case 'words': return <Words {...props} />
    case 'paragraph': return <Paragraph {...props} />
    case 'scale': return <Scale {...props} />
    case 'glyphs': return <Glyphs {...props} />
    case 'ui': return <UI {...props} />
  }
}

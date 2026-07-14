// Phase 4 — canvas scenes + the modebar. Content types only. Scene-specific
// controls (feature chips, measure, body pairings) live in the bottom play bar and
// are passed in as props; scenes here only read them. Everything renders through
// effective() (renderVarSettings) — one engine. Models ported from font-proofer.
import './scenes.css'
import { useState, useEffect } from 'react'
import { useInstrument } from './InstrumentProvider'
import { effectiveAxes } from './store'
import { renderVarSettings, opszForSize } from './render'
import { GLYPH_SETS, GLYPH_SET_KEYS, parseCmapRanges, isSupported, allGlyphsWithAlternates, type CmapRanges, type GlyphCell } from './glyphset'

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
export function SceneControls({ mode, source, setSource, measure, setMeasure, pairs, togglePair, glyphSet, setGlyphSet }: {
  mode: SceneMode
  source: string; setSource: (s: string) => void
  measure: number; setMeasure: (n: number) => void
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
      <div className="drawer-row">
        <span className="drawer-label">measure</span>
        <input type="range" min={16} max={52} step={1} value={measure} onChange={e => setMeasure(+e.target.value)} />
        <span className="drawer-val tnum">{measure}em</span>
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
      <div className="drawer-row">
        <span className="drawer-label">measure</span>
        <input type="range" min={16} max={52} step={1} value={measure} onChange={e => setMeasure(+e.target.value)} />
        <span className="drawer-val tnum">{measure}em</span>
      </div>
    </div>
  )
  return null
}

// TEXT_SOURCES is declared after TEXT_PRESETS below; forward use is fine (const hoist
// at module eval — SceneControls only reads it at render time).
// ── Ported data ────────────────────────────────────────────────────────────────
const PARA_STYLES: Record<'h1' | 'h2' | 'h3' | 'p', { size: number; leading: number }> = {
  h1: { size: 57, leading: 1.1 },
  h2: { size: 32, leading: 1.2 },
  h3: { size: 22, leading: 1.3 },
  p: { size: 18, leading: 1.6 },
}

type Block = { type: 'h1' | 'h2' | 'h3' | 'p'; text: string }
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
  { tag: 'ss01', label: 'ss01 (alt — GEOM manual)' },
  { tag: 'ss02', label: 'ss02 (alt — GEOM manual)' },
  { tag: 'ss03', label: 'ss03 (alt — GEOM manual)' },
]

// ── Scenes ──────────────────────────────────────────────────────────────────────
export const TEXT_SOURCES = Object.keys(TEXT_PRESETS)

type SceneProps = {
  size: number; ls: string; leading: number; featStr: string
  source: string; measure: number; pairs: Set<string>; glyphSet: string
}

function Words({ size, ls, leading, featStr }: SceneProps) {
  const { state } = useInstrument()
  const vs = renderVarSettings(effectiveAxes(state))
  const [text, setText] = useState('Iʼll jag My cat, Guv 2160')
  return (
    <div className="stage-pad words-scene">
      <div className="words-edit specimen" contentEditable suppressContentEditableWarning
        style={{ fontSize: size, lineHeight: leading, textAlign: 'center', fontVariationSettings: vs, fontFeatureSettings: featStr, letterSpacing: ls }}
        onInput={e => setText(e.currentTarget.textContent ?? '')}>
        {text}
      </div>
    </div>
  )
}

function Paragraph({ ls, featStr, source, measure }: SceneProps) {
  const { state } = useInstrument()
  const vs = renderVarSettings(effectiveAxes(state))
  const blocks = TEXT_PRESETS[source] ?? TEXT_PRESETS.Sample
  return (
    <div className="stage-pad">
      <div className="para-doc" style={{ maxWidth: `${measure}em` }}>
        {blocks.map((b, i) => {
          const st = PARA_STYLES[b.type]
          const Tag = b.type === 'p' ? 'p' : b.type
          return (
            <Tag key={i} className="para-block"
              style={{ fontSize: st.size, lineHeight: st.leading, fontVariationSettings: vs, fontFeatureSettings: featStr, letterSpacing: ls }}>
              {b.text}
            </Tag>
          )
        })}
      </div>
    </div>
  )
}

function Scale({ featStr, pairs, measure }: SceneProps) {
  const { state } = useInstrument()
  const eff = effectiveAxes(state)
  const mult = state.defaults.opszMultiplier
  const vsFor = (px: number) => renderVarSettings(eff, opszForSize(px, mult))
  const use = BODY_TIERS.filter(t => pairs.has(t.key))   // none selected → no body pairings
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
          <div className="tier-head" style={{ fontSize: d.px, fontVariationSettings: vsFor(d.px), fontFeatureSettings: featStr }}>{HEAD_WORD}</div>
          {use.map(b => (
            <p key={b.key} className="tier-body" style={{ fontSize: b.px, fontVariationSettings: vsFor(b.px), fontFeatureSettings: featStr }}>{PAIR_BODY}</p>
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

function Glyphs({ featStr, glyphSet }: SceneProps) {
  const { state } = useInstrument()
  const vs = renderVarSettings(effectiveAxes(state))
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
          // mark/mkmk position marks on ◌; `case` shows the capital-positioned combs.
          const base = c.caps ? "'case' 1" : c.aalt ? `'aalt' ${c.aalt}` : featStr
          return (
            <span key={i} className="glyph-cell"
              style={{ fontVariationSettings: vs, fontFeatureSettings: `${base}, 'mark' 1, 'mkmk' 1` }}>
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
function UI({ featStr }: SceneProps) {
  const { state } = useInstrument()
  const vs = renderVarSettings(state.defaults.axes)
  const days = ['Mon 14', 'Tue 15', 'Wed 16', 'Thu 17']
  const times = ['9:00', '9:30', '10:00', '11:15', '1:00', '2:30']
  return (
    <div className="stage-pad">
      <div className="ui-card" style={{ fontVariationSettings: vs, fontFeatureSettings: featStr }}>
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

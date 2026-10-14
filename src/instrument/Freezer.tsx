// The Freezer — the rail's 5th row. Glyph cards, after Timeless's "Pick alternates": a
// 2-column grid where every OpenType feature is a card with its sample glyph(s) LARGE, in
// the live font with the feature applied, the plain form dimmed beside it, and a plain
// name beneath (the raw tag is a whisper in the corner and the tooltip). A frozen card is
// outlined gold. Freezing a feature makes it a permanent default — previewed live via
// font-feature-settings, then fused into the default cmap only on download.
//
// Only SingleSubst (glyph→glyph) features are offered, because those are the ones the
// bake can actually fuse into the cmap — ligature/contextual features (liga, calt, frac,
// cvXX ligatures) can't be, and offering them would break what-you-preview-is-what-you-get.
//
// Gold is the freezer's color language (its own hue, vs the four GEOM zone colors):
// the frozen card's outline and name are gold here, and in the specimen the glyphs a freeze
// governs flash gold when you toggle it or drag GEOM (see useFrozenGold in scenes).
import { useInstrument } from './InstrumentProvider'
import { effectiveAxes, liveThresholds } from './store'
import { freezeConflicts, conflictCardLine, conflictPanelNote, type Conflict } from './freezeConflicts'
import { renderVarSettings } from './render'
import { SUBS } from '../data/substitutions'
import type { FeatureSet } from '../data/substitutions'

type Item = { tag: string; name: string; sample: string }
type Section = { title: string; items: Item[] }

// Representative glyphs shown as base → variant: the first three ASCII letters/digits the
// feature actually swaps (`chars`, read from the font's own GSUB). A few sets swap too many
// (Futura) or their name promises a letter the first three skip (A11Y I l a), so they get
// an explicit, legible sample.
const SAMPLE_OVERRIDE: Record<string, string> = {
  ss10: 'aut', ss11: 'aut',   // Futura alternatives — show the iconic a/u/t
  ss18: 'Ial',                // the name is "Accessible I l a"; its g would crowd out the l
}
const asciiChars = (f: FeatureSet): string => f.chars.filter(c => /^[A-Za-z0-9]$/.test(c)).slice(0, 3).join('')
const sampleFor = (ss: FeatureSet): string => SAMPLE_OVERRIDE[ss.tag] ?? (asciiChars(ss) || ss.tag)

// Plain card names — the font's own ss names run long or read like tags ("A11Y I l a");
// these say what the form IS, in the letters the card shows.
const NAME_OVERRIDE: Record<string, string> = {
  ss08: 'Constructed j y', ss09: 'Humanist j y',
  ss10: 'Futura a u t', ss11: 'Futura + ligatures',
  ss16: 'Humanist 6 and 9', ss17: 'Geometric 6 and 9',
  ss18: 'Accessible I l a', ss20: 'Horizontal sharps',
}
const nameFor = (ss: FeatureSet): string => NAME_OVERRIDE[ss.tag] ?? ss.name ?? ss.tag

// The bakeable non-ss features CalSans ships (all SingleSubst). Positional features
// (sups/subs/numr/dnom/sinf) are excluded — freezing them globally is nonsensical.
const FIGURE_ITEMS: Item[] = [
  { tag: 'tnum', name: 'Tabular', sample: '123' },
  { tag: 'pnum', name: 'Proportional', sample: '123' },
  { tag: 'zero', name: 'Slashed zero', sample: '0' },
]
// Off the Freezer: freezing `case` only makes sense if every letter were also forced to all caps, which ReCal won't do.
// const LETTER_ITEMS: Item[] = [
//   { tag: 'case', name: 'Case-sensitive', sample: 'H-' },
// ]

// The ae character variants swap no ASCII letter, so they get an explicit sample.
const CV_SAMPLE: Record<string, string> = {
  cv04: 'æ', cv05: 'æ',
}
const NAME_BY_TAG: Record<string, string> = {}
// A character variant someone froze (a preset does) — the Freezer lists only the ssXX
// sets, so these get their own cards, built on demand rather than all 42 up front.
// Ligature cvs (cv32+) have no SingleSubst and can't be frozen, so they never land here.
const cvItem = (tag: string): Item | null => {
  const cv = SUBS.charVariants.find(c => c.tag === tag)
  if (!cv) return null
  return { tag, name: cv.name ?? tag, sample: CV_SAMPLE[tag] ?? (asciiChars(cv) || tag) }
}

// Stylistic sets in their natural ssNN order.
const SECTIONS: Section[] = [
  { title: 'Figures', items: FIGURE_ITEMS },
  // { title: 'Letters', items: LETTER_ITEMS },   // empty without `case`, so no heading
  {
    title: 'Stylistic sets',
    items: SUBS.stylisticSets.map(ss => ({ tag: ss.tag, name: nameFor(ss), sample: sampleFor(ss) })),
  },
]

for (const sec of SECTIONS) for (const it of sec.items) NAME_BY_TAG[it.tag] = it.name

// The plain name for a frozen tag — the rail row's summary reads these instead of tags.
export const freezerName = (tag: string): string => NAME_BY_TAG[tag] ?? cvItem(tag)?.name ?? tag

export function Freezer() {
  const { state, dispatch } = useInstrument()
  const frozen = state.defaults.frozenFeatures
  // A frozen set the user's own GEOM swaps cover is hidden at their default GEOM (GEOM wins
  // over a frozen form). Computed from the live thresholds, so it follows a matrix drag.
  const thr = liveThresholds(state)
  const geom = state.defaults.axes.GEOM
  const conflictsOf = (tag: string): Conflict[] => {
    const f = SUBS.stylisticSets.find(x => x.tag === tag) ?? SUBS.charVariants.find(x => x.tag === tag)
    return f && frozen.includes(tag) ? freezeConflicts(f, thr, geom) : []
  }
  const hidden = frozen.map(tag => ({ tag, name: freezerName(tag), conflicts: conflictsOf(tag) })).filter(h => h.conflicts.length)
  // Render the sample at the current ◆ GEOM so "before" shows the form the user is
  // actually getting now; opsz pinned at 14 for a stable display size (matches Matrix).
  const vs = renderVarSettings(effectiveAxes(state), {
    opszOverride: state.defaults.freezeOpsz ? state.defaults.frozenOpszValue ?? 14 : 14,
  })
  const base: React.CSSProperties = {
    fontFamily: "'CalSansVF', sans-serif",
    fontVariationSettings: vs,
    fontOpticalSizing: 'none',
  }
  // Every cvXX currently frozen (only a preset can do that) leads the list, so it can be
  // seen and undone. Once unfrozen its card goes, like any other state it no longer has.
  const fromPreset = frozen.filter(t => t.startsWith('cv')).map(cvItem).filter((it): it is Item => !!it)
  const sections: Section[] = fromPreset.length ? [{ title: 'From your preset', items: fromPreset }, ...SECTIONS] : SECTIONS
  // One undo grain per click (reset undoes in one step too).
  const toggle = (tag: string) => { dispatch({ type: 'pushHistory' }); dispatch({ type: 'toggleFrozenFeature', tag }) }

  return (
    <div className="freezer">
      <div className="freezer-head">
        <span className="freezer-title">Freeze features</span>
        <button className="freezer-reset" disabled={!frozen.length}
          onClick={() => { dispatch({ type: 'pushHistory' }); frozen.forEach(t => dispatch({ type: 'toggleFrozenFeature', tag: t })) }}>
          reset
        </button>
      </div>

      {hidden.length > 0 && <p className="freezer-conflict" role="status">{conflictPanelNote(hidden)}</p>}

      {sections.map(section => (
        <div className="freezer-section" key={section.title}>
          <span className="freezer-section-title">{section.title}</span>
          <div className="freezer-grid">
            {section.items.map(it => {
              const on = frozen.includes(it.tag)
              const hid = hidden.find(h => h.tag === it.tag)
              return (
                <button key={it.tag} className={`freezer-card${on ? ' on' : ''}`}
                  onClick={() => toggle(it.tag)}
                  title={`${it.tag} — ${it.name}`} aria-pressed={on}>
                  <span className="freezer-card-top" aria-hidden>
                    <span className="freezer-card-base" style={{ ...base, fontFeatureSettings: "'rclt' 1" }}>{it.sample}</span>
                    <span className="freezer-card-tag">{it.tag}</span>
                  </span>
                  <span className="freezer-card-glyph" style={{ ...base, fontFeatureSettings: `'rclt' 1, '${it.tag}' 1` }}>{it.sample}</span>
                  <span className="freezer-card-name">{it.name.replace(/\//g, '/\u200b')}</span>
                  {hid && <span className="freezer-card-warn">{conflictCardLine(hid.conflicts)}</span>}
                </button>
              )
            })}
          </div>
        </div>
      ))}

      <p className="freezer-note">
        Freezing makes a feature part of your default outlines. Toggle one — or drag GEOM —
        and the glyphs it governs flash <span className="freezer-note-gold">gold</span>.
      </p>
    </div>
  )
}

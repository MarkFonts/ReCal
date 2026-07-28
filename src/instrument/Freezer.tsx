// The Freezer — the rail's 3rd descent tab. Follows Keynote's Typography panel (the
// pattern Figma & Framer both copied): sectioned lists where every OpenType feature is
// a row showing base → variant in the live font, a short name, and a checkbox. Freezing
// a feature makes it a permanent default — previewed live via font-feature-settings, then
// fused into the default cmap only on download (no font-feature-settings needed after).
//
// Only SingleSubst (glyph→glyph) features are offered, because those are the ones the
// bake can actually fuse into the cmap — ligature/contextual features (liga, calt, frac,
// cvXX ligatures) can't be, and offering them would break what-you-preview-is-what-you-get.
//
// Gold is the freezer's colour language (its own hue, vs the four GEOM zone colours):
// the "after" sample marks the frozen form here, and in the specimen the glyphs a freeze
// governs flash gold when you toggle it or drag GEOM (see useFrozenGold in scenes).
import { useInstrument } from './InstrumentProvider'
import { effectiveAxes } from './store'
import { renderVarSettings } from './render'
import { SUBS } from '../data/substitutions'
import type { FeatureSet } from '../data/substitutions'

type Item = { tag: string; name: string; sample: string }
type Section = { title: string; items: Item[] }

// Representative glyphs shown as base → variant. Stylistic sets derive theirs from
// `families` (the letters they touch); a few carry no families (the "6 and 9" sets) or
// too many (Futura), so they get an explicit, legible sample.
const SAMPLE_OVERRIDE: Record<string, string> = {
  ss10: 'aut', ss11: 'aut',   // Futura alternatives — show the iconic a/u/t
  ss16: '69', ss17: '69',     // 6-and-9 sets carry no `families`
}
const sampleFor = (ss: FeatureSet): string =>
  SAMPLE_OVERRIDE[ss.tag] ?? (ss.families.slice(0, 3).join('') || ss.tag)

// Short display labels — the font's own ss names run long and wrap; trim to a glance.
const NAME_OVERRIDE: Record<string, string> = {
  ss08: 'Constructed jy', ss09: 'Humanist jy',
  ss10: 'Futura', ss11: 'Futura + ligs',
  ss16: 'Humanist 6·9', ss17: 'Geometric 6·9',
  ss18: 'Accessible Ila', ss20: 'Horizontal sharps',
}
const nameFor = (ss: FeatureSet): string => NAME_OVERRIDE[ss.tag] ?? ss.name ?? ss.tag

// The bakeable non-ss features CalSans ships (all SingleSubst). Positional features
// (sups/subs/numr/dnom/sinf) are excluded — freezing them globally is nonsensical.
const FIGURE_ITEMS: Item[] = [
  { tag: 'tnum', name: 'Tabular', sample: '123' },
  { tag: 'pnum', name: 'Proportional', sample: '123' },
  { tag: 'zero', name: 'Slashed zero', sample: '0' },
]
const LETTER_ITEMS: Item[] = [
  { tag: 'case', name: 'Case-sensitive', sample: 'H-' },
]

// Stylistic sets in their natural ssNN order.
const SECTIONS: Section[] = [
  { title: 'Figures', items: FIGURE_ITEMS },
  { title: 'Letters', items: LETTER_ITEMS },
  {
    title: 'Stylistic sets',
    items: SUBS.stylisticSets.map(ss => ({ tag: ss.tag, name: nameFor(ss), sample: sampleFor(ss) })),
  },
]

export function Freezer() {
  const { state, dispatch } = useInstrument()
  const frozen = state.defaults.frozenFeatures
  // Render the sample at the current ◆ GEOM so "before" shows the form the user is
  // actually getting now; opsz pinned at 14 for a stable display size (matches Matrix).
  const vs = renderVarSettings(effectiveAxes(state), { opszOverride: 14 })
  const base: React.CSSProperties = {
    fontFamily: "'CalSansVF', sans-serif",
    fontVariationSettings: vs,
    fontOpticalSizing: 'none',
  }

  return (
    <div className="freezer">
      <div className="freezer-head">
        <span className="freezer-title">Freeze features</span>
        <button className="freezer-reset" disabled={!frozen.length}
          onClick={() => frozen.forEach(t => dispatch({ type: 'toggleFrozenFeature', tag: t }))}>
          reset
        </button>
      </div>

      {SECTIONS.map(section => (
        <div className="freezer-section" key={section.title}>
          <span className="freezer-section-title">{section.title}</span>
          <div className="freezer-list">
            {section.items.map(it => {
              const on = frozen.includes(it.tag)
              return (
                <button key={it.tag} className={`freezer-row${on ? ' on' : ''}`}
                  onClick={() => dispatch({ type: 'toggleFrozenFeature', tag: it.tag })}
                  title={`${it.tag} — ${it.name}`} role="checkbox" aria-checked={on}>
                  <span className="freezer-ba">
                    <span className="freezer-glyph" style={{ ...base, fontFeatureSettings: "'rclt' 1" }}>{it.sample}</span>
                    <span className="freezer-arrow" aria-hidden>→</span>
                    <span className={`freezer-glyph freezer-glyph--after${on ? ' on' : ''}`}
                      style={{ ...base, fontFeatureSettings: `'rclt' 1, '${it.tag}' 1` }}>{it.sample}</span>
                  </span>
                  <span className="freezer-name">{it.name}</span>
                  <span className={`freezer-check${on ? ' on' : ''}`} aria-hidden>
                    <svg viewBox="0 0 12 12" width="11" height="11"><path d="M2.5 6.2l2.2 2.3 4.8-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>
                  </span>
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

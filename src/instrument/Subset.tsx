// Row 7: what the export keeps. Included axes: uncheck one to bake it at its ◆ (its pad's
// clamp collapses to a point and loses its grabbers; re-checking restores the clamp, which
// the store kept underneath). opsz freezes through the Optical size row's own flag, so that
// checkbox and the Auto/Frozen segment are one state. Data optimization: what the bake strips.
import { useInstrument } from './InstrumentProvider'
import { axisFrozen, effectiveLimits, type DefaultsLayer } from './store'
import { Chevron } from '../../shared/index'

const AXES: { tag: string; name: string }[] = [
  { tag: 'wght', name: 'Weight' }, { tag: 'GEOM', name: 'Shape' }, { tag: 'opsz', name: 'Optical size' },
  { tag: 'SHRP', name: 'Sharpness' }, { tag: 'YTAS', name: 'Ascender' },
]
const CHARSETS: { id: DefaultsLayer['subsetCharset']; label: string }[] = [
  { id: 'latin1', label: 'Latin-1 (core Western)' }, { id: 'latinx', label: 'Latin Extended' }, { id: 'all', label: 'Everything in the font' },
]
const YTAS_AUTO_BLOCKED = 'Turn off Auto ascender to freeze the ascender: it follows the optical size.'

export const subsetSummary = (d: DefaultsLayer) => {
  const n = AXES.filter(a => axisFrozen(d, a.tag)).length
  const cs = CHARSETS.find(c => c.id === d.subsetCharset)?.label.split(' ')[0] ?? d.subsetCharset
  return `${n ? `${n} frozen` : 'all axes'} · ${cs}`
}

export function Subset({ note, onNote, blocked }: { note: boolean; onNote: () => void; blocked: string }) {
  const { state, dispatch } = useInstrument()
  const d = state.defaults
  const held = (tag: string) => (tag === 'opsz' || tag === 'YTAS') && d.autoAscender
  return (
    <>
      <div className="subset-title">Included axes</div>
      {AXES.map(a => {
        const frozen = axisFrozen(d, a.tag), off = held(a.tag)
        const why = a.tag === 'opsz' ? blocked : YTAS_AUTO_BLOCKED
        return (
          <label key={a.tag} className="rail-toggle" title={off ? why : undefined} style={off ? { opacity: .38, cursor: 'default' } : undefined}
            onPointerEnter={off && a.tag === 'opsz' ? onNote : undefined}>
            <input type="checkbox" checked={!frozen} disabled={off}
              onChange={e => { dispatch({ type: 'pushHistory' }); dispatch({ type: 'setFrozenAxis', tag: a.tag, frozen: !e.target.checked }) }} />
            {a.name} <span className="subset-tag">{a.tag}</span>
            {frozen && <span className="subset-at tnum">at {a.tag === 'opsz' ? d.frozenOpszValue ?? d.axes.opsz : Math.round(d.axes[a.tag])}</span>}
            {!frozen && <span className="subset-at tnum">{effectiveLimits(d, a.tag).join('–')}</span>}
          </label>
        )
      })}
      <label className="rail-toggle" style={{ opacity: .38, cursor: 'default' }}>
        <input type="checkbox" checked disabled />Italic <span className="subset-tag">ital</span><span className="subset-at">locked</span>
      </label>
      {note && d.autoAscender && <p className="rail-help rail-help--note" role="status">{blocked}</p>}

      <div className="subset-title">Data optimization</div>
      <label className="rail-toggle">
        <input type="checkbox" checked={d.subsetKeepFeatures} onChange={e => dispatch({ type: 'setSubsetOpt', key: 'subsetKeepFeatures', value: e.target.checked })} />
        Retain OpenType layout features <span className="subset-tag">calt, liga</span>
      </label>
      <label className="rail-toggle subset-charset">
        Character set
        <span className="wm-select-wrap">
          <select className="wm-select" value={d.subsetCharset}
            onChange={e => dispatch({ type: 'setSubsetOpt', key: 'subsetCharset', value: e.target.value })}>
            {CHARSETS.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
          </select>
          <Chevron dir={-1} width={12} height={7} />
        </span>
      </label>
      <p className="rail-help">The export keeps only what the clamps and this list reach: outlines outside a clamp go. Nothing here changes the preview.</p>
    </>
  )
}

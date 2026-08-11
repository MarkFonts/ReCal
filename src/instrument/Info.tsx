// Font info — a persistent side panel (not a scene toggle). Real Cal Sans metadata
// plus the two things only this tool shows: your ◆ deltas and the live construction
// count. All rows at the UI font size, one translucent A11y color (owner spec).
import { useInstrument } from './InstrumentProvider'
import { AXIS_RANGES, changedAxisTags, swapPointCount, glyphsEditedCount } from './store'

// Real CalSansVF metadata (from the binary's name/head/maxp tables). Static for now;
// Phase 6 can read these live from the loaded font.
const META = {
  family: 'Cal Sans',
  style: 'Regular',
  filename: 'CalSansVF.ttf',
  format: 'TrueType',
  upm: 1000,
  glyphs: 1543,
  version: '1.998',
  uniqueId: '1998-CalSansWORD-2026-06-15',
  designer: 'WORDMARK → Mark Davis',
  designerUrl: 'wordmark.nyc',
  vendor: 'WORD',
  copyright: '© 2026 Mark Davis DBA Wordmark',
  license: 'SIL Open Font License 1.1',
  licenseUrl: 'openfontlicense.org',
}

const AXES: { tag: string; name: string }[] = [
  { tag: 'opsz', name: 'Optical size' },
  { tag: 'GEOM', name: 'Geometric form' },
  { tag: 'wght', name: 'Weight' },
  { tag: 'YTAS', name: 'Ascender' },
  { tag: 'SHRP', name: 'Sharp' },
  { tag: 'ital', name: 'Italic' },
]

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="info-row">
      <span className="info-k">{label}</span>
      <span className="info-arrow">→</span>
      <span className="info-v">{value}</span>
    </div>
  )
}

export default function Info() {
  const { state, dispatch } = useInstrument()
  const { defaults, shipped } = state
  const changed = new Set(changedAxisTags(state))

  return (
    <aside className="info-panel tnum">
      <div className="info-sec">
        <div className="info-h">Your build</div>
        <div className="info-row">
          <span className="info-k">Build name</span>
          <span className="info-arrow">→</span>
          <input className="info-nameinput" value={state.buildName} spellCheck={false}
            onChange={e => dispatch({ type: 'setBuildName', name: e.target.value })} />
        </div>
        <Row label="Re-anchored" value={`${changed.size} ${changed.size === 1 ? 'axis' : 'axes'}`} />
        <Row label="Construction" value={`${swapPointCount(state)} swaps · ${glyphsEditedCount(state)} edited`} />
        <Row label="Opsz scale" value={`×${defaults.opszMultiplier}${defaults.freezeOpsz ? ' · frozen' : ''}`} />
      </div>

      <div className="info-sec">
        <div className="info-h">Names</div>
        <Row label="Font family" value={META.family} />
        <Row label="Font style" value={META.style} />
      </div>

      <div className="info-sec">
        <div className="info-h">Font file</div>
        <Row label="Filename" value={META.filename} />
        <Row label="Format" value={META.format} />
        <Row label="Variable" value="Yes" />
        <Row label="Units per em" value={META.upm} />
        <Row label="Glyph count" value={META.glyphs} />
      </div>

      <div className="info-sec">
        <div className="info-h">Variable axes</div>
        {AXES.map(({ tag, name }) => {
          const { min, max } = AXIS_RANGES[tag]
          const yours = Math.round(defaults.axes[tag])
          const on = changed.has(tag)
          return (
            <Row key={tag} label={`${name} (${tag})`} value={
              <>{min}–{max}, default {Math.round(shipped[tag])}
                {on && <span className="info-yours"> · yours ◆ {yours}</span>}</>
            } />
          )
        })}
      </div>

      <div className="info-sec">
        <div className="info-h">Version</div>
        <Row label="Version" value={META.version} />
        <Row label="Unique ID" value={META.uniqueId} />
      </div>

      <div className="info-sec">
        <div className="info-h">Foundry</div>
        <Row label="Designer" value={META.designer} />
        <Row label="Designer URL" value={META.designerUrl} />
        <Row label="Vendor ID" value={META.vendor} />
      </div>

      <div className="info-sec">
        <div className="info-h">Copyright</div>
        <div className="info-block">{META.copyright}</div>
      </div>

      <div className="info-sec">
        <div className="info-h">Licence</div>
        <div className="info-block">{META.license}</div>
        <div className="info-block">{META.licenseUrl}</div>
      </div>
    </aside>
  )
}

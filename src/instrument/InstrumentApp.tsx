// Phase 0 harness — NOT the instrument UI. It exists only to prove the three-layer
// store + selectors are wired and reactive before Phase 2 builds the real shell.
// Reachable at ?ui=instrument; the classic app stays the default.
import { InstrumentProvider, useInstrument } from './InstrumentProvider'
import {
  AXIS_RANGES, effectiveAxes, mergedAxes, previewDrifted, stateTag,
} from './store'

const TAGS = ['wght', 'GEOM', 'opsz', 'YTAS', 'SHRP', 'ital'] as const
const step = (tag: string) => (tag === 'ital' ? 0.01 : 1)

const TAG_STYLE: Record<ReturnType<typeof stateTag>, { label: string; color: string }> = {
  YOUR: { label: 'YOUR ◆', color: '#e8e8e8' },
  PREVIEWING: { label: 'PREVIEWING ●', color: '#999' },
  STOCK: { label: 'STOCK', color: '#c97050' },
}

function Harness() {
  const { state, dispatch } = useInstrument()
  const eff = effectiveAxes(state)
  const merged = mergedAxes(state)
  const tag = TAG_STYLE[stateTag(state)]

  return (
    <div style={{ maxWidth: 860, margin: '0 auto', padding: '32px 24px', fontFamily: 'CalSansVF, sans-serif', color: '#e8e8e8' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 16, marginBottom: 4 }}>
        <h1 style={{ margin: 0, fontSize: 22 }}>Instrument store — Phase 0 harness</h1>
        <span style={{ padding: '2px 10px', borderRadius: 999, background: '#1a1a1a', color: tag.color, fontWeight: 700, fontSize: 13 }}>
          {tag.label}
        </span>
      </div>
      <p style={{ color: '#888', fontSize: 13, marginTop: 0 }}>
        Not the real UI. Proves SHIPPED / defaults ◆ / preview ● + merged() / effective().
      </p>

      <table style={{ width: '100%', borderCollapse: 'collapse', fontVariantNumeric: 'tabular-nums', fontSize: 14 }}>
        <thead>
          <tr style={{ textAlign: 'left', color: '#888', borderBottom: '1px solid #333' }}>
            <th style={{ padding: '8px 6px' }}>axis</th>
            <th style={{ padding: '8px 6px' }}>SHIPPED</th>
            <th style={{ padding: '8px 6px' }}>default ◆</th>
            <th style={{ padding: '8px 6px' }}>preview ●</th>
            <th style={{ padding: '8px 6px' }}>merged</th>
            <th style={{ padding: '8px 6px' }}>effective</th>
          </tr>
        </thead>
        <tbody>
          {TAGS.map(t => {
            const { min, max } = AXIS_RANGES[t]
            const overridden = t in state.preview
            return (
              <tr key={t} style={{ borderBottom: '1px solid #222' }}>
                <td style={{ padding: '8px 6px', fontWeight: 700 }}>{t}</td>
                <td style={{ padding: '8px 6px', color: '#666' }}>{state.shipped[t]}</td>
                <td style={{ padding: '8px 6px' }}>
                  <input type="range" min={min} max={max} step={step(t)} value={state.defaults.axes[t]}
                    onChange={e => dispatch({ type: 'setDefaultAxis', tag: t, value: +e.target.value })} />
                  <span style={{ marginLeft: 8, color: '#e8e8e8' }}>{state.defaults.axes[t]}</span>
                </td>
                <td style={{ padding: '8px 6px' }}>
                  <input type="range" min={min} max={max} step={step(t)} value={merged[t]}
                    onChange={e => dispatch({ type: 'setPreview', tag: t, value: +e.target.value })} />
                  <span style={{ marginLeft: 8, color: overridden ? '#999' : '#444' }}>
                    {overridden ? state.preview[t] : '—'}
                  </span>
                </td>
                <td style={{ padding: '8px 6px', color: '#bbb' }}>{merged[t]}</td>
                <td style={{ padding: '8px 6px', fontWeight: 700, color: state.stockHold ? '#c97050' : '#e8e8e8' }}>{eff[t]}</td>
              </tr>
            )
          })}
        </tbody>
      </table>

      <div style={{ display: 'flex', gap: 10, marginTop: 20, flexWrap: 'wrap' }}>
        <button
          onPointerDown={() => dispatch({ type: 'setStockHold', held: true })}
          onPointerUp={() => dispatch({ type: 'setStockHold', held: false })}
          onPointerLeave={() => state.stockHold && dispatch({ type: 'setStockHold', held: false })}
          style={btn}
        >hold: original Cal Sans</button>
        <button
          disabled={!previewDrifted(state)}
          onClick={() => dispatch({ type: 'clearPreview' })}
          style={{ ...btn, opacity: previewDrifted(state) ? 1 : 0.4 }}
        >Return to your defaults</button>
        <button onClick={() => dispatch({ type: 'resetDefaults' })} style={btn}>Reset defaults ◆</button>
      </div>

      <p style={{ color: '#666', fontSize: 12, marginTop: 24 }}>
        activePreset: {state.activePreset ?? '—'} · opszMultiplier: {state.defaults.opszMultiplier}× ·
        freezeOpsz: {String(state.defaults.freezeOpsz)} · autoAscender: {String(state.defaults.autoAscender)}
      </p>
    </div>
  )
}

const btn: React.CSSProperties = {
  padding: '8px 14px', borderRadius: 8, border: '1px solid #333',
  background: '#1a1a1a', color: '#e8e8e8', cursor: 'pointer', fontSize: 13,
}

export default function InstrumentApp() {
  return (
    <InstrumentProvider>
      <Harness />
    </InstrumentProvider>
  )
}

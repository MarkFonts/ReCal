// Phase 0 harness — NOT the instrument UI. It exists only to prove the three-layer
// store + selectors are wired and reactive before Phase 2 builds the real shell.
// Phase 1 wires it to the design tokens (tokens.css) as a first consumer.
// Reachable at ?ui=instrument; the classic app stays the default.
import './tokens.css'
import { InstrumentProvider, useInstrument } from './InstrumentProvider'
import {
  AXIS_RANGES, effectiveAxes, mergedAxes, previewDrifted, stateTag,
} from './store'

const TAGS = ['wght', 'GEOM', 'opsz', 'YTAS', 'SHRP', 'ital'] as const
const step = (tag: string) => (tag === 'ital' ? 0.01 : 1)

const TAG_STYLE: Record<ReturnType<typeof stateTag>, { label: string; color: string }> = {
  YOUR: { label: 'YOUR ◆', color: 'var(--marker-default)' },
  PREVIEWING: { label: 'PREVIEWING ●', color: 'var(--marker-preview)' },
  STOCK: { label: 'STOCK', color: 'var(--state-stock)' },
}

function Harness() {
  const { state, dispatch } = useInstrument()
  const eff = effectiveAxes(state)
  const merged = mergedAxes(state)
  const tag = TAG_STYLE[stateTag(state)]

  return (
    <div style={{ maxWidth: 860, margin: '0 auto', padding: '32px 24px' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 16, marginBottom: 4 }}>
        <h1 style={{ margin: 0, fontSize: 22 }}>Instrument store — Phase 0 harness</h1>
        <span style={{ padding: '2px 10px', borderRadius: 'var(--radius-pill)', background: 'var(--surface-2)', color: tag.color, fontWeight: 700, fontSize: 13 }}>
          {tag.label}
        </span>
      </div>
      <p style={{ color: 'var(--text-muted)', fontSize: 13, marginTop: 0 }}>
        Not the real UI. Proves SHIPPED / defaults ◆ / preview ● + merged() / effective(), on tokens.
      </p>

      <table className="tnum" style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
        <thead>
          <tr style={{ textAlign: 'left', color: 'var(--text-muted)', borderBottom: '1px solid var(--border)' }}>
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
              <tr key={t} style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                <td style={{ padding: '8px 6px', fontWeight: 700 }}>{t}</td>
                <td style={{ padding: '8px 6px', color: 'var(--text-dim)' }}>{state.shipped[t]}</td>
                <td style={{ padding: '8px 6px' }}>
                  <input type="range" min={min} max={max} step={step(t)} value={state.defaults.axes[t]}
                    onChange={e => dispatch({ type: 'setDefaultAxis', tag: t, value: +e.target.value })} />
                  <span style={{ marginLeft: 8, color: 'var(--marker-default)' }}>{state.defaults.axes[t]}</span>
                </td>
                <td style={{ padding: '8px 6px' }}>
                  <input type="range" min={min} max={max} step={step(t)} value={merged[t]}
                    onChange={e => dispatch({ type: 'setPreview', tag: t, value: +e.target.value })} />
                  <span style={{ marginLeft: 8, color: overridden ? 'var(--marker-preview)' : 'var(--text-faint)' }}>
                    {overridden ? state.preview[t] : '—'}
                  </span>
                </td>
                <td style={{ padding: '8px 6px', color: 'var(--text-muted)' }}>{merged[t]}</td>
                <td style={{ padding: '8px 6px', fontWeight: 700, color: state.stockHold ? 'var(--state-stock)' : 'var(--text)' }}>{eff[t]}</td>
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

      <p className="tnum" style={{ color: 'var(--text-dim)', fontSize: 12, marginTop: 24 }}>
        activePreset: {state.activePreset ?? '—'} · opszMultiplier: {state.defaults.opszMultiplier}× ·
        freezeOpsz: {String(state.defaults.freezeOpsz)} · autoAscender: {String(state.defaults.autoAscender)}
      </p>
    </div>
  )
}

const btn: React.CSSProperties = {
  padding: '8px 14px', borderRadius: 'var(--radius)', border: '1px solid var(--border)',
  background: 'var(--surface-2)', color: 'var(--text)', cursor: 'pointer', fontSize: 13,
  fontFamily: 'var(--ui-font)',
}

export default function InstrumentApp() {
  return (
    <div className="instrument-root">
      <InstrumentProvider>
        <Harness />
      </InstrumentProvider>
    </div>
  )
}

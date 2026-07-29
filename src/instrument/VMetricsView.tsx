// Vertical Metrics — the rail's 4th descent tab, plus the canvas preview it drives.
//
//   VMetricsPanel  (rail)   — mirrors the Freezer's shape: a VERTICAL METRICS header over a
//                             "Line Metrics" section. A preset dropdown (WORDMARK default /
//                             ArrowType spec / Google Fonts spec) seeds the numbers; an hhea
//                             strategy dropdown re-derives them; a Line Gap field, the
//                             Use-Typo toggle and the Ascender (YTAS) pin round it out.
//   VMetricsScene  (canvas) — "Ắ Match fpv" with the design metric lines (ascender/cap/
//                             x-height/baseline/descender) drawn from the font's recorded
//                             values — the ascender tracking YTAS, the axis that raises it —
//                             on the LEFT, the editable win box on the RIGHT. Black bars top
//                             & bottom show how some apps crop to the win box: tighten the
//                             ascent below Ắ's 993 and the top bar bites the accent.
//
// Reference lines are analytic, not measured: SVG getBBox returns the em/ascent box, not
// per-glyph ink (every normal glyph reports the same top), so the recorded design metrics
// are the honest source. The specimen itself renders every axis live.
import { useEffect, useRef, type ReactNode } from 'react'
import { useInstrument } from './InstrumentProvider'
import { effectiveAxes } from './store'
import { renderVarSettings } from './render'
import {
  VM_PRESETS, FONT_METRICS, lineHeight, matchAll, centerCapAll, winToBounds,
  presetById, xHeightAt, type VMetrics,
} from './vmetrics'

// ── Rail controls ───────────────────────────────────────────────────────────────
export function VMetricsPanel({ ytasPin }: { ytasPin?: ReactNode }) {
  const { state, dispatch } = useInstrument()
  const vm = state.defaults.vmetrics
  const set = (value: VMetrics) => dispatch({ type: 'setVMetrics', value })

  const lh = lineHeight(vm.hhea)
  const accentClip = FONT_METRICS.accentTop - vm.win.asc   // does the win box crop Ắ / descenders?
  const descClip = -FONT_METRICS.descender - vm.win.desc
  const active = presetById(vm.preset)

  return (
    <div className="freezer vmetrics-panel">
      <div className="freezer-section">
        <div className="freezer-head">
          <span className="freezer-title">Line Metrics</span>
          <span className="vm-head-right">
            <span className="vm-lh tnum" title="hhea line height">{(lh / FONT_METRICS.upm).toFixed(2)}em</span>
            <button className="freezer-reset" disabled={vm.preset === 'wordmark'}
              onClick={() => set({ preset: 'wordmark', ...VM_PRESETS[0].metrics })}>reset</button>
          </span>
        </div>

        <select className="rail-preset" value={vm.preset === 'custom' ? 'custom' : vm.preset}
          onChange={e => { const p = presetById(e.target.value as VMetrics['preset']); if (p) set({ preset: p.id, ...p.metrics }) }}>
          {vm.preset === 'custom' && <option value="custom">Custom{active ? '' : ' (edited)'}</option>}
          {VM_PRESETS.map(p => <option key={p.id} value={p.id}>{p.label}</option>)}
        </select>

        <select className="rail-preset vm-strategy" value=""
          onChange={e => {
            if (e.target.value === 'match') set(matchAll(vm))
            else if (e.target.value === 'center') set(centerCapAll(vm))
            else if (e.target.value === 'bounds') set(winToBounds(vm))
          }}>
          <option value="" disabled>Match metrics…</option>
          <option value="match">Match hhea, typo &amp; win</option>
          <option value="center">Match hhea &amp; win to center cap</option>
          <option value="bounds">Match hhea &amp; typo, win = yMax/yMin</option>
        </select>

        <div className="vm-row">
          <span className="vm-row-label">Line Gap</span>
          {/* edits the gap of the metric the preview actually reads (hhea, or typo when
              Use Typo is on), so changing it always moves the previewed line height */}
          <input className="vm-num tnum" type="number" step={10}
            value={(vm.useTypo ? vm.typo : vm.hhea).gap}
            onChange={e => { const k = vm.useTypo ? 'typo' : 'hhea'; set({ ...vm, preset: 'custom', [k]: { ...vm[k], gap: +e.target.value } }) }} />
        </div>

        <label className="vm-toggle">
          <input type="checkbox" checked={vm.useTypo}
            onChange={e => set({ ...vm, preset: 'custom', useTypo: e.target.checked })} />
          <span className="vm-toggle-lbl">Use Typo Metrics <span className="vm-warn">(not recommended)</span></span>
        </label>

        {ytasPin && <div className="vm-pin">{ytasPin}</div>}

        <div className="vm-table tnum">
          <div className="vm-tr vm-tr--head"><span /><span>asc</span><span>desc</span><span>gap</span></div>
          <div className="vm-tr"><span>hhea</span><span>{vm.hhea.asc}</span><span>{vm.hhea.desc}</span><span>{vm.hhea.gap}</span></div>
          <div className="vm-tr"><span>typo</span><span>{vm.typo.asc}</span><span>{vm.typo.desc}</span><span>{vm.typo.gap}</span></div>
          <div className="vm-tr"><span>win</span><span>{vm.win.asc}</span><span>{vm.win.desc}</span><span>—</span></div>
        </div>

        <p className="vm-note">
          {accentClip > 0 || descClip > 0
            ? <>Win box crops {accentClip > 0 && <b>Ắ by {accentClip}u</b>}
                {accentClip > 0 && descClip > 0 && ' and '}
                {descClip > 0 && <b>descenders by {descClip}u</b>} — see the black bars.</>
            : <>Win box clears every glyph — no clipping.</>}
        </p>
      </div>
    </div>
  )
}

// ── Canvas preview ────────────────────────────────────────────────────────────────
// Fixed frame (SVG user units). The viewBox WIDTH is constant so the specimen never
// rescales when a wider/bolder weight is previewed — only its own width changes. The
// widest instance ("Ắ Match fpv" at wght 700 ≈ 1803u) fits inside SPEC_MAX with margin.
const SPECIMEN = 'Ắ Match fpv'
const FS = 300              // specimen size in user units
const BASE = 340            // baseline y
const XL = 250              // right edge of the left (design) label column, right-aligned
const LINE_L = 300          // metric lines start x
const X0 = 330              // specimen left edge
const SPEC_MAX = 1850       // reserved specimen width (fits the widest weight)
const LINE_R = X0 + SPEC_MAX // metric lines end x
const WIN_LABEL_X = LINE_R + 24
const FRAME_W = WIN_LABEL_X + 260   // constant viewBox width → constant scale

export function VMetricsScene() {
  const { state } = useInstrument()
  const vm = state.defaults.vmetrics
  const axes = effectiveAxes(state)
  const vs = renderVarSettings(axes)
  // Editable specimen: seed the initial text once via the ref (uncontrolled) so re-renders
  // from axis/metric changes never reset the caret — only the style updates.
  const editRef = useRef<HTMLDivElement>(null)
  useEffect(() => { if (editRef.current && !editRef.current.textContent) editRef.current.textContent = SPECIMEN }, [])
  const yOf = (u: number) => BASE - (u / FONT_METRICS.upm) * FS
  // The Ascender line IS the YTAS value (the ascender-height axis) — at the 720 default it
  // coincides exactly with Cap Height (720), so their rules share one line (no gap); raising
  // YTAS lifts it above the cap. The rest are the font's recorded design metrics. Win
  // descent is a positive integer (usWinDescent).
  const ascU = axes.YTAS ?? FONT_METRICS.cap
  const winTop = yOf(vm.win.asc)
  const winBot = yOf(-vm.win.desc)
  const capY = yOf(FONT_METRICS.cap)
  const ascY = yOf(ascU)

  // Centre the viewBox on the specimen's optical centre (a fixed point above the baseline,
  // NOT the win-box midpoint — the win box is top-heavy and would ride the specimen low),
  // so the specimen sits where the Words specimen does, whatever preset is active. The
  // flex-centred black stage then fills above and below → a full-bleed letterbox. Width is
  // fixed, so a bolder/wider weight never rescales the specimen.
  const refY = yOf(300)   // ~optical centre of "Ắ Match fpv"
  const contentTop = Math.min(winTop, yOf(FONT_METRICS.accentTop), ascY) - 44
  const contentBot = Math.max(winBot, yOf(FONT_METRICS.descender)) + 44
  const half = Math.max(refY - contentTop, contentBot - refY)
  const view = { x: 0, y: refY - half, w: FRAME_W, h: half * 2 }

  return (
    <div className="vmetrics-stage">
      <svg className="vm-svg" viewBox={`${view.x} ${view.y} ${view.w} ${view.h}`}
        preserveAspectRatio="xMidYMid meet" role="img" aria-label={`Vertical metrics preview: ${SPECIMEN}`}>
        {/* the open slot (app background) between the win-box edges; everything else is black */}
        <rect className="vm-slot" x={view.x} y={winTop} width={view.w} height={Math.max(0, winBot - winTop)} />
        {/* overflow:visible so nothing that pokes past the pen box is clipped — accents above
            the ascent (Ắ), negative side-bearings to the left, long typed text to the right.
            The SVG viewBox is the only bound. y puts the baseline on BASE (0.825 = measured). */}
        <foreignObject x={X0} y={BASE - FS * 0.825} width={FS} height={FS} style={{ overflow: 'visible' }}>
          <div ref={editRef} contentEditable suppressContentEditableWarning spellCheck={false}
            className="vm-spec-edit"
            style={{ fontFamily: "'CalSansVF', sans-serif", fontVariationSettings: vs, fontSize: `${FS}px`, lineHeight: `${FS}px` }} />
        </foreignObject>

        {/* black bars over the specimen — crop it to the win box (blend into the stage) */}
        <rect className="vm-crop" x={view.x} y={view.y} width={view.w} height={Math.max(0, winTop - view.y)} />
        <rect className="vm-crop" x={view.x} y={winBot} width={view.w} height={Math.max(0, view.y + view.h - winBot)} />

        {/* design metric lines — recorded font values — with labels on the LEFT */}
        {[
          { y: capY, label: 'Cap Height' },
          { y: yOf(xHeightAt(axes.wght, axes.opsz)), label: 'x-Height' },
          { y: BASE, label: 'Baseline', base: true },
          { y: yOf(FONT_METRICS.descender), label: 'Descender' },
        ].map(l => (
          <g key={l.label}>
            <line className={`vm-line${l.base ? ' vm-line--base' : ''}`} x1={LINE_L} y1={l.y} x2={LINE_R} y2={l.y} />
            <text className="vm-line-lbl" x={XL} y={l.y} textAnchor="end" dominantBaseline="middle">{l.label}</text>
          </g>
        ))}
        {/* Ascender = YTAS; at the 720 default its rule coincides with Cap Height's (one
            line, no gap). The label tucks one line above Cap Height and rides up with YTAS. */}
        <line className="vm-line" x1={LINE_L} y1={ascY} x2={LINE_R} y2={ascY} />
        <text className="vm-line-lbl" x={XL} y={ascY - 25} textAnchor="end" dominantBaseline="middle">Ascender</text>

        {/* win box crop edges — the editable metric — with labels on the RIGHT */}
        <line className="vm-line vm-cropedge" x1={LINE_L} y1={winTop} x2={LINE_R} y2={winTop} />
        <line className="vm-line vm-cropedge" x1={LINE_L} y1={winBot} x2={LINE_R} y2={winBot} />
        <text className="vm-crop-lbl" x={WIN_LABEL_X} y={winTop} dominantBaseline="middle">Win ascent {vm.win.asc}</text>
        <text className="vm-crop-lbl" x={WIN_LABEL_X} y={winBot} dominantBaseline="middle">Win descent {vm.win.desc}</text>
      </svg>
    </div>
  )
}

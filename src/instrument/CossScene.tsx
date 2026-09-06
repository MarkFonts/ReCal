// ReCal's UI / coss scene — now a thin wrapper over the shared wm-primitives
// UiKitBoard (the component-gallery board lived here as a ~750-line near-copy of
// font-proofer's UiPreview; it's one shared source now). This builds the live font
// style from the store — variable axes, features, weight, and the Vertical-Metrics
// vars — and hands it to the board. coss.css stays imported because scenes.tsx also
// leans on a few of its ui-*/coss-* classes; the board brings its own ukit-* CSS.
import './coss.css'
import { UiKitBoard } from '../../shared/index'
import { useInstrument } from './InstrumentProvider'
import { renderVarSettings } from './render'
import { effectiveLineHeightEm, capShiftEm } from './vmetrics'
import type { CSSProperties } from 'react'
import type { SceneProps } from './scenes'

export default function CossScene({ featStr, topInset }: SceneProps) {
  const { state } = useInstrument()
  const dax = state.defaults.axes
  const defWght = Math.round(dax.wght ?? 400)
  // Base settings EXCLUDE wght (→ --w-default / --w-bold on the board) and ital
  // (italic maps to the real ital axis via the board's font-style, not a faux slant).
  const bodyAxes = Object.fromEntries(Object.entries(dax).filter(([k]) => k !== 'wght' && k !== 'ital'))
  const bodyVs = renderVarSettings(bodyAxes, { skipOpsz: true })
  const fontStyle: CSSProperties = {
    fontFamily: "'CalSansVF', sans-serif",
    fontVariationSettings: bodyVs,
    // Also as a custom property: the italic rule in coss.css OVERRIDES
    // font-variation-settings to add 'ital' 1, which drops everything inherited. It
    // rebuilds from var(--vs), so without this line italics lost GEOM/YTAS/SHRP.
    ['--vs' as string]: bodyVs,
    fontOpticalSizing: 'auto',
    fontFeatureSettings: featStr,
    // On the Vertical Metrics tab the board re-spaces and slides caps from these vars.
    ...(state.railGroup === 3 ? {
      ['--vm-lh' as string]: String(effectiveLineHeightEm(state.defaults.vmetrics)),
      ['--vm-shift' as string]: `${capShiftEm(state.defaults.vmetrics)}em`,
    } : {}),
  }
  return <UiKitBoard fontStyle={fontStyle} weight={defWght} boldWeight={Math.min(900, defWght + 300)} topInset={topInset} />
}

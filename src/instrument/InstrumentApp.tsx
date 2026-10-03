// Instrument-model entry. Gated behind ?ui=instrument; the classic app is the default.
import './tokens.css'
import '../../shared/src/corners.css'
import '../../shared/src/color.css'    // the ramp, as DEFAULTS (wm-primitives). Layered,
                                       // so tokens.css always wins -- this only decides what
                                       // a token resolves to when nothing here defines it.
import '../../shared/src/type.css'
/* THE HOUSE GRID: the columns, the margin and the 3px line (#root is .wm-lines in index.html),
   and gridSnap.js, which puts what CSS cannot place onto it. */
import '../../shared/src/grid.css'
import '../../shared/src/motion.css'   // --dur-* (wm-primitives)
import '../../shared/src/editRail.css' // canonical edit-rail affordance (wm-primitives)
import { InstrumentProvider } from './InstrumentProvider'
import Shell from './Shell'
import { useEffect } from 'react'
import { loadGridSnap, snapGrid } from './snapGrid'

loadGridSnap()

export default function InstrumentApp() {
  useEffect(() => { snapGrid() }, [])
  return (
    <div className="instrument-root">
      <InstrumentProvider>
        <Shell />
      </InstrumentProvider>
    </div>
  )
}

// Instrument-model entry. Gated behind ?ui=instrument; the classic app is the default.
import './tokens.css'
import '../../shared/src/corners.css'
import '../../shared/src/color.css'    // the ramp, as DEFAULTS (wm-primitives). Layered,
                                       // so tokens.css always wins -- this only decides what
                                       // a token resolves to when nothing here defines it.
import '../../shared/src/type.css'
import '../../shared/src/motion.css'   // --dur-* (wm-primitives)
import '../../shared/src/editRail.css' // canonical edit-rail affordance (wm-primitives)
import { InstrumentProvider } from './InstrumentProvider'
import Shell from './Shell'

export default function InstrumentApp() {
  return (
    <div className="instrument-root">
      <InstrumentProvider>
        <Shell />
      </InstrumentProvider>
    </div>
  )
}

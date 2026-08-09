// Instrument-model entry. Gated behind ?ui=instrument; the classic app is the default.
import './tokens.css'
import '../../shared/src/type.css'
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

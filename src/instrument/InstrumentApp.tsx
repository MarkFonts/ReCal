// Instrument-model entry. Gated behind ?ui=instrument; the classic app is the default.
import './tokens.css'
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

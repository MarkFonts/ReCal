// React binding for the instrument store: one provider, one hook.
// Rail / canvas / floor all read and dispatch through useInstrument().
import { createContext, useContext, useReducer, type Dispatch, type ReactNode } from 'react'
import { createInitialState, reducer, type InstrumentState, type Action } from './store'
import { BOOT } from './boot'

type Store = { state: InstrumentState; dispatch: Dispatch<Action> }
const Ctx = createContext<Store | null>(null)

export function InstrumentProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, undefined, () => createInitialState(undefined, BOOT.compare ?? null))
  // Dev server only: the live store, for browser tests that need the exact ◆ numbers.
  if (import.meta.env.DEV) (window as unknown as { __recal: Store }).__recal = { state, dispatch }
  return <Ctx.Provider value={{ state, dispatch }}>{children}</Ctx.Provider>
}

export function useInstrument(): Store {
  const v = useContext(Ctx)
  if (!v) throw new Error('useInstrument must be used within an InstrumentProvider')
  return v
}

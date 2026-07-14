// React binding for the instrument store: one provider, one hook.
// Rail / canvas / floor all read and dispatch through useInstrument().
import { createContext, useContext, useReducer, type Dispatch, type ReactNode } from 'react'
import { createInitialState, reducer, type InstrumentState, type Action } from './store'

type Store = { state: InstrumentState; dispatch: Dispatch<Action> }
const Ctx = createContext<Store | null>(null)

export function InstrumentProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, undefined, () => createInitialState())
  return <Ctx.Provider value={{ state, dispatch }}>{children}</Ctx.Provider>
}

export function useInstrument(): Store {
  const v = useContext(Ctx)
  if (!v) throw new Error('useInstrument must be used within an InstrumentProvider')
  return v
}

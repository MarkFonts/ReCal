import { useCallback, useRef } from 'react'
import { iosFocusGuard } from '../shared/index' // wm-primitives, GESTURES.md §15

/* A ref callback that puts iosFocusGuard on an editable (or a wrapper around editables) for as
 * long as it is mounted. Layer 1 only: a no-op anywhere that isn't an iPhone. Stable identity,
 * so it is attached once per mount, not once per render. */
export function useIosFocusGuardRef<T extends HTMLElement>(): (el: T | null) => void {
  const stop = useRef<(() => void) | null>(null)
  return useCallback((el: T | null) => {
    stop.current?.()
    stop.current = el ? iosFocusGuard(el) : null
  }, [])
}

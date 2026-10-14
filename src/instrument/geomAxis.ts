// The GEOM ruler, once. The Shape pad (across) and the Type Matrix (every lane) plot the
// same 0-100 axis, so GEOM 25 has to be the same distance from the rail edge in both.
// Everything positioned by GEOM goes through geomLeft / geomSpan / geomFromClientX; the
// inset is the only number, and it is the pad's plot margin.
import { AXIS_RANGES } from './store'
import { ZONE_CHIP_COLOR } from '../zoneColors'

/** Gap in px between a component's edge and GEOM 0 / GEOM 100. */
export const GEOM_INSET = 9

const { min: GMIN, max: GMAX } = AXIS_RANGES.GEOM

/** CSS `left` for a value on the axis min..max, inside a box that spans the full component width. */
export const axisLeft = (v: number, min: number, max: number) =>
  `calc(${GEOM_INSET}px + (100% - ${2 * GEOM_INSET}px) * ${(v - min) / (max - min)})`

/** CSS `left` for a GEOM value, inside a box that spans the full component width. */
export const geomLeft = (g: number) => axisLeft(g, GMIN, GMAX)

/** CSS width of the GEOM span a..b. */
export const geomSpan = (a: number, b: number) =>
  `calc((100% - ${2 * GEOM_INSET}px) * ${(b - a) / (GMAX - GMIN)})`

/** Same mapping in px, for measured layout. */
export const geomPx = (g: number, width: number) =>
  GEOM_INSET + (width - 2 * GEOM_INSET) * ((g - GMIN) / (GMAX - GMIN))

/** Pointer x → value on the axis min..max (unrounded, clamped), for a box with the given rect. */
export const axisFromClientX = (clientX: number, rect: { left: number; width: number }, min: number, max: number) => {
  const t = (clientX - rect.left - GEOM_INSET) / (rect.width - 2 * GEOM_INSET)
  return min + Math.max(0, Math.min(1, t)) * (max - min)
}

/** Pointer x → GEOM (unrounded, clamped to the axis), for a box with the given rect. */
export const geomFromClientX = (clientX: number, rect: { left: number; width: number }) =>
  axisFromClientX(clientX, rect, GMIN, GMAX)

export const chipColor = (label: string) =>
  ZONE_CHIP_COLOR[(label === 'A11Y' ? 'A11y' : label) as keyof typeof ZONE_CHIP_COLOR]

/** The faint zone wash drawn behind both the pad and the matrix lanes. */
export const zoneBandBackground = (label: string) =>
  `color-mix(in srgb, ${chipColor(label)} 7%, transparent)`

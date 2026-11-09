// The clamp readout. What a pad / band hands a clamp-show layer.
import type { AxisMap } from '../store'

export type Side = 'left' | 'right' | 'top' | 'bottom' | 'tl' | 'tr' | 'bl' | 'br'
/** What is being shown: an edge (or corner) or the whole frame; `fading` = released, on its way out. */
export type Show = { kind: 'edge' | 'box'; side?: Side; fading: boolean }

export interface PadAxisInfo { tag: string; min: number; max: number; lim: [number, number]; value: number; frozen: boolean }
export interface PadView {
  W: number; H: number                       // the pad, px
  plotTop: number; plotBottom: number        // y px of the axis max / min
  px: (v: number) => number; py: (v: number) => number
  x: PadAxisInfo; y: PadAxisInfo
  zone?: (geom: number) => string            // Shape pad only: GEOM → zone label
  axes: AxisMap                              // effective axes, the base of any sample
}

/** Which of the four limits a Show is moving. */
export function moving(s: Show | null) {
  const m = { xlo: false, xhi: false, ylo: false, yhi: false }
  if (!s) return m
  if (s.kind === 'box') return { xlo: true, xhi: true, ylo: true, yhi: true }
  switch (s.side) {
    case 'left': m.xlo = true; break
    case 'right': m.xhi = true; break
    case 'top': m.yhi = true; break
    case 'bottom': m.ylo = true; break
    default:
      if (s.side) { m[s.side[1] === 'l' ? 'xlo' : 'xhi'] = true; m[s.side[0] === 'b' ? 'ylo' : 'yhi'] = true }
  }
  return m
}

/** One-axis band (ClampSlider): the band's width, the limits, and how a value maps to px. */
export interface BandView { W: number; H: number; tag: string; min: number; max: number; lim: [number, number]; mult: number; axes: AxisMap }

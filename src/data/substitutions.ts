// GENERATED — do not edit. Source: scripts/gen_substitutions.py (reads CalSansVF GSUB).
// The canonical substitution table (VISION §7). Everything derives from this.
import data from './substitutions.json'

export type Variant = { label: string; suffix: string | null; zone: string | null }
export type GeomGroup = { headline: string; cp: number; thresholds: number[]; variants: Variant[] }
export type GeomCell = { cp: number; aalt: number; name: string; thresholds: number[]; zones: string; headline: string | null }
export type FeatureSet = { tag: string; name: string | null; families: string[]; overridesGeom: boolean; subs: Record<string, string> }
export type Zone = { label: string; suffix: string | null; char: string; color: string; start: number; end: number; sampleGeom: number }
export type Substitutions = {
  axis: { tag: string; min: number; default: number; max: number }
  zones: Zone[]
  geomGroups: GeomGroup[]
  geomCells: GeomCell[]
  stylisticSets: FeatureSet[]
  charVariants: FeatureSet[]
}
export const SUBS = data as unknown as Substitutions

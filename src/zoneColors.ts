/* The GEOM landing palette — one definition, read from the CSS tokens.
 *
 * These four colours were previously written out in seven places: tokens.css, Shell.tsx,
 * App.tsx twice, GlyphGroups.tsx twice and scenes.tsx. Same values every time, so changing
 * a zone colour meant finding all seven — and the tokens read as unused because most of
 * the consumers are TSX, not CSS.
 *
 * Values live in tokens.css. Everything here is a var() reference, which works anywhere the
 * string lands in a style prop or an SVG paint attribute.
 *
 * Note this is the palette only. The zone BANDS and their sampleGeom values are functional
 * and live in GlyphGroups.tsx (LANDING_ZONES) — deliberately not folded in here.
 */

/** Keyed by variant label, as used by GROUP_DEFS / the Type Matrix / the trash animation. */
export const ZONE_COLOR = {
  A11Y: 'var(--zone-a11y)',
  UI: 'var(--zone-ui)',
  Base: 'var(--zone-base)',
  Geo: 'var(--zone-geo)',
  /** Not a landing — the unswapped form, which recedes rather than taking a hue. */
  default: 'var(--text-dim)',
} as const

export type ZoneLabel = keyof typeof ZONE_COLOR

/** Single-letter keys used by the font-derived rclt swap table (A=A11y · B=Base · G=Geo). */
export const ZONE_COLOR_SHORT: Record<string, string> = {
  A: ZONE_COLOR.A11Y,
  B: ZONE_COLOR.Base,
  G: ZONE_COLOR.Geo,
}

/** Fallback for a label that is not a landing at all. */
export const ZONE_COLOR_FALLBACK = 'var(--text-dim)'

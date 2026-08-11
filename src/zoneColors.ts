/* The GEOM landing palette — one definition, read from the CSS tokens.
 *
 * These four colors were previously written out in seven places: tokens.css, Shell.tsx,
 * App.tsx twice, GlyphGroups.tsx twice and scenes.tsx. Same values every time, so changing
 * a zone color meant finding all seven — and the tokens read as unused because most of
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

/**
 * The palette for CHIPS specifically — the same four zones at full strength.
 * ZONE_COLOR stays muted because there the zones are a wash behind dense content in the
 * Type Matrix and the glyph strips: a background classification, not a control. A chip is
 * something you press, so it gets the hue undiluted. UI additionally takes the on-grid
 * white, since a chip group always has something selected and grey there reads as
 * disabled rather than chosen.
 */
export const ZONE_CHIP_COLOR = {
  A11y: 'var(--zone-a11y-chip)',
  UI: 'var(--zone-ui-chip)',
  Base: 'var(--zone-base-chip)',
  Geo: 'var(--zone-geo-chip)',
} as const

/** Fallback for a label that is not a landing at all. */
export const ZONE_COLOR_FALLBACK = 'var(--text-dim)'

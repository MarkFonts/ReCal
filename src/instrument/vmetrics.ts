// Vertical metrics — the OS/2 + hhea numbers that decide line height and clipping across
// apps. Pure data + math (no React) so the preset logic stays testable. Baked into the
// export's OS/2 (typo asc/desc/gap, win asc/desc, fsSelection USE_TYPO bit) and hhea
// (asc/desc/gap) tables. See docs/control-mapping.md.
//
// Three schools of thought ship as presets, matched to CalSansVF's real design metrics
// (below): WORDMARK's current shipping numbers, ArrowType's center-the-cap recommendation
// (Stephen Nixon's vertical-metrics talk), and Google Fonts' clear-the-accent recipe.

// CalSansVF design constants, in font units (UPM 1000). Read straight off the outlines:
// cap = /H top, xHeight = /x top, accentTop = /Abreveacute (Ắ) top — the tallest thing a
// Latin ascent has to clear — and descender = /g bottom, the deepest.
// The Ascender line reads YTAS directly and x-height is interpolated (xHeightAt), so
// neither is a fixed constant here.
export const FONT_METRICS = {
  upm: 1000,
  cap: 720,
  accentTop: 993,   // Ắ — the ceiling the ascent is measured against
  descender: -243,  // /g bottom
  yMax: 1036,       // head.yMax / yMin — the font's true ink bounds (for win = yMax/yMin)
  yMin: -276,
} as const

// x-height (top of /x) interpolated from the design masters — it moves with weight and
// optical size only (GEOM/YTAS/SHRP/ital don't touch it; caps/descenders don't shift). The
// corners are additive, and opsz 8→10 is a flat plateau (x-height only starts rising above
// opsz 10):
//   w400: 514 · w700: 529 (+15 for weight) · opsz10: 514 · opsz45: 520 (+6 for opsz)
// → the line tracks the live instance the way the outline does, no ink-measuring needed.
const clamp01 = (t: number) => Math.min(1, Math.max(0, t))
export function xHeightAt(wght = 400, opsz = 14): number {
  return 514 + 15 * clamp01((wght - 400) / 300) + 6 * clamp01((opsz - 10) / (45 - 10))
}

export interface MetricSet { asc: number; desc: number; gap: number }
// win descent is stored positive (as usWinDescent is), unlike hhea/typo descent.
export interface WinSet { asc: number; desc: number }

export type VMetricsPresetId = 'wordmark' | 'arrowtype' | 'googlefonts' | 'custom'

export interface VMetrics {
  preset: VMetricsPresetId       // active preset (or 'custom' once hand-tuned)
  hhea: MetricSet                // Mac / most modern layout
  typo: MetricSet                // OS/2 sTypo* — used when USE_TYPO is set
  win: WinSet                    // OS/2 usWin* — the historical clipping box
  useTypo: boolean               // fsSelection bit 7 (USE_TYPO_METRICS)
}

// Line height a metric set yields: ascent − descent + gap.
export const lineHeight = (m: MetricSet): number => m.asc - m.desc + m.gap

// The line height (in em) the export will produce: the metric set the platform reads —
// typo when USE_TYPO is set, else hhea — over the em. Drives the preview's live line
// spacing on the Paragraph/UI tabs so a preset change visibly reflows the text.
export const effectiveLineHeightEm = (v: VMetrics): number =>
  lineHeight(v.useTypo ? v.typo : v.hhea) / FONT_METRICS.upm

// Where text sits inside a line box is set by the ascent/descent asymmetry (asc + signed
// desc). The browser uses the SHIPPED font's value; we can fake the EDITED metrics' effect
// without re-baking by nudging the text by half the difference — a translateY in em. This
// is what "center the cap" moves (buttons/labels ride up or down); it's 0 at the default
// and grows as you edit toward a centred cap. Line gap is symmetric leading, so it doesn't
// enter here — it only opens space between lines (that's effectiveLineHeightEm's job).
const SHIPPED_LINE_ASYM = 655   // WORDMARK hhea 900 + (−245) — the loaded preview font's value
export const capShiftEm = (v: VMetrics): number =>
  ((v.useTypo ? v.typo : v.hhea).asc + (v.useTypo ? v.typo : v.hhea).desc - SHIPPED_LINE_ASYM) / 2 / FONT_METRICS.upm

// Center-cap ascent/descent for a target line height: equal space above the cap as the
// descender drops below the baseline. asc = (LH + cap)/2, descent depth = (LH − cap)/2.
export function centerCap(targetLineHeight: number, cap = FONT_METRICS.cap): MetricSet {
  const asc = Math.round((targetLineHeight + cap) / 2)
  return { asc, desc: -(targetLineHeight - asc), gap: 0 }
}

export interface VMetricsPreset {
  id: VMetricsPresetId
  label: string
  blurb: string
  metrics: Omit<VMetrics, 'preset'>
}

export const VM_PRESETS: VMetricsPreset[] = [
  {
    id: 'wordmark',
    label: 'WORDMARK default',
    blurb: 'What the font ships today.',
    metrics: {
      hhea: { asc: 900, desc: -245, gap: 0 },
      typo: { asc: 900, desc: -245, gap: 0 },
      win: { asc: 1024, desc: 245 },
      useTypo: false,
    },
  },
  {
    id: 'arrowtype',
    label: 'ArrowType spec',
    // hhea/win center the cap for a 1.2 em line; typo ascent = cap height, typo gap makes
    // the typo line-height match hhea; don't use typo metrics. May clip the tallest accent.
    blurb: 'Center the cap. You decide line height; may clip accents.',
    metrics: {
      hhea: { asc: 960, desc: -240, gap: 0 },
      typo: { asc: 720, desc: -240, gap: 240 },
      win: { asc: 960, desc: 240 },
      useTypo: false,
    },
  },
  {
    id: 'googlefonts',
    label: 'Google Fonts spec',
    // Ascent clears Ắ (993→1000); descent makes cap−ascent symmetric (−280); hhea = typo =
    // win; use typo metrics. ~1.28 em, simple and consistent, avoids most clipping.
    blurb: 'Clear the accent, match all three, use typo. Avoids clipping.',
    metrics: {
      hhea: { asc: 1000, desc: -280, gap: 0 },
      typo: { asc: 1000, desc: -280, gap: 0 },
      win: { asc: 1000, desc: 280 },
      useTypo: true,
    },
  },
]

export const presetById = (id: VMetricsPresetId): VMetricsPreset | undefined =>
  VM_PRESETS.find(p => p.id === id)

export const DEFAULT_VMETRICS: VMetrics = {
  preset: 'wordmark',
  ...VM_PRESETS[0].metrics,
}

// ── Metric-strategy actions (the hhea-settings dropdown) ────────────────────────
// Match hhea, typo & win: make all three carry the same box (win descent flips sign).
export function matchAll(v: VMetrics): VMetrics {
  return {
    ...v,
    preset: 'custom',
    typo: { ...v.hhea },
    win: { asc: v.hhea.asc, desc: -v.hhea.desc },
  }
}

// Match hhea & win to center the cap at the current hhea line height.
export function centerCapAll(v: VMetrics): VMetrics {
  const m = centerCap(lineHeight(v.hhea))
  return { ...v, preset: 'custom', hhea: m, win: { asc: m.asc, desc: -m.desc } }
}

// Match hhea & typo; set the win box to the font's true ink bounds (yMax/yMin) so it can
// never clip — the "give win all the room it needs" school.
export function winToBounds(v: VMetrics): VMetrics {
  return { ...v, preset: 'custom', typo: { ...v.hhea }, win: { asc: FONT_METRICS.yMax, desc: -FONT_METRICS.yMin } }
}

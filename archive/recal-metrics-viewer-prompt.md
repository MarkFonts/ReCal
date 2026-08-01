# Claude Code Prompt: ReCal Vertical-Metrics Viewer

Build a vertical-metrics viewer for the ReCal customizer (React + Vite + Pyodide/fontTools, client-side only). It shows the current font's vertical metrics as horizontal rules against the baseline, and is architected so a later editing pass can move every metric proportionally.

There is a reference implementation to copy the *look* from — `dek.js`, a canvas metrics animation from the wordmark.nyc site (include it in the repo as reference). **Copy its visual language, not its architecture.** Read the two sections below carefully before writing code; they describe a deliberate inversion of how `dek.js` works.

---

## What to take from `dek.js` and what to drop

`dek.js` is a self-animating hero graphic. It oscillates weight on a sine wave, cycles through every glyph in the font every 100ms, and swarms 92 particles over the glyph. Its metric *values* are hardcoded constants; only x-height is "live," interpolated from the oscillating weight.

**Take (the visual vocabulary):**
- Baseline is the anchor. Every metric line is positioned relative to it.
- Each metric = a dashed horizontal rule spanning the width, low opacity (~0.25), thin (0.5px), dashed `[4,5]`.
- Each metric label is flush-left, its value flush-right, both small (8px), low opacity (~0.28), in the font itself.
- A `U+XXXX`-style monospaced annotation treatment (optional here — see below).
- The `BLEED` padding idea (extra render height per side so tall accents/descenders never clip at the edge), then negative-margin it back out so layout size is unchanged. See `dek.js:11, 144–151`.
- The baseline-relative positioning formula (`dek.js:368–372`):
  ```
  baseline_y   = centerY + ((ascFrac - descFrac) / 2) * emPx
  line_y(v)    = baseline_y - (v / upm) * emPx
  ```
  where `emPx` is the em box in pixels and each metric's fraction is `value / unitsPerEm`. Negative values (descender, typo descender) fall below the baseline naturally.

**Drop (all of it — it's hero-section theater, irrelevant to a tool):**
- The particle constellation (`initParticles`, the zone system, cursor repulsion, `source-atop` clipping).
- Glyph cycling (`glyphIdx`, `HOLD_MS`, `buildGlyphList`, `RANGES`, `DIAC_MAP`, `SHAPES`).
- Weight self-oscillation (`wghtVal`, `WGHT_PERIOD`).
- The hardcoded `METRICS` constants and the hardcoded `515↔529` x-height interpolation.
- The RAF loop, unless you add optional tweening (see Phase 4).

## The data-flow inversion (the whole point)

In `dek.js` the metrics are constants and *weight* is the free variable that nudges x-height. **In ReCal the metrics themselves are the free variables**, and they come from the real font. The viewer must be a **pure function of a metrics object** — hand it numbers, it draws rules. It owns no animation and no font knowledge.

The metrics object is produced by a new worker RPC, `getMetrics()`, which reads the current font (after any axis-default shift / opsz scale — so the viewer reflects *what you'll actually download*, honoring VISION.md's "what you preview is what you get").

Read these from the font tables via fontTools:

| key            | source                              | kind      |
|----------------|-------------------------------------|-----------|
| `upm`          | `head.unitsPerEm`                   | scale     |
| `capHeight`    | `OS/2.sCapHeight`                   | shape     |
| `xHeight`      | `OS/2.sxHeight`                     | shape     |
| `baseline`     | `0` (constant)                      | shape     |
| `descender`    | derived (see note)                  | shape     |
| `hheaAsc`      | `hhea.ascender`                     | line-box  |
| `hheaDesc`     | `hhea.descender`                    | line-box  |
| `hheaGap`      | `hhea.lineGap`                      | line-box  |
| `typoAsc`      | `OS/2.sTypoAscender`                | line-box  |
| `typoDesc`     | `OS/2.sTypoDescender`               | line-box  |
| `typoGap`      | `OS/2.sTypoLineGap`                 | line-box  |
| `winAsc`       | `OS/2.usWinAscent`                  | line-box  |
| `winDesc`      | `OS/2.usWinDescent` (store negated for positioning) | line-box |

Note on descender-as-shape: if you want a glyph descender reference line, measure it or approximate from typo/win; it isn't a single table field. Fine to omit in v1.

Each entry in the metrics array should carry everything the viewer needs to draw *and* everything a future editor needs to mutate:

```ts
type Metric = {
  key: string;
  label: string;          // "TYPO ASCENDER"
  value: number;          // font units, signed (below-baseline = negative)
  kind: 'shape' | 'line-box';
  editable: boolean;      // false for shape metrics in v1
};
type MetricsModel = { upm: number; metrics: Metric[] };
```

Line Y is always `baseline_y - (value / upm) * emPx`. That single formula is what made x-height "live" in `dek.js`; generalized across the array, it's what makes *every* metric live once values become editable. Include the full line-box set now even though they're read-only display in v1 — that's the scaffolding for the later editing pass.

---

## Two kinds of line, drawn differently

Do not render all metrics identically. The tool's job is editing vertical metrics, so the line-box set is the important one and should read as distinct from the glyph-shape references.

- **Shape metrics** (`capHeight`, `xHeight`, `baseline`, `descender`): thin dashed rule, the `dek.js` look. These are measurements, not editable in v1.
- **Line-box metrics** (`hhea*`, `typo*`): solid or differently-dashed rules, labeled on the right with their raw font-unit value.
- **Win metrics** (`winAsc` / `winDesc`): render as a **translucent filled band** between the two, because that pair literally *is* the Windows clipping box. If any shape line (a tall accent, the descender) falls outside the band, tint it or flag it — that's the `win_ascent_and_descent` FontBakery failure made visible.

Group the three ascender values (hhea / typo / win) visually so their divergence is legible at a glance — that divergence is exactly what USE_TYPO_METRICS and the GF vertical-metrics scheme are about.

---

## Build in phases

**Phase 1 — Static render from a hardcoded model.**
Build the SVG component against a hardcoded `MetricsModel` (real Cal Sans numbers are fine). Baseline anchor, the positioning formula, both line styles, the win band, labels left/values right, theme via CSS vars (`--ink`, `--bg` — `dek.js:203–207`), DPR-crisp, BLEED padding so nothing clips. No worker yet. Get the picture right.

**Phase 2 — Wire to the font.**
Add worker RPC `getMetrics()` that reads the tables above from the *current* font (post axis-default-shift / opsz-scale) and returns a `MetricsModel`. Component re-renders whenever ReCal regenerates the font (same trigger as the existing preview `@font-face` reload). Now moving an axis default that changes the instanced metrics moves the rules.

**Phase 3 — Live shape metrics (optional, matches `dek.js` spirit).**
If you want cap-height / x-height to track the weight slider the way `dek.js` interpolated x-height: **do not hardcode 515↔529** (that's Cal-Sans-UI-specific). Either read `sCapHeight`/`sxHeight` from the live instance each regen, or measure from the rendered `@font-face` via canvas `measureText`. Static read from `OS/2` is an acceptable v1.

**Phase 4 — Transitions (optional).**
When a value changes, tween the rule to its new Y over ~150ms for legibility. This is the *only* legitimate reason to reintroduce a RAF/loop; keep it a self-terminating tween, not a persistent animation.

**Phase 5 — Editing hooks (stub now, implement later).**
Leave clean seams for the editing pass the user is planning next: each line-box rule gets a drag handle (SVG makes this trivial — this is why we're not using canvas), dragging updates `metric.value`, and a "scale all vertical metrics ×k" control multiplies every line-box value by a factor. The viewer already redraws from the model, so this is just: mutate model → re-render. Wire the handles to a no-op `onMetricChange(key, value)` callback for now.

---

## Constraints & notes

- **SVG/DOM, not canvas.** `dek.js` is canvas because it composites particles over a glyph at 60fps. This viewer has no such load, and the coming editing pass wants draggable handles and selectable labels — both far easier in SVG. Keep only the BLEED idea from the canvas version.
- **Pure function of the model.** The component takes `MetricsModel` as a prop and renders. It does not fetch, animate itself, or know about Pyodide. All font reading lives in the worker.
- **Signed values.** Store below-baseline metrics (descenders, typo descender, negated win descent) as negative so the one positioning formula handles everything. Watch the sign on `usWinDescent` — it's stored positive in the font but sits below the baseline.
- **Full set now, editable later.** Include every line-box metric in the model in v1 even though only display is wired. The user's next step is proportional editing of all of them; don't make that a refactor.
- **Reflect the download, not the original.** `getMetrics()` reads the current (instanced/shifted) font so the viewer stays honest with "what you preview is what you get."
- **Theme.** Read `--ink`/`--bg` from CSS custom properties; re-read on `data-theme` mutation (`dek.js:208–210` shows the MutationObserver pattern).

## Things to flag to Claude Code before running

- **The inversion is the whole task.** If Claude Code starts porting the RAF loop, particles, or glyph cycling, it has misread the assignment. The viewer is static-until-data-changes.
- **`sCapHeight`/`sxHeight` may be absent or zero** in some fonts — guard for it and fall back to measuring or omitting those lines rather than drawing a rule at y=0.
- **Don't conflate shape and line-box metrics.** Cap-height is not typo-ascender. They're different numbers with different meanings and must render differently. This is the single easiest thing to get subtly wrong.

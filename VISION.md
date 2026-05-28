# ReCal — Vision

> Inspired by 🐐 [DJR's Input font download customizer](https://input.djr.com/download/), repurposed by WORDMARK to make the OFL mission more accessible.

## What it is

ReCal is a browser-based customizer for Cal Sans, a variable font. It runs entirely client-side: no server, no upload. You configure the font, preview it live, and download a static TTF tuned to your context.

The output is a renamed font — **ReCal Sans** — with your decisions baked in.

---

## Why this exists

Cal Sans is engineered for mobile and desktop UI at small-to-medium point sizes. Its optical sizing axis (`opsz`) is tuned for that range. Its glyph set is optimized for that context.

But not every context is a phone screen. A transit display, a TV interface, a wayfinding sign, a large-format print — these need a different calibration. ReCal makes that calibration accessible without requiring a font editor.

---

## The three levers

### 1. Optical size scale

The `opsz` axis governs how the font behaves as size changes — stroke contrast, spacing, detail. Cal Sans is designed for roughly 8–32pt. If your text lives at 48–192pt (a ×6 context), the font should behave as if it's always at the large end of its range.

The multiplier compresses the opsz axis: the exported font at ×6 treats CSS `font-size: 48px` as if it were `opsz: 8` — the same design that fires at 8pt on the original, now deployed at 48pt. You see the design intent, not the rescaled default.

### 2. Axis defaults

Variable fonts carry design-space defaults that ship in the binary. Most applications never change them. ReCal lets you pin the defaults to the values that make sense for your context — weight, sharpness, ascender height — before distributing the font. The result is a static file that behaves correctly without requiring CSS `font-variation-settings` at every call site.

### 3. Glyph swap thresholds (GEOM)

This is the core of ReCal.

Cal Sans uses a custom `GEOM` axis (0–100) to drive GSUB glyph substitutions via OpenType FeatureVariations. As GEOM increases, glyphs shift from accessibility-optimized forms toward geometric forms. There are four named zones:

| Zone | Range | Character |
|------|-------|-----------|
| **A11Y** | 0–10 | Maximum disambiguation. Serifed I, tailed l, double-story a and g. |
| **UI** | 15–30 | Clean, screen-native. Optimized for small UI text. |
| **Base** | 40–60 | Long-form reading. Slightly more formal. |
| **Geo** | 80–100 | Geometric. For large display, wordmarks, expressive use. |

Thirteen glyph groups are affected: `I l a G g f j t y u C c M`. Each group has its own threshold positions — the GEOM values where one variant gives way to the next.

ReCal lets you move those thresholds. The preview updates live. The downloaded font encodes your threshold map into its FeatureVariations table.

---

## The primary UI: Dynamic Optical Size Map

The hero view is a four-column grid showing all four zones simultaneously — A11Y, UI, Base, Geo — each rendered at its zone midpoint GEOM value. Clicking a column header snaps the GEOM default to that zone.

### Zone bins (Rosetta Stone)

Below each column's specimen text is a **zone bin**: a rounded container showing the glyph tokens that are active or transitioning in that zone. These are the primary interactive controls.

Each bin contains two kinds of tokens:

- **Named variant tokens** — glyphs with a zone-specific form active at this GEOM value (e.g. `I.rcltA11Y` in the A11Y bin). Rendered in the zone's color. Draggable.
- **Default tokens** — glyphs in their default form, shown when their threshold falls within the adjacent transition zone. Rendered at reduced opacity. Visual reference only.

Tokens are sorted left-to-right by default activation order (the GEOM value at which each variant first becomes active).

### Billiards drag

Named variant tokens are drag handles for the underlying GEOM thresholds. Dragging a token into a different zone bin reassigns that variant's threshold range:

- **Drop in zone B**: the token moves to B. If another token for the same glyph already occupies B, it cascades forward (billiards) to the next zone. If it would fall off the last zone, it goes into the pocket (variant disabled).
- **Drop in the gutter**: not yet implemented as a distinct drop target (threshold collapses when dropped outside the grid).
- **Threshold snapping**: thresholds snap to the **midpoint of the transition gutter** between zones, not to the zone boundary exactly. This leaves a sliver of the variant's form visible in the transition band — consistent with how Cal Sans is engineered to stagger glyph swaps sequentially through the transition zones.

Gutter midpoints: A11Y→UI = 12, UI→Base = 35, Base→Geo = 70.

### Billiards default token tracking

When a threshold moves from one zone into the next (e.g. `l.rcltA11Y` threshold moves from 11 to 25), the default token for `l` automatically billiards to the zone after the new threshold position. The window rule: a default token appears in zone Z when its glyph's threshold falls in `[prevZone.start, z.start)`.

### Preview modal

Clicking the **Preview** pill in any column header opens a full-screen modal showing the font at that zone's configuration. Controls: Size, Spacing, and per-axis sliders (Optical Size, Geometric Form with zone tabs + fine scrubber, Weight, Ascender Height, Sharp). The modal uses `CalSansPreview` — the live-rebuilt font reflecting all current threshold customizations.

---

## The preview system

The live preview shows the font at a user-controlled point size, rendered simultaneously for all four zones. Clicking a zone column snaps the GEOM default there.

When threshold positions are changed, a background worker rebuilds the font's FeatureVariations condition ranges and registers the result as a second font face (`CalSansPreview`). The zone columns switch to this font, so what you see reflects your actual threshold map, not the original. The grid dims to 20% opacity during the rebuild to signal the transition.

### Type Matrix (developer view)

The **Type Matrix** — accessible via the "Type Matrix" toggle at the bottom left — is a secondary engineering view showing all 13 glyph groups as continuous timeline bars with draggable threshold handles. It exposes the same underlying data as the zone bins, but as a precise continuous editor rather than a discrete zone interaction. The GEOM default handle in the Type Matrix is the only place where fine sub-zone GEOM values are directly settable.

---

## What gets exported

The downloaded TTF is still a variable font, but opinionated:

- Non-opsz axis defaults are shifted via fontTools `instantiateVariableFont` (the axis range is preserved, only the default moves)
- The `opsz` axis is scaled by the chosen multiplier
- Font family names are rewritten to `ReCal Sans`

**Note:** Custom glyph threshold changes (from the zone bin drag interactions) are reflected in the live `CalSansPreview` but are **not yet written into the downloaded TTF's FeatureVariations**. See deferred items below.

---

## The build pipeline problem

### Two formats, one truth

The GSUB substitution rules that drive GEOM-based glyph swapping must be expressed in two different syntaxes depending on the build tool:

**fontmake / designspace format** — used for CI/production builds from a `.designspace` source:
```
conditionset GEOM_A11Y_Il {
    GEOM 0 10;
} GEOM_A11Y_Il;
variation rclt GEOM_A11Y_Il {
    sub I by I.rcltA11Y;
    sub l by l.rcltA11Y;
    ...
} rclt;
```

**Glyphs app format** — used for quick iteration builds directly from the `.glyphs` file:
```
condition GEOM < 11;
lookup GEOM_A11Y_Il {
    sub I by I.rcltA11Y;
    sub l by l.rcltA11Y;
    ...
} GEOM_A11Y_Il;
```

These are semantically equivalent but syntactically incompatible. Maintaining both by hand guarantees divergence.

### The substitution blocks

The full substitution map consists of 12 named blocks:

| Block | GEOM range | Variant | Key glyphs |
|-------|-----------|---------|------------|
| `GEOM_UI_G` | 0–40 | `.rcltUI` | G family |
| `GEOM_A11Y_Il` | 0–10 | `.rcltA11Y` | I family, l family |
| `GEOM_A11Y_a` | 0–12 | `.rcltA11Y` | a family |
| `GEOM_UI_g_low` | 0–15 | `.rcltUI` | g family |
| `GEOM_UI_g_cameo` | 35–40 | `.rcltUI` | g family (reappearance) |
| `GEOM_BASE_a` | 35–100 | `.rcltBase` | a family, ae, ordfeminine |
| `GEOM_BASE_fjt` | 40–75 | `.rcltBase` | f, j, t families, fi/fl ligatures |
| `GEOM_BASE_f_high` | 76–100 | `.rcltBase` | f family only (f has no Geo variant) |
| `GEOM_BASE_y` | 40–60 | `.rcltBase` | y family |
| `GEOM_GEO_uy` | 60–100 | `.rcltGeo` | u family, y family, micro |
| `GEOM_GEO_jt` | 75–100 | `.rcltGeo` | j family, t family, ij, pi |
| `GEOM_GEO_rest` | 80–100 | `.rcltGeo` | C, c, M families, Eng, eng, 0, 1, euro |

### Path forward: code generation

The solution is a canonical substitution table — a structured JSON or TypeScript data file — that both formats are generated from. This file is the single source of truth for:

1. **The font build** — a Python or Node script emits either the `conditionset/variation` block (for fontmake) or the `condition/lookup` block (for Glyphs) from the same input
2. **The ReCal UI** — `GROUP_DEFS` in `GlyphGroups.tsx` is derived from the same data
3. **The export pipeline** — when ReCal rewrites FeatureVariations on download, it uses the canonical block definitions

---

## What's deferred

**Per-glyph threshold export**: The `applyConfig` worker path applies axis defaults and the opsz multiplier but does not yet write the user's custom glyph thresholds into the downloaded font's FeatureVariations. The preview font (`CalSansPreview`) correctly reflects custom thresholds via the `previewFont` worker path — the same logic needs to be called in the download path. This is the primary remaining gap between "what you preview" and "what you get."

**HOI zones** (Higher Order Interpolation): Cal Sans has transition zones between the named landing zones where glyph shapes blend between design masters. The intent is a separate visual layer that communicates where transitions happen. The shape of this feature isn't finalized.

**Canonical substitution table**: `GROUP_DEFS` in `GlyphGroups.tsx` is still hand-maintained separately from the font source. A codegen pipeline from a single JSON source to both build formats and the ReCal UI is the right long-term solution.

**Gutter drag target**: Dragging a token into the gutter between zones (to disable a variant entirely) is signaled by cursor affordance but not yet implemented as a distinct drop zone. Currently, dropping outside the grid pockets the variant.

---

## Design principles

- **No server.** The font never leaves the browser until the user downloads it.
- **No opinion on defaults.** ReCal doesn't push you toward any particular GEOM value. It shows you the zones, explains the tradeoffs, and lets you place the thresholds.
- **What you preview is what you get.** The preview font and the export font should use the same Python pipeline. The threshold export gap is a known deviation from this principle.
- **The font is the artifact.** ReCal produces a deployable file, not a configuration object. The downloaded TTF is the output.
- **Glyphs are icons.** The zone bins show glyph shapes as boolean on/off controls — the same data as the Type Matrix threshold handles, expressed as draggable tokens rather than a continuous axis.
- **One source, two builds.** The substitution rules are defined once and compiled for the tool at hand. Neither format is authoritative; the data is.

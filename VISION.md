# ReCal — Vision

## What it is

ReCal is a browser-based customizer for Cal Sans, Vercel's variable font. It runs entirely client-side: no server, no upload. You configure the font, preview it live, and download a static TTF tuned to your context.

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

Variable fonts carry design-space defaults that ship in the binary. Most applications never change them. ReCal lets you pin the defaults to the values that make sense for your context — weight, width, sharpness, ascender height — before distributing the font. The result is a static file that behaves correctly without requiring CSS `font-variation-settings` at every call site.

### 3. Glyph swap thresholds (GEOM)

This is the core of ReCal.

Cal Sans uses a custom `GEOM` axis (0–100) to drive GSUB glyph substitutions via OpenType FeatureVariations. As GEOM increases, glyphs shift from accessibility-optimized forms toward geometric forms. There are four named zones:

| Zone | Range | Character |
|------|-------|-----------|
| **A11Y** | 0–10 | Maximum disambiguation. Serifed I, tailed l, double-story a and g. |
| **UI** | 15–30 | Clean, screen-native. Optimized for small UI text. |
| **Text** | 40–60 | Long-form reading. Slightly more formal. |
| **Geo** | 80–100 | Geometric. For large display, wordmarks, expressive use. |

Thirteen glyph groups are affected: `I l a G g f j t y u C c M`. Each group has its own threshold positions — the GEOM values where one variant gives way to the next.

ReCal lets you move those thresholds. If your A11Y context needs the serif I active up to GEOM=20 instead of 10, you drag it. The preview updates live. The downloaded font encodes your threshold map into its FeatureVariations table.

---

## The preview system

The live preview shows the font at a user-controlled point size with a scrollable single-line specimen. As you adjust GEOM, CSS `font-variation-settings` updates in real time — you see which variant is active.

When threshold positions are changed, a background worker rebuilds the font's FeatureVariations condition ranges and registers the result as a second font face (`CalSansPreview`). The preview switches to this font, so what you see reflects your actual threshold map, not the original.

The GlyphGroups panel below the preview shows all 13 groups simultaneously: colored bars for each variant's active range, draggable threshold handles, and a shared GEOM position marker. Clicking a zone bar snaps GEOM to that zone's midpoint.

---

## What gets exported

The downloaded TTF is still a variable font, but opinionated:

- Non-opsz axis defaults are shifted via fontTools `instantiateVariableFont` (the axis range is preserved, only the default moves)
- The `opsz` axis is scaled by the chosen multiplier
- FeatureVariations condition ranges reflect the user's threshold map
- Font family names are rewritten to `ReCal Sans`

The result can be dropped into any design tool or CSS stack. It behaves correctly at its intended context without per-use-site configuration.

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

These are semantically equivalent but syntactically incompatible. Maintaining both by hand guarantees divergence: a glyph added to one file gets missed in the other, a threshold tweaked in one is forgotten in the other.

### The substitution blocks

The full substitution map consists of 12 named blocks, each defined by an axis condition range and a glyph→variant mapping:

| Block | GEOM range | Variant | Key glyphs |
|-------|-----------|---------|------------|
| `GEOM_UI_G` | 0–40 | `.rcltUI` | G family |
| `GEOM_A11Y_Il` | 0–10 | `.rcltA11Y` | I family, l family |
| `GEOM_A11Y_a` | 0–12 | `.rcltA11Y` | a family |
| `GEOM_UI_g_low` | 0–15 | `.rcltUI` | g family |
| `GEOM_UI_g_cameo` | 35–40 | `.rcltUI` | g family (reappearance) |
| `GEOM_TEXT_a` | 35–100 | `.rcltText` | a family, ae, ordfeminine |
| `GEOM_TEXT_fjt` | 40–75 | `.rcltText` | f, j, t families, fi/fl ligatures |
| `GEOM_TEXT_f_high` | 76–100 | `.rcltText` | f family only (f has no Geo variant) |
| `GEOM_TEXT_y` | 40–60 | `.rcltText` | y family |
| `GEOM_GEO_uy` | 60–100 | `.rcltGeo` | u family, y family, micro |
| `GEOM_GEO_jt` | 75–100 | `.rcltGeo` | j family, t family, ij, pi |
| `GEOM_GEO_rest` | 80–100 | `.rcltGeo` | C, c, M families, Eng, eng, 0, 1, euro |

The `g` group is unusual: it has a low A11Y appearance (0–15), a gap through the UI zone, a brief cameo reappearance (35–40), then returns to default through Text and Geo. This non-monotonic behavior needs to be expressed explicitly and is easy to get wrong in either format.

### Path forward: code generation

The solution is a canonical substitution table — a structured JSON or TypeScript data file — that both formats are generated from. This file is the single source of truth for:

1. **The font build** — a Python or Node script emits either the `conditionset/variation` block (for fontmake) or the `condition/lookup` block (for Glyphs) from the same input
2. **The ReCal UI** — `GROUP_DEFS` in `GlyphGroups.tsx` is derived from the same data, ensuring the threshold handles and preview system stay in sync with the actual font behavior
3. **The export pipeline** — when ReCal rewrites FeatureVariations on download, it uses the canonical block definitions, not a hardcoded `ORIG` dict

The data model for each block:

```typescript
type SubstitutionBlock = {
  name: string          // e.g. "GEOM_A11Y_Il"
  axis: string          // e.g. "GEOM"
  min: number           // inclusive, user space
  max: number           // inclusive, user space
  variant: string       // suffix, e.g. ".rcltA11Y"
  glyphs: string[]      // base glyph name, e.g. ["I", "IJ", "IJacute", ...]
}
```

The emitter for the fontmake format:
```python
def emit_variation(block):
    lines = [f'conditionset {block.name} {{']
    lines += [f'    {block.axis} {block.min} {block.max};']
    lines += [f'}} {block.name};']
    lines += [f'variation rclt {block.name} {{']
    lines += [f'    sub {g} by {g}{block.variant};' for g in block.glyphs]
    lines += [f'}} rclt;']
    return '\n'.join(lines)
```

The emitter for the Glyphs format:
```python
def emit_condition(block):
    lo, hi = block.min, block.max
    if lo == 0:
        cond = f'condition {block.axis} < {hi + 1};'
    elif hi == 100:
        cond = f'condition {lo - 1} < {block.axis};'
    else:
        cond = f'condition {lo - 1} < {block.axis} < {hi + 1};'
    lines = [cond, f'lookup {block.name} {{']
    lines += [f'    sub {g} by {g}{block.variant};' for g in block.glyphs]
    lines += [f'}} {block.name};']
    return '\n'.join(lines)
```

### Full diacritic expansion

Each block's glyph list needs to be exhaustive — every base character plus every diacritic form on a separate line. The 13 base characters each have full Unicode diacritic families. The canonical data file should list them all explicitly so:

- Nothing gets silently omitted in a build
- ReCal can show per-diacritic substitution counts if needed
- The glyph list is auditable: if a new diacritic is added to the font, it must be added to the data file, and both build formats update automatically on the next codegen run

The canonical file should live in the font source repository and be consumed by both the Glyphs export script and the fontmake pipeline. ReCal's `GROUP_DEFS` becomes a view over that data (base characters only, for the threshold UI) rather than a separate definition.

---

## What's deferred

**HOI zones** (Higher Order Interpolation): Cal Sans has transition zones between the named landing zones — diagonal-hatched in the UI — where glyph shapes blend between design masters. The intent is a separate visual layer that communicates where transitions happen and potentially allows tuning the transition curve. The shape of this feature isn't finalized.

**Per-glyph threshold export**: The `applyConfig` worker path currently applies axis defaults and the opsz multiplier but does not yet write the user's custom glyph thresholds into the downloaded font's FeatureVariations. The `ORIG` hardcoded dict in the worker should be replaced by the canonical substitution table once that exists.

---

## Design principles

- **No server.** The font never leaves the browser until the user downloads it.
- **No opinion on defaults.** ReCal doesn't push you toward any particular GEOM value. It shows you the zones, explains the tradeoffs, and lets you place the thresholds.
- **What you preview is what you get.** The preview font and the export font use the same Python pipeline. There should be no surprises between the preview and the downloaded file.
- **The font is the artifact.** ReCal produces a deployable file, not a configuration object. The downloaded TTF is the output.
- **One source, two builds.** The substitution rules are defined once and compiled for the tool at hand. Neither format is authoritative; the data is.

# Control mapping — current app → instrument model

Phase 0 deliverable (per `ref/recal-instrument-spec.md`). Maps every control and every
piece of state in the current `App.tsx` onto the three-layer store and the four control
homes. This is the reference-of-record for the branch.

**Status:**
- **Phase 0 ✅** — three-layer store `src/instrument/store.ts` (SHIPPED / defaults ◆ / preview ● +
  `merged()`/`effective()` selectors + reducer), `InstrumentProvider.tsx` (context + hook), and a
  harness `InstrumentApp.tsx` at `?ui=instrument`. Classic app stays the default; both build side
  by side. Selectors verified by 23 unit checks.
- **Phase 1 ✅** — `src/instrument/tokens.css`: palette/text/border/accent/zone/motion/shape/type
  tokens extracted from the existing palette (no new hues). Cal Sans is the UI type via `--ui-font`
  + the `.instrument-root` chrome recipe; `.tnum` for numeric columns. Marker decision applied as
  the working default: ◆ `--marker-default` = `--accent` (#e8e8e8), ● `--marker-preview` = #999,
  STOCK narrator = #c97050 (the A11Y hue) — all single-token swaps if we revisit.
- Next: Phase 2 (shell — rail/canvas/floor grid) builds on these.

The four homes, from the spec:

- **RAIL** = *file layer* — edits `defaults` (◆), bakes into the export.
- **DRAWER** = *scene* — per-scene view params (size, leading, text). Not font state.
- **DOCK** = *preview* — transient `preview` (●) CSS overrides. Never baked.
- **GESTURE** = *transient* — word-drag / hold-compare; lives only for the gesture.

Plus **FLOOR** (the transaction: zones, start-from, hold-compare, OFL, download) and the
**⚙ prefs** row (non-baking app settings).

---

## 1. State → three-layer store

The store the spec wants us to build first. Current React state sorts into it like this:

| Layer | Definition | Current state that feeds it |
|---|---|---|
| **`SHIPPED`** | immutable stock Cal Sans axis defaults | `axes[].default` captured once at load. Already the reset target in `resetConditions` (`axes.map(a => a.default)`). Just needs to be frozen into a constant. |
| **`defaults`** (◆) | user's re-anchored origin; what the rebuild bakes | `defaults` (axis map) · `glyphThresholds` · `opszMultiplier` · `freezeOpsz` · `frozenOpszValue` · `autoAscender`. These are the six things `downloadTTF` sends to `applyConfig`. |
| **`preview`** (●) | transient CSS `font-variation-settings`, never baked | `previewOverrides` (+ `ital`, which is already preview-only today). |
| *(scene/view — a 4th bucket, not a font layer)* | per-scene render params | `previewSize` · `tracking` · `typeTesterText` · `showXRay`/active scene. The spec files these under **DRAWER**, not the store. |

Selectors to add: `merged() = defaults + preview`, `effective() = stockHold ? SHIPPED : merged()`.
Every render surface reads `effective()`. Today the equivalent is `previewVarSettings()` +
`displayVal()` + `previewVal()` — three ad-hoc paths that this collapses into one.

---

## 2. Control → home

| # | Current control (App.tsx) | Layer written | New home |
|---|---|---|---|
| 1 | Axis Defaults sliders — `wght` etc. (`renderSlider` → `handleSliderChange`) | `defaults` ◆ | **RAIL** — weight & slant cluster, as ◆ pin controls |
| 2 | Parametric sliders — `YTAS`, `SHRP` | `defaults` ◆ | **RAIL** — parametric cluster, ◆ pins |
| 3 | GEOM default (zone-col-header click; Type Matrix GEOM handle; presets) | `defaults.GEOM` ◆ | **FLOOR** zone chips (coarse, re-anchor + clear preview) · **RAIL matrix** GEOM handle (fine) |
| 4 | `opszMultiplier` (Optical Size Scale slider, 1–6×) | `defaults` ◆ (bakes) | **RAIL** — optical cluster, distinct stepped control ✅ §3.1 |
| 5 | `freezeOpsz` checkbox | `defaults` ◆ | **FLOOR** — spec lists freeze-opsz on the floor |
| 6 | `frozenOpszValue` (set by presets only) | `defaults` ◆ | derived; travels with freeze-opsz, no direct UI |
| 7 | `autoAscender` checkbox | `defaults` ◆ (bakes) | **RAIL** — construction toggle; greys the YTAS pin ✅ §3.2 |
| 8 | Ascender waterfall modal (`showAscenderModal`) | read-only | informational; fold into **SCALE/INFO** scene or keep as popover off #7 |
| 9 | `glyphThresholds` (palette drag, matrix handles, trash, presets) | `defaults` ◆ (FeatureVariations) | **RAIL — MATRIX mode** (port GlyphGroups, identical semantics) |
| 10 | Trash bar + restore (`trashedGlyphs`) | `defaults` ◆ | **RAIL — MATRIX mode**, with the matrix |
| 11 | Type Matrix toggle (`showXRay`) | — | **RAIL** segmented `TUNE ‖ MATRIX` |
| 12 | Type Matrix Reset button | `defaults` ◆ | **RAIL — MATRIX mode** Reset |
| 13 | Preview pill sliders — all axes (`handlePreviewChange`, horizontal + `VAxisSlider`) | `preview` ● | **DOCK** (weight & italic first) |
| 14 | `ital` pill | `preview` ● | **DOCK** |
| 15 | `previewSize` pill (12–200pt) | scene/view | **DRAWER** + **Previewer popup** (font size) ✅ §3.5 |
| 16 | `tracking` pill (−10–30%) | scene/view | **DRAWER** + **Previewer popup** (letter/word spacing) |
| 17 | `typeTesterText` (editable textarea) | scene/view | **CANVAS** — WORDS / PARAGRAPH editable text (+ Previewer popup Text field) |
| 18 | Preview reset button (`resetTypography`, pill-reset-btn) | clears `preview` | **RETURN PILL** — clears preview (●) only ✅ §3.3 |
| 18b | **NEW** — file/defaults reset | resets `defaults` ◆ + `activePreset` | **RAIL** reset — clears all ◆ adjustments; syncs the engaged preset ✅ §3.3 |
| 19 | Context presets — Mobile UI / Display / Wayfinding | `defaults` ◆ | **FLOOR** — "start from…" dropdown ✅ §3.4 |
| 20 | Reference-font presets — Futura, Neutra 2, Inter, Circular, Geist, Poppins, GT America (+disabled Gotham) | `defaults` ◆ | **FLOOR** — same "start from…" dropdown ✅ §3.4 |
| 21 | `scaledOpsz` checkbox (Neutra 2 / Inter only) | `defaults` ◆ | sub-option inside the start-from dropdown |
| 21b | `activePreset` (which preset is engaged) | store | reflected by the "start from…" dropdown; cleared by RAIL reset (#18b) ✅ §3.3 |
| 22 | `useHoi` checkbox (swaps font file) | app pref | **⚙ prefs** row at rail foot |
| 23 | `springEasing` checkbox (motion) | app pref | **⚙ prefs** row |
| 24 | `menuOpen` hamburger (mobile controls collapse) | — | rail responsive collapse (mechanism, not a logical control) |
| 25 | OFL checkbox (`oflAgreed`) + Download button | transaction | **FLOOR** |
| 26 | Zone columns STANDARD `◉` / PREVIEWING / SECRET markers | derived read-out | **STATE TAG** (`YOUR ◆` / `PREVIEWING ●` / `STOCK`) + zone-chip active state |
| 27 | Header (h1, subtitle, attribution) | chrome | **INFO** scene + rail-top wordmark |
| 28 | Download filename (hardcoded `'ReCal Sans X shift…'`) | `defaults` (name table) | **INFO** — editable build-name field |
| 29 | Letterbox footer, site-footer | chrome | keep below **FLOOR** |
| 30 | `previewModal` (per-zone testing modal) | — | **Delete** the modal shell; **keep its view sliders** → new **Previewer popup** ✅ §3.5 |

---

## 3. Ambiguities — RESOLVED

Per the spec: *"If any control can't be assigned to exactly one home, stop and flag it."* All
five are now decided (owner sign-off 2026-07-14).

### 3.1 `opszMultiplier` — ✅ distinct rail control
It bakes (`defaults`/RAIL), but it's a 1–6× *scalar rescaling opsz*, not a ◆ pin on an axis.
**Decision:** it gets its **own distinct stepped control in the rail's optical cluster** — not a
diamond-pin, not on the floor. Note it secretly goes fractional (0.625) under Neutra/Inter, so
the control must tolerate a sub-1 value when a preset sets it (even if the visible steps are 1–6).

### 3.2 `autoAscender` — ✅ rail construction toggle
**Decision:** a **construction-cluster toggle in the rail** (it bakes, so not a ⚙ pref). When on,
it **greys the YTAS ◆ pin** with a "driven by opsz" note, since the avar2 graft derives YTAS.

### 3.3 Reset — ✅ two distinct resets
There are two, in two homes:
- **Return pill** (canvas) — clears **`preview` (●) only**. Strict; does not touch defaults.
- **RAIL reset** (left) — resets **all `defaults` (◆) adjustments** (axis defaults, thresholds,
  opszMultiplier, freeze, autoAscender) back toward `SHIPPED`, **and "talks to" the engaged
  preset**: it clears/re-syncs `activePreset` so a reset doesn't leave a stale preset label
  highlighted. (This absorbs today's `resetConditions`, which already reset axes+thresholds+opsz
  but did *not* clear `activePreset` — that gap is fixed here.)

### 3.4 Presets — ✅ all into one dropdown
**Decision:** **all ten presets** (context *and* reference-font) collapse into a single
**"start from…" dropdown** on the floor. No split, no dissolving into zone chips — every preset,
including Mobile UI / Display / Wayfinding, is just an entry in that dropdown. `scaledOpsz` is a
sub-option that appears for the bi-family entries.

### 3.5 Palette + `previewModal` — ✅ delete the modal, keep the sliders as a popup
- **Palette:** the glyph strip stays the read-only "Rosetta Stone" (→ **GLYPHS scene**, markers
  deep-link to the matrix). Drag-to-zone / drag-to-trash **editing relocates to the RAIL matrix**.
  The canvas glyph view is display-only.
- **`previewModal` — the modal shell dies, but its render pipeline is promoted to the canvas
  engine.** This is the key architectural point (owner, emphatic): **the output of the preview
  modal IS the engine for the entire canvas** (the dominant ~80% region and all of its scenes).
  The modal is a working miniature of the instrument model — `axisValues + size + spacing →
  modalVarSettings → styled text`. We do **not** throw that logic away; we **promote it**:
  - Its render function (generalizing `modalVarSettings` / `previewVarSettings` into one
    `effective()`-driven `renderVarSettings`) becomes the single pipeline **every scene** reads
    (WORDS, PARAGRAPH, SCALE, GLYPHS, UI). One engine, many scenes.
  - Its `axisValues` state shape maps onto `merged()` = `defaults` + `preview`.
  - Its control rows (size/spacing/opsz/GEOM/wght/YTAS/SHRP + zone tabs) become the control
    surface, surfaced two ways: the inline **play dock** (● quick preview) and the fullscreen
    **Previewer popup** (§6, the "try it in every view" surface).
  - Only the `<div className="preview-modal-overlay">` *markup* is deleted; the *behaviour* is
    the foundation of Phase 4 (Scenes) and Phase 5 (Play dock).

  Rationale from the owner: *a "preview" is for trying what using the font is like across many
  views; the right/canvas panel is what the **new normal default** looks like.* Same engine, two
  readings — canvas at rest = the baked ◆ default in context; the popup/dock = the ● playground.

---

## 4. New mechanisms with no current control

These have no old control to map from — they are Phase 3–5 additions, listed so the store
supports them from the start:

- **Hold-to-compare → STOCK** (`effective()` returns `SHIPPED` while held). No equivalent today.
- **Return pill** — contextual, springs in only when `preview` ≠ `defaults`. (Closest today: the
  always-present pill-reset button; the pill is conditional and full-sentence.)
- **Word-drag scrub** — horizontal drag on a WORDS word scrubs `preview.GEOM` live, springs home
  on release. Today GEOM only moves via zone click / dock pill / matrix handle.
- **Attract loop** — idle words spring to their wired zone every ~3.5s. New.
- **INFO receipt** — axes table (range / shipped ◆ / yours ◆) + live "N swap points · N glyphs
  edited" from matrix state + editable build-name. New (build-name replaces the hardcoded
  filename, #28).
- **State tag** — one narrator (`YOUR ◆` / `PREVIEWING ●` / `STOCK`); generalizes the per-column
  STANDARD/PREVIEWING labels (#26).

---

## 5. Token note (for Phase 1, not this doc's scope)

No `:root` custom properties exist yet — the palette is hardcoded. Values to extract:
background `#0f0f0f` / panels `#111` `#1a1a1a` / hover `#252525` / primary action & thumb
`#e8e8e8` / zone colors A11Y `#c97050` · UI `#999` (renders `#fff` in the grid) · Base `#4a7fd4`
· Geo `#4aad5c`.

**One flag for directive 3:** the spec says the ◆ marker takes "the site's existing accent
color," but directive 2 bans a terracotta/orange accent. The only orange in the current CSS is
`accent-color: #c97050` (checkboxes) — which is *also* the A11Y zone color. So "existing accent"
is ambiguous between `#e8e8e8` (the dominant action color: download button, slider thumbs) and
`#c97050` (terracotta, but that's a zone color and the banned hue). **Recommendation:** ◆ =
`#e8e8e8`, ● = a mid-grey neutral (`#999`/`#666` scale). Confirm before Phase 1.

---

## 6. The canvas engine & Previewer popup (resolved from §3.5)

**The engine.** The old `previewModal`'s render path is the prototype of the whole canvas.
Generalize its `axisValues → font-variation-settings → styled text` into one function driven by
the store:

```
renderVarSettings(scene, sceneParams) = effective()  → 'wght … opsz … GEOM …'
   where effective() = stockHold ? SHIPPED : (defaults + preview)
```

Every scene renders through this one function. No scene computes variation settings on its own
(today WORDS-samples, the type-tester, the glyph strip, the trash tokens, and the modal each
build their own settings string — five ad-hoc paths that collapse into one).

**Two readings of the same engine:**
- **Canvas at rest = the ◆ default.** With `preview` empty, `effective()` = `defaults`. The
  dominant panel shows *the new normal* — what shipping your ◆ actually looks like.
- **Play = the ● overlay.** Dock sliders / word-drags / the Previewer popup write `preview`; the
  canvas travels; the Return pill springs it back to ◆.

**The Previewer popup** (fullscreen "try it in every view" — reference: fortheHearts.net
fullscreen previewer, owner-supplied). Absorbs the old modal's controls plus the fortheHearts
control set. It writes `preview` (●) + scene/view params — **never bakes**. Contents:

| Control | Writes to | Notes |
|---|---|---|
| Text field | scene | the editable specimen string |
| Style (Upright / Italic) | `preview.ital` | Cal Sans `ital` axis (the fortheHearts Roman/Italic toggle) |
| Named instances | `preview` (axis set) | jump to a stock fvar named instance |
| OpenType feature chips | scene feature settings | generated from the font's real GSUB tags; per spec, labelled as the manual override for the same `ss` variants GEOM drives automatically |
| Font size | scene | 12–200pt (today's `previewSize`) |
| Leading | scene | line-height |
| Column width / measure | scene | em measure |
| Letter spacing | scene | today's `tracking` |
| Word spacing | scene | new |
| Optical Size (opsz) | `preview.opsz` | |
| GEOM (+ zone tabs) | `preview.GEOM` | zone tabs = quick jumps, as in the old modal |
| Weight (wght) | `preview.wght` | |
| YTAS / SHRP | `preview` | |

Cal Sans has **no `wdth` axis** (axes are opsz, GEOM, wght, YTAS, SHRP, ital) — so the
fortheHearts "Width" row has no analogue; drop it.

**✅ Resolved — the Previewer display *is* the interface for "play."** There is no separate
"play dock" control set to reconcile against a separate popup: they are **one interface**. The
Previewer (its display + its control bank in §6's table) *is* the inline play surface. So "play"
= the Previewer. The store has exactly one ● control surface, and the spec's "play dock" and this
Previewer are the same thing described from two angles — build it once.

Presentation is a layout detail, not two components: the same Previewer interface may show
compact (docked at the canvas edge) or expanded (fullscreen), but it is a single control model
writing `preview` (●) + scene params.

---

## 7. Port source — `font-proofer` (owner-supplied reference)

`/Users/Mark/Documents/Github/font-proofer` (the repo the `ResetIcon` was already lifted from)
is a mature build of most of what the canvas + dock need. It is a single `src/App.jsx` (~3,400
lines). We **port from it**, we don't reinvent. It is a *behaviour/structure* reference — its
own dark chrome is not the visual target (same rule as the instrument prototype: model survives,
look washes away). Directive-2 tokens still apply.

### 7.1 Scene switcher — "PREVIEW MODE" → the canvas modebar

font-proofer's left-sidebar **PREVIEW MODE** list *is* the spec's canvas modebar. Its `mode`
state (`App.jsx:705`, hash-routed at `:67`) maps straight across:

| font-proofer `mode` | Instrument scene | Notes |
|---|---|---|
| `big` (Big Word) | **WORDS** | grabbable display words |
| `paragraph` (Paragraph) | **PARAGRAPH** | the markdown distinguisher — §7.2 |
| `scale` (Type Scale) | **SCALE** | Tailwind scale, §7.3 |
| `glyphs` (Glyphs) | **GLYPHS** | charset grid |
| `calcom` (Cal.com mock) | **UI** | booking-flow mock, baked defaults |
| `coss` | **(deferred)** | font-proofer has a `coss` mode; owner wants a COSS UI panel — docs/particles from https://coss.com/ui — as its own scene tab that **lazy-loads on click**. Backlog, not this phase. |
| *(none)* | **INFO** | new; no font-proofer analogue |

### 7.2 PARAGRAPH — the "semi-custom markdown paragraph distinguisher"

This is the piece the owner called out. font-proofer models a document as **typed blocks**
(`{ type: 'h1'|'h2'|'h3'|'p', text }`) with a **per-block style model** that inherits from the
global control (null = inherit) — exactly the Heading-1/2/3/Paragraph dropdown in the reference
shots. Port these:

- **`DEFAULT_PARA_STYLES`** (`App.jsx:250`) — h1 `57px/1.1/wght700/opsz auto` · h2
  `32px/1.2/wght400/opsz auto` · h3 `22px/1.3/opsz auto` · p `18px/1.6/opsz auto`. These *are*
  the badges in the type-scale dropdown. `opsz: 'auto'` per block = the spec's PARAGRAPH
  `font-optical-sizing: auto`.
- **Per-block selector + panel** — `activeParaStyle` (h1/h2/h3/p toggle, `:1546`) and the
  paragraph styles panel (`paraStylesPanelOpen`, `:2679`, opened by the sliders button in the
  reference shot). → lands in the **PARAGRAPH scene DRAWER**.
- **Text-source tabs** — `TEXT_PRESETS` (`App.jsx:167`): *Sample · A Tale of Two Cities ·
  Staatliche Bauhaus · Kern King*. → the spec's PARAGRAPH text-source tabs (sample / literature /
  kern-stress). ✅ **Bring the tab-bar UI over as-is** (owner): the horizontal pill-selected tabs
  render at the **top of the PARAGRAPH canvas**, above the document — this is canvas chrome, *not*
  part of the bottom control surface (it's the one font-proofer control that already lives on the
  canvas, so it stays there). Owner also wants Markdown-style rendering, so blocks come from
  parsed markdown, not a fixed array.
- **Escape bar / measure** — right-margin drag → column width (`rightMargin`, `:736`, `:2301`).
  → PARAGRAPH drawer "measure".

### 7.3 SCALE — Tailwind type scale

`TAILWIND_SCALE` (`App.jsx:266`, xs→9xl) + `SCALE_PAIR_TEXT` (`:285`) + per-step `opsz: 'auto'`
(`:287`). → the **SCALE** scene (spec: waterfall 45→9, auto opsz, zero controls). Port as-is;
Size/Tracking/Leading are hidden in this mode (`:2001`) — matches "zero controls."

### 7.4 The dock control panel

font-proofer's left **TYPOGRAPHY** + **VARIABLE AXES** sections (reset · align toggles · `ss05`
chip · named-instance dropdown · Size · Tracking · Leading · Weight…) are a built version of the
**Previewer / play interface** (§6). Port the control rows and the numeric-stepper + slider pair.

**Two adaptation rules — do not copy wholesale:**
1. **font-proofer's whole sidebar → the one BOTTOM preview-control surface.** ✅ (owner). Both
   halves of font-proofer's left panel — the **scene switcher** (Big Word / Paragraph / Type
   Scale / Glyphs) **and** the **type controls** (Size / Tracking / Leading / Weight / features /
   named instance) — move together into a **single bottom preview-control surface** spanning
   under the canvas. There is no separate top modebar and no side dock: scene selection *is* a
   preview control, so it lives with the other preview controls. This surface is the `preview`
   (●) + scene-param home (the §6 Previewer, docked). What does **not** go here: the **◆ default
   pins**, which are the **rail** — that's ReCal-native and stays the file layer. So the split is
   just two ways: **rail = ◆ file** · **bottom surface = everything preview/scene (●)** · canvas
   at rest = the baked ◆ "new normal."
2. **OpenType chips are Cal-Sans-specific.** font-proofer's `featureStr` toggles `ss04` (italic)
   / `ss05` (roman) for *its* fonts (`App.jsx:258`). For ReCal, the feature chips are generated
   from Cal Sans's real GSUB tags — the `rclt` variants that GEOM drives — and labelled as the
   manual override for those same variants (spec §PARAGRAPH). Don't port the ss04/ss05 logic
   verbatim; regenerate chips from the loaded font.

### 7.6 Two source UIs → two homes (the master mapping)

The whole re-home reduces to routing two existing panels to two homes:

| Source panel | → Home | Layer | What it becomes |
|---|---|---|---|
| **ReCal's current `controls` sidebar** (Optical Size Scale · Axis Defaults · Parametric · Experimental) | **RAIL** | `defaults` ◆ | the **font mutator** — ◆ pin controls that re-anchor the export. This is the rail, verbatim in function, restyled per §3.1/§3.2. |
| **font-proofer's left sidebar** (PREVIEW MODE + TYPOGRAPHY + VARIABLE AXES) | **BOTTOM preview-control surface** | `preview` ● + scene | the **play / Previewer** — scene switcher *and* all preview type controls, together (§7.4 rule 1). |

Everything else (zone chips, start-from, OFL, download, hold-compare) is the **floor**; the
**canvas at rest** shows the baked ◆ default ("the new normal"). Owner: *"the font mutator panel
is what the ReCal current sidebar should be."* i.e. the rail = today's sidebar, re-skinned as the
◆ file layer — no new control logic invented for it, just re-homed and re-styled.

### 7.5 Also available to lift

- `ResetIcon` — already in ReCal; same source.
- Numeric stepper control (the `18 ⌄` fields in the reference) for size/tracking/leading/axes.
- Named-instance dropdown ("Light" in the shot) → the Previewer's "Named instances" row (§6).
- Cal.com logo/mock assets (`src/logos/calcom.svg`) for the **UI** scene.

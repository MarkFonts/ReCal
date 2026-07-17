# ReCal Sans — Instrument Model port

Prompt for Claude Code. Work in a new branch: `instrument-model`.

## What this is

ReCal Sans (this repo) already has the hard parts working: in-browser font rebuild via Pyodide + fontTools (fvar/avar default re-anchoring, GSUB FeatureVariations rewriting from the type matrix), undo, zone presets, export with OFL acceptance and freeze-opsz. Do not rebuild any of that. This branch re-homes the existing mechanics into a new interaction architecture — the "instrument model" — and restyles the tool so Cal Sans itself is the interface.

A working HTML prototype of the target architecture exists (`recal-instrument.html`, attached alongside this spec). Treat it as an interaction reference, NOT a visual reference. Its look and feel — the terracotta/orange accent, the monospace headings, the dark palette as executed — must wash away entirely. Only the model survives.

## North star

Space Type Generator (spacetypegenerator.com): the canvas dominates (~80%+ of viewport), controls dock at the edges as one calm uniform texture, and the visual hierarchy alone teaches "edges tune, center shows." The tool reads as an instrument you play, not a settings panel.

## Non-negotiable design directives

1. **Cal Sans is the UI typeface for everything.** All chrome — headings, labels, buttons, section titles, values. The tool is a specimen of the font it sells. Do not introduce a monospace for headings or labels. For numeric readouts and value columns that need alignment, use Cal Sans with `font-feature-settings: "tnum" 1` instead of a mono. The single permitted exception: the copyable CSS readout string may use the system mono stack, since it represents literal code — and even that is worth trying in Cal Sans + tnum first.
2. **No new palette. No terracotta/orange accent — that reads as AI-default, not as this brand.** Derive every color token from the existing ReCal/wordmark.nyc styles before writing any new CSS: extract the current background, panel, border, text, and accent values into CSS custom properties and build only from those. Zone colors: reuse the existing four zone colors from the current tool's zone cards/matrix exactly as they are.
3. **Baked-default markers (the ◆ concept) take the site's existing accent color.** Preview markers (the ● concept) take a neutral from the existing scale. The two must be different visual species (shape AND color AND control style), never two thumbs of the same kind.
4. Respect `prefers-reduced-motion` everywhere. Spring easing is the house motion (`cubic-bezier(.34,1.45,.64,1)` or the tool's existing spring, if one is defined).

## The architecture

### Layout: three regions

```
┌──────────┬──────────────────────────────────┐
│ RAIL     │  CANVAS (dominant)               │
│ (file)   │   modebar: scenes                │
│          │   stage: active scene            │
│          │   play dock (ephemeral, bottom)  │
│          │   scene drawer (per-mode)        │
│          │   readout strip (state tag+CSS)  │
├──────────┴──────────────────────────────────┤
│ FLOOR: zones · compare · OFL · Download     │
└─────────────────────────────────────────────┘
```

### The state model (build this first — everything hangs off it)

One store, three layers:

- `SHIPPED` — immutable constants: the axis defaults of stock Cal Sans as released.
- `defaults` — the user's ◆ re-anchored origin. This is what the rail edits and what the rebuild bakes into fvar/avar. Zone chips write here.
- `preview` — transient ● overrides from play (dock sliders, matrix scrubber, word drags). Never baked. Cleared by "Return to your defaults."

Selectors: `merged() = defaults + preview`, `effective() = stockHold ? SHIPPED : merged()`. Every rendering surface reads `effective()`. Map the existing app's current slider state into these three layers before touching UI — produce a short mapping doc (old control → new layer + new home) as the first commit, and keep the current UI reachable behind a route or flag for the whole branch so behavior can be regression-compared.

### Rail — the file layer (left, narrow)

- The existing DEFAULT sliders live here, restyled as ◆ pin controls: a track with a single diamond pin. Dragging a pin re-anchors the font's default for that axis. Nothing else in the app gets this control style.
- Ghost ● dots may appear on rail tracks as read-only telemetry of preview drift. **Hard rule: preview never gets a draggable control on the rail.** If a user request ever implies one, the answer is the play dock.
- Sections with snap-scroll and chevron headers (click header → smooth scroll; chevron indicates active section via IntersectionObserver). Group by the existing axis clusters (optical / parametric / construction / weight & slant).
- Rail-top segmented toggle: **TUNE | MATRIX**. Matrix mode swaps the rail's content for the existing type matrix (variant lanes per glyph, draggable swap boundaries, Delete = never invoke a variant, ⌘Z = existing undo, Reset). Rail may widen (~90px) in matrix mode. Port the existing matrix component; keep its editing semantics identical.
- App preferences (spring easing, HOI, etc.) compress to one small row at the rail's foot or a single ⚙ popover. No explainer paragraphs in the rail — tooltips only.

### Canvas — scenes, not panels

Mode row (content types only — never mix with site nav or transactions): **WORDS · PARAGRAPH · SCALE · GLYPHS · UI · INFO**

- **WORDS** — large display words. Each word is grabbable: horizontal drag scrubs GEOM live (`~3px per unit`), swap points firing under the hand; release springs the word home to ◆. During drag, kill the CSS transition; restore it on release (the spring home IS the message: the default is gravity). Idle attract loop: every ~3.5s with no interaction in the last ~6s, one word springs to its wired zone and settles back. Loop pauses during stock-hold and under reduced-motion.
- **PARAGRAPH** — editable running text at body sizes with `font-optical-sizing: auto`; text-source tabs (sample / public-domain literature / kern-stress). Scene drawer (below): size, leading, measure sliders + OpenType feature chips generated from the font's real GSUB tags with plain-language labels (the ss family is the manual override for the same variants GEOM drives automatically — label them that way).
- **SCALE** — waterfall of sizes 45→9 with auto opsz. Zero controls; the point is "opsz follows size for free."
- **GLYPHS** — charset grid at `effective()` values; glyphs carrying GEOM swaps get a small zone-colored marker that deep-links to the matrix.
- **UI** — a booking-flow mock (Cal.com genre) set entirely with baked defaults and no `font-variation-settings`: "this is what shipping your ◆ looks like." Include an Il1 stress line.
- **INFO** — the receipt. Real name/head-table metadata, plus the two things only this tool can show: an axes table with columns *range / shipped ◆ / yours ◆* (yours lights in accent only where changed), and a construction line "N swap points · N glyphs edited" live from matrix state. The build-name field here is editable and feeds the rebuilt name table (OFL modified-name mechanics).

### Play dock — ephemeral preview sliders

Bottom of canvas. Collapsed: a one-line always-visible handle whose microcopy states the contract (e.g. "play — preview only, nothing bakes"). Blooms on pointer proximity/entry; folds ~350ms after leave; stays open while any child has keyboard focus. Rows: label | slider | value for all six axes (weight and italic first). Writes to `preview` only. Sliders sync to `effective()` every render (skip the actively-dragged input) — so they visibly travel during stock-hold and spring back on Return.

### Origin mechanisms

- **State tag** in the readout strip, always visible, one of three: `YOUR ◆` (accent) / `PREVIEWING ●` (neutral) / `STOCK` (a third existing color). This is the narrator of the whole system.
- **Return pill** — contextual, not a permanent chip: appears (springs in) bottom-right of canvas only when preview has drifted from defaults; full sentence label ("Return to your defaults"); click clears `preview`. Rule learned the hard way: *abstraction and prominence move together* — the tool's one novel concept gets the full sentence and real size; never a 10px abbreviation.
- **Hold-to-compare** — a labeled button in the floor ("hold: original Cal Sans"): pointer-down flips the entire instrument (canvas, dock, matrix lanes) to SHIPPED; release springs back. Hold, not toggle — release always means *yours*. Keyboard: Space/Enter down/up.
- Zone chips on the floor re-anchor `defaults` AND clear `preview` in the same action — choosing a zone is choosing an origin, so land exactly on it.

### Floor — the transaction

Zones (chips, existing zone colors) · reference-font presets collapsed to one "start from…" menu (the /alternative/[name] pages remain their real home) · hold-compare · OFL checkbox · freeze-opsz · Download. Download reflects rebuild state: when matrix edits or ◆ changes are pending recompile, show "N edits — rebuilding…" until the Pyodide pipeline finishes, then enable.

## Backend hookup

- ◆ default changes → existing fvar/avar re-anchor path.
- Matrix boundary/delete edits → existing FeatureVariations rewrite path. The matrix edits a spec; the loaded binary updates only after rebuild. Make the gap visible (the rebuilding state above), never silent. If rebuild latency is under ~300ms, skip any optimistic-preview tricks.
- Preview layer is pure CSS `font-variation-settings` — it never touches the pipeline.
- Undo: route matrix edits and ◆ changes through the existing history; preview changes are NOT history events (they're cleared, not undone).

## Engineering rules from prototype bugs

- Anything holding pointer capture must survive the whole gesture: never re-render/replace a node mid-drag. Drag against refs/local values, mutate styles in place, commit to state on release (this also yields clean single-step undo entries).
- Drag commits snapshot on grab, not per-move.
- All custom tracks/handles: pointer events + `touch-action` set, `setPointerCapture`, and keyboard equivalents on focusable controls.

## Phases (commit per phase; each phase shippable)

0. **State refactor** — the three-layer store + selectors + mapping doc; old UI still mounted.
1. **Tokens & type** — extract existing colors into custom properties; Cal Sans as UI type everywhere; tnum for numerics. (This alone de-generifies the look.)
2. **Shell** — rail/canvas/floor grid; move existing controls into their homes; no new features.
3. **Origin system** — state tag, return pill, stock-hold, zone-chips-re-anchor, INFO receipt.
4. **Scenes** — modebar + WORDS/PARAGRAPH/SCALE/GLYPHS/UI, paragraph drawer + feature chips.
5. **Play dock + gestures** — dock, word-drag with spring-home, attract loop.
6. **Matrix-in-rail** — port the existing matrix editor into rail mode; wire rebuild-state to Download.

Before phase 2, post the control-mapping doc for review. If any control can't be assigned to exactly one home (rail = file, drawer = scene, dock = preview, gesture = transient), stop and flag it — that ambiguity is the original ReCal problem trying to return.

### Status — verified against code 2026-07-17

Phases are NOT strictly linear in the current build: scene polish (phase 4) raced ahead while
3/5/6 were left partial. Verdicts below are from a code audit, not the commit log.

| Phase | Verdict | Landed | Remaining gap |
|---|---|---|---|
| 0 — State refactor | ✅ done | 3-layer store + `merged()`/`effective()` (`store.ts`), provider/hook, legacy at `?ui=classic`/`#classic` | — (legacy flag is `classic`, not a `/recalsans-legacy` route — see deploy note) |
| 1 — Tokens & type | ✅ done | `tokens.css` palette/zones, `--ui-font` Cal Sans, `.tnum` | — |
| 2 — Shell | ⚠️ partial | rail/canvas/floor grid, ◆ pins | no **TUNE \| MATRIX** toggle; no snap-scroll / chevron rail headers |
| 3 — Origin system | ⚠️ partial | state tag (rail footer), zone chips re-anchor + clear preview, INFO receipt (`Info.tsx`) | **Return pill absent**; **hold-to-compare commented out** (`Shell.tsx` Floor) |
| 4 — Scenes | ✅ done (drawer partial) | modebar + all 6 scenes | paragraph drawer only `measure`; **OT feature chips hardcoded, not generated from GSUB** |
| 5 — Play dock + gestures | ⚠️ partial | play dock (bloom, preview-only), reduced-motion | **word-drag GEOM scrub absent**; **attract loop absent** |
| 6 — Matrix-in-rail | ❌ missing | — | no rail matrix; **Download is a disabled `Download — Phase 6` stub** (`Shell.tsx` Floor) |

**Export today lives in the LEGACY app** (`App.tsx`, `?ui=classic`), which still owns the
Pyodide/fontTools rebuild + OFL download. The instrument UI is a tuning/preview surface until
phase 6 ports export across. This is by design, not a regression.

**GEOM flash** — v2 (held-while-dragging, fade-on-release) is now built: `geomDragging` in the store,
persistent per-glyph zone color, `.geom-flash-hold` vs `.geom-flash`. A post-phase refinement, not a
numbered phase. Follow-ons in flight: flash reads live `effectiveThresholds` (so colors adapt to matrix
edits), diacritic composites color with their base group, and flash extended to Paragraph/Scale.

**Stylistic-set freezer + shape-source color language** (see VISION.md → What's deferred) is the
instrument-model home of the **original customizer's Phase 4** ("freeze stylistic sets"). It bakes via
the same Pyodide export path, so it lands with **Phase 6** (export). Deferred until then; the GEOM-swap
color language is being built first, with the ss/gold override layer designed to slot on top.

**Deploy topology (confirmed 2026-07-17):** Two homes on the `MarkFonts/wordmark` site repo —
`/recalsans` (current build, base `/recalsans/`) and `/recalsans-legacy` (a separate FROZEN build,
base `/recalsans-legacy/`, bundle `index-BXS2gmEZ.js`). `.github/workflows/deploy.yml` rebuilds this
repo and `rm -rf`s **only** `wordmark/recalsans` (no glob) then copies `dist/` in, so `/recalsans-legacy`
is never touched. Separately, `/recalsans?ui=classic` reaches the *current* bundle's `App.tsx` (tracks
`main`), which is NOT the same snapshot as the frozen `/recalsans-legacy`. ⚠️ Never broaden that
`rm -rf` to `recalsans*` — it would delete the frozen legacy archive.

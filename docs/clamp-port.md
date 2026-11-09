# Clamp pad: port diff for ReCal

Paths are under /Users/Mark/Developer/Github/ReCal unless noted. `shared/` is the wm-primitives git submodule (Shell.tsx:10 imports from '../../shared/index'); `node_modules/wm-primitives` does not exist. Prototype: scratchpad/clamp-pad.html, cited as `proto:N`.

Findings that change the plan:
- `src/instrument/urlState.ts` exists and is complete, but nothing in `src/` imports it (grep for "urlState" is empty). Wire-up is a prerequisite, or the new params are dead code.
- `ExportConfig` (useFontEngine.ts:14-30) has no limits or frozen-axis fields. The UI can ship first; the bake needs a worker-side change (instancer limits) that this spec does not cover. Say so in the PR.
- Existing `freezeOpsz` / `frozenOpszValue` (store.ts:34-36) already means "opsz frozen". The new frozen set must absorb it, not duplicate it.
- Existing "Freezer" row (Shell.tsx:56, 233) freezes FEATURES (ssXX/cvXX). The new section is axes plus data options: name it "Subset", never "Freezer".
- Framer Motion is not in package.json (grep count 0).

## 1. Component-by-component diff

| Live part | Becomes | Stays |
|---|---|---|
| `Pad` (ShapePad.tsx:34-128) | Gains props `xClamp`, `yClamp`, `xFrozen`, `yFrozen`. Root `.shape-pad` pointerdown (l.77-82, 107) no longer maps the whole pad to a value; it only handles clicks outside the box (see below). New children: marquee, interior drag layer, 2 or 4 grabbers, dim washes. `fromPointer` (l.54-61) stays as the pointer-to-value mapper, reused by edges and knob | Props `x`, `y`, `top`, `height`, `bands`, `cols`, `yAuto`, `onDragState`; keyboard handler (l.87-97) gains clamp limits; `pushHistory` once per drag; `aria-label`; the lattice SVG (l.112-116); y labels (l.118-119) |
| Knob `.shape-pad-knob` (ShapePad.tsx:120, shell.css:890-894) | `pointer-events: none` is removed; it becomes a drag target (kind `dot`). Position clamped inside the box. 15px, 3px `--bg` ring stay | Size, `--signal-acid-fill`, ring, `data-zone` |
| Pad click on empty plot (today: jump knob there) | Recommended: a click inside the box jumps the knob there; outside the box is inert (dimmed). Confirm with Mark in step 3 | n/a |
| `ZoneCols` (ShapePad.tsx:132-179) | Add `clamp` prop; a column whose `mid` lies outside the GEOM clamp takes `opacity: .35` (proto:190,194). Nothing else; px measurement, `sampleGeom` variation settings and the active pill stay | Everything incl. `chipColor`, `visibility` gate, ResizeObserver, "Cal" glyph labels |
| `ShapePad` (ShapePad.tsx:182-204) | Passes `state.defaults.limits.GEOM/wght` and frozen flags into `Pad`. Zone bands (l.195-201) stay at 7% (`zoneBandBackground`, geomAxis.ts:42) | `onDragState` -> `setGeomDragging` (knob drag AND box slide set it; edge drag does not unless the knob is pushed) |
| `AscenderPad` (ShapePad.tsx:208-219) | Passes SHRP/YTAS limits and frozen flags. `yAuto` (autoAscender) wins: the y grabbers hide, YTAS clamp is not editable while auto | `top={12} height={150}`, aria-label |
| Optical size row `OpticalSize` (Shell.tsx:67-120) | Two modes today (Auto / Frozen, `rail-seg`, l.72-85). New: the Frozen mode is driven by the Subset checkbox for opsz, so the `rail-seg` Frozen side becomes a mirror of `frozen.has('opsz')`. The track slider (l.87-98) is replaced in Auto mode by the 1D clamp band (section 5); in Frozen mode it is the existing `AxisSlider` with no grabbers | `rail-seg` Auto/Frozen, Optical scale stepper (l.100-111), the `autoAscender` conflict note (l.63-66, 165) |
| Rail row layout (Shell.tsx:213-235, `ROW_LABELS` l.56, `ROW_SECTIONS` l.58, `summaries` l.204-212) | Add a 7th row "Subset" LAST (index 6, after Vertical metrics); the existing rows keep numbers 1-6 (the proto numbers it 4 only because it has no Matrix, Freezer or metrics rows). Add `'subset'` to `Section` (store.ts:76), `stockSection` (store.ts:80-90), `ROW_LABELS`, `ROW_SECTIONS`, a summary (`'nothing frozen'` / `'2 frozen · 3 clamped'`), and a `bodies` entry | `RailRow` (l.126-148) unchanged; pinned-header logic, `VMETRICS_ROW = 5` stays 5 (new row is index 6, so `open === VMETRICS_ROW` test is untouched) |
| Readout tiles `.shape-readout` (ShapePad.tsx:122-125, shell.css:895-901) | Each cell: label plus default large (existing `tnum`), and a second line `TAG lo - hi` (use an en dash with spaces, as proto:73) or `frozen at v`. Cell takes `data-live` (acid value while its axis is driven) and `data-frozen` (opacity .5) | 2-col grid, `--border-subtle` frame, `--marker-default` value color, `yAuto` "auto" |
| Helper text (new) | One `<span className="shape-pad-status">` inside the pad, bottom centre, only on 2-axis pads (proto:257-267). Copy table in section 3 | n/a |
| Subset section (new `SubsetPanel`, new file `src/instrument/Subset.tsx`) | Included axes: 5 checkboxes (wght, GEOM, opsz, SHRP, YTAS) + locked ital; each unchecked row shows `at <default>`. Data optimization: strip-inaccessible, retain layout features, character set select. Reuse `.rail-toggle` (shell.css:173) styling, not new card chrome | Freezer.tsx untouched |

## 2. State model

Today (store.ts):
- `defaults.axes: AxisMap` holds one number per tag (GEOM, wght, opsz, YTAS, SHRP, ital); ranges are the static `AXIS_RANGES` (store.ts:22-29); stock values `SHIPPED_AXES` (l.18-20).
- `setDefaultAxis` (l.216-221) writes `axes[tag]` and clears the matching ● preview. No range or limit exists anywhere.
- opsz freeze: `freezeOpsz`, `frozenOpszValue`, `opszMultiplier`. `autoAscender` boolean. Undo grain = whole `DefaultsLayer` via `cloneDefaults` (l.73) and `pushHistory`.

New fields on `DefaultsLayer` (add to `cloneDefaults`, `createInitialState` l.100-120, `defaultsDirty` l.171-180, `stockSection`):
```ts
limits: Record<string, [number, number]>   // per axis; stock = [AXIS_RANGES.min, max]
frozenAxes: string[]                       // sorted tags; ital never appears
// (the prototype's "Strip data inaccessible via limits" was dropped in step 7: L4 instancing always drops what lies outside a clamp, so the option could never be off)
subsetKeepFeatures: boolean                // default true
subsetCharset: 'latin1' | 'latinx' | 'all' // default 'latin1' (proto:310; confirm with Mark)
```
Arrays and Records, not `Set`, so `JSON.stringify` in `sectionDirty` (store.ts:93) and `cloneDefaults` keep working. Clone `limits` (copy each pair) and `frozenAxes`.

Invariants, enforced in ONE reducer helper `normalizeAxis(d, tag)` run after every limits/axes/frozen action (never in the component):
1. `AXIS_RANGES.min <= lo <= hi <= max` (a clamp may collapse to a point; hi < lo is impossible).
2. `lo <= axes[tag] <= hi` (default inside clamp). Pushing: edge drag moves the default (proto:109-110), range slide keeps the default clamped (proto:122).
3. frozen tag: effective limits are `[axes[tag], axes[tag]]`. Store the user's clamp underneath and restore it on unfreeze (the proto recomputes `cx` from defaults at render, proto:88, and keeps `clamps` intact; keep that behavior so unfreeze is lossless). The reducer does NOT overwrite `limits[tag]`; read through a selector `effectiveLimits(d, tag)`.
4. range slide keeps span `hi - lo` constant, clamped to `[min, max - span]` (proto:121).
5. `frozenAxes` migration: `freezeOpsz` becomes derived (`frozenAxes.includes('opsz')`) and `frozenOpszValue` equals `axes.opsz`. Keep the old fields as the source until the Subset step, then make `setFreezeOpsz` an alias that toggles `frozenAxes`. Keep the existing mutual exclusion with `autoAscender` (Shell.tsx:165): freezing opsz while auto ascender is on stays blocked, and YTAS cannot be frozen while `autoAscender` is on? Freezing YTAS while `autoAscender` is on is also contradictory: block both ways with the same note pattern as `OPSZ_FROZEN_BLOCKED`.
6. `opszMultiplier` rescales the opsz axis (Shell.tsx:844-845 uses `8 * mult`..`45 * mult` for the Try dial). Store opsz limits in UNSCALED axis units, like `AXIS_RANGES`.

New actions: `setLimit {tag, side: 'lo'|'hi', value}`, `slideLimits {tag, lo, hi}` (carries span; the reducer snaps and re-clamps), `setFrozenAxis {tag, frozen}`, `setSubsetOpt {key, value}`. `setDefaultAxis` additionally clamps its value to `limits[tag]`. One `pushHistory` per drag, as `Pad` does today. `setGeomDragging` is dispatched for knob and box drags only.

Query params (urlState.ts: AXIS_KEY l.24-26 is `o g w y s i`; `K` l.31-40 is `t m f aa ff n vm p`; keys are a frozen public contract, add only). Only the diff from shipped is written, as today:

| State | Param | Format | Omitted when |
|---|---|---|---|
| limits per axis | `lw`, `lg`, `lo`, `ly`, `ls` (`l` + the AXIS_KEY letter) | `lo-hi`, e.g. `lw=450-650` | equals `AXIS_RANGES` |
| frozen axes | `fz` | dot list of AXIS_KEY letters, `fz=o.y` | empty |
| strip option | `sx` | `0` | true (default) |
| keep features | `sk` | `0` | true |
| charset | `sc` | `latinx` or `all` | `latin1` |

Collision check against existing keys: `lo` collides in spirit with nothing (`o` is opsz default, `lo` is two letters; `lg`/`lw`/`ly`/`ls` unused; `fz` is not `f` or `ff`). Do NOT reuse `f` (it is `frozenOpsz`): decode must keep `f` working and map it to `fz` containing `o` plus `o=<value>`.

Decode: clamp to `AXIS_RANGES`, drop unparsable pairs, drop pairs where lo > hi, then run `normalizeAxis` so a hostile link cannot put the default outside the clamp (urlState.ts:109-110 says links are untrusted). Round-trip test: extend the existing exact-round-trip rule (urlState.ts:16).

## 3. Pointer and drag model

Live `Pad` today: pointer capture on the pad root (ShapePad.tsx:78), `onPointerMove` on the root (l.108), `end` on up, cancel, and lost capture (l.109). Mapping `axisFromClientX` (geomAxis.ts:29-32, uses `GEOM_INSET` 9px both sides) for x; y via `padRef` rect, `top`, `PAD_BOT` (l.54-61). Reads `xv`/`yv` from the render closure and compares for early-out (l.67). History is pushed lazily on the first real move (l.68).

Prototype: window listeners registered in an effect while `drag` is set (proto:99-133), a `startRef` snapshot of defaults, clamps and rect taken at pointerdown (proto:95), and a functional `setAll(prev => ...)` update so each move computes from the snapshot, not from stale props.

Recommendation: KEEP the live capture model (capture on the element, `onLostPointerCapture` as the end signal, one history grain); ADOPT the prototype's pointerdown snapshot and pure-function update. Reasons: capture already survives leaving the window and matches how Matrix drags work; window listeners would add a second lifecycle. But capture is per element, so each handle owns its own handlers.

Exact changes in `Pad`:
- Replace the single `drag` ref `{pushed}` with `{ kind: 'edge'|'dot'|'box', side?, x0, y0, rect, snap: {axes, limits}, pushed }` set at pointerdown; keep `pushed` lazy.
- Put `onPointerDown` on four things, not the root: each grabber (kind `edge`), the knob (`dot`), the box interior (`box`). Each calls `e.stopPropagation()` and `setPointerCapture` on ITSELF; each element has its own `onPointerMove`/`onPointerUp`/`onPointerCancel`/`onLostPointerCapture` delegating to one `step(e)` and `end()`.
- `step(e)` is a pure `computeDrag(snap, kind, side, e, rect) -> {axes patch, limits patch}` in a new `src/instrument/clampMath.ts` (unit-testable, no React), dispatching ONE batched action (`applyClampDrag {patch}`) so the reducer enforces the invariants. Do not compute pushes in the component.
- Delta drags (`dot`, `box`) use the snapshot's `x0/y0` and `rect.width - 2*GEOM_INSET` as the divisor (the proto divides by plot width W; live W is `rect.width - 18`). Absolute drags (`edge`) use `axisFromClientX`. Y uses the existing `top`/`PAD_BOT` mapping, not the proto's plain `H`.
- Rect: capture `padRef.current.getBoundingClientRect()` at pointerdown (proto:94), not per move, so a layout shift mid-drag cannot move the mapping.
- Rounding: live uses `Math.round` (l.58-59); the proto's `snap` rounds to step and clamps. Use `Math.round`; steps are all 1.
- Frozen axis: `edge` handlers are not rendered; `dot` and `box` ignore that axis (proto:118-119, 122-123); if both axes of the pad are frozen the whole pad is `aria-disabled` and 40% opacity (proto:169, 181).
- Hit sizes: grabbers 36x14 / 14x36 (proto:154) are fine on desktop; add `@media (pointer: coarse)` growth to 44px like AxisSlider's coarse block.
- Keyboard: grabbers and knob get `role="slider"` plus `aria-valuenow/min/max` and arrow handlers (Pad's root `onKeyDown` l.87-97 stays for the knob, clamped to `[lo,hi]`; grabbers: arrows move that edge by `nudge`, Shift by `big`).

Helper text (`.shape-pad-status`, caps, `--type-micro-size`, `--text-dim`, white while active; copy verbatim from proto:144-148): idle `DRAG EDGES TO CLAMP AXES`; edge drag `CLAMPING <TAG> MAX` for right/top, `MIN` for left/bottom (TAG uppercased: GEOM, WGHT, SHRP, YTAS); knob `SETTING THE DEFAULT`; box `MOVING THE RANGE`; all axes frozen `<TAG> FROZEN AT DEFAULT`. Note "WGHT" is uppercased from `wght`; the proto does the same.

## 4. CSS (src/instrument/shell.css, after `.shape-pad-knob` at l.894)

New classes, all on existing tokens:

| Class | Rule | Token mapping |
|---|---|---|
| `.shape-pad-plot` | `position:absolute; left:9px; right:9px; top:var(--pad-top); bottom:9px` (the same box `.shape-pad-dots` uses, l.872). Children use `%` inside it, so no `axisLeft()` calc needed | `GEOM_INSET` 9, `PAD_BOT` 9 |
| `.shape-pad-dim` (4 washes outside the clamp) | `position:absolute; background: color-mix(in srgb, var(--bg) 60%, transparent); pointer-events:none`. Only on the Shape pad (zone columns); on other pads dim just by marquee | `--bg` (proto's `rgba(21,21,21,.6)` is hex-in-disguise) |
| `.shape-pad-box` | dashed 2px marquee, `border-radius: var(--radius)`, `border-color: var(--text-dim)` at rest | `--text-dim`, `--radius` |
| `.shape-pad-box[data-active]` | solid `var(--text)` frame, `background: color-mix(in srgb, var(--text) 3%, transparent)`; 1D pad: `var(--signal-acid)` border plus `color-mix(in srgb, var(--signal-acid-fill) 18%, transparent)` fill | `--text`, `--signal-acid`, `--signal-acid-fill` (light mode resolves automatically to #557b00 / #96d500) |
| `.shape-pad-box-drag` | interior hit layer, `cursor: move` (`grabbing` while held), `touch-action:none` | n/a |
| `.shape-pad-grab` (+ `--h`, `--v`) | 36x14 / 14x36 pill, `background: var(--text-dim)`, inner 12x2 `var(--border)` bar; `[data-active]`: `var(--signal-acid-fill)` bg, `var(--bg)` bar, `scale(1.1)`; `touch-action:none; cursor:grab` | `--text-dim`, `--border`, `--signal-acid-fill`, `--bg` |
| `.shape-pad-knob` (edit) | drop `pointer-events:none`, add `cursor:grab; touch-action:none`; `[data-active]`: `box-shadow: 0 0 0 3px var(--bg), 0 0 0 7px color-mix(in srgb, var(--signal-acid-fill) 18%, transparent)`; keep the 3px `--bg` ring FIRST | existing ring, `--signal-acid-fill` |
| `.shape-pad-status` | caps helper, `font-size: var(--type-micro-size, .5625rem); letter-spacing: var(--track-caps)`; color `--text-dim`, `[data-active]` `--text` | `.geom-num` pattern (shell.css:887) |
| `.shape-readout > div[data-live] > span:last-child` | `color: var(--signal-acid)` while driven; sub-line `<small>` in `--text-dim`, `--type-micro-size` | `--signal-acid` thin-use ink |
| `.shape-readout > div[data-frozen]` | `opacity:.5` | n/a |
| `.shape-pad[data-dimmed]` | `opacity:.4; pointer-events:none` | n/a |
| `.shape-pad-col[data-out]` | `opacity:.35` (outside the clamp) | n/a |
| `.subset-*` | rows reuse `.rail-toggle`; section subheads reuse `.rail-help`/caps; select reuses the existing rail select style (find the class used by the Type Matrix/VMetrics select; not found in a quick grep, check `VMetricsPanel` in Shell.tsx) | `--border-subtle`, `--surface` |

Keep the `.shape-pad [data-zone]` active-column rule (shell.css:882-885) as is: `dynamic-range-limit: no-limit` on `.shape-pad-col.on` (l.881) is the HDR swatch and must not be dropped or moved onto the dim washes (a wash over an HDR pill would clip it). Layer order inside the pad: bands, dots, dim washes (below `cols` so the active pill stays lit), cols, y labels, marquee, box-drag, grabbers, knob.

Do NOT copy from the prototype:
- Tailwind classes and the CDN script (proto:4-9); all utility classes become the rules above.
- Hard-coded hex: `#EAFF00` (live acid is `--signal-acid` / `--signal-acid-fill`, different in light mode and P3), `#1c1c1c`/`#151515` (`--bg`), `#2a2a2a`, `#666`, `#888`, `#8a8a8a`, zone colors in `ZONES` (proto:57-62, use `LANDING_ZONES` + `chipColor`).
- 16% zone wash (proto:186): live is 7% via `zoneBandBackground` (geomAxis.ts:42-43). The bands are already drawn by `ShapePad`; do not add a second set.
- Static "Cal" in `<motion.span>` columns (proto:192-195): live `ZoneCols` sets "Cal" at each zone's `sampleGeom` with `fontVariationSettings` (ShapePad.tsx:169); keep it.
- `nearestZone` by Euclid on `mid` (proto:63) duplicates live `nearestZone` (ShapePad.tsx:28, exported).
- The proto's fixed 300px/88px pad heights, 84px right gutter, 22px y labels, 28px readout numerals, dark-only theme (`color-scheme: dark`, proto:18) and `overflow: visible` on non-live pads. Live pads are 198 / 150px, inset 9px, light/dark/auto via tokens.
- The proto lattice (17x4 colored by zone, proto:199-203): live is the single-color SVG lattice (ShapePad.tsx:112-116, `fill: var(--border)`).
- The 1D pad's `h-[88px]` card look: the Optical size row uses the track variant's own bar (section 5).
- The proto's `Check` component and sr-only checkbox with custom box (proto:292-304); use the house `.rail-toggle`.

## 5. The 1D collapse onto AxisSlider

Facts (shared/src/AxisSlider.tsx, AxisSlider.css): the track variant is a native `<input type=range>` stretched over the bar at `opacity:0` (CSS l.552-563); the visible bar is `.slider-label` with `.slider-fill` (width `var(--pct)`, CSS l.817-822) and the grip as `::after` positioned from `--pct` (CSS l.778-783); `data-empty` hides the fill (l.833). Value state flows only through `value` / `onChange` (single number).

Recommendation: a thin wrapper, NOT a new mode inside AxisSlider. New `ClampSlider` in ReCal (`src/instrument/ClampSlider.tsx`), rendering an `AxisSlider variant="track"` for the default (so the grip, number field, steppers, keyboard, compact and coarse logic stay the primitive's) and overlaying two absolutely positioned end grabbers plus a `lo..hi` range fill, driven by CSS custom properties `--lo` and `--hi` set on the wrapper.

Why a wrapper:
- AxisSlider's native-range-under-opacity-0 trick owns the whole bar's pointer events; grabbers on top need their own capture, and merging that into the primitive would add two-handle semantics to a package used by font-proofer and every other app (the submodule's contract is "font-agnostic", AxisSlider.tsx:13).
- The range fill can be a sibling pseudo-layer: `.clamp-slider::before { left: var(--lo); width: calc(var(--hi) - var(--lo)); background: color-mix(in srgb, var(--signal-acid-fill) 18%, transparent); }`, placed `z-index:-1` UNDER the primitive's `.slider-fill` (which already uses `z-index:-2` inside `.slider-label`). Check stacking in the browser pane before settling.
- Pointer events: the grabbers must sit above the opacity-0 input (z-index above the input) and stop propagation so a grabber press does not jump the value.
- The default's native range must not be able to leave `[lo,hi]`: pass `min`/`max` as the CLAMP, not the axis range, and map `--lo`/`--hi` against the AXIS range separately. Then keyboard, drag and number-field clamping come free, and the `--pct` the primitive paints is relative to the clamp, so the primitive's grip would be mispositioned against the axis. That is the one real cost of this approach: **either** pass full `min`/`max` and clamp in `onChange` (grip and fill correct, typed values clamp in the wrapper; recommended), **or** accept the mismatch. Take the first.
- If the grabbers later need to exist in more than one app, promote the wrapper to `shared/src/` as a separate `RangeSlider` export, not by editing AxisSlider.
- AxisSlider already has `lockedAbove` (a locked region painted at `--locked-pct`, CSS l.574-575). It paints only one side and in `--border`; it can dim the region above `hi` but not below `lo`. Not enough alone; do not stretch it.

## 6. Framer Motion

`package.json` lists `motion` ^12 but nothing in `src/` imports it, and there is no framer-motion. Add nothing and import nothing. The prototype loads it from unpkg (proto:32) and uses it for exactly these:

| Prototype use | What it does | Plain CSS equivalent |
|---|---|---|
| Grabber `animate` with `spring {stiffness 520, damping 32, mass .6}` (proto:150-161) | bg grey to acid and scale 1.1 on hold | `.shape-pad-grab { transition: background-color var(--dur-fast,.12s) var(--ease,ease), transform var(--dur-fast,.12s) var(--ease,ease) }` + `[data-active]` rule. Overshoot is slight; not needed |
| Knob `animate` scale 1.15 + 6px halo (proto:236) | hold feedback | `transition: box-shadow, transform var(--dur-fast)` on `.shape-pad-knob[data-active]` |
| Marquee `animate opacity 0/1`, 0.12s (proto:218-220) | solid frame fades in while anything is held | `.shape-pad-box[data-active]` with `opacity` transition 0.12s |
| Zone label `animate color/backgroundColor/opacity`, 0.15s (proto:192-195) | active pill and outside-clamp dimming | live `.shape-pad-col` has no transition today; add `transition: opacity var(--dur-fast)`; keep the pill as is |
| `AnimatePresence mode="wait"` on helper text, `y 3 -> 0 -> -3`, 0.1s (proto:259-265) | text swap cross-fade | keyed `<span key={status}>` with a CSS `@keyframes status-in` (opacity 0->1, `translateY(3px)->0`, 0.1s). No exit animation; the instant replacement reads fine at this speed |
| `Tile` value color tween 0.12s (proto:286) | acid while driven | `transition: color var(--dur-fast)` on `.shape-readout span:last-child` |
| `Check` box `animate` bg/border (proto:296-298) | checkbox fill | `.rail-toggle` already native; skip |
| `motion.div style x:'-50%' y:'-50%'` | centering transform | `transform: translate(-50%,-50%)` (the knob already does this, shell.css:891) |

Use the existing motion tokens (`--dur-fast`, `--ease`; defined in `shared/src/motion.css`, referenced in tokens.css:113). Honor `:root[data-scrubbing]` (AxisSlider.css:823-826): set no transitions on anything that moves with the pointer (grabber position, box edges, knob position). Only color, opacity, scale and shadow transition. Add `@media (prefers-reduced-motion: reduce)` zeroing as AxisSlider.css does (l.640 area).

## 7. Order of work

1. **Store plus math, no UI** (store.ts, new `clampMath.ts`, new `clampMath.test.ts` if a test runner exists; none checked, confirm in package.json scripts). Add `limits`, `frozenAxes`, subset fields, `normalizeAxis`, `effectiveLimits`, actions, `cloneDefaults`/`defaultsDirty`/`stockSection` updates. Done: unit tests cover the four invariants incl. push-on-edge, slide keeps span, frozen collapse and restore on unfreeze; `setDefaultAxis` clamps; nothing visible changes.
2. **Wire urlState** (urlState.ts, the boot path that should call `decodeDefaults`; locate it, nothing imports urlState today, check boot.ts/InstrumentProvider.tsx). Add `l*`, `fz`, `sx`, `sk`, `sc`; keep `f` decoding. Done: round-trip test, hostile-link test (default outside clamp is repaired), an untouched instrument still serialises to the empty string.
3. **2D clamp on the Shape pad** (ShapePad.tsx, shell.css). Marquee, 4 grabbers, dim washes, knob drag, box slide, status text, `ZoneCols` `data-out`, readout sub-line. Done: matches the prototype's four helper states in the browser pane; GEOM drag still drives `geomDragging` flashes (check the swap flash holds on knob drag); undo is one step per drag; keyboard still nudges; 375px width works; light and dark look right; no hex in the diff.
4. **Ascender and Sharpness pad** (ShapePad.tsx `AscenderPad`). Same `Pad`; `yAuto` hides y grabbers. Done: auto ascender locks YTAS clamp UI; clamp survives toggling auto.
5. **Optical size clamp band** (new ClampSlider.tsx, Shell.tsx `OpticalSize`, shell.css). Wrapper per section 5. Done: end grabbers move lo/hi, grip stays inside, number field clamps, `rail-seg` Frozen still works, Optical scale stepper unchanged, coarse pointer targets reach 44px.
6. **Subset row** (new Subset.tsx, Shell.tsx rows/summaries/bodies, store.ts `Section`). Axis checkboxes drive `frozenAxes`; absorb `freezeOpsz`/`frozenOpszValue`; data options. Done: unchecking an axis collapses its pad's clamp and hides grabbers, re-checking restores the prior clamp; opsz and auto-ascender exclusion preserved with the existing note; row reset restores stock; summary reads sensibly; Freezer untouched.
7. **Bake hand-off** (useFontEngine.ts `ExportConfig`, Shell.tsx:996-999 export call, worker). Pass `limits`, `frozenAxes`, subset options to the worker (fontTools instancer with `limits`); until then the UI is a no-op for the export and the PR must say so. Done: an exported font's fvar ranges match the clamps; a frozen axis is absent from fvar; strip-inaccessible reduces gvar/avar data; Freezer features still bake. Not covered by this spec.
8. **Quartile view** (new overlay on the pads, scope to be designed with Mark). Draw the clamp as interpolation steps: the instances at the clamp's quartiles (lo, 25%, 50%, 75%, hi) overlaid in one glyph, outlines nested, stems stepped, with the stem positions joined so the progression reads as a fan. Done: a toggle on the Shape pad shows the five-step overlay for the current clamp, updates on drag, and the steps are the clamp's quartiles, not the axis's.
9. **Docs and polish** (README or CHANGELOG if the repo keeps one, the sandbox of `docs/`). Done: the helper copy in American English; keyboard map documented.

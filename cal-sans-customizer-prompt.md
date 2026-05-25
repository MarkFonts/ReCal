# Claude Code Prompt: Cal Sans Customizer Web Tool

Build a single-page web app that lets users customize Cal Sans (a variable font) entirely client-side and download the result. No server-side font processing — all manipulation runs in the browser via Pyodide + fontTools.

## Core operations the user can perform

1. **Shift axis defaults** — for each axis (opsz, wght, GEOM, YTAS, SHRP), let the user pick a new default position within the axis's existing min/max range. Implementation: `fontTools.varLib.instancer.instantiateVariableFont(font, {axisTag: (min, new_default, max)})`. This shifts the origin without losing axis range — same operation we've been discussing.

2. **Shuffle activation spots** — the font uses GSUB `FeatureVariations` (rvrn) to swap glyph variants at specific GEOM thresholds (e.g. "UI band: GEOM < 41"). Let the user adjust where these bands fire. Read existing FeatureVariations from the font, surface them as editable threshold ranges in the UI, write modified ranges back. This needs careful normalized-space math: user-facing values must be converted to internal normalized [-1, 0, +1] space relative to the (possibly shifted) default before writing back into the condition tables.

3. **Freeze stylistic sets** — for each GSUB feature tag that's a stylistic set (`ss01`, `ss02`, etc.), give the user a toggle. If frozen ON, apply the feature's substitutions to the default glyph set (so the swapped glyphs become the new defaults) and remove the feature. If frozen OFF, leave as-is. Use `fontTools.subset` or direct GSUB manipulation.

4. **Rename family** — must follow the pattern "Cal Sans [user-supplied suffix]" — the "Cal Sans" prefix is non-editable, user only chooses what comes after. Update all relevant name table records (family name, full name, PostScript name, typographic family name) consistently.

5. **Download** as both `.ttf` and `.woff2`. Use fontTools' built-in woff2 compression.

## Live preview

Render a preview of the modified font in the browser, with a GEOM slider so the user can see what the font looks like at any GEOM position. The preview should reflect:

- The current axis default (what shows when GEOM isn't explicitly set)
- Any modified activation thresholds (so dragging the GEOM slider shows the UI/Geo swaps firing at the user's new thresholds)
- Any frozen stylistic sets

Use `@font-face` with the modified font bytes loaded via `URL.createObjectURL(new Blob([...]))` for the preview. Re-generate the font on every meaningful change (debounced — maybe 150ms after the last slider movement).

Show preview text in a few sizes and styles. Include a string the user can edit. Show a small visualization (could be the SVG-style band diagram we discussed) of where the activation thresholds currently sit along the GEOM axis.

## Shareable URL configurations

All user choices encoded into the URL hash, so a URL captures the full state and can be shared. Pattern: `https://[host]/#config=<base64-encoded-json>` where the JSON is something like:

```json
{
  "axisDefaults": {"opsz": 14, "wght": 400, "GEOM": 20, "YTAS": 720, "SHRP": 0},
  "activationThresholds": {"UI": [0, 25], "Geo": [60, 100]},
  "frozenFeatures": ["ss01"],
  "nameSuffix": "Display"
}
```

On page load, parse the hash and apply. On any change, debounce-update the URL via `history.replaceState`. Include a "copy share link" button.

## Architecture

- **Pyodide** loads in a Web Worker (not the main thread) — keeps the UI responsive during font manipulation, which can take 100ms–1s depending on operation.
- Pyodide imports fontTools. Pre-bundle a slim Pyodide build if feasible to minimize initial download.
- Main thread handles UI (React or just vanilla + a small reactive library — pick whatever's lightest).
- Worker exposes a small RPC interface: `loadFont(bytes)`, `applyConfig(config)` returns modified `{ttf: bytes, woff2: bytes}`, `getAxisInfo()`, `getFeatureVariations()`, etc.
- Cal Sans VF lives as a static asset, fetched once on load.

## Build it in phases

**Phase 1 — Foundation:**

- Set up the project (Vite + vanilla TS is fine, or React if you prefer)
- Get Pyodide loading in a Web Worker with fontTools available
- Fetch Cal Sans VF, pass bytes to the worker, confirm round-trip (load → save → return identical bytes)
- Basic UI shell with a "download" button that returns the unmodified font

**Phase 2 — Axis defaults:**

- Read fvar, surface each axis as a slider in the UI (min/max from fvar, current value = current default)
- On change, call worker with `{axisDefaults: {...}}`, get modified font back
- Wire up download for `.ttf` and `.woff2`
- Add live preview area with `@font-face` reload on each new font generation

**Phase 3 — Activation thresholds:**

- Read GSUB FeatureVariations, group records by feature tag, surface each band as an editable range
- Carefully handle normalized-space conversion — when the user moves a threshold in user-space (e.g. "UI band now fires at GEOM<30 instead of <41"), convert that to the normalized representation that gets written back into the condition table, accounting for the current axis default position
- Add the band visualization (small SVG showing where each band sits along the GEOM axis)
- GEOM slider in the preview that shows substitutions firing at the new thresholds

**Phase 4 — Freeze stylistic sets:**

- Detect ss## features in GSUB
- Toggle UI for each
- When frozen, apply substitutions to default glyphs and strip the feature
- Verify the preview reflects the change

**Phase 5 — Renaming:**

- Text input for the suffix (with "Cal Sans" prefix locked)
- Update all relevant name records via fontTools' name table API
- Show the new full name in the preview

**Phase 6 — Share URLs:**

- Encode/decode config to/from URL hash
- Debounced URL updates
- Copy-link button
- Handle malformed config gracefully (fall back to defaults, don't crash)

**Phase 7 — Polish:**

- Loading states for Pyodide initialization (it's slow on first load)
- Error states (font load failures, invalid configs, etc.)
- Mobile layout
- A "reset to original" button

## Constraints and notes

- The "Cal Sans" prefix in the rename is a project requirement, not technical — keep it enforced in the UI.
- Output font should remain a valid variable font with the full original axis range — we are *not* generating static instances at any point. The original tone of the conversation that led here was specifically about preserving variable behavior while shifting defaults.
- The GEOM axis uses both `gvar` deltas (on a few glyphs with brace layers in the source) and GSUB `FeatureVariations` (for most glyphs). `instancer` handles both correctly when shifting defaults — confirmed in testing.
- Internal normalized axis representation is always [-1, 0, +1] where 0 = current default. When the user shifts a default, normalized space recenters. This is invisible to end users but matters for activation-threshold UI math.
- Don't over-engineer Phase 1. Get a round-trip working first; everything else builds on that working baseline.

## Tech preferences

- Modern browsers only (Chrome/Firefox/Safari current)
- TypeScript
- Vite for the dev/build setup
- Web Worker for Pyodide
- No backend at all — pure static deploy (Cloudflare Pages, Vercel static, GitHub Pages, whatever)

Start with Phase 1. Confirm the architecture works end-to-end before adding features.

---

## Things to flag to Claude Code before running

- **Pyodide initial load is slow** (~5–10s on a decent connection, sometimes more on first visit). The Phase 7 loading-state work matters more than it sounds — users will think the page is broken otherwise. A "loading the font engine..." splash with a progress bar goes a long way.
- **The activation-thresholds normalized-space math is the trickiest part of the whole thing.** When the user moves the default *and* moves the activation thresholds in the same session, you have to keep careful track of what "GEOM=30" means in normalized space relative to the *current* default. Worth pulling Claude Code's attention to it explicitly in Phase 3 if it gets confused.
- **Worth testing woff2 output early** — fontTools' woff2 support requires the `brotli` package, which works in Pyodide but isn't bundled by default. May need to be explicitly installed in the Pyodide environment.

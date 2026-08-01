# Claude Code task — SEO-wire the ReCal Sans presets

## Goal
Turn each ReCal Sans preset (`Futura`, `Gotham`, `Wayfinding`, `Mobile UI`, `A11y`, etc.)
into its own crawlable, statically-rendered landing page that ranks for the query
behind it and deep-links back into the live customizer pre-loaded to that preset.

We are building the **honest** version of a "font alternatives" page: real referent,
single clean intent, genuine expert copy, no bait-and-switch. Read the guardrails
section before writing any marketing copy — the reputational bar matters more than
the rankings.

---

## Context you need to load first (Phase 0 — investigate, don't code yet)

ReCal Sans is a browser-based Cal Sans customizer: **React + Vite + Pyodide + fontTools**.
Presets reconfigure the variable font's axes (`opsz`, `wght`, `GEOM`, `YTAS`, `SHRP`, `ital`).
The `A11y / UI / Base / Geo` "variation zones" are bands on the `GEOM` axis.

Before proposing anything, inspect the repo and report back:

1. **Routing** — is there a router already (react-router?), or is everything one page?
2. **Preset definitions** — where do presets live today? What shape is the data
   (axis coords, labels)? Are they client state (`useState`/context) only?
3. **Pyodide boot** — where/when does Pyodide initialize? Is it on mount (bad) or
   deferred? What does it actually get used for — export/instancing only, or preview too?
4. **Font loading** — is the Cal Sans **variable** font already loaded via `@font-face`?
   What's the file path / CDN (jsDelivr)?
5. **Vite version** and whether any SSG/prerender is configured.

Output a short findings summary + the plan below adapted to what you found, and
**stop for my review before implementing.**

---

## Non-negotiable constraints

- **Do not regress the tool.** The interactive customizer must keep working exactly
  as-is. This is additive.
- **Pyodide must never block first paint and must never run at build time.** It loads
  lazily, only when the user actually customizes/exports. The landing pages must render
  fully without it.
- **The specimen on each landing page must be real rendered type, present in the static
  HTML** — not a screenshot, not a client-only render that needs JS to appear.
- Keep it a single finite, build-time-known set of presets. No programmatic explosion
  into thousands of pages. Quality per page is the whole point.

---

## Key architectural insight (use this)

Previewing a variable font at fixed axis coordinates needs **only CSS** —
`@font-face` on the variable file + `font-variation-settings`. It does **not** need
Pyodide or fontTools. Pyodide is only required to *instance/export* a custom static.

So split the layers cleanly:

- **Landing pages**: static HTML + variable font via `@font-face` + per-preset
  `font-variation-settings` inline → fully rendered, crawlable specimen, zero Pyodide.
- **Customizer**: hydrates on interaction; Pyodide lazy-loads only on
  "Customize" / "Download".

---

## Phase 1 — Routing + preset data model

Give every preset a real URL. Preset selection becomes route state, not just `useState`.

- Use-case presets:    `/for/wayfinding`, `/for/ui`, `/for/display`, `/for/mobile-ui`,
  `/for/accessible` (the A11y band)
- Comparison presets:  `/alternative/futura`, `/alternative/gotham`, `/alternative/inter`,
  `/alternative/circular`, `/alternative/poppins`, `/alternative/geist`,
  `/alternative/gt-america`, `/alternative/neutra`
  (adapt slugs to the real preset list)

Lift presets into a single typed source of truth. Target shape:

```ts
type PresetKind = "use-case" | "comparison";

interface Preset {
  slug: string;
  kind: PresetKind;
  displayName: string;              // "Futura", "Wayfinding"
  referent?: string;                // comparison only: the named typeface
  axes: Partial<Record<
    "opsz" | "wght" | "GEOM" | "YTAS" | "SHRP" | "ital", number>>;
  specimenText: string;             // what renders large on the page
  seo: {
    title: string;                  // unique per page
    description: string;            // unique per page, ~150 chars
    h1: string;
  };
  body: string;                     // the real editorial copy (see guardrails)
  queryHooks: string[];             // "free", "variable", "web", "google fonts", "OFL"
}
```

The customizer reads the same `axes` object when a user lands on `/alternative/futura`
so the tool opens pre-set to that state. One source, both surfaces.

---

## Phase 2 — Static prerender (SSG)

The preset set is finite and known at build, so prerender each route to real HTML.

Evaluate the lightest option compatible with the **current Vite version** in the repo
(check it — don't assume): `vite-react-ssg`, a Vite prerender plugin, or lifting just the
landing layer to a static export. Pick one, justify it in the plan, keep the interactive
app hydrating client-side on top of the prerendered shell.

Each prerendered page must contain, in the served HTML **before any JS runs**:
`<title>`, meta description, canonical, OG/Twitter tags, `<h1>`, the editorial body copy,
and the rendered specimen.

---

## Phase 3 — Crawlable specimen without Pyodide

- `@font-face` the Cal Sans **variable** file (jsDelivr path).
- Render the specimen with inline `style="font-variation-settings: ..."` from the preset's
  `axes`. This is in the static HTML → crawlers and no-JS users see real type.
- `font-display: swap`, preload the variable font on these routes.
- Pyodide import stays dynamic (`import()`), triggered only by the customize/export action.
  Verify via network panel that landing a page cold does **not** fetch the Pyodide runtime.

---

## Phase 4 — Per-page SEO metadata

Per route, all unique (no shared boilerplate):

- `<title>` and meta description from `preset.seo`.
- Canonical URL per page.
- `robots` indexable; ensure these routes are reachable (not trapped behind JS-only nav).
- Optional but recommended: `SoftwareApplication` or `WebApplication` JSON-LD for the
  tool, and per-page structured data if it fits honestly.
- Semantic heading order; the `queryHooks` woven into real sentences, never stuffed.

---

## Phase 5 — Sitemap, internal linking, OG images

- Generate `sitemap.xml` covering every preset route at build; reference it in `robots.txt`.
- Light internal linking: each landing page links to 2–3 sibling presets ("also compared
  with…", "see the wayfinding tuning") and to the main tool.
- **Rendered-specimen OG image per page** (big win for shares). Generate at build — e.g.
  Satori/`@vercel/og`-style SVG→PNG, or a small Puppeteer/Playwright pass over the
  prerendered specimen. Must reflect that preset's actual axis settings.

---

## Content & ethics guardrails (read before writing copy)

This is the line between us and the content farms. Stay on the right side of it.

- **Nominative use only.** "A Futura-style tuning of Cal Sans" is fine. Do **not** use
  competitors' logos, wordmarks, or brand assets. Do **not** imply endorsement or claim
  Cal Sans *is* Futura/Gotham/etc.
- **Write real type criticism.** Each comparison page must say, specifically, where the
  tuned Cal Sans lands relative to the referent (proportions, single/double-story a,
  aperture, the `GEOM` character) **and where it honestly differs or falls short.** A farm
  cannot write this; it's the whole moat. No generic "similar characteristics" filler.
- **Lead with the honest, untrademarked surface.** Use-case pages (`wayfinding`, `ui`,
  `accessible`, `display`) are higher-intent and carry zero brand-name risk — treat them
  as the primary SEO surface. Comparison pages are secondary and get the careful treatment.
- **The OFL / free / variable angle is a genuine selling point, not spin** — state it plainly
  (open-source vs a paid license) without trashing anyone.
- Credit the original designers/foundries where relevant. Aim for the tone of Typewolf's
  "closest free alternative," not a spun doorway page.

---

## Acceptance criteria

- [ ] Every preset resolves at its own URL and deep-links the tool to that axis state.
- [ ] `curl` / view-source on each landing route returns real HTML with unique title,
      description, canonical, h1, body copy, and an inline-styled variable-font specimen.
- [ ] Cold-loading a landing page fetches **no** Pyodide runtime (verify in network panel);
      Pyodide loads only after a customize/export interaction.
- [ ] The interactive customizer is unchanged in behavior.
- [ ] `sitemap.xml` lists all preset routes and is referenced from `robots.txt`.
- [ ] Each page has a rendered-specimen OG image reflecting its real axis settings.
- [ ] Comparison pages contain specific, honest type-comparison copy — no boilerplate,
      no competitor logos, no endorsement claims.
- [ ] Lighthouse SEO pass on a representative landing page.

## Out of scope (do not do)
- Any programmatic multiplication of pages beyond the curated preset list.
- Scraping keyword lists or auto-generating pages for arbitrary typeface names.
- Touching the Framer marketing site — this task is the ReCal tool repo only.

---

_When Phase 0 findings are in, post the adapted plan and wait for review before coding._

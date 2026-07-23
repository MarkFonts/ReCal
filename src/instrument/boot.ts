// Boot config for deep links and the SEO landing pages (Appendix A).
// A fused landing page at /recalsans/<slug>/ injects window.__RECAL_BOOT before the
// app bundle so the instrument boots frozen into that preset — initial state only,
// fully editable. URL params (?preset=&scene=) cover hand-written deep links and
// take precedence over the injected object.
// A referent webfont available on a fused compare page: the specimen text can swap
// to it, with the play-dock axes mapped to what that font actually supports.
export type CompareSpec = {
  label: string                    // 'Poppins'
  family: string                   // CSS font-family stack (the page loads the font)
  wghtRange?: [number, number]     // usable font-weight span (static families snap)
  opszRange?: [number, number]     // real opsz axis (e.g. Inter 14–32); absent = none
  italic: boolean                  // real italic styles exist
  css?: string                     // referent-font stylesheet URL, injected lazily on
                                   // first compare-on (Google Fonts / Adobe kit) so
                                   // pure-preview visitors never download it
  svg?: string                     // for referents we can't webfont-embed: a static
                                   // pre-rendered specimen SVG (real outlines) fetched
                                   // and inlined on compare-on instead of a live font
  heavy?: { from: number; family: string; weight: number }
  // ^ some Adobe kits split the blackest cut into its own family (Futura PT Bold =
  //   'futura-pt-bold' @ 700): weights ≥ from switch family and pin that weight.
  headingWght?: number             // override heading weight in compare mode (e.g.
                                   // Futura headers read better at Demi 600 than the
                                   // 700 Bold cut); body/inline bold are unaffected
}

export type BootConfig = {
  preset?: string
  scene?: string
  pitch?: { title: string; paragraphs: string[] }
  compare?: CompareSpec
  axes?: Record<string, number>    // raw axis defaults for a page whose referent is
                                   // NOT an app preset (e.g. Gotham): resemble it
                                   // without shipping a named preset
  freezeOpsz?: number              // pin opsz to this value alongside BOOT.axes
}

const injected: BootConfig = (window as any).__RECAL_BOOT ?? {}
const params = new URLSearchParams(window.location.search)

export const BOOT: BootConfig = {
  preset: params.get('preset') ?? injected.preset,
  scene: params.get('scene') ?? injected.scene,
  pitch: injected.pitch,
  compare: injected.compare,
  axes: injected.axes,
  freezeOpsz: injected.freezeOpsz,
}

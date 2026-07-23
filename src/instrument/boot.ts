// Boot config for deep links and the SEO landing pages (Appendix A).
// A fused landing page at /recalsans/<slug>/ injects window.__RECAL_BOOT before the
// app bundle so the instrument boots frozen into that preset — initial state only,
// fully editable. URL params (?preset=&scene=) cover hand-written deep links and
// take precedence over the injected object.
export type BootConfig = {
  preset?: string
  scene?: string
  pitch?: { title: string; paragraphs: string[] }
}

const injected: BootConfig = (window as any).__RECAL_BOOT ?? {}
const params = new URLSearchParams(window.location.search)

export const BOOT: BootConfig = {
  preset: params.get('preset') ?? injected.preset,
  scene: params.get('scene') ?? injected.scene,
  pitch: injected.pitch,
}

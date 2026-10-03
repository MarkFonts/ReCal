/* The house grid's snapper (wm-primitives gridSnap.js) measures text after layout, and it
   cannot know when React has changed a layout: it reruns on load, on fonts.ready and when
   #root resizes, and #root is the viewport, so a mode switch, a rail panel or a face that
   arrives after fonts.ready (CalSansVF is injected by main.tsx, the preview face later)
   leaves it holding the old positions. So the app tells it: on mount, after the state
   changes that re-lay-out the chrome, and whenever a font finishes loading. Twice: now,
   and once more after the --dur (240ms) transitions have settled. */
import gridSnapSrc from '../../shared/src/gridSnap.js?raw'

/* gridSnap.js is a PLAIN SCRIPT (GRID.md: <script src defer>), and it has to be loaded as one.
   `import '.../gridSnap.js'` builds and then ships nothing: wm-primitives' package.json says
   "sideEffects": ["*.css"], so Rollup drops a side-effect-only import of a .js file and
   window.wmGridSnap never exists. ?raw inlines its source and a script element runs it,
   synchronously, before React renders. */
export function loadGridSnap() {
  if (document.querySelector('script[data-wm-gridsnap]')) return
  const s = document.createElement('script')
  s.textContent = gridSnapSrc
  s.dataset.wmGridsnap = ''
  document.head.appendChild(s)
  snapGrid()
}

const run = () => (window as unknown as { wmGridSnap?: () => void }).wmGridSnap?.()
export function snapGrid() {
  run()
  setTimeout(run, 400)
}
/* WORDS IN A FLEX BOX GO IN A SPAN. gridSnap.js finds a block's first baseline with a
   zero-size inline-block probe put before its first text node. Inside a flex (or grid)
   container that probe is not inline: it is blockified into a flex item of its own and
   reports the top of the box, not the baseline -- so a tab button was snapped by the wrong
   number and its words sat 2px off the rail's title, with every grid check green. Wrapped,
   the words are a block of their own with an inline probe inside. Hence the bare <span>s
   in the tabs, the mode label, the toggles and the chips. */
document.fonts?.addEventListener?.('loadingdone', () => snapGrid())

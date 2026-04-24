// ESM wrapper for the vendored cubejs modules. The original index.js uses CommonJS
// `require()` calls which Vite's dev server does not transform on source files. The two
// sub-files are side-effect modules: cube.js installs the `Cube` constructor on globalThis,
// and solve.js reads it off globalThis and extends it. Load order matters — cube.js first.
import './lib/cube.js'
import './lib/solve.js'
const Cube = /** @type {any} */ (globalThis).Cube
if (!Cube) throw new Error('cubejs: Cube constructor missing from globalThis after load')
export default Cube

# Vendored third-party code

## `cstimer_module.js`

- **Source:** https://www.npmjs.com/package/cstimer_module (published by cs0x7f)
- **Upstream:** https://github.com/cs0x7f/cstimer
- **License:** GPL-3.0-or-later
- **Version:** 0.1.5

This file is a verbatim copy of `cstimer_module@0.1.5`'s `cstimer_module.js` with a
**one-line patch** applied.

### Why vendored

The upstream module bundles Chen Shuang's 4×4 reduction solver, but its public API
(`getScramble`, `getScrambleTypes`, `setSeed`, `setGlobal`, `getImage`) does not expose a way
to solve an arbitrary state. The solver function is defined inside an IIFE as `Ya` and is
used only internally to generate scrambles.

### The patch

Inside the 4×4 IIFE, immediately before its `return` statement, we inject:

```js
globalThis.__csTimerSolve444 = Ya;
```

After importing the vendored file for its side effects (`import '../vendor/cstimer_module.js'`),
`globalThis.__csTimerSolve444(facelets: string)` returns a **scramble string** — i.e., a
sequence of moves that, applied to the solved state, produces the given state. The adapter
in `src/cube/cstimer444.ts` inverts this to turn it into a solve (state → solved) and composes
start-scramble and target-scramble for the start→target case.

### Regenerating the patched file

```bash
npm install cstimer_module
cp node_modules/cstimer_module/cstimer_module.js src/vendor/cstimer_module.js
# Then apply the one-line patch, replacing
#   return{getRandomScramble:$a,getPartialScramble:Wa,testbench:
# with
#   globalThis.__csTimerSolve444=Ya;return{getRandomScramble:$a,getPartialScramble:Wa,testbench:
npm uninstall cstimer_module
```

### License obligations

Shipping the vendored file places this project's distributions under GPL-3.0-or-later
for the combined work. Source is available in this repository. Upstream license text
is in the header of `cstimer_module.js` and at https://www.gnu.org/licenses/gpl-3.0.html.

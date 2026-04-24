// `src/vendor/cstimer_module.js` is the cstimer_module package source with a one-line patch
// that exposes its internal 4x4 solver on globalThis. We import it for side-effects only.
declare module '*vendor/cstimer_module.js'

declare global {
  // eslint-disable-next-line no-var
  var __csTimerSolve444: ((facelets: string) => string) | undefined
}
export {}

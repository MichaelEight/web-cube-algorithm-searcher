/// <reference lib="webworker" />
// 4x4 reduction solver (Chen Shuang) vendored from cstimer_module. The vendored copy has a
// one-line patch (`globalThis.__csTimerSolve444 = Ya`) that exposes cstimer's internal
// solve-from-facelet function, which its public API does not export. Lookup tables are
// built lazily on the first solve, so that first call takes several seconds.
import '../vendor/cstimer_module.js'

export interface Cstimer444Job {
  type: 'solve'
  jobId: number
  facelets: string
}

export type Cstimer444In = Cstimer444Job

export interface Cstimer444Init {
  type: 'init'
  jobId: number
}

export interface Cstimer444Done {
  type: 'done'
  jobId: number
  moves: string[]
  heapUsed?: number
}

export interface Cstimer444Error {
  type: 'error'
  jobId: number
  message: string
}

export type Cstimer444Out = Cstimer444Init | Cstimer444Done | Cstimer444Error

function sampleHeap(): number | undefined {
  const perf = (self as unknown as { performance?: { memory?: { usedJSHeapSize?: number } } }).performance
  return perf?.memory?.usedJSHeapSize
}

let firstSolve = true

self.addEventListener('message', (ev: MessageEvent<Cstimer444In>) => {
  const msg = ev.data
  if (msg.type !== 'solve') return
  const post = (m: Cstimer444Out) => (self as unknown as Worker).postMessage(m)
  const solve = globalThis.__csTimerSolve444
  if (!solve) {
    post({ type: 'error', jobId: msg.jobId, message: 'cstimer 4x4 solver not exposed; Vite patch missing?' })
    return
  }
  try {
    if (firstSolve) {
      post({ type: 'init', jobId: msg.jobId })
      firstSolve = false
    }
    const solution = solve(msg.facelets)
    const moves = solution.trim().split(/\s+/).filter((t) => t.length > 0)
    post({ type: 'done', jobId: msg.jobId, moves, heapUsed: sampleHeap() })
  } catch (e) {
    post({ type: 'error', jobId: msg.jobId, message: e instanceof Error ? e.message : String(e) })
  }
})

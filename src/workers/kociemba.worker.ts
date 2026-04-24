/// <reference lib="webworker" />
// Kociemba two-phase solver (3x3 only) running in a worker so the ~4-5s initSolver table build
// does not block the UI. The worker lazy-inits on its first solve request.
import Cube from 'cubejs'

export interface KociembaJob {
  type: 'solve'
  jobId: number
  facelets: string
  maxDepth?: number
}

export type KociembaIn = KociembaJob

export interface KociembaInit {
  type: 'init'
  jobId: number
}

export interface KociembaDone {
  type: 'done'
  jobId: number
  moves: string[]
  heapUsed?: number
}

export interface KociembaError {
  type: 'error'
  jobId: number
  message: string
}

export type KociembaOut = KociembaInit | KociembaDone | KociembaError

let solverReady = false

function sampleHeap(): number | undefined {
  const perf = (self as unknown as { performance?: { memory?: { usedJSHeapSize?: number } } }).performance
  return perf?.memory?.usedJSHeapSize
}

self.addEventListener('message', (ev: MessageEvent<KociembaIn>) => {
  const msg = ev.data
  if (msg.type !== 'solve') return
  const post = (m: KociembaOut) => (self as unknown as Worker).postMessage(m)
  try {
    if (!solverReady) {
      post({ type: 'init', jobId: msg.jobId })
      Cube.initSolver()
      solverReady = true
    }
    const cube = Cube.fromString(msg.facelets)
    const alg = cube.solve(msg.maxDepth ?? 22)
    const moves = alg.trim().split(/\s+/).filter((t) => t.length > 0)
    post({ type: 'done', jobId: msg.jobId, moves, heapUsed: sampleHeap() })
  } catch (e) {
    post({ type: 'error', jobId: msg.jobId, message: e instanceof Error ? e.message : String(e) })
  }
})

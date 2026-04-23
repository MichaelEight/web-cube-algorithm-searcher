/// <reference lib="webworker" />
// Single-worker runner for iddfs and bidir. The main thread cancels by calling
// worker.terminate(); no in-worker cancel flag is needed because the search is
// never interrupted mid-run.
import { createCube, type Move } from '../cube/cube'
import { findAlgorithms, findAlgorithmsBidir } from '../cube/search'

export type SearchMode = 'iddfs' | 'bidir'

export interface SingleWorkerJob {
  type: 'run'
  jobId: number
  mode: SearchMode
  cubeSize: number
  start: number[]
  target: number[]
  allowedNames: string[]
  maxDepth: number
  maxSolutions: number
}

export type SingleWorkerIn = SingleWorkerJob

export interface SingleWorkerProgress {
  type: 'progress'
  jobId: number
  depth: number
  nodes: number
  found: number
  heapUsed?: number
}

export interface SingleWorkerSolution {
  type: 'solution'
  jobId: number
  names: string[]
}

export interface SingleWorkerDone {
  type: 'done'
  jobId: number
  nodes: number
  solutions: string[][]
  heapUsed?: number
}

export type SingleWorkerOut = SingleWorkerProgress | SingleWorkerSolution | SingleWorkerDone

function sampleHeap(): number | undefined {
  const perf = (self as unknown as { performance?: { memory?: { usedJSHeapSize?: number } } }).performance
  return perf?.memory?.usedJSHeapSize
}

self.addEventListener('message', (ev: MessageEvent<SingleWorkerIn>) => {
  const msg = ev.data
  if (msg.type !== 'run') return
  const { jobId, mode, cubeSize, start, target, allowedNames, maxDepth, maxSolutions } = msg
  const cube = createCube(cubeSize)
  const allowed: Move[] = allowedNames.map((n) => cube.MOVE_REGISTRY[n])
  const post = (m: SingleWorkerOut) => (self as unknown as Worker).postMessage(m)
  const opts = {
    maxDepth,
    maxSolutions,
    progressCb: (depth: number, nodes: number, found: number) => {
      post({ type: 'progress', jobId, depth, nodes, found, heapUsed: sampleHeap() })
    },
    onSolution: (path: readonly Move[]) => {
      post({ type: 'solution', jobId, names: path.map((m) => m.name) })
    },
  }
  const fn = mode === 'bidir' ? findAlgorithmsBidir : findAlgorithms
  const { solutions, nodes } = fn(start, target, allowed, opts)
  post({
    type: 'done',
    jobId,
    nodes,
    solutions: solutions.map((s) => s.map((m) => m.name)),
    heapUsed: sampleHeap(),
  })
})

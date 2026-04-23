/// <reference lib="webworker" />
// Web Worker — runs IDDFS on a seeded first move. One job per first move.
import type { CubeState, Move } from '../cube/cube'
import { createCube } from '../cube/cube'
import { findAlgorithms } from '../cube/search'

export interface WorkerJob {
  type: 'run'
  jobId: number
  cubeSize: number
  start: CubeState
  target: CubeState
  allowedNames: string[]
  firstMoveName: string
  maxDepth: number
  maxSolutions: number
}

export interface WorkerCancel {
  type: 'cancel'
  jobId: number
}

export type WorkerIn = WorkerJob | WorkerCancel

export interface WorkerResult {
  type: 'done'
  jobId: number
  solutionNames: string[][]
  nodes: number
  heapUsed?: number
}

export interface WorkerProgress {
  type: 'progress'
  jobId: number
  nodes: number
  heapUsed?: number
}

export type WorkerOut = WorkerResult | WorkerProgress

const cancelFlags = new Map<number, { cancelled: boolean }>()

function sampleHeap(): number | undefined {
  const perf = (self as unknown as { performance?: { memory?: { usedJSHeapSize?: number } } }).performance
  return perf?.memory?.usedJSHeapSize
}

self.addEventListener('message', (ev: MessageEvent<WorkerIn>) => {
  const msg = ev.data
  if (msg.type === 'cancel') {
    const flag = cancelFlags.get(msg.jobId)
    if (flag) flag.cancelled = true
    return
  }
  const { jobId, cubeSize, start, target, allowedNames, firstMoveName, maxDepth, maxSolutions } = msg
  const cube = createCube(cubeSize)
  const allowed: Move[] = allowedNames.map((n) => cube.MOVE_REGISTRY[n])
  const first = cube.MOVE_REGISTRY[firstMoveName]
  const size = cube.stateSize
  const seeded = new Array<number>(size)
  for (let i = 0; i < size; i++) seeded[i] = start[first.perm[i]]

  const flag = { cancelled: false }
  cancelFlags.set(jobId, flag)

  const { solutions, nodes } = findAlgorithms(seeded, target, allowed, {
    maxDepth: maxDepth - 1,
    maxSolutions,
    cancel: flag,
    progressCb: (_d, n) => {
      const out: WorkerProgress = { type: 'progress', jobId, nodes: n, heapUsed: sampleHeap() }
      ;(self as unknown as Worker).postMessage(out)
    },
  })

  cancelFlags.delete(jobId)

  const withFirst: string[][] = solutions.map((s) => [firstMoveName, ...s.map((m) => m.name)])
  const out: WorkerResult = { type: 'done', jobId, solutionNames: withFirst, nodes, heapUsed: sampleHeap() }
  ;(self as unknown as Worker).postMessage(out)
})

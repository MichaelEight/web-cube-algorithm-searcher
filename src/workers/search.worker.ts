/// <reference lib="webworker" />
// Web Worker — runs IDDFS on a seeded first move. One job per first move.
import type { CubeState, Move } from '../cube/cube'
import { MOVE_REGISTRY } from '../cube/cube'
import { findAlgorithms } from '../cube/search'

export interface WorkerJob {
  type: 'run'
  jobId: number
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
}

export interface WorkerProgress {
  type: 'progress'
  jobId: number
  nodes: number
}

export type WorkerOut = WorkerResult | WorkerProgress

const cancelFlags = new Map<number, { cancelled: boolean }>()

self.addEventListener('message', (ev: MessageEvent<WorkerIn>) => {
  const msg = ev.data
  if (msg.type === 'cancel') {
    const flag = cancelFlags.get(msg.jobId)
    if (flag) flag.cancelled = true
    return
  }
  const { jobId, start, target, allowedNames, firstMoveName, maxDepth, maxSolutions } = msg
  const allowed: Move[] = allowedNames.map((n) => MOVE_REGISTRY[n])
  const first = MOVE_REGISTRY[firstMoveName]
  const seeded = new Array<number>(54)
  for (let i = 0; i < 54; i++) seeded[i] = start[first.perm[i]]

  const flag = { cancelled: false }
  cancelFlags.set(jobId, flag)

  const { solutions, nodes } = findAlgorithms(seeded, target, allowed, {
    maxDepth: maxDepth - 1,
    maxSolutions,
    cancel: flag,
    progressCb: (_d, n) => {
      const out: WorkerProgress = { type: 'progress', jobId, nodes: n }
      ;(self as unknown as Worker).postMessage(out)
    },
  })

  cancelFlags.delete(jobId)

  const withFirst: string[][] = solutions.map((s) => [firstMoveName, ...s.map((m) => m.name)])
  const out: WorkerResult = { type: 'done', jobId, solutionNames: withFirst, nodes }
  ;(self as unknown as Worker).postMessage(out)
})

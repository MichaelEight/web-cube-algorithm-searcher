// Parallel IDDFS via Web Workers. Partitions search by first move.
import { MOVE_REGISTRY } from './cube'
import { matches } from './search'
import type { CubeState, Move } from './cube'
import type { WorkerIn, WorkerOut } from '../workers/search.worker'

export interface ParallelOptions {
  maxDepth?: number
  maxSolutions?: number
  cancel?: { cancelled: boolean }
  progressCb?: (depth: number, nodes: number, found: number) => void
  onSolution?: (path: readonly Move[]) => void
}

export function findAlgorithmsParallel(
  start: CubeState,
  target: CubeState,
  allowedMoves: readonly Move[],
  opts: ParallelOptions = {},
): Promise<{ solutions: Move[][]; nodes: number }> {
  const maxDepth = opts.maxDepth ?? 10
  const maxSolutions = opts.maxSolutions ?? 5
  const cancel = opts.cancel
  const progressCb = opts.progressCb
  const onSolution = opts.onSolution

  if (matches(start, target)) return Promise.resolve({ solutions: [[]], nodes: 0 })
  if (maxDepth < 1 || !allowedMoves.length) return Promise.resolve({ solutions: [], nodes: 0 })

  const allowedNames = allowedMoves.map((m) => m.name)
  const numWorkers = Math.max(1, Math.min(
    allowedMoves.length,
    (typeof navigator !== 'undefined' && navigator.hardwareConcurrency) ? navigator.hardwareConcurrency : 4,
  ))

  return new Promise((resolve) => {
    const workers: Worker[] = []
    for (let i = 0; i < numWorkers; i++) {
      workers.push(new Worker(new URL('../workers/search.worker.ts', import.meta.url), { type: 'module' }))
    }

    const jobQueue: number[] = allowedMoves.map((_, i) => i)
    let nextJobId = 1
    const jobIdToWorker = new Map<number, number>()
    const workerBusy = new Array<boolean>(numWorkers).fill(false)
    const workerJobId = new Array<number | null>(numWorkers).fill(null)
    const nodesByWorker = new Array<number>(numWorkers).fill(0)

    let allSolutions: Move[][] = []
    let pending = 0
    let terminated = false
    let totalNodes = 0

    const cancelInterval = setInterval(() => {
      if (cancel?.cancelled && !terminated) finish(true)
    }, 80)

    const finish = (cancelled: boolean) => {
      if (terminated) return
      terminated = true
      clearInterval(cancelInterval)
      for (const w of workers) {
        try { w.postMessage({ type: 'cancel', jobId: 0 } satisfies WorkerIn) } catch {
          // ignore
        }
        w.terminate()
      }
      if (cancelled) {
        resolve({ solutions: [], nodes: totalNodes })
        return
      }
      allSolutions.sort((a, b) => a.length - b.length)
      resolve({ solutions: allSolutions.slice(0, maxSolutions), nodes: totalNodes })
    }

    const assign = (widx: number) => {
      if (terminated) return
      if (allSolutions.length >= maxSolutions) { finish(false); return }
      if (!jobQueue.length) {
        if (!workerBusy.some(Boolean)) finish(false)
        return
      }
      const moveIdx = jobQueue.shift()!
      const firstMove = allowedMoves[moveIdx]
      const jobId = nextJobId++
      jobIdToWorker.set(jobId, widx)
      workerBusy[widx] = true
      workerJobId[widx] = jobId
      pending++
      workers[widx].postMessage({
        type: 'run',
        jobId,
        start: Array.from(start),
        target: Array.from(target),
        allowedNames,
        firstMoveName: firstMove.name,
        maxDepth,
        maxSolutions,
      } satisfies WorkerIn)
    }

    for (let i = 0; i < numWorkers; i++) {
      workers[i].addEventListener('message', (ev: MessageEvent<WorkerOut>) => {
        const msg = ev.data
        if (msg.type === 'progress') {
          nodesByWorker[i] = msg.nodes
          const sum = nodesByWorker.reduce((a, b) => a + b, 0)
          totalNodes = sum
          if (progressCb) progressCb(maxDepth, sum, allSolutions.length)
          return
        }
        if (msg.type === 'done') {
          totalNodes += msg.nodes - nodesByWorker[i]
          nodesByWorker[i] = 0
          workerBusy[i] = false
          workerJobId[i] = null
          pending--
          for (const seqNames of msg.solutionNames) {
            const seq = seqNames.map((n) => MOVE_REGISTRY[n])
            allSolutions.push(seq)
            if (onSolution) onSolution(seq)
          }
          if (allSolutions.length >= maxSolutions) { finish(false); return }
          assign(i)
        }
      })
      assign(i)
    }

    if (pending === 0 && !jobQueue.length) finish(false)
  })
}


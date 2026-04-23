// Runs iddfs/bidir in a Web Worker so the main thread stays responsive. Cancel is implemented
// by terminating the worker — no cancel flag is needed in the worker itself.
import type { CubeSpec, CubeState, Move } from './cube'
import type {
  SearchMode,
  SingleWorkerIn,
  SingleWorkerOut,
} from '../workers/singleSearch.worker'

export interface SingleWorkerOptions {
  maxDepth?: number
  maxSolutions?: number
  cancel?: { cancelled: boolean }
  progressCb?: (depth: number, nodes: number, found: number) => void
  onSolution?: (path: readonly Move[]) => void
  onHeap?: (peakBytes: number) => void
}

let nextJobId = 1

export function findAlgorithmsInWorker(
  mode: SearchMode,
  cube: CubeSpec,
  start: CubeState,
  target: CubeState,
  allowedMoves: readonly Move[],
  opts: SingleWorkerOptions = {},
): Promise<{ solutions: Move[][]; nodes: number; cancelled: boolean; peakHeap: number }> {
  const maxDepth = opts.maxDepth ?? 12
  const maxSolutions = opts.maxSolutions ?? 5

  if (!allowedMoves.length || maxDepth < 1) {
    return Promise.resolve({ solutions: [], nodes: 0, cancelled: false, peakHeap: 0 })
  }

  return new Promise((resolve) => {
    const worker = new Worker(new URL('../workers/singleSearch.worker.ts', import.meta.url), { type: 'module' })
    const jobId = nextJobId++
    let totalNodes = 0
    let cancelled = false
    let finished = false
    let peakHeap = 0
    const recordHeap = (h?: number) => {
      if (typeof h !== 'number' || h <= 0) return
      if (h > peakHeap) peakHeap = h
      opts.onHeap?.(peakHeap)
    }

    const cleanup = () => {
      finished = true
      clearInterval(cancelPoll)
      try { worker.terminate() } catch {
        // ignore
      }
    }

    const cancelPoll = setInterval(() => {
      if (!finished && opts.cancel?.cancelled) {
        cancelled = true
        cleanup()
        resolve({ solutions: [], nodes: totalNodes, cancelled: true, peakHeap })
      }
    }, 80)

    worker.addEventListener('message', (ev: MessageEvent<SingleWorkerOut>) => {
      const msg = ev.data
      if (msg.type === 'progress') {
        totalNodes = msg.nodes
        recordHeap(msg.heapUsed)
        opts.progressCb?.(msg.depth, msg.nodes, msg.found)
      } else if (msg.type === 'solution') {
        const seq = msg.names.map((n) => cube.MOVE_REGISTRY[n]).filter(Boolean)
        opts.onSolution?.(seq)
      } else if (msg.type === 'done') {
        if (finished) return
        totalNodes = msg.nodes
        recordHeap(msg.heapUsed)
        const solutions = msg.solutions.map((s) => s.map((n) => cube.MOVE_REGISTRY[n]).filter(Boolean))
        cleanup()
        resolve({ solutions, nodes: msg.nodes, cancelled, peakHeap })
      }
    })

    worker.addEventListener('error', () => {
      if (finished) return
      cleanup()
      resolve({ solutions: [], nodes: totalNodes, cancelled, peakHeap })
    })

    const job: SingleWorkerIn = {
      type: 'run',
      jobId,
      mode,
      cubeSize: cube.N,
      start: Array.from(start),
      target: Array.from(target),
      allowedNames: allowedMoves.map((m) => m.name),
      maxDepth,
      maxSolutions,
    }
    worker.postMessage(job)
  })
}

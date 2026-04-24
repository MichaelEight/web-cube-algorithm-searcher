// Kociemba two-phase solver integration for 3x3 cubes. Converts our CubeState to cubejs's
// facelet string, runs the solve in a dedicated worker, and maps the result back to Moves.
//
// Shape of a 3x3 state (54 stickers, face order U R F D L B, rows/cols matching cubejs).
import { ANY, FACE_COLOR, type CubeSpec, type CubeState, type Move } from './cube'
import type {
  KociembaIn,
  KociembaOut,
} from '../workers/kociemba.worker'

const COLOR_TO_FACE: Record<number, string> = {
  [FACE_COLOR.U]: 'U',
  [FACE_COLOR.D]: 'D',
  [FACE_COLOR.F]: 'F',
  [FACE_COLOR.B]: 'B',
  [FACE_COLOR.L]: 'L',
  [FACE_COLOR.R]: 'R',
}

export class KociembaError extends Error {}

export function stateToFacelets(state: CubeState): string {
  if (state.length !== 54) throw new KociembaError(`kociemba: expected 54 stickers, got ${state.length}`)
  let out = ''
  for (let i = 0; i < 54; i++) {
    const c = state[i]
    if (c === ANY) throw new KociembaError(`kociemba: sticker ${i} is wildcard; two-phase solver needs a concrete state`)
    const f = COLOR_TO_FACE[c]
    if (!f) throw new KociembaError(`kociemba: sticker ${i} has unknown color ${c}`)
    out += f
  }
  return out
}

export function invertAlgorithm(names: readonly string[]): string[] {
  const out: string[] = []
  for (let i = names.length - 1; i >= 0; i--) {
    const n = names[i]
    if (n.endsWith('2')) out.push(n)
    else if (n.endsWith("'")) out.push(n.slice(0, -1))
    else out.push(n + "'")
  }
  return out
}

export interface KociembaOptions {
  maxDepth?: number
  cancel?: { cancelled: boolean }
  onProgress?: (phase: 'init' | 'solving') => void
  onHeap?: (peakBytes: number) => void
}

export interface KociembaResult {
  solutions: Move[][]
  nodes: number
  peakHeap: number
  cancelled: boolean
}

let nextJobId = 1

function runWorkerSolve(
  facelets: string,
  opts: KociembaOptions,
): Promise<{ moves: string[]; cancelled: boolean; peakHeap: number }> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL('../workers/kociemba.worker.ts', import.meta.url), { type: 'module' })
    const jobId = nextJobId++
    let finished = false
    let peakHeap = 0

    const cleanup = () => {
      finished = true
      clearInterval(cancelPoll)
      try { worker.terminate() } catch {
        // ignore
      }
    }

    const cancelPoll = setInterval(() => {
      if (!finished && opts.cancel?.cancelled) {
        cleanup()
        resolve({ moves: [], cancelled: true, peakHeap })
      }
    }, 80)

    worker.addEventListener('message', (ev: MessageEvent<KociembaOut>) => {
      const msg = ev.data
      if (msg.type === 'init') {
        opts.onProgress?.('init')
      } else if (msg.type === 'done') {
        if (finished) return
        if (typeof msg.heapUsed === 'number' && msg.heapUsed > peakHeap) {
          peakHeap = msg.heapUsed
          opts.onHeap?.(peakHeap)
        }
        cleanup()
        resolve({ moves: msg.moves, cancelled: false, peakHeap })
      } else if (msg.type === 'error') {
        if (finished) return
        cleanup()
        reject(new KociembaError(msg.message))
      }
    })

    worker.addEventListener('error', (ev) => {
      if (finished) return
      cleanup()
      reject(new KociembaError(ev.message || 'kociemba worker error'))
    })

    opts.onProgress?.('solving')

    const job: KociembaIn = {
      type: 'solve',
      jobId,
      facelets,
      maxDepth: opts.maxDepth,
    }
    worker.postMessage(job)
  })
}

export async function findAlgorithmKociemba(
  cube: CubeSpec,
  start: CubeState,
  target: CubeState,
  opts: KociembaOptions = {},
): Promise<KociembaResult> {
  if (cube.N !== 3) throw new KociembaError(`kociemba: only 3x3 is supported, got ${cube.N}x${cube.N}`)

  const startFacelets = stateToFacelets(start)
  const targetFacelets = stateToFacelets(target)

  const solveStart = await runWorkerSolve(startFacelets, opts)
  if (solveStart.cancelled) {
    return { solutions: [], nodes: 0, peakHeap: solveStart.peakHeap, cancelled: true }
  }

  let moveNames = solveStart.moves
  let peak = solveStart.peakHeap

  const targetIsSolved = cube.statesEqual(target, cube.SOLVED)
  if (!targetIsSolved) {
    const solveTarget = await runWorkerSolve(targetFacelets, opts)
    if (solveTarget.cancelled) {
      return { solutions: [], nodes: 0, peakHeap: Math.max(peak, solveTarget.peakHeap), cancelled: true }
    }
    peak = Math.max(peak, solveTarget.peakHeap)
    moveNames = [...moveNames, ...invertAlgorithm(solveTarget.moves)]
  }

  const moves = moveNames
    .map((n) => cube.MOVE_REGISTRY[n])
    .filter((m): m is Move => Boolean(m))

  if (moves.length !== moveNames.length) {
    throw new KociembaError(`kociemba: unrecognized move in algorithm: ${moveNames.join(' ')}`)
  }

  return { solutions: [moves], nodes: 0, peakHeap: peak, cancelled: false }
}

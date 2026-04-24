// 4x4 reduction solver integration (cstimer_module, Chen Shuang). Converts our CubeState
// to the 96-char URFDLB facelet string cstimer expects, runs the solve in a worker, and
// maps the solution back to our Move[].
import { ANY, FACE_COLOR, type CubeSpec, type CubeState, type Move } from './cube'
import type {
  Cstimer444In,
  Cstimer444Out,
} from '../workers/cstimer444.worker'

const COLOR_TO_FACE: Record<number, string> = {
  [FACE_COLOR.U]: 'U',
  [FACE_COLOR.D]: 'D',
  [FACE_COLOR.F]: 'F',
  [FACE_COLOR.B]: 'B',
  [FACE_COLOR.L]: 'L',
  [FACE_COLOR.R]: 'R',
}

export class Cstimer444Error extends Error {}

export function stateToFacelets4x4(state: CubeState): string {
  if (state.length !== 96) throw new Cstimer444Error(`cstimer444: expected 96 stickers, got ${state.length}`)
  let out = ''
  for (let i = 0; i < 96; i++) {
    const c = state[i]
    if (c === ANY) throw new Cstimer444Error(`cstimer444: sticker ${i} is wildcard; reduction solver needs a concrete state`)
    const f = COLOR_TO_FACE[c]
    if (!f) throw new Cstimer444Error(`cstimer444: sticker ${i} has unknown color ${c}`)
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

export interface Cstimer444Options {
  cancel?: { cancelled: boolean }
  onProgress?: (phase: 'init' | 'solving') => void
  onHeap?: (peakBytes: number) => void
}

export interface Cstimer444Result {
  solutions: Move[][]
  nodes: number
  peakHeap: number
  cancelled: boolean
}

let nextJobId = 1

function runWorkerSolve(
  facelets: string,
  opts: Cstimer444Options,
): Promise<{ moves: string[]; cancelled: boolean; peakHeap: number }> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL('../workers/cstimer444.worker.ts', import.meta.url), { type: 'module' })
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

    worker.addEventListener('message', (ev: MessageEvent<Cstimer444Out>) => {
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
        reject(new Cstimer444Error(msg.message))
      }
    })

    worker.addEventListener('error', (ev) => {
      if (finished) return
      cleanup()
      reject(new Cstimer444Error(ev.message || 'cstimer444 worker error'))
    })

    opts.onProgress?.('solving')

    const job: Cstimer444In = {
      type: 'solve',
      jobId,
      facelets,
    }
    worker.postMessage(job)
  })
}

export async function findAlgorithmCstimer444(
  cube: CubeSpec,
  start: CubeState,
  target: CubeState,
  opts: Cstimer444Options = {},
): Promise<Cstimer444Result> {
  if (cube.N !== 4) throw new Cstimer444Error(`cstimer444: only 4x4 is supported, got ${cube.N}x${cube.N}`)

  const startFacelets = stateToFacelets4x4(start)
  const targetFacelets = stateToFacelets4x4(target)

  // cstimer_module's internal Ya() returns a *scramble* — a sequence that takes the solved
  // state to the given state. To solve (state → solved) we invert; to go (start → target)
  // we invert the start-scramble and append the target-scramble.
  const scrambleStart = await runWorkerSolve(startFacelets, opts)
  if (scrambleStart.cancelled) {
    return { solutions: [], nodes: 0, peakHeap: scrambleStart.peakHeap, cancelled: true }
  }

  let moveNames = invertAlgorithm(scrambleStart.moves)
  let peak = scrambleStart.peakHeap

  const targetIsSolved = cube.statesEqual(target, cube.SOLVED)
  if (!targetIsSolved) {
    const scrambleTarget = await runWorkerSolve(targetFacelets, opts)
    if (scrambleTarget.cancelled) {
      return { solutions: [], nodes: 0, peakHeap: Math.max(peak, scrambleTarget.peakHeap), cancelled: true }
    }
    peak = Math.max(peak, scrambleTarget.peakHeap)
    moveNames = [...moveNames, ...scrambleTarget.moves]
  }

  const unknown: string[] = []
  const moves: Move[] = []
  for (const n of moveNames) {
    const m = cube.MOVE_REGISTRY[n]
    if (m) moves.push(m)
    else unknown.push(n)
  }
  if (unknown.length) {
    throw new Cstimer444Error(`cstimer444: unrecognized moves: ${unknown.join(' ')}`)
  }

  return { solutions: [moves], nodes: 0, peakHeap: peak, cancelled: false }
}

// Per-size session snapshot: cube states, allowed moves, last results, search settings.
// Persisted so a page refresh restores the working context.
import type { CubeSpec, CubeState, Move } from '../cube/cube'

const BASE = 'cube-alg-search:session'

export interface SessionSnapshot {
  start: number[]
  target: number[]
  toggles: Record<string, boolean>
  solutionNames: string[][]
  selectedResult: number | null
  maxDepth: number
  maxSolutions: number
  groupTerms: boolean
  showAlts: boolean
  method: 'iddfs' | 'bidir' | 'parallel' | 'kociemba'
  selectedColor: number
  activeCube: 'start' | 'target'
  startMovesText: string
  targetMovesText: string
}

function keyFor(N: number): string {
  return `${BASE}:${N}x${N}`
}

export function saveSession(N: number, snap: SessionSnapshot): void {
  try {
    localStorage.setItem(keyFor(N), JSON.stringify(snap))
  } catch {
    // quota or serialization error — drop silently
  }
}

export function loadSession(N: number): SessionSnapshot | null {
  try {
    const raw = localStorage.getItem(keyFor(N))
    if (!raw) return null
    const data = JSON.parse(raw) as unknown
    if (!isValidSnapshot(data, N)) return null
    return data as SessionSnapshot
  } catch {
    return null
  }
}

function isValidSnapshot(data: unknown, N: number): data is SessionSnapshot {
  if (!data || typeof data !== 'object') return false
  const d = data as Record<string, unknown>
  const expected = 6 * N * N
  if (!Array.isArray(d.start) || d.start.length !== expected) return false
  if (!Array.isArray(d.target) || d.target.length !== expected) return false
  if (!d.toggles || typeof d.toggles !== 'object') return false
  if (!Array.isArray(d.solutionNames)) return false
  return true
}

export function rehydrateSolutions(cube: CubeSpec, names: readonly (readonly string[])[]): Move[][] {
  const out: Move[][] = []
  for (const seq of names) {
    const resolved: Move[] = []
    let ok = true
    for (const n of seq) {
      const m = cube.MOVE_REGISTRY[n]
      if (!m) { ok = false; break }
      resolved.push(m)
    }
    if (ok) out.push(resolved)
  }
  return out
}

export function toCubeState(arr: readonly number[]): CubeState {
  return [...arr]
}

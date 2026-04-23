// Named-state persistence (localStorage), scoped by cube size.
import type { CubeState } from '../cube/cube'

const BASE = 'cube-alg-search:states'
const LEGACY = BASE // unscoped (pre-NxN) key — treated as 3x3.

function keyFor(N: number): string {
  return `${BASE}:${N}x${N}`
}

function migrateLegacy(): void {
  try {
    const scoped3 = localStorage.getItem(keyFor(3))
    const legacy = localStorage.getItem(LEGACY)
    if (legacy && !scoped3) {
      localStorage.setItem(keyFor(3), legacy)
      localStorage.removeItem(LEGACY)
    }
  } catch {
    // ignore
  }
}

export function loadAll(N: number): Record<string, CubeState> {
  migrateLegacy()
  try {
    const raw = localStorage.getItem(keyFor(N))
    if (!raw) return {}
    const data = JSON.parse(raw) as unknown
    if (!data || typeof data !== 'object') return {}
    const expected = 6 * N * N
    const out: Record<string, CubeState> = {}
    for (const [k, v] of Object.entries(data as Record<string, unknown>)) {
      if (Array.isArray(v) && v.length === expected && v.every((x) => typeof x === 'number')) {
        out[k] = v as CubeState
      }
    }
    return out
  } catch {
    return {}
  }
}

function write(N: number, data: Record<string, CubeState>): void {
  localStorage.setItem(keyFor(N), JSON.stringify(data))
}

export function saveState(N: number, name: string, state: CubeState): void {
  const data = loadAll(N)
  data[name] = [...state]
  write(N, data)
}

export function deleteState(N: number, name: string): void {
  const data = loadAll(N)
  if (name in data) {
    delete data[name]
    write(N, data)
  }
}

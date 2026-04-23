// Named-state persistence (localStorage).
import type { CubeState } from '../cube/cube'

const KEY = 'cube-alg-search:states'

export function loadAll(): Record<string, CubeState> {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return {}
    const data = JSON.parse(raw) as unknown
    if (!data || typeof data !== 'object') return {}
    const out: Record<string, CubeState> = {}
    for (const [k, v] of Object.entries(data as Record<string, unknown>)) {
      if (Array.isArray(v) && v.length === 54 && v.every((x) => typeof x === 'number')) {
        out[k] = v as CubeState
      }
    }
    return out
  } catch {
    return {}
  }
}

function write(data: Record<string, CubeState>): void {
  localStorage.setItem(KEY, JSON.stringify(data))
}

export function saveState(name: string, state: CubeState): void {
  const data = loadAll()
  data[name] = [...state]
  write(data)
}

export function deleteState(name: string): void {
  const data = loadAll()
  if (name in data) {
    delete data[name]
    write(data)
  }
}

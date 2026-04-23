// User-named algorithm library, scoped by cube size.
const BASE = 'cube-alg-search:user-algs'
const LEGACY = BASE

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

export function loadAll(N: number): Record<string, string[]> {
  migrateLegacy()
  try {
    const raw = localStorage.getItem(keyFor(N))
    if (!raw) return {}
    const data = JSON.parse(raw) as unknown
    if (!data || typeof data !== 'object') return {}
    const out: Record<string, string[]> = {}
    for (const [k, v] of Object.entries(data as Record<string, unknown>)) {
      if (Array.isArray(v) && v.every((x) => typeof x === 'string')) {
        out[k] = v as string[]
      }
    }
    return out
  } catch {
    return {}
  }
}

function write(N: number, data: Record<string, string[]>): void {
  localStorage.setItem(keyFor(N), JSON.stringify(data))
}

export function saveAlg(N: number, name: string, moveNames: string[]): void {
  const data = loadAll(N)
  data[name] = [...moveNames]
  write(N, data)
}

export function deleteAlg(N: number, name: string): void {
  const data = loadAll(N)
  if (name in data) {
    delete data[name]
    write(N, data)
  }
}

export function lookup(N: number, moveNames: readonly string[]): string | null {
  const target = moveNames.join('|')
  const data = loadAll(N)
  for (const [name, seq] of Object.entries(data)) {
    if (seq.join('|') === target) return name
  }
  return null
}

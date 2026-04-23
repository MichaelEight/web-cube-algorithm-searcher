// Per-search statistics log, scoped by cube size.
const BASE = 'cube-alg-search:stats'
const LEGACY = BASE

export interface StatEntry {
  timestamp: string
  method: string
  allowedMoves: string[]
  maxDepth: number
  elapsedS: number
  nodes: number
  found: number
  shortestLen: number | null
  cancelled: boolean
  peakHeapBytes?: number
}

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

export function loadAll(N: number): StatEntry[] {
  migrateLegacy()
  try {
    const raw = localStorage.getItem(keyFor(N))
    if (!raw) return []
    const data = JSON.parse(raw) as unknown
    return Array.isArray(data) ? (data as StatEntry[]) : []
  } catch {
    return []
  }
}

export function logEntry(N: number, entry: Omit<StatEntry, 'timestamp'>): void {
  const ts = new Date().toISOString().replace(/\.\d+Z$/, '').replace(/Z$/, '')
  const data = loadAll(N)
  data.push({ timestamp: ts, ...entry })
  localStorage.setItem(keyFor(N), JSON.stringify(data))
}

export function clearAll(N: number): void {
  localStorage.setItem(keyFor(N), '[]')
}

export interface StatEntryWithSize extends StatEntry {
  cubeSize: number
}

export function loadAllSizes(sizes: readonly number[]): StatEntryWithSize[] {
  const out: StatEntryWithSize[] = []
  for (const N of sizes) {
    for (const e of loadAll(N)) out.push({ ...e, cubeSize: N })
  }
  return out
}

export function clearAllSizes(sizes: readonly number[]): void {
  for (const N of sizes) clearAll(N)
}

// Per-search statistics log.
const KEY = 'cube-alg-search:stats'

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
}

export function loadAll(): StatEntry[] {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return []
    const data = JSON.parse(raw) as unknown
    return Array.isArray(data) ? (data as StatEntry[]) : []
  } catch {
    return []
  }
}

export function logEntry(entry: Omit<StatEntry, 'timestamp'>): void {
  const ts = new Date().toISOString().replace(/\.\d+Z$/, '').replace(/Z$/, '')
  const data = loadAll()
  data.push({ timestamp: ts, ...entry })
  localStorage.setItem(KEY, JSON.stringify(data))
}

export function clearAll(): void {
  localStorage.setItem(KEY, '[]')
}

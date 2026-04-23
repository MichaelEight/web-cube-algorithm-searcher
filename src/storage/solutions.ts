// Persistence for past search results (start, target, solutions).
import type { CubeState } from '../cube/cube'

const KEY = 'cube-alg-search:history'

export interface SolutionRecord {
  timestamp: string
  start: number[]
  target: number[]
  movesUsed: string[]
  solutions: string[][]
}

export function loadAll(): SolutionRecord[] {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return []
    const data = JSON.parse(raw) as unknown
    return Array.isArray(data) ? (data as SolutionRecord[]) : []
  } catch {
    return []
  }
}

function write(records: SolutionRecord[]): void {
  localStorage.setItem(KEY, JSON.stringify(records))
}

export function appendRecord(
  start: CubeState,
  target: CubeState,
  solutions: string[][],
  movesUsed: string[],
): void {
  const records = loadAll()
  const ts = new Date().toISOString().replace(/\.\d+Z$/, '').replace(/Z$/, '')
  records.push({
    timestamp: ts,
    start: [...start],
    target: [...target],
    movesUsed: [...movesUsed],
    solutions,
  })
  write(records)
}

export function deleteRecord(index: number): void {
  const records = loadAll()
  if (index >= 0 && index < records.length) {
    records.splice(index, 1)
    write(records)
  }
}

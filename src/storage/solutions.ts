// Persistence for past search results (start, target, solutions), scoped by cube size.
import type { CubeState } from '../cube/cube'

const BASE = 'cube-alg-search:history'
const LEGACY = BASE

export interface SolutionRecord {
  timestamp: string
  start: number[]
  target: number[]
  movesUsed: string[]
  solutions: string[][]
}

export interface SolutionRecordWithSize extends SolutionRecord {
  cubeSize: number
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

export function loadAll(N: number): SolutionRecord[] {
  migrateLegacy()
  try {
    const raw = localStorage.getItem(keyFor(N))
    if (!raw) return []
    const data = JSON.parse(raw) as unknown
    return Array.isArray(data) ? (data as SolutionRecord[]) : []
  } catch {
    return []
  }
}

function write(N: number, records: SolutionRecord[]): void {
  localStorage.setItem(keyFor(N), JSON.stringify(records))
}

export function appendRecord(
  N: number,
  start: CubeState,
  target: CubeState,
  solutions: string[][],
  movesUsed: string[],
): void {
  const records = loadAll(N)
  const ts = new Date().toISOString().replace(/\.\d+Z$/, '').replace(/Z$/, '')
  records.push({
    timestamp: ts,
    start: [...start],
    target: [...target],
    movesUsed: [...movesUsed],
    solutions,
  })
  write(N, records)
}

export function deleteRecord(N: number, index: number): void {
  const records = loadAll(N)
  if (index >= 0 && index < records.length) {
    records.splice(index, 1)
    write(N, records)
  }
}

export function loadAllSizes(sizes: readonly number[]): SolutionRecordWithSize[] {
  const out: SolutionRecordWithSize[] = []
  for (const N of sizes) {
    for (const rec of loadAll(N)) out.push({ ...rec, cubeSize: N })
  }
  out.sort((a, b) => a.timestamp.localeCompare(b.timestamp))
  return out
}

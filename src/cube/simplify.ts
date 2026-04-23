// Post-search simplification: collapse consecutive same-face moves,
// then dedupe identical resulting sequences.
import { MOVE_REGISTRY, type Move } from './cube'

function quarters(name: string, faceGroup: string): number {
  if (name === faceGroup) return 1
  if (name === faceGroup + "'") return 3
  if (name === faceGroup + '2') return 2
  return 0
}

function nameFromQuarters(faceGroup: string, q: number): string | null {
  const m = ((q % 4) + 4) % 4
  if (m === 0) return null
  if (m === 1) return faceGroup
  if (m === 2) return faceGroup + '2'
  return faceGroup + "'"
}

export function simplifySequence(moves: readonly Move[]): Move[] {
  const out: Move[] = [...moves]
  let changed = true
  while (changed) {
    changed = false
    for (let i = 0; i < out.length - 1; i++) {
      if (out[i].faceGroup !== out[i + 1].faceGroup) continue
      const g = out[i].faceGroup
      const q = quarters(out[i].name, g) + quarters(out[i + 1].name, g)
      const newName = nameFromQuarters(g, q)
      if (newName === null) {
        out.splice(i, 2)
      } else {
        out.splice(i, 2, MOVE_REGISTRY[newName])
      }
      changed = true
      break
    }
  }
  return out
}

export function simplifyAndDedupe(solutions: readonly (readonly Move[])[]): Move[][] {
  const seen = new Set<string>()
  const out: Move[][] = []
  for (const s of solutions) {
    const simplified = simplifySequence(s)
    const key = simplified.map((m) => m.name).join('|')
    if (seen.has(key)) continue
    seen.add(key)
    out.push(simplified)
  }
  out.sort((a, b) => a.length - b.length)
  return out
}

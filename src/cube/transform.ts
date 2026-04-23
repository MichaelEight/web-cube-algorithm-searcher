// Sequence transformations: inverse and RL-mirror.
import { MOVE_REGISTRY, type Move } from './cube'

const MIRROR_FACE: Record<string, string> = {
  R: 'L', L: 'R',
  Rw: 'Lw', Lw: 'Rw',
  U: 'U', D: 'D', F: 'F', B: 'B',
  Uw: 'Uw', Dw: 'Dw', Fw: 'Fw', Bw: 'Bw',
  M: 'M', E: 'E', S: 'S',
  x: 'x', y: 'y', z: 'z',
}

function split(name: string): [string, string] {
  if (name.endsWith("'") || name.endsWith('2')) return [name.slice(0, -1), name.slice(-1)]
  return [name, '']
}

export function invertSequence(moves: readonly Move[]): Move[] {
  const out: Move[] = []
  for (let i = moves.length - 1; i >= 0; i--) {
    const m = moves[i]
    const [base, suffix] = split(m.name)
    let invName: string
    if (suffix === '2') invName = m.name
    else if (suffix === "'") invName = base
    else invName = base + "'"
    out.push(MOVE_REGISTRY[invName])
  }
  return out
}

export function mirrorSequence(moves: readonly Move[]): Move[] | null {
  const out: Move[] = []
  for (const m of moves) {
    const [base, suffix] = split(m.name)
    const newBase = MIRROR_FACE[base]
    if (newBase === undefined) return null
    let newName: string
    if (suffix === '2') newName = newBase + '2'
    else if (suffix === "'") newName = newBase
    else newName = newBase + "'"
    const mm = MOVE_REGISTRY[newName]
    if (!mm) return null
    out.push(mm)
  }
  return out
}

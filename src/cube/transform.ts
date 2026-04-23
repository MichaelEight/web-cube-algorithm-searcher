// Sequence transformations: inverse and RL-mirror.
import type { CubeSpec, Move } from './cube'

// Mirror wide: strip optional numeric prefix, flip R/L base, restore prefix and 'w'.
function mirrorBase(base: string): string | null {
  // Plain outer faces / slice / rotation
  const flatMap: Record<string, string> = {
    R: 'L', L: 'R',
    U: 'U', D: 'D', F: 'F', B: 'B',
    M: 'M', E: 'E', S: 'S',
    r: 'l', l: 'r',
    u: 'u', d: 'd', f: 'f', b: 'b',
    x: 'x', y: 'y', z: 'z',
  }
  if (base in flatMap) return flatMap[base]
  // Wide with optional numeric prefix: "Rw", "Lw", "3Rw", "3Lw"
  const wideMatch = /^(\d*)([RLUDFB])w$/.exec(base)
  if (wideMatch) {
    const [, prefix, face] = wideMatch
    const flipped = face === 'R' ? 'L' : face === 'L' ? 'R' : face
    return `${prefix}${flipped}w`
  }
  return null
}

function split(name: string): [string, string] {
  if (name.endsWith("'") || name.endsWith('2')) return [name.slice(0, -1), name.slice(-1)]
  return [name, '']
}

export function invertSequence(cube: CubeSpec, moves: readonly Move[]): Move[] {
  const out: Move[] = []
  for (let i = moves.length - 1; i >= 0; i--) {
    const m = moves[i]
    const [base, suffix] = split(m.name)
    let invName: string
    if (suffix === '2') invName = m.name
    else if (suffix === "'") invName = base
    else invName = base + "'"
    out.push(cube.MOVE_REGISTRY[invName])
  }
  return out
}

export function mirrorSequence(cube: CubeSpec, moves: readonly Move[]): Move[] | null {
  const out: Move[] = []
  for (const m of moves) {
    const [base, suffix] = split(m.name)
    const newBase = mirrorBase(base)
    if (newBase === null) return null
    let newName: string
    if (suffix === '2') newName = newBase + '2'
    else if (suffix === "'") newName = newBase
    else newName = newBase + "'"
    const mm = cube.MOVE_REGISTRY[newName]
    if (!mm) return null
    out.push(mm)
  }
  return out
}

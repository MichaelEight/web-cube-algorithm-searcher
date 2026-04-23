// Parse and format cube move sequences.
import { MOVE_REGISTRY, type Move } from './cube'

const WIDE_ALIAS: Record<string, string> = {
  u: 'Uw', d: 'Dw', l: 'Lw', r: 'Rw', f: 'Fw', b: 'Bw',
}

function canonical(tok: string): string {
  let suffix = ''
  let base = tok
  if (tok.endsWith("'") || tok.endsWith('2')) {
    suffix = tok.slice(-1)
    base = tok.slice(0, -1)
  }
  if (base in WIDE_ALIAS) return WIDE_ALIAS[base] + suffix
  return tok
}

export function formatSequence(moves: readonly Move[]): string {
  return moves.map((m) => m.name).join(' ')
}

function inverseName(name: string): string {
  if (name.endsWith('2')) return name
  if (name.endsWith("'")) return name.slice(0, -1)
  return name + "'"
}

function isInversePair(a: Move, b: Move): boolean {
  return inverseName(a.name) === b.name
}

export function formatSequenceGrouped(moves: readonly Move[]): string {
  const out: string[] = []
  let i = 0
  const n = moves.length
  while (i < n) {
    if (i + 4 <= n) {
      const [m0, m1, m2, m3] = [moves[i], moves[i + 1], moves[i + 2], moves[i + 3]]
      if (isInversePair(m0, m2) && isInversePair(m1, m3) && m0.faceGroup !== m1.faceGroup) {
        out.push('(' + moves.slice(i, i + 4).map((m) => m.name).join(' ') + ')')
        i += 4
        continue
      }
    }
    out.push(moves[i].name)
    i += 1
  }
  return out.join(' ')
}

export function parseSequence(text: string): Move[] {
  const tokens = text.replace(/,/g, ' ').split(/\s+/).filter(Boolean)
  const out: Move[] = []
  for (const tok of tokens) {
    const c = canonical(tok)
    const m = MOVE_REGISTRY[c]
    if (!m) throw new Error(`unknown move: ${JSON.stringify(tok)}`)
    out.push(m)
  }
  return out
}

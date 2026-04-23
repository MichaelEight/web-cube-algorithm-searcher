import { type CubeSpec, type Move } from '../cube/cube'
import { formatSequence, formatSequenceGrouped } from '../cube/notation'
import { invertSequence, mirrorSequence } from '../cube/transform'
import * as algsKnown from '../cube/algsKnown'
import * as userAlgs from '../storage/userAlgs'

export interface ResultLine {
  key: string
  label: string
  seq: Move[]
}

export function buildResultLines(
  cube: CubeSpec,
  solutions: readonly (readonly Move[])[],
  grouped: boolean,
  showAlts: boolean,
): ResultLine[] {
  const out: ResultLine[] = []
  const fmt = grouped ? formatSequenceGrouped : formatSequence
  solutions.forEach((seqRaw, i) => {
    const seq = [...seqRaw]
    out.push(toLine(cube, `${String(i + 1).padStart(2, ' ')}.`, seq, fmt, `${i}-main`))
    if (showAlts && seq.length) {
      const inv = invertSequence(cube, seq)
      out.push(toLine(cube, '    inv:', inv, fmt, `${i}-inv`))
      const mir = mirrorSequence(cube, seq)
      if (mir !== null) out.push(toLine(cube, '    mir:', mir, fmt, `${i}-mir`))
    }
  })
  return out
}

function toLine(cube: CubeSpec, idxLabel: string, seq: Move[], fmt: (m: readonly Move[]) => string, key: string): ResultLine {
  const text = seq.length ? fmt(seq) : '(already matches)'
  const names = seq.map((m) => m.name)
  const label = seq.length ? (algsKnown.lookup(cube.N, names) || userAlgs.lookup(cube.N, names)) : null
  const tail = label ? `  [${label}]` : ''
  return { key, seq, label: `${idxLabel}  (${seq.length})  ${text}${tail}` }
}

interface Props {
  lines: ResultLine[]
  selectedIdx: number | null
  onSelect: (i: number) => void
  onCopy: (seq: Move[]) => void
}

export function ResultsList({ lines, selectedIdx, onSelect, onCopy }: Props) {
  return (
    <div className="results-list">
      {lines.map((line, i) => (
        <div
          key={line.key}
          className={`results-item${selectedIdx === i ? ' selected' : ''}`}
          onClick={() => onSelect(i)}
          onDoubleClick={() => onCopy(line.seq)}
        >
          {line.label}
        </div>
      ))}
    </div>
  )
}

export function namesToMoves(cube: CubeSpec, names: readonly string[]): Move[] {
  return names.map((n) => cube.MOVE_REGISTRY[n]).filter(Boolean)
}

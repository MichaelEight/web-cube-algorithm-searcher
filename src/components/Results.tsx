import { type Move, MOVE_REGISTRY } from '../cube/cube'
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
  solutions: readonly (readonly Move[])[],
  grouped: boolean,
  showAlts: boolean,
): ResultLine[] {
  const out: ResultLine[] = []
  const fmt = grouped ? formatSequenceGrouped : formatSequence
  solutions.forEach((seqRaw, i) => {
    const seq = [...seqRaw]
    out.push(toLine(`${String(i + 1).padStart(2, ' ')}.`, seq, fmt, `${i}-main`))
    if (showAlts && seq.length) {
      const inv = invertSequence(seq)
      out.push(toLine('    inv:', inv, fmt, `${i}-inv`))
      const mir = mirrorSequence(seq)
      if (mir !== null) out.push(toLine('    mir:', mir, fmt, `${i}-mir`))
    }
  })
  return out
}

function toLine(idxLabel: string, seq: Move[], fmt: (m: readonly Move[]) => string, key: string): ResultLine {
  const text = seq.length ? fmt(seq) : '(already matches)'
  const names = seq.map((m) => m.name)
  const label = seq.length ? (algsKnown.lookup(names) || userAlgs.lookup(names)) : null
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

export function namesToMoves(names: readonly string[]): Move[] {
  return names.map((n) => MOVE_REGISTRY[n]).filter(Boolean)
}

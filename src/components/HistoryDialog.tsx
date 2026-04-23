import { useMemo, useState } from 'react'
import { Modal } from './Modal'
import * as solutionsLog from '../storage/solutions'
import { formatSequenceGrouped, formatSequence } from '../cube/notation'
import { namesToMoves } from './Results'
import { createCube, type CubeSpec, type CubeState } from '../cube/cube'

interface Props {
  cube: CubeSpec
  sizes: readonly number[]
  open: boolean
  onClose: () => void
  grouped: boolean
  onLoadStart: (s: CubeState, N: number) => void
  onLoadTarget: (s: CubeState, N: number) => void
  onLoadBoth: (s: CubeState, t: CubeState, N: number) => void
}

export function HistoryDialog({ cube, sizes, open, onClose, grouped, onLoadStart, onLoadTarget, onLoadBoth }: Props) {
  const [version, setVersion] = useState(0)
  const [sel, setSel] = useState(0)
  const records = useMemo(() => {
    const all = solutionsLog.loadAllSizes(sizes)
    all.sort((a, b) => b.timestamp.localeCompare(a.timestamp))
    return all
  }, [sizes, version, open])
  const safeSel = Math.min(sel, Math.max(0, records.length - 1))
  const rec = records[safeSel]
  const recN = rec?.cubeSize ?? cube.N
  const recCube = useMemo(() => createCube(recN), [recN])

  if (!open) return null
  if (!records.length) {
    return (
      <Modal title="Search history" onClose={onClose} footer={<button onClick={onClose}>Close</button>}>
        <div className="status">No saved searches.</div>
      </Modal>
    )
  }

  const fmt = grouped ? formatSequenceGrouped : formatSequence

  const summary = (r: solutionsLog.SolutionRecordWithSize) => {
    const shortest = Math.min(...(r.solutions.map((s) => s.length).concat(r.solutions.length ? [] : [0])))
    return `[${r.cubeSize}x${r.cubeSize}] ${r.timestamp}  ·  ${r.solutions.length} sol · min ${isFinite(shortest) ? shortest : 0}`
  }

  const doDelete = () => {
    if (!confirm('Delete this record?')) return
    const sizeRecords = solutionsLog.loadAll(rec.cubeSize)
    const localIdx = sizeRecords.findIndex(r => r.timestamp === rec.timestamp && JSON.stringify(r.start) === JSON.stringify(rec.start))
    if (localIdx >= 0) solutionsLog.deleteRecord(rec.cubeSize, localIdx)
    setVersion(v => v + 1)
    setSel(Math.min(sel, Math.max(0, records.length - 2)))
  }

  const sizeMatches = rec.cubeSize === cube.N
  const mismatchNote = sizeMatches ? null : (
    <span className="hint" style={{ marginLeft: 8 }}>
      (load disabled — active cube is {cube.N}x{cube.N})
    </span>
  )

  return (
    <Modal
      title="Search history"
      onClose={onClose}
      minWidth={700}
      footer={
        <>
          <button onClick={() => onLoadStart(rec.start, rec.cubeSize)} disabled={!sizeMatches}>Load Start</button>
          <button onClick={() => onLoadTarget(rec.target, rec.cubeSize)} disabled={!sizeMatches}>Load Target</button>
          <button onClick={() => onLoadBoth(rec.start, rec.target, rec.cubeSize)} disabled={!sizeMatches}>Load Both</button>
          <button onClick={doDelete}>Delete</button>
          <button onClick={onClose}>Close</button>
          {mismatchNote}
        </>
      }
    >
      <div style={{ display: 'flex', gap: 10, minHeight: 300 }}>
        <div className="listbox" style={{ width: 340, maxHeight: 400 }}>
          {records.map((r, i) => (
            <div
              key={i}
              className={`listbox-item${i === safeSel ? ' selected' : ''}`}
              onClick={() => setSel(i)}
            >
              {summary(r)}
            </div>
          ))}
        </div>
        <div className="listbox" style={{ flex: 1, maxHeight: 400 }}>
          {rec.solutions.length === 0 && <div className="listbox-item">(no solutions)</div>}
          {rec.solutions.map((names, i) => {
            const seq = namesToMoves(recCube, names)
            const text = seq.length === names.length ? fmt(seq) : names.join(' ')
            return (
              <div key={i} className="listbox-item">
                ({names.length})  {text}
              </div>
            )
          })}
        </div>
      </div>
    </Modal>
  )
}

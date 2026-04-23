import { useState } from 'react'
import { Modal } from './Modal'
import * as solutionsLog from '../storage/solutions'
import { formatSequenceGrouped, formatSequence } from '../cube/notation'
import { namesToMoves } from './Results'
import type { CubeState } from '../cube/cube'

interface Props {
  open: boolean
  onClose: () => void
  grouped: boolean
  onLoadStart: (s: CubeState) => void
  onLoadTarget: (s: CubeState) => void
  onLoadBoth: (s: CubeState, t: CubeState) => void
}

export function HistoryDialog({ open, onClose, grouped, onLoadStart, onLoadTarget, onLoadBoth }: Props) {
  const [records, setRecords] = useState(() => solutionsLog.loadAll())
  const [sel, setSel] = useState(0)

  if (!open) return null
  if (!records.length) {
    return (
      <Modal title="History" onClose={onClose} footer={<button onClick={onClose}>Close</button>}>
        <div className="status">No saved searches.</div>
      </Modal>
    )
  }

  const rec = records[Math.min(sel, records.length - 1)]
  const fmt = grouped ? formatSequenceGrouped : formatSequence

  const summary = (r: solutionsLog.SolutionRecord) => {
    const shortest = Math.min(...(r.solutions.map((s) => s.length).concat(r.solutions.length ? [] : [0])))
    return `${r.timestamp}  ·  ${r.solutions.length} sol · min ${isFinite(shortest) ? shortest : 0}`
  }

  const doDelete = () => {
    if (!confirm('Delete this record?')) return
    solutionsLog.deleteRecord(sel)
    const next = solutionsLog.loadAll()
    setRecords(next)
    setSel(Math.min(sel, Math.max(0, next.length - 1)))
  }

  const getCurrent = () => records[sel]

  return (
    <Modal
      title="Search history"
      onClose={onClose}
      minWidth={700}
      footer={
        <>
          <button onClick={() => onLoadStart(getCurrent().start)}>Load Start</button>
          <button onClick={() => onLoadTarget(getCurrent().target)}>Load Target</button>
          <button onClick={() => onLoadBoth(getCurrent().start, getCurrent().target)}>Load Both</button>
          <button onClick={doDelete}>Delete</button>
          <button onClick={onClose}>Close</button>
        </>
      }
    >
      <div style={{ display: 'flex', gap: 10, minHeight: 300 }}>
        <div className="listbox" style={{ width: 300, maxHeight: 400 }}>
          {records.map((r, i) => (
            <div
              key={i}
              className={`listbox-item${i === sel ? ' selected' : ''}`}
              onClick={() => setSel(i)}
            >
              {summary(r)}
            </div>
          ))}
        </div>
        <div className="listbox" style={{ flex: 1, maxHeight: 400 }}>
          {rec.solutions.length === 0 && <div className="listbox-item">(no solutions)</div>}
          {rec.solutions.map((names, i) => {
            const seq = namesToMoves(names)
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

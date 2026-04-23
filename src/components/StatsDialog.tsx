import { useState } from 'react'
import { Modal } from './Modal'
import * as stats from '../storage/stats'

interface Props {
  open: boolean
  onClose: () => void
}

interface Row {
  method: string
  depth: number
  movesCount: number
  cancelled: boolean
  runs: number
  avgS: number
  avgNodes: number
  found: number
}

function aggregate(entries: stats.StatEntry[]): Row[] {
  const map = new Map<string, { method: string; depth: number; movesCount: number; cancelled: boolean; count: number; totalS: number; totalNodes: number; found: number }>()
  for (const e of entries) {
    const key = `${e.method}|${e.maxDepth}|${e.allowedMoves.length}|${e.cancelled ? 1 : 0}`
    let agg = map.get(key)
    if (!agg) {
      agg = { method: e.method, depth: e.maxDepth, movesCount: e.allowedMoves.length, cancelled: e.cancelled, count: 0, totalS: 0, totalNodes: 0, found: 0 }
      map.set(key, agg)
    }
    agg.count++
    agg.totalS += e.elapsedS || 0
    agg.totalNodes += e.nodes || 0
    agg.found += e.found || 0
  }
  const rows: Row[] = []
  for (const a of map.values()) {
    rows.push({
      method: a.method,
      depth: a.depth,
      movesCount: a.movesCount,
      cancelled: a.cancelled,
      runs: a.count,
      avgS: a.totalS / a.count,
      avgNodes: Math.floor(a.totalNodes / a.count),
      found: a.found,
    })
  }
  rows.sort((a, b) => a.method.localeCompare(b.method) || a.depth - b.depth || a.movesCount - b.movesCount)
  return rows
}

export function StatsDialog({ open, onClose }: Props) {
  const [, setVersion] = useState(0)

  if (!open) return null
  const entries = stats.loadAll()
  const rows = aggregate(entries)

  const clearAll = () => {
    if (!confirm('Erase all logged stats?')) return
    stats.clearAll()
    setVersion((v) => v + 1)
  }

  const col = (label: string, w: number, align: 'left' | 'right' = 'left') =>
    <span style={{ display: 'inline-block', width: w, textAlign: align }}>{label}</span>

  return (
    <Modal
      title={`Search stats (${entries.length} runs)`}
      onClose={onClose}
      minWidth={720}
      footer={
        <>
          <button onClick={clearAll}>Clear all</button>
          <button onClick={onClose}>Close</button>
        </>
      }
    >
      {entries.length === 0 ? (
        <div className="status">No search stats logged yet.</div>
      ) : (
        <div className="listbox" style={{ maxHeight: 500, fontSize: 12 }}>
          <div className="listbox-item" style={{ color: 'var(--fg-dim)' }}>
            {col('method', 90)} {col('depth', 50, 'right')} {col('moves', 50, 'right')} {col('cnc', 40, 'right')} {col('runs', 50, 'right')} {col('avg s', 70, 'right')} {col('avg nodes', 100, 'right')} {col('found', 60, 'right')}
          </div>
          {rows.map((r, i) => (
            <div key={i} className="listbox-item">
              {col(r.method, 90)}
              {col(String(r.depth), 50, 'right')}
              {col(String(r.movesCount), 50, 'right')}
              {col(r.cancelled ? 'Y' : 'N', 40, 'right')}
              {col(String(r.runs), 50, 'right')}
              {col(r.avgS.toFixed(3), 70, 'right')}
              {col(r.avgNodes.toLocaleString(), 100, 'right')}
              {col(String(r.found), 60, 'right')}
            </div>
          ))}
        </div>
      )}
    </Modal>
  )
}

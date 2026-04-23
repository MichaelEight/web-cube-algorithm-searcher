import { useState } from 'react'
import { Modal } from './Modal'
import * as states from '../storage/states'
import type { CubeState } from '../cube/cube'

interface Props {
  open: boolean
  onClose: () => void
  onLoad: (state: CubeState) => void
}

export function LoadStateDialog({ open, onClose, onLoad }: Props) {
  const [data, setData] = useState(() => states.loadAll())
  const names = Object.keys(data).sort()
  const [sel, setSel] = useState(0)

  if (!open) return null
  if (!names.length) {
    return (
      <Modal title="Load state" onClose={onClose} footer={<button onClick={onClose}>Close</button>}>
        <div className="status">No saved states.</div>
      </Modal>
    )
  }

  const doLoad = () => {
    const name = names[sel]
    if (name) onLoad(data[name])
    onClose()
  }

  const doDelete = () => {
    const name = names[sel]
    if (!name) return
    if (!confirm(`Delete state ${JSON.stringify(name)}?`)) return
    states.deleteState(name)
    const next = states.loadAll()
    setData(next)
    setSel(Math.min(sel, Math.max(0, Object.keys(next).length - 1)))
  }

  return (
    <Modal
      title="Load state"
      onClose={onClose}
      footer={
        <>
          <button onClick={doLoad} className="accent">Load</button>
          <button onClick={doDelete}>Delete</button>
          <button onClick={onClose}>Cancel</button>
        </>
      }
    >
      <div className="listbox" style={{ minWidth: 300 }}>
        {names.map((n, i) => (
          <div
            key={n}
            className={`listbox-item${i === sel ? ' selected' : ''}`}
            onClick={() => setSel(i)}
            onDoubleClick={() => { setSel(i); setTimeout(doLoad, 0) }}
          >
            {n}
          </div>
        ))}
      </div>
    </Modal>
  )
}

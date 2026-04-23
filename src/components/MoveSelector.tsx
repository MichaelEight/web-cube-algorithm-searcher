import { useRef } from 'react'
import { ALL_MOVES, type MoveCategory } from '../cube/cube'

export type MoveToggles = Record<string, boolean>

interface Props {
  toggles: MoveToggles
  setToggles: (t: MoveToggles) => void
}

interface CategorySpec {
  key: MoveCategory
  label: string
  faces: string[]
  twoColumns: boolean
}

const CATEGORIES: CategorySpec[] = [
  { key: 'htm', label: 'HTM', faces: ['U', 'D', 'L', 'R', 'F', 'B'], twoColumns: true },
  { key: 'wide', label: 'Wide', faces: ['Uw', 'Dw', 'Lw', 'Rw', 'Fw', 'Bw'], twoColumns: true },
  { key: 'slice', label: 'Slice', faces: ['M', 'E', 'S'], twoColumns: false },
  { key: 'rotation', label: 'Rotations', faces: ['x', 'y', 'z'], twoColumns: false },
]

export function buildDefaultToggles(): MoveToggles {
  const t: MoveToggles = {}
  for (const m of ALL_MOVES) t[m.name] = m.category === 'htm'
  return t
}

interface CategoryCardProps {
  spec: CategorySpec
  toggles: MoveToggles
  setToggles: (t: MoveToggles) => void
}

function CategoryCard({ spec, toggles, setToggles }: CategoryCardProps) {
  const headerRef = useRef<HTMLInputElement>(null)
  const faceNames = spec.faces.flatMap((f) => ['', "'", '2'].map((s) => f + s))
  const onCount = faceNames.filter((n) => toggles[n]).length
  const allOn = onCount === faceNames.length
  const partialOn = onCount > 0 && !allOn
  if (headerRef.current) headerRef.current.indeterminate = partialOn

  const toggleAll = () => {
    const next = { ...toggles }
    const target = !allOn
    for (const n of faceNames) next[n] = target
    setToggles(next)
  }

  const togglePill = (name: string) => {
    setToggles({ ...toggles, [name]: !toggles[name] })
  }

  return (
    <div className="cat-card">
      <label className="cat-header">
        <input
          ref={headerRef}
          type="checkbox"
          checked={allOn}
          onChange={toggleAll}
        />
        <strong>{spec.label}</strong>
        <span className="cat-count">{onCount}/{faceNames.length}</span>
      </label>
      <div className={`face-grid${spec.twoColumns ? ' cols-2' : ''}`}>
        {spec.faces.map((face) => (
          <div className="face-group" key={face}>
            {['', "'", '2'].map((suffix) => {
              const name = face + suffix
              return (
                <button
                  key={name}
                  type="button"
                  className={`move-pill${toggles[name] ? ' on' : ''}`}
                  onClick={() => togglePill(name)}
                >
                  {name}
                </button>
              )
            })}
          </div>
        ))}
      </div>
    </div>
  )
}

export function MoveSelector({ toggles, setToggles }: Props) {
  const preset = (faceLetters: string[]) => {
    const next = { ...toggles }
    for (const m of ALL_MOVES) {
      const base = m.name.replace(/['2]$/, '')
      next[m.name] = faceLetters.includes(base)
    }
    setToggles(next)
  }

  const presetDoubles = () => {
    const doubles = new Set(['U2', 'D2', 'R2', 'L2', 'F2', 'B2', 'M2', 'E2', 'S2'])
    const next: MoveToggles = {}
    for (const m of ALL_MOVES) next[m.name] = doubles.has(m.name)
    setToggles(next)
  }

  return (
    <div className="panel move-selector-panel">
      <div className="panel-title">Allowed moves</div>

      <div className="presets-row">
        <span className="presets-label">Presets:</span>
        <button onClick={() => preset(['R', 'U'])}>R / U</button>
        <button onClick={() => preset(['R', 'U', 'F'])}>R U F</button>
        <button onClick={() => preset(['R', 'U', 'L'])}>R U L</button>
        <button onClick={() => preset(['R', 'U', 'L', 'F'])}>R U L F</button>
        <button onClick={() => preset(['U', 'D', 'L', 'R', 'F', 'B'])}>All HTM</button>
        <button onClick={presetDoubles}>Doubles only</button>
      </div>

      <div className="categories-grid">
        {CATEGORIES.map((spec) => (
          <CategoryCard key={spec.key} spec={spec} toggles={toggles} setToggles={setToggles} />
        ))}
      </div>
    </div>
  )
}

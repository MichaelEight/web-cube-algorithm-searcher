import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  ALL_MOVES,
  ANY,
  BLANK,
  FACE_COLOR,
  FACE_INDEX_OFFSET,
  MOVE_REGISTRY,
  SOLVED,
  W,
  apply,
  applySequence,
  type CubeState,
  type Move,
} from './cube/cube'
import { parseSequence } from './cube/notation'
import { findAlgorithms, findAlgorithmsBidir } from './cube/search'
import { findAlgorithmsParallel } from './cube/parallel'
import { simplifyAndDedupe } from './cube/simplify'
import { CubeNet } from './components/CubeNet'
import { Cube3D } from './components/Cube3D'
import { Palette, PALETTE } from './components/Palette'
import { MoveSelector, buildDefaultToggles, type MoveToggles } from './components/MoveSelector'
import { HistoryDialog } from './components/HistoryDialog'
import { StatsDialog } from './components/StatsDialog'
import { LoadStateDialog } from './components/LoadStateDialog'
import { ResultsList, buildResultLines, type ResultLine } from './components/Results'
import * as statesStore from './storage/states'
import * as solutionsStore from './storage/solutions'
import * as statsStore from './storage/stats'
import * as userAlgs from './storage/userAlgs'

type Method = 'iddfs' | 'bidir' | 'parallel'

const MOVE_KEY_MAP: Record<string, string> = {
  r: 'R', l: 'L', u: 'U', d: 'D', f: 'F', b: 'B',
  m: 'M', e: 'E', s: 'S',
  x: 'x', y: 'y', z: 'z',
}

function useViewport(): { w: number; h: number } {
  const [v, setV] = useState(() => ({
    w: typeof window !== 'undefined' ? window.innerWidth : 1280,
    h: typeof window !== 'undefined' ? window.innerHeight : 800,
  }))
  useEffect(() => {
    const on = () => setV({ w: window.innerWidth, h: window.innerHeight })
    window.addEventListener('resize', on)
    return () => window.removeEventListener('resize', on)
  }, [])
  return v
}

function clearState(): CubeState {
  const s = [...BLANK]
  for (const [face, off] of Object.entries(FACE_INDEX_OFFSET)) {
    s[off + 4] = FACE_COLOR[face]
  }
  return s
}

export default function App() {
  const viewport = useViewport()
  const cubeDims = useMemo(() => {
    // Fit cube net into viewport: pick sticker size so 3 nets stack fits row height ~45% viewport
    const maxNetHeight = Math.max(140, Math.min(260, viewport.h * 0.36))
    // net height = 9 * sticker + 6 gap + 2 face_gap = 9s + 8 (with gap=2, face_gap=4)
    const sticker = Math.max(12, Math.min(24, Math.floor((maxNetHeight - 8) / 9)))
    const scale3d = Math.max(14, Math.min(26, Math.floor(sticker * 1.15)))
    return { sticker, scale3d }
  }, [viewport.h])

  const [startState, setStartState] = useState<CubeState>(() => [...SOLVED])
  const [targetState, setTargetState] = useState<CubeState>(() => [...SOLVED])
  const [selectedColor, setSelectedColor] = useState<number>(W)
  const [toggles, setToggles] = useState<MoveToggles>(() => buildDefaultToggles())
  const [maxDepth, setMaxDepth] = useState(10)
  const [maxSolutions, setMaxSolutions] = useState(1)
  const [groupTerms, setGroupTerms] = useState(true)
  const [showAlts, setShowAlts] = useState(false)
  const [method, setMethod] = useState<Method>('parallel')
  const [status, setStatus] = useState('Ready.')
  const [depthText, setDepthText] = useState('')
  const [progressPct, setProgressPct] = useState(0)
  const [lastSolutions, setLastSolutions] = useState<Move[][]>([])
  const [selectedResult, setSelectedResult] = useState<number | null>(null)
  const [searching, setSearching] = useState(false)
  const [showHistory, setShowHistory] = useState(false)
  const [showStats, setShowStats] = useState(false)
  const [loadTarget, setLoadTarget] = useState<'start' | 'target' | null>(null)
  const [activeCube, setActiveCube] = useState<'start' | 'target'>('start')
  const [startMovesText, setStartMovesText] = useState('')
  const [startMovesStatus, setStartMovesStatus] = useState('')
  const [targetMovesText, setTargetMovesText] = useState('')
  const [targetMovesStatus, setTargetMovesStatus] = useState('')

  const cancelRef = useRef<{ cancelled: boolean } | null>(null)
  const estBranchingRef = useRef(1)
  const currentDepthRef = useRef(0)
  const depthNodesStartRef = useRef(0)
  const progressRef = useRef({ depth: 0, nodes: 0, found: 0, dirty: false })

  useEffect(() => {
    if (!searching) return
    const tick = setInterval(() => {
      const p = progressRef.current
      if (!p.dirty) return
      p.dirty = false
      if (p.depth !== currentDepthRef.current) {
        currentDepthRef.current = p.depth
        depthNodesStartRef.current = p.nodes
      }
      const estTotal = Math.pow(estBranchingRef.current, Math.max(1, p.depth))
      const inDepth = Math.max(0, p.nodes - depthNodesStartRef.current)
      const pct = Math.min(100, 100 * inDepth / Math.max(1, estTotal))
      setStatus(`Searching… Depth ${p.depth}/${maxDepth} · ${p.nodes.toLocaleString()} nodes · ${p.found} found`)
      setDepthText(`${pct.toFixed(1)}% of est. depth-${p.depth} space`)
      setProgressPct(pct)
    }, 120)
    return () => clearInterval(tick)
  }, [searching, maxDepth])

  const lines: ResultLine[] = buildResultLines(lastSolutions, groupTerms, showAlts)

  const collectAllowed = useCallback((): Move[] => ALL_MOVES.filter((m) => toggles[m.name]), [toggles])

  const applyMoves = (target: 'start' | 'target') => {
    const isStart = target === 'start'
    const text = (isStart ? startMovesText : targetMovesText).trim()
    if (!text) return
    try {
      const seq = parseSequence(text)
      const current = isStart ? startState : targetState
      const next = applySequence(current, seq)
      if (isStart) { setStartState(next); setStartMovesStatus(`Applied ${seq.length} move(s).`); setStartMovesText('') }
      else { setTargetState(next); setTargetMovesStatus(`Applied ${seq.length} move(s).`); setTargetMovesText('') }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      if (isStart) setStartMovesStatus(msg); else setTargetMovesStatus(msg)
    }
  }

  const scramble = (which: 'start' | 'target') => {
    const text = prompt('Move sequence (applied to solved):')
    if (!text) return
    try {
      const seq = parseSequence(text)
      const next = applySequence(SOLVED, seq)
      if (which === 'start') setStartState(next); else setTargetState(next)
    } catch (e) {
      alert(e instanceof Error ? e.message : String(e))
    }
  }

  const saveStatePrompt = (which: 'start' | 'target') => {
    const name = prompt('Name:')
    if (!name) return
    const trimmed = name.trim()
    if (!trimmed) return
    const existing = statesStore.loadAll()
    if (trimmed in existing && !confirm(`State ${JSON.stringify(trimmed)} exists. Overwrite?`)) return
    statesStore.saveState(trimmed, which === 'start' ? startState : targetState)
  }

  const renderFinal = useCallback((sols: Move[][], elapsed: number, nodes: number, cancelled: boolean) => {
    setSelectedResult(null)
    const statsLine = `${elapsed.toFixed(2)}s, ${nodes.toLocaleString()} combos`
    if (!sols.length) {
      setLastSolutions([])
      setStatus(cancelled ? `Cancelled. ${statsLine}` : `No algorithm up to depth ${maxDepth}. ${statsLine}`)
      setProgressPct(0)
      return
    }
    const simplified = simplifyAndDedupe(sols)
    const raw = sols.length
    const dropped = raw - simplified.length
    setLastSolutions(simplified)
    const dedupeNote = dropped > 0 ? `, ${dropped} dedup.` : ''
    setStatus(`Found ${simplified.length} algorithm(s)${dedupeNote}. Shortest: ${simplified[0].length} moves. ${statsLine}`)
    setProgressPct(100)
  }, [maxDepth])

  const startSearch = async () => {
    if (searching) return
    const allowed = collectAllowed()
    if (!allowed.length) { setStatus('Select at least one move.'); return }

    let chosen: Method = method
    if (chosen === 'bidir' && targetState.some((v) => v === ANY)) {
      setStatus('Bidir needs concrete target — falling back to IDDFS.')
      chosen = 'iddfs'
    }

    setLastSolutions([])
    setSelectedResult(null)
    setProgressPct(0)
    setDepthText('')
    setStatus('Searching… depth 0')
    setSearching(true)

    estBranchingRef.current = Math.max(2.0, allowed.length * 0.75)
    currentDepthRef.current = 0
    depthNodesStartRef.current = 0
    progressRef.current = { depth: 0, nodes: 0, found: 0, dirty: false }

    const cancel = { cancelled: false }
    cancelRef.current = cancel
    const t0 = performance.now()
    let lastNodes = 0
    const liveSols: Move[][] = []

    const onProgress = (depth: number, nodes: number, found: number) => {
      lastNodes = nodes
      progressRef.current = { depth, nodes, found, dirty: true }
    }

    const onSol = (path: readonly Move[]) => {
      liveSols.push([...path])
      setLastSolutions(simplifyAndDedupe(liveSols))
    }

    try {
      let result: { solutions: Move[][]; nodes: number }
      if (chosen === 'bidir') {
        result = findAlgorithmsBidir(startState, targetState, allowed, {
          maxDepth, maxSolutions, cancel, progressCb: onProgress, onSolution: onSol,
        })
      } else if (chosen === 'parallel') {
        result = await findAlgorithmsParallel(startState, targetState, allowed, {
          maxDepth, maxSolutions, cancel, progressCb: onProgress, onSolution: onSol,
        })
      } else {
        result = findAlgorithms(startState, targetState, allowed, {
          maxDepth, maxSolutions, cancel, progressCb: onProgress, onSolution: onSol,
        })
      }
      const elapsed = (performance.now() - t0) / 1000
      const sols = result.solutions
      const nodes = Math.max(result.nodes, lastNodes)
      renderFinal(sols, elapsed, nodes, cancel.cancelled)

      const allowedNames = allowed.map((m) => m.name)
      const shortest = sols.length ? Math.min(...sols.map((s) => s.length)) : null
      statsStore.logEntry({
        method: chosen,
        allowedMoves: allowedNames,
        maxDepth,
        elapsedS: Math.round(elapsed * 1000) / 1000,
        nodes,
        found: sols.length,
        shortestLen: shortest,
        cancelled: cancel.cancelled,
      })
      if (sols.length && !(sols.length === 1 && sols[0].length === 0)) {
        solutionsStore.appendRecord(
          startState,
          targetState,
          sols.map((s) => s.map((m) => m.name)),
          allowedNames,
        )
      }
    } catch (e) {
      setStatus(`Error: ${e instanceof Error ? e.message : String(e)}`)
    } finally {
      setSearching(false)
      cancelRef.current = null
    }
  }

  const cancelSearch = useCallback(() => {
    if (cancelRef.current) cancelRef.current.cancelled = true
  }, [])

  const copyToClipboard = (seq: Move[]) => {
    const text = seq.map((m) => m.name).join(' ')
    navigator.clipboard?.writeText(text).then(() => setStatus(`Copied: ${text}`)).catch(() => {})
  }

  const copySelected = () => {
    if (selectedResult === null) return
    const seq = lines[selectedResult]?.seq
    if (seq) copyToClipboard(seq)
  }

  const saveSelectedAlg = () => {
    if (selectedResult === null) { alert('Select a result first.'); return }
    const seq = lines[selectedResult]?.seq
    if (!seq || !seq.length) return
    const name = prompt('Save algorithm as:')
    if (!name) return
    const trimmed = name.trim()
    if (!trimmed) return
    const existing = userAlgs.loadAll()
    if (trimmed in existing && !confirm(`Algorithm ${JSON.stringify(trimmed)} exists. Overwrite?`)) return
    userAlgs.saveAlg(trimmed, seq.map((m) => m.name))
    setLastSolutions((prev) => [...prev])
  }

  const swap = () => {
    const a = startState, b = targetState
    setStartState(b)
    setTargetState(a)
  }

  const startStateRef = useRef(startState)
  const targetStateRef = useRef(targetState)
  const activeCubeRef = useRef(activeCube)
  startStateRef.current = startState
  targetStateRef.current = targetState
  activeCubeRef.current = activeCube

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && searching) { cancelSearch(); return }
      const tgt = e.target as HTMLElement | null
      const tagName = tgt?.tagName
      if (tagName === 'INPUT' || tagName === 'TEXTAREA' || tgt?.isContentEditable) return

      const code = e.code
      if (code.startsWith('Digit')) {
        const n = parseInt(code.slice(5), 10)
        if (n >= 1 && n <= PALETTE.length) {
          setSelectedColor(PALETTE[n - 1])
          e.preventDefault()
          return
        }
      }

      const base = MOVE_KEY_MAP[e.key.toLowerCase()]
      if (!base) return
      let name = base
      if (e.altKey) name = base + '2'
      else if (e.shiftKey) name = base + "'"
      const mv = MOVE_REGISTRY[name]
      if (!mv) return
      e.preventDefault()
      if (activeCubeRef.current === 'start') {
        setStartState(apply(startStateRef.current, mv))
      } else {
        setTargetState(apply(targetStateRef.current, mv))
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [searching, cancelSearch])

  const stickerSize = cubeDims.sticker
  const cube3dScale = cubeDims.scale3d

  return (
    <div className="app">
      <div className="cube-nets">
        <div className={`cube-frame three-d${activeCube === 'start' ? ' active' : ''}`}>
          <Cube3D state={startState} scale={cube3dScale} onActivate={() => setActiveCube('start')} />
        </div>
        <div className="cube-col">
          <div className="cube-col-header">
            <div className="title">Start</div>
            <div className="row" style={{ gap: 4 }}>
              <button onClick={() => setStartState([...SOLVED])}>Solved</button>
              <button onClick={() => setStartState(clearState())}>Clear</button>
              <button onClick={swap} title="Swap start/target">⇄</button>
            </div>
          </div>
          <CubeNet
            state={startState}
            onChange={setStartState}
            selectedColor={selectedColor}
            stickerSize={stickerSize}
            onActivate={() => setActiveCube('start')}
          />
          <div className="row" style={{ gap: 4 }}>
            <button onClick={() => scramble('start')}>Scramble…</button>
            <button onClick={() => saveStatePrompt('start')}>Save…</button>
            <button onClick={() => setLoadTarget('start')}>Load…</button>
          </div>
          <div className="row">
            <input
              type="text"
              placeholder="R U R' U' …"
              value={startMovesText}
              onChange={(e) => setStartMovesText(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') applyMoves('start') }}
              style={{ flex: 1, minWidth: 0 }}
            />
            <button onClick={() => applyMoves('start')}>Apply</button>
          </div>
          {startMovesStatus && <div className="status">{startMovesStatus}</div>}
        </div>

        <div className="palette-column">
          <div className="palette-title">Paint</div>
          <Palette active={selectedColor} onSelect={setSelectedColor} direction="vertical" />
          <div className="palette-hint">
            L-click: paint<br />
            R-click: ?<br />
            Keys 1–7<br />
            <span className="active-cube-tag">active: {activeCube}</span>
          </div>
        </div>

        <div className="cube-col">
          <div className="cube-col-header">
            <div className="title">Target <span className="hint">(gray = don't care)</span></div>
            <div className="row" style={{ gap: 4 }}>
              <button onClick={() => setTargetState([...SOLVED])}>Solved</button>
              <button onClick={() => setTargetState(clearState())}>Clear</button>
              <button onClick={() => setTargetState([...startState])} title="Copy from start">← Start</button>
            </div>
          </div>
          <CubeNet
            state={targetState}
            onChange={setTargetState}
            selectedColor={selectedColor}
            stickerSize={stickerSize}
            onActivate={() => setActiveCube('target')}
          />
          <div className="row" style={{ gap: 4 }}>
            <button onClick={() => scramble('target')}>Scramble…</button>
            <button onClick={() => saveStatePrompt('target')}>Save…</button>
            <button onClick={() => setLoadTarget('target')}>Load…</button>
          </div>
          <div className="row">
            <input
              type="text"
              placeholder="R U R' U' …"
              value={targetMovesText}
              onChange={(e) => setTargetMovesText(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') applyMoves('target') }}
              style={{ flex: 1, minWidth: 0 }}
            />
            <button onClick={() => applyMoves('target')}>Apply</button>
          </div>
          {targetMovesStatus && <div className="status">{targetMovesStatus}</div>}
        </div>
        <div className={`cube-frame three-d${activeCube === 'target' ? ' active' : ''}`}>
          <Cube3D state={targetState} scale={cube3dScale} onActivate={() => setActiveCube('target')} />
        </div>
      </div>

      <div className="bottom-grid">
        <MoveSelector toggles={toggles} setToggles={setToggles} />

        <div className="panel">
          <div className="panel-title">Search</div>
          <div className="row" style={{ gap: 12 }}>
            <label className="field-label">
              Max length:
              <input
                type="number"
                min={1}
                max={14}
                value={maxDepth}
                onChange={(e) => setMaxDepth(Math.max(1, Math.min(14, parseInt(e.target.value || '0', 10) || 1)))}
                style={{ width: 60 }}
              />
            </label>
            <label className="field-label">
              Max solutions:
              <input
                type="number"
                min={1}
                max={50}
                value={maxSolutions}
                onChange={(e) => setMaxSolutions(Math.max(1, Math.min(50, parseInt(e.target.value || '0', 10) || 1)))}
                style={{ width: 60 }}
              />
            </label>
          </div>

          <div className="row" style={{ marginTop: 4 }}>
            <label className="check-label">
              <input type="checkbox" checked={groupTerms} onChange={(e) => setGroupTerms(e.target.checked)} />
              Group (A B A' B')
            </label>
            <label className="check-label">
              <input type="checkbox" checked={showAlts} onChange={(e) => setShowAlts(e.target.checked)} />
              Alts (inv, mir)
            </label>
          </div>

          <div className="row" style={{ marginTop: 4 }}>
            <span className="check-label">Method:</span>
            <div className="tooltip-wrap">
              <select value={method} onChange={(e) => setMethod(e.target.value as Method)}>
                <option value="iddfs">iddfs</option>
                <option value="bidir">bidir (concrete target)</option>
                <option value="parallel">parallel</option>
              </select>
              <div className="tooltip">
                {`iddfs — default. Supports don't-care targets.
bidir — full target only. Big speedup at depth 9+.
parallel — multi-worker DFS. Deep HTM exhaustive.`}
              </div>
            </div>
          </div>

          <div className="row" style={{ marginTop: 6 }}>
            <button className="accent" onClick={startSearch} disabled={searching}>Search</button>
            <button onClick={cancelSearch} disabled={!searching}>Cancel</button>
            <button onClick={() => setShowHistory(true)}>History…</button>
            <button onClick={() => setShowStats(true)}>Stats…</button>
          </div>

          <div className="progress" style={{ marginTop: 6 }}>
            <div className="progress-bar" style={{ width: `${progressPct}%` }} />
          </div>
          <div className="status" style={{ marginTop: 2 }}>{depthText}</div>
          <div className="status" style={{ whiteSpace: 'pre-wrap', flex: 1, overflow: 'auto', minHeight: 0 }}>{status}</div>
        </div>

        <div className="panel results-panel">
          <div className="row" style={{ justifyContent: 'space-between' }}>
            <div className="panel-title">Results (shortest first)</div>
            <div className="row" style={{ gap: 3 }}>
              <button onClick={copySelected} disabled={selectedResult === null}>Copy</button>
              <button onClick={saveSelectedAlg} disabled={selectedResult === null}>Save…</button>
            </div>
          </div>
          <ResultsList
            lines={lines}
            selectedIdx={selectedResult}
            onSelect={setSelectedResult}
            onCopy={copyToClipboard}
          />
          <div className="hint" style={{ marginTop: 4 }}>Double-click copies to clipboard.</div>
        </div>
      </div>

      <HistoryDialog
        open={showHistory}
        onClose={() => setShowHistory(false)}
        grouped={groupTerms}
        onLoadStart={(s) => { setStartState(s); setShowHistory(false) }}
        onLoadTarget={(s) => { setTargetState(s); setShowHistory(false) }}
        onLoadBoth={(s, t) => { setStartState(s); setTargetState(t); setShowHistory(false) }}
      />
      <StatsDialog open={showStats} onClose={() => setShowStats(false)} />
      <LoadStateDialog
        open={loadTarget !== null}
        onClose={() => setLoadTarget(null)}
        onLoad={(s) => {
          if (loadTarget === 'start') setStartState(s)
          else if (loadTarget === 'target') setTargetState(s)
        }}
      />
    </div>
  )
}

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  ANY,
  W,
  createCube,
  type CubeSpec,
  type CubeState,
  type Move,
} from './cube/cube'
import { parseSequence } from './cube/notation'
import { findAlgorithmsParallel } from './cube/parallel'
import { findAlgorithmsInWorker } from './cube/singleWorker'
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
import * as sessionStore from './storage/session'

type Method = 'iddfs' | 'bidir' | 'parallel'
type CubeSize = 2 | 3 | 4

const CUBE_SIZES: readonly CubeSize[] = [2, 3, 4]
const DEFAULT_SIZE: CubeSize = 3
const SIZE_STORAGE_KEY = 'cube-alg-search:cube-size'

const BASE_MOVE_KEY_MAP: Record<string, string> = {
  r: 'R', l: 'L', u: 'U', d: 'D', f: 'F', b: 'B',
  m: 'M', e: 'E', s: 'S',
  x: 'x', y: 'y', z: 'z',
}

function buildMoveKeyMap(cube: CubeSpec): Record<string, string> {
  const out: Record<string, string> = {}
  for (const [k, name] of Object.entries(BASE_MOVE_KEY_MAP)) {
    if (cube.MOVE_REGISTRY[name]) out[k] = name
  }
  return out
}

function formatBytes(n: number): string {
  if (n >= 1024 * 1024 * 1024) return `${(n / (1024 * 1024 * 1024)).toFixed(2)} GB`
  if (n >= 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(1)} MB`
  if (n >= 1024) return `${(n / 1024).toFixed(1)} KB`
  return `${n} B`
}

const MAX_DEPTH_LIMIT = 30
const MAX_SOLUTIONS_LIMIT = 50

function parseIntInRange(s: string, min: number, max: number): number | null {
  if (!/^\d+$/.test(s.trim())) return null
  const n = parseInt(s, 10)
  if (!Number.isFinite(n) || n < min || n > max) return null
  return n
}

function formatDuration(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '—'
  if (seconds > 60 * 60 * 24) return '> 1 day'
  if (seconds < 1) return `< 1s`
  if (seconds < 60) return `${Math.round(seconds)}s`
  const m = Math.floor(seconds / 60)
  const s = Math.round(seconds - m * 60)
  if (m < 60) return `${m}m ${s}s`
  const h = Math.floor(m / 60)
  return `${h}h ${m - h * 60}m`
}

function loadSize(): CubeSize {
  try {
    const raw = localStorage.getItem(SIZE_STORAGE_KEY)
    const n = raw ? parseInt(raw, 10) : NaN
    if (CUBE_SIZES.includes(n as CubeSize)) return n as CubeSize
  } catch {
    // ignore
  }
  return DEFAULT_SIZE
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

function mergeToggles(defaults: MoveToggles, raw: Record<string, unknown>): MoveToggles {
  const out: MoveToggles = { ...defaults }
  for (const [k, v] of Object.entries(raw)) {
    if (k in defaults && typeof v === 'boolean') out[k] = v
  }
  return out
}

export default function App() {
  const viewport = useViewport()
  const isMobile = viewport.w < 780

  // Initial cube size and session snapshot are read once on mount and feed every useState below.
  const initialCubeSize = useMemo<CubeSize>(loadSize, [])
  const initialCube = useMemo(() => createCube(initialCubeSize), [initialCubeSize])
  const initialSnap = useMemo(() => sessionStore.loadSession(initialCubeSize), [initialCubeSize])

  const [cubeSize, setCubeSize] = useState<CubeSize>(() => initialCubeSize)
  const cube = useMemo(() => createCube(cubeSize), [cubeSize])

  const cubeDims = useMemo(() => {
    const N = cube.N
    if (isMobile) {
      const availW = viewport.w - 24
      // net width = 4 * (Ns + (N-1)g) + 3 * fg; g=2, fg=4
      // ~= 4Ns + 4(N-1)*2 + 12 = 4Ns + 8(N-1) + 12
      const maxByWidth = Math.floor((availW - 8 * (N - 1) - 12) / (4 * N))
      const maxByHeight = Math.floor((viewport.h * 0.35 - 8) / (3 * N))
      const sticker = Math.max(12, Math.min(32, Math.min(maxByWidth, maxByHeight)))
      return { sticker, scale3d: Math.max(10, Math.min(24, Math.floor(sticker * 0.85))) }
    }
    const maxNetHeight = Math.max(140, Math.min(260, viewport.h * 0.36))
    const sticker = Math.max(8, Math.min(28, Math.floor((maxNetHeight - 8) / (3 * N))))
    const scale3d = Math.max(10, Math.min(30, Math.floor(sticker * 1.15)))
    return { sticker, scale3d }
  }, [viewport.w, viewport.h, isMobile, cube])

  const [startState, setStartState] = useState<CubeState>(() =>
    initialSnap ? [...initialSnap.start] : [...initialCube.SOLVED],
  )
  const [targetState, setTargetState] = useState<CubeState>(() =>
    initialSnap ? [...initialSnap.target] : [...initialCube.SOLVED],
  )
  const [selectedColor, setSelectedColor] = useState<number>(() => initialSnap?.selectedColor ?? W)
  const [toggles, setToggles] = useState<MoveToggles>(() => {
    const defaults = buildDefaultToggles(initialCube)
    return initialSnap ? mergeToggles(defaults, initialSnap.toggles) : defaults
  })
  const [maxDepthText, setMaxDepthText] = useState(() => String(initialSnap?.maxDepth ?? 10))
  const [maxSolutionsText, setMaxSolutionsText] = useState(() => String(initialSnap?.maxSolutions ?? 1))
  const [groupTerms, setGroupTerms] = useState(() => initialSnap?.groupTerms ?? true)
  const [showAlts, setShowAlts] = useState(() => initialSnap?.showAlts ?? false)
  const [method, setMethod] = useState<Method>(() => initialSnap?.method ?? 'parallel')
  const [status, setStatus] = useState(() => (initialSnap ? 'Restored previous session.' : 'Ready.'))
  const [depthText, setDepthText] = useState('')
  const [progressPct, setProgressPct] = useState(0)
  const [lastSolutions, setLastSolutions] = useState<Move[][]>(() =>
    initialSnap ? sessionStore.rehydrateSolutions(initialCube, initialSnap.solutionNames) : [],
  )
  const [selectedResult, setSelectedResult] = useState<number | null>(() => initialSnap?.selectedResult ?? null)
  const [searching, setSearching] = useState(false)
  const [showHistory, setShowHistory] = useState(false)
  const [showStats, setShowStats] = useState(false)
  const [loadTarget, setLoadTarget] = useState<'start' | 'target' | null>(null)
  const [activeCube, setActiveCube] = useState<'start' | 'target'>(() => initialSnap?.activeCube ?? 'start')
  const [startMovesText, setStartMovesText] = useState(() => initialSnap?.startMovesText ?? '')
  const [startMovesStatus, setStartMovesStatus] = useState('')
  const [targetMovesText, setTargetMovesText] = useState(() => initialSnap?.targetMovesText ?? '')
  const [targetMovesStatus, setTargetMovesStatus] = useState('')

  const maxDepth = parseIntInRange(maxDepthText, 1, MAX_DEPTH_LIMIT)
  const maxSolutions = parseIntInRange(maxSolutionsText, 1, MAX_SOLUTIONS_LIMIT)
  const inputsValid = maxDepth !== null && maxSolutions !== null

  const cancelRef = useRef<{ cancelled: boolean } | null>(null)
  const estBranchingRef = useRef(1)
  const currentDepthRef = useRef(0)
  const depthNodesStartRef = useRef(0)
  const progressRef = useRef({ depth: 0, nodes: 0, found: 0, dirty: false })
  const searchStartRef = useRef(0)
  const searchMethodRef = useRef<Method>('parallel')
  const [peakHeap, setPeakHeap] = useState(0)
  const [etaSec, setEtaSec] = useState<number | null>(null)

  // Session writes are suspended during hydration. Initial state came from storage (see the lazy
  // initializers above), so writes are enabled immediately; they only pause while switching
  // between cube sizes.
  const sessionReadyRef = useRef(true)
  const didMountRef = useRef(false)

  // On subsequent cube-size changes, load the snapshot for the new size (or reset to defaults).
  // The initial render is skipped — that path is covered by the lazy initializers.
  useEffect(() => {
    if (!didMountRef.current) { didMountRef.current = true; return }
    sessionReadyRef.current = false
    const snap = sessionStore.loadSession(cubeSize)
    if (snap) {
      setStartState([...snap.start])
      setTargetState([...snap.target])
      setToggles(mergeToggles(buildDefaultToggles(cube), snap.toggles))
      setLastSolutions(sessionStore.rehydrateSolutions(cube, snap.solutionNames))
      setSelectedResult(snap.selectedResult)
      setMaxDepthText(String(snap.maxDepth))
      setMaxSolutionsText(String(snap.maxSolutions))
      setGroupTerms(snap.groupTerms)
      setShowAlts(snap.showAlts)
      setMethod(snap.method)
      setSelectedColor(snap.selectedColor)
      setActiveCube(snap.activeCube)
      setStartMovesText(snap.startMovesText)
      setTargetMovesText(snap.targetMovesText)
      setStartMovesStatus('')
      setTargetMovesStatus('')
      setStatus('Restored previous session.')
      setProgressPct(0)
      setDepthText('')
    } else {
      setStartState([...cube.SOLVED])
      setTargetState([...cube.SOLVED])
      setToggles(buildDefaultToggles(cube))
      setLastSolutions([])
      setSelectedResult(null)
      setStatus('Ready.')
      setProgressPct(0)
      setDepthText('')
      setStartMovesText('')
      setStartMovesStatus('')
      setTargetMovesText('')
      setTargetMovesStatus('')
    }
    sessionReadyRef.current = true
  }, [cube, cubeSize])

  useEffect(() => {
    try { localStorage.setItem(SIZE_STORAGE_KEY, String(cubeSize)) } catch {
      // ignore
    }
  }, [cubeSize])

  // Persist the active session whenever tracked state changes (after load/default has run).
  // Invalid depth/solutions inputs skip the save so we don't stomp the stored value while the
  // user is mid-edit.
  useEffect(() => {
    if (!sessionReadyRef.current) return
    if (startState.length !== cube.stateSize || targetState.length !== cube.stateSize) return
    if (maxDepth === null || maxSolutions === null) return
    sessionStore.saveSession(cubeSize, {
      start: [...startState],
      target: [...targetState],
      toggles,
      solutionNames: lastSolutions.map((s) => s.map((m) => m.name)),
      selectedResult,
      maxDepth,
      maxSolutions,
      groupTerms,
      showAlts,
      method,
      selectedColor,
      activeCube,
      startMovesText,
      targetMovesText,
    })
  }, [
    cube, cubeSize, startState, targetState, toggles, lastSolutions,
    selectedResult, maxDepth, maxSolutions, groupTerms, showAlts,
    method, selectedColor, activeCube, startMovesText, targetMovesText,
  ])

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
      const b = estBranchingRef.current
      const estTotal = Math.pow(b, Math.max(1, p.depth))
      const inDepth = Math.max(0, p.nodes - depthNodesStartRef.current)
      const pct = Math.min(100, 100 * inDepth / Math.max(1, estTotal))
      setStatus(`Searching… Depth ${p.depth}/${maxDepth ?? '?'} · ${p.nodes.toLocaleString()} nodes · ${p.found} found`)
      setDepthText(`${pct.toFixed(1)}% of est. depth-${p.depth} space`)
      setProgressPct(pct)

      // ETA: IDDFS / parallel only. Estimate remaining nodes via geometric sum of future depths
      // plus the unexplored fraction of the current depth, then divide by current throughput.
      if (searchMethodRef.current !== 'bidir' && maxDepth !== null) {
        const remainingCurrent = Math.max(0, estTotal - inDepth)
        let remainingFuture = 0
        for (let d = p.depth + 1; d <= maxDepth; d++) remainingFuture += Math.pow(b, d)
        const remainingNodes = remainingCurrent + remainingFuture
        const elapsedS = (performance.now() - searchStartRef.current) / 1000
        const rate = p.nodes / Math.max(0.01, elapsedS)
        if (rate > 0 && remainingNodes >= 0) {
          setEtaSec(remainingNodes / rate)
        }
      } else {
        setEtaSec(null)
      }
    }, 120)
    return () => clearInterval(tick)
  }, [searching, maxDepth])

  const lines: ResultLine[] = buildResultLines(cube, lastSolutions, groupTerms, showAlts)

  const methodSuggestion = useMemo<{ text: string; switchTo: Method } | null>(() => {
    const hasAny = targetState.some((v) => v === ANY)
    const depthVal = maxDepth ?? 0
    const deep = depthVal >= 10
    const veryDeep = depthVal >= 12
    const bigCube = cube.N >= 4
    if (method === 'bidir' && hasAny) {
      return {
        text: "Target has don't-care cells — bidir needs a fully defined target. Switch to iddfs (or parallel) to handle wildcards.",
        switchTo: 'parallel',
      }
    }
    if (method === 'iddfs' && bigCube && depthVal >= 8) {
      return {
        text: `${cube.N}×${cube.N} at depth ${depthVal} — parallel splits the search across workers and is usually much faster here.`,
        switchTo: 'parallel',
      }
    }
    if (!hasAny && deep && method !== 'bidir') {
      return {
        text: `Concrete target and depth ${depthVal} — bidir meets in the middle and is usually much faster past depth 10.`,
        switchTo: 'bidir',
      }
    }
    if (method === 'iddfs' && veryDeep) {
      return {
        text: `Depth ${depthVal} with iddfs will blow up quickly — parallel exhausts the space across workers.`,
        switchTo: 'parallel',
      }
    }
    return null
  }, [method, targetState, maxDepth, cube])

  const collectAllowed = useCallback((): Move[] => cube.ALL_MOVES.filter((m) => toggles[m.name]), [cube, toggles])

  const applyMoves = (target: 'start' | 'target') => {
    const isStart = target === 'start'
    const text = (isStart ? startMovesText : targetMovesText).trim()
    if (!text) return
    try {
      const seq = parseSequence(cube, text)
      const current = isStart ? startState : targetState
      const next = cube.applySequence(current, seq)
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
      const seq = parseSequence(cube, text)
      const next = cube.applySequence(cube.SOLVED, seq)
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
    const existing = statesStore.loadAll(cube.N)
    if (trimmed in existing && !confirm(`State ${JSON.stringify(trimmed)} exists. Overwrite?`)) return
    statesStore.saveState(cube.N, trimmed, which === 'start' ? startState : targetState)
  }

  const renderFinal = useCallback((sols: Move[][], elapsed: number, nodes: number, cancelled: boolean, heapBytes: number) => {
    setSelectedResult(null)
    const memNote = heapBytes > 0 ? `, peak ~${formatBytes(heapBytes)}` : ''
    const statsLine = `${elapsed.toFixed(2)}s, ${nodes.toLocaleString()} combos${memNote}`
    if (!sols.length) {
      setLastSolutions([])
      setStatus(cancelled ? `Cancelled. ${statsLine}` : `No algorithm up to depth ${maxDepth}. ${statsLine}`)
      setProgressPct(0)
      return
    }
    const simplified = simplifyAndDedupe(cube, sols)
    const raw = sols.length
    const dropped = raw - simplified.length
    setLastSolutions(simplified)
    const dedupeNote = dropped > 0 ? `, ${dropped} dedup.` : ''
    setStatus(`Found ${simplified.length} algorithm(s)${dedupeNote}. Shortest: ${simplified[0].length} moves. ${statsLine}`)
    setProgressPct(100)
  }, [maxDepth, cube])

  const startSearch = async () => {
    if (searching) return
    if (maxDepth === null) { setStatus(`Max length must be an integer 1–${MAX_DEPTH_LIMIT}.`); return }
    if (maxSolutions === null) { setStatus(`Max solutions must be an integer 1–${MAX_SOLUTIONS_LIMIT}.`); return }
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
    searchStartRef.current = performance.now()
    searchMethodRef.current = chosen
    setPeakHeap(0)
    setEtaSec(null)

    const cancel = { cancelled: false }
    cancelRef.current = cancel
    const t0 = performance.now()
    let lastNodes = 0
    let lastHeap = 0
    const liveSols: Move[][] = []

    const onProgress = (depth: number, nodes: number, found: number) => {
      lastNodes = nodes
      progressRef.current = { depth, nodes, found, dirty: true }
    }

    const onSol = (path: readonly Move[]) => {
      liveSols.push([...path])
      setLastSolutions(simplifyAndDedupe(cube, liveSols))
    }

    const onHeap = (peak: number) => {
      lastHeap = peak
      setPeakHeap(peak)
    }

    try {
      let result: { solutions: Move[][]; nodes: number; peakHeap: number }
      if (chosen === 'parallel') {
        result = await findAlgorithmsParallel(cube, startState, targetState, allowed, {
          maxDepth, maxSolutions, cancel, progressCb: onProgress, onSolution: onSol, onHeap,
        })
      } else {
        // iddfs and bidir both run off-thread via a single worker so the UI stays responsive.
        const r = await findAlgorithmsInWorker(chosen, cube, startState, targetState, allowed, {
          maxDepth, maxSolutions, cancel, progressCb: onProgress, onSolution: onSol, onHeap,
        })
        result = { solutions: r.solutions, nodes: r.nodes, peakHeap: r.peakHeap }
      }
      const elapsed = (performance.now() - t0) / 1000
      const sols = result.solutions
      const nodes = Math.max(result.nodes, lastNodes)
      const peak = Math.max(result.peakHeap, lastHeap)
      setPeakHeap(peak)
      renderFinal(sols, elapsed, nodes, cancel.cancelled, peak)

      const allowedNames = allowed.map((m) => m.name)
      const shortest = sols.length ? Math.min(...sols.map((s) => s.length)) : null
      statsStore.logEntry(cube.N, {
        method: chosen,
        allowedMoves: allowedNames,
        maxDepth,
        elapsedS: Math.round(elapsed * 1000) / 1000,
        nodes,
        found: sols.length,
        shortestLen: shortest,
        cancelled: cancel.cancelled,
        peakHeapBytes: peak > 0 ? peak : undefined,
      })
      if (sols.length && !(sols.length === 1 && sols[0].length === 0)) {
        solutionsStore.appendRecord(
          cube.N,
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

  const openInVisualizer = (seq: Move[]) => {
    if (!seq.length) return
    const scramble = seq.map((m) => m.name.replace(/'/g, '-')).join('_')
    const url = `https://www.cubedb.net/?puzzle=${cube.N}x${cube.N}&scramble=${encodeURIComponent(scramble)}`
    window.open(url, '_blank', 'noopener,noreferrer')
  }

  const openSelected = () => {
    if (selectedResult === null) return
    const seq = lines[selectedResult]?.seq
    if (seq) openInVisualizer(seq)
  }

  const selectedSeqLen = selectedResult === null ? 0 : (lines[selectedResult]?.seq.length ?? 0)

  const saveSelectedAlg = () => {
    if (selectedResult === null) { alert('Select a result first.'); return }
    const seq = lines[selectedResult]?.seq
    if (!seq || !seq.length) return
    const name = prompt('Save algorithm as:')
    if (!name) return
    const trimmed = name.trim()
    if (!trimmed) return
    const existing = userAlgs.loadAll(cube.N)
    if (trimmed in existing && !confirm(`Algorithm ${JSON.stringify(trimmed)} exists. Overwrite?`)) return
    userAlgs.saveAlg(cube.N, trimmed, seq.map((m) => m.name))
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
  const cubeRef = useRef(cube)
  startStateRef.current = startState
  targetStateRef.current = targetState
  activeCubeRef.current = activeCube
  cubeRef.current = cube

  const moveKeyMap = useMemo(() => buildMoveKeyMap(cube), [cube])

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

      const base = moveKeyMap[e.key.toLowerCase()]
      if (!base) return
      let name = base
      if (e.altKey) name = base + '2'
      else if (e.shiftKey) name = base + "'"
      const mv = cubeRef.current.MOVE_REGISTRY[name]
      if (!mv) return
      e.preventDefault()
      if (activeCubeRef.current === 'start') {
        setStartState(cubeRef.current.apply(startStateRef.current, mv))
      } else {
        setTargetState(cubeRef.current.apply(targetStateRef.current, mv))
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [searching, cancelSearch, moveKeyMap])

  const stickerSize = cubeDims.sticker
  const cube3dScale = cubeDims.scale3d

  const currentState = activeCube === 'start' ? startState : targetState
  const setCurrentState = (s: CubeState) => {
    if (activeCube === 'start') setStartState(s); else setTargetState(s)
  }
  const currentMovesText = activeCube === 'start' ? startMovesText : targetMovesText
  const setCurrentMovesText = activeCube === 'start' ? setStartMovesText : setTargetMovesText
  const currentMovesStatus = activeCube === 'start' ? startMovesStatus : targetMovesStatus

  const sizeSelector = (
    <span className="size-selector" style={{ display: 'inline-flex', gap: 4, alignItems: 'center' }}>
      <span className="hint">Cube:</span>
      {CUBE_SIZES.map((n) => (
        <button
          key={n}
          className={`size-btn${cubeSize === n ? ' accent' : ''}`}
          onClick={() => setCubeSize(n)}
          disabled={cubeSize === n}
          title={`${n}x${n}x${n}`}
        >
          {n}x{n}
        </button>
      ))}
    </span>
  )

  const searchPanelBody = (
    <>
      <div className="row" style={{ gap: 12 }}>
        <label className="field-label">
          Max length:
          <input
            type="text"
            inputMode="numeric"
            value={maxDepthText}
            onChange={(e) => setMaxDepthText(e.target.value)}
            className={maxDepth === null ? 'input-invalid' : ''}
            title={`Integer 1–${MAX_DEPTH_LIMIT}`}
            style={{ width: 60 }}
          />
        </label>
        <label className="field-label">
          Max solutions:
          <input
            type="text"
            inputMode="numeric"
            value={maxSolutionsText}
            onChange={(e) => setMaxSolutionsText(e.target.value)}
            className={maxSolutions === null ? 'input-invalid' : ''}
            title={`Integer 1–${MAX_SOLUTIONS_LIMIT}`}
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
      {methodSuggestion && (
        <div className="method-suggestion">
          <span className="method-suggestion-icon" aria-hidden>⚠</span>
          <span className="method-suggestion-text">{methodSuggestion.text}</span>
          <button
            type="button"
            className="method-suggestion-btn"
            onClick={() => setMethod(methodSuggestion.switchTo)}
          >
            Use {methodSuggestion.switchTo}
          </button>
        </div>
      )}
      <div className="row" style={{ marginTop: 6 }}>
        <button
          className="accent"
          onClick={startSearch}
          disabled={searching || !inputsValid}
          title={!inputsValid ? 'Fix highlighted fields first' : undefined}
        >Search</button>
        {!inputsValid && (
          <span className="hint" style={{ color: '#e06b6b' }}>
            {maxDepth === null ? `Max length must be 1–${MAX_DEPTH_LIMIT}. ` : ''}
            {maxSolutions === null ? `Max solutions must be 1–${MAX_SOLUTIONS_LIMIT}.` : ''}
          </span>
        )}
        <button onClick={cancelSearch} disabled={!searching}>Cancel</button>
        <button onClick={() => setShowHistory(true)}>History…</button>
        <button onClick={() => setShowStats(true)}>Stats…</button>
      </div>
      <div className="progress" style={{ marginTop: 6 }}>
        <div className="progress-bar" style={{ width: `${progressPct}%` }} />
      </div>
      <div className="status" style={{ marginTop: 2 }}>{depthText}</div>
      <div className="status" style={{ whiteSpace: 'pre-wrap', minHeight: 0 }}>{status}</div>
    </>
  )

  const resultsBody = (
    <>
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <span className="hint">Tap to select · double-tap to copy</span>
        <div className="row" style={{ gap: 3 }}>
          <button onClick={copySelected} disabled={selectedResult === null}>Copy</button>
          <button onClick={openSelected} disabled={selectedSeqLen === 0} title="Open in cubedb.net">Open…</button>
          <button onClick={saveSelectedAlg} disabled={selectedResult === null}>Save…</button>
        </div>
      </div>
      <ResultsList
        lines={lines}
        selectedIdx={selectedResult}
        onSelect={setSelectedResult}
        onCopy={copyToClipboard}
      />
    </>
  )

  const searchOverlay = searching && (
    <div className="search-overlay" role="status" aria-live="polite">
      <div className="search-overlay-card">
        <div className="search-overlay-spinner" aria-hidden />
        <div className="search-overlay-title">Searching…</div>
        <div className="search-overlay-bar">
          <div className="search-overlay-bar-fill" style={{ width: `${progressPct}%` }} />
        </div>
        <div className="search-overlay-meta">{depthText || ' '}</div>
        <div className="search-overlay-meta">{status}</div>
        <div className="search-overlay-meta">
          Method: <strong>{method}</strong> · Cube: <strong>{cube.N}×{cube.N}</strong>
        </div>
        <div className="search-overlay-meta">
          ETA to full scan: <strong>{etaSec === null ? (method === 'bidir' ? 'unknown (bidir)' : 'computing…') : `~${formatDuration(etaSec)}`}</strong>
        </div>
        {peakHeap > 0 && (
          <div className="search-overlay-meta">
            Peak heap: <strong>{formatBytes(peakHeap)}</strong>
          </div>
        )}
        {lastSolutions.length > 0 && (
          <div className="search-overlay-meta">
            Live solutions: <strong>{lastSolutions.length}</strong>
          </div>
        )}
        <button className="search-overlay-cancel" onClick={cancelSearch}>Cancel search (Esc)</button>
        <div className="search-overlay-hint">Press Esc any time to cancel.</div>
      </div>
    </div>
  )

  const modals = (
    <>
      <HistoryDialog
        cube={cube}
        sizes={CUBE_SIZES}
        open={showHistory}
        onClose={() => setShowHistory(false)}
        grouped={groupTerms}
        onLoadStart={(s) => { setStartState(s); setShowHistory(false) }}
        onLoadTarget={(s) => { setTargetState(s); setShowHistory(false) }}
        onLoadBoth={(s, t) => { setStartState(s); setTargetState(t); setShowHistory(false) }}
      />
      <StatsDialog sizes={CUBE_SIZES} open={showStats} onClose={() => setShowStats(false)} />
      <LoadStateDialog
        cubeSize={cube.N}
        open={loadTarget !== null}
        onClose={() => setLoadTarget(null)}
        onLoad={(s) => {
          if (loadTarget === 'start') setStartState(s)
          else if (loadTarget === 'target') setTargetState(s)
        }}
      />
    </>
  )

  if (isMobile) {
    const applyCurrent = () => applyMoves(activeCube)
    return (
      <div className="app app-mobile">
        <div className="mobile-top-bar" style={{ display: 'flex', justifyContent: 'center', padding: '6px 0' }}>
          {sizeSelector}
        </div>
        <div className="mobile-tabs">
          <button
            className={`tab${activeCube === 'start' ? ' active' : ''}`}
            onClick={() => setActiveCube('start')}
          >Start</button>
          <button
            className={`tab${activeCube === 'target' ? ' active' : ''}`}
            onClick={() => setActiveCube('target')}
          >Target <span className="hint">?</span></button>
        </div>

        <div className="mobile-3d">
          <Cube3D cube={cube} state={currentState} scale={cube3dScale} />
        </div>

        <div className="mobile-net">
          <CubeNet
            cube={cube}
            state={currentState}
            onChange={setCurrentState}
            selectedColor={selectedColor}
            stickerSize={stickerSize}
            onActivate={() => { /* already active via tab */ }}
          />
        </div>

        <div className="mobile-actions">
          <button onClick={() => setCurrentState([...cube.SOLVED])}>Solved</button>
          <button onClick={() => setCurrentState(cube.clearState())}>Clear</button>
          {activeCube === 'start'
            ? <button onClick={swap} title="Swap">⇄ Swap</button>
            : <button onClick={() => setTargetState([...startState])}>← Start</button>}
          <button onClick={() => scramble(activeCube)}>Scramble…</button>
          <button onClick={() => saveStatePrompt(activeCube)}>Save…</button>
          <button onClick={() => setLoadTarget(activeCube)}>Load…</button>
        </div>

        <div className="mobile-moves-input">
          <input
            type="text"
            placeholder="R U R' U' …"
            value={currentMovesText}
            onChange={(e) => setCurrentMovesText(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') applyCurrent() }}
          />
          <button onClick={applyCurrent}>Apply</button>
        </div>
        <div className="status moves-status-line">{currentMovesStatus || ' '}</div>

        <div className="mobile-palette">
          <span className="palette-title">Paint</span>
          <Palette active={selectedColor} onSelect={setSelectedColor} direction="horizontal" />
        </div>

        <details className="mobile-section">
          <summary>Allowed moves</summary>
          <div className="mobile-section-body">
            <MoveSelector cube={cube} toggles={toggles} setToggles={setToggles} />
          </div>
        </details>

        <details className="mobile-section" open>
          <summary>Search</summary>
          <div className="mobile-section-body panel">{searchPanelBody}</div>
        </details>

        <details className="mobile-section" open>
          <summary>Results {lastSolutions.length > 0 ? `(${lastSolutions.length})` : ''}</summary>
          <div className="mobile-section-body panel results-panel">{resultsBody}</div>
        </details>

        {modals}
        {searchOverlay}
      </div>
    )
  }

  return (
    <div className="app">
      <div className="top-bar" style={{ display: 'flex', justifyContent: 'center', padding: '6px 0' }}>
        {sizeSelector}
      </div>
      <div className="cube-nets">
        <div className={`cube-frame three-d${activeCube === 'start' ? ' active' : ''}`}>
          <Cube3D cube={cube} state={startState} scale={cube3dScale} onActivate={() => setActiveCube('start')} />
        </div>
        <div className="cube-col">
          <div className="cube-col-header">
            <div className="title">Start</div>
            <div className="row" style={{ gap: 4 }}>
              <button onClick={() => setStartState([...cube.SOLVED])}>Solved</button>
              <button onClick={() => setStartState(cube.clearState())}>Clear</button>
              <button onClick={swap} title="Swap start/target">⇄</button>
            </div>
          </div>
          <CubeNet
            cube={cube}
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
          <div className="status moves-status-line">{startMovesStatus || ' '}</div>
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
              <button onClick={() => setTargetState([...cube.SOLVED])}>Solved</button>
              <button onClick={() => setTargetState(cube.clearState())}>Clear</button>
              <button onClick={() => setTargetState([...startState])} title="Copy from start">← Start</button>
            </div>
          </div>
          <CubeNet
            cube={cube}
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
          <div className="status moves-status-line">{targetMovesStatus || ' '}</div>
        </div>
        <div className={`cube-frame three-d${activeCube === 'target' ? ' active' : ''}`}>
          <Cube3D cube={cube} state={targetState} scale={cube3dScale} onActivate={() => setActiveCube('target')} />
        </div>
      </div>

      <div className="bottom-grid">
        <MoveSelector cube={cube} toggles={toggles} setToggles={setToggles} />

        <div className="panel">
          <div className="panel-title">Search</div>
          {searchPanelBody}
        </div>

        <div className="panel results-panel">
          <div className="row" style={{ justifyContent: 'space-between' }}>
            <div className="panel-title">Results (shortest first)</div>
            <div className="row" style={{ gap: 3 }}>
              <button onClick={copySelected} disabled={selectedResult === null}>Copy</button>
              <button onClick={openSelected} disabled={selectedSeqLen === 0} title="Open in cubedb.net">Open…</button>
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

      {modals}
      {searchOverlay}
    </div>
  )
}

// IDDFS algorithm search with don't-care matching and pruning.
import {
  ANY,
  type CubeState,
  type Move,
} from './cube'

export interface CancelFlag {
  cancelled: boolean
}

export interface ProgressCb {
  (depth: number, nodes: number, found: number): void
}

export interface OnSolution {
  (path: readonly Move[]): void
}

export function matches(state: CubeState, target: CubeState): boolean {
  const n = target.length
  for (let i = 0; i < n; i++) {
    const t = target[i]
    if (t !== ANY && state[i] !== t) return false
  }
  return true
}

function pairAllowed(prev: Move | null, cur: Move): boolean {
  if (prev === null) return true
  if (prev.faceGroup === cur.faceGroup) return false
  if (prev.axis !== cur.axis) return true
  // Same axis: moves whose layers overlap interfere and should be folded by simplification, so
  // disallow consecutive pairs. Moves with disjoint layers commute; force a canonical order
  // (higher-index layer first) so the search explores each pair exactly once.
  if ((prev.layerMask & cur.layerMask) !== 0) return false
  return prev.layerMask > cur.layerMask
}

export interface SearchOptions {
  maxDepth?: number
  maxSolutions?: number
  cancel?: CancelFlag
  progressCb?: ProgressCb
  onSolution?: OnSolution
  progressEvery?: number
}

export function findAlgorithms(
  start: CubeState,
  target: CubeState,
  allowedMoves: readonly Move[],
  opts: SearchOptions = {},
): { solutions: Move[][]; nodes: number } {
  const maxDepth = opts.maxDepth ?? 12
  const maxSolutions = opts.maxSolutions ?? 5
  const progressEvery = opts.progressEvery ?? 200_000
  const cancel = opts.cancel
  const progressCb = opts.progressCb
  const onSolution = opts.onSolution

  const solutions: Move[][] = []
  const nodesRef = { n: 0 }

  if (matches(start, target)) {
    return { solutions: [[]], nodes: 0 }
  }
  if (!allowedMoves.length || maxDepth < 1) {
    return { solutions, nodes: 0 }
  }

  const stateSize = start.length
  const targetFixed: Array<[number, number]> = []
  for (let i = 0; i < stateSize; i++) if (target[i] !== ANY) targetFixed.push([i, target[i]])

  let maxChanged = 0
  for (const m of allowedMoves) {
    let c = 0
    for (let i = 0; i < stateSize; i++) if (m.perm[i] !== i) c++
    if (c > maxChanged) maxChanged = c
  }
  if (maxChanged === 0) maxChanged = 1

  const shouldCancel = () => cancel !== undefined && cancel.cancelled

  const mismatch = (state: CubeState): number => {
    let c = 0
    for (const [i, v] of targetFixed) if (state[i] !== v) c++
    return c
  }

  let cancelled = false

  const dfs = (
    state: CubeState,
    depthRemaining: number,
    path: Move[],
    prev: Move | null,
    currentDepth: number,
  ): boolean => {
    nodesRef.n++
    if (nodesRef.n % progressEvery === 0) {
      if (progressCb) progressCb(currentDepth, nodesRef.n, solutions.length)
      if (shouldCancel()) { cancelled = true; return true }
    }

    if (depthRemaining === 0) {
      if (matches(state, target)) {
        const sol = path.slice()
        solutions.push(sol)
        if (onSolution) onSolution(sol)
      }
      return false
    }

    const mm = mismatch(state)
    if (mm > depthRemaining * maxChanged) return false

    for (const mv of allowedMoves) {
      if (!pairAllowed(prev, mv)) continue
      const p = mv.perm
      const newState = new Array<number>(stateSize)
      for (let i = 0; i < stateSize; i++) newState[i] = state[p[i]]
      path.push(mv)
      const stop = dfs(newState, depthRemaining - 1, path, mv, currentDepth)
      path.pop()
      if (stop) return true
      if (solutions.length >= maxSolutions) return true
    }
    return false
  }

  outer: for (let depth = 1; depth <= maxDepth; depth++) {
    if (shouldCancel()) { cancelled = true; break }
    if (progressCb) progressCb(depth, nodesRef.n, solutions.length)
    dfs(start, depth, [], null, depth)
    if (cancelled) break outer
    if (solutions.length >= maxSolutions) break
  }

  if (progressCb) progressCb(maxDepth, nodesRef.n, solutions.length)
  return { solutions: solutions.slice(0, maxSolutions), nodes: nodesRef.n }
}

// ---------- Bidirectional BFS (full target only) ----------

function invertPerm(p: readonly number[]): readonly number[] {
  const out = new Array<number>(p.length)
  for (let i = 0; i < p.length; i++) out[p[i]] = i
  return out
}

function stateKey(state: CubeState): string {
  return state.join(',')
}

interface BackLink {
  parent: string | null
  move: Move | null
}

function reconstruct(meet: string, fwd: Map<string, BackLink>, bwd: Map<string, BackLink>): Move[] {
  const fPath: Move[] = []
  let k: string | null = meet
  while (k !== null) {
    const link: BackLink | undefined = fwd.get(k)
    if (!link || link.move === null) break
    fPath.push(link.move)
    k = link.parent
  }
  fPath.reverse()

  const bPath: Move[] = []
  k = meet
  while (k !== null) {
    const link: BackLink | undefined = bwd.get(k)
    if (!link || link.move === null) break
    bPath.push(link.move)
    k = link.parent
  }
  return [...fPath, ...bPath]
}

export interface BidirOptions extends SearchOptions {
  memCap?: number
}

export function findAlgorithmsBidir(
  start: CubeState,
  target: CubeState,
  allowedMoves: readonly Move[],
  opts: BidirOptions = {},
): { solutions: Move[][]; nodes: number } {
  const maxDepth = opts.maxDepth ?? 14
  const maxSolutions = opts.maxSolutions ?? 5
  const memCap = opts.memCap ?? 3_000_000
  const cancel = opts.cancel
  const progressCb = opts.progressCb
  const onSolution = opts.onSolution

  for (const v of target) if (v === ANY) throw new Error('bidirectional BFS requires concrete target (no ANY)')

  if (stateKey(start) === stateKey(target)) return { solutions: [[]], nodes: 0 }

  const shouldCancel = () => cancel !== undefined && cancel.cancelled

  const startKey = stateKey(start)
  const targetKey = stateKey(target)
  const fwd = new Map<string, BackLink>([[startKey, { parent: null, move: null }]])
  const bwd = new Map<string, BackLink>([[targetKey, { parent: null, move: null }]])
  const keyOf = new Map<string, CubeState>([[startKey, start], [targetKey, target]])
  let fwdFrontier: string[] = [startKey]
  let bwdFrontier: string[] = [targetKey]

  const stateSize = start.length
  const invPermOf = new Map<string, readonly number[]>()
  for (const m of allowedMoves) invPermOf.set(m.name, invertPerm(m.perm))

  const expand = (
    frontier: readonly string[],
    visited: Map<string, BackLink>,
    useInverse: boolean,
  ): string[] => {
    const next: string[] = []
    for (const sk of frontier) {
      const s = keyOf.get(sk)!
      for (const mv of allowedMoves) {
        const p = useInverse ? invPermOf.get(mv.name)! : mv.perm
        const ns = new Array<number>(stateSize)
        for (let i = 0; i < stateSize; i++) ns[i] = s[p[i]]
        const nk = stateKey(ns)
        if (visited.has(nk)) continue
        visited.set(nk, { parent: sk, move: mv })
        keyOf.set(nk, ns)
        next.push(nk)
      }
    }
    return next
  }

  const solutions: Move[][] = []
  let fDepth = 0
  let bDepth = 0
  let totalDepth = 0

  while (totalDepth < maxDepth && !shouldCancel()) {
    const growFwd = fwdFrontier.length <= bwdFrontier.length
    if (growFwd) {
      fwdFrontier = expand(fwdFrontier, fwd, false)
      fDepth++
    } else {
      bwdFrontier = expand(bwdFrontier, bwd, true)
      bDepth++
    }
    totalDepth = fDepth + bDepth
    if (progressCb) progressCb(totalDepth, fwd.size + bwd.size, solutions.length)

    const [small, large] = fwd.size <= bwd.size ? [fwd, bwd] : [bwd, fwd]
    const meets: string[] = []
    for (const k of small.keys()) if (large.has(k)) meets.push(k)
    if (meets.length) {
      for (const m of meets) {
        const sol = reconstruct(m, fwd, bwd)
        if (sol.length <= maxDepth) {
          solutions.push(sol)
          if (onSolution) onSolution(sol)
          if (solutions.length >= maxSolutions) break
        }
      }
      if (solutions.length) break
    }
    if (fwd.size + bwd.size > memCap) break
  }

  const seen = new Set<string>()
  const uniq: Move[][] = []
  for (const s of solutions) {
    const key = s.map((m) => m.name).join('|')
    if (!seen.has(key)) {
      seen.add(key)
      uniq.push(s)
    }
  }
  uniq.sort((a, b) => a.length - b.length)
  return { solutions: uniq.slice(0, maxSolutions), nodes: fwd.size + bwd.size }
}

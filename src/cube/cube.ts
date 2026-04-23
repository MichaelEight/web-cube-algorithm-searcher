// NxN Rubik's cube state model. Size N is parameterized.
//
// Sticker layout: 6 faces × N*N stickers, laid out U, R, F, D, L, B in order.
// Face offsets: U=0, R=N*N, F=2*N*N, D=3*N*N, L=4*N*N, B=5*N*N.

export type CubeState = readonly number[]
export type Vec3 = readonly [number, number, number]
export type Mat3 = readonly [Vec3, Vec3, Vec3]

// -------- Colors --------
export const ANY = 0
export const W = 1, Y = 2, G = 3, B = 4, R = 5, O = 6

export const COLOR_NAMES: Record<number, string> = {
  [ANY]: 'any', [W]: 'W', [Y]: 'Y', [G]: 'G', [B]: 'B', [R]: 'R', [O]: 'O',
}
export const COLOR_HEX: Record<number, string> = {
  [ANY]: '#888888',
  [W]: '#FFFFFF',
  [Y]: '#FFD500',
  [G]: '#009B48',
  [B]: '#0046AD',
  [R]: '#B71234',
  [O]: '#FF5800',
}
export const FACE_COLOR: Record<string, number> = {
  U: W, D: Y, F: G, B: B, L: O, R: R,
}

export const FACE_OPPOSITES: Record<string, string> = {
  U: 'D', D: 'U', R: 'L', L: 'R', F: 'B', B: 'F',
}
export const FACE_ORDER: Record<string, number> = {
  U: 0, D: 1, R: 0, L: 1, F: 0, B: 1,
}

export type MoveCategory = 'htm' | 'slice' | 'wide' | 'rotation'

export interface Move {
  readonly name: string
  readonly perm: readonly number[]
  readonly faceGroup: string
  readonly axis: 'x' | 'y' | 'z'
  readonly category: MoveCategory
}

type Sticker = readonly [Vec3, Vec3]

export interface CubeSpec {
  readonly N: number
  readonly stateSize: number
  readonly STICKERS: readonly Sticker[]
  readonly SOLVED: CubeState
  readonly BLANK: CubeState
  readonly FACE_INDEX_OFFSET: Record<string, number>
  readonly CENTER_INDICES: ReadonlySet<number>
  readonly ALL_MOVES: readonly Move[]
  readonly MOVE_REGISTRY: Record<string, Move>
  readonly HTM_FACES: readonly string[]
  readonly SLICE_FACES: readonly string[]
  readonly WIDE_FACES: readonly string[]
  readonly ROT_FACES: readonly string[]
  apply(state: CubeState, move: Move): CubeState
  applySequence(state: CubeState, moves: readonly Move[]): CubeState
  statesEqual(a: CubeState, b: CubeState): boolean
  clearState(): CubeState
}

// -------- Rotation matrices --------

const ROT_Y_CW: Mat3 = [[0, 0, -1], [0, 1, 0], [1, 0, 0]]
const ROT_Y_CCW: Mat3 = [[0, 0, 1], [0, 1, 0], [-1, 0, 0]]
const ROT_X_CW: Mat3 = [[1, 0, 0], [0, 0, 1], [0, -1, 0]]
const ROT_X_CCW: Mat3 = [[1, 0, 0], [0, 0, -1], [0, 1, 0]]
const ROT_Z_CW: Mat3 = [[0, 1, 0], [-1, 0, 0], [0, 0, 1]]
const ROT_Z_CCW: Mat3 = [[0, -1, 0], [1, 0, 0], [0, 0, 1]]

function mv(m: Mat3, v: Vec3): Vec3 {
  return [
    m[0][0] * v[0] + m[0][1] * v[1] + m[0][2] * v[2],
    m[1][0] * v[0] + m[1][1] * v[1] + m[1][2] * v[2],
    m[2][0] * v[0] + m[2][1] * v[1] + m[2][2] * v[2],
  ]
}

type Predicate = (pos: Vec3) => boolean

const EPS = 1e-6

const FACE_TO_AXIS: Record<string, 'x' | 'y' | 'z'> = {
  U: 'y', D: 'y', E: 'y',
  R: 'x', L: 'x', M: 'x',
  F: 'z', B: 'z', S: 'z',
  x: 'x', y: 'y', z: 'z',
}

function axisIndex(axis: 'x' | 'y' | 'z'): 0 | 1 | 2 {
  return axis === 'x' ? 0 : axis === 'y' ? 1 : 2
}

// sticker coord values along one axis: k - (N-1)/2 for k=0..N-1
function axisValues(N: number): number[] {
  const out: number[] = []
  for (let k = 0; k < N; k++) out.push(k - (N - 1) / 2)
  return out
}

function arrayEq(a: CubeState, b: CubeState): boolean {
  if (a.length !== b.length) return false
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false
  return true
}

function buildStickers(N: number): Sticker[] {
  const s: Sticker[] = []
  const vals = axisValues(N)
  const edge = (N - 1) / 2
  // U (y = +edge): rows by z (-..+), cols by x (-..+)
  for (const z of vals) for (const x of vals) s.push([[x, edge, z], [0, 1, 0]])
  // R (x = +edge): rows by y (+..-), cols by z (+..-)
  for (const y of [...vals].reverse()) for (const z of [...vals].reverse()) s.push([[edge, y, z], [1, 0, 0]])
  // F (z = +edge): rows by y, cols by x (-..+)
  for (const y of [...vals].reverse()) for (const x of vals) s.push([[x, y, edge], [0, 0, 1]])
  // D (y = -edge): rows by z (+..-), cols by x (-..+)
  for (const z of [...vals].reverse()) for (const x of vals) s.push([[x, -edge, z], [0, -1, 0]])
  // L (x = -edge): rows by y, cols by z (-..+)
  for (const y of [...vals].reverse()) for (const z of vals) s.push([[-edge, y, z], [-1, 0, 0]])
  // B (z = -edge): rows by y, cols by x (+..-)
  for (const y of [...vals].reverse()) for (const x of [...vals].reverse()) s.push([[x, y, -edge], [0, 0, -1]])
  return s
}

function makeKey(v: Vec3): string {
  const r = (x: number) => Math.abs(x) < EPS ? 0 : Math.round(x * 1000) / 1000
  return `${r(v[0])},${r(v[1])},${r(v[2])}`
}

function stickerKey(pos: Vec3, normal: Vec3): string {
  return `${makeKey(pos)}|${makeKey(normal)}`
}

function buildFaceOffsets(N: number): Record<string, number> {
  const f = N * N
  return { U: 0, R: f, F: 2 * f, D: 3 * f, L: 4 * f, B: 5 * f }
}

function buildCenterIndices(N: number, offsets: Record<string, number>): Set<number> {
  const out = new Set<number>()
  if (N % 2 !== 1) return out
  const mid = (N - 1) / 2
  const idxInFace = mid * N + mid
  for (const off of Object.values(offsets)) out.add(off + idxInFace)
  return out
}

function buildSolved(stickers: readonly Sticker[]): CubeState {
  const byNormal = new Map<string, number>([
    [makeKey([0, 1, 0]), FACE_COLOR.U],
    [makeKey([0, -1, 0]), FACE_COLOR.D],
    [makeKey([1, 0, 0]), FACE_COLOR.R],
    [makeKey([-1, 0, 0]), FACE_COLOR.L],
    [makeKey([0, 0, 1]), FACE_COLOR.F],
    [makeKey([0, 0, -1]), FACE_COLOR.B],
  ])
  return stickers.map(([, n]) => byNormal.get(makeKey(n))!)
}

function layerPred(axis: 'x' | 'y' | 'z', sign: 1 | -1, depth: number, N: number): Predicate {
  const ai = axisIndex(axis)
  const edge = (N - 1) / 2
  const threshold = edge - (depth - 1) - EPS
  return (pos) => pos[ai] * sign >= threshold
}

function midSlicePred(axis: 'x' | 'y' | 'z'): Predicate {
  const ai = axisIndex(axis)
  return (pos) => Math.abs(pos[ai]) < EPS
}

function allLayersPred(): Predicate {
  return () => true
}

function buildPerm(
  matrix: Mat3,
  pred: Predicate,
  stickers: readonly Sticker[],
  idx: Map<string, number>,
  size: number,
): readonly number[] {
  const perm = Array.from({ length: size }, (_, i) => i)
  for (let oldIdx = 0; oldIdx < size; oldIdx++) {
    const [pos, normal] = stickers[oldIdx]
    if (!pred(pos)) continue
    const np = mv(matrix, pos)
    const nn = mv(matrix, normal)
    const newIdx = idx.get(stickerKey(np, nn))
    if (newIdx === undefined) throw new Error('perm lookup failed')
    perm[newIdx] = oldIdx
  }
  return perm
}

function compose(p2: readonly number[], p1: readonly number[], size: number): readonly number[] {
  const out = new Array(size)
  for (let i = 0; i < size; i++) out[i] = p1[p2[i]]
  return out
}

function inverse(p: readonly number[], size: number): readonly number[] {
  const inv = new Array(size)
  for (let i = 0; i < size; i++) inv[p[i]] = i
  return inv
}

interface MoveDef {
  baseName: string
  matrix: Mat3
  pred: Predicate
  faceGroup: string
  axis: 'x' | 'y' | 'z'
  category: MoveCategory
}

function moveDefs(N: number): MoveDef[] {
  const defs: MoveDef[] = []

  const outer: Array<[string, Mat3, 'x' | 'y' | 'z', 1 | -1]> = [
    ['U', ROT_Y_CW, 'y', 1],
    ['D', ROT_Y_CCW, 'y', -1],
    ['R', ROT_X_CW, 'x', 1],
    ['L', ROT_X_CCW, 'x', -1],
    ['F', ROT_Z_CW, 'z', 1],
    ['B', ROT_Z_CCW, 'z', -1],
  ]

  for (const [face, matrix, axis, sign] of outer) {
    defs.push({
      baseName: face,
      matrix,
      pred: layerPred(axis, sign, 1, N),
      faceGroup: face,
      axis,
      category: 'htm',
    })
  }

  // Wide moves: depth 2..min(N-1, 2). Depth 2 = "Fw". (Deeper wides omitted for simplicity; only 2/3/4 cubes targeted.)
  const maxWideDepth = Math.min(N - 1, 2)
  for (const [face, matrix, axis, sign] of outer) {
    for (let depth = 2; depth <= maxWideDepth; depth++) {
      const name = depth === 2 ? face + 'w' : `${depth}${face}w`
      defs.push({
        baseName: name,
        matrix,
        pred: layerPred(axis, sign, depth, N),
        faceGroup: name,
        axis,
        category: 'wide',
      })
    }
  }

  // Slice moves.
  // N == 3: traditional middle slices M, E, S on the single central layer.
  // N == 4: inner single-layer slices r, l, u, d, f, b on the layer adjacent to the outer face
  //         (r = Rw R', matching common big-cube notation).
  if (N === 3) {
    defs.push({ baseName: 'M', matrix: ROT_X_CCW, pred: midSlicePred('x'), faceGroup: 'M', axis: 'x', category: 'slice' })
    defs.push({ baseName: 'E', matrix: ROT_Y_CCW, pred: midSlicePred('y'), faceGroup: 'E', axis: 'y', category: 'slice' })
    defs.push({ baseName: 'S', matrix: ROT_Z_CW, pred: midSlicePred('z'), faceGroup: 'S', axis: 'z', category: 'slice' })
  } else if (N === 4) {
    // Inner layer positions: for N=4, axis values are {-1.5, -0.5, 0.5, 1.5}.
    // Inner slice adjacent to positive outer face is at +0.5; adjacent to negative outer face is at -0.5.
    const innerPositive = (axis: 'x' | 'y' | 'z'): Predicate => {
      const ai = axisIndex(axis)
      return (pos) => Math.abs(pos[ai] - 0.5) < EPS
    }
    const innerNegative = (axis: 'x' | 'y' | 'z'): Predicate => {
      const ai = axisIndex(axis)
      return (pos) => Math.abs(pos[ai] + 0.5) < EPS
    }
    const inner: Array<[string, Mat3, 'x' | 'y' | 'z', 1 | -1]> = [
      ['u', ROT_Y_CW, 'y', 1],
      ['d', ROT_Y_CCW, 'y', -1],
      ['r', ROT_X_CW, 'x', 1],
      ['l', ROT_X_CCW, 'x', -1],
      ['f', ROT_Z_CW, 'z', 1],
      ['b', ROT_Z_CCW, 'z', -1],
    ]
    for (const [name, matrix, axis, sign] of inner) {
      defs.push({
        baseName: name,
        matrix,
        pred: sign === 1 ? innerPositive(axis) : innerNegative(axis),
        faceGroup: name,
        axis,
        category: 'slice',
      })
    }
  }

  // Rotations: always.
  defs.push({ baseName: 'x', matrix: ROT_X_CW, pred: allLayersPred(), faceGroup: 'x', axis: 'x', category: 'rotation' })
  defs.push({ baseName: 'y', matrix: ROT_Y_CW, pred: allLayersPred(), faceGroup: 'y', axis: 'y', category: 'rotation' })
  defs.push({ baseName: 'z', matrix: ROT_Z_CW, pred: allLayersPred(), faceGroup: 'z', axis: 'z', category: 'rotation' })

  return defs
}

function makeTriple(
  def: MoveDef,
  stickers: readonly Sticker[],
  idx: Map<string, number>,
  size: number,
): Move[] {
  const p1 = buildPerm(def.matrix, def.pred, stickers, idx, size)
  const p2 = compose(p1, p1, size)
  const pi = inverse(p1, size)
  const name = def.baseName
  return [
    { name, perm: p1, faceGroup: def.faceGroup, axis: def.axis, category: def.category },
    { name: name + "'", perm: pi, faceGroup: def.faceGroup, axis: def.axis, category: def.category },
    { name: name + '2', perm: p2, faceGroup: def.faceGroup, axis: def.axis, category: def.category },
  ]
}

const SPEC_CACHE = new Map<number, CubeSpec>()

export function createCube(N: number): CubeSpec {
  if (!Number.isInteger(N) || N < 2) throw new Error(`invalid cube size: ${N}`)
  const cached = SPEC_CACHE.get(N)
  if (cached) return cached

  const stateSize = 6 * N * N
  const stickers = buildStickers(N)
  if (stickers.length !== stateSize) throw new Error(`sticker count mismatch: ${stickers.length} vs ${stateSize}`)

  const idx = new Map<string, number>()
  for (let i = 0; i < stickers.length; i++) {
    const [p, n] = stickers[i]
    idx.set(stickerKey(p, n), i)
  }

  const offsets = buildFaceOffsets(N)
  const centerIndices = buildCenterIndices(N, offsets)
  const solved = buildSolved(stickers)
  const blank = Array(stateSize).fill(ANY) as CubeState

  const defs = moveDefs(N)
  const moves: Move[] = []
  for (const d of defs) moves.push(...makeTriple(d, stickers, idx, stateSize))
  const registry: Record<string, Move> = Object.fromEntries(moves.map((m) => [m.name, m]))

  const htmFaces: string[] = []
  const sliceFaces: string[] = []
  const wideFaces: string[] = []
  const rotFaces: string[] = []
  for (const d of defs) {
    if (d.category === 'htm') htmFaces.push(d.baseName)
    else if (d.category === 'slice') sliceFaces.push(d.baseName)
    else if (d.category === 'wide') wideFaces.push(d.baseName)
    else if (d.category === 'rotation') rotFaces.push(d.baseName)
  }

  const apply = (state: CubeState, move: Move): CubeState => {
    const p = move.perm
    const out = new Array<number>(stateSize)
    for (let i = 0; i < stateSize; i++) out[i] = state[p[i]]
    return out
  }

  const applySequence = (state: CubeState, moves: readonly Move[]): CubeState => {
    let s = state
    for (const m of moves) s = apply(s, m)
    return s
  }

  const clearState = (): CubeState => {
    const s = [...blank]
    if (N % 2 === 1) {
      const mid = (N - 1) / 2
      const idxInFace = mid * N + mid
      for (const [face, off] of Object.entries(offsets)) s[off + idxInFace] = FACE_COLOR[face]
    }
    return s
  }

  const spec: CubeSpec = {
    N,
    stateSize,
    STICKERS: stickers,
    SOLVED: solved,
    BLANK: blank,
    FACE_INDEX_OFFSET: offsets,
    CENTER_INDICES: centerIndices,
    ALL_MOVES: moves,
    MOVE_REGISTRY: registry,
    HTM_FACES: htmFaces,
    SLICE_FACES: sliceFaces,
    WIDE_FACES: wideFaces,
    ROT_FACES: rotFaces,
    apply,
    applySequence,
    statesEqual: arrayEq,
    clearState,
  }

  selfTest(spec)
  SPEC_CACHE.set(N, spec)
  return spec
}

// -------- Self-test --------

function selfTest(spec: CubeSpec) {
  const { MOVE_REGISTRY, SOLVED, apply, applySequence, HTM_FACES } = spec
  for (const face of HTM_FACES) {
    const move = MOVE_REGISTRY[face]
    let s: CubeState = SOLVED
    for (let i = 0; i < 4; i++) s = apply(s, move)
    if (!arrayEq(s, SOLVED)) throw new Error(`${face}^4 != solved (N=${spec.N})`)
    const inv = MOVE_REGISTRY[face + "'"]
    const s2 = apply(apply(SOLVED, move), inv)
    if (!arrayEq(s2, SOLVED)) throw new Error(`${face} ${face}' != solved (N=${spec.N})`)
    const dbl = MOVE_REGISTRY[face + '2']
    const s3 = apply(apply(SOLVED, move), move)
    const s4 = apply(SOLVED, dbl)
    if (!arrayEq(s3, s4)) throw new Error(`${face} ${face} != ${face}2 (N=${spec.N})`)
  }
  if (MOVE_REGISTRY['R'] && MOVE_REGISTRY['U']) {
    const seqNames: string[] = []
    for (let i = 0; i < 6; i++) seqNames.push('R', 'U', "R'", "U'")
    const seq = seqNames.map((n) => MOVE_REGISTRY[n])
    const sx = applySequence(SOLVED, seq)
    if (!arrayEq(sx, SOLVED)) throw new Error(`(R U R' U')^6 != solved (N=${spec.N})`)
  }
  const yMove = MOVE_REGISTRY.y
  let sy: CubeState = SOLVED
  for (let i = 0; i < 4; i++) sy = apply(sy, yMove)
  if (!arrayEq(sy, SOLVED)) throw new Error(`y^4 != solved (N=${spec.N})`)
}

// Used by FACE_TO_AXIS and callers needing axis metadata.
export function faceToAxis(face: string): 'x' | 'y' | 'z' | undefined {
  if (face in FACE_TO_AXIS) return FACE_TO_AXIS[face]
  // Parse prefixed wide like "3Fw" or "Fw"
  const match = /^\d*([UDRLFB])w$/.exec(face)
  if (match) return FACE_TO_AXIS[match[1]]
  return undefined
}

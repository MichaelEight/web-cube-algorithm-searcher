// 3x3 Rubik's cube state model, sticker layout, and move permutations.
//
// Sticker layout (0-53):
//                 0  1  2
//                 3  4  5
//                 6  7  8
//    36 37 38    18 19 20     9 10 11    45 46 47
//    39 40 41    21 22 23    12 13 14    48 49 50
//    42 43 44    24 25 26    15 16 17    51 52 53
//                27 28 29
//                30 31 32
//                33 34 35
//
// Faces: U=0-8, R=9-17, F=18-26, D=27-35, L=36-44, B=45-53.

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

// -------- Sticker table --------

type Sticker = readonly [Vec3, Vec3] // (position, outward normal)

function buildStickers(): Sticker[] {
  const s: Sticker[] = []
  // U (y=+1): rows by z (-1..+1), cols by x (-1..+1)
  for (const z of [-1, 0, 1]) for (const x of [-1, 0, 1]) s.push([[x, 1, z], [0, 1, 0]])
  // R (x=+1): rows by y (+1..-1), cols by z (+1..-1)
  for (const y of [1, 0, -1]) for (const z of [1, 0, -1]) s.push([[1, y, z], [1, 0, 0]])
  // F (z=+1): rows by y, cols by x (-1..+1)
  for (const y of [1, 0, -1]) for (const x of [-1, 0, 1]) s.push([[x, y, 1], [0, 0, 1]])
  // D (y=-1): rows by z (+1..-1), cols by x (-1..+1)
  for (const z of [1, 0, -1]) for (const x of [-1, 0, 1]) s.push([[x, -1, z], [0, -1, 0]])
  // L (x=-1): rows by y, cols by z (-1..+1)
  for (const y of [1, 0, -1]) for (const z of [-1, 0, 1]) s.push([[-1, y, z], [-1, 0, 0]])
  // B (z=-1): rows by y, cols by x (+1..-1)
  for (const y of [1, 0, -1]) for (const x of [1, 0, -1]) s.push([[x, y, -1], [0, 0, -1]])
  return s
}

export const STICKERS: readonly Sticker[] = buildStickers()
if (STICKERS.length !== 54) throw new Error('sticker count')

const STICKER_INDEX = new Map<string, number>()
for (let i = 0; i < STICKERS.length; i++) {
  const [p, n] = STICKERS[i]
  STICKER_INDEX.set(`${p[0]},${p[1]},${p[2]}|${n[0]},${n[1]},${n[2]}`, i)
}

export const FACE_INDEX_OFFSET: Record<string, number> = {
  U: 0, R: 9, F: 18, D: 27, L: 36, B: 45,
}

export const CENTER_INDICES: ReadonlySet<number> = new Set([4, 13, 22, 31, 40, 49])

// -------- Solved + blank --------

function buildSolved(): CubeState {
  const byNormal = new Map<string, number>([
    ['0,1,0', FACE_COLOR.U],
    ['0,-1,0', FACE_COLOR.D],
    ['1,0,0', FACE_COLOR.R],
    ['-1,0,0', FACE_COLOR.L],
    ['0,0,1', FACE_COLOR.F],
    ['0,0,-1', FACE_COLOR.B],
  ])
  return STICKERS.map(([, n]) => byNormal.get(`${n[0]},${n[1]},${n[2]}`)!)
}

export const SOLVED: CubeState = buildSolved()
export const BLANK: CubeState = Array(54).fill(ANY)

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

type Predicate = (pos: Vec3, normal: Vec3) => boolean

function buildPerm(matrix: Mat3, pred: Predicate): readonly number[] {
  const perm = Array.from({ length: 54 }, (_, i) => i)
  for (let oldIdx = 0; oldIdx < 54; oldIdx++) {
    const [pos, normal] = STICKERS[oldIdx]
    if (!pred(pos, normal)) continue
    const np = mv(matrix, pos)
    const nn = mv(matrix, normal)
    const key = `${np[0]},${np[1]},${np[2]}|${nn[0]},${nn[1]},${nn[2]}`
    const newIdx = STICKER_INDEX.get(key)
    if (newIdx === undefined) throw new Error('perm lookup failed')
    perm[newIdx] = oldIdx
  }
  return perm
}

function compose(p2: readonly number[], p1: readonly number[]): readonly number[] {
  const out = new Array(54)
  for (let i = 0; i < 54; i++) out[i] = p1[p2[i]]
  return out
}

function inverse(p: readonly number[]): readonly number[] {
  const inv = new Array(54)
  for (let i = 0; i < 54; i++) inv[p[i]] = i
  return inv
}

const onLayer = (axis: 0 | 1 | 2, value: number): Predicate => (pos) => pos[axis] === value
const onLayerGeq = (axis: 0 | 1 | 2, value: number): Predicate => (pos) => pos[axis] >= value
const onLayerLeq = (axis: 0 | 1 | 2, value: number): Predicate => (pos) => pos[axis] <= value
const allLayers: Predicate = () => true

// -------- Move definitions --------

const ATOMIC: Record<string, [Mat3, Predicate]> = {
  U: [ROT_Y_CW, onLayer(1, 1)],
  D: [ROT_Y_CCW, onLayer(1, -1)],
  R: [ROT_X_CW, onLayer(0, 1)],
  L: [ROT_X_CCW, onLayer(0, -1)],
  F: [ROT_Z_CW, onLayer(2, 1)],
  B: [ROT_Z_CCW, onLayer(2, -1)],
  M: [ROT_X_CCW, onLayer(0, 0)],
  E: [ROT_Y_CCW, onLayer(1, 0)],
  S: [ROT_Z_CW, onLayer(2, 0)],
  Uw: [ROT_Y_CW, onLayerGeq(1, 0)],
  Dw: [ROT_Y_CCW, onLayerLeq(1, 0)],
  Rw: [ROT_X_CW, onLayerGeq(0, 0)],
  Lw: [ROT_X_CCW, onLayerLeq(0, 0)],
  Fw: [ROT_Z_CW, onLayerGeq(2, 0)],
  Bw: [ROT_Z_CCW, onLayerLeq(2, 0)],
  x: [ROT_X_CW, allLayers],
  y: [ROT_Y_CW, allLayers],
  z: [ROT_Z_CW, allLayers],
}

export const HTM_FACES = ['U', 'D', 'R', 'L', 'F', 'B']
export const SLICE_FACES = ['M', 'E', 'S']
export const WIDE_FACES = ['Uw', 'Dw', 'Rw', 'Lw', 'Fw', 'Bw']
export const ROT_FACES = ['x', 'y', 'z']

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

const FACE_TO_AXIS: Record<string, 'x' | 'y' | 'z'> = {
  U: 'y', D: 'y', E: 'y', Uw: 'y', Dw: 'y', y: 'y',
  R: 'x', L: 'x', M: 'x', Rw: 'x', Lw: 'x', x: 'x',
  F: 'z', B: 'z', S: 'z', Fw: 'z', Bw: 'z', z: 'z',
}

function makeTriple(face: string, category: MoveCategory): Move[] {
  const [matrix, pred] = ATOMIC[face]
  const p1 = buildPerm(matrix, pred)
  const p2 = compose(p1, p1)
  const pi = inverse(p1)
  const axis = FACE_TO_AXIS[face]
  return [
    { name: face, perm: p1, faceGroup: face, axis, category },
    { name: face + "'", perm: pi, faceGroup: face, axis, category },
    { name: face + '2', perm: p2, faceGroup: face, axis, category },
  ]
}

function buildRegistry(): Move[] {
  const moves: Move[] = []
  for (const f of HTM_FACES) moves.push(...makeTriple(f, 'htm'))
  for (const f of SLICE_FACES) moves.push(...makeTriple(f, 'slice'))
  for (const f of WIDE_FACES) moves.push(...makeTriple(f, 'wide'))
  for (const f of ROT_FACES) moves.push(...makeTriple(f, 'rotation'))
  return moves
}

export const ALL_MOVES: readonly Move[] = buildRegistry()
export const MOVE_REGISTRY: Record<string, Move> = Object.fromEntries(
  ALL_MOVES.map((m) => [m.name, m]),
)

export function apply(state: CubeState, move: Move): CubeState {
  const p = move.perm
  const out = new Array<number>(54)
  for (let i = 0; i < 54; i++) out[i] = state[p[i]]
  return out
}

export function applySequence(state: CubeState, moves: readonly Move[]): CubeState {
  let s = state
  for (const m of moves) s = apply(s, m)
  return s
}

// -------- Self-test --------

function selfTest() {
  for (const face of HTM_FACES) {
    const move = MOVE_REGISTRY[face]
    let s: CubeState = SOLVED
    for (let i = 0; i < 4; i++) s = apply(s, move)
    if (!arrayEq(s, SOLVED)) throw new Error(`${face}^4 != solved`)
    const inv = MOVE_REGISTRY[face + "'"]
    const s2 = apply(apply(SOLVED, move), inv)
    if (!arrayEq(s2, SOLVED)) throw new Error(`${face} ${face}' != solved`)
    const dbl = MOVE_REGISTRY[face + '2']
    const s3 = apply(apply(SOLVED, move), move)
    const s4 = apply(SOLVED, dbl)
    if (!arrayEq(s3, s4)) throw new Error(`${face} ${face} != ${face}2`)
  }
  const seqNames: string[] = []
  for (let i = 0; i < 6; i++) seqNames.push('R', 'U', "R'", "U'")
  const seq = seqNames.map((n) => MOVE_REGISTRY[n])
  const sx = applySequence(SOLVED, seq)
  if (!arrayEq(sx, SOLVED)) throw new Error("(R U R' U')^6 != solved")
  const yMove = MOVE_REGISTRY.y
  let sy: CubeState = SOLVED
  for (let i = 0; i < 4; i++) sy = apply(sy, yMove)
  if (!arrayEq(sy, SOLVED)) throw new Error('y^4 != solved')
}

function arrayEq(a: CubeState, b: CubeState): boolean {
  if (a.length !== b.length) return false
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false
  return true
}

export function statesEqual(a: CubeState, b: CubeState): boolean {
  return arrayEq(a, b)
}

selfTest()

import { COLOR_HEX, type CubeSpec, type CubeState } from '../cube/cube'

const COS30 = 0.8660254037844387

type FaceDef = {
  tl: [number, number, number]
  col: [number, number, number]
  row: [number, number, number]
}

function faceDefsFor(N: number): Record<'U' | 'F' | 'R', FaceDef> {
  const e = N / 2
  return {
    U: { tl: [-e, e, -e], col: [1, 0, 0], row: [0, 0, 1] },
    F: { tl: [-e, e, e], col: [1, 0, 0], row: [0, -1, 0] },
    R: { tl: [e, e, e], col: [0, 0, -1], row: [0, -1, 0] },
  }
}

interface Props {
  cube: CubeSpec
  state: CubeState
  scale?: number
  onActivate?: () => void
}

interface Quad {
  points: string
  fill: string
  key: string
}

function buildQuads(cube: CubeSpec, state: CubeState, width: number, height: number, scale: number): Quad[] {
  const N = cube.N
  const origin: [number, number] = [width / 2, height / 2]
  const project = (p: [number, number, number]): [number, number] => {
    const [x, y, z] = p
    const sx = (x - z) * COS30
    const sy = y - (x + z) * 0.5
    return [origin[0] + scale * sx, origin[1] - scale * sy]
  }
  const defs = faceDefsFor(N)
  const quads: Quad[] = []
  for (const face of ['U', 'F', 'R'] as const) {
    const { tl, col, row } = defs[face]
    for (let r = 0; r < N; r++) {
      for (let c = 0; c < N; c++) {
        const p0: [number, number, number] = [
          tl[0] + c * col[0] + r * row[0],
          tl[1] + c * col[1] + r * row[1],
          tl[2] + c * col[2] + r * row[2],
        ]
        const p1: [number, number, number] = [p0[0] + col[0], p0[1] + col[1], p0[2] + col[2]]
        const p2: [number, number, number] = [p1[0] + row[0], p1[1] + row[1], p1[2] + row[2]]
        const p3: [number, number, number] = [p0[0] + row[0], p0[1] + row[1], p0[2] + row[2]]
        const pts = [p0, p1, p2, p3].map(project).map(([x, y]) => `${x},${y}`).join(' ')
        const idx = cube.FACE_INDEX_OFFSET[face] + N * r + c
        quads.push({ points: pts, fill: COLOR_HEX[state[idx]], key: `${face}-${r}-${c}` })
      }
    }
  }
  return quads
}

export function Cube3D({ cube, state, scale = 22, onActivate }: Props) {
  const N = cube.N
  const width = Math.round(scale * 2 * N * COS30) + 12
  const height = scale * 2 * N + 12
  const quads = buildQuads(cube, state, width, height, scale)
  return (
    <svg
      className={`cube-3d${onActivate ? ' clickable' : ''}`}
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      onPointerDown={onActivate}
    >
      {quads.map((q) => (
        <polygon key={q.key} points={q.points} fill={q.fill} stroke="#000" strokeWidth={1} />
      ))}
    </svg>
  )
}

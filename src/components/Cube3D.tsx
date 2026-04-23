import { COLOR_HEX, FACE_INDEX_OFFSET, type CubeState } from '../cube/cube'

const COS30 = 0.8660254037844387

type FaceDef = {
  tl: [number, number, number]
  col: [number, number, number]
  row: [number, number, number]
}

const FACE_DEFS: Record<'U' | 'F' | 'R', FaceDef> = {
  U: { tl: [-1.5, 1.5, -1.5], col: [1, 0, 0], row: [0, 0, 1] },
  F: { tl: [-1.5, 1.5, 1.5], col: [1, 0, 0], row: [0, -1, 0] },
  R: { tl: [1.5, 1.5, 1.5], col: [0, 0, -1], row: [0, -1, 0] },
}

interface Props {
  state: CubeState
  scale?: number
  onActivate?: () => void
}

interface Quad {
  points: string
  fill: string
  key: string
}

function buildQuads(state: CubeState, width: number, height: number, scale: number): Quad[] {
  const origin: [number, number] = [width / 2, height / 2]
  const project = (p: [number, number, number]): [number, number] => {
    const [x, y, z] = p
    const sx = (x - z) * COS30
    const sy = y - (x + z) * 0.5
    return [origin[0] + scale * sx, origin[1] - scale * sy]
  }
  const quads: Quad[] = []
  for (const face of ['U', 'F', 'R'] as const) {
    const { tl, col, row } = FACE_DEFS[face]
    for (let r = 0; r < 3; r++) {
      for (let c = 0; c < 3; c++) {
        const p0: [number, number, number] = [
          tl[0] + c * col[0] + r * row[0],
          tl[1] + c * col[1] + r * row[1],
          tl[2] + c * col[2] + r * row[2],
        ]
        const p1: [number, number, number] = [p0[0] + col[0], p0[1] + col[1], p0[2] + col[2]]
        const p2: [number, number, number] = [p1[0] + row[0], p1[1] + row[1], p1[2] + row[2]]
        const p3: [number, number, number] = [p0[0] + row[0], p0[1] + row[1], p0[2] + row[2]]
        const pts = [p0, p1, p2, p3].map(project).map(([x, y]) => `${x},${y}`).join(' ')
        const idx = FACE_INDEX_OFFSET[face] + 3 * r + c
        quads.push({ points: pts, fill: COLOR_HEX[state[idx]], key: `${face}-${r}-${c}` })
      }
    }
  }
  return quads
}

export function Cube3D({ state, scale = 22, onActivate }: Props) {
  const width = Math.round(scale * 6 * COS30) + 12
  const height = scale * 6 + 12
  const quads = buildQuads(state, width, height, scale)
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

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  ANY,
  CENTER_INDICES,
  COLOR_HEX,
  FACE_INDEX_OFFSET,
  MOVE_REGISTRY,
  apply,
  type CubeState,
} from '../cube/cube'

const FACE_GRID_POS: Record<string, [number, number]> = {
  U: [0, 1],
  L: [1, 0],
  F: [1, 1],
  R: [1, 2],
  B: [1, 3],
  D: [2, 1],
}

function stickerIdx(face: string, row: number, col: number): number {
  return FACE_INDEX_OFFSET[face] + 3 * row + col
}

interface Props {
  state: CubeState
  onChange: (state: CubeState) => void
  selectedColor: number
  stickerSize?: number
  stickerGap?: number
  faceGap?: number
}

interface StickerMeta {
  idx: number
  x: number
  y: number
}

interface Layout {
  layout: StickerMeta[]
  width: number
  height: number
  facePx: number
  stickerSize: number
  stickerGap: number
  faceGap: number
}

function buildLayout(stickerSize: number, stickerGap: number, faceGap: number): Layout {
  const facePx = 3 * stickerSize + 2 * stickerGap
  const out: StickerMeta[] = []
  for (const [face, [gr, gc]] of Object.entries(FACE_GRID_POS)) {
    const x0 = gc * (facePx + faceGap)
    const y0 = gr * (facePx + faceGap)
    for (let r = 0; r < 3; r++) {
      for (let c = 0; c < 3; c++) {
        const idx = stickerIdx(face, r, c)
        const sx = x0 + c * (stickerSize + stickerGap)
        const sy = y0 + r * (stickerSize + stickerGap)
        out.push({ idx, x: sx, y: sy })
      }
    }
  }
  return {
    layout: out,
    width: 4 * facePx + 3 * faceGap,
    height: 3 * facePx + 2 * faceGap,
    facePx,
    stickerSize,
    stickerGap,
    faceGap,
  }
}

function indexAt(L: Layout, x: number, y: number): number | null {
  for (const [face, [gr, gc]] of Object.entries(FACE_GRID_POS)) {
    const fx0 = gc * (L.facePx + L.faceGap)
    const fy0 = gr * (L.facePx + L.faceGap)
    if (x < fx0 || x >= fx0 + L.facePx) continue
    if (y < fy0 || y >= fy0 + L.facePx) continue
    const lx = x - fx0
    const ly = y - fy0
    if (lx % (L.stickerSize + L.stickerGap) >= L.stickerSize) return null
    if (ly % (L.stickerSize + L.stickerGap) >= L.stickerSize) return null
    const col = Math.floor(lx / (L.stickerSize + L.stickerGap))
    const row = Math.floor(ly / (L.stickerSize + L.stickerGap))
    if (col > 2 || row > 2) return null
    return stickerIdx(face, row, col)
  }
  return null
}

const BASE_MAP: Record<string, string> = {
  r: 'R', l: 'L', u: 'U', d: 'D', f: 'F', b: 'B',
  m: 'M', e: 'E', s: 'S',
  x: 'x', y: 'y', z: 'z',
}

export function CubeNet({ state, onChange, selectedColor, stickerSize = 20, stickerGap = 2, faceGap = 4 }: Props) {
  const svgRef = useRef<SVGSVGElement>(null)
  const [dragging, setDragging] = useState<'left' | 'right' | null>(null)
  const stateRef = useRef(state)
  stateRef.current = state

  const L = useMemo(() => buildLayout(stickerSize, stickerGap, faceGap), [stickerSize, stickerGap, faceGap])

  const paint = useCallback((idx: number, color: number) => {
    if (CENTER_INDICES.has(idx)) return
    const cur = stateRef.current
    if (cur[idx] === color) return
    const next = cur.slice()
    next[idx] = color
    onChange(next)
  }, [onChange])

  const idxFromEvent = useCallback((e: React.PointerEvent<SVGSVGElement>): number | null => {
    const rect = svgRef.current?.getBoundingClientRect()
    if (!rect) return null
    const x = (e.clientX - rect.left) * (L.width / rect.width)
    const y = (e.clientY - rect.top) * (L.height / rect.height)
    return indexAt(L, x, y)
  }, [L])

  const onPointerDown = (e: React.PointerEvent<SVGSVGElement>) => {
    svgRef.current?.focus()
    const idx = idxFromEvent(e)
    if (idx === null) return
    try { svgRef.current?.setPointerCapture(e.pointerId) } catch {
      // no-op
    }
    if (e.button === 2) {
      e.preventDefault()
      setDragging('right')
      paint(idx, ANY)
    } else {
      setDragging('left')
      paint(idx, selectedColor)
    }
  }

  const onPointerMove = (e: React.PointerEvent<SVGSVGElement>) => {
    if (!dragging) return
    const idx = idxFromEvent(e)
    if (idx === null) return
    paint(idx, dragging === 'right' ? ANY : selectedColor)
  }

  const onPointerUp = (e: React.PointerEvent<SVGSVGElement>) => {
    setDragging(null)
    if (svgRef.current?.hasPointerCapture(e.pointerId)) {
      svgRef.current.releasePointerCapture(e.pointerId)
    }
  }

  const onContextMenu = (e: React.MouseEvent) => { e.preventDefault() }

  const onKeyDown = useCallback((e: React.KeyboardEvent<SVGSVGElement>) => {
    const key = e.key
    const low = key.toLowerCase()
    if (!(low in BASE_MAP)) return
    const base = BASE_MAP[low]
    let name = base
    if (e.altKey) name = base + '2'
    else if (e.shiftKey) name = base + "'"
    const mv = MOVE_REGISTRY[name]
    if (!mv) return
    e.preventDefault()
    onChange(apply(stateRef.current, mv))
  }, [onChange])

  useEffect(() => {
    const handler = (e: Event) => e.preventDefault()
    const el = svgRef.current
    el?.addEventListener('contextmenu', handler)
    return () => el?.removeEventListener('contextmenu', handler)
  }, [])

  return (
    <svg
      ref={svgRef}
      className="sticker-net"
      width={L.width}
      height={L.height}
      viewBox={`0 0 ${L.width} ${L.height}`}
      tabIndex={0}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onContextMenu={onContextMenu}
      onKeyDown={onKeyDown}
    >
      {L.layout.map(({ idx, x, y }) => (
        <rect
          key={idx}
          className={`sticker${CENTER_INDICES.has(idx) ? ' center' : ''}`}
          x={x}
          y={y}
          width={L.stickerSize}
          height={L.stickerSize}
          fill={COLOR_HEX[state[idx]]}
        />
      ))}
    </svg>
  )
}

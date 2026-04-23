import { ANY, COLOR_HEX, W, Y, G, B, R, O } from '../cube/cube'

export const PALETTE = [W, Y, G, B, R, O, ANY] as const
export const PALETTE_LABELS: Record<number, string> = {
  [W]: 'W', [Y]: 'Y', [G]: 'G', [B]: 'B', [R]: 'R', [O]: 'O', [ANY]: '?',
}
export const PALETTE_NAMES: Record<number, string> = {
  [W]: 'White', [Y]: 'Yellow', [G]: 'Green', [B]: 'Blue', [R]: 'Red', [O]: 'Orange', [ANY]: "Don't care",
}

function contrast(hex: string): string {
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  return (r * 299 + g * 587 + b * 114) / 1000 > 140 ? '#000000' : '#ffffff'
}

interface Props {
  active: number
  onSelect: (code: number) => void
  direction?: 'horizontal' | 'vertical'
}

export function Palette({ active, onSelect, direction = 'horizontal' }: Props) {
  return (
    <div className={`palette palette-${direction}`}>
      {PALETTE.map((code, i) => (
        <button
          key={code}
          className={`palette-btn${active === code ? ' active' : ''}`}
          style={{ background: COLOR_HEX[code], color: contrast(COLOR_HEX[code]) }}
          onClick={() => onSelect(code)}
          title={`${PALETTE_NAMES[code]}  (${i + 1})`}
          aria-label={PALETTE_NAMES[code]}
        >
          {PALETTE_LABELS[code]}
        </button>
      ))}
    </div>
  )
}

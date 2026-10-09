import type { Direction } from '../api/types'

/** Says in a shape which way a value moved; the signed number beside it says it in text. */
export function DirectionArrow({ direction }: { direction: Direction }) {
  if (direction === 'equal') return null
  return (
    <svg
      width={14}
      height={14}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2.4}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      className="inline-block shrink-0 align-[-0.1em]"
    >
      <path d={direction === 'up' ? 'M12 19V5M5 12l7-7 7 7' : 'M12 5v14M5 12l7 7 7-7'} />
    </svg>
  )
}

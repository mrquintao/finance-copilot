import duck from '../../assets/copilot-duck.png'

/**
 * The Copilot's mascot on its petrol ground. The drawing is white on black; `mix-blend-screen`
 * lets the ground show through the black, so the duck keeps its own lines in both themes.
 * Decorative by default: the control or message it sits in carries the name.
 */
export function DuckAvatar({ className = '' }: { className?: string }) {
  return (
    <span
      className={`inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-rail ${className}`}
    >
      <img
        src={duck}
        alt=""
        width={256}
        height={256}
        draggable={false}
        className="size-full object-contain mix-blend-screen"
      />
    </span>
  )
}

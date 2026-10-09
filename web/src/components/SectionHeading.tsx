import type { ReactNode } from 'react'

interface SectionHeadingProps {
  id?: string
  children: ReactNode
  /** A short note or link on the same line, such as a chart key. */
  aside?: ReactNode
}

export function SectionHeading({ id, children, aside }: SectionHeadingProps) {
  return (
    <div className="flex min-h-13.5 flex-wrap items-center justify-between gap-x-6 gap-y-1 border-b-2 border-ink pb-2">
      <h2 id={id} className="text-base font-extrabold tracking-[0.03em] uppercase font-stretch-[85%]">
        {children}
      </h2>
      {aside && <div className="text-sm text-ink-soft">{aside}</div>}
    </div>
  )
}

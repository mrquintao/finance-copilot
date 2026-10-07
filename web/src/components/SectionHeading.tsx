import type { ReactNode } from 'react'

export function SectionHeading({ id, children }: { id?: string; children: ReactNode }) {
  return (
    <h2 id={id} className="label-caps border-b border-line-strong pb-2">
      {children}
    </h2>
  )
}

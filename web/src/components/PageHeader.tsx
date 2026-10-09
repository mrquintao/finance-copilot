import type { ReactNode } from 'react'

/** The page title, its browser tab title and the controls that scope the whole page. */
export function PageHeader({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <header className="mb-6 flex flex-col gap-4 border-b-[3px] border-ink pb-4 lg:flex-row lg:items-start lg:justify-between">
      <title>{`${title} · Finance Copilot`}</title>
      <h1 className="pr-12 text-2xl font-extrabold font-stretch-[80%] md:pr-0 lg:pt-1.5">{title}</h1>
      {children}
    </header>
  )
}

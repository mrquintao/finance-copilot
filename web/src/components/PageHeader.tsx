// The heavy rule under the title is the one strong line on each page; everything below it
// is separated by hairlines.
export function PageHeader({ title }: { title: string }) {
  return (
    <header className="mb-5 border-b border-ink pb-3">
      <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
    </header>
  )
}

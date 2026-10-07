import { Spinner } from '../Spinner'

export function LoadingState({ label }: { label: string }) {
  return (
    <div role="status" className="flex items-center gap-3 py-10 text-sm text-ink-soft">
      <Spinner />
      <span>{label}</span>
    </div>
  )
}

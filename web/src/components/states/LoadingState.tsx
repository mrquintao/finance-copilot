export function LoadingState({ label }: { label: string }) {
  return (
    <div role="status" className="flex flex-col items-center gap-3 px-6 py-12 text-slate-500">
      <span
        aria-hidden
        className="size-7 animate-spin rounded-full border-2 border-slate-300 border-t-teal-600 dark:border-slate-700 dark:border-t-teal-400"
      />
      <span className="text-sm">{label}</span>
    </div>
  )
}

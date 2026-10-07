// Sync run timestamps are real instants (ISO 8601 with offset), unlike transaction dates.
const formatter = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' })

export function formatDateTime(iso: string): string {
  const instant = new Date(iso)
  return Number.isNaN(instant.getTime()) ? '—' : formatter.format(instant)
}

/** Elapsed time between two instants, e.g. "5 s" or "2 min 05 s". */
export function formatDuration(startIso: string, endIso: string): string | null {
  const elapsed = new Date(endIso).getTime() - new Date(startIso).getTime()
  if (Number.isNaN(elapsed) || elapsed < 0) return null
  const seconds = Math.round(elapsed / 1000)
  if (seconds < 60) return `${seconds} s`
  return `${Math.floor(seconds / 60)} min ${String(seconds % 60).padStart(2, '0')} s`
}

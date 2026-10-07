// Sync run timestamps are real instants (ISO 8601 with offset), unlike transaction dates.
const formatter = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' })

export function formatDateTime(iso: string): string {
  const instant = new Date(iso)
  return Number.isNaN(instant.getTime()) ? '—' : formatter.format(instant)
}

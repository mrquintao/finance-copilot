import { useState, type FormEvent } from 'react'
import { usePeriod } from '../hooks/usePeriod'
import { isValidPeriod, periodLabel, PRESETS, type Period } from '../lib/period'
import { Button } from './Button'

// One segmented control: the options share a frame and hairlines instead of being four
// separate buttons. Two rows on a phone, one row from sm up.
const segment = (active: boolean) =>
  `min-h-10 px-3 text-[0.8125rem] transition-colors ${
    active
      ? 'bg-brand-soft font-semibold text-accent'
      : 'bg-raised font-medium text-ink-soft hover:text-ink active:bg-surface'
  }`

const dateInput =
  'mt-1 block min-h-11 w-full rounded-ctl border border-line-strong bg-raised px-3 text-base tabular-nums'

export function PeriodFilter() {
  const { selection, period, setSelection } = usePeriod()
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState<Period>(period)

  const customActive = editing || selection.kind === 'custom'
  const draftComplete = draft.start !== '' && draft.end !== ''
  const draftValid = isValidPeriod(draft.start, draft.end)

  function startEditing() {
    if (editing) return
    setDraft(period)
    setEditing(true)
  }

  function apply(event: FormEvent) {
    event.preventDefault()
    if (!draftValid) return
    setSelection({ kind: 'custom', start: draft.start, end: draft.end })
    setEditing(false)
  }

  return (
    <section aria-label="Período" className="mb-7">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="grid grid-cols-2 gap-px overflow-hidden rounded-ctl border border-line-strong bg-line-strong sm:flex">
          {PRESETS.map((preset) => {
            const active = !customActive && selection.kind === preset.id
            return (
              <button
                key={preset.id}
                type="button"
                aria-pressed={active}
                className={segment(active)}
                onClick={() => {
                  setEditing(false)
                  setSelection({ kind: preset.id })
                }}
              >
                {preset.label}
              </button>
            )
          })}
          <button
            type="button"
            aria-pressed={customActive}
            className={segment(customActive)}
            onClick={startEditing}
          >
            Personalizado
          </button>
        </div>
        <p className="text-sm text-ink-soft">
          <span className="label-caps mr-2">Período</span>
          <span className="font-medium text-ink tabular-nums">{periodLabel(period)}</span>
        </p>
      </div>

      {customActive && (
        <form
          onSubmit={apply}
          className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-[11rem_11rem_auto] sm:justify-start"
        >
          <label className="text-xs font-medium text-ink-soft">
            De
            <input
              type="date"
              required
              className={dateInput}
              value={editing ? draft.start : period.start}
              onFocus={startEditing}
              onChange={(event) => setDraft({ ...draft, start: event.target.value })}
            />
          </label>
          <label className="text-xs font-medium text-ink-soft">
            Até
            <input
              type="date"
              required
              className={dateInput}
              value={editing ? draft.end : period.end}
              onFocus={startEditing}
              onChange={(event) => setDraft({ ...draft, end: event.target.value })}
            />
          </label>
          <Button
            type="submit"
            disabled={!editing || !draftValid}
            className="col-span-2 sm:col-span-1 sm:self-end"
          >
            Aplicar
          </Button>
          {editing && draftComplete && !draftValid && (
            <p role="alert" className="col-span-full text-sm text-danger">
              A data inicial deve ser anterior ou igual à data final.
            </p>
          )}
        </form>
      )}
    </section>
  )
}

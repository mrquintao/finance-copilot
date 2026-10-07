import { useState, type FormEvent } from 'react'
import { usePeriod } from '../hooks/usePeriod'
import { isValidPeriod, periodLabel, PRESETS, type Period } from '../lib/period'
import { Button } from './Button'

const chip = (active: boolean) =>
  `min-h-10 shrink-0 rounded-full px-4 text-sm font-medium transition-colors ${
    active
      ? 'bg-teal-700 text-white dark:bg-teal-500 dark:text-slate-950'
      : 'bg-white text-slate-700 ring-1 ring-slate-200 ring-inset hover:bg-slate-100 dark:bg-slate-900 dark:text-slate-300 dark:ring-slate-800 dark:hover:bg-slate-800'
  }`

const dateInput =
  'mt-1 block min-h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-base dark:border-slate-700 dark:bg-slate-900'

export function PeriodFilter() {
  const { selection, period, setSelection } = usePeriod()
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState<Period>(period)

  const customActive = editing || selection.kind === 'custom'
  const draftComplete = draft.start !== '' && draft.end !== ''
  const draftValid = isValidPeriod(draft.start, draft.end)

  function apply(event: FormEvent) {
    event.preventDefault()
    if (!draftValid) return
    setSelection({ kind: 'custom', start: draft.start, end: draft.end })
    setEditing(false)
  }

  return (
    <section aria-label="Período" className="mb-5">
      <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 md:mx-0 md:flex-wrap md:px-0">
        {PRESETS.map((preset) => (
          <button
            key={preset.id}
            type="button"
            aria-pressed={!customActive && selection.kind === preset.id}
            className={chip(!customActive && selection.kind === preset.id)}
            onClick={() => {
              setEditing(false)
              setSelection({ kind: preset.id })
            }}
          >
            {preset.label}
          </button>
        ))}
        <button
          type="button"
          aria-pressed={customActive}
          className={chip(customActive)}
          onClick={() => {
            setDraft(period)
            setEditing(true)
          }}
        >
          Personalizado
        </button>
      </div>

      {customActive && (
        <form onSubmit={apply} className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-[1fr_1fr_auto]">
          <label className="text-sm font-medium">
            De
            <input
              type="date"
              required
              className={dateInput}
              value={editing ? draft.start : period.start}
              onFocus={() => {
                if (!editing) {
                  setDraft(period)
                  setEditing(true)
                }
              }}
              onChange={(event) => setDraft({ ...draft, start: event.target.value })}
            />
          </label>
          <label className="text-sm font-medium">
            Até
            <input
              type="date"
              required
              className={dateInput}
              value={editing ? draft.end : period.end}
              onFocus={() => {
                if (!editing) {
                  setDraft(period)
                  setEditing(true)
                }
              }}
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
            <p role="alert" className="col-span-full text-sm text-red-700 dark:text-red-400">
              A data inicial deve ser anterior ou igual à data final.
            </p>
          )}
        </form>
      )}

      <p className="mt-3 text-sm text-slate-500 dark:text-slate-400">
        Período: <span className="font-medium tabular-nums">{periodLabel(period)}</span> (datas
        inclusivas)
      </p>
    </section>
  )
}

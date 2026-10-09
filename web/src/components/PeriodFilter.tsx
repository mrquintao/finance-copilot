import { useId, useState, type FormEvent } from 'react'
import { usePeriod } from '../hooks/usePeriod'
import { today } from '../lib/localDate'
import {
  isCurrentMonth,
  isValidPeriod,
  monthSelection,
  periodTitle,
  stepMonth,
  type Period,
} from '../lib/period'
import { Button } from './Button'

const dateInput =
  'mt-1 block min-h-11 w-full rounded-ctl border border-edge bg-raised px-3 text-base tabular-nums'
const step =
  'inline-flex size-11 shrink-0 items-center justify-center rounded-ctl border border-edge bg-raised text-ink transition-colors hover:bg-surface active:bg-brand-soft disabled:pointer-events-none disabled:opacity-45'

function Chevron({ direction }: { direction: 'left' | 'right' }) {
  return (
    <svg
      width={18}
      height={18}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d={direction === 'left' ? 'm15 5-7 7 7 7' : 'm9 5 7 7-7 7'} />
    </svg>
  )
}

/**
 * The month is the unit: step back and forth by calendar month, with other ranges one click
 * away. The selection lives in the URL (see usePeriod).
 */
export function PeriodFilter() {
  const { selection, period, setSelection } = usePeriod()
  const todayISO = today()
  const panelId = useId()
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState<Period>(period)

  const previous = stepMonth(period, -1, todayISO)
  const next = stepMonth(period, 1, todayISO)
  const draftComplete = draft.start !== '' && draft.end !== ''
  const draftValid = isValidPeriod(draft.start, draft.end)

  function toggle() {
    if (!open) setDraft(period)
    setOpen(!open)
  }

  function apply(event: FormEvent) {
    event.preventDefault()
    if (!draftValid) return
    setSelection({ kind: 'custom', start: draft.start, end: draft.end })
    setOpen(false)
  }

  return (
    <section aria-label="Período" className="min-w-0">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex min-w-0 basis-full items-center gap-1 sm:basis-auto">
          <button
            type="button"
            aria-label="Mês anterior"
            className={step}
            disabled={!previous}
            onClick={() => previous && setSelection(monthSelection(previous, todayISO))}
          >
            <Chevron direction="left" />
          </button>
          <p
            aria-live="polite"
            className="min-w-0 flex-1 px-2 text-center text-lg font-bold tabular-nums sm:min-w-56"
          >
            {periodTitle(period)}
          </p>
          <button
            type="button"
            aria-label="Próximo mês"
            className={step}
            disabled={!next}
            onClick={() => next && setSelection(monthSelection(next, todayISO))}
          >
            <Chevron direction="right" />
          </button>
        </div>
        {!isCurrentMonth(period, todayISO) && (
          <Button
            variant="secondary"
            className="flex-1 sm:flex-none"
            onClick={() => setSelection({ kind: 'current-month' })}
          >
            Mês atual
          </Button>
        )}
        <Button
          variant="secondary"
          className="flex-1 sm:flex-none"
          aria-expanded={open}
          aria-controls={panelId}
          onClick={toggle}
        >
          Outro período
        </Button>
      </div>

      {open && (
        <div id={panelId} className="mt-3 border-t border-line pt-3">
          <Button
            variant="secondary"
            aria-pressed={selection.kind === 'last-3-months'}
            onClick={() => {
              setSelection({ kind: 'last-3-months' })
              setOpen(false)
            }}
          >
            Últimos 3 meses
          </Button>
          <form
            onSubmit={apply}
            className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-[11rem_11rem_auto] sm:justify-start"
          >
            <label className="text-sm font-medium text-ink-soft">
              De
              <input
                type="date"
                required
                className={dateInput}
                value={draft.start}
                onChange={(event) => setDraft({ ...draft, start: event.target.value })}
              />
            </label>
            <label className="text-sm font-medium text-ink-soft">
              Até
              <input
                type="date"
                required
                className={dateInput}
                value={draft.end}
                aria-invalid={draftComplete && !draftValid}
                onChange={(event) => setDraft({ ...draft, end: event.target.value })}
              />
            </label>
            <Button
              type="submit"
              disabled={!draftValid}
              className="col-span-2 sm:col-span-1 sm:self-end"
            >
              Aplicar
            </Button>
            {draftComplete && !draftValid && (
              <p role="alert" className="col-span-full text-sm text-danger">
                A data inicial deve ser anterior ou igual à data final.
              </p>
            )}
          </form>
        </div>
      )}
    </section>
  )
}

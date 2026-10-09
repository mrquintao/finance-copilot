import type { CopilotAnswer, CopilotStatusInfo } from '../../api/types'
import type { ChatTurn } from '../../hooks/useCopilotChat'
import { ANSWER_STATUS, copilotFailure, dateRange } from '../../lib/copilot'
import { Button } from '../Button'
import { Spinner } from '../Spinner'
import { Evidence } from './Evidence'
import { Markdown } from './Markdown'

function Answered({ answer }: { answer: CopilotAnswer }) {
  const status = ANSWER_STATUS[answer.status] ?? ANSWER_STATUS.incomplete
  const queries = answer.evidence.length

  return (
    <>
      {/* Only a checked answer reads as plain conversation; the other outcomes are named. */}
      {answer.status !== 'answered' && (
        <p className={`section-label ${answer.status === 'ungrounded' ? 'text-warning' : ''}`}>
          {status.heading}
        </p>
      )}
      <Markdown text={answer.answer} />
      {answer.status === 'answered' && (
        <p className="text-xs text-ink-soft">
          Texto do modelo de IA. Os valores em reais foram conferidos com os dados calculados.
        </p>
      )}
      {answer.no_data && (
        <p className="text-sm font-medium">
          As consultas não encontraram nenhum dado para o período.
        </p>
      )}
      {queries === 0 ? (
        <p className="text-xs text-ink-soft">
          Nenhuma consulta foi feita para esta resposta: ela não se apoia em dados calculados.
        </p>
      ) : (
        <details className="group border-t border-line">
          <summary className="flex min-h-11 cursor-pointer list-none items-center gap-1.5 text-sm font-semibold text-accent [&::-webkit-details-marker]:hidden">
            <svg
              width={14}
              height={14}
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={2.4}
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden
              className="transition-transform group-open:rotate-90"
            >
              <path d="m9 5 7 7-7 7" />
            </svg>
            Dados calculados pelo aplicativo ({queries} {queries === 1 ? 'consulta' : 'consultas'})
          </summary>
          {answer.periods.length > 0 && (
            <p className="text-xs text-ink-soft tabular-nums">
              {answer.periods.length === 1 ? 'Período considerado' : 'Períodos considerados'}:{' '}
              {answer.periods.map(dateRange).join(' • ')}
            </p>
          )}
          {answer.evidence.map((evidence, index) => (
            <Evidence key={index} evidence={evidence} />
          ))}
        </details>
      )}
    </>
  )
}

/** What the Copilot says back for one turn: waiting, the answer, a failure or a cancellation. */
export function AgentReply({
  turn,
  status,
  busy,
  onRetry,
}: {
  turn: ChatTurn
  status: CopilotStatusInfo | undefined
  busy: boolean
  onRetry: () => void
}) {
  if (turn.state === 'pending') {
    return (
      <p className="flex items-center gap-2.5 text-sm text-ink-soft">
        <Spinner />
        <span>
          Consultando seus dados…
          {status?.provider === 'ollama' && ' Um modelo local pode levar um minuto ou mais.'}
        </span>
      </p>
    )
  }
  if (turn.state === 'done' && turn.answer) return <Answered answer={turn.answer} />

  const cancelled = turn.state === 'cancelled'
  return (
    <>
      <p className={`text-sm font-semibold ${cancelled ? '' : 'text-danger'}`}>
        {cancelled ? 'Pergunta cancelada' : 'O Copilot não respondeu'}
      </p>
      {!cancelled && <p className="text-sm">{copilotFailure(turn.error, status)}</p>}
      <div>
        <Button variant="secondary" disabled={busy} onClick={onRetry}>
          {cancelled ? 'Perguntar de novo' : 'Tentar novamente'}
        </Button>
      </div>
    </>
  )
}

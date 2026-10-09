import { useMutation, useQuery } from '@tanstack/react-query'
import { useState, type FormEvent } from 'react'
import { askCopilot, getCopilotStatus } from '../api/copilot'
import { queryKeys } from '../api/queryKeys'
import type { CopilotAnswer } from '../api/types'
import { Button } from '../components/Button'
import { Evidence } from '../components/copilot/Evidence'
import { Markdown } from '../components/copilot/Markdown'
import { PageHeader } from '../components/PageHeader'
import { SectionHeading } from '../components/SectionHeading'
import { LoadingState } from '../components/states/LoadingState'
import {
  ANSWER_STATUS,
  copilotDestination,
  copilotFailure,
  COPILOT_EXAMPLES,
  COPILOT_MAX_LENGTH,
  dateRange,
} from '../lib/copilot'
import { today } from '../lib/localDate'

const MAX_LENGTH = COPILOT_MAX_LENGTH
const EXAMPLES = COPILOT_EXAMPLES

const link = 'font-medium text-accent underline-offset-4 hover:underline'

export function CopilotPage() {
  const [question, setQuestion] = useState('')
  const [asked, setAsked] = useState('')
  const { mutate, ...ask } = useMutation({
    mutationFn: (text: string) => askCopilot(text, today()),
  })
  const status = useQuery({
    queryKey: queryKeys.copilotStatus(),
    queryFn: ({ signal }) => getCopilotStatus(signal),
  })
  const note = copilotDestination(status.data)
  const text = question.trim()

  function submit(event: FormEvent) {
    event.preventDefault()
    if (!text || ask.isPending) return
    setAsked(text)
    mutate(text)
  }

  return (
    <div className="max-w-3xl">
      <PageHeader title="Copilot" />
      <p className="mb-5 max-w-xl text-sm text-ink-soft">
        Pergunte sobre suas finanças. Os números são calculados pelo aplicativo; o modelo de IA só
        escolhe quais consultas fazer e escreve o texto. Ele não altera nada.
      </p>

      <form onSubmit={submit}>
        <label className="text-xs font-medium text-ink-soft">
          Pergunta
          <textarea
            rows={2}
            maxLength={MAX_LENGTH}
            className="mt-1 block w-full rounded-ctl border border-edge bg-raised px-3 py-2.5 text-base"
            value={question}
            onChange={(event) => setQuestion(event.target.value)}
          />
        </label>
        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2">
          <Button type="submit" disabled={!text || ask.isPending}>
            Perguntar
          </Button>
          {note && <p className="text-xs text-ink-soft">{note}</p>}
        </div>
      </form>

      <ul aria-label="Exemplos de perguntas" className="mt-4 text-sm">
        {EXAMPLES.map((example) => (
          <li key={example}>
            <button
              type="button"
              className={`min-h-9 text-left ${link}`}
              onClick={() => setQuestion(example)}
            >
              {example}
            </button>
          </li>
        ))}
      </ul>

      <div aria-live="polite" className="mt-8">
        {ask.isPending ? (
          <LoadingState
            label={
              status.data?.provider === 'ollama'
                ? 'Consultando seus dados… Um modelo local pode levar um minuto ou mais.'
                : 'Consultando seus dados…'
            }
          />
        ) : ask.isError ? (
          <div role="alert" className="border-l-2 border-danger pl-4">
            <p className="text-sm font-semibold text-danger">O Copilot não respondeu</p>
            <p className="mt-1 max-w-md text-sm">{copilotFailure(ask.error, status.data)}</p>
            <Button variant="secondary" className="mt-4" onClick={() => mutate(asked)}>
              Tentar novamente
            </Button>
          </div>
        ) : ask.data ? (
          <Answer question={asked} answer={ask.data} />
        ) : null}
      </div>
    </div>
  )
}

function Answer({ question, answer }: { question: string; answer: CopilotAnswer }) {
  const status = ANSWER_STATUS[answer.status] ?? ANSWER_STATUS.incomplete

  return (
    <>
      <section aria-label="Resposta">
        <p className="text-sm text-ink-soft">Você perguntou: {question}</p>
        <div className={`mt-3 border-l-2 pl-4 ${status.tone}`}>
          <h2 className="section-label">{status.heading}</h2>
          <div className="mt-2 text-base">
            <Markdown text={answer.answer} />
          </div>
          {status.note && <p className="mt-2 text-xs text-ink-soft">{status.note}</p>}
        </div>
        {answer.no_data && (
          <p className="mt-4 text-sm font-medium">
            As consultas não encontraram nenhum dado para o período.
          </p>
        )}
        {answer.periods.length > 0 && (
          <p className="mt-4 text-sm text-ink-soft">
            <span className="section-label mr-2">
              {answer.periods.length === 1 ? 'Período considerado' : 'Períodos considerados'}
            </span>
            <span className="font-medium text-ink tabular-nums">
              {answer.periods.map(dateRange).join(' • ')}
            </span>
          </p>
        )}
      </section>

      <section className="mt-10" aria-label="Dados calculados">
        <SectionHeading>Dados calculados pelo aplicativo</SectionHeading>
        {answer.evidence.length === 0 ? (
          <p className="py-4 text-sm text-ink-soft">
            Nenhuma consulta foi feita para esta resposta: ela não se apoia em dados calculados.
          </p>
        ) : (
          answer.evidence.map((evidence, index) => <Evidence key={index} evidence={evidence} />)
        )}
      </section>
    </>
  )
}

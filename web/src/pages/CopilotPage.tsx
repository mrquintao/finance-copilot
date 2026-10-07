import { useMutation } from '@tanstack/react-query'
import { useState, type FormEvent } from 'react'
import { Link } from 'react-router'
import { errorMessage, hasStatus } from '../api/client'
import { askCopilot } from '../api/copilot'
import type { CopilotAnswer, CopilotEvidence, CopilotStatus, DateRange } from '../api/types'
import { Button } from '../components/Button'
import { PageHeader } from '../components/PageHeader'
import { SectionHeading } from '../components/SectionHeading'
import { LoadingState } from '../components/states/LoadingState'
import { formatFact, transactionsHref } from '../lib/copilot'
import { formatLocalDate, today } from '../lib/localDate'
import { formatBRL } from '../lib/money'
import { TYPE_LABELS } from '../lib/transaction'

const MAX_LENGTH = 500
const EXAMPLES = [
  'Quanto gastei no mês passado?',
  'Em quais categorias gastei mais neste mês?',
  'Gastei mais ou menos que no mês anterior?',
]

const link = 'font-medium text-accent underline-offset-4 hover:underline'

function range(period: DateRange): string {
  return `${formatLocalDate(period.start_date)} – ${formatLocalDate(period.end_date)}`
}

function failure(error: unknown): string {
  if (hasStatus(error, 503)) {
    return 'O Copilot não está configurado no backend (ANTHROPIC_API_KEY).'
  }
  if (hasStatus(error, 502)) {
    return 'O modelo de IA não respondeu. Seus dados não foram afetados; tente novamente.'
  }
  return errorMessage(error)
}

// How the model's text is to be read, for each outcome. Only "answered" is a checked answer.
const STATUS: Record<CopilotStatus, { heading: string; tone: string; note: string | null }> = {
  answered: {
    heading: 'Texto do Copilot',
    tone: 'border-line-strong',
    note: 'Redação e interpretação do modelo de IA, não um cálculo. Todo valor em reais deste texto foi conferido com os dados calculados abaixo.',
  },
  ungrounded: { heading: 'Resposta retida', tone: 'border-warning', note: null },
  refused: { heading: 'Sem resposta', tone: 'border-line-strong', note: null },
  incomplete: { heading: 'Sem resposta', tone: 'border-line-strong', note: null },
}

export function CopilotPage() {
  const [question, setQuestion] = useState('')
  const [asked, setAsked] = useState('')
  const ask = useMutation({ mutationFn: (text: string) => askCopilot(text, today()) })
  const text = question.trim()

  function submit(event: FormEvent) {
    event.preventDefault()
    if (!text || ask.isPending) return
    setAsked(text)
    ask.mutate(text)
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
            className="mt-1 block w-full rounded-ctl border border-line-strong bg-raised px-3 py-2.5 text-base"
            value={question}
            onChange={(event) => setQuestion(event.target.value)}
          />
        </label>
        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2">
          <Button type="submit" disabled={!text || ask.isPending}>
            Perguntar
          </Button>
          <p className="text-xs text-ink-soft">
            A pergunta e os dados consultados são enviados ao modelo de IA (Anthropic).
          </p>
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
          <LoadingState label="Consultando seus dados…" />
        ) : ask.isError ? (
          <div role="alert" className="border-l-2 border-danger pl-4">
            <p className="text-sm font-semibold text-danger">O Copilot não respondeu</p>
            <p className="mt-1 max-w-md text-sm">{failure(ask.error)}</p>
            <Button variant="secondary" className="mt-4" onClick={() => ask.mutate(asked)}>
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
  const status = STATUS[answer.status] ?? STATUS.incomplete

  return (
    <>
      <section aria-label="Resposta">
        <p className="text-sm text-ink-soft">Você perguntou: {question}</p>
        <div className={`mt-3 border-l-2 pl-4 ${status.tone}`}>
          <h2 className="label-caps">{status.heading}</h2>
          <p className="mt-2 text-[0.9375rem] whitespace-pre-line">{answer.answer}</p>
          {status.note && <p className="mt-2 text-xs text-ink-soft">{status.note}</p>}
        </div>
        {answer.no_data && (
          <p className="mt-4 text-sm font-medium">
            As consultas não encontraram nenhum dado para o período.
          </p>
        )}
        {answer.periods.length > 0 && (
          <p className="mt-4 text-sm text-ink-soft">
            <span className="label-caps mr-2">
              {answer.periods.length === 1 ? 'Período considerado' : 'Períodos considerados'}
            </span>
            <span className="font-medium text-ink tabular-nums">
              {answer.periods.map(range).join(' • ')}
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

function Evidence({ evidence }: { evidence: CopilotEvidence }) {
  return (
    <article className="border-b border-line-strong py-5">
      <h3 className="text-[0.9375rem] font-semibold">{evidence.title}</h3>
      <p className="mt-1 text-xs text-ink-soft">Fonte: {evidence.source}</p>
      {evidence.period && (
        <p className="mt-1 text-xs text-ink-soft tabular-nums">
          Período: {range(evidence.period)}
          {evidence.comparison_period && ` • comparado com ${range(evidence.comparison_period)}`}
        </p>
      )}

      {!evidence.has_data ? (
        <p className="mt-3 text-sm font-medium">Esta consulta não encontrou dados.</p>
      ) : (
        <dl className="mt-3">
          {evidence.facts.map((fact) => (
            <div
              key={fact.label}
              className="flex items-baseline justify-between gap-6 border-t border-line py-2 text-sm"
            >
              <dt className="min-w-0">
                {fact.link ? (
                  <Link to={transactionsHref(fact.link)} className={link}>
                    {fact.label}
                  </Link>
                ) : (
                  fact.label
                )}
                {fact.detail && <span className="block text-xs text-ink-soft">{fact.detail}</span>}
              </dt>
              <dd className="shrink-0 text-right font-medium tabular-nums">{formatFact(fact)}</dd>
            </div>
          ))}
        </dl>
      )}

      {evidence.transactions.length > 0 && (
        <ul aria-label="Transações que sustentam a resposta" className="mt-3">
          {evidence.transactions.map((transaction) => (
            <li key={transaction.id} className="border-t border-line">
              <Link
                to={`/transactions/${transaction.id}`}
                className="flex items-baseline justify-between gap-4 py-2 text-sm hover:bg-surface"
              >
                <span className="min-w-0">
                  <span className="block truncate font-medium">{transaction.title}</span>
                  <span className="block text-xs text-ink-soft tabular-nums">
                    {formatLocalDate(transaction.date)} • {TYPE_LABELS[transaction.type]}
                  </span>
                </span>
                <span className="shrink-0 font-medium tabular-nums">
                  {formatBRL(transaction.amount)}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}

      {evidence.transactions_link && evidence.has_data && (
        <Link
          to={transactionsHref(evidence.transactions_link)}
          className={`mt-3 inline-flex min-h-9 items-center text-sm ${link}`}
        >
          Ver as transações desta consulta
        </Link>
      )}
    </article>
  )
}

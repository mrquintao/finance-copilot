import { Link } from 'react-router'
import type { CopilotEvidence } from '../../api/types'
import { dateRange, formatFact, transactionsHref } from '../../lib/copilot'
import { formatLocalDate } from '../../lib/localDate'
import { formatBRL } from '../../lib/money'
import { TYPE_LABELS } from '../../lib/transaction'

const link = 'font-medium text-accent underline-offset-4 hover:underline'

/**
 * One query the backend ran for an answer: its source, period, calculated facts and the
 * transactions behind them. Nothing here comes from the model's text.
 */
export function Evidence({ evidence }: { evidence: CopilotEvidence }) {
  return (
    <article className="border-b border-line-strong py-5">
      <h3 className="text-base font-semibold">{evidence.title}</h3>
      <p className="mt-1 text-xs text-ink-soft">Fonte: {evidence.source}</p>
      {evidence.period && (
        <p className="mt-1 text-xs text-ink-soft tabular-nums">
          Período: {dateRange(evidence.period)}
          {evidence.comparison_period &&
            ` • comparado com ${dateRange(evidence.comparison_period)}`}
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
          className={`mt-3 inline-flex min-h-11 items-center text-sm ${link}`}
        >
          Ver as transações desta consulta
        </Link>
      )}
    </article>
  )
}

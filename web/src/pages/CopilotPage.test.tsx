import { screen, within } from '@testing-library/react'
import { delay, http, HttpResponse } from 'msw'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { CopilotAnswer, CopilotEvidence } from '../api/types'
import { formatFact, transactionsHref } from '../lib/copilot'
import { renderApp } from '../test/render'
import { server } from '../test/server'

const ASK = '/api/copilot/ask'
const SEPTEMBER = { start_date: '2026-09-01', end_date: '2026-09-30' }
const FOOD = '22222222-2222-4222-8222-222222222222'
const UBER = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1'

const byCategory: CopilotEvidence = {
  tool: 'get_spending_by_category',
  title: 'Gastos por categoria',
  source: 'Soma dos débitos do período por categoria (GET /analytics/spending-by-category)',
  period: SEPTEMBER,
  comparison_period: null,
  has_data: true,
  facts: [
    {
      label: 'Alimentação',
      value: '62.75',
      kind: 'money',
      detail: '2 despesa(s)',
      link: { ...SEPTEMBER, q: null, category_id: FOOD, type: 'debit' },
    },
    { label: 'Sem categoria', value: '59.00', kind: 'money', detail: '1 despesa(s)', link: null },
  ],
  transactions_link: { ...SEPTEMBER, q: null, category_id: null, type: 'debit' },
  transactions: [],
}

const search: CopilotEvidence = {
  tool: 'search_transactions',
  title: 'Transações encontradas',
  source: 'Busca nas transações do período, com totais somados no banco (GET /transactions)',
  period: SEPTEMBER,
  comparison_period: null,
  has_data: true,
  facts: [
    { label: 'Transações encontradas', value: '1', kind: 'count', detail: null, link: null },
    {
      label: 'Total em despesas',
      value: '59.00',
      kind: 'money',
      detail: '1 transação(ões)',
      link: null,
    },
  ],
  transactions_link: { ...SEPTEMBER, q: 'uber', category_id: null, type: 'debit' },
  transactions: [{ id: UBER, date: '2026-09-20', title: 'Uber', amount: '59.00', type: 'debit' }],
}

function answer(overrides: Partial<CopilotAnswer> = {}): CopilotAnswer {
  return {
    status: 'answered',
    answer: 'Você gastou R$ 62,75 com alimentação entre 01/09/2026 e 30/09/2026.',
    periods: [SEPTEMBER],
    no_data: false,
    evidence: [byCategory],
    ...overrides,
  }
}

async function askQuestion(user: ReturnType<typeof renderApp>['user'], text: string) {
  await user.type(screen.getByLabelText('Pergunta'), text)
  await user.click(screen.getByRole('button', { name: 'Perguntar' }))
}

describe('CopilotPage', () => {
  beforeEach(() => {
    // Only the clock is faked, so the date sent with the question is fixed.
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date(2026, 9, 7, 9, 0))
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('starts empty and does not ask until there is a question', () => {
    renderApp('/copilot')

    expect(screen.getByRole('heading', { name: 'Copilot', level: 1 })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Perguntar' })).toBeDisabled()
    expect(screen.getByText(/são enviados ao modelo de IA \(Anthropic\)/)).toBeInTheDocument()
    expect(screen.queryByRole('region', { name: 'Resposta' })).not.toBeInTheDocument()
  })

  it('sends the question with the local date and shows a loading state', async () => {
    let body: unknown
    server.use(
      http.post(ASK, async ({ request }) => {
        body = await request.json()
        await delay('infinite')
        return HttpResponse.json(answer())
      }),
    )
    const { user } = renderApp('/copilot')

    await askQuestion(user, '  Quanto gastei com alimentação no mês passado?  ')

    expect(await screen.findByRole('status')).toHaveTextContent('Consultando seus dados…')
    expect(body).toEqual({
      question: 'Quanto gastei com alimentação no mês passado?',
      today: '2026-10-07',
    })
    expect(screen.getByRole('button', { name: 'Perguntar' })).toBeDisabled()
  })

  it('fills the question from an example', async () => {
    const { user } = renderApp('/copilot')

    await user.click(screen.getByRole('button', { name: 'Quanto gastei no mês passado?' }))

    expect(screen.getByLabelText('Pergunta')).toHaveValue('Quanto gastei no mês passado?')
    expect(screen.getByRole('button', { name: 'Perguntar' })).toBeEnabled()
  })

  it('separates the model text from the calculated data, with period and source', async () => {
    server.use(http.post(ASK, () => HttpResponse.json(answer())))
    const { user } = renderApp('/copilot')

    await askQuestion(user, 'Quanto gastei com alimentação?')

    const reply = await screen.findByRole('region', { name: 'Resposta' })
    expect(within(reply).getByText('Você perguntou: Quanto gastei com alimentação?')).toBeVisible()
    expect(within(reply).getByRole('heading', { name: 'Texto do Copilot' })).toBeInTheDocument()
    expect(
      within(reply).getByText('Você gastou R$ 62,75 com alimentação entre 01/09/2026 e 30/09/2026.'),
    ).toBeInTheDocument()
    expect(within(reply).getByText(/Redação e interpretação do modelo de IA/)).toBeInTheDocument()
    expect(within(reply).getByText('Período considerado')).toBeInTheDocument()
    expect(within(reply).getByText('01/09/2026 – 30/09/2026')).toBeInTheDocument()

    const data = screen.getByRole('region', { name: 'Dados calculados' })
    expect(within(data).getByRole('heading', { name: 'Gastos por categoria' })).toBeInTheDocument()
    expect(
      within(data).getByText(
        'Fonte: Soma dos débitos do período por categoria (GET /analytics/spending-by-category)',
      ),
    ).toBeInTheDocument()
    expect(within(data).getByText('Período: 01/09/2026 – 30/09/2026')).toBeInTheDocument()
    // The figures come from the evidence, formatted by the app.
    expect(within(data).getByText('R$ 62,75')).toBeInTheDocument()
    expect(within(data).getByText('2 despesa(s)')).toBeInTheDocument()
    expect(within(data).getByText('R$ 59,00')).toBeInTheDocument()
  })

  it('links facts and the query to the transactions that support them', async () => {
    server.use(http.post(ASK, () => HttpResponse.json(answer({ evidence: [byCategory, search] }))))
    const { user } = renderApp('/copilot')

    await askQuestion(user, 'Quanto gastei?')

    const food = await screen.findByRole('link', { name: 'Alimentação' })
    expect(food).toHaveAttribute(
      'href',
      `/transactions?start=2026-09-01&end=2026-09-30&category=${FOOD}&type=debit`,
    )
    // No link is invented where the query has none.
    expect(screen.queryByRole('link', { name: 'Sem categoria' })).not.toBeInTheDocument()
    expect(
      screen.getAllByRole('link', { name: 'Ver as transações desta consulta' }).map((item) =>
        item.getAttribute('href'),
      ),
    ).toEqual([
      '/transactions?start=2026-09-01&end=2026-09-30&type=debit',
      '/transactions?start=2026-09-01&end=2026-09-30&q=uber&type=debit',
    ])
    const supporting = screen.getByRole('list', { name: 'Transações que sustentam a resposta' })
    const row = within(supporting).getByRole('link')
    expect(row).toHaveAttribute('href', `/transactions/${UBER}`)
    expect(row).toHaveTextContent('Uber')
    expect(row).toHaveTextContent('20/09/2026 • Despesa')
    expect(row).toHaveTextContent('R$ 59,00')
  })

  it('shows a withheld answer as withheld, keeping the calculated data', async () => {
    server.use(
      http.post(ASK, () =>
        HttpResponse.json(
          answer({
            status: 'ungrounded',
            answer: 'Não mostrei a resposta porque ela continha valores que não vieram dos cálculos.',
          }),
        ),
      ),
    )
    const { user } = renderApp('/copilot')

    await askQuestion(user, 'Quanto gastei?')

    const reply = await screen.findByRole('region', { name: 'Resposta' })
    expect(within(reply).getByRole('heading', { name: 'Resposta retida' })).toBeInTheDocument()
    expect(within(reply).getByText(/Não mostrei a resposta/)).toBeInTheDocument()
    // The note that vouches for checked amounts is not shown for a withheld answer.
    expect(screen.queryByText(/foi conferido/)).not.toBeInTheDocument()
    expect(screen.getByText('R$ 62,75')).toBeInTheDocument()
  })

  it.each(['refused', 'incomplete'] as const)('states a %s outcome plainly', async (status) => {
    server.use(
      http.post(ASK, () =>
        HttpResponse.json(
          answer({ status, answer: 'O modelo não respondeu a esta pergunta.', periods: [], evidence: [] }),
        ),
      ),
    )
    const { user } = renderApp('/copilot')

    await askQuestion(user, 'Quanto gastei?')

    expect(await screen.findByRole('heading', { name: 'Sem resposta' })).toBeInTheDocument()
    expect(screen.getByText('O modelo não respondeu a esta pergunta.')).toBeInTheDocument()
    expect(screen.getByText(/Nenhuma consulta foi feita para esta resposta/)).toBeInTheDocument()
    expect(screen.queryByText(/Período considerado/)).not.toBeInTheDocument()
  })

  it('says explicitly when the queries found no data', async () => {
    const empty: CopilotEvidence = { ...byCategory, has_data: false, facts: [] }
    server.use(
      http.post(ASK, () =>
        HttpResponse.json(
          answer({ answer: 'Não há transações nesse período.', no_data: true, evidence: [empty] }),
        ),
      ),
    )
    const { user } = renderApp('/copilot')

    await askQuestion(user, 'Quanto gastei em 2020?')

    expect(
      await screen.findByText('As consultas não encontraram nenhum dado para o período.'),
    ).toBeInTheDocument()
    expect(screen.getByText('Esta consulta não encontrou dados.')).toBeInTheDocument()
    expect(
      screen.queryByRole('link', { name: 'Ver as transações desta consulta' }),
    ).not.toBeInTheDocument()
  })

  it('shows both periods of a comparison and signed changes', async () => {
    const comparison: CopilotEvidence = {
      ...byCategory,
      tool: 'get_period_comparison',
      title: 'Comparação com o período anterior',
      comparison_period: { start_date: '2026-08-01', end_date: '2026-08-31' },
      facts: [
        { label: 'Variação de gastos', value: '-37.25', kind: 'signed_money', detail: null, link: null },
        { label: 'Variação percentual de gastos', value: '21.8', kind: 'percent', detail: null, link: null },
        { label: 'Variação de transações', value: '3', kind: 'signed_count', detail: null, link: null },
      ],
    }
    server.use(http.post(ASK, () => HttpResponse.json(answer({ evidence: [comparison] }))))
    const { user } = renderApp('/copilot')

    await askQuestion(user, 'Gastei mais?')

    expect(
      await screen.findByText(
        'Período: 01/09/2026 – 30/09/2026 • comparado com 01/08/2026 – 31/08/2026',
      ),
    ).toBeInTheDocument()
    expect(screen.getByText('Variação de gastos').nextElementSibling).toHaveTextContent('−R$ 37,25')
    expect(screen.getByText('Variação percentual de gastos').nextElementSibling).toHaveTextContent(
      '+21,8%',
    )
    expect(screen.getByText('Variação de transações').nextElementSibling).toHaveTextContent('+3')
  })

  it('explains when the Copilot is not configured', async () => {
    server.use(http.post(ASK, () => HttpResponse.json({ detail: 'x' }, { status: 503 })))
    const { user } = renderApp('/copilot')

    await askQuestion(user, 'Quanto gastei?')

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'O Copilot não está configurado no backend (ANTHROPIC_API_KEY).',
    )
  })

  it('reports a model failure and retries the same question', async () => {
    const questions: unknown[] = []
    let failing = true
    server.use(
      http.post(ASK, async ({ request }) => {
        questions.push(((await request.json()) as { question: string }).question)
        return failing ? new HttpResponse(null, { status: 502 }) : HttpResponse.json(answer())
      }),
    )
    const { user } = renderApp('/copilot')

    await askQuestion(user, 'Quanto gastei?')
    expect(await screen.findByRole('alert')).toHaveTextContent('O modelo de IA não respondeu')

    failing = false
    await user.click(screen.getByRole('button', { name: 'Tentar novamente' }))

    expect(await screen.findByRole('heading', { name: 'Texto do Copilot' })).toBeInTheDocument()
    expect(questions).toEqual(['Quanto gastei?', 'Quanto gastei?'])
  })

  it('is reachable from the navigation', async () => {
    server.use(http.get('/api/sync/runs', () => HttpResponse.json({ items: [] })))
    const { user } = renderApp('/connections')

    await user.click(screen.getByRole('link', { name: 'Copilot' }))

    expect(await screen.findByRole('heading', { name: 'Copilot', level: 1 })).toBeInTheDocument()
  })
})

describe('copilot helpers', () => {
  it('builds a transactions link with only the filters in use', () => {
    expect(transactionsHref({ ...SEPTEMBER, q: null, category_id: null, type: null })).toBe(
      '/transactions?start=2026-09-01&end=2026-09-30',
    )
    expect(transactionsHref({ ...SEPTEMBER, q: 'pão & café', category_id: FOOD, type: 'credit' })).toBe(
      `/transactions?start=2026-09-01&end=2026-09-30&q=p%C3%A3o+%26+caf%C3%A9&category=${FOOD}&type=credit`,
    )
  })

  it.each([
    ['money', '1234567890123456.78', 'R$ 1.234.567.890.123.456,78'],
    ['signed_money', '0.00', 'R$ 0,00'],
    ['signed_money', '21.75', '+R$ 21,75'],
    ['percent', '-100.0', '−100,0%'],
    ['count', '21', '21'],
    ['signed_count', '-2', '−2'],
    ['signed_count', '0', '0'],
    ['count', 'vinte', '—'],
    ['signed_count', '1.5', '—'],
  ] as const)('formats a %s fact of %s', (kind, value, expected) => {
    expect(formatFact({ label: 'x', value, kind, detail: null, link: null })).toBe(expected)
  })
})

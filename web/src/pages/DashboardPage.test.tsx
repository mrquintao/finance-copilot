import { screen, within } from '@testing-library/react'
import { delay, http, HttpResponse } from 'msw'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { MonthProjection } from '../api/types'
import { emptySummary, makeByCategory, makeComparison, makeSummary } from '../test/fixtures'
import { renderApp, SEPTEMBER } from '../test/render'
import { server } from '../test/server'

const SUMMARY = '/api/analytics/spending-summary'
const BY_CATEGORY = '/api/analytics/spending-by-category'

const COMPARISON = '/api/analytics/period-comparison'

describe('DashboardPage', () => {
  // Every loaded dashboard also asks for the comparison; tests that care override this.
  beforeEach(() => {
    server.use(http.get(COMPARISON, () => HttpResponse.json(makeComparison())))
  })

  it('shows a loading state while the summary is pending', async () => {
    server.use(
      http.get(SUMMARY, () => delay('infinite')),
      http.get(BY_CATEGORY, () => HttpResponse.json(makeByCategory())),
    )
    renderApp(`/${SEPTEMBER}`)

    expect(await screen.findByRole('status')).toHaveTextContent('Carregando resumo…')
  })

  it('shows the cards and the category breakdown', async () => {
    let query: URLSearchParams | undefined
    server.use(
      http.get(SUMMARY, ({ request }) => {
        query = new URL(request.url).searchParams
        return HttpResponse.json(makeSummary())
      }),
      http.get(BY_CATEGORY, () => HttpResponse.json(makeByCategory())),
    )
    renderApp(`/${SEPTEMBER}`)

    expect(await screen.findByText('R$ 3.649,94')).toBeInTheDocument()
    expect(screen.getByText('R$ 8.150,00')).toBeInTheDocument()
    expect(screen.getByText('21')).toBeInTheDocument()
    expect(screen.getByText('18 despesas • 2 receitas')).toBeInTheDocument()
    expect(screen.getByText('Moradia')).toBeInTheDocument()
    expect(screen.getByText('R$ 2.200,00')).toBeInTheDocument()
    expect(screen.getByText('R$ 1.449,94')).toBeInTheDocument()
    expect(screen.getByText(/Transferências entre contas não entram/)).toBeInTheDocument()
    expect(query?.get('start_date')).toBe('2026-09-01')
    expect(query?.get('end_date')).toBe('2026-09-30')
  })

  it('shows an empty state when the period has no transactions', async () => {
    server.use(
      http.get(SUMMARY, () => HttpResponse.json(emptySummary)),
      http.get(BY_CATEGORY, () => HttpResponse.json(makeByCategory([]))),
    )
    renderApp(`/${SEPTEMBER}`)

    expect(await screen.findByRole('heading', { name: 'Nenhuma transação' })).toBeInTheDocument()
  })

  it('says so when the period has no expenses', async () => {
    server.use(
      http.get(SUMMARY, () =>
        HttpResponse.json(makeSummary({ total_spending: '0.00', expense_count: 0 })),
      ),
      http.get(BY_CATEGORY, () => HttpResponse.json(makeByCategory([]))),
    )
    renderApp(`/${SEPTEMBER}`)

    expect(await screen.findByRole('heading', { name: 'Nenhuma despesa' })).toBeInTheDocument()
  })

  it('shows an error and recovers on retry', async () => {
    let failing = true
    server.use(
      http.get(SUMMARY, () =>
        failing
          ? HttpResponse.json({ detail: 'Database unavailable.' }, { status: 503 })
          : HttpResponse.json(makeSummary()),
      ),
      http.get(BY_CATEGORY, () => HttpResponse.json(makeByCategory())),
    )
    const { user } = renderApp(`/${SEPTEMBER}`)

    expect(await screen.findByRole('alert')).toHaveTextContent('Serviço indisponível')
    failing = false
    await user.click(screen.getByRole('button', { name: 'Tentar novamente' }))

    expect(await screen.findByText('R$ 3.649,94')).toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('reports a network failure', async () => {
    server.use(
      http.get(SUMMARY, () => HttpResponse.error()),
      http.get(BY_CATEGORY, () => HttpResponse.error()),
    )
    renderApp(`/${SEPTEMBER}`)

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Não foi possível conectar ao servidor',
    )
  })

  it('never shows a slow response from the previously selected period', async () => {
    // September answers late with 111,11; every other period answers at once with 222,22.
    const slow = (request: Request) =>
      new URL(request.url).searchParams.get('start_date') === '2026-09-01'
    server.use(
      http.get(SUMMARY, async ({ request }) => {
        if (!slow(request)) return HttpResponse.json(makeSummary({ total_spending: '222.22' }))
        await delay(150)
        return HttpResponse.json(makeSummary({ total_spending: '111.11' }))
      }),
      http.get(BY_CATEGORY, async ({ request }) => {
        if (slow(request)) await delay(150)
        return HttpResponse.json(makeByCategory())
      }),
    )
    const { user } = renderApp(`/${SEPTEMBER}`)
    await screen.findByRole('status')

    await user.click(screen.getByRole('button', { name: 'Últimos 3 meses' }))

    expect(await screen.findByText('R$ 222,22')).toBeInTheDocument()
    // Give the slow September response time to arrive, then check it changed nothing.
    await delay(300)
    expect(screen.getByText('R$ 222,22')).toBeInTheDocument()
    expect(screen.queryByText('R$ 111,11')).not.toBeInTheDocument()
  })

  it('clears the old numbers while the new period is loading', async () => {
    const september = (request: Request) =>
      new URL(request.url).searchParams.get('start_date') === '2026-09-01'
    server.use(
      http.get(SUMMARY, ({ request }) =>
        september(request) ? HttpResponse.json(makeSummary()) : delay('infinite'),
      ),
      http.get(BY_CATEGORY, () => HttpResponse.json(makeByCategory())),
    )
    const { user } = renderApp(`/${SEPTEMBER}`)
    expect(await screen.findByText('R$ 3.649,94')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Mês atual' }))

    expect(await screen.findByRole('status')).toHaveTextContent('Carregando resumo…')
    expect(screen.queryByText('R$ 3.649,94')).not.toBeInTheDocument()
  })

  describe('comparison with the previous period', () => {
    const loaded = [
      http.get(SUMMARY, () => HttpResponse.json(makeSummary())),
      http.get(BY_CATEGORY, () => HttpResponse.json(makeByCategory())),
    ]

    it('shows absolute and percent change against the stated previous period', async () => {
      let query: URLSearchParams | undefined
      server.use(
        ...loaded,
        http.get(COMPARISON, ({ request }) => {
          query = new URL(request.url).searchParams
          return HttpResponse.json(
            makeComparison({
              spending: {
                current: '3649.94',
                previous: '3400.00',
                change: '249.94',
                percent_change: '7.4',
                direction: 'up',
              },
              income: {
                current: '8150.00',
                previous: '9000.00',
                change: '-850.00',
                percent_change: '-9.4',
                direction: 'down',
              },
              transaction_count: {
                current: 21,
                previous: 18,
                change: 3,
                percent_change: '16.7',
                direction: 'up',
              },
            }),
          )
        }),
      )
      renderApp(`/${SEPTEMBER}`)

      const totals = await screen.findByRole('list', { name: 'Totais comparados' })
      expect(screen.getByText('01/08/2026 – 31/08/2026')).toBeInTheDocument()
      const [spending, income, count] = within(totals).getAllByRole('listitem')
      expect(spending).toHaveTextContent('Gastos')
      expect(spending).toHaveTextContent('Antes: R$ 3.400,00')
      expect(spending).toHaveTextContent('+R$ 249,94 (+7,4%)')
      expect(income).toHaveTextContent('Antes: R$ 9.000,00')
      expect(income).toHaveTextContent('−R$ 850,00 (−9,4%)')
      expect(count).toHaveTextContent('Antes: 18')
      expect(count).toHaveTextContent('+3 (+16,7%)')
      expect(query?.get('start_date')).toBe('2026-09-01')
      expect(query?.get('end_date')).toBe('2026-09-30')
    })

    it('does not invent a percentage when the previous period is empty', async () => {
      server.use(
        ...loaded,
        http.get(COMPARISON, () =>
          HttpResponse.json(
            makeComparison({
              spending: {
                current: '80.00',
                previous: '0.00',
                change: '80.00',
                percent_change: null,
                direction: 'up',
              },
              transaction_count: {
                current: 2,
                previous: 0,
                change: 2,
                percent_change: null,
                direction: 'up',
              },
            }),
          ),
        ),
      )
      renderApp(`/${SEPTEMBER}`)

      const totals = await screen.findByRole('list', { name: 'Totais comparados' })
      const [spending, income, count] = within(totals).getAllByRole('listitem')
      expect(spending).toHaveTextContent('+R$ 80,00 (sem base anterior)')
      expect(spending).not.toHaveTextContent('%')
      expect(income).toHaveTextContent('Sem variação')
      expect(count).toHaveTextContent('+2 (sem base anterior)')
    })

    it('says so when nothing changed', async () => {
      server.use(
        ...loaded,
        http.get(COMPARISON, () =>
          HttpResponse.json(
            makeComparison({
              spending: {
                current: '0.30',
                previous: '0.30',
                change: '0.00',
                percent_change: '0.0',
                direction: 'equal',
              },
            }),
          ),
        ),
      )
      renderApp(`/${SEPTEMBER}`)

      const totals = await screen.findByRole('list', { name: 'Totais comparados' })
      expect(within(totals).getAllByRole('listitem')[0]).toHaveTextContent('Sem variação')
    })

    it('lists the categories that moved the most, skipping unchanged ones', async () => {
      const category = (name: string, change: string, direction: 'up' | 'down' | 'equal') => ({
        category_id: null,
        category: name,
        current: '100.00',
        previous: '40.00',
        change,
        percent_change: direction === 'equal' ? '0.0' : '150.0',
        direction,
      })
      server.use(
        ...loaded,
        http.get(COMPARISON, () =>
          HttpResponse.json(
            makeComparison({
              categories: [
                { ...category('Viagens', '-60.00', 'down'), percent_change: '-100.0' },
                category('Restaurantes', '50.00', 'up'),
                category('Farmácia', '0.00', 'equal'),
              ],
            }),
          ),
        ),
      )
      renderApp(`/${SEPTEMBER}`)

      const list = await screen.findByRole('list', { name: 'Categorias que mais variaram' })
      const rows = within(list).getAllByRole('listitem')
      expect(rows).toHaveLength(2)
      expect(rows[0]).toHaveTextContent('Viagens')
      expect(rows[0]).toHaveTextContent('−R$ 60,00 (−100,0%)')
      expect(rows[1]).toHaveTextContent('Restaurantes')
      expect(rows[1]).toHaveTextContent('+R$ 50,00 (+150,0%)')
    })

    it('keeps the summary when the comparison fails', async () => {
      server.use(...loaded, http.get(COMPARISON, () => new HttpResponse(null, { status: 422 })))
      renderApp(`/${SEPTEMBER}`)

      expect(await screen.findByText('Não foi possível carregar a comparação.')).toBeInTheDocument()
      expect(screen.getByText('R$ 3.649,94')).toBeInTheDocument()
      expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    })

    it('is not requested for a period without transactions', async () => {
      let requested = false
      server.use(
        http.get(SUMMARY, () => HttpResponse.json(emptySummary)),
        http.get(BY_CATEGORY, () => HttpResponse.json(makeByCategory([]))),
        http.get(COMPARISON, () => {
          requested = true
          return HttpResponse.json(makeComparison())
        }),
      )
      renderApp(`/${SEPTEMBER}`)

      await screen.findByRole('heading', { name: 'Nenhuma transação' })
      expect(requested).toBe(false)
    })
  })

  describe('month-end projection', () => {
    const PROJECTION = '/api/analytics/month-projection'
    const projection: MonthProjection = {
      currency: 'BRL',
      method: 'linear_daily_average',
      as_of: '2026-10-10',
      month: { start_date: '2026-10-01', end_date: '2026-10-31' },
      days_elapsed: 10,
      days_in_month: 31,
      days_remaining: 21,
      spent_so_far: '1900.00',
      recurring_so_far: '1800.00',
      variable_so_far: '100.00',
      variable_daily_average: '10.00',
      recurring_basis: { start_date: '2026-09-01', end_date: '2026-09-30' },
      recurring_expected: '1840.00',
      recurring_remaining: '40.00',
      projected_variable: '310.00',
      projected_total: '2150.00',
    }
    const loaded = [
      http.get(SUMMARY, () => HttpResponse.json(makeSummary())),
      http.get(BY_CATEGORY, () => HttpResponse.json(makeByCategory())),
    ]

    beforeEach(() => {
      // Only the clock is faked, so "today" and the current month are fixed.
      vi.useFakeTimers({ toFake: ['Date'] })
      vi.setSystemTime(new Date(2026, 9, 10, 9, 0))
    })
    afterEach(() => {
      vi.useRealTimers()
    })

    it('shows the estimate, says it is one and lists its premises', async () => {
      let asOf: string | null = null
      server.use(
        ...loaded,
        http.get(PROJECTION, ({ request }) => {
          asOf = new URL(request.url).searchParams.get('as_of')
          return HttpResponse.json(projection)
        }),
      )
      renderApp('/')

      expect(await screen.findByText('R$ 2.150,00')).toBeInTheDocument()
      expect(asOf).toBe('2026-10-10')
      expect(screen.getByText('Gasto projetado até 31/10/2026')).toBeInTheDocument()
      expect(screen.getByText(/É uma estimativa, não um valor garantido/)).toHaveTextContent(
        'média diária dos 10 dia(s) já decorridos nos 21 dia(s) restantes',
      )
      for (const [label, value] of [
        ['Gasto até 10/10/2026', 'R$ 1.900,00'],
        ['Média diária do gasto variável', 'R$ 10,00'],
        ['Gasto variável projetado', 'R$ 310,00'],
        ['Recorrentes ainda esperados (base: mês anterior)', 'R$ 40,00'],
      ] as const) {
        expect(screen.getByText(label).nextElementSibling).toHaveTextContent(value)
      }
    })

    it('says so when nothing is flagged as recurring', async () => {
      server.use(
        ...loaded,
        http.get(PROJECTION, () =>
          HttpResponse.json({
            ...projection,
            recurring_so_far: '0.00',
            recurring_basis: null,
            recurring_expected: '0.00',
            recurring_remaining: '0.00',
          }),
        ),
      )
      renderApp('/')

      expect((await screen.findByText('Gastos recorrentes')).nextElementSibling).toHaveTextContent(
        'Nenhum marcado',
      )
      expect(screen.queryByText(/Recorrentes ainda esperados/)).not.toBeInTheDocument()
    })

    it('is shown only for the current month', async () => {
      let requested = false
      server.use(
        ...loaded,
        http.get(PROJECTION, () => {
          requested = true
          return HttpResponse.json(projection)
        }),
      )
      renderApp('/?period=previous-month')

      await screen.findByText('R$ 3.649,94')
      await screen.findByRole('list', { name: 'Totais comparados' })
      expect(requested).toBe(false)
      expect(screen.queryByText('Projeção de fechamento do mês')).not.toBeInTheDocument()
    })

    it('keeps the summary when the projection fails', async () => {
      server.use(...loaded, http.get(PROJECTION, () => new HttpResponse(null, { status: 422 })))
      renderApp('/')

      expect(await screen.findByText('Não foi possível carregar a projeção.')).toBeInTheDocument()
      expect(screen.getByText('R$ 3.649,94')).toBeInTheDocument()
      expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    })
  })
})

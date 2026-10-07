import { screen } from '@testing-library/react'
import { delay, http, HttpResponse } from 'msw'
import { describe, expect, it } from 'vitest'
import { emptySummary, makeByCategory, makeSummary } from '../test/fixtures'
import { renderApp, SEPTEMBER } from '../test/render'
import { server } from '../test/server'

const SUMMARY = '/api/analytics/spending-summary'
const BY_CATEGORY = '/api/analytics/spending-by-category'

describe('DashboardPage', () => {
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
})

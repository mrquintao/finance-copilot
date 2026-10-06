import { screen, within } from '@testing-library/react'
import { delay, http, HttpResponse } from 'msw'
import { describe, expect, it } from 'vitest'
import { makePage, makeTransaction } from '../test/fixtures'
import { renderApp, SEPTEMBER } from '../test/render'
import { server } from '../test/server'

const TRANSACTIONS = '/api/transactions'

const uber = makeTransaction()
const salary = makeTransaction({
  id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2',
  date: '2026-09-05',
  description: 'SALARIO',
  merchant: null,
  amount: '8150.00',
  type: 'credit',
  category: null,
})
const rent = makeTransaction({
  id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa3',
  date: '2026-09-01',
  description: 'ALUGUEL',
  merchant: 'Imobiliária',
  amount: '2200.00',
})

describe('TransactionsPage', () => {
  it('shows a loading state', async () => {
    server.use(http.get(TRANSACTIONS, () => delay('infinite')))
    renderApp(`/transactions${SEPTEMBER}`)

    expect(await screen.findByRole('status')).toHaveTextContent('Carregando transações…')
  })

  it('shows an empty state', async () => {
    server.use(http.get(TRANSACTIONS, () => HttpResponse.json(makePage([]))))
    renderApp(`/transactions${SEPTEMBER}`)

    expect(await screen.findByRole('heading', { name: 'Nenhuma transação' })).toBeInTheDocument()
  })

  it('shows an error and recovers on retry', async () => {
    let failing = true
    server.use(
      http.get(TRANSACTIONS, () =>
        failing ? new HttpResponse(null, { status: 500 }) : HttpResponse.json(makePage([uber])),
      ),
    )
    const { user } = renderApp(`/transactions${SEPTEMBER}`)

    expect(await screen.findByRole('alert')).toHaveTextContent('HTTP 500')
    failing = false
    await user.click(screen.getByRole('button', { name: 'Tentar novamente' }))

    expect(await screen.findByText('Uber')).toBeInTheDocument()
  })

  it('lists transactions for the selected period', async () => {
    let query: URLSearchParams | undefined
    server.use(
      http.get(TRANSACTIONS, ({ request }) => {
        query = new URL(request.url).searchParams
        return HttpResponse.json(makePage([uber, salary]))
      }),
    )
    renderApp(`/transactions${SEPTEMBER}`)

    const row = (await screen.findByText('Uber')).closest('a')!
    expect(row).toHaveAttribute('href', `/transactions/${uber.id}${SEPTEMBER}`)
    expect(within(row).getByText('07/09/2026 • Transporte')).toBeInTheDocument()
    expect(within(row).getByText('R$ 37,90')).toBeInTheDocument()
    expect(within(row).getByText('Despesa')).toBeInTheDocument()
    expect(screen.getByText('SALARIO')).toBeInTheDocument()
    expect(screen.getByText('05/09/2026 • Sem categoria')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: '2 transações' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Carregar mais' })).not.toBeInTheDocument()
    expect(Object.fromEntries(query!)).toEqual({
      start_date: '2026-09-01',
      end_date: '2026-09-30',
      limit: '50',
      offset: '0',
    })
  })

  it('loads the next page and retries it after a failure', async () => {
    let failNextPage = true
    server.use(
      http.get(TRANSACTIONS, ({ request }) => {
        const offset = new URL(request.url).searchParams.get('offset')
        if (offset === '0') return HttpResponse.json(makePage([uber, salary], 3, 0))
        if (failNextPage) return new HttpResponse(null, { status: 500 })
        // The repeated row simulates data shifting between pages; it must not duplicate.
        return HttpResponse.json(makePage([salary, rent], 3, 2))
      }),
    )
    const { user } = renderApp(`/transactions${SEPTEMBER}`)

    await user.click(await screen.findByRole('button', { name: 'Carregar mais' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('HTTP 500')
    // The first page stays on screen.
    expect(screen.getByText('Uber')).toBeInTheDocument()

    failNextPage = false
    await user.click(screen.getByRole('button', { name: 'Tentar novamente' }))

    expect(await screen.findByText('Imobiliária')).toBeInTheDocument()
    expect(screen.getAllByText('SALARIO')).toHaveLength(1)
    expect(screen.getAllByRole('listitem').filter((item) => item.querySelector('a[href^="/transactions/"]'))).toHaveLength(3)
    expect(screen.queryByRole('button', { name: 'Carregar mais' })).not.toBeInTheDocument()
  })

  it('opens the transaction detail from the list', async () => {
    server.use(
      http.get(TRANSACTIONS, () => HttpResponse.json(makePage([uber]))),
      http.get(`${TRANSACTIONS}/:id`, () => HttpResponse.json(uber)),
    )
    const { user } = renderApp(`/transactions${SEPTEMBER}`)

    await user.click(await screen.findByText('Uber'))

    expect(await screen.findByRole('heading', { name: 'Uber', level: 1 })).toBeInTheDocument()
  })
})

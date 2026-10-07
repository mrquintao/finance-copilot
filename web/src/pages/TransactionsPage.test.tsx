import { screen, within } from '@testing-library/react'
import { delay, http, HttpResponse } from 'msw'
import { beforeEach, describe, expect, it, vi } from 'vitest'
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

const CARD = 'dddddddd-dddd-4ddd-8ddd-ddddddddddd2'
const TRANSPORT = '22222222-2222-4222-8222-222222222222'

// Options for the account and category filters, needed by every render of the page.
const filterOptions = [
  http.get('/api/accounts', () =>
    HttpResponse.json({
      total: 2,
      groups: [
        {
          institution: 'Banco Fictício',
          accounts: [
            { id: 'dddddddd-dddd-4ddd-8ddd-ddddddddddd1', name: 'Conta corrente' },
            { id: CARD, name: 'Cartão' },
          ],
        },
      ],
    }),
  ),
  http.get('/api/categories', () =>
    HttpResponse.json([
      { id: '33333333-3333-4333-8333-333333333333', name: 'Alimentação' },
      { id: TRANSPORT, name: 'Transporte' },
    ]),
  ),
]

/** Records the query string of every list request and answers with one transaction. */
function recordRequests() {
  const requests: Record<string, string>[] = []
  server.use(
    http.get(TRANSACTIONS, ({ request }) => {
      requests.push(Object.fromEntries(new URL(request.url).searchParams))
      return HttpResponse.json(makePage([uber]))
    }),
  )
  return requests
}

describe('TransactionsPage', () => {
  beforeEach(() => {
    server.use(...filterOptions)
  })

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

  describe('filters', () => {
    it('sends the filters found in the URL and shows them in the controls', async () => {
      const requests = recordRequests()
      renderApp(`/transactions${SEPTEMBER}&q=uber&account=${CARD}&category=${TRANSPORT}&type=debit`)

      await screen.findByText('Uber')
      expect(requests[0]).toEqual({
        start_date: '2026-09-01',
        end_date: '2026-09-30',
        q: 'uber',
        account_id: CARD,
        category_id: TRANSPORT,
        type: 'debit',
        limit: '50',
        offset: '0',
      })
      expect(screen.getByRole('searchbox')).toHaveValue('uber')
      expect(await screen.findByRole('option', { name: 'Cartão', selected: true })).toBeVisible()
      expect(screen.getByRole('option', { name: 'Transporte', selected: true })).toBeVisible()
      expect(screen.getByLabelText('Tipo')).toHaveValue('debit')
    })

    it('ignores invalid filter values in the URL', async () => {
      const requests = recordRequests()
      renderApp(`/transactions${SEPTEMBER}&account=not-a-uuid&type=expense&q=%20%20`)

      await screen.findByText('Uber')
      expect(Object.keys(requests[0]!).sort()).toEqual(['end_date', 'limit', 'offset', 'start_date'])
      expect(screen.queryByRole('button', { name: 'Limpar filtros' })).not.toBeInTheDocument()
    })

    it('searches on submit and combines with the other filters', async () => {
      const requests = recordRequests()
      const { user } = renderApp(`/transactions${SEPTEMBER}`)
      await screen.findByText('Uber')

      await user.type(screen.getByRole('searchbox'), 'uber')
      // Typing alone does not query.
      expect(requests).toHaveLength(1)
      await user.keyboard('{Enter}')
      await screen.findByRole('button', { name: 'Limpar filtros' })
      await user.selectOptions(screen.getByLabelText('Tipo'), 'Receita')
      await user.selectOptions(await screen.findByLabelText('Conta'), 'Cartão')
      await user.selectOptions(screen.getByLabelText('Categoria'), 'Transporte')

      await vi.waitFor(() =>
        expect(requests.at(-1)).toEqual({
          start_date: '2026-09-01',
          end_date: '2026-09-30',
          q: 'uber',
          account_id: CARD,
          category_id: TRANSPORT,
          type: 'credit',
          limit: '50',
          offset: '0',
        }),
      )
    })

    it('keeps the filters when the period changes, and the period when filters change', async () => {
      const requests = recordRequests()
      const { user } = renderApp(`/transactions${SEPTEMBER}&type=credit`)
      await screen.findByText('Uber')

      await user.click(screen.getByRole('button', { name: 'Últimos 3 meses' }))
      await vi.waitFor(() => expect(requests).toHaveLength(2))
      expect(requests[1]!.type).toBe('credit')
      expect(requests[1]!.start_date).not.toBe('2026-09-01')

      await user.selectOptions(screen.getByLabelText('Tipo'), 'Todos')
      await vi.waitFor(() => expect(requests).toHaveLength(3))
      expect(requests[2]!.type).toBeUndefined()
      expect(requests[2]!.start_date).toBe(requests[1]!.start_date)
      expect(screen.getByRole('button', { name: 'Últimos 3 meses' })).toHaveAttribute(
        'aria-pressed',
        'true',
      )
    })

    it('clears every filter at once', async () => {
      const requests = recordRequests()
      const { user } = renderApp(`/transactions${SEPTEMBER}&q=uber&type=debit`)
      await screen.findByText('Uber')

      await user.click(screen.getByRole('button', { name: 'Limpar filtros' }))

      await vi.waitFor(() =>
        expect(requests.at(-1)).toEqual({
          start_date: '2026-09-01',
          end_date: '2026-09-30',
          limit: '50',
          offset: '0',
        }),
      )
      expect(screen.getByRole('searchbox')).toHaveValue('')
      expect(screen.getByLabelText('Tipo')).toHaveValue('')
    })

    it('explains an empty result caused by filters and offers to clear them', async () => {
      server.use(
        http.get(TRANSACTIONS, ({ request }) =>
          HttpResponse.json(makePage(new URL(request.url).searchParams.has('q') ? [] : [uber])),
        ),
      )
      const { user } = renderApp(`/transactions${SEPTEMBER}&q=nada`)

      expect(
        await screen.findByRole('heading', { name: 'Nenhuma transação encontrada' }),
      ).toBeInTheDocument()
      await user.click(screen.getAllByRole('button', { name: 'Limpar filtros' }).at(-1)!)

      expect(await screen.findByText('Uber')).toBeInTheDocument()
    })

    it('keeps the filters on the next page', async () => {
      const requests: Record<string, string>[] = []
      server.use(
        http.get(TRANSACTIONS, ({ request }) => {
          const query = Object.fromEntries(new URL(request.url).searchParams)
          requests.push(query)
          return HttpResponse.json(
            query.offset === '0' ? makePage([uber, salary], 3, 0) : makePage([rent], 3, 2),
          )
        }),
      )
      const { user } = renderApp(`/transactions${SEPTEMBER}&type=debit&q=a`)

      await user.click(await screen.findByRole('button', { name: 'Carregar mais' }))

      expect(await screen.findByText('Imobiliária')).toBeInTheDocument()
      expect(requests.at(-1)).toMatchObject({ offset: '2', type: 'debit', q: 'a' })
    })

    it('still works when the filter options cannot be loaded', async () => {
      server.use(
        http.get('/api/accounts', () => new HttpResponse(null, { status: 404 })),
        http.get('/api/categories', () => new HttpResponse(null, { status: 404 })),
      )
      const requests = recordRequests()
      const { user } = renderApp(`/transactions${SEPTEMBER}`)
      await screen.findByText('Uber')

      await user.selectOptions(screen.getByLabelText('Tipo'), 'Transferência')

      await vi.waitFor(() => expect(requests.at(-1)!.type).toBe('transfer'))
    })

    it('carries the period, but not the filters, to the other tabs', async () => {
      recordRequests()
      renderApp(`/transactions${SEPTEMBER}&q=uber&type=debit`)
      await screen.findByText('Uber')

      expect(screen.getByRole('link', { name: 'Resumo' })).toHaveAttribute('href', `/${SEPTEMBER}`)
      // The detail link keeps everything, so "back" returns to the same filtered list.
      expect(screen.getByText('Uber').closest('a')).toHaveAttribute(
        'href',
        `/transactions/${uber.id}${SEPTEMBER}&q=uber&type=debit`,
      )
    })
  })
})

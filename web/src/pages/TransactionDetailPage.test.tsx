import { screen } from '@testing-library/react'
import { delay, http, HttpResponse } from 'msw'
import { describe, expect, it } from 'vitest'
import { makeTransaction } from '../test/fixtures'
import { renderApp } from '../test/render'
import { server } from '../test/server'

const transaction = makeTransaction({ subcategory: 'ride_hailing', is_recurring: true })
const DETAIL = '/api/transactions/:id'
const route = `/transactions/${transaction.id}`

describe('TransactionDetailPage', () => {
  it('shows a loading state', async () => {
    server.use(http.get(DETAIL, () => delay('infinite')))
    renderApp(route)

    expect(await screen.findByRole('status')).toHaveTextContent('Carregando transação…')
  })

  it('shows every field of the transaction', async () => {
    let requestedId: unknown
    server.use(
      http.get(DETAIL, ({ params }) => {
        requestedId = params.id
        return HttpResponse.json(transaction)
      }),
    )
    renderApp(route)

    expect(await screen.findByRole('heading', { name: 'Uber', level: 1 })).toBeInTheDocument()
    expect(requestedId).toBe(transaction.id)
    for (const text of [
      'R$ 37,90',
      'Despesa',
      '07/09/2026',
      'UBER *TRIP',
      'Transporte',
      'ride_hailing',
      'Sim',
      'BRL',
      'Conta Corrente',
      'Banco Fictício',
    ]) {
      expect(screen.getByText(text)).toBeInTheDocument()
    }
  })

  it('explains that transfers are excluded from totals', async () => {
    server.use(
      http.get(DETAIL, () => HttpResponse.json(makeTransaction({ type: 'transfer' }))),
    )
    renderApp(route)

    expect(await screen.findByText(/Transferência interna/)).toBeInTheDocument()
  })

  it.each([404, 422])('shows "not found" for HTTP %i', async (status) => {
    server.use(http.get(DETAIL, () => HttpResponse.json({ detail: 'x' }, { status })))
    renderApp(route)

    expect(
      await screen.findByRole('heading', { name: 'Transação não encontrada' }),
    ).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Tentar novamente' })).not.toBeInTheDocument()
  })

  it('shows an error and recovers on retry', async () => {
    let failing = true
    server.use(
      http.get(DETAIL, () =>
        failing ? new HttpResponse(null, { status: 503 }) : HttpResponse.json(transaction),
      ),
    )
    const { user } = renderApp(route)

    expect(await screen.findByRole('alert')).toHaveTextContent('Serviço indisponível')
    failing = false
    await user.click(screen.getByRole('button', { name: 'Tentar novamente' }))

    expect(await screen.findByRole('heading', { name: 'Uber', level: 1 })).toBeInTheDocument()
  })

  it('links back to the list keeping the period', async () => {
    server.use(http.get(DETAIL, () => HttpResponse.json(transaction)))
    renderApp(`${route}?period=previous-month`)

    expect(await screen.findByRole('link', { name: '← Transações' })).toHaveAttribute(
      'href',
      '/transactions?period=previous-month',
    )
  })
})

import { screen, within } from '@testing-library/react'
import { delay, http, HttpResponse } from 'msw'
import { describe, expect, it } from 'vitest'
import type { AccountList, AccountSummary } from '../api/types'
import { formatDateTime } from '../lib/dateTime'
import { renderApp } from '../test/render'
import { server } from '../test/server'

const ACCOUNTS = '/api/accounts'

function account(overrides: Partial<AccountSummary>): AccountSummary {
  return {
    id: 'dddddddd-dddd-4ddd-8ddd-ddddddddddd1',
    name: 'Conta corrente',
    institution: 'MeuPluggy',
    currency: 'BRL',
    provider: 'pluggy',
    connection: 'connected',
    last_sync: {
      status: 'succeeded',
      started_at: '2026-09-30T12:00:00Z',
      finished_at: '2026-09-30T12:00:05Z',
    },
    last_successful_sync_at: '2026-09-30T12:00:05Z',
    transaction_count: 120,
    last_transaction_date: '2026-09-28',
    ...overrides,
  }
}

const several: AccountList = {
  total: 4,
  groups: [
    {
      institution: 'Banco Fictício',
      accounts: [
        account({
          id: 'dddddddd-dddd-4ddd-8ddd-ddddddddddd3',
          name: 'Conta antiga',
          institution: 'Banco Fictício',
          connection: 'failing',
          last_sync: { status: 'failed', started_at: '2026-09-30T14:00:00Z', finished_at: null },
          last_successful_sync_at: '2026-09-29T08:00:00Z',
          transaction_count: 1,
        }),
      ],
    },
    {
      institution: 'Dinheiro',
      accounts: [
        account({
          id: 'dddddddd-dddd-4ddd-8ddd-ddddddddddd4',
          name: 'Carteira',
          institution: 'Dinheiro',
          provider: null,
          connection: 'local',
          last_sync: null,
          last_successful_sync_at: null,
          transaction_count: 0,
          last_transaction_date: null,
        }),
      ],
    },
    {
      institution: 'MeuPluggy',
      accounts: [
        account({ id: 'dddddddd-dddd-4ddd-8ddd-ddddddddddd2', name: 'Cartão' }),
        account({}),
      ],
    },
  ],
}

describe('AccountsPage', () => {
  it('shows a loading state', async () => {
    server.use(http.get(ACCOUNTS, () => delay('infinite')))
    renderApp('/accounts')

    expect(await screen.findByRole('status')).toHaveTextContent('Carregando contas…')
  })

  it('shows an empty state that points to Connections', async () => {
    server.use(http.get(ACCOUNTS, () => HttpResponse.json({ total: 0, groups: [] })))
    renderApp('/accounts')

    expect(await screen.findByRole('heading', { name: 'Nenhuma conta' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Ir para Conexões' })).toHaveAttribute(
      'href',
      '/connections',
    )
  })

  it('shows an error and recovers on retry', async () => {
    let failing = true
    server.use(
      http.get(ACCOUNTS, () =>
        failing ? new HttpResponse(null, { status: 503 }) : HttpResponse.json(several),
      ),
    )
    const { user } = renderApp('/accounts')

    expect(await screen.findByRole('alert')).toHaveTextContent('Serviço indisponível')
    failing = false
    await user.click(screen.getByRole('button', { name: 'Tentar novamente' }))

    expect(await screen.findByText('Carteira')).toBeInTheDocument()
  })

  it('lists several accounts grouped by institution', async () => {
    server.use(http.get(ACCOUNTS, () => HttpResponse.json(several)))
    renderApp('/accounts')

    expect(await screen.findByText('4 contas em 3 origens.')).toBeInTheDocument()
    expect(
      screen.getAllByRole('heading', { level: 2 }).map((heading) => heading.textContent),
    ).toEqual(['Banco Fictício', 'Dinheiro', 'MeuPluggy'])

    const meuPluggy = screen.getByRole('region', { name: 'MeuPluggy' })
    expect(within(meuPluggy).getAllByRole('listitem')).toHaveLength(2)
    const checking = within(meuPluggy).getByText('Conta corrente').closest('li')!
    expect(within(checking).getByText('BRL • 120 transações • última em 28/09/2026')).toBeVisible()
    expect(within(checking).getByText('Sincronizada')).toBeInTheDocument()
    expect(
      within(checking).getByText(`Dados de ${formatDateTime('2026-09-30T12:00:05Z')}`),
    ).toBeInTheDocument()
  })

  it('distinguishes failing and local accounts', async () => {
    server.use(http.get(ACCOUNTS, () => HttpResponse.json(several)))
    renderApp('/accounts')

    const failing = (await screen.findByText('Conta antiga')).closest('li')!
    expect(within(failing).getByText('Última sincronização falhou')).toBeInTheDocument()
    expect(within(failing).getByText('BRL • 1 transação • última em 28/09/2026')).toBeVisible()
    // The last good import is still shown, so the user knows how old the data is.
    expect(
      within(failing).getByText(`Dados de ${formatDateTime('2026-09-29T08:00:00Z')}`),
    ).toBeInTheDocument()

    const local = screen.getByText('Carteira').closest('li')!
    expect(within(local).getByText('Conta local')).toBeInTheDocument()
    expect(within(local).getByText('BRL • 0 transações')).toBeInTheDocument()
    expect(within(local).queryByText(/Dados de/)).not.toBeInTheDocument()
  })

  it('is reachable from the navigation', async () => {
    server.use(
      http.get(ACCOUNTS, () => HttpResponse.json(several)),
      http.get('/api/sync/runs', () => HttpResponse.json({ items: [] })),
    )
    const { user } = renderApp('/connections')

    await user.click(screen.getByRole('link', { name: 'Contas' }))

    expect(await screen.findByRole('heading', { name: 'Contas', level: 1 })).toBeInTheDocument()
  })
})

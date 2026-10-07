import { screen, within } from '@testing-library/react'
import { delay, http, HttpResponse } from 'msw'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { openPluggyConnect } from '../lib/pluggyConnect'
import { makeSyncRun } from '../test/fixtures'
import { renderApp } from '../test/render'
import { server } from '../test/server'

// The real widget is a third-party iframe; the wrapper is the seam.
vi.mock('../lib/pluggyConnect', () => ({ openPluggyConnect: vi.fn() }))
const openWidget = vi.mocked(openPluggyConnect)

const RUNS = '/api/sync/runs'
const noRuns = http.get(RUNS, () => HttpResponse.json({ items: [] }))

describe('ConnectionsPage', () => {
  // Braces matter: a function returned from beforeEach is run by Vitest as a cleanup hook,
  // and mockReset() returns the mock itself.
  beforeEach(() => {
    openWidget.mockReset()
  })

  describe('history', () => {
    it('shows a loading state', async () => {
      server.use(http.get(RUNS, () => delay('infinite')))
      renderApp('/connections')

      expect(await screen.findByRole('status')).toHaveTextContent('Carregando histórico…')
    })

    it('shows an empty state', async () => {
      server.use(noRuns)
      renderApp('/connections')

      expect(
        await screen.findByRole('heading', { name: 'Nenhuma sincronização' }),
      ).toBeInTheDocument()
    })

    it('shows an error and recovers on retry', async () => {
      let failing = true
      server.use(
        http.get(RUNS, () =>
          failing
            ? new HttpResponse(null, { status: 503 })
            : HttpResponse.json({ items: [makeSyncRun()] }),
        ),
      )
      const { user } = renderApp('/connections')

      expect(await screen.findByRole('alert')).toHaveTextContent('Serviço indisponível')
      failing = false
      await user.click(screen.getByRole('button', { name: 'Tentar novamente' }))

      expect(await screen.findByText('Concluída')).toBeInTheDocument()
    })

    it('lists runs with status and counts', async () => {
      server.use(
        http.get(RUNS, () =>
          HttpResponse.json({
            items: [
              makeSyncRun(),
              makeSyncRun({
                id: 'cccccccc-cccc-4ccc-8ccc-ccccccccccc2',
                status: 'failed',
                finished_at: null,
                accounts_received: 0,
                transactions_received: 0,
                transactions_created: 0,
                transactions_updated: 0,
                error: 'Provider request failed.',
              }),
            ],
          }),
        ),
      )
      renderApp('/connections')

      const succeeded = (await screen.findByText('Concluída')).closest('li')!
      const counts = [
        ['Contas', '2'],
        ['Recebidas', '40'],
        ['Novas', '7'],
        ['Atualizadas', '3'],
      ] as const
      for (const [label, value] of counts) {
        expect(within(succeeded).getByText(label).nextElementSibling).toHaveTextContent(value)
      }
      const failed = screen.getByText('Falhou').closest('li')!
      expect(within(failed).getByText('Provider request failed.')).toBeInTheDocument()
    })
  })

  describe('connect', () => {
    it('gets a token, opens the widget, syncs the new item and refreshes the history', async () => {
      let synced: unknown
      let runs = [] as ReturnType<typeof makeSyncRun>[]
      server.use(
        http.get(RUNS, () => HttpResponse.json({ items: runs })),
        http.post('/api/sync/connect-token', () => HttpResponse.json({ connect_token: 'tok' })),
        http.post('/api/sync', async ({ request }) => {
          synced = await request.json()
          runs = [makeSyncRun()]
          return HttpResponse.json(makeSyncRun())
        }),
      )
      openWidget.mockResolvedValue('item-1')
      const { user } = renderApp('/connections')

      await user.click(screen.getByRole('button', { name: 'Conectar com MeuPluggy' }))

      expect(
        await screen.findByText(
          'MeuPluggy conectado e dados sincronizados: 7 novas e 3 atualizadas.',
        ),
      ).toBeInTheDocument()
      expect(openWidget).toHaveBeenCalledWith('tok')
      expect(synced).toEqual({ item_id: 'item-1' })
      expect(await screen.findByText('Concluída')).toBeInTheDocument()
    })

    it('does not sync when the widget is closed without connecting', async () => {
      server.use(
        noRuns,
        http.post('/api/sync/connect-token', () => HttpResponse.json({ connect_token: 'tok' })),
      )
      openWidget.mockResolvedValue(null)
      const { user } = renderApp('/connections')

      await user.click(screen.getByRole('button', { name: 'Conectar com MeuPluggy' }))

      // No POST /sync handler exists: a sync attempt would fail the test.
      expect(
        await screen.findByText('A conexão não foi concluída. Tente novamente.'),
      ).toBeInTheDocument()
    })

    it('explains when Pluggy is not configured', async () => {
      server.use(
        noRuns,
        http.post('/api/sync/connect-token', () =>
          HttpResponse.json(
            { detail: 'Open Finance provider is not configured.' },
            { status: 503 },
          ),
        ),
      )
      const { user } = renderApp('/connections')

      await user.click(screen.getByRole('button', { name: 'Conectar com MeuPluggy' }))

      expect(
        await screen.findByText(/A integração com a Pluggy não está configurada no backend/),
      ).toBeInTheDocument()
      expect(openWidget).not.toHaveBeenCalled()
    })

    it('says the connection failed when no connect token can be created', async () => {
      server.use(
        noRuns,
        http.post('/api/sync/connect-token', () => new HttpResponse(null, { status: 502 })),
      )
      const { user } = renderApp('/connections')

      await user.click(screen.getByRole('button', { name: 'Conectar com MeuPluggy' }))

      expect(
        await screen.findByText('Não foi possível conectar ao MeuPluggy. Tente novamente.'),
      ).toBeInTheDocument()
      expect(openWidget).not.toHaveBeenCalled()
    })

    it('says the connection failed when the widget reports an error', async () => {
      server.use(
        noRuns,
        http.post('/api/sync/connect-token', () => HttpResponse.json({ connect_token: 'tok' })),
      )
      openWidget.mockRejectedValue(new Error('Pluggy Connect failed'))
      const { user } = renderApp('/connections')

      await user.click(screen.getByRole('button', { name: 'Conectar com MeuPluggy' }))

      // No POST /sync handler exists: a sync attempt would fail the test.
      expect(
        await screen.findByText('Não foi possível conectar ao MeuPluggy. Tente novamente.'),
      ).toBeInTheDocument()
    })

    it('says the backend is unreachable when the token request never gets a response', async () => {
      server.use(
        noRuns,
        http.post('/api/sync/connect-token', () => HttpResponse.error()),
      )
      const { user } = renderApp('/connections')

      await user.click(screen.getByRole('button', { name: 'Conectar com MeuPluggy' }))

      expect(await screen.findByText(/Não foi possível conectar ao servidor/)).toBeInTheDocument()
    })

    it('reports a failed import after connecting, then recovers with sync again', async () => {
      server.use(
        noRuns,
        http.post('/api/sync/connect-token', () => HttpResponse.json({ connect_token: 'tok' })),
        http.post('/api/sync', () => new HttpResponse(null, { status: 502 })),
        http.post('/api/sync/refresh', () => HttpResponse.json({ items: [makeSyncRun()] })),
      )
      openWidget.mockResolvedValue('item-1')
      const { user } = renderApp('/connections')

      await user.click(screen.getByRole('button', { name: 'Conectar com MeuPluggy' }))

      expect(
        await screen.findByText(
          'MeuPluggy foi conectado, mas não foi possível importar os dados agora. Tente sincronizar novamente.',
        ),
      ).toBeInTheDocument()
      // The connection itself is not reported as failed.
      expect(screen.queryByText(/Não foi possível conectar/)).not.toBeInTheDocument()

      await user.click(screen.getByRole('button', { name: 'Sincronizar novamente' }))

      expect(
        await screen.findByText('Sincronização concluída: 7 novas e 3 atualizadas.'),
      ).toBeInTheDocument()
    })
  })

  describe('sync again', () => {
    it('refreshes every connection and sums the counts', async () => {
      server.use(
        noRuns,
        http.post('/api/sync/refresh', () =>
          HttpResponse.json({
            items: [makeSyncRun(), makeSyncRun({ transactions_created: 1, transactions_updated: 0 })],
          }),
        ),
      )
      const { user } = renderApp('/connections')

      await user.click(screen.getByRole('button', { name: 'Sincronizar novamente' }))

      expect(
        await screen.findByText('Sincronização concluída: 8 novas e 3 atualizadas.'),
      ).toBeInTheDocument()
    })

    it('says when nothing is connected yet', async () => {
      server.use(
        noRuns,
        http.post('/api/sync/refresh', () => HttpResponse.json({ items: [] })),
      )
      const { user } = renderApp('/connections')

      await user.click(screen.getByRole('button', { name: 'Sincronizar novamente' }))

      expect(await screen.findByText('Nenhuma conta MeuPluggy conectada ainda.')).toBeInTheDocument()
    })

    it('disables both actions while a sync is running', async () => {
      server.use(
        noRuns,
        http.post('/api/sync/refresh', () => delay('infinite')),
      )
      const { user } = renderApp('/connections')

      await user.click(screen.getByRole('button', { name: 'Sincronizar novamente' }))

      expect(await screen.findByText('Sincronizando…')).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Sincronizar novamente' })).toBeDisabled()
      expect(screen.getByRole('button', { name: 'Conectar com MeuPluggy' })).toBeDisabled()
    })
  })
})

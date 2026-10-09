import { render, screen, within } from '@testing-library/react'
import { delay, http, HttpResponse } from 'msw'
import { beforeEach, describe, expect, it } from 'vitest'
import type { CopilotAnswer } from '../../api/types'
import { renderApp } from '../../test/render'
import { server } from '../../test/server'
import { Markdown } from './Markdown'

const STATUS = '/api/copilot/status'
const ASK = '/api/copilot/ask'
const OPEN = { name: 'Abrir conversa com o Finance Copilot' }

const local = { configured: true, provider: 'ollama', model: 'llama3.1:8b', local: true }

function answer(overrides: Partial<CopilotAnswer> = {}): CopilotAnswer {
  return {
    status: 'answered',
    answer: 'Você gastou R$ 613,08 com Mercado.',
    periods: [{ start_date: '2026-09-01', end_date: '2026-09-30' }],
    no_data: false,
    evidence: [
      {
        tool: 'get_spending_by_category',
        title: 'Gastos por categoria',
        source: 'Soma dos débitos do período por categoria',
        period: { start_date: '2026-09-01', end_date: '2026-09-30' },
        comparison_period: null,
        has_data: true,
        facts: [{ label: 'Mercado', value: '613.08', kind: 'money', detail: null, link: null }],
        transactions_link: null,
        transactions: [],
      },
    ],
    ...overrides,
  }
}

/** Opens the widget on a screen that needs only one handler of its own. */
async function openWidget() {
  const view = renderApp('/connections')
  await view.user.click(screen.getByRole('button', OPEN))
  return { ...view, dialog: screen.getByRole('dialog', { name: 'Finance Copilot' }) }
}

const field = () => screen.getByRole('textbox', { name: 'Mensagem para o Finance Copilot' })

describe('CopilotWidget', () => {
  beforeEach(() => {
    server.use(
      http.get('/api/sync/runs', () => HttpResponse.json({ items: [] })),
      http.get('/api/accounts', () => HttpResponse.json({ total: 0, groups: [] })),
      http.get(STATUS, () => HttpResponse.json(local)),
    )
  })

  it('shows the duck as the launcher, closed at first', () => {
    renderApp('/connections')

    const launcher = screen.getByRole('button', OPEN)
    expect(launcher).toHaveAttribute('aria-expanded', 'false')
    expect(launcher.querySelector('img')).toHaveAttribute(
      'src',
      expect.stringContaining('copilot-duck'),
    )
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('opens on the duck and closes from the header, the launcher and Escape', async () => {
    const { user, dialog } = await openWidget()

    expect(within(dialog).getByText('Seu assistente financeiro')).toBeInTheDocument()
    expect(field()).toHaveFocus()
    expect(await within(dialog).findByText(/Nada é enviado para fora/)).toBeInTheDocument()

    await user.click(within(dialog).getByRole('button', { name: 'Recolher conversa' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(screen.getByRole('button', OPEN)).toHaveFocus()

    await user.click(screen.getByRole('button', OPEN))
    await user.click(screen.getByRole('button', { name: 'Recolher conversa com o Finance Copilot' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', OPEN))
    await user.keyboard('{Escape}')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('can be made larger and smaller', async () => {
    const { user, dialog } = await openWidget()

    await user.click(within(dialog).getByRole('button', { name: 'Ampliar conversa' }))
    expect(within(dialog).getByRole('button', { name: 'Reduzir conversa' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
  })

  it('sends with Enter, keeps Shift+Enter as a line break and shows the answer', async () => {
    let body: { question?: string; today?: string } = {}
    server.use(
      http.post(ASK, async ({ request }) => {
        body = (await request.json()) as typeof body
        return HttpResponse.json(answer())
      }),
    )
    const { user, dialog } = await openWidget()

    await user.type(field(), 'Quanto gastei{Shift>}{Enter}{/Shift}com mercado?')
    expect(field()).toHaveValue('Quanto gastei\ncom mercado?')
    await user.keyboard('{Enter}')

    const log = within(dialog).getByRole('log', { name: 'Conversa' })
    expect(await within(log).findByText('Você gastou R$ 613,08 com Mercado.')).toBeInTheDocument()
    expect(within(log).getByText(/Quanto gastei\s+com mercado\?/)).toBeInTheDocument()
    expect(body.question).toBe('Quanto gastei\ncom mercado?')
    expect(body.today).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    expect(field()).toHaveValue('')
    // The calculated data stays one click away, apart from the model's text.
    expect(within(log).getByText('Dados calculados pelo aplicativo (1 consulta)')).toBeInTheDocument()
    expect(within(log).getByText('R$ 613,08')).toBeInTheDocument()
    expect(within(log).getByText(/foram conferidos com os dados calculados/)).toBeInTheDocument()
  })

  it('does not send an empty message', async () => {
    let asked = false
    server.use(
      http.post(ASK, () => {
        asked = true
        return HttpResponse.json(answer())
      }),
    )
    const { user, dialog } = await openWidget()

    expect(within(dialog).getByRole('button', { name: 'Enviar mensagem' })).toBeDisabled()
    await user.type(field(), '   {Enter}')

    expect(asked).toBe(false)
    expect(within(dialog).queryByText(/Consultando/)).not.toBeInTheDocument()
  })

  it('shows that an answer is being generated and lets the user cancel it', async () => {
    server.use(http.post(ASK, () => delay('infinite')))
    const { user, dialog } = await openWidget()

    await user.type(field(), 'Quanto gastei?{Enter}')

    expect(await within(dialog).findByText(/Consultando seus dados…/)).toBeInTheDocument()
    expect(within(dialog).queryByRole('button', { name: 'Enviar mensagem' })).not.toBeInTheDocument()
    await user.click(within(dialog).getByRole('button', { name: 'Cancelar' }))

    expect(await within(dialog).findByText('Pergunta cancelada')).toBeInTheDocument()
    expect(within(dialog).getByRole('button', { name: 'Perguntar de novo' })).toBeInTheDocument()
  })

  it('shows an error and recovers on retry', async () => {
    let failing = true
    server.use(
      http.post(ASK, () =>
        failing ? new HttpResponse(null, { status: 502 }) : HttpResponse.json(answer()),
      ),
    )
    const { user, dialog } = await openWidget()

    await user.type(field(), 'Quanto gastei?{Enter}')
    expect(await within(dialog).findByText('O Copilot não respondeu')).toBeInTheDocument()
    expect(within(dialog).getByText(/O Ollama não respondeu/)).toBeInTheDocument()

    failing = false
    await user.click(within(dialog).getByRole('button', { name: 'Tentar novamente' }))

    expect(await within(dialog).findByText('Você gastou R$ 613,08 com Mercado.')).toBeInTheDocument()
    expect(within(dialog).queryByText('O Copilot não respondeu')).not.toBeInTheDocument()
  })

  it('names a withheld answer instead of presenting it as a normal reply', async () => {
    server.use(
      http.post(ASK, () =>
        HttpResponse.json(
          answer({ status: 'ungrounded', answer: 'A resposta foi retida.', evidence: [] }),
        ),
      ),
    )
    const { user, dialog } = await openWidget()

    await user.type(field(), 'Quanto gastei?{Enter}')

    expect(await within(dialog).findByText('Resposta retida')).toBeInTheDocument()
    expect(within(dialog).queryByText(/foram conferidos/)).not.toBeInTheDocument()
    expect(within(dialog).getByText(/Nenhuma consulta foi feita/)).toBeInTheDocument()
  })

  it('keeps the conversation while the user moves between screens', async () => {
    server.use(http.post(ASK, () => HttpResponse.json(answer())))
    const { user, dialog } = await openWidget()

    await user.type(field(), 'Quanto gastei?{Enter}')
    await within(dialog).findByText('Você gastou R$ 613,08 com Mercado.')
    await user.click(within(dialog).getByRole('button', { name: 'Recolher conversa' }))
    await user.click(screen.getByRole('link', { name: 'Suas contas' }))
    await screen.findByRole('heading', { name: 'Contas', level: 1 })

    await user.click(screen.getByRole('button', OPEN))
    const reopened = screen.getByRole('dialog', { name: 'Finance Copilot' })
    expect(within(reopened).getByText('Você gastou R$ 613,08 com Mercado.')).toBeInTheDocument()
    expect(within(reopened).getByText('Quanto gastei?')).toBeInTheDocument()
  })

  it('says so, and blocks sending, when the Copilot is not configured', async () => {
    server.use(
      http.get(STATUS, () =>
        HttpResponse.json({ configured: false, provider: null, model: null, local: false }),
      ),
    )
    const { dialog } = await openWidget()

    expect(
      await within(dialog).findByText(/O Copilot não está configurado no backend/),
    ).toBeInTheDocument()
    expect(field()).toBeDisabled()
    expect(within(dialog).getByRole('button', { name: 'Enviar mensagem' })).toBeDisabled()
  })

  it('warns when the question and the data leave this computer', async () => {
    server.use(
      http.get(STATUS, () =>
        HttpResponse.json({
          configured: true,
          provider: 'anthropic',
          model: 'claude-opus-5-5',
          local: false,
        }),
      ),
    )
    const { dialog } = await openWidget()

    expect(await within(dialog).findByText(/são enviados à API da Anthropic/)).toBeInTheDocument()
  })

  it('steps aside on the Copilot page, which is the full-size conversation', () => {
    renderApp('/copilot')

    expect(screen.queryByRole('button', OPEN)).not.toBeInTheDocument()
  })
})

describe('Markdown', () => {
  it('renders lists, emphasis and code without injecting HTML', () => {
    render(
      <Markdown
        text={'Resumo:\n\n- **Mercado**: R$ 613,08\n- Uber\n\n1. primeiro\n2. segundo\n\n```\nSELECT 1\n```\n<b>cru</b> e `inline`'}
      />,
    )

    const [bullets, numbered] = screen.getAllByRole('list')
    expect(within(bullets!).getAllByRole('listitem')).toHaveLength(2)
    expect(within(numbered!).getAllByRole('listitem')).toHaveLength(2)
    expect(screen.getByText('Mercado').tagName).toBe('STRONG')
    expect(screen.getByText('SELECT 1').tagName).toBe('CODE')
    expect(screen.getByText('inline').tagName).toBe('CODE')
    // Markup in the text stays text.
    expect(screen.getByText(/<b>cru<\/b>/)).toBeInTheDocument()
  })
})

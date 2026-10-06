import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, useLocation } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { PeriodFilter } from './PeriodFilter'

function Search() {
  return <output data-testid="search">{useLocation().search}</output>
}

function renderFilter(route = '/') {
  render(
    <MemoryRouter initialEntries={[route]}>
      <PeriodFilter />
      <Search />
    </MemoryRouter>,
  )
  return userEvent.setup()
}

const pressed = (name: string) =>
  screen.getByRole('button', { name }).getAttribute('aria-pressed') === 'true'

describe('PeriodFilter', () => {
  beforeEach(() => {
    // Only the clock is faked; timers stay real so user-event keeps working.
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date(2026, 9, 6, 10, 0))
  })
  afterEach(() => vi.useRealTimers())

  it('starts on the current month', () => {
    renderFilter()
    expect(pressed('Mês atual')).toBe(true)
    expect(screen.getByText('01/10/2026 – 31/10/2026')).toBeInTheDocument()
  })

  it('switches presets and writes them to the URL', async () => {
    const user = renderFilter()

    await user.click(screen.getByRole('button', { name: 'Mês anterior' }))
    expect(pressed('Mês anterior')).toBe(true)
    expect(pressed('Mês atual')).toBe(false)
    expect(screen.getByText('01/09/2026 – 30/09/2026')).toBeInTheDocument()
    expect(screen.getByTestId('search')).toHaveTextContent('?period=previous-month')

    await user.click(screen.getByRole('button', { name: 'Últimos 3 meses' }))
    expect(screen.getByText('01/08/2026 – 31/10/2026')).toBeInTheDocument()
    expect(screen.getByTestId('search')).toHaveTextContent('?period=last-3-months')
  })

  it('applies a custom range', async () => {
    const user = renderFilter()

    await user.click(screen.getByRole('button', { name: 'Personalizado' }))
    fireEvent.change(screen.getByLabelText('De'), { target: { value: '2026-04-01' } })
    fireEvent.change(screen.getByLabelText('Até'), { target: { value: '2026-09-30' } })
    await user.click(screen.getByRole('button', { name: 'Aplicar' }))

    expect(pressed('Personalizado')).toBe(true)
    expect(screen.getByText('01/04/2026 – 30/09/2026')).toBeInTheDocument()
    expect(screen.getByTestId('search')).toHaveTextContent('?start=2026-04-01&end=2026-09-30')
  })

  it('blocks an inverted custom range', async () => {
    const user = renderFilter()

    await user.click(screen.getByRole('button', { name: 'Personalizado' }))
    fireEvent.change(screen.getByLabelText('De'), { target: { value: '2026-09-30' } })
    fireEvent.change(screen.getByLabelText('Até'), { target: { value: '2026-09-01' } })

    expect(screen.getByRole('alert')).toHaveTextContent(
      'A data inicial deve ser anterior ou igual à data final.',
    )
    expect(screen.getByRole('button', { name: 'Aplicar' })).toBeDisabled()
    // Nothing was applied: the period on screen is still the current month.
    expect(screen.getByText('01/10/2026 – 31/10/2026')).toBeInTheDocument()
    expect(screen.getByTestId('search')).toBeEmptyDOMElement()
  })

  it('restores a custom range from the URL', () => {
    renderFilter('/?start=2026-04-01&end=2026-09-30')
    expect(pressed('Personalizado')).toBe(true)
    expect(screen.getByLabelText('De')).toHaveValue('2026-04-01')
    expect(screen.getByLabelText('Até')).toHaveValue('2026-09-30')
  })
})

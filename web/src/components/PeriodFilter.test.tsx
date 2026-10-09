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

const button = (name: string) => screen.getByRole('button', { name })

describe('PeriodFilter', () => {
  beforeEach(() => {
    // Only the clock is faked; timers stay real so user-event keeps working.
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date(2026, 9, 6, 10, 0))
  })
  afterEach(() => vi.useRealTimers())

  it('starts on the current month, which has no next month to go to', () => {
    renderFilter()
    expect(screen.getByText('Outubro de 2026')).toBeInTheDocument()
    expect(button('Próximo mês')).toBeDisabled()
    expect(screen.queryByRole('button', { name: 'Mês atual' })).not.toBeInTheDocument()
  })

  it('steps month by month and writes the period to the URL', async () => {
    const user = renderFilter()

    await user.click(button('Mês anterior'))
    expect(screen.getByText('Setembro de 2026')).toBeInTheDocument()
    expect(screen.getByTestId('search')).toHaveTextContent('?period=previous-month')

    await user.click(button('Mês anterior'))
    expect(screen.getByText('Agosto de 2026')).toBeInTheDocument()
    expect(screen.getByTestId('search')).toHaveTextContent('?start=2026-08-01&end=2026-08-31')

    await user.click(button('Próximo mês'))
    expect(screen.getByText('Setembro de 2026')).toBeInTheDocument()
    expect(screen.getByTestId('search')).toHaveTextContent('?period=previous-month')
  })

  it('crosses the year when stepping back from January', async () => {
    const user = renderFilter('/?start=2026-01-01&end=2026-01-31')

    expect(screen.getByText('Janeiro de 2026')).toBeInTheDocument()
    await user.click(button('Mês anterior'))
    expect(screen.getByText('Dezembro de 2025')).toBeInTheDocument()
    expect(screen.getByTestId('search')).toHaveTextContent('?start=2025-12-01&end=2025-12-31')
  })

  it('returns to the current month in one click', async () => {
    const user = renderFilter('/?start=2026-04-01&end=2026-04-30')

    await user.click(button('Mês atual'))
    expect(screen.getByText('Outubro de 2026')).toBeInTheDocument()
    expect(screen.getByTestId('search')).toHaveTextContent('?period=current-month')
  })

  it('offers the last three months under other periods', async () => {
    const user = renderFilter()

    await user.click(button('Outro período'))
    await user.click(button('Últimos 3 meses'))
    expect(screen.getByText('01/08/2026 – 31/10/2026')).toBeInTheDocument()
    expect(screen.getByTestId('search')).toHaveTextContent('?period=last-3-months')
  })

  it('applies a custom range', async () => {
    const user = renderFilter()

    await user.click(button('Outro período'))
    fireEvent.change(screen.getByLabelText('De'), { target: { value: '2026-04-01' } })
    fireEvent.change(screen.getByLabelText('Até'), { target: { value: '2026-09-30' } })
    await user.click(button('Aplicar'))

    expect(screen.getByText('01/04/2026 – 30/09/2026')).toBeInTheDocument()
    expect(screen.getByTestId('search')).toHaveTextContent('?start=2026-04-01&end=2026-09-30')
  })

  it('blocks an inverted custom range', async () => {
    const user = renderFilter()

    await user.click(button('Outro período'))
    fireEvent.change(screen.getByLabelText('De'), { target: { value: '2026-09-30' } })
    fireEvent.change(screen.getByLabelText('Até'), { target: { value: '2026-09-01' } })

    expect(screen.getByRole('alert')).toHaveTextContent(
      'A data inicial deve ser anterior ou igual à data final.',
    )
    expect(button('Aplicar')).toBeDisabled()
    // Nothing was applied: the period on screen is still the current month.
    expect(screen.getByText('Outubro de 2026')).toBeInTheDocument()
    expect(screen.getByTestId('search')).toBeEmptyDOMElement()
  })

  it('restores a custom range from the URL', async () => {
    const user = renderFilter('/?start=2026-04-01&end=2026-09-30')

    expect(screen.getByText('01/04/2026 – 30/09/2026')).toBeInTheDocument()
    await user.click(button('Outro período'))
    expect(screen.getByLabelText('De')).toHaveValue('2026-04-01')
    expect(screen.getByLabelText('Até')).toHaveValue('2026-09-30')
  })

  it('steps to the month after a range, and never past the current month', async () => {
    const user = renderFilter('/?start=2026-04-01&end=2026-08-31')

    await user.click(button('Próximo mês'))
    expect(screen.getByText('Setembro de 2026')).toBeInTheDocument()
    await user.click(button('Próximo mês'))
    expect(screen.getByText('Outubro de 2026')).toBeInTheDocument()
    expect(button('Próximo mês')).toBeDisabled()
  })
})

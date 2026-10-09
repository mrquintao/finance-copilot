import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { THEME_STORAGE_KEY } from '../lib/theme'
import { ThemeToggle } from './ThemeToggle'

const root = document.documentElement
const toLight = { name: 'Mudar para tema claro' }
const toDark = { name: 'Mudar para tema escuro' }
const iconOf = (button: HTMLElement) => button.querySelector('svg')?.getAttribute('data-icon')

function stubSystemTheme(dark: boolean) {
  vi.stubGlobal(
    'matchMedia',
    vi.fn(() => ({ matches: dark, addEventListener: vi.fn(), removeEventListener: vi.fn() })),
  )
}

describe('ThemeToggle', () => {
  afterEach(() => {
    window.localStorage.clear()
    delete root.dataset.theme
    vi.unstubAllGlobals()
  })

  it('starts light with a sun when nothing is saved and the system is light', () => {
    render(<ThemeToggle />)

    expect(root.dataset.theme).toBe('light')
    expect(iconOf(screen.getByRole('button', toDark))).toBe('sun')
  })

  it('switches to dark with a moon, then back to light with a sun', async () => {
    const user = userEvent.setup()
    render(<ThemeToggle />)

    await user.click(screen.getByRole('button', toDark))
    expect(root.dataset.theme).toBe('dark')
    expect(iconOf(screen.getByRole('button', toLight))).toBe('moon')
    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe('dark')

    await user.click(screen.getByRole('button', toLight))
    expect(root.dataset.theme).toBe('light')
    expect(iconOf(screen.getByRole('button', toDark))).toBe('sun')
    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe('light')
  })

  it('follows the system preference when nothing is saved', () => {
    stubSystemTheme(true)
    render(<ThemeToggle />)

    expect(root.dataset.theme).toBe('dark')
    expect(screen.getByRole('button', toLight)).toBeInTheDocument()
    // Following the system is not a choice, so nothing is written.
    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBeNull()
  })

  it('prefers the saved choice over the system preference', () => {
    stubSystemTheme(true)
    window.localStorage.setItem(THEME_STORAGE_KEY, 'light')
    render(<ThemeToggle />)

    expect(root.dataset.theme).toBe('light')
    expect(screen.getByRole('button', toDark)).toBeInTheDocument()
  })

  it('ignores an invalid saved value', () => {
    window.localStorage.setItem(THEME_STORAGE_KEY, 'neon')
    render(<ThemeToggle />)

    expect(root.dataset.theme).toBe('light')
  })

  it('updates the browser theme color', async () => {
    const meta = document.createElement('meta')
    meta.name = 'theme-color'
    document.head.append(meta)
    const user = userEvent.setup()
    render(<ThemeToggle />)

    await user.click(screen.getByRole('button', toDark))
    expect(meta.content).toBe('#0c1a1d')
    meta.remove()
  })
})

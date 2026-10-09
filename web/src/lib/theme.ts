// Light and dark are the same palette (see index.css), switched by data-theme on <html>.
// Only this display preference is stored in the browser: no token, no financial data.
// public/theme.js applies it before first paint; keep the key and colors in sync with it.
export type Theme = 'light' | 'dark'

export const THEME_STORAGE_KEY = 'finance-copilot:theme'

const CANVAS: Record<Theme, string> = { light: '#f6f8f7', dark: '#0c1a1d' }
const DARK_QUERY = '(prefers-color-scheme: dark)'

function isTheme(value: unknown): value is Theme {
  return value === 'light' || value === 'dark'
}

export function storedTheme(): Theme | null {
  try {
    const value = window.localStorage.getItem(THEME_STORAGE_KEY)
    return isTheme(value) ? value : null
  } catch {
    return null
  }
}

export function systemTheme(): Theme {
  return window.matchMedia?.(DARK_QUERY).matches ? 'dark' : 'light'
}

/** The user's choice if there is one, otherwise the system preference. */
export function resolveTheme(): Theme {
  return storedTheme() ?? systemTheme()
}

export function applyTheme(theme: Theme): void {
  document.documentElement.dataset.theme = theme
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', CANVAS[theme])
}

export function saveTheme(theme: Theme): void {
  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, theme)
  } catch {
    // Storage can be blocked (private mode); the choice then lasts for this visit only.
  }
}

/** Calls back when the system preference changes. Returns the unsubscribe function. */
export function onSystemThemeChange(callback: () => void): () => void {
  const query = window.matchMedia?.(DARK_QUERY)
  if (!query) return () => {}
  query.addEventListener('change', callback)
  return () => query.removeEventListener('change', callback)
}

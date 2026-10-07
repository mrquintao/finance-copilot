import { useCallback, useEffect, useState } from 'react'
import {
  applyTheme,
  onSystemThemeChange,
  resolveTheme,
  saveTheme,
  storedTheme,
  type Theme,
} from '../lib/theme'

export function useTheme(): { theme: Theme; toggleTheme: () => void } {
  const [theme, setTheme] = useState<Theme>(resolveTheme)

  useEffect(() => applyTheme(theme), [theme])

  // Until the user picks a theme, keep following the system.
  useEffect(
    () =>
      onSystemThemeChange(() => {
        if (storedTheme() === null) setTheme(resolveTheme())
      }),
    [],
  )

  const toggleTheme = useCallback(() => {
    setTheme((current) => {
      const next = current === 'dark' ? 'light' : 'dark'
      saveTheme(next)
      return next
    })
  }, [])

  return { theme, toggleTheme }
}

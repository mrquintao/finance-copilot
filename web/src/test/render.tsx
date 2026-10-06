import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { App } from '../App'

/** Renders the whole app at a route, with a fresh cache and no query retries. */
export function renderApp(route: string) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  return {
    user: userEvent.setup(),
    ...render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={[route]}>
          <App />
        </MemoryRouter>
      </QueryClientProvider>,
    ),
  }
}

/** A fixed custom period, so page tests do not depend on today's date. */
export const SEPTEMBER = '?start=2026-09-01&end=2026-09-30'

import { QueryClient } from '@tanstack/react-query'
import { ApiError } from './api/client'

export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        // One retry for network/5xx hiccups; a 4xx will not get better by asking again.
        retry: (failureCount, error) => {
          const clientError =
            error instanceof ApiError && error.status !== null && error.status < 500
          return !clientError && failureCount < 1
        },
      },
      mutations: { retry: false },
    },
  })
}

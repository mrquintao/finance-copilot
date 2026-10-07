// The only place that talks HTTP. Everything goes to /api on the same origin (Vite proxy in
// development), so there is no CORS and no credential in the client.
const API_BASE = '/api'

export class ApiError extends Error {
  /** HTTP status, or null when the request never got a usable response. */
  readonly status: number | null

  constructor(status: number | null) {
    super(status === null ? 'Network error' : `HTTP ${status}`)
    this.name = 'ApiError'
    this.status = status
  }
}

interface RequestOptions {
  method?: 'GET' | 'POST'
  query?: Record<string, string | number | undefined>
  body?: unknown
  signal?: AbortSignal
}

export async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const url = new URL(`${API_BASE}${path}`, window.location.origin)
  for (const [key, value] of Object.entries(options.query ?? {})) {
    if (value !== undefined) url.searchParams.set(key, String(value))
  }

  let response: Response
  try {
    response = await fetch(url, {
      method: options.method ?? 'GET',
      headers: {
        Accept: 'application/json',
        ...(options.body === undefined ? {} : { 'Content-Type': 'application/json' }),
      },
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
      signal: options.signal,
    })
  } catch (error) {
    // Let cancellations through untouched so TanStack Query can drop them silently.
    if (options.signal?.aborted) throw error
    throw new ApiError(null)
  }

  if (!response.ok) throw new ApiError(response.status)
  try {
    return (await response.json()) as T
  } catch (error) {
    if (options.signal?.aborted) throw error
    throw new ApiError(null)
  }
}

/** User-facing message. Never echoes response bodies. */
export function errorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    switch (error.status) {
      case null:
        return 'Não foi possível conectar ao servidor. Verifique se o backend está no ar.'
      case 422:
        return 'O servidor recusou os parâmetros enviados.'
      case 502:
        return 'A Pluggy retornou um erro. Tente novamente em instantes.'
      case 503:
        return 'Serviço indisponível no momento. Tente novamente em instantes.'
      default:
        return `O servidor respondeu com um erro (HTTP ${error.status}).`
    }
  }
  return 'Algo deu errado. Tente novamente.'
}

export function hasStatus(error: unknown, ...statuses: number[]): boolean {
  return error instanceof ApiError && error.status !== null && statuses.includes(error.status)
}

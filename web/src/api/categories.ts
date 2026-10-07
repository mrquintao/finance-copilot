import { request } from './client'
import type { Category } from './types'

export function listCategories(signal?: AbortSignal): Promise<Category[]> {
  return request('/categories', { signal })
}

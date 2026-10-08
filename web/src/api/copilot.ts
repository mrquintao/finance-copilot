import { request } from './client'
import type { CopilotAnswer } from './types'

/** `today` is the user's local date: the backend resolves "this month" from it. */
export function askCopilot(question: string, today: string): Promise<CopilotAnswer> {
  return request('/copilot/ask', { method: 'POST', body: { question, today } })
}

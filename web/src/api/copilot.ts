import { request } from './client'
import type { CopilotAnswer, CopilotStatusInfo } from './types'

export function getCopilotStatus(signal?: AbortSignal): Promise<CopilotStatusInfo> {
  return request('/copilot/status', { signal })
}

/** `today` is the user's local date: the backend resolves "this month" from it. */
export function askCopilot(question: string, today: string): Promise<CopilotAnswer> {
  return request('/copilot/ask', { method: 'POST', body: { question, today } })
}

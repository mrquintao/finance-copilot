import { useCallback, useRef, useState } from 'react'
import { askCopilot } from '../api/copilot'
import type { CopilotAnswer } from '../api/types'
import { COPILOT_MAX_LENGTH } from '../lib/copilot'
import { today } from '../lib/localDate'

/** One question and what came back for it. */
export interface ChatTurn {
  id: number
  question: string
  state: 'pending' | 'done' | 'error' | 'cancelled'
  answer?: CopilotAnswer
  error?: unknown
}

/**
 * The conversation of the chat widget. It lives in memory only: nothing is written to the
 * browser's storage, so it lasts until the page is reloaded. The backend answers one question
 * per request and keeps no history, so each turn is asked on its own.
 */
export function useCopilotChat(): {
  turns: ChatTurn[]
  busy: boolean
  send: (text: string) => boolean
  retry: (id: number) => void
  cancel: () => void
} {
  const [turns, setTurns] = useState<ChatTurn[]>([])
  const nextId = useRef(1)
  const controller = useRef<AbortController | null>(null)
  const busy = turns.some((turn) => turn.state === 'pending')

  const patch = useCallback((id: number, changes: Partial<ChatTurn>) => {
    setTurns((current) => current.map((turn) => (turn.id === id ? { ...turn, ...changes } : turn)))
  }, [])

  const ask = useCallback(
    (id: number, question: string) => {
      const request = new AbortController()
      controller.current = request
      askCopilot(question, today(), request.signal).then(
        (answer) => patch(id, { state: 'done', answer, error: undefined }),
        (error: unknown) =>
          patch(id, request.signal.aborted ? { state: 'cancelled' } : { state: 'error', error }),
      )
    },
    [patch],
  )

  const send = useCallback(
    (text: string) => {
      const question = text.trim().slice(0, COPILOT_MAX_LENGTH)
      if (!question || busy) return false
      const id = nextId.current++
      setTurns((current) => [...current, { id, question, state: 'pending' }])
      ask(id, question)
      return true
    },
    [ask, busy],
  )

  const retry = useCallback(
    (id: number) => {
      const turn = turns.find((item) => item.id === id)
      if (!turn || busy) return
      patch(id, { state: 'pending', error: undefined })
      ask(id, turn.question)
    },
    [ask, busy, patch, turns],
  )

  const cancel = useCallback(() => controller.current?.abort(), [])

  return { turns, busy, send, retry, cancel }
}

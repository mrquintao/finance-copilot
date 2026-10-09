import { useEffect, useRef } from 'react'
import type { CopilotStatusInfo } from '../../api/types'
import type { ChatTurn } from '../../hooks/useCopilotChat'
import { COPILOT_EXAMPLES } from '../../lib/copilot'
import { AgentReply } from './AgentReply'
import { DuckAvatar } from './DuckAvatar'

// How close to the end counts as "following the conversation".
const FOLLOW_DISTANCE = 96

/**
 * The messages: the user's on the right, the Copilot's on the left beside the duck. New
 * content scrolls into view only while the reader is already at the end; someone who scrolled
 * up to reread is left where they are.
 */
export function ChatThread({
  turns,
  status,
  busy,
  onRetry,
  onExample,
}: {
  turns: ChatTurn[]
  status: CopilotStatusInfo | undefined
  busy: boolean
  onRetry: (id: number) => void
  onExample: (question: string) => void
}) {
  const scroller = useRef<HTMLDivElement>(null)
  const following = useRef(true)
  const last = turns.at(-1)

  useEffect(() => {
    const element = scroller.current
    if (element && following.current) element.scrollTop = element.scrollHeight
  }, [turns.length, last?.state])

  return (
    <div
      ref={scroller}
      role="log"
      aria-label="Conversa"
      tabIndex={0}
      onScroll={(event) => {
        const element = event.currentTarget
        following.current =
          element.scrollHeight - element.scrollTop - element.clientHeight < FOLLOW_DISTANCE
      }}
      className="min-h-0 flex-1 overflow-y-auto overscroll-contain bg-canvas px-4 py-4 [scrollbar-color:var(--line-strong)_transparent] focus-visible:-outline-offset-2"
    >
      {turns.length === 0 ? (
        <div className="flex gap-3">
          <DuckAvatar className="size-8" />
          <div className="min-w-0 flex-1">
            <p className="text-base">
              Pergunte sobre gastos, receitas, categorias ou transações. Os números vêm de
              consultas do aplicativo; o modelo de IA só escolhe as consultas e escreve o texto.
            </p>
            <ul aria-label="Exemplos de perguntas" className="mt-2">
              {COPILOT_EXAMPLES.map((example) => (
                <li key={example}>
                  <button
                    type="button"
                    disabled={busy || status?.configured === false}
                    className="min-h-11 text-left text-sm font-medium text-accent underline-offset-4 hover:underline disabled:pointer-events-none disabled:opacity-45"
                    onClick={() => onExample(example)}
                  >
                    {example}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </div>
      ) : (
        <ol className="grid gap-4">
          {turns.map((turn) => (
            <li key={turn.id} className="grid gap-3">
              <p className="ml-auto max-w-[85%] rounded-ctl bg-brand px-3 py-2 text-base break-words whitespace-pre-wrap text-on-brand">
                <span className="sr-only">Você: </span>
                {turn.question}
              </p>
              <div className="flex gap-3">
                <DuckAvatar className="size-8" />
                <div className="grid min-w-0 flex-1 gap-2 rounded-ctl border border-line bg-raised px-3 py-2.5 text-base">
                  <span className="sr-only">Finance Copilot: </span>
                  <AgentReply
                    turn={turn}
                    status={status}
                    busy={busy}
                    onRetry={() => onRetry(turn.id)}
                  />
                </div>
              </div>
            </li>
          ))}
        </ol>
      )}
    </div>
  )
}

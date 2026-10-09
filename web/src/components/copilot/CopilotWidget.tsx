import { useQuery } from '@tanstack/react-query'
import {
  useEffect,
  useId,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type MouseEvent,
} from 'react'
import { useLocation } from 'react-router'
import { getCopilotStatus } from '../../api/copilot'
import { queryKeys } from '../../api/queryKeys'
import { useCopilotChat } from '../../hooks/useCopilotChat'
import { useVisualViewport } from '../../hooks/useVisualViewport'
import { copilotDestination } from '../../lib/copilot'
import { ChatComposer } from './ChatComposer'
import { ChatThread } from './ChatThread'
import { DuckAvatar } from './DuckAvatar'

const NARROW = '(max-width: 47.99rem)'
const isNarrow = () => window.matchMedia?.(NARROW).matches ?? false

// On a phone the sheet covers the page, so Tab stays inside it instead of reaching what is
// hidden behind. On desktop the panel floats beside the page and focus moves freely.
function keepFocusInside(event: KeyboardEvent<HTMLElement>) {
  const focusable = event.currentTarget.querySelectorAll<HTMLElement>(
    'a[href], button:not(:disabled), textarea:not(:disabled), summary, [tabindex="0"]',
  )
  const first = focusable[0]
  const last = focusable[focusable.length - 1]
  if (!first || !last) return
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault()
    last.focus()
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault()
    first.focus()
  }
}

const headerButton =
  'inline-flex size-11 items-center justify-center rounded-ctl text-rail-ink transition-colors hover:bg-rail-active hover:text-white focus-visible:outline-rail-mark'

const stroke = {
  width: 20,
  height: 20,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
  'aria-hidden': true,
} as const

/**
 * The Copilot as a floating chat: the duck in the bottom right corner opens a conversation
 * panel over any screen. It asks the same backend as the Copilot page (one question per
 * request), and the conversation stays in memory while the user moves between screens.
 * On the Copilot page itself the widget steps aside.
 */
export function CopilotWidget() {
  const { pathname } = useLocation()
  const [open, setOpen] = useState(false)
  const [expanded, setExpanded] = useState(false)
  const chat = useCopilotChat()
  const viewport = useVisualViewport()
  const panelId = useId()
  const titleId = useId()
  const launcher = useRef<HTMLButtonElement>(null)
  const input = useRef<HTMLTextAreaElement>(null)
  const wasOpen = useRef(false)

  // Asked only once the panel has been opened; then kept by the query cache.
  const status = useQuery({
    queryKey: queryKeys.copilotStatus(),
    queryFn: ({ signal }) => getCopilotStatus(signal),
    enabled: open,
  })
  const unavailable = status.data?.configured === false
  const destination = copilotDestination(status.data)
  const leavesComputer = status.data?.configured === true && !status.data.local

  // Opening puts the cursor in the message field; closing hands focus back to the duck.
  useEffect(() => {
    if (open) input.current?.focus()
    else if (wasOpen.current) launcher.current?.focus()
    wasOpen.current = open
  }, [open])

  if (pathname === '/copilot') return null

  // A link inside an answer leads to another screen; on a phone the sheet would cover it.
  function onThreadClick(event: MouseEvent) {
    if ((event.target as HTMLElement).closest('a') && isNarrow()) setOpen(false)
  }

  // On a phone the sheet fills the visible window, so the keyboard never hides the field.
  const sheet = viewport
    ? ({ '--sheet-top': `${viewport.offsetTop}px`, '--sheet-height': `${viewport.height}px` } as CSSProperties)
    : undefined

  return (
    <>
      <button
        ref={launcher}
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        aria-label={
          open ? 'Recolher conversa com o Finance Copilot' : 'Abrir conversa com o Finance Copilot'
        }
        title="Finance Copilot"
        onClick={() => setOpen(!open)}
        className="group fixed right-[max(1rem,env(safe-area-inset-right))] bottom-[calc(4.75rem+env(safe-area-inset-bottom))] z-20 size-14 rounded-full border border-edge bg-rail shadow-float transition-colors hover:bg-rail-active focus-visible:outline-offset-4 md:right-6 md:bottom-6"
      >
        <DuckAvatar className="size-full transition-transform duration-200 ease-out group-hover:-translate-y-0.5 group-hover:-rotate-6 group-active:scale-95" />
      </button>

      {/* Phone only: the page behind the sheet is dimmed and a tap on it closes the sheet. */}
      {open && (
        <div
          aria-hidden
          onClick={() => setOpen(false)}
          className="fixed inset-0 z-20 bg-scrim md:hidden"
        />
      )}

      <section
        id={panelId}
        role="dialog"
        aria-labelledby={titleId}
        aria-hidden={!open}
        inert={!open}
        style={sheet}
        onKeyDown={(event) => {
          if (event.key === 'Escape') setOpen(false)
          else if (event.key === 'Tab' && isNarrow()) keepFocusInside(event)
        }}
        className={`fixed z-30 flex flex-col overflow-hidden bg-raised transition-[opacity,translate,visibility] duration-200 ease-out max-md:inset-x-0 max-md:top-[calc(var(--sheet-top,0px)+2.5rem)] max-md:h-[calc(var(--sheet-height,100dvh)-2.5rem)] max-md:rounded-t-ctl max-md:border-t max-md:border-edge md:right-6 md:bottom-24 md:rounded-ctl md:border md:border-edge md:shadow-float ${
          expanded
            ? 'md:h-[calc(100dvh-8rem)] md:w-[min(44rem,calc(100vw-18rem))]'
            : 'md:h-[min(38rem,calc(100dvh-8rem))] md:w-[26rem]'
        } ${
          open
            ? 'visible translate-y-0 opacity-100'
            : 'invisible translate-y-full opacity-0 md:translate-y-4'
        }`}
      >
        <header className="flex items-center gap-3 bg-rail py-2 pr-2 pl-4 text-white">
          <DuckAvatar className="size-10 border border-rail-ink/50" />
          <div className="min-w-0 flex-1">
            <h2 id={titleId} className="truncate text-base font-extrabold font-stretch-[85%]">
              Finance Copilot
            </h2>
            <p className="truncate text-sm text-rail-ink">Seu assistente financeiro</p>
          </div>
          <button
            type="button"
            aria-pressed={expanded}
            aria-label={expanded ? 'Reduzir conversa' : 'Ampliar conversa'}
            title={expanded ? 'Reduzir conversa' : 'Ampliar conversa'}
            onClick={() => setExpanded(!expanded)}
            className={`${headerButton} max-md:hidden`}
          >
            <svg {...stroke}>
              <path
                d={
                  expanded
                    ? 'M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5'
                    : 'M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5'
                }
              />
            </svg>
          </button>
          <button
            type="button"
            aria-label="Recolher conversa"
            title="Recolher conversa"
            onClick={() => setOpen(false)}
            className={headerButton}
          >
            <svg {...stroke}>
              <path d="m5 9 7 7 7-7" />
            </svg>
          </button>
        </header>

        <div className="flex min-h-0 flex-1 flex-col" onClick={onThreadClick}>
          <ChatThread
            turns={chat.turns}
            status={status.data}
            busy={chat.busy}
            onRetry={chat.retry}
            onExample={chat.send}
          />
        </div>

        <footer className="border-t border-line-strong px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
          {unavailable ? (
            <p role="status" className="mb-2 text-sm font-medium">
              {destination} Enquanto isso, não é possível enviar perguntas.
            </p>
          ) : (
            destination && (
              <p
                className={`mb-2 text-xs ${
                  leavesComputer ? 'font-semibold text-warning' : 'text-ink-soft'
                }`}
              >
                {destination}
              </p>
            )
          )}
          <ChatComposer
            inputRef={input}
            busy={chat.busy}
            disabled={unavailable}
            onSend={chat.send}
            onCancel={chat.cancel}
          />
        </footer>
      </section>
    </>
  )
}

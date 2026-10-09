import { useState, type FormEvent, type KeyboardEvent, type Ref } from 'react'
import { COPILOT_MAX_LENGTH } from '../../lib/copilot'
import { Button } from '../Button'

const COUNTER_FROM = COPILOT_MAX_LENGTH - 100

/** The message field: Enter sends, Shift+Enter breaks the line, an empty message is not sent. */
export function ChatComposer({
  inputRef,
  busy,
  disabled,
  onSend,
  onCancel,
}: {
  inputRef: Ref<HTMLTextAreaElement>
  busy: boolean
  /** The Copilot cannot be asked at all (not configured). */
  disabled: boolean
  /** Returns whether the message was accepted, so the field is cleared only then. */
  onSend: (text: string) => boolean
  onCancel: () => void
}) {
  const [text, setText] = useState('')
  const empty = text.trim() === ''

  function submit(event?: FormEvent) {
    event?.preventDefault()
    if (empty || busy || disabled) return
    if (onSend(text)) setText('')
  }

  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    // Enter while composing (IME) confirms a character; it must not send.
    if (event.key !== 'Enter' || event.shiftKey || event.nativeEvent.isComposing) return
    event.preventDefault()
    submit()
  }

  return (
    <form onSubmit={submit} className="flex items-end gap-2">
      <textarea
        ref={inputRef}
        rows={2}
        aria-label="Mensagem para o Finance Copilot"
        placeholder="Pergunte sobre suas finanças"
        maxLength={COPILOT_MAX_LENGTH}
        enterKeyHint="send"
        disabled={disabled}
        className="block min-h-11 min-w-0 flex-1 resize-none rounded-ctl border border-edge bg-raised px-3 py-2.5 text-base placeholder:text-ink-soft disabled:opacity-45"
        value={text}
        onChange={(event) => setText(event.target.value)}
        onKeyDown={onKeyDown}
      />
      {busy ? (
        <Button variant="secondary" onClick={onCancel}>
          Cancelar
        </Button>
      ) : (
        <Button
          type="submit"
          aria-label="Enviar mensagem"
          disabled={empty || disabled}
          className="size-11 px-0"
        >
          <svg
            width={20}
            height={20}
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2.2}
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden
          >
            <path d="M12 19V5M5 12l7-7 7 7" />
          </svg>
        </Button>
      )}
      {text.length >= COUNTER_FROM && (
        <p className="sr-only" role="status">
          {COPILOT_MAX_LENGTH - text.length} caracteres restantes
        </p>
      )}
    </form>
  )
}

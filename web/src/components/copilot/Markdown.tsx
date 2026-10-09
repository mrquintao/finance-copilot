import type { ReactNode } from 'react'

// A small, safe subset of Markdown for the model's text: paragraphs, bullet and numbered
// lists, fenced code, **bold** and `code`. Everything is rendered as React nodes; no HTML from
// the text is ever injected.

const BULLET = /^\s*[-*]\s+(.*)$/
const NUMBERED = /^\s*\d+[.)]\s+(.*)$/

function inline(text: string): ReactNode[] {
  return text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g).map((part, index) => {
    if (part.startsWith('**') && part.endsWith('**') && part.length > 4) {
      return <strong key={index}>{part.slice(2, -2)}</strong>
    }
    if (part.startsWith('`') && part.endsWith('`') && part.length > 2) {
      return (
        <code key={index} className="rounded-bar bg-surface px-1 py-0.5 text-[0.9em]">
          {part.slice(1, -1)}
        </code>
      )
    }
    return part
  })
}

function prose(text: string, keyBase: string): ReactNode[] {
  const blocks: ReactNode[] = []
  let paragraph: string[] = []
  let list: { ordered: boolean; items: string[] } | null = null

  const flushParagraph = () => {
    if (paragraph.length === 0) return
    blocks.push(
      <p key={`${keyBase}-p${blocks.length}`} className="whitespace-pre-line">
        {inline(paragraph.join('\n'))}
      </p>,
    )
    paragraph = []
  }
  const flushList = () => {
    if (!list) return
    const items = list.items.map((item, index) => <li key={index}>{inline(item)}</li>)
    const key = `${keyBase}-l${blocks.length}`
    blocks.push(
      list.ordered ? (
        <ol key={key} className="list-decimal space-y-1 pl-5">
          {items}
        </ol>
      ) : (
        <ul key={key} className="list-disc space-y-1 pl-5">
          {items}
        </ul>
      ),
    )
    list = null
  }

  for (const line of text.split('\n')) {
    const bullet = BULLET.exec(line)
    const numbered = bullet ? null : NUMBERED.exec(line)
    const item = bullet ?? numbered
    if (item) {
      flushParagraph()
      const ordered = numbered !== null
      if (list && list.ordered !== ordered) flushList()
      list ??= { ordered, items: [] }
      list.items.push(item[1] ?? '')
    } else if (line.trim() === '') {
      flushParagraph()
      flushList()
    } else {
      flushList()
      paragraph.push(line)
    }
  }
  flushParagraph()
  flushList()
  return blocks
}

export function Markdown({ text }: { text: string }) {
  // Odd segments are the contents of ``` fences.
  const segments = text.split(/```[^\n]*\n?/)
  return (
    <div className="grid gap-2 break-words">
      {segments.map((segment, index) =>
        index % 2 === 1 ? (
          <pre
            key={index}
            className="overflow-x-auto rounded-ctl border border-line bg-surface p-3 text-sm"
          >
            <code>{segment.replace(/\n$/, '')}</code>
          </pre>
        ) : (
          prose(segment, String(index))
        ),
      )}
    </div>
  )
}

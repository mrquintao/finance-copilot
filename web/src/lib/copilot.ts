import { errorMessage, hasStatus } from '../api/client'
import type {
  CopilotFact,
  CopilotStatus,
  CopilotStatusInfo,
  DateRange,
  TransactionsLink,
} from '../api/types'
import { formatLocalDate } from './localDate'
import { formatBRL, formatPercentChange, formatSignedBRL } from './money'

/** The backend rejects longer questions. */
export const COPILOT_MAX_LENGTH = 500

export const COPILOT_EXAMPLES = [
  'Quanto gastei no mês passado?',
  'Em quais categorias gastei mais neste mês?',
  'Gastei mais ou menos que no mês anterior?',
]

/** The Transactions screen with the same filters as the query behind a fact. */
export function transactionsHref(link: TransactionsLink): string {
  const params = new URLSearchParams({ start: link.start_date, end: link.end_date })
  if (link.q) params.set('q', link.q)
  if (link.category_id) params.set('category', link.category_id)
  if (link.type) params.set('type', link.type)
  return `/transactions?${params.toString()}`
}

const COUNT = /^-?\d+$/

/** Formats a calculated value for display. Money stays a decimal string throughout. */
export function formatFact(fact: CopilotFact): string {
  switch (fact.kind) {
    case 'money':
      return formatBRL(fact.value)
    case 'signed_money':
      return formatSignedBRL(fact.value)
    case 'percent':
      return formatPercentChange(fact.value)
    case 'signed_count': {
      if (!COUNT.test(fact.value)) return '—'
      if (/^-?0+$/.test(fact.value)) return '0'
      return fact.value.startsWith('-') ? `−${fact.value.slice(1)}` : `+${fact.value}`
    }
    default:
      return COUNT.test(fact.value) ? fact.value : '—'
  }
}

/** "01/09/2026 – 30/09/2026". */
export function dateRange(period: DateRange): string {
  return `${formatLocalDate(period.start_date)} – ${formatLocalDate(period.end_date)}`
}

// Where the question and the queried data go. Shown before the user asks anything.
export function copilotDestination(info: CopilotStatusInfo | undefined): string | null {
  if (!info) return null
  if (!info.configured) return 'O Copilot não está configurado no backend.'
  if (info.provider === 'ollama' && info.local) {
    return `A pergunta e os dados consultados são processados neste computador, pelo Ollama (${info.model}). Nada é enviado para fora.`
  }
  if (info.provider === 'ollama') {
    return `A pergunta e os dados consultados são enviados ao Ollama em outro computador da rede (${info.model}).`
  }
  return `A pergunta e os dados consultados são enviados à API da Anthropic (${info.model}).`
}

export function copilotFailure(error: unknown, info: CopilotStatusInfo | undefined): string {
  const ollama = info?.provider === 'ollama'
  if (hasStatus(error, 503)) {
    return ollama
      ? `O modelo ${info.model} não está instalado no Ollama ou não aceita ferramentas. Rode "ollama pull ${info.model}" e tente de novo.`
      : 'O Copilot não está configurado no backend (COPILOT_PROVIDER e, para a Anthropic, ANTHROPIC_API_KEY).'
  }
  if (hasStatus(error, 502)) {
    return ollama
      ? 'O Ollama não respondeu. Confira se ele está aberto e tente novamente; seus dados não foram afetados.'
      : 'O modelo de IA não respondeu. Seus dados não foram afetados; tente novamente.'
  }
  return errorMessage(error)
}

// How the model's text is to be read, for each outcome. Only "answered" is a checked answer.
export const ANSWER_STATUS: Record<CopilotStatus, { heading: string; tone: string; note: string | null }> = {
  answered: {
    heading: 'Texto do Copilot',
    tone: 'border-line-strong',
    note: 'Redação e interpretação do modelo de IA, não um cálculo. Todo valor em reais deste texto foi conferido com os dados calculados abaixo.',
  },
  ungrounded: { heading: 'Resposta retida', tone: 'border-warning', note: null },
  refused: { heading: 'Sem resposta', tone: 'border-line-strong', note: null },
  incomplete: { heading: 'Sem resposta', tone: 'border-line-strong', note: null },
}

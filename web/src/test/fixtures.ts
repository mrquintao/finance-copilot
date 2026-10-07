import type {
  MoneyChange,
  PeriodComparison,
  SpendingByCategory,
  SpendingSummary,
  SyncRun,
  Transaction,
  TransactionPage,
} from '../api/types'

// Fictitious data shaped like real backend responses.
export function makeSummary(overrides: Partial<SpendingSummary> = {}): SpendingSummary {
  return {
    currency: 'BRL',
    period_start: '2026-09-01',
    period_end: '2026-09-30',
    total_spending: '3649.94',
    total_income: '8150.00',
    transaction_count: 21,
    expense_count: 18,
    income_count: 2,
    transfer_count: 1,
    ...overrides,
  }
}

export const emptySummary = makeSummary({
  total_spending: '0.00',
  total_income: '0.00',
  transaction_count: 0,
  expense_count: 0,
  income_count: 0,
  transfer_count: 0,
})

export function makeByCategory(items = defaultCategories): SpendingByCategory {
  return { currency: 'BRL', period_start: '2026-09-01', period_end: '2026-09-30', items }
}

const defaultCategories: SpendingByCategory['items'] = [
  {
    category_id: '11111111-1111-4111-8111-111111111111',
    category: 'Moradia',
    amount: '2200.00',
    transaction_count: 2,
  },
  { category_id: null, category: 'Sem categoria', amount: '1449.94', transaction_count: 16 },
]

export function makeTransaction(overrides: Partial<Transaction> = {}): Transaction {
  return {
    id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
    external_id: null,
    account_id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
    account: {
      id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      name: 'Conta Corrente',
      institution: 'Banco Fictício',
      currency: 'BRL',
    },
    date: '2026-09-07',
    description: 'UBER *TRIP',
    merchant: 'Uber',
    amount: '37.90',
    currency: 'BRL',
    type: 'debit',
    category: { id: '22222222-2222-4222-8222-222222222222', name: 'Transporte' },
    subcategory: null,
    is_recurring: false,
    created_at: '2026-09-07T12:00:00Z',
    updated_at: '2026-09-07T12:00:00Z',
    ...overrides,
  }
}

export function makePage(items: Transaction[], total = items.length, offset = 0): TransactionPage {
  return { items, total, limit: 50, offset }
}

export function makeSyncRun(overrides: Partial<SyncRun> = {}): SyncRun {
  return {
    id: 'cccccccc-cccc-4ccc-8ccc-ccccccccccc1',
    provider: 'pluggy',
    item_id: 'item-1',
    started_at: '2026-09-30T15:00:00Z',
    finished_at: '2026-09-30T15:00:05Z',
    status: 'succeeded',
    accounts_received: 2,
    transactions_received: 40,
    transactions_created: 7,
    transactions_updated: 3,
    error: null,
    error_kind: null,
    accounts: ['Conta Corrente'],
    ...overrides,
  }
}

const unchanged: MoneyChange = {
  current: '0.00',
  previous: '0.00',
  change: '0.00',
  percent_change: null,
  direction: 'equal',
}

export function makeComparison(overrides: Partial<PeriodComparison> = {}): PeriodComparison {
  return {
    currency: 'BRL',
    period: { start_date: '2026-09-01', end_date: '2026-09-30' },
    previous_period: { start_date: '2026-08-01', end_date: '2026-08-31' },
    spending: unchanged,
    income: unchanged,
    transaction_count: {
      current: 0,
      previous: 0,
      change: 0,
      percent_change: null,
      direction: 'equal',
    },
    categories: [],
    ...overrides,
  }
}

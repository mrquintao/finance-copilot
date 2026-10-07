// Mirrors the Pydantic schemas in backend/app/**/schemas.py.

/** Exact decimal string with two places, e.g. "1234.56". Never convert to number for math. */
export type Money = string
/** Calendar day, "YYYY-MM-DD". */
export type LocalDate = string
/** ISO 8601 instant. */
export type DateTime = string
export type UUID = string

export interface Health {
  status: 'ok'
  database: 'ok'
}

export interface Category {
  id: UUID
  name: string
}

export interface Account {
  id: UUID
  name: string
  institution: string
  currency: 'BRL'
}

export type TransactionType = 'debit' | 'credit' | 'transfer'

export interface Transaction {
  id: UUID
  external_id: string | null
  account_id: UUID
  account: Account
  date: LocalDate
  description: string
  merchant: string | null
  amount: Money
  currency: 'BRL'
  type: TransactionType
  category: Category | null
  subcategory: string | null
  is_recurring: boolean
  created_at: DateTime
  updated_at: DateTime
}

export interface TransactionPage {
  items: Transaction[]
  total: number
  limit: number
  offset: number
}

export interface SpendingSummary {
  currency: 'BRL'
  period_start: LocalDate | null
  period_end: LocalDate | null
  total_spending: Money
  total_income: Money
  transaction_count: number
  expense_count: number
  income_count: number
  transfer_count: number
}

export interface CategorySpending {
  category_id: UUID | null
  category: string
  amount: Money
  transaction_count: number
}

export interface SpendingByCategory {
  currency: 'BRL'
  period_start: LocalDate | null
  period_end: LocalDate | null
  items: CategorySpending[]
}

export type ConnectionState = 'connected' | 'failing' | 'syncing' | 'never_synced' | 'local'

export interface AccountSummary {
  id: UUID
  name: string
  institution: string
  currency: 'BRL'
  provider: string | null
  connection: ConnectionState
  last_sync: { status: SyncStatus; started_at: DateTime; finished_at: DateTime | null } | null
  last_successful_sync_at: DateTime | null
  transaction_count: number
  last_transaction_date: LocalDate | null
}

export interface AccountGroup {
  institution: string
  accounts: AccountSummary[]
}

export interface AccountList {
  total: number
  groups: AccountGroup[]
}

export interface ConnectTokenResponse {
  connect_token: string
}

export interface SyncRequest {
  item_id: string
  start_date?: LocalDate
  end_date?: LocalDate
}

export type SyncStatus = 'running' | 'succeeded' | 'failed'

export interface SyncRun {
  id: UUID
  provider: string
  item_id: string
  started_at: DateTime
  finished_at: DateTime | null
  status: SyncStatus
  accounts_received: number
  transactions_received: number
  transactions_created: number
  transactions_updated: number
  error: string | null
}

export interface SyncList {
  items: SyncRun[]
}

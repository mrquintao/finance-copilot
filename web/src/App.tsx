import { Route, Routes } from 'react-router'
import { AppShell } from './components/AppShell'
import { AccountsPage } from './pages/AccountsPage'
import { ConnectionsPage } from './pages/ConnectionsPage'
import { DashboardPage } from './pages/DashboardPage'
import { NotFoundPage } from './pages/NotFoundPage'
import { TransactionDetailPage } from './pages/TransactionDetailPage'
import { TransactionsPage } from './pages/TransactionsPage'

export function App() {
  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route index element={<DashboardPage />} />
        <Route path="transactions" element={<TransactionsPage />} />
        <Route path="transactions/:id" element={<TransactionDetailPage />} />
        <Route path="accounts" element={<AccountsPage />} />
        <Route path="connections" element={<ConnectionsPage />} />
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  )
}

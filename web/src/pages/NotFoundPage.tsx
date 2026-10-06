import { Link } from 'react-router'
import { EmptyState } from '../components/states/EmptyState'

export function NotFoundPage() {
  return (
    <EmptyState title="Página não encontrada" message="O endereço não existe neste aplicativo.">
      <Link to="/" className="mt-2 text-sm font-medium text-teal-700 dark:text-teal-300">
        Ir para o resumo
      </Link>
    </EmptyState>
  )
}

import { Link } from 'react-router'
import { EmptyState } from '../components/states/EmptyState'

export function NotFoundPage() {
  return (
    <EmptyState title="Página não encontrada" message="O endereço não existe neste aplicativo.">
      <Link
        to="/"
        className="mt-3 inline-flex min-h-11 items-center text-sm font-medium text-accent underline-offset-4 hover:underline"
      >
        Ir para o resumo
      </Link>
    </EmptyState>
  )
}

import { Button } from '../Button'

export function ErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div role="alert" className="my-8 border-l-2 border-danger pl-4">
      <p className="text-sm font-semibold text-danger">Não foi possível carregar</p>
      <p className="mt-1 max-w-md text-sm">{message}</p>
      <Button variant="secondary" className="mt-4" onClick={onRetry}>
        Tentar novamente
      </Button>
    </div>
  )
}

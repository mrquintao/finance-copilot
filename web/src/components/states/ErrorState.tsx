import { Button } from '../Button'

export function ErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div role="alert" className="my-8 max-w-xl rounded-ctl border border-danger px-4 py-3">
      <p className="text-sm font-semibold text-danger">Não foi possível carregar</p>
      <p className="mt-1 text-sm">{message}</p>
      <Button variant="secondary" className="mt-4" onClick={onRetry}>
        Tentar novamente
      </Button>
    </div>
  )
}

import { Button } from '../Button'

export function ErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div role="alert" className="flex flex-col items-center gap-4 px-6 py-12 text-center">
      <p className="max-w-sm text-sm">{message}</p>
      <Button onClick={onRetry}>Tentar novamente</Button>
    </div>
  )
}

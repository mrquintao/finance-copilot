import type { ButtonHTMLAttributes } from 'react'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost'
}

const VARIANTS = {
  primary: 'bg-brand text-on-brand hover:bg-brand-hover active:bg-brand-hover',
  secondary:
    'border border-line-strong bg-raised text-ink hover:border-ink-muted active:bg-surface',
  ghost: 'text-accent underline-offset-4 hover:underline active:opacity-80',
}

export function Button({ variant = 'primary', className = '', type, ...props }: ButtonProps) {
  return (
    <button
      type={type ?? 'button'}
      className={`inline-flex min-h-11 items-center justify-center gap-2 rounded-ctl px-4 text-sm font-semibold transition-colors disabled:pointer-events-none disabled:opacity-45 ${VARIANTS[variant]} ${className}`}
      {...props}
    />
  )
}

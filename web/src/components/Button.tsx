import type { ButtonHTMLAttributes } from 'react'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary'
}

const VARIANTS = {
  primary: 'bg-teal-700 text-white hover:bg-teal-800 dark:bg-teal-500 dark:text-slate-950',
  secondary:
    'border border-slate-300 bg-white text-slate-900 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:hover:bg-slate-800',
}

export function Button({ variant = 'primary', className = '', type, ...props }: ButtonProps) {
  return (
    <button
      type={type ?? 'button'}
      className={`inline-flex min-h-11 items-center justify-center gap-2 rounded-xl px-4 text-sm font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${VARIANTS[variant]} ${className}`}
      {...props}
    />
  )
}

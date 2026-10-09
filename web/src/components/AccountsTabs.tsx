import { Link, useLocation } from 'react-router'

const TABS = [
  { to: '/accounts', label: 'Suas contas' },
  { to: '/connections', label: 'Conexão e sincronização' },
]

/** Accounts and connections are one destination in the rail; these move between its two screens. */
export function AccountsTabs() {
  const { pathname, search } = useLocation()

  return (
    <nav aria-label="Contas e conexões" className="mb-6 flex flex-wrap gap-2">
      {TABS.map((tab) => {
        const active = pathname === tab.to
        return (
          <Link
            key={tab.to}
            to={{ pathname: tab.to, search }}
            aria-current={active ? 'page' : undefined}
            className={`inline-flex min-h-11 items-center rounded-ctl border px-4 text-sm font-semibold transition-colors ${
              active
                ? 'border-brand bg-brand text-on-brand'
                : 'border-edge bg-raised text-ink hover:bg-surface'
            }`}
          >
            {tab.label}
          </Link>
        )
      })}
    </nav>
  )
}

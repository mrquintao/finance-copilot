import type { ReactNode } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router'

const icon = {
  width: 24,
  height: 24,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.8,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
  'aria-hidden': true,
} as const

const TABS: { to: string; label: string; end?: boolean; icon: ReactNode }[] = [
  {
    to: '/',
    label: 'Resumo',
    end: true,
    icon: (
      <svg {...icon}>
        <path d="M4 20V10M10 20V4M16 20v-7M22 20H2" />
      </svg>
    ),
  },
  {
    to: '/transactions',
    label: 'Transações',
    icon: (
      <svg {...icon}>
        <path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01" />
      </svg>
    ),
  },
  {
    to: '/connections',
    label: 'Conexões',
    icon: (
      <svg {...icon}>
        <path d="M3 10 12 4l9 6M5 10v8M9.5 10v8M14.5 10v8M19 10v8M3 20h18" />
      </svg>
    ),
  },
]

export function AppShell() {
  // Keep the selected period when switching tabs.
  const { search } = useLocation()

  return (
    <div className="min-h-dvh md:flex">
      <nav
        aria-label="Principal"
        className="fixed inset-x-0 bottom-0 z-10 border-t border-slate-200 bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:sticky md:inset-auto md:top-0 md:h-dvh md:w-56 md:shrink-0 md:border-t-0 md:border-r md:pb-0 dark:border-slate-800 dark:bg-slate-900/95"
      >
        <p className="hidden px-5 pt-6 pb-4 text-lg font-semibold md:block">Finance Copilot</p>
        <ul className="flex md:flex-col md:gap-1 md:px-3">
          {TABS.map((tab) => (
            <li key={tab.to} className="flex-1 md:flex-none">
              <NavLink
                to={{ pathname: tab.to, search }}
                end={tab.end}
                className={({ isActive }) =>
                  `flex min-h-14 flex-col items-center justify-center gap-0.5 text-xs font-medium md:min-h-11 md:flex-row md:justify-start md:gap-3 md:rounded-lg md:px-3 md:text-sm ${
                    isActive
                      ? 'text-teal-700 md:bg-teal-50 dark:text-teal-300 md:dark:bg-teal-950'
                      : 'text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100'
                  }`
                }
              >
                {tab.icon}
                {tab.label}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>
      <main className="mx-auto w-full max-w-3xl min-w-0 px-4 pt-[max(1.25rem,env(safe-area-inset-top))] pb-28 md:px-8 md:pt-8 md:pb-10">
        <Outlet />
      </main>
    </div>
  )
}

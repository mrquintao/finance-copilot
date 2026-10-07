import type { ReactNode } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router'
import { periodSearch } from '../lib/period'
import { ThemeToggle } from './ThemeToggle'

const icon = {
  width: 22,
  height: 22,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.6,
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
    to: '/accounts',
    label: 'Contas',
    icon: (
      <svg {...icon}>
        <path d="M3 7h18v12H3zM3 11h18M7 15h3" />
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

const tab =
  'relative flex min-h-14 flex-col items-center justify-center gap-1 text-[0.6875rem] transition-colors md:min-h-10 md:flex-row md:justify-start md:gap-3 md:px-6 md:text-sm'
// The active tab is marked by a thin rule (top edge on mobile, left edge on desktop) and by
// weight, not by a filled shape.
const activeTab =
  'font-semibold text-accent before:absolute before:inset-x-7 before:top-0 before:h-0.5 before:bg-accent md:text-ink md:before:inset-x-auto md:before:inset-y-2 md:before:left-0 md:before:h-auto md:before:w-0.5'
const idleTab = 'font-medium text-ink-soft hover:text-ink md:hover:bg-surface'

export function AppShell() {
  // Keep the selected period when switching tabs, but not screen-specific filters.
  const search = periodSearch(useLocation().search)

  return (
    <div className="min-h-dvh md:flex">
      <nav
        aria-label="Principal"
        className="fixed inset-x-0 bottom-0 z-10 border-t border-line-strong bg-surface pb-[env(safe-area-inset-bottom)] md:sticky md:inset-auto md:top-0 md:h-dvh md:w-52 md:shrink-0 md:border-t-0 md:border-r md:border-line md:bg-canvas md:pb-0"
      >
        <p className="hidden px-6 pt-8 pb-7 text-[0.9375rem] font-semibold tracking-tight md:block">
          Finance <span className="font-normal text-ink-soft">Copilot</span>
        </p>
        <ul className="flex md:flex-col">
          {TABS.map((item) => (
            <li key={item.to} className="flex-1 md:flex-none">
              <NavLink
                to={{ pathname: item.to, search }}
                end={item.end}
                className={({ isActive }) => `${tab} ${isActive ? activeTab : idleTab}`}
              >
                {item.icon}
                {item.label}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>
      <main className="relative min-w-0 flex-1 px-4 pt-[max(1.25rem,env(safe-area-inset-top))] pb-28 md:px-10 md:pt-9 md:pb-12">
        {/* Phone: top right, on the title line. Desktop: foot of the sidebar. */}
        <ThemeToggle className="absolute top-[max(0.75rem,env(safe-area-inset-top))] right-2 md:fixed md:top-auto md:right-auto md:bottom-5 md:left-4 md:z-20" />
        <div className="max-w-5xl">
          <Outlet />
        </div>
      </main>
    </div>
  )
}

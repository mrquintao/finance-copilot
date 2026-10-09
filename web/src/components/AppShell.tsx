import { useEffect, useRef, type ReactNode } from 'react'
import { Link, Outlet, useLocation } from 'react-router'
import { periodSearch } from '../lib/period'
import { CopilotWidget } from './copilot/CopilotWidget'
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

// Four destinations. Connections is part of "Contas" until the two screens become one.
const TABS: { to: string; label: string; paths: string[]; icon: ReactNode }[] = [
  {
    to: '/',
    label: 'Resumo',
    paths: ['/'],
    icon: (
      <svg {...icon}>
        <path d="M4 20V10M10 20V4M16 20v-7M22 20H2" />
      </svg>
    ),
  },
  {
    to: '/transactions',
    label: 'Transações',
    paths: ['/transactions'],
    icon: (
      <svg {...icon}>
        <path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01" />
      </svg>
    ),
  },
  {
    to: '/copilot',
    label: 'Copilot',
    paths: ['/copilot'],
    icon: (
      <svg {...icon}>
        <path d="M4 5h16v11H9l-5 4z" />
      </svg>
    ),
  },
  {
    to: '/accounts',
    label: 'Contas',
    paths: ['/accounts', '/connections'],
    icon: (
      <svg {...icon}>
        <path d="M3 10 12 4l9 6M5 10v8M9.5 10v8M14.5 10v8M19 10v8M3 20h18" />
      </svg>
    ),
  },
]

function isActive(pathname: string, paths: string[]): boolean {
  return paths.some((path) =>
    path === '/' ? pathname === '/' : pathname === path || pathname.startsWith(`${path}/`),
  )
}

const tab =
  'flex min-h-14 flex-col items-center justify-center gap-1 text-xs transition-colors focus-visible:-outline-offset-2 focus-visible:outline-rail-mark md:min-h-11 md:flex-row md:justify-start md:gap-3 md:px-6 md:text-base'
// The active destination changes ground, weight and icon ink; aria-current says it in words.
const activeTab = 'bg-rail-active font-bold text-white [&>svg]:text-rail-mark'
const idleTab = 'font-semibold text-rail-ink hover:bg-rail-active hover:text-white'

export function AppShell() {
  const { pathname, search } = useLocation()
  // Keep the selected period when switching tabs, but not screen-specific filters.
  const period = periodSearch(search)
  const main = useRef<HTMLElement>(null)
  const shownPath = useRef(pathname)

  // After a navigation, keyboard and screen reader users start at the new content.
  useEffect(() => {
    if (shownPath.current === pathname) return
    shownPath.current = pathname
    main.current?.focus()
  }, [pathname])

  return (
    <div className="min-h-dvh md:flex">
      <a
        href="#conteudo"
        className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-30 focus:rounded-ctl focus:bg-brand focus:px-4 focus:py-3 focus:text-sm focus:font-semibold focus:text-on-brand"
      >
        Pular para o conteúdo
      </a>
      <nav
        aria-label="Principal"
        className="fixed inset-x-0 bottom-0 z-10 bg-rail pr-[env(safe-area-inset-right)] pb-[env(safe-area-inset-bottom)] pl-[env(safe-area-inset-left)] md:sticky md:inset-auto md:top-0 md:h-dvh md:w-56 md:shrink-0 md:overflow-y-auto md:p-0 md:[scrollbar-color:var(--rail-ink)_transparent]"
      >
        <p className="hidden px-6 pt-8 pb-8 text-xl leading-none font-black text-white uppercase font-stretch-[68%] md:block">
          Finance{' '}
          <span className="mt-1 block text-sm font-medium tracking-[0.02em] text-rail-ink normal-case font-stretch-[100%]">
            Copilot
          </span>
        </p>
        <ul className="flex md:flex-col">
          {TABS.map((item) => {
            const active = isActive(pathname, item.paths)
            return (
              <li key={item.to} className="min-w-0 flex-1 md:flex-none">
                <Link
                  to={{ pathname: item.to, search: period }}
                  aria-current={active ? 'page' : undefined}
                  className={`${tab} ${active ? activeTab : idleTab}`}
                >
                  {item.icon}
                  <span className="max-w-full truncate px-1 md:px-0">{item.label}</span>
                </Link>
              </li>
            )
          })}
        </ul>
      </nav>
      <main
        id="conteudo"
        ref={main}
        tabIndex={-1}
        className="relative min-w-0 flex-1 pt-[max(1.25rem,env(safe-area-inset-top))] pr-[max(1rem,env(safe-area-inset-right))] pb-28 pl-[max(1rem,env(safe-area-inset-left))] outline-none md:px-10 md:pt-8 md:pb-12"
      >
        {/* Phone: top right, on the title line. Desktop: foot of the rail. */}
        <ThemeToggle className="absolute top-[max(0.75rem,env(safe-area-inset-top))] right-2 md:fixed md:top-auto md:right-auto md:bottom-5 md:left-4 md:z-20 md:text-rail-ink md:hover:bg-rail-active md:hover:text-white md:focus-visible:outline-rail-mark md:active:bg-rail-active" />
        <div className="max-w-6xl">
          <Outlet />
        </div>
      </main>
      <CopilotWidget />
    </div>
  )
}

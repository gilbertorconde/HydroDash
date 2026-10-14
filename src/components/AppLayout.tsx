import type { ReactNode } from 'react'
import { useEffect, useState } from 'react'
import { Link, Outlet, useNavigate, useRouterState } from '@tanstack/react-router'
import { CalendarClock, Droplets, History, Home, LayoutGrid, LogOut, MoonStar, SunMedium } from 'lucide-react'
import { useAuthLogout } from '../api/hooks'
import { NotificationsBell } from './NotificationsBell'
import { useTheme } from '../context/ThemeContext'
import styles from './AppLayout.module.css'

/** Main destinations: top glass pill on desktop, floating tab bar on phones. */
const tabs = [
  { to: '/', label: 'Home', icon: Home },
  { to: '/zones', label: 'Zones', icon: Droplets },
  { to: '/programs', label: 'Programs', icon: CalendarClock },
  { to: '/history', label: 'History', icon: History },
  { to: '/more', label: 'More', icon: LayoutGrid },
] as const

/** Screens reached from the More page; the More tab stays highlighted while on them. */
const morePaths = [
  '/more',
  '/settings',
  '/forecast',
  '/preview',
  '/sites',
  '/diagnostics',
  '/backup',
  '/sensors',
  '/about',
  '/logs',
  '/tools',
]

function isTabActive(to: string, pathname: string): boolean {
  if (to === '/') return pathname === '/'
  if (to === '/more') return morePaths.some((p) => pathname === p || pathname.startsWith(`${p}/`))
  if (to === '/zones') return pathname === '/zones' || pathname === '/stations'
  return pathname === to || pathname.startsWith(`${to}/`)
}

export function AppLayout({ children }: { children?: ReactNode }) {
  const { resolved, toggle } = useTheme()
  const navigate = useNavigate()
  const logoutMutation = useAuthLogout()
  const pathname = useRouterState({ select: (s) => s.location.pathname })
  const [scrolled, setScrolled] = useState(false)

  // The header is transparent over the page hero and turns solid once content scrolls under it.
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24)
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  async function logout() {
    await logoutMutation.mutateAsync()
    navigate({ to: '/login', replace: true })
  }

  return (
    <div className={styles.shell}>
      <header className={styles.header} data-scrolled={scrolled || undefined}>
        <div className={styles.headerInner}>
          <Link to="/" className={styles.brand} title="Home">
            <span className={styles.brandMark} aria-hidden>
              <Droplets size={18} strokeWidth={2.4} />
            </span>
            <span className={styles.brandTitle}>HydroDash</span>
          </Link>
          <nav className={styles.nav} aria-label="Main">
            {tabs.map(({ to, label, icon: Icon }) => {
              const active = isTabActive(to, pathname)
              return (
                <Link
                  key={to}
                  to={to}
                  className={active ? `${styles.navLink} ${styles.navLinkActive}` : styles.navLink}
                  aria-current={active ? 'page' : undefined}
                >
                  <Icon size={16} aria-hidden />
                  {label}
                </Link>
              )
            })}
          </nav>
          <div className={styles.headerActions}>
            <NotificationsBell />
            <button
              type="button"
              className={styles.iconBtn}
              onClick={toggle}
              title={`Theme: ${resolved} (click to toggle)`}
              aria-label={`Switch theme, currently ${resolved}`}
            >
              {resolved === 'dark' ? <MoonStar size={18} aria-hidden /> : <SunMedium size={18} aria-hidden />}
            </button>
            <button
              type="button"
              className={`${styles.iconBtn} ${styles.logoutBtn}`}
              onClick={logout}
              disabled={logoutMutation.isPending}
              title="Log out"
              aria-label="Log out"
            >
              <LogOut size={17} aria-hidden />
            </button>
          </div>
        </div>
      </header>
      <main className={styles.main}>{children ?? <Outlet />}</main>
      <nav className={styles.tabBar} aria-label="Main">
        {tabs.map(({ to, label, icon: Icon }) => {
          const active = isTabActive(to, pathname)
          return (
            <Link
              key={`tab-${to}`}
              to={to}
              className={active ? `${styles.tab} ${styles.tabActive}` : styles.tab}
              aria-current={active ? 'page' : undefined}
            >
              <Icon size={20} strokeWidth={active ? 2.4 : 2} aria-hidden />
              <span className={styles.tabLabel}>{label}</span>
            </Link>
          )
        })}
      </nav>
    </div>
  )
}

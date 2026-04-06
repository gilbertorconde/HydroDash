import type { ReactNode } from 'react'
import { useState } from 'react'
import { Link, Outlet, useNavigate } from '@tanstack/react-router'
import {
  Gauge,
  History,
  Home,
  LogOut,
  Menu,
  MoonStar,
  Settings,
  SunMedium,
  Waves,
  X,
  Droplets,
} from 'lucide-react'
import { useAuthLogout } from '../api/hooks'
import { NotificationsBell } from './NotificationsBell'
import { Button } from '../components/ui'
import { useTheme } from '../context/ThemeContext'
import { HYDRODASH_LOGO_SVG_HEIGHT, HYDRODASH_LOGO_SVG_WIDTH } from '../lib/hydroDashLogo'
import styles from './AppLayout.module.css'

const nav = [
  { to: '/', label: 'Home', icon: Home },
  { to: '/zones', label: 'Zones', icon: Droplets },
  { to: '/programs', label: 'Programs', icon: Waves },
  { to: '/history', label: 'History', icon: History },
  { to: '/settings', label: 'Settings', icon: Settings },
  { to: '/more', label: 'More', icon: Gauge },
]

export function AppLayout({ children }: { children?: ReactNode }) {
  const { resolved, toggle } = useTheme()
  const navigate = useNavigate()
  const logoutMutation = useAuthLogout()
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)

  async function logout() {
    await logoutMutation.mutateAsync()
    setMobileMenuOpen(false)
    navigate({ to: '/login', replace: true })
  }

  return (
    <div className={styles.shell}>
      <header className={styles.header}>
        <Link to="/" className={styles.brand} title="Home">
          <img
            src="/hydroDashLogo.svg"
            alt=""
            className={styles.logoImg}
            width={HYDRODASH_LOGO_SVG_WIDTH}
            height={HYDRODASH_LOGO_SVG_HEIGHT}
            decoding="async"
          />
          <div className={styles.brandText}>
            <span className={styles.brandTitle}>HydroDash</span>
            <span className={styles.brandSubtitle}>OpenSprinkler control</span>
          </div>
        </Link>
        <nav className={styles.nav} aria-label="Main">
          {nav.map(({ to, label, icon: Icon }) => (
            <Link
              key={to}
              to={to}
              activeOptions={{ exact: to === '/' }}
              inactiveProps={{ className: styles.navLink }}
              activeProps={{ className: `${styles.navLink} ${styles.navLinkActive}` }}
            >
              <Icon size={15} aria-hidden />
              {label}
            </Link>
          ))}
        </nav>
        <div className={styles.headerActions}>
          <NotificationsBell />
          <button
            type="button"
            className={styles.mobileMenuBtn}
            onClick={() => setMobileMenuOpen((s) => !s)}
            aria-label={mobileMenuOpen ? 'Close menu' : 'Open menu'}
            aria-expanded={mobileMenuOpen}
            aria-controls="mobile-main-nav"
          >
            {mobileMenuOpen ? <X size={17} aria-hidden /> : <Menu size={17} aria-hidden />}
          </button>
          <button
            type="button"
            className={styles.iconBtn}
            onClick={toggle}
            title={`Theme: ${resolved} (click to toggle)`}
            aria-label={`Switch theme, currently ${resolved}`}
          >
            {resolved === 'dark' ? <MoonStar size={16} aria-hidden /> : <SunMedium size={16} aria-hidden />}
          </button>
          <Button
            variant="ghost"
            className={styles.logoutBtn}
            onClick={logout}
            disabled={logoutMutation.isPending}
            startIcon={<LogOut size={15} aria-hidden />}
          >
            <span className={styles.logoutBtnLabel}>Logout</span>
          </Button>
        </div>
      </header>
      <nav
        id="mobile-main-nav"
        className={mobileMenuOpen ? styles.mobileMenuOpen : styles.mobileMenu}
        aria-label="Mobile main navigation"
      >
        {nav.map(({ to, label, icon: Icon }) => (
          <Link
            key={`mobile-${to}`}
            to={to}
            activeOptions={{ exact: to === '/' }}
            inactiveProps={{ className: styles.mobileMenuLink }}
            activeProps={{ className: `${styles.mobileMenuLink} ${styles.mobileMenuLinkActive}` }}
            onClick={() => setMobileMenuOpen(false)}
          >
            <Icon size={16} aria-hidden />
            {label}
          </Link>
        ))}
        <button
          type="button"
          className={styles.mobileLogout}
          onClick={logout}
          disabled={logoutMutation.isPending}
        >
          <LogOut size={16} aria-hidden />
          Logout
        </button>
      </nav>
      <main className={styles.main}>
        {children ?? <Outlet />}
      </main>
    </div>
  )
}

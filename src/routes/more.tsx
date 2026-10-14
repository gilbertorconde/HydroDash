import { useState, type ComponentType, type ReactNode } from 'react'
import { createFileRoute, Link, useNavigate } from '@tanstack/react-router'
import {
  Activity,
  Bell,
  CalendarClock,
  ChevronRight,
  CloudSun,
  HardDriveDownload,
  Info,
  LogOut,
  Router,
  Settings,
  Stethoscope,
} from 'lucide-react'
import { useAuthLogout, useNotificationsConfig } from '../api/hooks'
import { NotificationsSettingsModal } from '../components/NotificationsSettingsModal'
import { ProtectedPage } from '../components/ProtectedPage'
import { Spinner } from '../components/ui'
import styles from './MorePage.module.css'

export const Route = createFileRoute('/more')({
  component: MoreRoute,
})

type IconType = ComponentType<{ size?: number; strokeWidth?: number; 'aria-hidden'?: boolean }>

const links = [
  {
    to: '/settings',
    title: 'Settings',
    desc: 'Controller options and app preferences',
    icon: Settings,
  },
  {
    to: '/forecast',
    title: 'Weather',
    desc: 'Weather provider and watering adjustment',
    icon: CloudSun,
  },
  {
    to: '/preview',
    title: 'Schedule preview',
    desc: 'See what will run on a given day',
    icon: CalendarClock,
  },
  {
    to: '/sensors',
    title: 'Sensors',
    desc: 'Live readings and history from extra sensors',
    icon: Activity,
  },
  {
    to: '/sites',
    title: 'Controllers',
    desc: 'Switch between your controllers',
    icon: Router,
  },
  {
    to: '/backup',
    title: 'Backup & restore',
    desc: 'Save or restore your controller and app settings',
    icon: HardDriveDownload,
  },
  {
    to: '/diagnostics',
    title: 'Diagnostics',
    desc: 'Technical info for troubleshooting',
    icon: Stethoscope,
  },
] as const

const aboutLink = {
  to: '/about',
  title: 'About',
  desc: 'What HydroDash is and how it works',
  icon: Info,
} as const

/** Shared row contents: icon, title + one-line description, trailing chevron. */
function RowBody({ icon: Icon, title, desc, trailing }: { icon: IconType; title: string; desc: ReactNode; trailing?: ReactNode }) {
  return (
    <>
      <span className={styles.rowIcon}>
        <Icon size={18} strokeWidth={2.1} aria-hidden />
      </span>
      <span className={styles.rowText}>
        <span className={styles.rowTitle}>{title}</span>
        <span className={styles.rowDesc}>{desc}</span>
      </span>
      {trailing !== undefined ? trailing : <ChevronRight className={styles.rowChevron} size={18} strokeWidth={2.25} aria-hidden />}
    </>
  )
}

function linkRow({ to, title, desc, icon }: (typeof links)[number] | typeof aboutLink) {
  return (
    <li key={to}>
      <Link to={to} className={styles.row}>
        <RowBody icon={icon} title={title} desc={desc} />
      </Link>
    </li>
  )
}

function MoreRoute() {
  const notifConfig = useNotificationsConfig()
  const [notifOpen, setNotifOpen] = useState(false)
  const logoutMutation = useAuthLogout()
  const navigate = useNavigate()

  const notifResolved = !notifConfig.isPending
  const notifEnabled = notifConfig.data?.enabled === true

  async function logout() {
    await logoutMutation.mutateAsync()
    navigate({ to: '/login', replace: true })
  }

  return (
    <ProtectedPage>
      <div className={styles.page}>
        <h1 className={styles.title}>More</h1>

        <ul className={styles.list}>
          {links.map((entry) => linkRow(entry))}
          <li>
            {notifResolved && notifEnabled ? (
              <button type="button" className={styles.row} onClick={() => setNotifOpen(true)}>
                <RowBody
                  icon={Bell}
                  title="Notifications"
                  desc={
                    notifConfig.data?.pushEnabled
                      ? 'Choose which events alert you'
                      : 'Choose which events alert you (phone push not set up)'
                  }
                />
              </button>
            ) : notifResolved ? (
              <div className={`${styles.row} ${styles.rowMuted}`}>
                <RowBody
                  icon={Bell}
                  title="Notifications"
                  desc="Not set up on this server"
                  trailing={<span className={styles.rowStatus}>Off</span>}
                />
              </div>
            ) : (
              <div className={`${styles.row} ${styles.rowMuted}`}>
                <RowBody icon={Bell} title="Notifications" desc="Checking…" trailing={<Spinner />} />
              </div>
            )}
          </li>
          {linkRow(aboutLink)}
        </ul>

        <ul className={styles.list}>
          <li>
            <button
              type="button"
              className={`${styles.row} ${styles.rowDanger}`}
              onClick={() => void logout()}
              disabled={logoutMutation.isPending}
            >
              <RowBody icon={LogOut} title="Log out" desc="Sign out of HydroDash on this device" trailing={null} />
            </button>
          </li>
        </ul>

        {notifOpen ? (
          <NotificationsSettingsModal
            onClose={() => setNotifOpen(false)}
            initial={notifConfig.data?.settings ?? null}
            pushConfigured={notifConfig.data?.pushEnabled ?? false}
          />
        ) : null}
      </div>
    </ProtectedPage>
  )
}

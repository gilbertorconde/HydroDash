import { useState } from 'react'
import { createFileRoute, Link } from '@tanstack/react-router'
import { useNotificationsConfig } from '../api/hooks'
import { NotificationsSettingsModal } from '../components/NotificationsSettingsModal'
import { ProtectedPage } from '../components/ProtectedPage'
import { Card } from '../components/ui'
import styles from './MorePage.module.css'

export const Route = createFileRoute('/more')({
  component: MoreRoute,
})

const links = [
  {
    to: '/forecast',
    title: 'Weather & forecast',
    desc: 'Live wtdata from the controller and guided weather provider setup.',
  },
  {
    to: '/preview',
    title: 'Schedule preview',
    desc: 'Approximate program starts for a single day (simplified timeline).',
  },
  {
    to: '/sites',
    title: 'Controllers',
    desc: 'Switch saved devices when the server is configured with OS_SITES.',
  },
  {
    to: '/diagnostics',
    title: 'Diagnostics',
    desc: 'Technical debug dump from the controller for troubleshooting.',
  },
  {
    to: '/about',
    title: 'About',
    desc: 'What HydroDash is and how it relates to OpenSprinkler.',
  },
  {
    to: '/backup',
    title: 'Configuration backup',
    desc: 'Export or import full controller configuration and HydroDash app settings for this browser.',
  },
  {
    to: '/sensors',
    title: 'Sensors',
    desc: 'Extended analog sensors: list, live values, log chart, and read-now (when the firmware exposes them).',
  },
] as const

function MoreRoute() {
  const notifConfig = useNotificationsConfig()
  const [notifOpen, setNotifOpen] = useState(false)

  return (
    <ProtectedPage>
      <div>
        <h1 className={styles.title}>More</h1>
        <p className={styles.subtitle}>
          Secondary screens and tools. Core watering lives under Home, Zones, Programs, and History.
        </p>
        <div className={styles.grid}>
          {links.map(({ to, title, desc }) => (
            <Link key={to} to={to} className={styles.cardLink}>
              <Card title={title}>
                <p className={styles.cardDesc}>{desc}</p>
              </Card>
            </Link>
          ))}
          {notifConfig.data?.enabled ? (
            <div
              className={styles.cardLink}
              role="button"
              tabIndex={0}
              onClick={() => setNotifOpen(true)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault()
                  setNotifOpen(true)
                }
              }}
            >
              <Card title="Push & in-app notifications">
                <p className={styles.cardDesc}>
                  ntfy topics, which controller events notify you, and the inbox in the header bell.
                  {notifConfig.data.pushEnabled ? '' : ' Push is off until NTFY_SERVER_URL is set on the server.'}
                </p>
              </Card>
            </div>
          ) : null}
        </div>

        {notifOpen ? (
          <NotificationsSettingsModal
            onClose={() => setNotifOpen(false)}
            initial={notifConfig.data?.settings ?? null}
            pushConfigured={notifConfig.data?.pushEnabled ?? false}
          />
        ) : null}

        <h2 className={styles.sectionTitle}>Not in HydroDash yet</h2>
        <Card title="Roadmap-style gaps">
          <ul className={styles.longTail}>
            <li>Full sensor editor (create or change sensor definitions, same as app)</li>
            <li>Localization (i18n) and locale files</li>
          </ul>
          <p className={styles.longTailNote}>
            Use the official OpenSprinkler app for these until they land here.
          </p>
        </Card>
      </div>
    </ProtectedPage>
  )
}

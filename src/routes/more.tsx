import { useState } from 'react'
import { createFileRoute, Link } from '@tanstack/react-router'
import { ChevronRight } from 'lucide-react'
import { useNotificationsConfig } from '../api/hooks'
import { NotificationsSettingsModal } from '../components/NotificationsSettingsModal'
import { ProtectedPage } from '../components/ProtectedPage'
import { Card, Spinner } from '../components/ui'
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
    to: '/backup',
    title: 'Configuration backup',
    desc: 'Export or import full controller configuration and HydroDash app settings for this browser.',
  },
  {
    to: '/sensors',
    title: 'Sensors',
    desc: 'Extended sensors: list, edit definitions, live values, log chart, and read-now when the firmware exposes them.',
  },
  {
    to: '/about',
    title: 'About',
    desc: 'What HydroDash is and how it relates to OpenSprinkler.',
  },
] as const

const linksBeforeAbout = links.slice(0, -1)
const aboutLink = links[links.length - 1]!

function tileLink({ to, title, desc }: (typeof links)[number]) {
  return (
    <Link key={to} to={to} className={styles.cardLink}>
      <Card className={styles.tileCard} bodyClassName={styles.tileBody} title={title}>
        <p className={styles.cardDesc}>{desc}</p>
        <span className={styles.tileMeta}>
          <span className={styles.tileCta}>Open</span>
          <ChevronRight className={styles.tileChevron} size={18} strokeWidth={2.25} aria-hidden />
        </span>
      </Card>
    </Link>
  )
}

function MoreRoute() {
  const notifConfig = useNotificationsConfig()
  const [notifOpen, setNotifOpen] = useState(false)

  const notifResolved = !notifConfig.isPending
  const notifEnabled = notifConfig.data?.enabled === true

  return (
    <ProtectedPage>
      <div>
        <h1 className={styles.title}>More</h1>
        <p className={styles.subtitle}>
          Secondary screens and tools. Core watering lives under Home, Zones, Programs, and History.
        </p>
        <div className={styles.grid}>
          {linksBeforeAbout.map((entry) => tileLink(entry))}
          {notifResolved && notifEnabled ? (
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
              <Card className={styles.tileCard} bodyClassName={styles.tileBody} title="Push & in-app notifications">
                <p className={styles.cardDesc}>
                  ntfy topics, which controller events notify you, and the inbox in the header bell.
                  {notifConfig.data?.pushEnabled ? '' : ' Push is off until NTFY_SERVER_URL is set on the server.'}
                </p>
                <span className={styles.tileMeta}>
                  <span className={styles.tileCta}>Open</span>
                  <ChevronRight className={styles.tileChevron} size={18} strokeWidth={2.25} aria-hidden />
                </span>
              </Card>
            </div>
          ) : notifResolved ? (
            <div className={styles.tileShell}>
              <Card
                className={`${styles.tileCard} ${styles.tileCardMuted}`}
                bodyClassName={styles.tileBody}
                title="Push & in-app notifications"
              >
                <p className={styles.cardDesc}>
                  In-app notification inbox and optional ntfy push are not enabled on this installation. The server
                  needs a notifications database (see HydroDash docs) before these features can be
                  used.
                </p>
                <span className={styles.tileMetaStatic}>Not configured</span>
              </Card>
            </div>
          ) : (
            <div className={styles.tileShell}>
              <Card className={styles.tileCard} bodyClassName={styles.tileBody} title="Push & in-app notifications">
                <Spinner />
              </Card>
            </div>
          )}
          {tileLink(aboutLink)}
        </div>

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

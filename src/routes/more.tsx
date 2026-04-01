import { createFileRoute, Link } from '@tanstack/react-router'
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
    desc: 'Approximate program starts for a single day (simplified vs official app timeline).',
  },
  {
    to: '/sites',
    title: 'Controllers',
    desc: 'Switch saved devices when the server is configured with OS_SITES.',
  },
  {
    to: '/diagnostics',
    title: 'Diagnostics',
    desc: 'Raw /db JSON for troubleshooting.',
  },
  {
    to: '/about',
    title: 'About',
    desc: 'What HydroDash is and how it relates to OpenSprinkler.',
  },
] as const

function MoreRoute() {
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
        </div>

        <h2 className={styles.sectionTitle}>Not in HydroDash yet</h2>
        <Card title="Roadmap-style gaps">
          <ul className={styles.longTail}>
            <li>Configuration import / export (OpenSprinkler-App parity)</li>
            <li>Firmware OTA checks and update flow</li>
            <li>Analog sensor charts and configuration</li>
            <li>Notifications panel</li>
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

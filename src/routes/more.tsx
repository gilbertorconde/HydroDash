import { useState } from 'react'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import {
  Activity,
  Bell,
  CalendarClock,
  CloudSun,
  HardDriveDownload,
  Info,
  LogOut,
  Router,
  Settings,
  SlidersHorizontal,
  Stethoscope,
} from 'lucide-react'
import { useAuthLogout, useNotificationsConfig } from '../api/hooks'
import { NotificationsSettingsModal } from '../components/NotificationsSettingsModal'
import { ProtectedPage } from '../components/ProtectedPage'
import { ListGroup, ListRow, PageBody, PageHero, Pill, Spinner } from '../components/ui'
import styles from './MorePage.module.css'

export const Route = createFileRoute('/more')({
  component: MoreRoute,
})

const ICON = { size: 19, strokeWidth: 2.1, 'aria-hidden': true } as const

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
      <PageHero title="More" subtitle="Weather, sensors, app settings and tools for your controller." />
      <PageBody className={styles.body}>
        <div className={styles.columns}>
          <div className={styles.column}>
            <ListGroup title="Your garden">
              <ListRow
                to="/forecast"
                icon={<CloudSun {...ICON} />}
                iconTone="accent"
                title="Weather"
                description="Watering level, provider and live conditions"
              />
              <ListRow
                to="/preview"
                icon={<CalendarClock {...ICON} />}
                iconTone="success"
                title="Schedule preview"
                description="See what will run on a given day"
              />
              <ListRow
                to="/sensors"
                icon={<Activity {...ICON} />}
                iconTone="warning"
                title="Sensors"
                description="Live readings and history from extra sensors"
              />
            </ListGroup>

            <ListGroup title="App">
              <ListRow
                to="/settings"
                icon={<Settings {...ICON} />}
                iconTone="accent"
                title="Settings"
                description="Location, watering, app preferences"
              />
              {notifResolved && notifEnabled ? (
                <ListRow
                  onClick={() => setNotifOpen(true)}
                  icon={<Bell {...ICON} />}
                  iconTone="danger"
                  title="Notifications"
                  description={
                    notifConfig.data?.pushEnabled
                      ? 'Choose which events alert you'
                      : 'Choose which events alert you (phone push not set up)'
                  }
                />
              ) : notifResolved ? (
                <ListRow
                  icon={<Bell {...ICON} />}
                  iconTone="neutral"
                  title="Notifications"
                  description="Not set up on this server"
                  trailing={<Pill>Off</Pill>}
                />
              ) : (
                <ListRow
                  icon={<Bell {...ICON} />}
                  iconTone="neutral"
                  title="Notifications"
                  description="Checking…"
                  trailing={<Spinner />}
                />
              )}
              <ListRow
                to="/sites"
                icon={<Router {...ICON} />}
                iconTone="success"
                title="Controllers"
                description="Switch between your controllers"
              />
              <ListRow
                to="/about"
                icon={<Info {...ICON} />}
                iconTone="neutral"
                title="About"
                description="What HydroDash is and how it works"
              />
            </ListGroup>
          </div>

          <div className={styles.column}>
            <ListGroup title="Advanced">
              <ListRow
                to="/settings"
                icon={<SlidersHorizontal {...ICON} />}
                iconTone="advanced"
                title="Advanced settings"
                description="Stations, sensors wiring, network, integrations"
              />
              <ListRow
                to="/backup"
                icon={<HardDriveDownload {...ICON} />}
                iconTone="advanced"
                title="Backup & restore"
                description="Save or restore controller and app settings"
              />
              <ListRow
                to="/diagnostics"
                icon={<Stethoscope {...ICON} />}
                iconTone="advanced"
                title="Diagnostics"
                description="Technical info for troubleshooting"
              />
            </ListGroup>

            <ListGroup title="Account">
              <ListRow
                onClick={() => void logout()}
                disabled={logoutMutation.isPending}
                icon={<LogOut {...ICON} />}
                danger
                chevron={false}
                title="Log out"
                description="Sign out of HydroDash on this device"
              />
            </ListGroup>
          </div>
        </div>

        {notifOpen ? (
          <NotificationsSettingsModal
            onClose={() => setNotifOpen(false)}
            initial={notifConfig.data?.settings ?? null}
            pushConfigured={notifConfig.data?.pushEnabled ?? false}
          />
        ) : null}
      </PageBody>
    </ProtectedPage>
  )
}

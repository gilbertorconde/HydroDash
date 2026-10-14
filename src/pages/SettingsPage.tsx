import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { useNavigate } from '@tanstack/react-router'
import {
  Bell,
  Cable,
  Droplets,
  KeyRound,
  ListOrdered,
  MapPin,
  Monitor,
  Network,
  Plug,
  ScrollText,
  SlidersHorizontal,
  TriangleAlert,
  Workflow,
  X,
  Zap,
} from 'lucide-react'
import { useChangeOptions, useController, useJsonAll, useNotificationsConfig } from '../api/hooks'
import { NotificationsSettingsModal } from '../components/NotificationsSettingsModal'
import {
  Card,
  EmptyState,
  ErrorBox,
  ListGroup,
  ListRow,
  OverflowMenu,
  PageBody,
  PageHero,
  Pill,
  Spinner,
} from '../components/ui'
import { AppPrefsSection, LocationSection, WateringSection } from './settings/BasicSections'
import {
  LcdSection,
  LoggingSection,
  MastersSection,
  PowerSection,
  SensorsSection,
  StationsSection,
} from './settings/ControllerSections'
import { DangerSection } from './settings/DangerSection'
import { IntegrationsSection } from './settings/IntegrationsSection'
import { NetworkSection } from './settings/NetworkSection'
import { SecuritySection } from './settings/SecuritySection'
import { availableSections, SECTION_META, type SettingsSectionId } from './settings/sectionMeta'
import type { OptionPayload, SectionCtx } from './settings/settingsShared'
import styles from './SettingsPage.module.css'

const ICON = { size: 18, strokeWidth: 2.1 } as const

const SECTION_ICONS: Record<SettingsSectionId, ReactNode> = {
  location: <MapPin {...ICON} aria-hidden />,
  watering: <Droplets {...ICON} aria-hidden />,
  app: <SlidersHorizontal {...ICON} aria-hidden />,
  masters: <Workflow {...ICON} aria-hidden />,
  stations: <ListOrdered {...ICON} aria-hidden />,
  sensors: <Cable {...ICON} aria-hidden />,
  integrations: <Plug {...ICON} aria-hidden />,
  lcd: <Monitor {...ICON} aria-hidden />,
  network: <Network {...ICON} aria-hidden />,
  power: <Zap {...ICON} aria-hidden />,
  logging: <ScrollText {...ICON} aria-hidden />,
  security: <KeyRound {...ICON} aria-hidden />,
  danger: <TriangleAlert {...ICON} aria-hidden />,
}

type Status = { kind: 'ok' | 'error'; text: string }

function formatFirmware(fwv: unknown): string | null {
  const n = typeof fwv === 'number' ? fwv : Number(fwv)
  if (!Number.isFinite(n) || n <= 0) return null
  return String(n).split('').join('.')
}

/**
 * /settings: a landing list (Basic / Advanced) and one section at a time via `?section=`.
 * Phones show either the list or the open section; ≥ 1000px shows both side by side.
 */
export function SettingsPage({ section }: { section?: SettingsSectionId }) {
  const ja = useJsonAll()
  const jc = useController(15_000)
  const co = useChangeOptions()
  const navigate = useNavigate()
  const notifConfig = useNotificationsConfig()
  const [notifOpen, setNotifOpen] = useState(false)
  const [status, setStatus] = useState<Status | null>(null)
  // Bumped by "Reload from controller" to remount sections and drop unsaved edits.
  const [reloadNonce, setReloadNonce] = useState(0)

  const meta = section ? SECTION_META[section] : null

  // Success messages fade on their own; errors stay until dismissed.
  useEffect(() => {
    if (status?.kind !== 'ok') return
    const t = window.setTimeout(() => setStatus(null), 4000)
    return () => window.clearTimeout(t)
  }, [status])

  useEffect(() => {
    window.scrollTo({ top: 0 })
  }, [section])

  const { refetch: refetchJa } = ja
  const apply = useCallback(
    async (p: OptionPayload, okMessage = 'Saved.') => {
      setStatus(null)
      try {
        await co.mutateAsync(p)
        await refetchJa()
        setStatus({ kind: 'ok', text: okMessage })
        return true
      } catch (e) {
        setStatus({ kind: 'error', text: e instanceof Error ? e.message : 'Save failed' })
        return false
      }
    },
    [co, refetchJa],
  )

  const ctx = useMemo<SectionCtx | null>(() => {
    if (!ja.data) return null
    return {
      data: ja.data,
      opts: ja.data.options ?? {},
      st: ja.data.settings ?? {},
      apply,
      saving: co.isPending,
      notify: (text) => setStatus({ kind: 'ok', text }),
      fail: (text) => setStatus({ kind: 'error', text }),
    }
  }, [ja.data, apply, co.isPending])

  async function reloadFromController() {
    setStatus(null)
    await Promise.all([ja.refetch(), jc.refetch()])
    setReloadNonce((n) => n + 1)
    setStatus({ kind: 'ok', text: 'Reloaded from controller.' })
  }

  function open(id: SettingsSectionId) {
    void navigate({ to: '/settings', search: { section: id } })
  }

  const opts = ja.data?.options ?? {}
  const st = ja.data?.settings ?? {}
  const fw = formatFirmware(opts.fwv)
  const deviceName = typeof st.dname === 'string' && st.dname ? st.dname : null
  const landingSubtitle = [deviceName, fw ? `Firmware ${fw}` : null].filter(Boolean).join(' · ') || undefined

  const basic = availableSections(ja.data, 'basic')
  const advanced = availableSections(ja.data, 'advanced')

  const notifResolved = !notifConfig.isPending
  const notifEnabled = notifConfig.data?.enabled === true

  const navRow = (id: SettingsSectionId) => {
    const m = SECTION_META[id]
    return (
      <div key={id} className={`${styles.navItem} ${section === id ? styles.navItemActive : ''}`}>
        <ListRow
          onClick={() => open(id)}
          icon={SECTION_ICONS[id]}
          iconTone={m.group === 'advanced' ? 'advanced' : 'accent'}
          danger={id === 'danger'}
          title={m.title}
          description={m.description}
        />
      </div>
    )
  }

  function renderSection(id: SettingsSectionId, c: SectionCtx) {
    switch (id) {
      case 'location':
        return <LocationSection ctx={c} />
      case 'watering':
        return <WateringSection ctx={c} />
      case 'app':
        return <AppPrefsSection />
      case 'masters':
        return <MastersSection ctx={c} />
      case 'stations':
        return <StationsSection ctx={c} />
      case 'sensors':
        return <SensorsSection ctx={c} />
      case 'integrations':
        return <IntegrationsSection ctx={c} />
      case 'lcd':
        return <LcdSection ctx={c} />
      case 'network':
        return <NetworkSection ctx={c} />
      case 'power':
        return <PowerSection ctx={c} />
      case 'logging':
        return <LoggingSection ctx={c} />
      case 'security':
        return <SecuritySection ctx={c} />
      case 'danger':
        return <DangerSection ctx={c} />
    }
  }

  function renderDetail() {
    if (ja.isError && !ja.data) {
      return <ErrorBox message={ja.error instanceof Error ? ja.error.message : 'Could not load controller settings.'} />
    }
    if (!section) {
      return (
        <Card>
          <EmptyState
            icon={<SlidersHorizontal size={22} aria-hidden />}
            title="Pick a section"
            description="Everyday settings are under Basic. Installer options live in the purple Advanced group; destructive actions are in the Danger zone."
          />
        </Card>
      )
    }
    // App preferences are local to this browser and never need controller data.
    if (section === 'app') return <AppPrefsSection />
    if (!ctx) {
      return (
        <Card>
          <div className={styles.loading}>
            <Spinner /> Loading controller settings…
          </div>
        </Card>
      )
    }
    if (meta && !meta.available(ctx.opts, ctx.st)) {
      return (
        <Card>
          <EmptyState
            icon={SECTION_ICONS[section]}
            title="Not available on this controller"
            description="Your controller's firmware doesn't report any of these options."
          />
        </Card>
      )
    }
    return <div key={`${section}:${reloadNonce}`} className={styles.sectionStack}>{renderSection(section, ctx)}</div>
  }

  return (
    <>
      <PageHero
        size="compact"
        title={meta?.title ?? 'Settings'}
        back={meta ? { to: '/settings', label: 'Settings' } : { to: '/more', label: 'More' }}
        eyebrow={
          meta?.id === 'danger' ? (
            <Pill tone="glass">Destructive</Pill>
          ) : meta?.group === 'advanced' ? (
            <Pill tone="glass">Advanced</Pill>
          ) : undefined
        }
        // Sections keep the hero short so the card sits close to the title.
        subtitle={meta ? undefined : landingSubtitle}
        actions={
          <OverflowMenu
            onHero
            label="Settings actions"
            items={[
              {
                label: ja.isFetching ? 'Reloading…' : 'Reload from controller',
                disabled: ja.isFetching,
                onSelect: () => void reloadFromController(),
              },
            ]}
          />
        }
      />
      <PageBody>
        <div className={`${styles.layout} ${section ? styles.layoutSection : styles.layoutLanding}`}>
          <nav className={styles.nav} aria-label="Settings sections">
            <ListGroup title="Basic">
              {basic.map((m) => navRow(m.id))}
              <div className={styles.navItem}>
                {notifResolved && notifEnabled ? (
                  <ListRow
                    onClick={() => setNotifOpen(true)}
                    icon={<Bell {...ICON} aria-hidden />}
                    iconTone="accent"
                    title="Push notifications"
                    description={
                      notifConfig.data?.pushEnabled
                        ? 'Which HydroDash events alert you'
                        : 'Which events alert you (phone push not set up)'
                    }
                  />
                ) : (
                  <ListRow
                    icon={<Bell {...ICON} aria-hidden />}
                    iconTone="neutral"
                    title="Push notifications"
                    description={notifResolved ? 'Not set up on this server' : 'Checking…'}
                    trailing={notifResolved ? <Pill>Off</Pill> : <Spinner />}
                  />
                )}
              </div>
            </ListGroup>

            <ListGroup
              title="Advanced"
              action={
                <Pill tone="advanced" className={styles.headerPill}>
                  Installer
                </Pill>
              }
            >{advanced.map((m) => navRow(m.id))}</ListGroup>
            {ja.isLoading ? (
              <div className={styles.loading}>
                <Spinner /> Checking what your controller supports…
              </div>
            ) : null}
          </nav>

          <div className={styles.detail}>{renderDetail()}</div>
        </div>
      </PageBody>

      {status ? (
        <div
          className={`${styles.toast} ${status.kind === 'error' ? styles.toastError : styles.toastOk}`}
          role={status.kind === 'error' ? 'alert' : 'status'}
        >
          <span>{status.text}</span>
          <button type="button" className={styles.toastClose} aria-label="Dismiss" onClick={() => setStatus(null)}>
            <X size={16} aria-hidden />
          </button>
        </div>
      ) : null}

      {notifOpen ? (
        <NotificationsSettingsModal
          onClose={() => setNotifOpen(false)}
          initial={notifConfig.data?.settings ?? null}
          pushConfigured={notifConfig.data?.pushEnabled ?? false}
        />
      ) : null}
    </>
  )
}

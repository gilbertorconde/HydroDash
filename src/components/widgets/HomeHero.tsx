import { useEffect, useState, type ReactNode } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { CloudRain, Droplets, ListChecks, Pause, Play, Power, Square } from 'lucide-react'
import { Button, OverflowMenu, PageHero, Pill, Spinner, type OverflowMenuItem } from '../ui'
import {
  dayLabel,
  formatCountdown,
  formatDeviceClock,
  formatDeviceDateTime,
  formatMinutesLong,
  type NextScheduledRun,
  type QueuedZone,
  type RunningZone,
} from './dashboardShared'
import { formatMinutesWall } from '../../lib/formatLocale'
import styles from './HomeHero.module.css'

type Props = {
  loading: boolean
  /** Controller unreachable (the page shows the error below the hero). */
  offline: boolean
  running: RunningZone[]
  queued: QueuedZone[]
  /** `dataUpdatedAt` (ms) of the `/jc` poll the remaining times come from. */
  fetchedAt: number
  /** Controller clock (`/jc devt`). */
  devt: number | undefined
  enabled: boolean
  /** Queue paused (`pq`) and seconds of pause left (`pt`). */
  paused: boolean
  pauseLeftSec: number
  /** Rain delay end (`rdst`) when a delay is active, else null. */
  rainDelayUntil: number | null
  next: NextScheduledRun | null
  is24Hour: boolean
  busy: boolean
  onStopZones: (zones: RunningZone[]) => void
  onPauseToggle: () => void
  onStopRunning: () => void
  onStopAll: () => void
  onToggleEnabled: () => void
  onClearRainDelay: () => void
  onRunProgram: () => void
}

/** Local 1 s clock so countdowns move between the 5 s controller polls. */
function useTick(active: boolean): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (!active) return
    const id = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(id)
  }, [active])
  return now
}

function progressPct(totalSec: number | null, leftSec: number): number | null {
  if (!totalSec || totalSec <= 0) return null
  return Math.min(100, Math.max(0, ((totalSec - leftSec) / totalSec) * 100))
}

function Progress({ pct, label }: { pct: number; label: string }) {
  return (
    <div
      className={styles.progress}
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(pct)}
    >
      <div className={styles.progressFill} style={{ width: `${pct}%` }} />
    </div>
  )
}

function Notice({
  icon,
  title,
  text,
  action,
}: {
  icon: ReactNode
  title: ReactNode
  text: ReactNode
  action?: ReactNode
}) {
  return (
    <div className={styles.notice} role="status">
      <span className={styles.noticeIcon}>{icon}</span>
      <span className={styles.noticeText}>
        <strong>{title}</strong>
        <span>{text}</span>
      </span>
      {action}
    </div>
  )
}

/**
 * Home page hero = the "Now running" experience: live countdown while watering, the next
 * scheduled run when idle, and banners for disabled controller / rain delay / paused queue.
 */
export function HomeHero(props: Props) {
  const {
    loading,
    offline,
    running,
    queued,
    fetchedAt,
    devt,
    enabled,
    paused,
    pauseLeftSec,
    rainDelayUntil,
    next,
    is24Hour,
    busy,
  } = props
  const navigate = useNavigate()
  const watering = running.length > 0
  const now = useTick((watering && !paused) || paused)
  const sincePollSec = Math.max(0, (now - fetchedAt) / 1000)
  const leftOf = (z: RunningZone) => (paused ? z.remainingSec : Math.max(0, z.remainingSec - sincePollSec))
  const pauseLeft = Math.max(0, pauseLeftSec - sincePollSec)
  const active = watering || queued.length > 0

  const menuItems: OverflowMenuItem[] = []
  if (watering) {
    menuItems.push({ label: 'Stop running, keep queue', disabled: busy, onSelect: props.onStopRunning })
  }
  if (active) {
    menuItems.push({ label: 'Stop all & clear queue', danger: true, disabled: busy, onSelect: props.onStopAll })
  }
  menuItems.push({
    label: enabled ? 'Disable controller' : 'Enable controller',
    danger: enabled,
    disabled: busy,
    onSelect: props.onToggleEnabled,
  })
  const menu = <OverflowMenu onHero label="Controller actions" items={menuItems} />

  const pauseButton = (variant: 'light' | 'glass') => (
    <Button
      variant={variant}
      size="lg"
      disabled={busy}
      startIcon={paused ? <Play size={16} aria-hidden /> : <Pause size={16} aria-hidden />}
      onClick={props.onPauseToggle}
    >
      {paused ? 'Resume' : 'Pause'}
    </Button>
  )

  /* ---- Status pills (eyebrow) ---- */
  let eyebrow: ReactNode
  if (offline) {
    eyebrow = <Pill tone="glass" icon={<span className={styles.dotOff} aria-hidden />}>Offline</Pill>
  } else if (watering) {
    const label = running.length === 1 ? running[0].programLabel : `${running.length} zones`
    eyebrow = (
      <Pill tone="glass" icon={<span className={paused ? styles.dotPaused : styles.dotLive} aria-hidden />}>
        {paused ? 'Paused' : 'Watering'} · {label}
      </Pill>
    )
  } else if (queued.length > 0) {
    eyebrow = (
      <Pill tone="glass" icon={<span className={paused ? styles.dotPaused : styles.dotLive} aria-hidden />}>
        {paused ? 'Paused' : 'Queued'} · {queued.length} zone{queued.length === 1 ? '' : 's'}
      </Pill>
    )
  } else {
    eyebrow = (
      <Pill tone="glass" icon={<span className={enabled ? styles.dotOk : styles.dotOff} aria-hidden />}>
        {enabled ? 'Online · idle' : 'Online · disabled'}
      </Pill>
    )
  }
  if (paused && !offline) {
    eyebrow = (
      <span className={styles.pills}>
        {eyebrow}
        <Pill tone="glass" icon={<Pause size={12} aria-hidden />}>
          {formatCountdown(pauseLeft)} left
        </Pill>
      </span>
    )
  }

  /* ---- Banners ---- */
  const notices = (
    <>
      {!offline && !enabled ? (
        <Notice
          icon={<Power size={18} aria-hidden />}
          title="Controller disabled"
          text="Scheduled programs won't run until it's enabled again."
          action={
            <Button variant="light" size="sm" disabled={busy} onClick={props.onToggleEnabled}>
              Enable
            </Button>
          }
        />
      ) : null}
      {!offline && rainDelayUntil != null ? (
        <Notice
          icon={<CloudRain size={18} aria-hidden />}
          title="Rain delay"
          text={`Watering suspended until ${formatDeviceDateTime(rainDelayUntil, devt, is24Hour)}.`}
          action={
            <Button variant="glass" size="sm" disabled={busy} onClick={props.onClearRainDelay}>
              Clear
            </Button>
          }
        />
      ) : null}
    </>
  )

  /* ---- Loading ---- */
  if (loading) {
    return (
      <PageHero size="tall" title="Home">
        <div className={styles.loading}>
          <Spinner />
        </div>
      </PageHero>
    )
  }

  /* ---- One zone watering: big countdown ---- */
  if (watering && running.length === 1) {
    const z = running[0]
    const left = leftOf(z)
    const pct = progressPct(z.totalSec, left)
    const meta = [
      z.totalSec ? `left of ${formatMinutesLong(z.totalSec / 60)}` : 'left',
      queued.length > 0
        ? `${queued.length} more zone${queued.length === 1 ? '' : 's'} after this`
        : 'last zone in the queue',
    ].join(' · ')
    return (
      <PageHero size="tall" eyebrow={eyebrow} title={z.name} actions={menu}>
        <div className={styles.body}>
          <div className={styles.main}>
            <div className={styles.countdown} aria-label="Time remaining" aria-live="off">
              {z.remainingSec > 0 ? (left > 0 ? formatCountdown(left) : '0:00') : '—'}
            </div>
            <p className={styles.meta}>{left > 0 || z.remainingSec <= 0 ? meta : 'Finishing…'}</p>
            {pct != null ? <Progress pct={pct} label={`${z.name} progress`} /> : null}
          </div>
          <div className={styles.buttons}>
            <Button
              variant="light"
              size="lg"
              disabled={busy}
              startIcon={<Square size={15} fill="currentColor" aria-hidden />}
              onClick={() => props.onStopZones([z])}
            >
              Stop
            </Button>
            {pauseButton('glass')}
          </div>
        </div>
        {notices}
      </PageHero>
    )
  }

  /* ---- Several zones in parallel: compact rows ---- */
  if (watering) {
    return (
      <PageHero
        size="tall"
        eyebrow={eyebrow}
        title={`${running.length} zones watering`}
        subtitle={
          queued.length > 0
            ? `${queued.length} more zone${queued.length === 1 ? '' : 's'} queued after these`
            : 'Nothing else queued'
        }
        actions={menu}
      >
        <div className={styles.body}>
          <ul className={styles.multi}>
            {running.map((z) => {
              const left = leftOf(z)
              const pct = progressPct(z.totalSec, left)
              return (
                <li key={z.sid} className={styles.multiRow}>
                  <div className={styles.multiTop}>
                    <span className={styles.multiText}>
                      <strong>{z.name}</strong>
                      <span>{z.programLabel}</span>
                    </span>
                    <span className={styles.multiTime}>
                      {z.remainingSec > 0 ? formatCountdown(left) : '—'}
                    </span>
                    <button
                      type="button"
                      className={styles.multiStop}
                      disabled={busy}
                      aria-label={`Stop ${z.name}`}
                      onClick={() => props.onStopZones([z])}
                    >
                      <Square size={13} fill="currentColor" aria-hidden />
                    </button>
                  </div>
                  {pct != null ? <Progress pct={pct} label={`${z.name} progress`} /> : null}
                </li>
              )
            })}
          </ul>
          <div className={styles.buttons}>
            <Button
              variant="light"
              size="lg"
              disabled={busy}
              startIcon={<Square size={15} fill="currentColor" aria-hidden />}
              onClick={() => props.onStopZones(running)}
            >
              Stop all
            </Button>
            {pauseButton('glass')}
          </div>
        </div>
        {notices}
      </PageHero>
    )
  }

  /* ---- Queue waiting (paused between zones, or about to start) ---- */
  if (queued.length > 0) {
    const first = queued[0]
    return (
      <PageHero
        size="tall"
        eyebrow={eyebrow}
        title={paused ? 'Watering paused' : `Up next: ${first.name}`}
        actions={menu}
      >
        <div className={styles.body}>
          <div className={styles.main}>
            <p className={styles.label}>{paused ? 'Next zone' : 'Starts at'}</p>
            <div className={styles.bigClock}>
              {paused || first.startSec <= 0 ? first.name : formatDeviceClock(first.startSec, is24Hour)}
            </div>
            <p className={styles.meta}>
              {formatMinutesLong(first.durationSec / 60)}
              {queued.length > 1 ? ` · then ${queued.length - 1} more` : ''}
            </p>
          </div>
          <div className={styles.buttons}>{pauseButton(paused ? 'light' : 'glass')}</div>
        </div>
        {notices}
      </PageHero>
    )
  }

  /* ---- Idle ---- */
  const nextAt =
    next && devt ? (Math.floor(devt / 86400) + next.dayOffset) * 86400 + next.startMin * 60 : null
  const nextSuspended =
    nextAt != null && (!enabled || (rainDelayUntil != null && nextAt < rainDelayUntil))
  return (
    <PageHero
      size="tall"
      eyebrow={eyebrow}
      title={offline ? 'Controller offline' : 'All quiet'}
      subtitle={
        offline
          ? 'HydroDash can’t reach the controller right now.'
          : next
            ? undefined
            : 'Nothing is watering and no runs are scheduled in the next 7 days.'
      }
      actions={offline ? undefined : menu}
    >
      <div className={styles.body}>
        {next && !offline ? (
          <div className={styles.main}>
            <p className={styles.label}>Next run · {dayLabel(next.dayOffset, next.weekday)}</p>
            <div className={styles.bigClock}>{formatMinutesWall(next.startMin, is24Hour)}</div>
            <p className={styles.meta}>
              {next.name} · {formatMinutesLong(next.durationMin)}
              {nextSuspended ? ` · skipped (${enabled ? 'rain delay' : 'controller disabled'})` : ''}
            </p>
          </div>
        ) : (
          <div className={styles.main} />
        )}
        {!offline ? (
          <div className={styles.buttons}>
            <Button
              variant="light"
              size="lg"
              startIcon={<Droplets size={17} aria-hidden />}
              onClick={() => void navigate({ to: '/zones' })}
            >
              Water a zone
            </Button>
            {paused ? (
              pauseButton('glass')
            ) : (
              <Button
                variant="glass"
                size="lg"
                startIcon={<ListChecks size={17} aria-hidden />}
                onClick={props.onRunProgram}
              >
                Run a program
              </Button>
            )}
          </div>
        ) : null}
      </div>
      {notices}
    </PageHero>
  )
}

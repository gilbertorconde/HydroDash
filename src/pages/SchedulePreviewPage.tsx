import { useMemo, useState } from 'react'
import { Link } from '@tanstack/react-router'
import { ChevronLeft, ChevronRight, Info, Sunrise, Sunset } from 'lucide-react'
import { useProgramsQuery, useController } from '../api/hooks'
import type { ProgramRow } from '../api/types'
import { getProgramDayType } from '../lib/programCodec'
import { isoDateToEpochDays } from '../lib/osDate'
import { formatMinutesWall } from '../lib/formatLocale'
import { useAppPreferences } from '../lib/appPreferences'
import { buildSchedulePreview, programColor, programGradient } from '../lib/schedulePreview'
import { Button, Card, EmptyState, ErrorBox, PageBody, PageHero, Pill, Spinner } from '../components/ui'
import styles from './SchedulePreviewPage.module.css'

const DAY_MS = 86400000

/** Local calendar date as YYYY-MM-DD (not UTC, so late-evening users get the right day). */
function localIso(d: Date): string {
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${m}-${day}`
}

function shiftIso(iso: string, days: number): string {
  const d = new Date(iso + 'T12:00:00')
  if (Number.isNaN(d.getTime())) return localIso(new Date())
  d.setTime(d.getTime() + days * DAY_MS)
  return localIso(d)
}

function formatSpan(minutes: number): string {
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  if (h > 0) return m > 0 ? `${h}h ${m}m` : `${h}h`
  return `${m}m`
}

const AXIS_HOURS = [0, 6, 12, 18, 24]

/** Short hour label for the timeline axis ("06" / "6 AM"). */
function axisLabel(hour: number, is24Hour: boolean): string {
  if (is24Hour) return String(hour).padStart(2, '0')
  const h = hour % 24
  return `${h % 12 || 12} ${h < 12 ? 'AM' : 'PM'}`
}

export function SchedulePreviewPage() {
  const pr = useProgramsQuery()
  const jc = useController(false)
  const prefs = useAppPreferences()
  const [iso, setIso] = useState(() => localIso(new Date()))

  const pd = useMemo(
    () => (pr.data?.pd as ProgramRow[] | undefined) ?? [],
    [pr.data?.pd],
  )
  const err = pr.error instanceof Error ? pr.error.message : null
  const sunrise = Number(jc.data?.sunrise ?? 360)
  const sunset = Number(jc.data?.sunset ?? 1080)
  const hasSun = jc.data?.sunrise != null && jc.data?.sunset != null

  const preview = useMemo(() => {
    const epoch = isoDateToEpochDays(iso)
    if (epoch == null) return { events: [] as ReturnType<typeof buildSchedulePreview>, epoch: null }
    const date = new Date(iso + 'T12:00:00')
    return {
      events: buildSchedulePreview(pd, date, epoch, sunrise, sunset),
      epoch,
    }
  }, [pd, iso, sunrise, sunset])

  const intervalCount = useMemo(
    () => pd.filter((row) => getProgramDayType(row[0]) === 'interval').length,
    [pd],
  )

  /** One timeline lane per program that starts on the chosen day, in first-start order. */
  const lanes = useMemo(() => {
    const byPid = new Map<number, { pid: number; name: string; events: typeof preview.events }>()
    for (const ev of preview.events) {
      const lane = byPid.get(ev.pid) ?? { pid: ev.pid, name: ev.name, events: [] }
      lane.events.push(ev)
      byPid.set(ev.pid, lane)
    }
    return [...byPid.values()]
  }, [preview])

  // "Now" marker: controller-local time (`devt` is local time encoded as UTC) when it's that day.
  const devt = typeof jc.data?.devt === 'number' ? jc.data.devt : 0
  const controllerIso = devt > 0 ? new Date(devt * 1000).toISOString().slice(0, 10) : localIso(new Date())
  const nowMin = devt > 0 ? Math.floor((devt % 86400) / 60) : null
  const isToday = iso === controllerIso
  const totalMinutes = preview.events.reduce((sum, ev) => sum + (ev.endMin - ev.startMin), 0)

  const chosen = new Date(iso + 'T12:00:00')
  const validDate = !Number.isNaN(chosen.getTime())
  const weekday = validDate ? chosen.toLocaleDateString(undefined, { weekday: 'long' }) : 'Pick a day'
  const longDate = validDate
    ? chosen.toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' })
    : ''

  return (
    <>
      <PageHero
        size="compact"
        back={{ to: '/more', label: 'More' }}
        title="Schedule preview"
        subtitle="Approximate starts for one day (weekly, single and monthly programs). Sun-relative times use today’s sunrise and sunset."
        eyebrow={
          hasSun ? (
            <Pill tone="glass" icon={<Sunrise size={13} aria-hidden />}>
              Sunrise {formatMinutesWall(sunrise, prefs.is24Hour)} · Sunset{' '}
              {formatMinutesWall(sunset, prefs.is24Hour)}
            </Pill>
          ) : undefined
        }
      />
      <PageBody>
        {err ? <ErrorBox message={err} /> : null}

        <Card>
          <div className={styles.dayNav}>
            <button
              type="button"
              className={styles.navBtn}
              aria-label="Previous day"
              title="Previous day"
              onClick={() => setIso((v) => shiftIso(v, -1))}
            >
              <ChevronLeft size={20} aria-hidden />
            </button>
            <div className={styles.dayInfo}>
              <div className={styles.dayTitleRow}>
                <span className={styles.dayTitle}>{weekday}</span>
                {isToday ? <Pill tone="accent">Today</Pill> : null}
              </div>
              <span className={styles.dayDate}>{longDate}</span>
            </div>
            <button
              type="button"
              className={styles.navBtn}
              aria-label="Next day"
              title="Next day"
              onClick={() => setIso((v) => shiftIso(v, 1))}
            >
              <ChevronRight size={20} aria-hidden />
            </button>
          </div>
          <div className={styles.dateRow}>
            <label className={styles.dateLabel} htmlFor="prev-date">
              Date
            </label>
            <input
              id="prev-date"
              type="date"
              className={styles.dateInput}
              value={iso}
              onChange={(e) => setIso(e.target.value)}
            />
            {!isToday ? (
              <Button size="sm" variant="secondary" onClick={() => setIso(controllerIso)}>
                Back to today
              </Button>
            ) : null}
            {pr.isLoading ? <Spinner /> : null}
          </div>
        </Card>

        {intervalCount > 0 ? (
          <p className={styles.note}>
            <Info size={16} aria-hidden />
            {intervalCount} interval program(s) are not included in this simplified preview.
          </p>
        ) : null}

        <Card
          title={prefs.is24Hour ? 'Timeline (24h)' : 'Timeline'}
          subtitle={
            preview.events.length > 0
              ? `${preview.events.length} start${preview.events.length === 1 ? '' : 's'} · about ${formatSpan(totalMinutes)} of watering`
              : undefined
          }
        >
          {preview.events.length === 0 ? (
            <EmptyState
              icon={<Sunset size={24} aria-hidden />}
              title="Nothing scheduled"
              description="No program starts match this day with the current rules."
            />
          ) : (
            <div className={styles.timeline} aria-hidden>
              {lanes.map((lane) => (
                <div key={lane.pid} className={styles.lane}>
                  <div className={styles.laneLabel}>
                    <span className={styles.laneDot} style={{ background: programGradient(lane.pid) }} />
                    <span className={styles.laneName}>{lane.name}</span>
                  </div>
                  <div className={styles.track}>
                    {hasSun ? (
                      <div
                        className={styles.daylight}
                        style={{
                          left: `${(Math.min(sunrise, sunset) / 1440) * 100}%`,
                          width: `${(Math.abs(sunset - sunrise) / 1440) * 100}%`,
                        }}
                      />
                    ) : null}
                    {lane.events.map((ev, i) => {
                      const left = (ev.startMin / 1440) * 100
                      const width = Math.max(0.6, ((ev.endMin - ev.startMin) / 1440) * 100)
                      return (
                        <div
                          key={`${ev.startMin}-${i}`}
                          className={styles.block}
                          style={{
                            left: `${left}%`,
                            width: `${width}%`,
                            background: programGradient(ev.pid),
                          }}
                          title={`${ev.name} ${formatMinutesWall(ev.startMin, prefs.is24Hour)}–${formatMinutesWall(ev.endMin, prefs.is24Hour)}`}
                        />
                      )
                    })}
                    {isToday && nowMin != null ? (
                      <div className={styles.nowLine} style={{ left: `${(nowMin / 1440) * 100}%` }} />
                    ) : null}
                  </div>
                </div>
              ))}
              <div className={styles.lane}>
                <div className={styles.laneLabel} />
                <div className={styles.axis}>
                  {AXIS_HOURS.map((h) => (
                    <span key={h} className={styles.tick} style={{ left: `${(h / 24) * 100}%` }}>
                      {axisLabel(h, prefs.is24Hour)}
                    </span>
                  ))}
                </div>
              </div>
              <div className={styles.legend}>
                {hasSun ? (
                  <span className={styles.legendItem}>
                    <span className={styles.legendDaylight} />
                    Daylight
                  </span>
                ) : null}
                {isToday && nowMin != null ? (
                  <span className={styles.legendItem}>
                    <span className={styles.legendNow} />
                    Now
                  </span>
                ) : null}
              </div>
            </div>
          )}
        </Card>

        <Card
          title="Ordered starts"
          titleAction={<Link to="/programs">Edit programs</Link>}
        >
          {preview.events.length === 0 ? (
            <p className={styles.empty}>Nothing scheduled for this day in the preview model.</p>
          ) : (
            <ul className={styles.list}>
              {preview.events.map((ev, i) => (
                <li key={`${ev.pid}-${ev.startMin}-${i}`} className={styles.listItem}>
                  <span className={styles.time}>
                    <span className={styles.timeStart}>{formatMinutesWall(ev.startMin, prefs.is24Hour)}</span>
                    <span className={styles.timeEnd}>
                      until {formatMinutesWall(ev.endMin, prefs.is24Hour)}
                    </span>
                  </span>
                  <span className={styles.bar} style={{ background: programColor(ev.pid) }} aria-hidden />
                  <span className={styles.itemText}>
                    <span className={styles.name}>{ev.name}</span>
                    <span className={styles.meta}>
                      Program #{ev.pid + 1} · {formatSpan(ev.endMin - ev.startMin)}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </PageBody>
    </>
  )
}

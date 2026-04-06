import { useMemo, useState } from 'react'
import { Link } from '@tanstack/react-router'
import { useProgramsQuery, useController } from '../api/hooks'
import type { ProgramRow } from '../api/types'
import { getProgramDayType } from '../lib/programCodec'
import { isoDateToEpochDays } from '../lib/osDate'
import { formatMinutesWall } from '../lib/formatLocale'
import { useAppPreferences } from '../lib/appPreferences'
import { buildSchedulePreview } from '../lib/schedulePreview'
import { MoreSubpageLayout } from '../components/MoreSubpageLayout'
import shell from '../components/MoreSubpageLayout.module.css'
import { Card, ErrorBox, Spinner } from '../components/ui'
import styles from './SchedulePreviewPage.module.css'

const DAY_MS = 86400000

export function SchedulePreviewPage() {
  const pr = useProgramsQuery()
  const jc = useController(false)
  const prefs = useAppPreferences()
  const [iso, setIso] = useState(() => new Date().toISOString().slice(0, 10))

  const pd = useMemo(
    () => (pr.data?.pd as ProgramRow[] | undefined) ?? [],
    [pr.data?.pd],
  )
  const err = pr.error instanceof Error ? pr.error.message : null

  const preview = useMemo(() => {
    const epoch = isoDateToEpochDays(iso)
    if (epoch == null) return { events: [] as ReturnType<typeof buildSchedulePreview>, epoch: null }
    const date = new Date(iso + 'T12:00:00')
    const sunrise = Number(jc.data?.sunrise ?? 360)
    const sunset = Number(jc.data?.sunset ?? 1080)
    return {
      events: buildSchedulePreview(pd, date, epoch, sunrise, sunset),
      epoch,
    }
  }, [pd, iso, jc.data?.sunrise, jc.data?.sunset])

  const intervalCount = useMemo(
    () => pd.filter((row) => getProgramDayType(row[0]) === 'interval').length,
    [pd],
  )

  return (
    <MoreSubpageLayout title="Schedule preview">
      <p className={shell.lead}>
        Approximate starts for one calendar day (weekly, single, monthly programs). Sun-relative start
        times use today&apos;s sunrise/sunset from the controller (
        {formatMinutesWall(Number(jc.data?.sunrise ?? 0), prefs.is24Hour)}–
        {formatMinutesWall(Number(jc.data?.sunset ?? 0), prefs.is24Hour)}).
      </p>
      {err ? <ErrorBox message={err} /> : null}
      {intervalCount > 0 ? (
        <p className={styles.note}>
          {intervalCount} interval program(s) are not included in this simplified preview.
        </p>
      ) : null}

      <Card title="Pick a day">
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
          <button
            type="button"
            className={styles.navDay}
            onClick={() => {
              const d = new Date(iso + 'T12:00:00')
              d.setTime(d.getTime() - DAY_MS)
              setIso(d.toISOString().slice(0, 10))
            }}
          >
            Previous day
          </button>
          <button
            type="button"
            className={styles.navDay}
            onClick={() => {
              const d = new Date(iso + 'T12:00:00')
              d.setTime(d.getTime() + DAY_MS)
              setIso(d.toISOString().slice(0, 10))
            }}
          >
            Next day
          </button>
        </div>
        {pr.isLoading ? <Spinner /> : null}
      </Card>

      <Card title={prefs.is24Hour ? 'Timeline (24h)' : 'Timeline'}>
        {preview.events.length === 0 ? (
          <p className={styles.empty}>No program starts match this day with the current rules.</p>
        ) : (
          <div className={styles.timeline} aria-hidden>
            <div className={styles.timelineTrack}>
              {preview.events.map((ev, i) => {
                const left = (ev.startMin / 1440) * 100
                const width = Math.max(0.35, ((ev.endMin - ev.startMin) / 1440) * 100)
                return (
                  <div
                    key={`${ev.pid}-${ev.startMin}-${i}`}
                    className={styles.timelineBlock}
                    style={{
                      left: `${left}%`,
                      width: `${width}%`,
                      background: `hsl(${(ev.pid * 47) % 360} 52% 42%)`,
                    }}
                    title={`${ev.name} ${formatMinutesWall(ev.startMin, prefs.is24Hour)}–${formatMinutesWall(ev.endMin, prefs.is24Hour)}`}
                  />
                )
              })}
            </div>
            <div className={styles.ticks}>
              <span>{formatMinutesWall(0, prefs.is24Hour)}</span>
              <span>{formatMinutesWall(360, prefs.is24Hour)}</span>
              <span>{formatMinutesWall(720, prefs.is24Hour)}</span>
              <span>{formatMinutesWall(1080, prefs.is24Hour)}</span>
              <span>{prefs.is24Hour ? '24:00' : formatMinutesWall(1439, prefs.is24Hour)}</span>
            </div>
          </div>
        )}
      </Card>

      <Card title="Ordered starts">
        {preview.events.length === 0 ? (
          <p className={styles.empty}>Nothing scheduled for this day in the preview model.</p>
        ) : (
          <ul className={styles.list}>
            {preview.events.map((ev, i) => (
              <li key={`${ev.pid}-${ev.startMin}-${i}`} className={styles.listItem}>
                <span className={styles.time}>
                  {formatMinutesWall(ev.startMin, prefs.is24Hour)} –{' '}
                  {formatMinutesWall(ev.endMin, prefs.is24Hour)}
                </span>
                <span className={styles.name}>{ev.name}</span>
                <span className={styles.meta}>Program #{ev.pid + 1}</span>
              </li>
            ))}
          </ul>
        )}
        <p className={styles.footer}>
          <Link to="/programs" className={styles.link}>
            Edit programs
          </Link>
        </p>
      </Card>
    </MoreSubpageLayout>
  )
}

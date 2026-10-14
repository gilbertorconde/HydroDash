import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import {
  useStationsMeta,
  useStationStatus,
  useController,
  useManualStation,
  useChangeStations,
  useChangeValues,
  usePauseQueue,
  useJsonAll,
  useStationSpecials,
} from '../api/hooks'
import type { JsonAll, ProgramRow } from '../api/types'
import { PARALLEL_GID_VALUE, getStationAttrLabels, jeEntryForSid } from '../lib/stationAttrs'
import {
  AdvancedSection,
  Button,
  EmptyState,
  ErrorBox,
  Field,
  Input,
  OverflowMenu,
  PageBody,
  PageHero,
  Pill,
  Spinner,
  Switch,
} from '../components/ui'
import { useConfirm } from '../components/confirmContext'
import { DurationInput } from '../components/DurationInput'
import {
  CONTROLLER_ACTION_UI_TIMEOUT_MS,
  OS_QUEUE_PID_NON_SCHEDULED_MIN,
  readQuickRunManualPid,
} from '../lib/opensprinklerRuntime'
import { isStationDisabled } from '../lib/stationDis'
import { saveAppPreference, useAppPreferences } from '../lib/appPreferences'
import {
  Ban,
  CircleDot,
  Clock3,
  Droplets,
  Flower2,
  Leaf,
  Pause,
  Play,
  PlayCircle,
  Sprout,
  Square,
  Trees,
  X,
} from 'lucide-react'
import styles from './StationsPage.module.css'

/** Manual run presets (seconds) shown as chips; anything else is "Custom". */
const DURATION_PRESETS = [300, 600, 900, 1800] as const
const MAX_MANUAL_SECONDS = 64800

/** Firmware queue pid for `/cm` manual station runs (test station). */
const OS_QUEUE_PID_MANUAL_STATION = 99
/** Firmware queue pid for run-once (`/cr`) and manual program start (`/mp`). */
const OS_QUEUE_PID_RUN_ONCE = 254

/** `ps[sid]` from `/jc`: [queue pid, seconds left (or run length when queued), start epoch, gid]. */
type QueueRow = [number, number, number, number]

/** Decorative badge per zone: icon and tint rotate by station index so the grid reads at a glance. */
const ZONE_ICONS = [Leaf, Sprout, Flower2, Trees, Droplets] as const
const ZONE_TONES = ['accent', 'success', 'warning', 'advanced'] as const

function formatDuration(totalSeconds: number): string {
  if (totalSeconds <= 0) return '0s'
  const h = Math.floor(totalSeconds / 3600)
  const m = Math.floor((totalSeconds % 3600) / 60)
  const s = totalSeconds % 60
  if (h > 0) return `${h}h ${m}m`
  if (m > 0) return s > 0 ? `${m}m ${s}s` : `${m}m`
  return `${s}s`
}

/** `m:ss` or `h:mm:ss` for the live countdown. */
function formatCountdown(sec: number): string {
  const s = Math.max(0, Math.ceil(sec))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const ss = String(s % 60).padStart(2, '0')
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`
}

function buildStationDisablePayload(stnDis: number[], sid: number, disabled: boolean, nboards: number) {
  const next = [...stnDis]
  while (next.length < nboards) next.push(0)
  const board = Math.floor(sid / 8)
  const bitMask = 1 << (sid % 8)
  if (disabled) next[board] = (next[board] ?? 0) | bitMask
  else next[board] = (next[board] ?? 0) & ~bitMask

  const payload: Record<string, number> = {}
  for (let i = 0; i < nboards; i++) payload[`d${i}`] = next[i] ?? 0
  return payload
}

function programName(pd: ProgramRow[], idx: number): string {
  const n = pd[idx]?.[5]
  return n?.trim() ? n : `Program ${idx + 1}`
}

/**
 * Human label for what put a zone in the runtime queue (`ps[sid][0]`).
 * Scheduled programs are 1-based; sentinel pids mark manual / run-once entries.
 */
function queueSourceLabel(queuePid: number, pd: ProgramRow[], quickRunPid: number | null): string {
  if (queuePid >= 1 && queuePid < OS_QUEUE_PID_NON_SCHEDULED_MIN) {
    return pd[queuePid - 1] ? programName(pd, queuePid - 1) : `Program ${queuePid}`
  }
  if (queuePid === OS_QUEUE_PID_MANUAL_STATION) return 'Manual run'
  if (queuePid === OS_QUEUE_PID_RUN_ONCE) {
    // Dashboard Quick Run remembers which program it started via `/mp` (also pid 254).
    if (quickRunPid !== null && pd[quickRunPid]) return `${programName(pd, quickRunPid)} (manual)`
    return 'Run-once'
  }
  return 'Manual run'
}

function groupLabel(gid: number): string {
  return gid === PARALLEL_GID_VALUE ? 'Parallel zones' : `Group ${gid}`
}

export function StationsPage() {
  const jn = useStationsMeta()
  const ja = useJsonAll()
  const je = useStationSpecials()
  const js = useStationStatus(4000)
  const jc = useController(5000)
  const manual = useManualStation()
  const changeStations = useChangeStations()
  const changeValues = useChangeValues()
  const confirm = useConfirm()
  const pauseQueue = usePauseQueue()

  const snArr = useMemo(() => js.data?.sn ?? [], [js.data?.sn])
  const snames = useMemo(
    () => (jn.data?.snames as string[] | undefined) ?? [],
    [jn.data?.snames],
  )
  const stnGrp = useMemo(
    () => (jn.data?.stn_grp as number[] | undefined) ?? [],
    [jn.data?.stn_grp],
  )
  const stnDis = useMemo(
    () => (jn.data?.stn_dis as number[] | undefined) ?? [],
    [jn.data?.stn_dis],
  )
  const pd = useMemo(
    () => (ja.data?.programs?.pd as ProgramRow[] | undefined) ?? [],
    [ja.data?.programs?.pd],
  )
  const sn = snArr
  const n = Math.max(snames.length, sn.length, jc.data?.nbrd ? jc.data.nbrd * 8 : 0)
  const appPrefs = useAppPreferences()

  type ZoneRow = { kind: 'group'; id: number } | { kind: 'station'; sid: number }

  const zoneRows = useMemo((): ZoneRow[] => {
    let sids = Array.from({ length: n }, (_, i) => i)
    if (!appPrefs.showDisabled) sids = sids.filter((sid) => !isStationDisabled(stnDis, sid))

    const byName = (a: number, b: number) =>
      (snames[a] ?? '').localeCompare(snames[b] ?? '', undefined, { sensitivity: 'base' })

    const useGroups = appPrefs.groupView && stnGrp.length >= n && n > 0

    if (useGroups) {
      sids = [...sids].sort((a, b) => {
        const ga = stnGrp[a] ?? 0
        const gb = stnGrp[b] ?? 0
        if (ga !== gb) return ga - gb
        if (appPrefs.sortByStationName) return byName(a, b)
        return a - b
      })
      const out: ZoneRow[] = []
      let lastG = Number.NaN
      for (const sid of sids) {
        const g = stnGrp[sid] ?? 0
        if (g !== lastG) {
          out.push({ kind: 'group', id: g })
          lastG = g
        }
        out.push({ kind: 'station', sid })
      }
      return out
    }

    if (appPrefs.sortByStationName) {
      sids = [...sids].sort(byName)
    }
    return sids.map((sid) => ({ kind: 'station', sid }))
  }, [
    n,
    appPrefs.showDisabled,
    appPrefs.sortByStationName,
    appPrefs.groupView,
    stnDis,
    snames,
    stnGrp,
  ])

  const [durations, setDurations] = useState<Record<number, number>>({})
  const [actionMsg, setActionMsg] = useState<string | null>(null)
  const [actionErr, setActionErr] = useState<string | null>(null)
  const [startingSid, setStartingSid] = useState<number | null>(null)
  /** Zone whose "Rename & details" sheet is open. */
  const [editSid, setEditSid] = useState<number | null>(null)
  const zoneStartWatchdogRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (startingSid === null) return
    if (snArr[startingSid] !== 1) return
    if (zoneStartWatchdogRef.current) {
      clearTimeout(zoneStartWatchdogRef.current)
      zoneStartWatchdogRef.current = null
    }
    queueMicrotask(() => setStartingSid(null))
  }, [startingSid, snArr])

  useEffect(() => {
    if (startingSid === null) return
    zoneStartWatchdogRef.current = setTimeout(() => {
      zoneStartWatchdogRef.current = null
      setStartingSid(null)
    }, CONTROLLER_ACTION_UI_TIMEOUT_MS)
    return () => {
      if (zoneStartWatchdogRef.current) {
        clearTimeout(zoneStartWatchdogRef.current)
        zoneStartWatchdogRef.current = null
      }
    }
  }, [startingSid])

  const err = jn.error ?? js.error ?? ja.error ?? je.error
  const errMsg = err instanceof Error ? err.message : null

  /** Runs a controller action and reports it; resolves to whether it succeeded. */
  async function runAction(task: () => Promise<unknown>, successMessage: string): Promise<boolean> {
    setActionErr(null)
    setActionMsg(null)
    try {
      await task()
      setActionMsg(successMessage)
      return true
    } catch (e) {
      setActionErr(e instanceof Error ? e.message : 'Zone action failed')
      return false
    }
  }

  function durFor(sid: number) {
    return Math.min(MAX_MANUAL_SECONDS, Math.max(1, durations[sid] ?? 300))
  }

  const ps = jc.data?.ps as QueueRow[] | undefined
  const devt = typeof jc.data?.devt === 'number' ? jc.data.devt : 0
  const paused = Boolean(jc.data?.pq)
  const nboards = jc.data?.nbrd ? Number(jc.data.nbrd) : Math.max(1, Math.ceil(n / 8))
  // Read once per render; Dashboard keeps it in sessionStorage while its Quick Run is active.
  const quickRunPid = readQuickRunManualPid()

  let runningCount = 0
  let queuedCount = 0
  for (let sid = 0; sid < n; sid++) {
    if (sn[sid] === 1) runningCount += 1
    else if ((ps?.[sid]?.[0] ?? 0) !== 0) queuedCount += 1
  }
  const summary = [
    runningCount > 0 ? `${runningCount} running` : null,
    queuedCount > 0 ? `${queuedCount} queued` : null,
    n > 0 ? `${n} zone${n === 1 ? '' : 's'}` : null,
  ]
    .filter(Boolean)
    .join(' · ')

  const loading = jn.isLoading || (ja.isLoading && !ja.data)
  const editName = editSid !== null ? (snames[editSid] ?? `Station ${editSid + 1}`) : ''

  return (
    <>
      <PageHero
        title="Zones"
        eyebrow={
          paused ? (
            <Pill tone="glass" icon={<Pause size={12} aria-hidden />}>
              Queue paused
            </Pill>
          ) : runningCount > 0 ? (
            <Pill tone="glass" icon={<span className={styles.liveDot} aria-hidden />}>
              Watering now
            </Pill>
          ) : null
        }
        subtitle={summary || 'Water any zone by hand'}
        actions={
          <>
            <Button
              variant="glass"
              disabled={pauseQueue.isPending}
              startIcon={paused ? <Play size={16} aria-hidden /> : <Pause size={16} aria-hidden />}
              onClick={async () => {
                if (paused) {
                  await runAction(() => pauseQueue.mutateAsync({ repl: 0 }), 'Queue resumed.')
                } else {
                  await runAction(() => pauseQueue.mutateAsync({ dur: 600 }), 'Queue paused for 10 minutes.')
                }
              }}
            >
              {paused ? 'Resume' : 'Pause 10 min'}
            </Button>
            <OverflowMenu
              onHero
              label="More zone actions"
              items={[
                {
                  label: 'Stop all zones',
                  danger: true,
                  disabled: changeValues.isPending,
                  onSelect: async () => {
                    const ok = await confirm({
                      title: 'Stop all zones?',
                      message: 'Every running zone stops and the watering queue is cleared.',
                      confirmLabel: 'Stop all',
                      tone: 'danger',
                    })
                    if (!ok) return
                    void runAction(() => changeValues.mutateAsync({ rsn: 1 }), 'All zones stopped.')
                  },
                },
              ]}
            />
          </>
        }
      />
      <PageBody>
        {errMsg ? <ErrorBox message={errMsg} /> : null}
        {actionErr ? <ErrorBox message={actionErr} /> : null}
        {actionMsg ? (
          <p className={styles.ok} role="status">
            {actionMsg}
          </p>
        ) : null}
        {loading ? <Spinner /> : null}
        {!loading && zoneRows.length === 0 && n > 0 ? (
          <EmptyState
            icon={<Ban size={22} aria-hidden />}
            title="All zones are hidden"
            description="Every zone is disabled. Turn on “Show disabled zones” below to see them."
          />
        ) : null}
        <div className={styles.list}>
          {zoneRows.map((row, rowIdx) => {
            if (row.kind === 'group') {
              return (
                <h2 key={`grp-${row.id}-${rowIdx}`} className={styles.groupHeading}>
                  {groupLabel(row.id)}
                </h2>
              )
            }
            const sid = row.sid
            const nameBase = snames[sid] ?? `Station ${sid + 1}`
            const on = sn[sid] === 1
            const psRow = ps?.[sid]
            const queueRow = psRow && psRow[0] !== 0 ? psRow : null
            const disabled = isStationDisabled(stnDis, sid)

            return (
              <ZoneCard
                key={sid}
                sid={sid}
                nameBase={nameBase}
                displayName={appPrefs.showStationNum ? `${sid + 1}. ${nameBase}` : nameBase}
                on={on}
                disabled={disabled}
                queueRow={queueRow}
                queueSource={queueRow ? queueSourceLabel(queueRow[0], pd, quickRunPid) : null}
                devt={devt}
                fetchedAt={jc.dataUpdatedAt}
                paused={paused}
                durationSec={durFor(sid)}
                onDurationChange={(seconds) => setDurations((d) => ({ ...d, [sid]: seconds }))}
                starting={startingSid === sid && !on}
                startBlocked={manual.isPending || (startingSid !== null && !on)}
                stopBlocked={manual.isPending}
                stationsPending={changeStations.isPending}
                onStart={() =>
                  runAction(async () => {
                    setStartingSid(sid)
                    try {
                      await manual.mutateAsync({
                        sid,
                        en: 1,
                        t: durFor(sid),
                        qo: 0,
                      })
                    } catch (e) {
                      setStartingSid(null)
                      throw e
                    }
                  }, `Zone ${sid + 1} started.`)
                }
                onStop={() =>
                  runAction(
                    () =>
                      manual.mutateAsync({
                        sid,
                        en: 0,
                      }),
                    `Zone ${sid + 1} stopped.`,
                  )
                }
                onEdit={() => setEditSid(sid)}
                onToggleDisabled={async () => {
                  if (
                    !disabled &&
                    !(await confirm({
                      title: `Disable “${nameBase}”?`,
                      message: 'It will not run from programs or manual start until you enable it again.',
                      confirmLabel: 'Disable zone',
                      tone: 'danger',
                    }))
                  ) {
                    return
                  }
                  void runAction(
                    () =>
                      changeStations.mutateAsync(
                        buildStationDisablePayload(stnDis, sid, !disabled, nboards),
                      ),
                    !disabled ? `Zone ${sid + 1} disabled.` : `Zone ${sid + 1} enabled.`,
                  )
                }}
              />
            )
          })}
        </div>

        <AdvancedSection
          id="zones-list-display"
          title="List display"
          description="Which zones show here and in what order. Same as Settings → App preferences."
        >
          <div className={styles.prefs}>
            <Switch
              checked={appPrefs.showDisabled}
              onChange={(v) => saveAppPreference('showDisabled', v)}
              label="Show disabled zones"
              description="List zones that are turned off, dimmed."
            />
            <Switch
              checked={appPrefs.showStationNum}
              onChange={(v) => saveAppPreference('showStationNum', v)}
              label="Show zone numbers"
              description="Prefix names with the controller station number."
            />
            <Switch
              checked={appPrefs.groupView}
              onChange={(v) => saveAppPreference('groupView', v)}
              label="Group by sequential group"
              description="Sort zones under their controller group headings."
            />
            <Switch
              checked={appPrefs.sortByStationName}
              onChange={(v) => saveAppPreference('sortByStationName', v)}
              label="Sort by name"
              description="Alphabetical instead of station order."
            />
          </div>
        </AdvancedSection>
      </PageBody>

      {editSid !== null ? (
        <ZoneSheet
          key={editSid}
          sid={editSid}
          nameBase={editName}
          stationsPending={changeStations.isPending}
          onClose={() => setEditSid(null)}
          onRename={(next) =>
            runAction(
              () => changeStations.mutateAsync({ [`s${editSid}`]: next }),
              `Zone ${editSid + 1} name saved.`,
            )
          }
          stationsBlock={ja.data?.stations}
          stationsError={ja.isError}
          jeRow={je.data ? jeEntryForSid(je.data, editSid) : null}
          jeHasAny={Boolean(je.isSuccess && je.data && Object.keys(je.data).length > 0)}
        />
      ) : null}
    </>
  )
}

type ZoneCardProps = {
  sid: number
  /** Controller name (what Rename edits). */
  nameBase: string
  /** Name as shown (may carry the "N." prefix from preferences). */
  displayName: string
  on: boolean
  disabled: boolean
  queueRow: QueueRow | null
  queueSource: string | null
  /** Controller clock (`/jc devt`) at the last poll. */
  devt: number
  /** When that poll landed (ms), so countdowns can tick locally. */
  fetchedAt: number
  paused: boolean
  durationSec: number
  onDurationChange: (seconds: number) => void
  starting: boolean
  startBlocked: boolean
  stopBlocked: boolean
  stationsPending: boolean
  onStart: () => void
  onStop: () => void
  onEdit: () => void
  onToggleDisabled: () => void
}

/** One zone: status + start/stop up front; rename, enable/disable and attributes behind `⋯`. */
function ZoneCard({
  sid,
  nameBase,
  displayName,
  on,
  disabled,
  queueRow,
  queueSource,
  devt,
  fetchedAt,
  paused,
  durationSec,
  onDurationChange,
  starting,
  startBlocked,
  stopBlocked,
  stationsPending,
  onStart,
  onStop,
  onEdit,
  onToggleDisabled,
}: ZoneCardProps) {
  const isPreset = (DURATION_PRESETS as readonly number[]).includes(durationSec)
  const [customOpen, setCustomOpen] = useState(!isPreset)
  const queued = queueRow !== null && !on
  const Icon = ZONE_ICONS[sid % ZONE_ICONS.length]
  const tone = ZONE_TONES[sid % ZONE_TONES.length]

  // Running wins over Disabled so a zone switched off mid-run still shows (and offers) Stop.
  let pill: ReactNode
  if (on) {
    pill = (
      <Pill tone="success" icon={<PlayCircle size={13} aria-hidden />}>
        Running
      </Pill>
    )
  } else if (disabled) {
    pill = (
      <Pill tone="neutral" icon={<Ban size={13} aria-hidden />}>
        Disabled
      </Pill>
    )
  } else if (queued) {
    pill = (
      <Pill tone="warning" icon={<Clock3 size={13} aria-hidden />}>
        Queued
      </Pill>
    )
  } else {
    pill = (
      <Pill tone="neutral" icon={<CircleDot size={13} aria-hidden />}>
        Idle
      </Pill>
    )
  }

  // Queued rows carry the planned run length; show when it starts if the controller says so.
  let detail: string | null = null
  if (queueRow && queued && !disabled) {
    const startsIn = queueRow[2] > 0 && devt > 0 ? queueRow[2] - devt : 0
    detail = [
      queueSource,
      `${formatDuration(queueRow[1])} run`,
      startsIn > 0 ? `starts in ${formatDuration(startsIn)}` : null,
    ]
      .filter(Boolean)
      .join(' · ')
  }

  return (
    <section
      className={[styles.zone, disabled && !on ? styles.zoneDisabled : '', on ? styles.zoneRunning : '']
        .filter(Boolean)
        .join(' ')}
      aria-labelledby={`zone-name-${sid}`}
    >
      <div className={styles.zoneHead}>
        <span className={`${styles.badge} ${styles[`badge_${on ? 'running' : tone}`]}`} aria-hidden>
          <Icon size={19} strokeWidth={2.1} />
        </span>
        <div className={styles.zoneHeadText}>
          <h2 id={`zone-name-${sid}`} className={styles.zoneName}>
            {displayName}
          </h2>
          <div className={styles.zoneStatus}>
            {pill}
            {detail ? <span className={styles.statusDetail}>{detail}</span> : null}
          </div>
        </div>
        <OverflowMenu
          label={`Actions for ${displayName}`}
          items={[
            { label: 'Rename & details', onSelect: onEdit },
            {
              label: disabled ? 'Enable zone' : 'Disable zone',
              danger: !disabled,
              disabled: stationsPending,
              onSelect: onToggleDisabled,
            },
          ]}
        />
      </div>

      {on ? (
        <RunningBlock
          name={nameBase}
          source={queueSource}
          queueRow={queueRow}
          devt={devt}
          fetchedAt={fetchedAt}
          paused={paused}
          stopBlocked={stopBlocked}
          onStop={onStop}
        />
      ) : disabled ? (
        <p className={styles.zoneNote}>Turned off: will not run from programs or manual start.</p>
      ) : (
        <div className={styles.runBlock}>
          <div className={styles.chips} role="group" aria-label={`Run duration for ${displayName}`}>
            {DURATION_PRESETS.map((sec) => {
              const selected = !customOpen && durationSec === sec
              return (
                <button
                  key={sec}
                  type="button"
                  className={`${styles.chip} ${selected ? styles.chipSelected : ''}`}
                  aria-pressed={selected}
                  onClick={() => {
                    setCustomOpen(false)
                    onDurationChange(sec)
                  }}
                >
                  {sec / 60}
                  <span className={styles.chipUnit}>min</span>
                </button>
              )
            })}
            <button
              type="button"
              className={`${styles.chip} ${customOpen ? styles.chipSelected : ''}`}
              aria-pressed={customOpen}
              aria-expanded={customOpen}
              aria-controls={`d-${sid}-custom`}
              onClick={() => setCustomOpen((v) => !v)}
            >
              Custom
            </button>
          </div>
          {customOpen ? (
            <div id={`d-${sid}-custom`} className={styles.custom}>
              <DurationInput
                idBase={`d-${sid}`}
                label={`Custom run duration for ${displayName}`}
                valueSeconds={durationSec}
                maxSeconds={MAX_MANUAL_SECONDS}
                onChange={onDurationChange}
              />
            </div>
          ) : null}
          <Button
            className={styles.runBtn}
            disabled={startBlocked}
            aria-busy={starting}
            startIcon={starting ? <Spinner /> : <Play size={16} strokeWidth={2.25} aria-hidden />}
            onClick={onStart}
          >
            {starting ? 'Starting…' : `Start · ${formatDuration(durationSec)}`}
          </Button>
        </div>
      )}
    </section>
  )
}

/** Live countdown + progress for a running zone; ticks locally between 5 s `/jc` polls. */
function RunningBlock({
  name,
  source,
  queueRow,
  devt,
  fetchedAt,
  paused,
  stopBlocked,
  onStop,
}: {
  name: string
  source: string | null
  queueRow: QueueRow | null
  devt: number
  fetchedAt: number
  paused: boolean
  stopBlocked: boolean
  onStop: () => void
}) {
  const [now, setNow] = useState(() => Date.now())
  const remaining = queueRow ? Math.max(0, queueRow[1]) : 0
  const ticking = remaining > 0 && !paused

  useEffect(() => {
    if (!ticking) return
    const id = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(id)
  }, [ticking])

  const sincePoll = ticking && fetchedAt > 0 ? Math.max(0, (now - fetchedAt) / 1000) : 0
  const left = Math.max(0, remaining - sincePoll)
  const start = queueRow?.[2] ?? 0
  const elapsed = start > 0 && devt >= start ? devt - start : null
  const total = elapsed != null && remaining > 0 ? elapsed + remaining : null
  const pct = total ? Math.min(100, Math.max(0, ((total - left) / total) * 100)) : null

  return (
    <div className={styles.running}>
      <div className={styles.runningTop}>
        <div className={styles.runningText}>
          <span className={styles.countdown} aria-label="Time remaining">
            {remaining > 0 ? (left > 0 ? formatCountdown(left) : 'Finishing…') : '—'}
          </span>
          <span className={styles.runningMeta}>
            {[paused ? 'Paused' : 'Left', source].filter(Boolean).join(' · ')}
          </span>
        </div>
        <Button
          variant="secondary"
          className={styles.stopBtn}
          disabled={stopBlocked}
          aria-label={`Stop ${name}`}
          startIcon={<Square size={14} aria-hidden />}
          onClick={onStop}
        >
          Stop
        </Button>
      </div>
      {pct != null ? (
        <div
          className={styles.progress}
          role="progressbar"
          aria-label={`${name} progress`}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(pct)}
        >
          <div className={styles.progressFill} style={{ width: `${pct}%` }} />
        </div>
      ) : null}
    </div>
  )
}

/** "Rename & details": bottom sheet on phones, centred dialog on wider screens. */
function ZoneSheet({
  sid,
  nameBase,
  stationsPending,
  onClose,
  onRename,
  stationsBlock,
  stationsError,
  jeRow,
  jeHasAny,
}: {
  sid: number
  nameBase: string
  stationsPending: boolean
  onClose: () => void
  onRename: (name: string) => Promise<boolean>
  stationsBlock: JsonAll['stations'] | undefined
  stationsError: boolean
  jeRow: Record<string, unknown> | null
  jeHasAny: boolean
}) {
  const [nameDraft, setNameDraft] = useState<string | null>(null)
  // Parent re-renders on every poll; keep the latest close handler without re-running the effect.
  const onCloseRef = useRef(onClose)
  useEffect(() => {
    onCloseRef.current = onClose
  }, [onClose])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCloseRef.current()
    }
    document.addEventListener('keydown', onKey)
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    document.getElementById(`n-${sid}`)?.focus({ preventScroll: true })
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = prevOverflow
    }
  }, [sid])

  return createPortal(
    <div className={styles.sheetBackdrop} role="presentation" onClick={onClose}>
      <div
        className={styles.sheet}
        role="dialog"
        aria-modal="true"
        aria-labelledby={`zone-sheet-${sid}`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className={styles.sheetHead}>
          <div className={styles.sheetHeading}>
            <p className={styles.sheetEyebrow}>Zone {sid + 1}</p>
            <h2 id={`zone-sheet-${sid}`} className={styles.sheetTitle}>
              {nameBase}
            </h2>
          </div>
          <button type="button" className={styles.sheetClose} aria-label="Close" onClick={onClose}>
            <X size={20} aria-hidden />
          </button>
        </div>
        <div className={styles.sheetBody}>
          <form
            className={styles.nameEdit}
            onSubmit={(e) => {
              e.preventDefault()
              const next = (nameDraft ?? nameBase).trim()
              if (!next) return
              void onRename(next).then((ok) => {
                if (ok) {
                  setNameDraft(null)
                  onClose()
                }
              })
            }}
          >
            <Field label="Zone name" htmlFor={`n-${sid}`} hint="Up to 32 characters.">
              <Input
                id={`n-${sid}`}
                value={nameDraft ?? nameBase}
                onChange={(e) => setNameDraft(e.target.value)}
                maxLength={32}
                autoComplete="off"
              />
            </Field>
            <div className={styles.sheetActions}>
              <Button variant="ghost" onClick={onClose}>
                Cancel
              </Button>
              <Button type="submit" disabled={stationsPending || !(nameDraft ?? nameBase).trim()}>
                Save name
              </Button>
            </div>
          </form>
          <AdvancedSection
            id="zone-attributes"
            title="Station attributes"
            description="Master, rain/sensor, group and special-station flags (read-only)."
          >
            <StationAttributes
              sid={sid}
              stationsBlock={stationsBlock}
              stationsError={stationsError}
              jeRow={jeRow}
              jeHasAny={jeHasAny}
            />
          </AdvancedSection>
        </div>
      </div>
    </div>,
    document.body,
  )
}

/** Read-only station flags (master, rain, sequential…) plus extension payload, if any. */
function StationAttributes({
  sid,
  stationsBlock,
  stationsError,
  jeRow,
  jeHasAny,
}: {
  sid: number
  stationsBlock: JsonAll['stations'] | undefined
  stationsError: boolean
  jeRow: Record<string, unknown> | null
  jeHasAny: boolean
}) {
  const attr = stationsBlock ? getStationAttrLabels(sid, stationsBlock) : null
  if (!attr) {
    return stationsError ? (
      <p className={styles.zoneNote}>
        Could not load full station flags from the device. Names and manual run still work.
      </p>
    ) : (
      <Spinner />
    )
  }
  const gid = stationsBlock?.stn_grp && stationsBlock.stn_grp.length > sid ? stationsBlock.stn_grp[sid] : null
  const flags = [
    attr.master1 && 'Master station 1',
    attr.master2 && 'Master station 2',
    attr.ignoreRain && 'Ignore rain',
    attr.ignoreSn1 && 'Ignore sensor 1',
    attr.ignoreSn2 && 'Ignore sensor 2',
    attr.sequential
      ? gid != null
        ? `Sequential · group ${gid}`
        : 'Sequential'
      : gid != null && 'Parallel group',
    attr.special && 'Special station type',
    attr.actRelay && 'Activate relay',
  ].filter((f): f is string => Boolean(f))

  return (
    <div className={styles.attrs}>
      <ul className={styles.attrChipList} aria-label="Station attribute flags from controller">
        {(flags.length ? flags : ['No extra flags set']).map((f) => (
          <li key={f}>
            <Pill tone="advanced">{f}</Pill>
          </li>
        ))}
      </ul>
      <p className={styles.jeHint}>Change these in the OpenSprinkler app or controller web UI.</p>
      {jeRow ? (
        <>
          <p className={styles.jeHint}>Extension and RF payload for this zone:</p>
          <pre className={styles.jePre}>{JSON.stringify(jeRow, null, 2)}</pre>
        </>
      ) : jeHasAny ? (
        <p className={styles.jeHint}>No extension payload for this zone.</p>
      ) : null}
    </div>
  )
}

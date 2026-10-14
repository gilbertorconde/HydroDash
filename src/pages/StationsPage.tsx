import { useEffect, useMemo, useRef, useState } from 'react'
import {
  useStationsMeta,
  useStationStatus,
  useController,
  useManualStation,
  useChangeStations,
  usePauseQueue,
  useJsonAll,
  useStationSpecials,
} from '../api/hooks'
import type { JsonAll, ProgramRow } from '../api/types'
import { getStationAttrLabels, jeEntryForSid } from '../lib/stationAttrs'
import { Button, Input, Label, Spinner, ErrorBox, OverflowMenu } from '../components/ui'
import { DurationInput } from '../components/DurationInput'
import {
  CONTROLLER_ACTION_UI_TIMEOUT_MS,
  OS_QUEUE_PID_NON_SCHEDULED_MIN,
  readQuickRunManualPid,
} from '../lib/opensprinklerRuntime'
import { isStationDisabled } from '../lib/stationDis'
import { useAppPreferences } from '../lib/appPreferences'
import { CircleDot, Clock3, Play, PlayCircle, Square } from 'lucide-react'
import styles from './StationsPage.module.css'

/** Manual run presets (seconds) shown as chips; anything else is "Custom". */
const DURATION_PRESETS = [300, 600, 900, 1800] as const
const MAX_MANUAL_SECONDS = 64800

/** Firmware queue pid for `/cm` manual station runs (test station). */
const OS_QUEUE_PID_MANUAL_STATION = 99
/** Firmware queue pid for run-once (`/cr`) and manual program start (`/mp`). */
const OS_QUEUE_PID_RUN_ONCE = 254

type QueueRow = [number, number, number, number]

function formatDuration(totalSeconds: number): string {
  if (totalSeconds <= 0) return '0s'
  const h = Math.floor(totalSeconds / 3600)
  const m = Math.floor((totalSeconds % 3600) / 60)
  const s = totalSeconds % 60
  if (h > 0) return `${h}h ${m}m`
  if (m > 0) return s > 0 ? `${m}m ${s}s` : `${m}m`
  return `${s}s`
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

export function StationsPage() {
  const jn = useStationsMeta()
  const ja = useJsonAll()
  const je = useStationSpecials()
  const js = useStationStatus(4000)
  const jc = useController(5000)
  const manual = useManualStation()
  const changeStations = useChangeStations()
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
  const nboards = jc.data?.nbrd ? Number(jc.data.nbrd) : Math.max(1, Math.ceil(n / 8))
  // Read once per render; Dashboard keeps it in sessionStorage while its Quick Run is active.
  const quickRunPid = readQuickRunManualPid()

  return (
    <div>
      <h1 className={styles.title}>Zones</h1>
      {errMsg ? <ErrorBox message={errMsg} /> : null}
      {actionErr ? <ErrorBox message={actionErr} /> : null}
      {actionMsg ? <p className={styles.ok}>{actionMsg}</p> : null}
      <div className={styles.topBar}>
        <p className={styles.hint}>
          Pick a duration and press <strong>Start</strong> to water a zone manually.
        </p>
        <Button
          variant="secondary"
          disabled={pauseQueue.isPending}
          onClick={async () => {
            if (jc.data?.pq) {
              await runAction(() => pauseQueue.mutateAsync({ repl: 0 }), 'Queue resumed.')
            } else {
              await runAction(() => pauseQueue.mutateAsync({ dur: 600 }), 'Queue paused for 10 minutes.')
            }
          }}
        >
          {jc.data?.pq ? 'Resume watering' : 'Pause 10 min'}
        </Button>
      </div>
      {jn.isLoading || (ja.isLoading && !ja.data) ? <Spinner /> : null}
      <div className={styles.list}>
        {zoneRows.map((row, rowIdx) => {
          if (row.kind === 'group') {
            return (
              <h2 key={`grp-${row.id}-${rowIdx}`} className={styles.groupHeading}>
                Group {row.id}
              </h2>
            )
          }
          const sid = row.sid
          const nameBase = snames[sid] ?? `Station ${sid + 1}`
          const on = sn[sid] === 1
          const psRow = ps?.[sid]
          const disabled = isStationDisabled(stnDis, sid)

          return (
            <ZoneCard
              key={sid}
              sid={sid}
              nameBase={nameBase}
              displayName={appPrefs.showStationNum ? `${sid + 1}. ${nameBase}` : nameBase}
              on={on}
              disabled={disabled}
              queueRow={psRow && psRow[0] !== 0 ? psRow : null}
              queueSource={
                psRow && psRow[0] !== 0 ? queueSourceLabel(psRow[0], pd, quickRunPid) : null
              }
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
              onToggleDisabled={() => {
                if (
                  !disabled &&
                  !window.confirm(
                    `Disable “${nameBase}”? It will not run from programs or manual start until you enable it again.`,
                  )
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
              onRename={(next) =>
                runAction(
                  () => changeStations.mutateAsync({ [`s${sid}`]: next }),
                  `Zone ${sid + 1} name saved.`,
                )
              }
              stationsBlock={ja.data?.stations}
              stationsError={ja.isError}
              jeRow={je.data ? jeEntryForSid(je.data, sid) : null}
              jeHasAny={Boolean(je.isSuccess && je.data && Object.keys(je.data).length > 0)}
            />
          )
        })}
      </div>
    </div>
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
  durationSec: number
  onDurationChange: (seconds: number) => void
  starting: boolean
  startBlocked: boolean
  stopBlocked: boolean
  stationsPending: boolean
  onStart: () => void
  onStop: () => void
  onToggleDisabled: () => void
  onRename: (name: string) => Promise<boolean>
  stationsBlock: JsonAll['stations'] | undefined
  stationsError: boolean
  jeRow: Record<string, unknown> | null
  jeHasAny: boolean
}

/** One zone: status + start/stop up front; rename, enable/disable and attributes tucked away. */
function ZoneCard({
  sid,
  nameBase,
  displayName,
  on,
  disabled,
  queueRow,
  queueSource,
  durationSec,
  onDurationChange,
  starting,
  startBlocked,
  stopBlocked,
  stationsPending,
  onStart,
  onStop,
  onToggleDisabled,
  onRename,
  stationsBlock,
  stationsError,
  jeRow,
  jeHasAny,
}: ZoneCardProps) {
  const isPreset = (DURATION_PRESETS as readonly number[]).includes(durationSec)
  const [customOpen, setCustomOpen] = useState(!isPreset)
  const [editOpen, setEditOpen] = useState(false)
  const [nameDraft, setNameDraft] = useState<string | null>(null)
  const queued = queueRow !== null && !on

  // Running wins over Disabled so a zone switched off mid-run still shows (and offers) Stop.
  const statusClass = on
    ? styles.statusRunning
    : disabled
      ? styles.statusDisabled
      : queued
        ? styles.statusQueued
        : styles.statusIdle

  return (
    <section
      className={[styles.zone, disabled ? styles.zoneDisabled : '', on ? styles.zoneRunning : '']
        .filter(Boolean)
        .join(' ')}
      aria-labelledby={`zone-name-${sid}`}
    >
      <div className={styles.zoneHead}>
        <div className={styles.zoneHeadText}>
          <h2 id={`zone-name-${sid}`} className={styles.zoneName}>{displayName}</h2>
          <p className={styles.zoneStatus}>
            <span className={`${styles.statusBadge} ${statusClass}`}>
              {on ? (
                <PlayCircle size={13} aria-hidden />
              ) : disabled ? null : queued ? (
                <Clock3 size={13} aria-hidden />
              ) : (
                <CircleDot size={13} aria-hidden />
              )}
              {on ? 'Running' : disabled ? 'Disabled' : queued ? 'Queued' : 'Idle'}
            </span>
            {queueRow && (on || !disabled) ? (
              <span className={styles.statusDetail}>
                {queueSource ? `${queueSource} · ` : null}
                {formatDuration(queueRow[1])} left
              </span>
            ) : null}
          </p>
        </div>
        <OverflowMenu
          label={`Actions for ${displayName}`}
          items={[
            {
              label: editOpen ? 'Close editor' : 'Rename & attributes',
              onSelect: () => setEditOpen((v) => !v),
            },
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
        <div className={styles.runRow}>
          <Button
            variant="secondary"
            className={styles.runBtn}
            disabled={stopBlocked}
            startIcon={<Square size={15} aria-hidden />}
            onClick={onStop}
          >
            Stop
          </Button>
        </div>
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
                  {sec / 60} min
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
          <div className={styles.runRow}>
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
        </div>
      )}

      {editOpen ? (
        <div className={styles.edit}>
          <form
            className={styles.nameEdit}
            onSubmit={(e) => {
              e.preventDefault()
              const next = (nameDraft ?? nameBase).trim()
              if (!next) return
              void onRename(next).then((ok) => {
                if (ok) setNameDraft(null)
              })
            }}
          >
            <Label htmlFor={`n-${sid}`}>Zone name</Label>
            <div className={styles.nameRow}>
              <Input
                id={`n-${sid}`}
                className={styles.nameInput}
                value={nameDraft ?? nameBase}
                onChange={(e) => setNameDraft(e.target.value)}
                maxLength={32}
                autoComplete="off"
              />
              <Button
                type="submit"
                variant="secondary"
                className={styles.nameSaveBtn}
                disabled={stationsPending}
              >
                Save name
              </Button>
            </div>
          </form>
          <StationAttributes
            sid={sid}
            stationsBlock={stationsBlock}
            stationsError={stationsError}
            jeRow={jeRow}
            jeHasAny={jeHasAny}
          />
        </div>
      ) : null}
    </section>
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
    ) : null
  }
  const parallelGroup = Boolean(stationsBlock?.stn_grp && stationsBlock.stn_grp.length > sid)
  const flags = [
    attr.master1 && 'Master station 1',
    attr.master2 && 'Master station 2',
    attr.ignoreRain && 'Ignore rain',
    attr.ignoreSn1 && 'Ignore sensor 1',
    attr.ignoreSn2 && 'Ignore sensor 2',
    attr.sequential ? 'Sequential' : parallelGroup && 'Parallel group',
    attr.special && 'Special station type',
    attr.actRelay && 'Activate relay',
  ].filter((f): f is string => Boolean(f))

  return (
    <div className={styles.attrs}>
      <p className={styles.attrsTitle}>Station attributes</p>
      <ul className={styles.attrChipList} aria-label="Station attribute flags from controller">
        {(flags.length ? flags : ['No extra flags set']).map((f) => (
          <li key={f}>
            <span className={styles.attrChip}>{f}</span>
          </li>
        ))}
      </ul>
      {jeRow ? (
        <>
          <p className={styles.jeHint}>
            Extension and RF payload for this zone (when the device provides it):
          </p>
          <pre className={styles.jePre}>{JSON.stringify(jeRow, null, 2)}</pre>
        </>
      ) : jeHasAny ? (
        <p className={styles.jeHint}>No extension payload for this zone.</p>
      ) : null}
    </div>
  )
}

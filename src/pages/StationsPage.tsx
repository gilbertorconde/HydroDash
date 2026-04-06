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
import { getStationAttrLabels, jeEntryForSid } from '../lib/stationAttrs'
import { Card, Button, Input, Label, Spinner, ErrorBox } from '../components/ui'
import { DurationInput } from '../components/DurationInput'
import { CONTROLLER_ACTION_UI_TIMEOUT_MS } from '../lib/opensprinklerRuntime'
import { isStationDisabled } from '../lib/stationDis'
import { useAppPreferences } from '../lib/appPreferences'
import { CircleDot, Clock3, ListOrdered, Play, PlayCircle, Timer } from 'lucide-react'
import styles from './StationsPage.module.css'

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
  const [nameEdits, setNameEdits] = useState<Record<number, string>>({})
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

  async function runAction(task: () => Promise<unknown>, successMessage: string) {
    setActionErr(null)
    setActionMsg(null)
    try {
      await task()
      setActionMsg(successMessage)
    } catch (e) {
      setActionErr(e instanceof Error ? e.message : 'Zone action failed')
    }
  }

  function durFor(sid: number) {
    return Math.min(64800, Math.max(1, durations[sid] ?? 300))
  }

  return (
    <div>
      <h1 className={styles.title}>Zones</h1>
      {errMsg ? <ErrorBox message={errMsg} /> : null}
      {actionErr ? <ErrorBox message={actionErr} /> : null}
      {actionMsg ? <p className={styles.ok}>{actionMsg}</p> : null}
      <p className={styles.hint}>
        Start any zone manually by setting a duration and pressing <strong>Start</strong>.
      </p>
      <div className={styles.topActions}>
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
          const name = appPrefs.showStationNum ? `${sid + 1}. ${nameBase}` : nameBase
          const stationsBlock = ja.data?.stations
          const attr = stationsBlock ? getStationAttrLabels(sid, stationsBlock) : null
          const jeRow = je.data ? jeEntryForSid(je.data, sid) : null
          const on = sn[sid] === 1
          const startingThisZone = startingSid === sid && !on
          const zoneStartBlocked =
            manual.isPending || (startingSid !== null && !on)
          const ps = jc.data?.ps as [number, number, number, number][] | undefined
          const psRow = ps?.[sid]
          const queued = psRow && psRow[0] !== 0 && !on
          const disabled = isStationDisabled(stnDis, sid)

          const nboards = jc.data?.nbrd ? Number(jc.data.nbrd) : Math.max(1, Math.ceil(n / 8))

          return (
            <Card
              key={sid}
              title={name}
              bodyClassName={disabled ? styles.cardMuted : undefined}
              titleAction={
                <Button
                  variant={disabled ? 'cta' : 'danger'}
                  className={styles.cardHeaderToggle}
                  disabled={changeStations.isPending}
                  onClick={() =>
                    runAction(
                      () =>
                        changeStations.mutateAsync(
                          buildStationDisablePayload(stnDis, sid, !disabled, nboards),
                        ),
                      !disabled ? `Zone ${sid + 1} disabled.` : `Zone ${sid + 1} enabled.`,
                    )
                  }
                >
                  {disabled ? 'Enable zone' : 'Disable zone'}
                </Button>
              }
            >
              <div className={styles.zoneSummaryBar}>
                <span
                  className={disabled ? styles.zoneStatusDisabled : styles.zoneStatusEnabled}
                  title={
                    disabled
                      ? 'This zone is turned off and will not run from programs or manual start.'
                      : 'This zone can run from programs or when you press Start.'
                  }
                >
                  {disabled ? 'Disabled' : 'Enabled'}
                </span>
                <span className={styles.zoneSummaryDivider} aria-hidden />
                {!disabled ? (
                  <div className={styles.zoneSummaryChipsWrap}>
                    <span className={styles.zoneSummaryLabel}>Right now</span>
                    <ul className={styles.zoneSummaryList} aria-label="Current zone activity">
                      <li>
                        <span
                          className={`${styles.summaryChip} ${
                            on
                              ? styles.summaryChipStateRunning
                              : queued
                                ? styles.summaryChipStateQueued
                                : styles.summaryChipStateIdle
                          }`}
                        >
                          {on ? (
                            <>
                              <PlayCircle className={styles.summaryChipIcon} size={13} aria-hidden />
                              Running
                            </>
                          ) : queued ? (
                            <>
                              <Clock3 className={styles.summaryChipIcon} size={13} aria-hidden />
                              Queued
                            </>
                          ) : (
                            <>
                              <CircleDot className={styles.summaryChipIcon} size={13} aria-hidden />
                              Idle
                            </>
                          )}
                        </span>
                      </li>
                      {psRow && psRow[0] !== 0 ? (
                        <li>
                          <span className={styles.summaryChip}>
                            <Timer className={styles.summaryChipIcon} size={13} aria-hidden />
                            {formatDuration(psRow[1])} left
                          </span>
                        </li>
                      ) : null}
                      {queued && psRow && psRow[0] !== 0 ? (
                        <li>
                          <span className={styles.summaryChip}>
                            <ListOrdered className={styles.summaryChipIcon} size={13} aria-hidden />
                            Program {psRow[0]}
                          </span>
                        </li>
                      ) : null}
                    </ul>
                  </div>
                ) : (
                  <div className={styles.zoneSummaryChipsWrap}>
                    <span className={styles.zoneSummaryLabel}>Right now</span>
                    <p className={styles.zoneSummaryHint}>
                      Not available until you enable this zone.
                    </p>
                  </div>
                )}
              </div>
              <div className={styles.zoneCardBody}>
                <div className={styles.zoneCardColMain}>
                  <p className={styles.zoneSectionTitle}>Details</p>
                  <div className={styles.nameEdit}>
                    <Label htmlFor={`n-${sid}`}>Zone name</Label>
                    <div className={styles.nameRow}>
                      <Input
                        id={`n-${sid}`}
                        className={styles.nameInput}
                        value={nameEdits[sid] ?? name}
                        onChange={(e) =>
                          setNameEdits((d) => ({ ...d, [sid]: e.target.value }))
                        }
                        maxLength={32}
                      />
                      <Button
                        variant="secondary"
                        className={styles.nameSaveBtn}
                        disabled={changeStations.isPending}
                        onClick={() =>
                          runAction(
                            () => changeStations.mutateAsync({ [`s${sid}`]: nameEdits[sid] ?? name }),
                            `Zone ${sid + 1} name saved.`,
                          )
                        }
                      >
                        Save name
                      </Button>
                    </div>
                  </div>
                  <div className={styles.dur}>
                    <Label htmlFor={`d-${sid}-h`}>Manual run duration</Label>
                    <DurationInput
                      idBase={`d-${sid}`}
                      valueSeconds={durFor(sid)}
                      maxSeconds={64800}
                      onChange={(seconds) =>
                        setDurations((d) => ({ ...d, [sid]: seconds }))
                      }
                    />
                    <p className={styles.durationHint}>
                      Applies when you press Start. Now set to {formatDuration(durFor(sid))}.
                    </p>
                  </div>
                </div>
                <aside className={styles.zoneCardColRun} aria-label="Manual watering">
                  <p className={styles.zoneSectionTitle}>Manual run</p>
                  <div className={styles.zoneRunPanel}>
                    {!on ? (
                      <Button
                        className={styles.zoneRunPrimary}
                        disabled={disabled || zoneStartBlocked}
                        aria-busy={startingThisZone}
                        startIcon={
                          startingThisZone ? (
                            <Spinner />
                          ) : (
                            <Play size={18} strokeWidth={2.25} aria-hidden />
                          )
                        }
                        onClick={() =>
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
                      >
                        {startingThisZone ? 'Starting…' : 'Start watering'}
                      </Button>
                    ) : (
                      <Button
                        variant="secondary"
                        className={styles.zoneRunPrimary}
                        disabled={manual.isPending}
                        onClick={() =>
                          runAction(
                            () =>
                              manual.mutateAsync({
                                sid,
                                en: 0,
                              }),
                            `Zone ${sid + 1} stopped.`,
                          )
                        }
                      >
                        Stop
                      </Button>
                    )}
                    <p className={styles.zoneRunHint}>
                      {disabled
                        ? 'Enable the zone from the header to run it manually.'
                        : on
                          ? 'Stops this zone only.'
                          : 'Uses the duration you set on the left.'}
                    </p>
                  </div>
                </aside>
              </div>
              {attr ? (
                <details className={styles.stationAdv}>
                  <summary className={styles.stationAdvSummary}>
                    Station attributes (master, rain, sequential)
                  </summary>
                  <div className={styles.stationAdvBody}>
                    <ul className={styles.attrChipList} aria-label="Station attribute flags from controller">
                      {attr.master1 ? (
                        <li>
                          <span className={styles.attrChip}>Master station 1</span>
                        </li>
                      ) : null}
                      {attr.master2 ? (
                        <li>
                          <span className={styles.attrChip}>Master station 2</span>
                        </li>
                      ) : null}
                      {attr.ignoreRain ? (
                        <li>
                          <span className={styles.attrChip}>Ignore rain</span>
                        </li>
                      ) : null}
                      {attr.ignoreSn1 ? (
                        <li>
                          <span className={styles.attrChip}>Ignore sensor 1</span>
                        </li>
                      ) : null}
                      {attr.ignoreSn2 ? (
                        <li>
                          <span className={styles.attrChip}>Ignore sensor 2</span>
                        </li>
                      ) : null}
                      {attr.sequential ? (
                        <li>
                          <span className={styles.attrChip}>Sequential</span>
                        </li>
                      ) : stationsBlock?.stn_grp && stationsBlock.stn_grp.length > sid ? (
                        <li>
                          <span className={styles.attrChip}>Parallel group</span>
                        </li>
                      ) : null}
                      {attr.special ? (
                        <li>
                          <span className={styles.attrChip}>Special station type</span>
                        </li>
                      ) : null}
                      {attr.actRelay ? (
                        <li>
                          <span className={styles.attrChip}>Activate relay</span>
                        </li>
                      ) : null}
                      {!attr.master1 &&
                      !attr.master2 &&
                      !attr.ignoreRain &&
                      !attr.ignoreSn1 &&
                      !attr.ignoreSn2 &&
                      !attr.sequential &&
                      !(stationsBlock?.stn_grp && stationsBlock.stn_grp.length > sid) &&
                      !attr.special &&
                      !attr.actRelay ? (
                        <li>
                          <span className={styles.attrChip}>No extra flags set</span>
                        </li>
                      ) : null}
                    </ul>
                    {jeRow ? (
                      <>
                        <p className={styles.jeHint}>
                          Extension and RF payload for this zone (when the device provides it):
                        </p>
                        <pre className={styles.jePre}>{JSON.stringify(jeRow, null, 2)}</pre>
                      </>
                    ) : je.isSuccess && je.data && Object.keys(je.data).length > 0 ? (
                      <p className={styles.jeHint}>No extension payload for this zone.</p>
                    ) : null}
                  </div>
                </details>
              ) : ja.isError ? (
                <p className={styles.zoneRunHint}>
                  Could not load full station flags from the device. Names and manual run still work.
                </p>
              ) : null}
            </Card>
          )
        })}
      </div>
    </div>
  )
}

import { useCallback, useMemo, useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import {
  useController,
  useJsonAll,
  useChangeValues,
  useLatestOpenSprinklerFirmwareRelease,
  usePauseQueue,
  useLogs,
  useManualStation,
  useRunProgram,
  useStationStatus,
  useStationsMeta,
} from '../api/hooks'
import type { JsonAll, ProgramRow } from '../api/types'
import { OpenSprinklerApiError, OpenSprinklerHttpError } from '../api/client'
import { ErrorBox, PageBody } from '../components/ui'
import { useConfirm } from '../components/confirmContext'
import { useToast } from '../components/toastContext'
import { useAppPreferences } from '../lib/appPreferences'
import {
  HOME_WIDE_CARDS,
  useHomeCardOrder,
  useHomeCardVisibility,
  visibleHomeCardIds,
  type HomeCardId,
} from '../lib/homeDashboardLayout'
import { parseLogEntries } from '../lib/irrigationLog'
import { deviceFirmwareIsOlderThanRelease } from '../lib/opensprinklerFirmwareRelease'
import {
  isProgramActiveOnController,
  readQuickRunManualPid,
  stationMatchesProgramRuntime,
  writeQuickRunManualPid,
} from '../lib/opensprinklerRuntime'
import { flagEnabled, flagUseWeather } from '../lib/programCodec'
import { isStationDisabled } from '../lib/stationDis'
import { normalizeWeatherProviderId, providerById, wtoRecord } from '../lib/weatherProviders'
import {
  buildNowRunning,
  ConditionsCard,
  ControllerCard,
  countWateringZones,
  CustomizeHome,
  findUpcomingRuns,
  HomeHero,
  jlRangeLastTwoDays,
  masterStationIds,
  programWatersEnabledStation,
  ProgramsCard,
  RainDelayCard,
  RecentActivityCard,
  UpNextCard,
  weatherServiceNameFromWtdata,
  type NextScheduledRun,
  type RunnableProgram,
  type RunningZone,
} from '../components/widgets'
import styles from './DashboardPage.module.css'

const PROGRAMS_CARD_ID = 'home-programs'

export function DashboardPage() {
  const ja = useJsonAll()
  const jc = useController(5000)
  const jn = useStationsMeta()
  const cv = useChangeValues()
  const pq = usePauseQueue()
  const confirm = useConfirm()
  const toast = useToast()
  const runProgram = useRunProgram()
  const manual = useManualStation()
  const js = useStationStatus(5000)
  const prefs = useAppPreferences()
  const navigate = useNavigate()

  const cardOrder = useHomeCardOrder()
  const cardVisibility = useHomeCardVisibility()
  const visibleCards = useMemo(
    () => visibleHomeCardIds(cardVisibility, cardOrder),
    [cardVisibility, cardOrder],
  )

  const jlRange = jlRangeLastTwoDays()
  const logs = useLogs(jlRange.start, jlRange.end, true)

  const stationNames = useMemo(
    () => (jn.data?.snames as string[] | undefined) ?? ja.data?.stations?.snames ?? [],
    [jn.data?.snames, ja.data?.stations?.snames],
  )
  const pd = useMemo(
    () => (ja.data?.programs?.pd as ProgramRow[] | undefined) ?? [],
    [ja.data?.programs?.pd],
  )
  const stnDis = jn.data?.stn_dis as number[] | undefined
  const optionsBlock = ja.data?.options as JsonAll['options'] | undefined
  const opts = optionsBlock as Record<string, unknown> | undefined
  const nSta =
    stationNames.length ||
    (pd[0]?.[4]?.length ?? 0) ||
    8

  /**
   * `/mp` (Quick Run) enqueues with firmware `q->pid = 254`, so `/jc` `ps[s][0]` never equals
   * the real program index. We remember which program we started and treat `ps[s][0] >= 99`
   * as that manual queue when matching stations. See `opensprinklerRuntime.ts`.
   */
  const [manualQuickRunPid, setManualQuickRunPid] = useState<number | null>(() =>
    readQuickRunManualPid(),
  )

  const rawLogEntries = useMemo(() => (logs.data ?? []) as unknown[], [logs.data])
  const logEvents = useMemo(
    () => parseLogEntries(rawLogEntries, stationNames, optionsBlock),
    [rawLogEntries, stationNames, optionsBlock],
  )
  const historyPreview = useMemo(() => [...logEvents].reverse().slice(0, 28), [logEvents])

  const runnablePrograms = useMemo(() => {
    const out: RunnableProgram[] = []
    for (let pid = 0; pid < pd.length; pid++) {
      const prog = pd[pid]
      if (!prog) continue
      const flag = prog[0]
      if (!flagEnabled(flag)) continue
      if (!programWatersEnabledStation(prog, stnDis, nSta)) continue
      let sec = 0
      for (let i = 0; i < nSta && i < prog[4].length; i++) {
        if (!isStationDisabled(stnDis, i)) sec += Math.max(0, prog[4][i] ?? 0)
      }
      out.push({
        pid,
        name: prog[5]?.trim() ? prog[5] : `Program ${pid + 1}`,
        zones: countWateringZones(prog, stnDis, nSta),
        minutes: Math.max(1, Math.round(sec / 60)),
        uwt: flagUseWeather(flag) ? 1 : 0,
      })
    }
    return out
  }, [pd, stnDis, nSta])

  const runningQuickRunPids = useMemo(() => {
    const ps = jc.data?.ps as [number, number, number, number][] | undefined
    const sn = js.data?.sn ?? []
    const next = new Set<number>()
    for (let pid = 0; pid < pd.length; pid++) {
      if (isProgramActiveOnController(pid, pd, ps, sn, nSta, manualQuickRunPid)) {
        next.add(pid)
      }
    }
    return next
  }, [pd, jc.data?.ps, js.data?.sn, nSta, manualQuickRunPid])

  const masters = useMemo(() => masterStationIds(opts), [opts])
  const nowRunning = useMemo(
    () =>
      buildNowRunning({
        jc: jc.data,
        sn: js.data?.sn ?? [],
        stationNames,
        pd,
        nSta,
        masters,
        manualQuickRunPid,
      }),
    [jc.data, js.data?.sn, stationNames, pd, nSta, masters, manualQuickRunPid],
  )

  const devt = typeof jc.data?.devt === 'number' ? jc.data.devt : undefined
  /** Minute resolution is enough for the schedule; avoids recomputing on every 5 s poll. */
  const devtMinute = devt ? Math.floor(devt / 60) * 60 : undefined
  const sunrise = Number(jc.data?.sunrise ?? 360)
  const sunset = Number(jc.data?.sunset ?? 1080)
  const upcoming = useMemo(
    () => findUpcomingRuns(pd, devtMinute, sunrise, sunset, 60),
    [pd, devtMinute, sunrise, sunset],
  )
  const nextByPid = useMemo(() => {
    const m = new Map<number, NextScheduledRun>()
    for (const r of upcoming) if (!m.has(r.pid)) m.set(r.pid, r)
    return m
  }, [upcoming])

  const stopProgramStations = useCallback(
    async (pid: number) => {
      const prog = pd[pid]
      if (!prog) return
      const ps = jc.data?.ps as [number, number, number, number][] | undefined
      const sn = js.data?.sn ?? []
      const tasks: Promise<unknown>[] = []
      for (let sid = 0; sid < nSta; sid++) {
        if (!stationMatchesProgramRuntime(pid, sid, pd, ps, sn, manualQuickRunPid)) continue
        tasks.push(manual.mutateAsync({ sid, en: 0 }))
      }
      await Promise.all(tasks)
      setManualQuickRunPid((m) => {
        if (m !== pid) return m
        writeQuickRunManualPid(null)
        return null
      })
    },
    [pd, jc.data?.ps, js.data?.sn, nSta, manual, manualQuickRunPid],
  )

  const err = ja.error || jc.error || null
  const msg =
    err instanceof OpenSprinklerApiError
      ? `API error ${err.code} (${err.message})`
      : err instanceof OpenSprinklerHttpError
        ? err.message
        : err instanceof Error
          ? err.message
          : null

  const fwv = opts?.fwv
  const fwm = opts?.fwm
  const deviceFwv = typeof fwv === 'number' && Number.isFinite(fwv) ? fwv : null
  const deviceFwm = typeof fwm === 'number' && Number.isFinite(fwm) ? fwm : null
  const firmwareGithub = useLatestOpenSprinklerFirmwareRelease(
    ja.isSuccess && deviceFwv != null && deviceFwm != null,
  )
  const controllerFirmwareUpdate = useMemo(() => {
    const info = firmwareGithub.data
    if (
      !info ||
      deviceFwv == null ||
      deviceFwm == null ||
      !deviceFirmwareIsOlderThanRelease({ fwv: deviceFwv, fwm: deviceFwm }, info.parsed)
    ) {
      return null
    }
    return { versionLabel: info.versionLabel, releaseUrl: info.htmlUrl }
  }, [firmwareGithub.data, deviceFwv, deviceFwm])

  const controllerFirmwareUpToDate = useMemo(() => {
    if (!firmwareGithub.isSuccess || !firmwareGithub.data || deviceFwv == null || deviceFwm == null) {
      return false
    }
    return !deviceFirmwareIsOlderThanRelease(
      { fwv: deviceFwv, fwm: deviceFwm },
      firmwareGithub.data.parsed,
    )
  }, [firmwareGithub.isSuccess, firmwareGithub.data, deviceFwv, deviceFwm])

  const jaSettings = ja.data?.settings as Record<string, unknown> | undefined
  const wto = wtoRecord(jc.data?.wto ?? jaSettings?.wto)
  const providerId = normalizeWeatherProviderId(wto.provider)
  const providerLabel = providerById(providerId)?.name ?? providerId
  const weatherServiceRunning = weatherServiceNameFromWtdata(jc.data?.wtdata ?? jaSettings?.wtdata)

  /** Runs a controller action and reports the result as a toast. */
  async function runAction(task: () => Promise<unknown>, successMessage: string) {
    try {
      await task()
      toast.success(successMessage)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Controller action failed')
    }
  }

  const s = jc.data
  const enabled = Boolean(s?.en ?? 1)
  const paused = Boolean(s?.pq)
  const rainDelayActive = Boolean(s?.rd)
  const rdst = typeof s?.rdst === 'number' && s.rdst > 0 ? s.rdst : null
  const busy = cv.isPending || pq.isPending || manual.isPending

  const setRainDelay = (hours: number) =>
    runAction(
      () => cv.mutateAsync({ rd: hours }),
      hours === 0 ? 'Rain delay cleared.' : `Rain delay set for ${hours} h.`,
    )

  const heroHandlers = {
    onStopZones: (zones: RunningZone[]) =>
      runAction(
        () => Promise.all(zones.map((z) => manual.mutateAsync({ sid: z.sid, en: 0 }))),
        zones.length === 1 ? `${zones[0].name} stopped.` : `${zones.length} zones stopped.`,
      ),
    onPauseToggle: async () => {
      if (paused) {
        void runAction(() => pq.mutateAsync({ dur: 1 }), 'Watering resumed.')
      } else if (
        await confirm({
          title: 'Pause watering for 10 minutes?',
          message: 'Running and queued zones hold until the pause ends or you resume.',
          confirmLabel: 'Pause',
        })
      ) {
        void runAction(() => pq.mutateAsync({ dur: 600 }), 'Queue paused for 10 minutes.')
      }
    },
    onStopRunning: () =>
      void runAction(() => cv.mutateAsync({ rrsn: 1 }), 'Running zones stopped; the queue continues.'),
    onStopAll: async () => {
      const ok = await confirm({
        title: 'Stop all zones?',
        message: 'Every running and queued zone stops and the queue is cleared.',
        confirmLabel: 'Stop all',
        tone: 'danger',
      })
      if (!ok) return
      void runAction(() => cv.mutateAsync({ rsn: 1 }), 'All zones stopped and queue cleared.')
    },
    onToggleEnabled: async () => {
      if (
        enabled &&
        !(await confirm({
          title: 'Disable the controller?',
          message: 'Scheduled programs will not run until it is enabled again.',
          confirmLabel: 'Disable',
          tone: 'danger',
        }))
      ) {
        return
      }
      void runAction(
        () => cv.mutateAsync({ en: enabled ? 0 : 1 }),
        enabled ? 'Controller disabled.' : 'Controller enabled.',
      )
    },
    onClearRainDelay: () => void setRainDelay(0),
    onRunProgram: () => {
      const el = document.getElementById(PROGRAMS_CARD_ID)
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' })
      else void navigate({ to: '/programs' })
    },
  }

  function renderCard(id: HomeCardId) {
    const className = HOME_WIDE_CARDS.has(id) ? styles.wide : undefined
    switch (id) {
      case 'upnext':
        return (
          <UpNextCard
            key={id}
            className={className}
            loading={jc.isLoading && !jc.data}
            queued={nowRunning.queued}
            upcoming={upcoming.slice(0, 8)}
            is24Hour={prefs.is24Hour}
          />
        )
      case 'conditions':
        return (
          <ConditionsCard
            key={id}
            className={className}
            jc={s}
            options={opts}
            isMetric={prefs.isMetric}
            is24Hour={prefs.is24Hour}
          />
        )
      case 'raindelay':
        return (
          <RainDelayCard
            key={id}
            className={className}
            loading={jc.isLoading && !jc.data}
            active={rainDelayActive}
            until={rdst}
            devt={devt}
            is24Hour={prefs.is24Hour}
            busy={cv.isPending}
            onSet={(h) => void setRainDelay(h)}
          />
        )
      case 'programs':
        return (
          <ProgramsCard
            key={id}
            id={PROGRAMS_CARD_ID}
            className={className}
            loading={ja.isLoading && !ja.data}
            runnablePrograms={runnablePrograms}
            runningPids={runningQuickRunPids}
            nextByPid={nextByPid}
            is24Hour={prefs.is24Hour}
            runProgram={runProgram}
            stopProgramStations={stopProgramStations}
            stopMutationPending={manual.isPending}
            runAction={runAction}
            onQuickRunStarted={(pid: number) => {
              setManualQuickRunPid(pid)
              writeQuickRunManualPid(pid)
            }}
          />
        )
      case 'history':
        return (
          <RecentActivityCard
            key={id}
            className={className}
            logs={logs}
            logEvents={logEvents}
            historyPreview={historyPreview}
            devt={devt}
            is24Hour={prefs.is24Hour}
          />
        )
      case 'controller':
        return (
          <ControllerCard
            key={id}
            className={className}
            loading={ja.isLoading && !ja.data}
            connected={ja.isSuccess && !jc.isError}
            jc={s}
            fwv={fwv}
            fwm={fwm}
            firmwareUpdate={controllerFirmwareUpdate}
            firmwareUpToDate={controllerFirmwareUpToDate}
            programCount={ja.data?.programs?.nprogs}
            stationCount={ja.data?.status?.nstations}
            stationNames={stationNames}
            providerLabel={providerLabel}
            providerId={providerId}
            weatherServiceRunning={weatherServiceRunning}
            is24Hour={prefs.is24Hour}
          />
        )
      default:
        return null
    }
  }

  return (
    <>
      <HomeHero
        loading={jc.isLoading && !jc.data}
        offline={!s && jc.isError}
        running={nowRunning.running}
        queued={nowRunning.queued}
        fetchedAt={jc.dataUpdatedAt}
        devt={devt}
        enabled={enabled}
        paused={paused}
        pauseLeftSec={Number(s?.pt ?? 0)}
        rainDelayUntil={rainDelayActive ? (rdst ?? devt ?? 0) : null}
        next={upcoming[0] ?? null}
        is24Hour={prefs.is24Hour}
        busy={busy}
        {...heroHandlers}
      />
      <PageBody>
        {msg ? <ErrorBox message={msg} /> : null}
        {visibleCards.length > 0 ? (
          <div className={styles.grid}>{visibleCards.map(renderCard)}</div>
        ) : null}
        <CustomizeHome order={cardOrder} visibility={cardVisibility} />
      </PageBody>
    </>
  )
}

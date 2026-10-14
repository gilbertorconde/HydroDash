import { useCallback, useMemo, useState } from 'react'
import {
  GridLayout,
  useContainerWidth,
  cloneLayout,
  verticalCompactor,
  getBreakpointFromWidth,
} from 'react-grid-layout'
import type { Layout } from 'react-grid-layout'
import 'react-grid-layout/css/styles.css'
import 'react-resizable/css/styles.css'
import { Check, Settings } from 'lucide-react'
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
import { ErrorBox, Button, Card } from '../components/ui'
import { formatEpochSecondsLocale } from '../lib/formatLocale'
import { useAppPreferences } from '../lib/appPreferences'
import {
  HOME_RGL_BREAKPOINTS,
  HOME_RGL_COLS,
  HOME_TILE_FALLBACK_PX,
  HOME_TILE_GAP_PX,
  HOME_TILE_IDS,
  HOME_TILE_MAX_H_BOUNDS,
  type HomeTileId,
  clearHomeTileMaxHeights,
  persistHomeBreakpointLayout,
  persistHomeTileMaxHeight,
  resetHomeLayouts,
  toggleHomeTileVisibility,
  useHomeLayouts,
  useHomeTileMaxHeights,
  useHomeTileOrder,
  useHomeTileVisibility,
  visibleHomeTileIds,
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
import { normalizeWeatherProviderId, providerById, wtoRecord } from '../lib/weatherProviders'
import {
  buildNowRunning,
  ControllerWidget,
  countWateringZones,
  DashboardTile,
  DASHBOARD_TILE_TITLES,
  findNextScheduledRun,
  HistoryWidget,
  jlRangeLastTwoDays,
  LiveStatusWidget,
  masterStationIds,
  NowRunningWidget,
  programWatersEnabledStation,
  QuickRunWidget,
  RGL_DRAG_HANDLE_CLASS,
  SensorsWidget,
  weatherServiceNameFromWtdata,
} from '../components/widgets'
import styles from './DashboardPage.module.css'
import widgetStyles from '../components/widgets/dashboardWidgets.module.css'

export function DashboardPage() {
  const ja = useJsonAll()
  const jc = useController(5000)
  const jn = useStationsMeta()
  const cv = useChangeValues()
  const pq = usePauseQueue()
  const runProgram = useRunProgram()
  const manual = useManualStation()
  const js = useStationStatus(5000)
  const prefs = useAppPreferences()

  const layoutsFromStore = useHomeLayouts()
  const visibility = useHomeTileVisibility()
  const tileOrder = useHomeTileOrder()
  const tileMaxHeights = useHomeTileMaxHeights()
  const visibleIds = useMemo(
    () => visibleHomeTileIds(visibility, tileOrder),
    [visibility, tileOrder],
  )
  const visibleCount = useMemo(
    () => HOME_TILE_IDS.filter((id) => visibility[id]).length,
    [visibility],
  )

  /** Customize mode: drag grips, height controls and the tile picker are only shown here. */
  const [editing, setEditing] = useState(false)

  const { width, containerRef, mounted } = useContainerWidth({ initialWidth: 1280 })
  /** Avoid width 0 / tiny first frames breaking breakpoint math and grid column width. */
  const gridWidth = Math.max(1, width)

  /** Compute breakpoint + cols directly — avoids useResponsiveLayout's stale initialBreakpoint. */
  const breakpoint = useMemo(
    () => getBreakpointFromWidth(HOME_RGL_BREAKPOINTS, gridWidth),
    [gridWidth],
  )
  const cols = HOME_RGL_COLS[breakpoint as keyof typeof HOME_RGL_COLS] ?? 12
  /** Single column (phones): tiles always fit their content, no caps / inner scroll. */
  const singleColumn = cols === 1

  /** Measured card heights (px) reported by each tile; drives the grid row spans. */
  const [tileHeights, setTileHeights] = useState<Partial<Record<string, number>>>({})
  const onTileContentHeight = useCallback((id: string, px: number) => {
    setTileHeights((prev) => (prev[id] === px ? prev : { ...prev, [id]: px }))
  }, [])

  /**
   * Stored positions (x/y/w) for the current breakpoint with heights from measurement.
   * The grid uses `rowHeight: 1` and no vertical margin, so `h` is the card height in px plus
   * the gap below it.
   */
  const layout = useMemo(() => {
    const raw = layoutsFromStore[breakpoint] ?? []
    const visibleSet = new Set<string>(visibleIds)
    const items = raw
      .filter((item) => visibleSet.has(item.i))
      .map((item) => {
        const px = tileHeights[item.i] ?? HOME_TILE_FALLBACK_PX[item.i as HomeTileId] ?? 200
        return { i: item.i, x: item.x, y: item.y, w: item.w, h: Math.max(1, px + HOME_TILE_GAP_PX) }
      })
    return verticalCompactor.compact(cloneLayout(items), cols)
  }, [layoutsFromStore, breakpoint, cols, visibleIds, tileHeights])

  const onGridDragStop = useCallback(
    (newLayout: Layout) => {
      persistHomeBreakpointLayout(layoutsFromStore, breakpoint, newLayout)
    },
    [layoutsFromStore, breakpoint],
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
    const out: { pid: number; name: string; zones: number; uwt: 0 | 1 }[] = []
    for (let pid = 0; pid < pd.length; pid++) {
      const prog = pd[pid]
      if (!prog) continue
      const flag = prog[0]
      if (!flagEnabled(flag)) continue
      if (!programWatersEnabledStation(prog, stnDis, nSta)) continue
      const zones = countWateringZones(prog, stnDis, nSta)
      out.push({
        pid,
        name: prog[5]?.trim() ? prog[5] : `Program ${pid + 1}`,
        zones,
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

  const masters = useMemo(
    () => masterStationIds(optionsBlock as Record<string, unknown> | undefined),
    [optionsBlock],
  )
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
  const nothingRunning = nowRunning.running.length === 0 && nowRunning.queued.length === 0
  const nextRun = useMemo(
    () =>
      nothingRunning
        ? findNextScheduledRun(
            pd,
            jc.data?.devt,
            Number(jc.data?.sunrise ?? 360),
            Number(jc.data?.sunset ?? 1080),
          )
        : null,
    [nothingRunning, pd, jc.data?.devt, jc.data?.sunrise, jc.data?.sunset],
  )

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

  function formatTime(epoch?: number) {
    if (epoch == null || epoch <= 0) return '—'
    return formatEpochSecondsLocale(epoch, { hour12: !prefs.is24Hour })
  }

  const err =
    ja.error || jc.error
      ? ja.error || jc.error
      : null

  const msg =
    err instanceof OpenSprinklerApiError
      ? `API error ${err.code} (${err.message})`
      : err instanceof OpenSprinklerHttpError
        ? err.message
        : err instanceof Error
          ? err.message
          : null

  const opts = ja.data?.options as Record<string, unknown> | undefined
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
  const settings = jc.data
  const [actionMsg, setActionMsg] = useState<string | null>(null)
  const [actionErr, setActionErr] = useState<string | null>(null)

  const jaSettings = ja.data?.settings as Record<string, unknown> | undefined
  const wtoRaw = jc.data?.wto ?? jaSettings?.wto
  const wto = wtoRecord(wtoRaw)
  const providerId = normalizeWeatherProviderId(wto.provider)
  const providerLabel = providerById(providerId)?.name ?? providerId
  const wtdataRaw = jc.data?.wtdata ?? jaSettings?.wtdata
  const weatherServiceRunning = weatherServiceNameFromWtdata(wtdataRaw)

  async function runAction(task: () => Promise<unknown>, successMessage: string) {
    setActionErr(null)
    setActionMsg(null)
    try {
      await task()
      setActionMsg(successMessage)
    } catch (e) {
      setActionErr(e instanceof Error ? e.message : 'Controller action failed')
    }
  }

  function renderTileBody(id: HomeTileId) {
    switch (id) {
      case 'running':
        return (
          <NowRunningWidget
            showSpinner={jc.isLoading && !jc.data}
            running={nowRunning.running}
            queued={nowRunning.queued}
            fetchedAt={jc.dataUpdatedAt}
            paused={Boolean(jc.data?.pq)}
            next={nextRun}
            is24Hour={prefs.is24Hour}
            stopPending={manual.isPending || cv.isPending}
            onStopZone={(z) =>
              runAction(() => manual.mutateAsync({ sid: z.sid, en: 0 }), `${z.name} stopped.`)
            }
            onStopAll={() => runAction(() => cv.mutateAsync({ rsn: 1 }), 'All zones stopped.')}
          />
        )
      case 'controller':
        return (
          <ControllerWidget
            ja={ja}
            fwv={fwv}
            fwm={fwm}
            firmwareUpdate={controllerFirmwareUpdate}
            firmwareUpToDate={controllerFirmwareUpToDate}
          />
        )
      case 'live':
        return (
          <LiveStatusWidget
            showSpinner={jc.isLoading && !jc.data}
            settings={settings}
            cv={cv}
            pq={pq}
            formatTime={formatTime}
            runAction={runAction}
          />
        )
      case 'sensors':
        return (
          <SensorsWidget
            settings={settings}
            providerLabel={providerLabel}
            providerId={providerId}
            weatherServiceRunning={weatherServiceRunning}
          />
        )
      case 'history':
        return (
          <HistoryWidget
            logs={logs}
            logEvents={logEvents}
            historyPreview={historyPreview}
            formatTime={formatTime}
          />
        )
      case 'quickrun':
        return (
          <QuickRunWidget
            ja={ja}
            runnablePrograms={runnablePrograms}
            runningPids={runningQuickRunPids}
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
      default:
        return null
    }
  }

  const customizePanel = editing ? (
    <Card className={styles.customizeCard} title="Customize Home">
      <p className={styles.customizeHint}>
        Drag the grip on a card to move it.
        {singleColumn
          ? ' Cards fit their content.'
          : ' Cards fit their content; the arrows button sets an optional maximum height.'}
      </p>
      <ul className={styles.visibilityList}>
        {tileOrder.map((id) => (
          <li key={id} className={styles.visibilityRow}>
            <label className={styles.visibilityLabel}>
              <input
                type="checkbox"
                checked={visibility[id]}
                disabled={visibility[id] && visibleCount <= 1}
                onChange={(e) => {
                  toggleHomeTileVisibility(visibility, id, e.target.checked)
                }}
              />
              <span>{DASHBOARD_TILE_TITLES[id]}</span>
            </label>
          </li>
        ))}
      </ul>
      <div className={styles.customizeActions}>
        <Button
          type="button"
          variant="ghost"
          onClick={() => {
            resetHomeLayouts(tileOrder)
            clearHomeTileMaxHeights()
          }}
        >
          Reset layout to defaults
        </Button>
        <Button type="button" variant="primary" onClick={() => setEditing(false)}>
          Done
        </Button>
      </div>
    </Card>
  ) : null

  return (
    <div>
      <header className={styles.hero}>
        <div className={styles.titleRow}>
          <h1 className={styles.title}>Home</h1>
          <button
            type="button"
            className={[styles.homeSettingsBtn, editing ? styles.homeSettingsBtnDone : '']
              .filter(Boolean)
              .join(' ')}
            aria-label={editing ? 'Done customizing Home dashboard' : 'Customize Home dashboard'}
            aria-pressed={editing}
            onClick={() => setEditing((v) => !v)}
          >
            {editing ? (
              <>
                <Check size={16} aria-hidden />
                <span>Done</span>
              </>
            ) : (
              <Settings size={18} aria-hidden />
            )}
          </button>
        </div>
      </header>
      {customizePanel}
      {msg ? <ErrorBox message={msg} /> : null}
      {actionErr ? <ErrorBox message={actionErr} /> : null}
      {actionMsg ? <p className={widgetStyles.ok}>{actionMsg}</p> : null}

      <div ref={containerRef} className={styles.rglMeasure}>
        {mounted && width > 0 ? (
          <GridLayout
            className={[styles.rglRoot, editing ? styles.rglRootEditing : ''].filter(Boolean).join(' ')}
            width={gridWidth}
            layout={layout}
            gridConfig={{
              cols,
              rowHeight: 1,
              margin: [16, 0],
              containerPadding: [0, 0],
            }}
            compactor={verticalCompactor}
            dragConfig={{
              enabled: editing,
              handle: `.${RGL_DRAG_HANDLE_CLASS}`,
              cancel: 'input, select, textarea, button, a',
              bounded: false,
              threshold: 3,
            }}
            resizeConfig={{ enabled: false }}
            onDragStop={onGridDragStop}
          >
            {visibleIds.map((tileId) => (
              <div key={tileId}>
                <DashboardTile
                  id={tileId}
                  title={DASHBOARD_TILE_TITLES[tileId]}
                  editing={editing}
                  showHeightControl={!singleColumn}
                  maxHeightPx={singleColumn ? null : (tileMaxHeights[tileId] ?? null)}
                  minHeightPx={HOME_TILE_MAX_H_BOUNDS.min}
                  maxHeightLimitPx={HOME_TILE_MAX_H_BOUNDS.max}
                  onCommitMaxHeight={(px) => persistHomeTileMaxHeight(tileId, px)}
                  onContentHeight={onTileContentHeight}
                >
                  {renderTileBody(tileId)}
                </DashboardTile>
              </div>
            ))}
          </GridLayout>
        ) : null}
      </div>
    </div>
  )
}

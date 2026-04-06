import { useCallback, useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import {
  GridLayout,
  useContainerWidth,
  cloneLayout,
  verticalCompactor,
  getBreakpointFromWidth,
} from 'react-grid-layout'
import type { Layout, ResponsiveLayouts } from 'react-grid-layout'
import 'react-grid-layout/css/styles.css'
import 'react-resizable/css/styles.css'
import { Settings } from 'lucide-react'
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
import { DASHBOARD_TILE_IDS, type DashboardTileId, useDashboardTileOrder } from '../lib/dashboardTileOrder'
import {
  DASHBOARD_RGL_BREAKPOINTS,
  DASHBOARD_RGL_COLS,
  DASHBOARD_TILE_DEFAULT_H,
  DASHBOARD_TILE_ROW_BOUNDS,
  buildDefaultDashboardLayouts,
  persistDashboardLayouts,
  setTileHeightInAllBreakpoints,
  useDashboardLayouts,
  withLayoutHeightConstraints,
} from '../lib/dashboardRglLayout'
import {
  persistDashboardTileVisibility,
  useDashboardTileVisibility,
  visibilityWithToggle,
  visibleTileIdsOrdered,
} from '../lib/dashboardTileVisibility'
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
  ControllerWidget,
  countWateringZones,
  DashboardTile,
  DASHBOARD_TILE_TITLES,
  HistoryWidget,
  jlRangeLastTwoDays,
  LiveStatusWidget,
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

  const layoutsFromStore = useDashboardLayouts()
  const visibility = useDashboardTileVisibility()
  const tileOrder = useDashboardTileOrder()
  const visibleIds = useMemo(
    () => visibleTileIdsOrdered(visibility, tileOrder),
    [visibility, tileOrder],
  )
  const visibleCount = useMemo(
    () => DASHBOARD_TILE_IDS.filter((id) => visibility[id]).length,
    [visibility],
  )

  const { width, containerRef, mounted } = useContainerWidth({ initialWidth: 1280 })
  /** Avoid width 0 / tiny first frames breaking breakpoint math and grid column width. */
  const gridWidth = Math.max(1, width)

  /** Compute breakpoint + cols directly — avoids useResponsiveLayout's stale initialBreakpoint. */
  const breakpoint = useMemo(
    () => getBreakpointFromWidth(DASHBOARD_RGL_BREAKPOINTS, gridWidth),
    [gridWidth],
  )
  const cols = DASHBOARD_RGL_COLS[breakpoint] ?? 12

  /** Pick + sanitize the layout for the current breakpoint from the store. */
  const layout = useMemo(() => {
    const raw = layoutsFromStore[breakpoint] ?? []
    const visibleSet = new Set(visibleIds)
    const filtered = raw.filter((item) => visibleSet.has(item.i as DashboardTileId))
    const constrained = withLayoutHeightConstraints(filtered)
    return verticalCompactor.compact(cloneLayout(constrained), cols)
  }, [layoutsFromStore, breakpoint, cols, visibleIds])

  const onGridLayoutChange = useCallback(
    (newLayout: Layout) => {
      const visibleSet = new Set(visibleIds)
      const filtered = newLayout.filter((item) => visibleSet.has(item.i as DashboardTileId))
      const merged: ResponsiveLayouts = { ...layoutsFromStore, [breakpoint]: filtered }
      persistDashboardLayouts(merged)
    },
    [layoutsFromStore, breakpoint, visibleIds],
  )

  const commitTileHeight = useCallback(
    (tileId: DashboardTileId, h: number) => {
      const next = setTileHeightInAllBreakpoints(layoutsFromStore, tileId, h)
      persistDashboardLayouts(next)
    },
    [layoutsFromStore],
  )

  const [customizeOpen, setCustomizeOpen] = useState(false)
  const customizePortalReady = typeof document !== 'undefined'

  useEffect(() => {
    if (!customizeOpen) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prev
    }
  }, [customizeOpen])

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

  function renderTileBody(id: DashboardTileId) {
    switch (id) {
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

  const customizeModal =
    customizePortalReady && customizeOpen ? (
      createPortal(
        <div
          className={styles.modalOverlay}
          onClick={() => setCustomizeOpen(false)}
          role="presentation"
        >
          <div
            className={styles.modalPanel}
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-label="Customize Home dashboard"
          >
            <Card
              className={styles.modalCard}
              title="Customize Home"
              titleAction={
                <Button
                  type="button"
                  variant="ghost"
                  className={styles.modalCloseBtn}
                  aria-label="Close"
                  onClick={() => setCustomizeOpen(false)}
                >
                  ×
                </Button>
              }
            >
              <p className={styles.modalHint}>
                Use the grip on each card to rearrange.<br />The gear on a card sets its height.
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
                          const enabled = e.target.checked
                          const next = visibilityWithToggle(visibility, id, enabled)
                          if (!next) return
                          persistDashboardTileVisibility(next)
                        }}
                      />
                      <span>{DASHBOARD_TILE_TITLES[id]}</span>
                    </label>
                  </li>
                ))}
              </ul>
              <div className={styles.modalActions}>
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => {
                    persistDashboardLayouts(buildDefaultDashboardLayouts(visibleIds))
                  }}
                >
                  Reset layout to defaults
                </Button>
              </div>
            </Card>
          </div>
        </div>,
        document.body,
      )
    ) : null

  return (
    <div>
      <header className={styles.hero}>
        <div className={styles.titleRow}>
          <h1 className={styles.title}>Home</h1>
          <button
            type="button"
            className={styles.homeSettingsBtn}
            aria-label="Customize Home dashboard"
            onClick={() => setCustomizeOpen(true)}
          >
            <Settings size={18} aria-hidden />
          </button>
        </div>
      </header>
      {msg ? <ErrorBox message={msg} /> : null}
      {actionErr ? <ErrorBox message={actionErr} /> : null}
      {actionMsg ? <p className={widgetStyles.ok}>{actionMsg}</p> : null}

      <div ref={containerRef} className={styles.rglMeasure}>
        {mounted && width > 0 ? (
          <GridLayout
            className={styles.rglRoot}
            width={gridWidth}
            layout={layout}
            gridConfig={{
              cols,
              rowHeight: 18,
              margin: [16, 16],
              containerPadding: [0, 0],
            }}
            compactor={verticalCompactor}
            dragConfig={{
              enabled: true,
              handle: `.${RGL_DRAG_HANDLE_CLASS}`,
              cancel: 'input, select, textarea, button, a',
              bounded: false,
              threshold: 3,
            }}
            resizeConfig={{ enabled: false }}
            onLayoutChange={onGridLayoutChange}
          >
            {visibleIds.map((tileId) => {
              const item = layout.find((x) => x.i === tileId)
              const h = item?.h ?? DASHBOARD_TILE_DEFAULT_H[tileId]
              const { minH, maxH } = DASHBOARD_TILE_ROW_BOUNDS[tileId]
              return (
                <div key={tileId}>
                  <DashboardTile
                    title={DASHBOARD_TILE_TITLES[tileId]}
                    gridRowHeight={h}
                    minH={minH}
                    maxH={maxH}
                    onCommitRowHeight={(nextH) => commitTileHeight(tileId, nextH)}
                  >
                    {renderTileBody(tileId)}
                  </DashboardTile>
                </div>
              )
            })}
          </GridLayout>
        ) : null}
      </div>
      {customizeModal}
    </div>
  )
}

import { useCallback, useMemo, useState } from 'react'
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
import {
  useController,
  useJsonAll,
  useChangeValues,
  usePauseQueue,
  useLogs,
  useRunProgram,
  useStationsMeta,
} from '../api/hooks'
import type { JsonAll, ProgramRow } from '../api/types'
import { OpenSprinklerApiError, OpenSprinklerHttpError } from '../api/client'
import { ErrorBox } from '../components/ui'
import { formatEpochSecondsLocale } from '../lib/formatLocale'
import { useAppPreferences } from '../lib/appPreferences'
import { DASHBOARD_TILE_IDS, type DashboardTileId } from '../lib/dashboardTileOrder'
import {
  DASHBOARD_RGL_BREAKPOINTS,
  DASHBOARD_RGL_COLS,
  persistDashboardLayouts,
  useDashboardLayouts,
} from '../lib/dashboardRglLayout'
import { parseLogEntries } from '../lib/irrigationLog'
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
  const prefs = useAppPreferences()

  const layoutsFromStore = useDashboardLayouts()
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
    return verticalCompactor.compact(cloneLayout(raw), cols)
  }, [layoutsFromStore, breakpoint, cols])

  const onGridLayoutChange = useCallback(
    (newLayout: Layout) => {
      const merged: ResponsiveLayouts = { ...layoutsFromStore, [breakpoint]: newLayout }
      persistDashboardLayouts(merged)
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
        return <ControllerWidget ja={ja} fwv={fwv} fwm={fwm} />
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
            runProgram={runProgram}
            runAction={runAction}
          />
        )
      default:
        return null
    }
  }

  return (
    <div>
      <header className={styles.hero}>
        <h1 className={styles.title}>Home</h1>
        <p className={styles.lead}>
          Controller snapshot, live queue, sensors, a two-day log preview, and one-tap program
          runs. Drag the grip on any card to rearrange; layout is remembered on this device.
        </p>
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
            {DASHBOARD_TILE_IDS.map((tileId) => (
              // GridLayout uses cloneElement to inject position styles onto the direct child.
              // The child must be a plain DOM element; React components that don't forward
              // className/style would silently discard those props.
              <div key={tileId}>
                <DashboardTile title={DASHBOARD_TILE_TITLES[tileId]}>
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

import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type Dispatch,
  type SetStateAction,
} from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { createPortal, flushSync } from 'react-dom'
import {
  DndContext,
  type DragEndEvent,
  DragOverlay,
  type DragStartEvent,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
} from '@dnd-kit/core'
import { restrictToVerticalAxis } from '@dnd-kit/modifiers'
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import type { ProgramRow } from '../api/types'
import {
  buildSaveProgramPayload,
  qk,
  useProgramsQuery,
  useSaveProgram,
  useStationsMeta,
  useProgramToggle,
  useProgramUwt,
  useDeleteProgram,
  useReorderPrograms,
  useRunProgram,
  useRunOnce,
} from '../api/hooks'
import {
  cloneProgram,
  flagDateRange,
  flagEnabled,
  flagFixedStart,
  flagUseWeather,
  getProgramDayType,
  parseWeeklyDays,
  setFlagDateRange,
  setFlagEnabled,
  setFlagFixedStart,
  setFlagUseWeather,
  setProgramDayType,
  setProgramRestriction,
  weeklyDays0,
  type ProgramDayType,
  type ProgramRestriction,
} from '../lib/programCodec'
import {
  decodeStartToken,
  encodeClockMinutes,
  encodeSunriseOffset,
  encodeSunsetOffset,
  formatStartTokenLabel,
  isStartDisabled,
  START_DISABLED,
} from '../lib/startTimeCodec'
import {
  epochDaysToIsoDate,
  formatOsDateMmDd,
  isoDateToEpochDays,
  packEpochDay16,
  parseMmDdToOsDate,
  unpackEpochDay16,
} from '../lib/osDate'
import { isStationDisabled } from '../lib/stationDis'
import { useAppPreferences } from '../lib/appPreferences'
import { Card, Button, ErrorBox, Spinner, Label, Input } from '../components/ui'
import { DurationInput } from '../components/DurationInput'
import {
  CalendarDays,
  Clock3,
  CloudSun,
  Droplets,
  ListChecks,
  MapPin,
  Repeat,
  SlidersHorizontal,
  Timer,
} from 'lucide-react'
import styles from './ProgramsPage.module.css'

const DAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
const FULL_DAY_NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']
const DEFAULT_OS_FROM = (1 << 5) + 1 // Jan 1
const DEFAULT_OS_TO = (12 << 5) + 31 // Dec 31

function formatDuration(totalSeconds: number): string {
  if (totalSeconds <= 0) return '0s'
  const h = Math.floor(totalSeconds / 3600)
  const m = Math.floor((totalSeconds % 3600) / 60)
  const s = totalSeconds % 60
  if (h > 0) return `${h}h ${m}m`
  if (m > 0) return s > 0 ? `${m}m ${s}s` : `${m}m`
  return `${s}s`
}

type StartPickState = {
  mode: 'clock' | 'sunrise' | 'sunset'
  clockMinutes: number
  sunOffsetMin: number
}

function tokenToPick(t: number): StartPickState {
  const d = decodeStartToken(t)
  if (d.kind === 'sunrise') return { mode: 'sunrise', clockMinutes: 360, sunOffsetMin: d.offsetMin }
  if (d.kind === 'sunset') return { mode: 'sunset', clockMinutes: 360, sunOffsetMin: d.offsetMin }
  if (d.kind === 'clock') return { mode: 'clock', clockMinutes: d.minutes, sunOffsetMin: 0 }
  return { mode: 'clock', clockMinutes: 6 * 60, sunOffsetMin: 0 }
}

function pickToToken(p: StartPickState): number {
  if (p.mode === 'clock') return encodeClockMinutes(p.clockMinutes)
  if (p.mode === 'sunrise') return encodeSunriseOffset(p.sunOffsetMin)
  return encodeSunsetOffset(p.sunOffsetMin)
}

function formatClockInput(mins: number, is24Hour: boolean): string {
  const safe = ((Math.max(0, mins) % 1440) + 1440) % 1440
  const h = Math.floor(safe / 60)
  const m = safe % 60
  if (is24Hour) return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
  const ap = h >= 12 ? 'PM' : 'AM'
  const h12 = h % 12 === 0 ? 12 : h % 12
  return `${h12}:${String(m).padStart(2, '0')} ${ap}`
}

function parseClockInput(text: string, is24Hour: boolean): number | null {
  const raw = text.trim()
  if (is24Hour) {
    const m = /^([01]?\d|2[0-3]):([0-5]\d)$/.exec(raw)
    if (!m) return null
    const hh = parseInt(m[1] ?? '0', 10)
    const mm = parseInt(m[2] ?? '0', 10)
    return hh * 60 + mm
  }
  const m = /^(1[0-2]|0?[1-9]):([0-5]\d)\s*([AaPp][Mm])$/.exec(raw)
  if (!m) return null
  const h12 = parseInt(m[1] ?? '12', 10)
  const mm = parseInt(m[2] ?? '0', 10)
  const ap = (m[3] ?? 'AM').toUpperCase()
  const hh = (h12 % 12) + (ap === 'PM' ? 12 : 0)
  return hh * 60 + mm
}

function summarizeDays(flag: number, days0: number, days1: number): string {
  const t = getProgramDayType(flag)
  if (t === 'weekly') {
    const active = DAY_NAMES.filter((_, idx) => ((days0 >> idx) & 1) === 1)
    return active.length > 0 ? active.join(', ') : 'No weekdays selected'
  }
  if (t === 'interval') {
    return `Every ${days1} day(s), starting offset ${days0}`
  }
  if (t === 'monthly') {
    return days0 === 0 ? 'Last day of month' : `Day ${days0} of month`
  }
  const ep = unpackEpochDay16(days0, days1)
  return `Once · ${epochDaysToIsoDate(ep)}`
}

function summarizeStarts(starts: [number, number, number, number], fixed: boolean): string {
  if (fixed) {
    const parts = starts
      .map((v) => (isStartDisabled(v) ? null : formatStartTokenLabel(v)))
      .filter(Boolean) as string[]
    return parts.length > 0 ? parts.join(' · ') : 'No start times'
  }
  const first = formatStartTokenLabel(starts[0])
  return `${first} · repeats ${starts[1]}× every ${starts[2]} min`
}

function dayTypeShort(flag: number): string {
  const t = getProgramDayType(flag)
  if (t === 'weekly') return 'Weekly'
  if (t === 'interval') return 'Interval'
  if (t === 'monthly') return 'Monthly'
  return 'Single run'
}

function restrictionShort(flag: number): string | null {
  const r = (flag >> 2) & 3
  if (r === 1) return 'Odd days'
  if (r === 2) return 'Even days'
  return null
}

function stationDisplayName(
  idx: number,
  names: string[],
  showStationNum: boolean,
): string {
  const base = names[idx] ?? `Zone ${idx + 1}`
  return showStationNum ? `${idx + 1}. ${base}` : base
}

type ProgramEditorState = {
  pid: number
  name: string
  enabled: boolean
  useWeather: boolean
  keepDateRange: boolean
  from: number
  to: number
  restriction: ProgramRestriction
  dayType: ProgramDayType
  weekdays: boolean[]
  intervalEvery: number
  intervalStarting: number
  singleEpochDay: number
  monthlyDay: number
  startMode: 'repeating' | 'fixed'
  primaryPick: StartPickState
  repeatCount: number
  repeatIntervalMin: number
  fixedSlotOn: [boolean, boolean, boolean]
  fixedPick1: StartPickState
  fixedPick2: StartPickState
  fixedPick3: StartPickState
  durations: number[]
  /** Draft value for “apply to all zones” (seconds); edited via DurationInput */
  quickSetDurationSeconds: number
}

function createEditorState(program: ProgramRow | null, pid: number, nSta: number): ProgramEditorState {
  const base: ProgramEditorState = {
    pid,
    name: '',
    enabled: true,
    useWeather: true,
    keepDateRange: false,
    from: DEFAULT_OS_FROM,
    to: DEFAULT_OS_TO,
    restriction: 'none',
    dayType: 'weekly',
    weekdays: [true, true, true, true, true, true, true],
    intervalEvery: 3,
    intervalStarting: 0,
    singleEpochDay: isoDateToEpochDays(new Date().toISOString().slice(0, 10)) ?? 20000,
    monthlyDay: 1,
    startMode: 'repeating',
    primaryPick: tokenToPick(encodeClockMinutes(6 * 60)),
    repeatCount: 0,
    repeatIntervalMin: 30,
    fixedSlotOn: [false, false, false],
    fixedPick1: tokenToPick(encodeClockMinutes(12 * 60)),
    fixedPick2: tokenToPick(encodeClockMinutes(12 * 60)),
    fixedPick3: tokenToPick(encodeClockMinutes(12 * 60)),
    durations: Array.from({ length: nSta }, () => 0),
    quickSetDurationSeconds: 0,
  }

  if (!program) return base

  const [flag, days0, days1, starts, durs, name, range] = program
  const dayType = getProgramDayType(flag)
  const fixed = flagFixedStart(flag)

  let weekdays = parseWeeklyDays(days0)
  let intervalEvery = 3
  let intervalStarting = 0
  let singleEpochDay = base.singleEpochDay
  let monthlyDay = 1

  if (dayType === 'interval') {
    intervalStarting = days0
    intervalEvery = days1
  } else if (dayType === 'single') {
    singleEpochDay = unpackEpochDay16(days0, days1)
  } else if (dayType === 'monthly') {
    monthlyDay = days0
  }

  const restriction = (flag >> 2) & 3
  const restrictionNorm: ProgramRestriction =
    restriction === 1 ? 'odd' : restriction === 2 ? 'even' : 'none'

  const fixedSlotOn: [boolean, boolean, boolean] = [
    !isStartDisabled(starts[1]),
    !isStartDisabled(starts[2]),
    !isStartDisabled(starts[3]),
  ]

  return {
    ...base,
    pid,
    name: name ?? '',
    enabled: flagEnabled(flag),
    useWeather: flagUseWeather(flag),
    keepDateRange: flagDateRange(flag),
    from: range[1] ?? DEFAULT_OS_FROM,
    to: range[2] ?? DEFAULT_OS_TO,
    restriction: restrictionNorm,
    dayType,
    weekdays,
    intervalEvery,
    intervalStarting,
    singleEpochDay,
    monthlyDay,
    startMode: fixed ? 'fixed' : 'repeating',
    primaryPick: tokenToPick(starts[0]),
    repeatCount: Math.max(0, starts[1] || 0),
    repeatIntervalMin: Math.max(1, starts[2] || 30),
    fixedSlotOn,
    fixedPick1: tokenToPick(fixedSlotOn[0] ? starts[1] : START_DISABLED),
    fixedPick2: tokenToPick(fixedSlotOn[1] ? starts[2] : START_DISABLED),
    fixedPick3: tokenToPick(fixedSlotOn[2] ? starts[3] : START_DISABLED),
    durations: Array.from({ length: nSta }, (_, i) => durs[i] ?? 0),
  }
}

function StartPickEditor({
  idPrefix,
  label,
  value,
  onChange,
  is24Hour,
  compact = false,
}: {
  idPrefix: string
  label: string
  value: StartPickState
  onChange: (next: StartPickState) => void
  is24Hour: boolean
  compact?: boolean
}) {
  const clockText = formatClockInput(value.clockMinutes, is24Hour)

  const segBtn = compact ? styles.segmentBtnSm : undefined
  if (compact) {
    return (
      <div className={styles.startPickBlockCompact}>
        {label ? <Label htmlFor={`${idPrefix}-clock`}>{label}</Label> : null}
        <div className={styles.startPickCompactInner}>
          <div className={styles.segmentRowCompact}>
            <Button
              type="button"
              className={segBtn}
              variant={value.mode === 'clock' ? 'primary' : 'secondary'}
              onClick={() => onChange({ ...value, mode: 'clock' })}
            >
              Clock
            </Button>
            <Button
              type="button"
              className={segBtn}
              variant={value.mode === 'sunrise' ? 'primary' : 'secondary'}
              onClick={() => onChange({ ...value, mode: 'sunrise', sunOffsetMin: value.sunOffsetMin })}
            >
              Sunrise
            </Button>
            <Button
              type="button"
              className={segBtn}
              variant={value.mode === 'sunset' ? 'primary' : 'secondary'}
              onClick={() => onChange({ ...value, mode: 'sunset', sunOffsetMin: value.sunOffsetMin })}
            >
              Sunset
            </Button>
          </div>
          {value.mode === 'clock' ? (
            <Input
              id={`${idPrefix}-clock`}
              className={styles.timeInputCompact}
              type="text"
              inputMode="numeric"
              placeholder={is24Hour ? '23:59' : '11:59 PM'}
              value={clockText}
              onChange={(e) => {
                const m = parseClockInput(e.target.value, is24Hour)
                if (m !== null) onChange({ ...value, mode: 'clock', clockMinutes: m })
              }}
            />
          ) : (
            <div className={styles.sunOffsetInline}>
              <label htmlFor={`${idPrefix}-off`} className={styles.srOnly}>
                Offset minutes from {value.mode}
              </label>
              <Input
                id={`${idPrefix}-off`}
                className={styles.sunOffsetInputCompact}
                type="number"
                min={-720}
                max={720}
                value={value.sunOffsetMin}
                title={`Minutes after ${value.mode} (negative = before)`}
                onChange={(e) =>
                  onChange({ ...value, sunOffsetMin: parseInt(e.target.value, 10) || 0 })
                }
              />
              <span className={styles.sunOffsetSuffix} aria-hidden>
                min
              </span>
            </div>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className={styles.startPickBlock}>
      {label ? <Label htmlFor={`${idPrefix}-clock`}>{label}</Label> : null}
      <div className={styles.segmentRow}>
        <Button
          type="button"
          variant={value.mode === 'clock' ? 'primary' : 'secondary'}
          onClick={() => onChange({ ...value, mode: 'clock' })}
        >
          Clock
        </Button>
        <Button
          type="button"
          variant={value.mode === 'sunrise' ? 'primary' : 'secondary'}
          onClick={() => onChange({ ...value, mode: 'sunrise', sunOffsetMin: value.sunOffsetMin })}
        >
          Sunrise
        </Button>
        <Button
          type="button"
          variant={value.mode === 'sunset' ? 'primary' : 'secondary'}
          onClick={() => onChange({ ...value, mode: 'sunset', sunOffsetMin: value.sunOffsetMin })}
        >
          Sunset
        </Button>
      </div>
      {value.mode === 'clock' ? (
        <Input
          id={`${idPrefix}-clock`}
          className={styles.timeInput}
          type="text"
          inputMode="numeric"
          placeholder={is24Hour ? '23:59' : '11:59 PM'}
          value={clockText}
          onChange={(e) => {
            const m = parseClockInput(e.target.value, is24Hour)
            if (m !== null) onChange({ ...value, mode: 'clock', clockMinutes: m })
          }}
        />
      ) : (
        <div className={styles.sunOffsetRow}>
          <Label htmlFor={`${idPrefix}-off`}>Offset from {value.mode} (minutes)</Label>
          <Input
            id={`${idPrefix}-off`}
            className={styles.numberInput}
            type="number"
            min={-720}
            max={720}
            value={value.sunOffsetMin}
            onChange={(e) =>
              onChange({ ...value, sunOffsetMin: parseInt(e.target.value, 10) || 0 })
            }
          />
          <p className={styles.helpMiniTight}>
            0 = exactly at {value.mode}. Positive runs after, negative before.
          </p>
        </div>
      )}
    </div>
  )
}

function SortableProgramRow({
  id,
  sortDisabled,
  prog,
  pid,
  stationNames,
  stnDis,
  nSta,
  setEditor,
  toggleEn,
  toggleUwt,
  del,
  runAction,
  onRunNow,
  stationOrder,
  showStationNum,
}: {
  id: string
  sortDisabled: boolean
  prog: ProgramRow
  pid: number
  stationNames: string[]
  stnDis: number[] | undefined
  nSta: number
  setEditor: Dispatch<SetStateAction<ProgramEditorState | null>>
  toggleEn: ReturnType<typeof useProgramToggle>
  toggleUwt: ReturnType<typeof useProgramUwt>
  del: ReturnType<typeof useDeleteProgram>
  runAction: (task: () => Promise<unknown>, successMessage: string) => Promise<void>
  onRunNow: (pid: number) => void
  stationOrder: number[]
  showStationNum: boolean
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id, disabled: sortDisabled })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  }

  const [flag, days0, days1, starts, durs, name, range] = prog
  const en = flagEnabled(flag)
  const uwt = flagUseWeather(flag)
  const fixed = flagFixedStart(flag)
  const dr = flagDateRange(flag)
  const rest = restrictionShort(flag)
  const activeZones = stationOrder
    .map((idx) => ({ idx, seconds: durs[idx] ?? 0 }))
    .filter((z) => z.seconds > 0)
  const totalDurationSeconds = activeZones.reduce((sum, z) => sum + z.seconds, 0)

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`${styles.sortableRow} ${isDragging ? styles.sortableRowDragging : ''}`}
    >
      <Card
        title={name || `Program ${pid + 1}`}
        bodyClassName={en ? undefined : styles.programCardMuted}
        titleAction={
          <div className={styles.programCardHeaderActions}>
            <button
              type="button"
              ref={setActivatorNodeRef}
              className={styles.dragHandle}
              aria-label={`Drag to reorder ${name || `program ${pid + 1}`}`}
              {...attributes}
              {...listeners}
            >
              <svg
                className={styles.dragHandleSvg}
                width="14"
                height="18"
                viewBox="0 0 14 18"
                aria-hidden
              >
                <circle cx="4" cy="4" r="1.75" fill="currentColor" />
                <circle cx="10" cy="4" r="1.75" fill="currentColor" />
                <circle cx="4" cy="9" r="1.75" fill="currentColor" />
                <circle cx="10" cy="9" r="1.75" fill="currentColor" />
                <circle cx="4" cy="14" r="1.75" fill="currentColor" />
                <circle cx="10" cy="14" r="1.75" fill="currentColor" />
              </svg>
            </button>
            <Button
              variant={en ? 'danger' : 'cta'}
              className={styles.cardHeaderToggle}
              disabled={toggleEn.isPending}
              onClick={() =>
                runAction(
                  () => toggleEn.mutateAsync({ pid, en: en ? 0 : 1 }),
                  en ? 'Program disabled.' : 'Program enabled.',
                )
              }
            >
              {en ? 'Turn off' : 'Turn on'}
            </Button>
          </div>
        }
      >
        <div className={styles.programSummaryBar}>
          <span
            className={en ? styles.programStatusOn : styles.programStatusOff}
            title={
              en
                ? 'Program is enabled and can run on its schedule.'
                : 'Program is disabled and will not run.'
            }
          >
            {en ? 'Enabled' : 'Disabled'}
          </span>
          <span className={styles.programSummaryDivider} aria-hidden />
          <div className={styles.programSummaryChipsWrap}>
            <span className={styles.programSummaryLabel}>Runs as</span>
            <ul className={styles.programSummaryList} aria-label="How this program is configured to run">
              {uwt ? (
                <li>
                  <span className={styles.summaryChip}>
                    <CloudSun className={styles.summaryChipIcon} size={13} aria-hidden />
                    Weather adjust on
                  </span>
                </li>
              ) : null}
              <li>
                <span className={styles.summaryChip}>
                  <CalendarDays className={styles.summaryChipIcon} size={13} aria-hidden />
                  {dayTypeShort(flag)}
                </span>
              </li>
              <li>
                <span className={styles.summaryChip}>
                  {fixed ? (
                    <ListChecks className={styles.summaryChipIcon} size={13} aria-hidden />
                  ) : (
                    <Repeat className={styles.summaryChipIcon} size={13} aria-hidden />
                  )}
                  {fixed ? 'Fixed start times' : 'Repeating runs'}
                </span>
              </li>
              {rest ? (
                <li>
                  <span className={styles.summaryChip}>{rest}</span>
                </li>
              ) : null}
              {dr ? (
                <li>
                  <span className={styles.summaryChip}>
                    <MapPin className={styles.summaryChipIcon} size={13} aria-hidden />
                    Date range only
                  </span>
                </li>
              ) : null}
            </ul>
          </div>
        </div>
        <div className={styles.programCardLayout}>
          <div className={styles.programCardSchedule}>
            <div className={styles.programMetaGrid}>
              <div className={styles.programMetaCell}>
                <CalendarDays className={styles.programMetaIcon} size={15} aria-hidden />
                <div className={styles.programMetaBody}>
                  <span className={styles.programMetaLabel}>Days</span>
                  <span className={styles.programMetaValue}>{summarizeDays(flag, days0, days1)}</span>
                </div>
              </div>
              <div className={styles.programMetaCell}>
                <Clock3 className={styles.programMetaIcon} size={15} aria-hidden />
                <div className={styles.programMetaBody}>
                  <span className={styles.programMetaLabel}>Starts</span>
                  <span className={styles.programMetaValue}>{summarizeStarts(starts, fixed)}</span>
                </div>
              </div>
              <div className={styles.programMetaCell}>
                <Timer className={styles.programMetaIcon} size={15} aria-hidden />
                <div className={styles.programMetaBody}>
                  <span className={styles.programMetaLabel}>Total duration</span>
                  <span className={styles.programMetaValue}>{formatDuration(totalDurationSeconds)}</span>
                </div>
              </div>
              {dr ? (
                <div className={`${styles.programMetaCell} ${styles.programMetaCellWide}`}>
                  <MapPin className={styles.programMetaIcon} size={15} aria-hidden />
                  <div className={styles.programMetaBody}>
                    <span className={styles.programMetaLabel}>Date range</span>
                    <span className={styles.programMetaValue}>
                      {formatOsDateMmDd(range[1])} → {formatOsDateMmDd(range[2])}
                    </span>
                  </div>
                </div>
              ) : null}
            </div>
          </div>
          <div className={styles.programCardZones}>
            <p className={styles.cardSectionTitle}>Zones</p>
            <div className={styles.zoneDurations}>
              {activeZones.length === 0 ? (
                <p className={styles.meta}>No active zones in this program.</p>
              ) : (
                activeZones.map(({ idx, seconds }) => (
                  <span
                    key={idx}
                    className={`${styles.durationPill} ${isStationDisabled(stnDis, idx) ? styles.pillMuted : ''}`}
                  >
                    {stationDisplayName(idx, stationNames, showStationNum)}: {formatDuration(seconds)}
                  </span>
                ))
              )}
            </div>
          </div>
        </div>
        <div className={styles.programCardActions}>
          <p className={styles.cardSectionTitle}>Actions</p>
          <div className={styles.actions}>
          <Button
            variant="secondary"
            disabled={toggleUwt.isPending}
            onClick={() =>
              runAction(
                () => toggleUwt.mutateAsync({ pid, uwt: uwt ? 0 : 1 }),
                uwt ? 'Weather adjustment disabled.' : 'Weather adjustment enabled.',
              )
            }
          >
            {uwt ? 'Weather off' : 'Weather on'}
          </Button>
          <Button
            type="button"
            variant="secondary"
            onClick={() => {
              const row = cloneProgram(prog)
              const copy = createEditorState(row, -1, nSta)
              setEditor({
                ...copy,
                name: `${copy.name || `Program ${pid + 1}`} copy`,
              })
            }}
          >
            Duplicate as new
          </Button>
          <Button variant="secondary" onClick={() => onRunNow(pid)}>
            Run now
          </Button>
          <Button variant="secondary" onClick={() => setEditor(createEditorState(prog, pid, nSta))}>
            Edit
          </Button>
          <Button
            variant="danger"
            disabled={del.isPending}
            onClick={async () => {
              if (window.confirm('Delete this program?')) {
                await runAction(() => del.mutateAsync(pid), 'Program deleted.')
              }
            }}
          >
            Delete
          </Button>
          </div>
        </div>
      </Card>
    </div>
  )
}

export function ProgramsPage() {
  const qc = useQueryClient()
  const pr = useProgramsQuery()
  const jn = useStationsMeta()
  const toggleEn = useProgramToggle()
  const toggleUwt = useProgramUwt()
  const del = useDeleteProgram()
  const reorder = useReorderPrograms()
  const mp = useRunProgram()
  const cr = useRunOnce()
  const save = useSaveProgram()
  const prefs = useAppPreferences()

  const pd = (pr.data?.pd as ProgramRow[] | undefined) ?? []
  const stationNames = (jn.data?.snames as string[] | undefined) ?? []
  const stnDis = jn.data?.stn_dis as number[] | undefined
  const nSta =
    stationNames.length ||
    pd[0]?.[4]?.length ||
    8
  const stationOrder = useMemo(() => {
    let ids = Array.from({ length: nSta }, (_, i) => i)
    if (!prefs.showDisabled) ids = ids.filter((i) => !isStationDisabled(stnDis, i))
    if (prefs.sortByStationName) {
      ids = [...ids].sort((a, b) =>
        (stationNames[a] ?? '').localeCompare(stationNames[b] ?? '', undefined, { sensitivity: 'base' }),
      )
    }
    return ids
  }, [nSta, prefs.showDisabled, prefs.sortByStationName, stationNames, stnDis])

  const [runOnceOpen, setRunOnceOpen] = useState(false)
  const [runOnceQo, setRunOnceQo] = useState(2)
  const [runOnceUwt, setRunOnceUwt] = useState(0)
  const [runProgramPid, setRunProgramPid] = useState<number | null>(null)
  const [runProgQo, setRunProgQo] = useState(2)
  const [runProgUwt, setRunProgUwt] = useState<0 | 1>(1)
  const [editor, setEditor] = useState<ProgramEditorState | null>(null)
  const restrictDetailsRef = useRef<HTMLDetailsElement>(null)
  const addlDetailsRef = useRef<HTMLDetailsElement>(null)
  const [editorPortalReady, setEditorPortalReady] = useState(false)
  const [runDurs, setRunDurs] = useState<number[]>([])
  const [actionMsg, setActionMsg] = useState<string | null>(null)
  const [actionErr, setActionErr] = useState<string | null>(null)
  const [activeDragId, setActiveDragId] = useState<string | null>(null)

  const sortableIds = useMemo(() => pd.map((_, i) => String(i)), [pd])
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  useEffect(() => {
    setEditorPortalReady(true)
  }, [])

  useEffect(() => {
    if (!editor) return
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') setEditor(null)
    }
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.body.style.overflow = prevOverflow
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [editor])

  useLayoutEffect(() => {
    if (!editor) return
    const el = restrictDetailsRef.current
    if (el) el.open = editor.restriction !== 'none'
  }, [editor?.pid, editor?.restriction])

  const addlSlotsKey = editor?.fixedSlotOn.map((v) => (v ? '1' : '0')).join('') ?? ''

  useLayoutEffect(() => {
    if (!editor) return
    const el = addlDetailsRef.current
    if (el) {
      el.open =
        editor.startMode === 'fixed' ||
        editor.repeatCount > 0 ||
        editor.fixedSlotOn.some(Boolean)
    }
  }, [editor?.pid, editor?.startMode, editor?.repeatCount, addlSlotsKey])

  const normalizedRunDurs = useMemo(
    () => Array.from({ length: nSta }, (_, i) => runDurs[i] ?? 0),
    [nSta, runDurs],
  )

  const editorTotalRunSeconds = useMemo(() => {
    if (!editor) return 0
    return editor.durations.reduce((sum, d, i) => {
      if (isStationDisabled(stnDis, i)) return sum
      return sum + Math.max(0, d)
    }, 0)
  }, [editor, stnDis])

  const err = pr.error instanceof Error ? pr.error.message : null

  async function runAction(task: () => Promise<unknown>, successMessage: string) {
    setActionErr(null)
    setActionMsg(null)
    try {
      await task()
      setActionMsg(successMessage)
    } catch (e) {
      setActionErr(e instanceof Error ? e.message : 'Program action failed')
    }
  }

  async function saveEditor() {
    if (!editor) return

    if (editor.dayType === 'weekly' && !editor.weekdays.some(Boolean)) {
      setActionErr('Select at least one weekday.')
      return
    }
    if (editor.dayType === 'interval') {
      if (editor.intervalEvery < 2 || editor.intervalEvery > 128) {
        setActionErr('Interval must be between 2 and 128 days.')
        return
      }
      if (editor.intervalStarting < 0 || editor.intervalStarting >= editor.intervalEvery) {
        setActionErr('"Starting in" must be from 0 up to (interval − 1).')
        return
      }
    }
    if (editor.dayType === 'monthly' && (editor.monthlyDay < 0 || editor.monthlyDay > 31)) {
      setActionErr('Day of month must be 0 (last day) or 1–31.')
      return
    }

    const atLeastOneEnabledZone = editor.durations.some(
      (d, i) => d > 0 && !isStationDisabled(stnDis, i),
    )
    if (!atLeastOneEnabledZone) {
      setActionErr('Set duration for at least one enabled zone.')
      return
    }

    let days0 = 0
    let days1 = 0
    switch (editor.dayType) {
      case 'weekly':
        days0 = weeklyDays0(
          editor.weekdays[0],
          editor.weekdays[1],
          editor.weekdays[2],
          editor.weekdays[3],
          editor.weekdays[4],
          editor.weekdays[5],
          editor.weekdays[6],
        )
        break
      case 'interval':
        days0 = editor.intervalStarting
        days1 = editor.intervalEvery
        break
      case 'single': {
        const p = packEpochDay16(editor.singleEpochDay)
        days0 = p[0]
        days1 = p[1]
        break
      }
      case 'monthly':
        days0 = editor.monthlyDay
        days1 = 0
        break
    }

    let starts: [number, number, number, number]
    if (editor.startMode === 'repeating') {
      const first = pickToToken(editor.primaryPick)
      starts = [
        first,
        Math.max(0, editor.repeatCount),
        Math.max(1, editor.repeatIntervalMin),
        0,
      ]
    } else {
      starts = [
        pickToToken(editor.primaryPick),
        editor.fixedSlotOn[0] ? pickToToken(editor.fixedPick1) : START_DISABLED,
        editor.fixedSlotOn[1] ? pickToToken(editor.fixedPick2) : START_DISABLED,
        editor.fixedSlotOn[2] ? pickToToken(editor.fixedPick3) : START_DISABLED,
      ]
      if (starts.every((v) => isStartDisabled(v))) {
        setActionErr('Enable at least one start time (including the first).')
        return
      }
    }

    let flag = 0
    flag = setFlagEnabled(flag, editor.enabled)
    flag = setFlagUseWeather(flag, editor.useWeather)
    flag = setProgramDayType(flag, editor.dayType)
    flag = setProgramRestriction(flag, editor.restriction)
    flag = setFlagFixedStart(flag, editor.startMode === 'fixed')
    flag = setFlagDateRange(flag, editor.keepDateRange)

    const dursOut = editor.durations.map((d, i) =>
      isStationDisabled(stnDis, i) ? 0 : Math.max(0, Math.min(64800, d)),
    )

    const row: ProgramRow = [
      flag,
      days0,
      days1,
      starts,
      dursOut,
      editor.name.trim() || `Program`,
      [editor.keepDateRange ? 1 : 0, editor.from, editor.to],
    ]

    const payload = buildSaveProgramPayload(row, editor.pid)
    await runAction(
      () => save.mutateAsync(payload),
      editor.pid >= 0 ? 'Program saved.' : 'Program created.',
    )
    setEditor(null)
  }

  function setDayType(next: ProgramDayType) {
    setEditor((s) => (s ? { ...s, dayType: next } : s))
  }

  return (
    <div>
      <h1 className={styles.title}>Programs</h1>
      {err ? <ErrorBox message={err} /> : null}
      {actionErr ? <ErrorBox message={actionErr} /> : null}
      {actionMsg ? <p className={styles.ok}>{actionMsg}</p> : null}
      <div className={styles.toolbar}>
        <Button variant="primary" onClick={() => setEditor(createEditorState(null, -1, nSta))}>
          New program
        </Button>
        <Button
          variant="secondary"
          onClick={() => {
            setRunOnceQo(2)
            setRunOnceUwt(0)
            setRunOnceOpen(true)
          }}
        >
          Run-once
        </Button>
        <Link to="/preview" className={styles.toolbarLink}>
          Day preview
        </Link>
      </div>
      {pr.isLoading ? <Spinner /> : null}

      {runProgramPid != null ? (
        <Card title={`Run program #${runProgramPid + 1}`}>
          <p className={styles.hint}>Choose queue behavior and whether to apply weather adjustment.</p>
          <fieldset className={styles.qoFieldset}>
            <legend className={styles.qoLegend}>Queue</legend>
            <label className={styles.qoLabel}>
              <input
                type="radio"
                name="prog-qo"
                checked={runProgQo === 0}
                onChange={() => setRunProgQo(0)}
              />
              Run after others (append)
            </label>
            <label className={styles.qoLabel}>
              <input
                type="radio"
                name="prog-qo"
                checked={runProgQo === 1}
                onChange={() => setRunProgQo(1)}
              />
              Run now and pause others (insert)
            </label>
            <label className={styles.qoLabel}>
              <input
                type="radio"
                name="prog-qo"
                checked={runProgQo === 2}
                onChange={() => setRunProgQo(2)}
              />
              Run now and cancel others (replace)
            </label>
          </fieldset>
          <label className={styles.qoCheck}>
            <input
              type="checkbox"
              checked={runProgUwt === 1}
              onChange={(e) => setRunProgUwt(e.target.checked ? 1 : 0)}
            />
            Use weather adjustment
          </label>
          <div className={styles.row}>
            <Button
              disabled={mp.isPending}
              onClick={async () => {
                const pid = runProgramPid
                if (pid == null) return
                await runAction(
                  () => mp.mutateAsync({ pid, uwt: runProgUwt, qo: runProgQo }),
                  'Program started.',
                )
                setRunProgramPid(null)
              }}
            >
              Start program
            </Button>
            <Button variant="ghost" onClick={() => setRunProgramPid(null)}>
              Cancel
            </Button>
          </div>
        </Card>
      ) : null}

      {runOnceOpen ? (
        <Card title="Run-once">
          <p className={styles.hint}>
            Set each zone duration (0 = skip). Choose how this run interacts with the current queue.
          </p>
          <fieldset className={styles.qoFieldset}>
            <legend className={styles.qoLegend}>Queue</legend>
            <label className={styles.qoLabel}>
              <input
                type="radio"
                name="runonce-qo"
                checked={runOnceQo === 0}
                onChange={() => setRunOnceQo(0)}
              />
              Run after others (append)
            </label>
            <label className={styles.qoLabel}>
              <input
                type="radio"
                name="runonce-qo"
                checked={runOnceQo === 1}
                onChange={() => setRunOnceQo(1)}
              />
              Run now and pause others (insert)
            </label>
            <label className={styles.qoLabel}>
              <input
                type="radio"
                name="runonce-qo"
                checked={runOnceQo === 2}
                onChange={() => setRunOnceQo(2)}
              />
              Run now and cancel others (replace)
            </label>
          </fieldset>
          <label className={styles.qoCheck}>
            <input
              type="checkbox"
              checked={runOnceUwt === 1}
              onChange={(e) => setRunOnceUwt(e.target.checked ? 1 : 0)}
            />
            Use weather adjustment for this run
          </label>
          <div className={styles.durGrid}>
            {stationOrder.map((i) => {
              const v = normalizedRunDurs[i] ?? 0
              return (
              <div
                key={i}
                className={`${styles.runOnceItem} ${isStationDisabled(stnDis, i) ? styles.itemMuted : ''}`}
              >
                <Label>{stationDisplayName(i, stationNames, prefs.showStationNum)}</Label>
                <DurationInput
                  idBase={`run-once-${i}`}
                  valueSeconds={v}
                  maxSeconds={64800}
                  onChange={(seconds) => {
                    setRunDurs((d) => {
                      const c = [...d]
                      c[i] = seconds
                      return c
                    })
                  }}
                />
                <p className={styles.mutedMini}>{formatDuration(v)}</p>
              </div>
              )
            })}
          </div>
          <div className={styles.row}>
            <Button
              variant="ghost"
              onClick={() => setRunDurs(Array.from({ length: nSta }, () => 300))}
            >
              Set all to 5 min
            </Button>
            <Button
              variant="ghost"
              onClick={() => setRunDurs(Array.from({ length: nSta }, () => 0))}
            >
              Clear all
            </Button>
          </div>
          <div className={styles.row}>
            <Button
              disabled={cr.isPending}
              onClick={async () => {
                await runAction(
                  () =>
                    cr.mutateAsync({
                      t: JSON.stringify(normalizedRunDurs),
                      uwt: runOnceUwt,
                      qo: runOnceQo,
                    }),
                  'Run-once started.',
                )
                setRunOnceOpen(false)
              }}
            >
              Start run-once
            </Button>
            <Button variant="ghost" onClick={() => setRunOnceOpen(false)}>
              Cancel
            </Button>
          </div>
        </Card>
      ) : null}

      {editorPortalReady && editor
        ? createPortal(
            <div
              className={styles.modalOverlay}
              onClick={() => setEditor(null)}
              role="presentation"
            >
              <div
                className={styles.modalPanel}
                onClick={(e) => e.stopPropagation()}
                role="dialog"
                aria-modal="true"
                aria-label={editor.pid >= 0 ? `Edit program ${editor.pid + 1}` : 'New program'}
              >
                <Card
                  className={styles.modalCard}
                  title={editor.pid >= 0 ? `Edit Program #${editor.pid + 1}` : 'New Program'}
                  titleAction={
                    <Button
                      type="button"
                      variant="ghost"
                      className={styles.modalCloseBtn}
                      aria-label="Close"
                      onClick={() => setEditor(null)}
                    >
                      ×
                    </Button>
                  }
                >
                  <div className={styles.editorForm}>
                    <div className={`${styles.editorBlock} ${styles.editorPanel}`}>
                      <div className={styles.editorSectionHeader}>
                        <div className={styles.editorSectionTitleWrap}>
                          <SlidersHorizontal className={styles.editorSectionIcon} size={15} aria-hidden />
                          <div className={styles.editorSectionText}>
                            <p className={styles.sectionLabel}>Basics</p>
                            <p className={styles.sectionHint}>Program identity and global behavior</p>
                          </div>
                        </div>
                        <Button
                          type="button"
                          variant={editor.enabled ? 'primary' : 'secondary'}
                          className={styles.headerToggle}
                          onClick={() =>
                            setEditor((s) => (s ? { ...s, enabled: !s.enabled } : s))
                          }
                        >
                          {editor.enabled ? 'On' : 'Off'}
                        </Button>
                      </div>
                      <div className={styles.programNameField}>
                        <Label htmlFor="program-name">Program name</Label>
                        <Input
                          id="program-name"
                          value={editor.name}
                          maxLength={32}
                          onChange={(e) => setEditor((s) => (s ? { ...s, name: e.target.value } : s))}
                        />
                      </div>
                      <div className={styles.inlineToggles}>
                        <Button
                          type="button"
                          variant={editor.useWeather ? 'primary' : 'secondary'}
                          className={styles.inlineToggleBtn}
                          onClick={() =>
                            setEditor((s) => (s ? { ...s, useWeather: !s.useWeather } : s))
                          }
                        >
                          Weather adjust
                        </Button>
                        <Button
                          type="button"
                          variant={editor.keepDateRange ? 'primary' : 'secondary'}
                          className={styles.inlineToggleBtn}
                          onClick={() =>
                            setEditor((s) => (s ? { ...s, keepDateRange: !s.keepDateRange } : s))
                          }
                        >
                          Date range
                        </Button>
                      </div>
                      {editor.keepDateRange ? (
                        <div className={styles.dateRangeGrid}>
                          <div>
                            <Label htmlFor="dr-from">From (MM/DD)</Label>
                            <Input
                              id="dr-from"
                              placeholder="01/01"
                              value={formatOsDateMmDd(editor.from)}
                              onChange={(e) => {
                                const c = parseMmDdToOsDate(e.target.value)
                                if (c !== null) setEditor((s) => (s ? { ...s, from: c } : s))
                              }}
                            />
                          </div>
                          <div>
                            <Label htmlFor="dr-to">To (MM/DD)</Label>
                            <Input
                              id="dr-to"
                              placeholder="12/31"
                              value={formatOsDateMmDd(editor.to)}
                              onChange={(e) => {
                                const c = parseMmDdToOsDate(e.target.value)
                                if (c !== null) setEditor((s) => (s ? { ...s, to: c } : s))
                              }}
                            />
                          </div>
                        </div>
                      ) : null}
                    </div>

                    <div className={`${styles.editorBlock} ${styles.editorPanel}`}>
                      <div className={styles.editorSectionHeader}>
                        <div className={styles.editorSectionTitleWrap}>
                          <CalendarDays className={styles.editorSectionIcon} size={15} aria-hidden />
                          <div className={styles.editorSectionText}>
                            <p className={styles.sectionLabel}>Schedule</p>
                            <p className={styles.sectionHint}>When this program is eligible to run</p>
                          </div>
                        </div>
                      </div>
                      <div className={styles.segmentRowWrap}>
                        <Button
                          type="button"
                          variant={editor.dayType === 'weekly' ? 'primary' : 'secondary'}
                          onClick={() => setDayType('weekly')}
                        >
                          Weekly
                        </Button>
                        <Button
                          type="button"
                          variant={editor.dayType === 'interval' ? 'primary' : 'secondary'}
                          onClick={() => setDayType('interval')}
                        >
                          Interval
                        </Button>
                        <Button
                          type="button"
                          variant={editor.dayType === 'single' ? 'primary' : 'secondary'}
                          onClick={() => setDayType('single')}
                        >
                          Single run
                        </Button>
                        <Button
                          type="button"
                          variant={editor.dayType === 'monthly' ? 'primary' : 'secondary'}
                          onClick={() => setDayType('monthly')}
                        >
                          Monthly
                        </Button>
                      </div>

                      {editor.dayType === 'weekly' ? (
                        <div className={styles.weekdays}>
                          {DAY_NAMES.map((day, idx) => (
                            <label key={day} className={styles.dayChip}>
                              <input
                                type="checkbox"
                                checked={editor.weekdays[idx]}
                                onChange={(e) =>
                                  setEditor((s) => {
                                    if (!s) return s
                                    const next = [...s.weekdays]
                                    next[idx] = e.target.checked
                                    return { ...s, weekdays: next }
                                  })
                                }
                              />
                              <span title={FULL_DAY_NAMES[idx]}>{day}</span>
                            </label>
                          ))}
                        </div>
                      ) : null}

                      {editor.dayType === 'interval' ? (
                        <div className={styles.repeatFields}>
                          <div className={styles.timeFieldWrap}>
                            <Label htmlFor="int-every">Every N days</Label>
                            <Input
                              id="int-every"
                              className={styles.numberInput}
                              type="number"
                              min={2}
                              max={128}
                              value={editor.intervalEvery}
                              onChange={(e) =>
                                setEditor((s) =>
                                  s ? { ...s, intervalEvery: parseInt(e.target.value, 10) || 2 } : s,
                                )
                              }
                            />
                          </div>
                          <div className={styles.timeFieldWrap}>
                            <Label htmlFor="int-start">Starting in (0 … N−1)</Label>
                            <Input
                              id="int-start"
                              className={styles.numberInput}
                              type="number"
                              min={0}
                              max={127}
                              value={editor.intervalStarting}
                              onChange={(e) =>
                                setEditor((s) =>
                                  s ? { ...s, intervalStarting: parseInt(e.target.value, 10) || 0 } : s,
                                )
                              }
                            />
                          </div>
                        </div>
                      ) : null}

                      {editor.dayType === 'single' ? (
                        <div className={styles.timeFieldWrap}>
                          <Label htmlFor="single-date">Run date</Label>
                          <Input
                            id="single-date"
                            type="date"
                            value={epochDaysToIsoDate(editor.singleEpochDay)}
                            onChange={(e) => {
                              const ep = isoDateToEpochDays(e.target.value)
                              if (ep !== null)
                                setEditor((s) => (s ? { ...s, singleEpochDay: ep } : s))
                            }}
                          />
                        </div>
                      ) : null}

                      {editor.dayType === 'monthly' ? (
                        <div className={styles.timeFieldWrap}>
                          <Label htmlFor="month-day">Day of month</Label>
                          <Input
                            id="month-day"
                            className={styles.numberInput}
                            type="number"
                            min={0}
                            max={31}
                            value={editor.monthlyDay}
                            onChange={(e) =>
                              setEditor((s) =>
                                s ? { ...s, monthlyDay: parseInt(e.target.value, 10) || 0 } : s,
                              )
                            }
                          />
                          <p className={styles.helpMiniTight}>Use 0 for the last day of the month.</p>
                        </div>
                      ) : null}

                      <details
                        ref={restrictDetailsRef}
                        key={`restrict-${editor.pid}`}
                        className={styles.editorExtra}
                      >
                        <summary className={styles.editorExtraSummary}>
                          <span className={styles.extraSummaryMain}>
                            <span className={styles.extraChevron} aria-hidden>
                              ▸
                            </span>
                            Day restrictions
                          </span>
                          {editor.restriction !== 'none' ? (
                            <span className={styles.extraBadge}>
                              {editor.restriction === 'odd' ? 'Odd' : 'Even'}
                            </span>
                          ) : null}
                        </summary>
                        <div className={styles.editorExtraBody}>
                          <p className={styles.helpMiniTight}>
                            Optional odd/even filter on top of your schedule.
                          </p>
                          <div className={styles.segmentRow}>
                            <Button
                              type="button"
                              variant={editor.restriction === 'none' ? 'primary' : 'secondary'}
                              onClick={() => setEditor((s) => (s ? { ...s, restriction: 'none' } : s))}
                            >
                              None
                            </Button>
                            <Button
                              type="button"
                              variant={editor.restriction === 'odd' ? 'primary' : 'secondary'}
                              onClick={() => setEditor((s) => (s ? { ...s, restriction: 'odd' } : s))}
                            >
                              Odd days
                            </Button>
                            <Button
                              type="button"
                              variant={editor.restriction === 'even' ? 'primary' : 'secondary'}
                              onClick={() => setEditor((s) => (s ? { ...s, restriction: 'even' } : s))}
                            >
                              Even days
                            </Button>
                          </div>
                        </div>
                      </details>
                    </div>

                    <div className={`${styles.editorBlock} ${styles.editorPanel}`}>
                      <div className={styles.editorSectionHeader}>
                        <div className={styles.editorSectionTitleWrap}>
                          <Clock3 className={styles.editorSectionIcon} size={15} aria-hidden />
                          <div className={styles.editorSectionText}>
                            <p className={styles.sectionLabel}>Start time</p>
                            <p className={styles.sectionHint}>Primary start plus optional additional runs</p>
                          </div>
                        </div>
                      </div>
                      <StartPickEditor
                        idPrefix="primary"
                        label="First start"
                        value={editor.primaryPick}
                        is24Hour={prefs.is24Hour}
                        onChange={(primaryPick) => setEditor((s) => (s ? { ...s, primaryPick } : s))}
                      />

                      <details
                        ref={addlDetailsRef}
                        key={`addl-${editor.pid}`}
                        className={styles.editorExtra}
                      >
                        <summary className={styles.editorExtraSummary}>
                          <span className={styles.extraSummaryMain}>
                            <span className={styles.extraChevron} aria-hidden>
                              ▸
                            </span>
                            Additional starts
                          </span>
                          <span className={styles.extraBadgeMuted}>
                            {editor.startMode === 'fixed'
                              ? 'Fixed slots'
                              : editor.repeatCount > 0
                                ? `Repeat ×${editor.repeatCount}`
                                : 'Optional'}
                          </span>
                        </summary>
                        <div className={styles.editorExtraBody}>
                          <div className={styles.segmentRow}>
                            <Button
                              type="button"
                              variant={editor.startMode === 'repeating' ? 'primary' : 'secondary'}
                              onClick={() => setEditor((s) => (s ? { ...s, startMode: 'repeating' } : s))}
                            >
                              Repeating
                            </Button>
                            <Button
                              type="button"
                              variant={editor.startMode === 'fixed' ? 'primary' : 'secondary'}
                              onClick={() => setEditor((s) => (s ? { ...s, startMode: 'fixed' } : s))}
                            >
                              Fixed times
                            </Button>
                          </div>

                          {editor.startMode === 'repeating' ? (
                            <div className={styles.repeatFields}>
                              <div className={styles.timeFieldWrap}>
                                <Label htmlFor="repeat-count">Repeat count</Label>
                                <Input
                                  id="repeat-count"
                                  className={styles.numberInput}
                                  type="number"
                                  min={0}
                                  value={editor.repeatCount}
                                  onChange={(e) =>
                                    setEditor((s) =>
                                      s ? { ...s, repeatCount: parseInt(e.target.value, 10) || 0 } : s,
                                    )
                                  }
                                />
                                <p className={styles.helpMiniTight}>
                                  0 = run only once at the first start.
                                </p>
                              </div>
                              <div className={styles.timeFieldWrap}>
                                <Label htmlFor="repeat-interval">Every (minutes)</Label>
                                <Input
                                  id="repeat-interval"
                                  className={styles.numberInput}
                                  type="number"
                                  min={1}
                                  value={editor.repeatIntervalMin}
                                  onChange={(e) =>
                                    setEditor((s) =>
                                      s
                                        ? {
                                            ...s,
                                            repeatIntervalMin: parseInt(e.target.value, 10) || 1,
                                          }
                                        : s,
                                    )
                                  }
                                />
                              </div>
                            </div>
                          ) : (
                            <div className={styles.fixedStartsTable}>
                              {(
                                [
                                  ['2', 0, editor.fixedPick1] as const,
                                  ['3', 1, editor.fixedPick2] as const,
                                  ['4', 2, editor.fixedPick3] as const,
                                ] as const
                              ).map(([label, idx, pick]) => (
                                <div key={label} className={styles.fixedStartRow}>
                                  <label className={styles.fixedStartEnable}>
                                    <input
                                      type="checkbox"
                                      checked={editor.fixedSlotOn[idx]}
                                      onChange={(e) =>
                                        setEditor((s) => {
                                          if (!s) return s
                                          const next = [...s.fixedSlotOn] as [
                                            boolean,
                                            boolean,
                                            boolean,
                                          ]
                                          next[idx] = e.target.checked
                                          return { ...s, fixedSlotOn: next }
                                        })
                                      }
                                    />
                                    <span>Start {label}</span>
                                  </label>
                                  {editor.fixedSlotOn[idx] ? (
                                    <div className={styles.fixedStartPickWrap}>
                                      <StartPickEditor
                                        idPrefix={`fx-${idx}`}
                                        label=""
                                        compact
                                        is24Hour={prefs.is24Hour}
                                        value={pick}
                                        onChange={(nextPick) =>
                                          setEditor((s) => {
                                            if (!s) return s
                                            if (idx === 0) return { ...s, fixedPick1: nextPick }
                                            if (idx === 1) return { ...s, fixedPick2: nextPick }
                                            return { ...s, fixedPick3: nextPick }
                                          })
                                        }
                                      />
                                    </div>
                                  ) : (
                                    <span className={styles.fixedStartOff}>Off</span>
                                  )}
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      </details>
                    </div>

                    <div className={`${styles.editorBlock} ${styles.editorPanel}`}>
                      <div className={styles.editorSectionHeader}>
                        <div className={styles.editorSectionTitleWrap}>
                          <Droplets className={styles.editorSectionIcon} size={15} aria-hidden />
                          <div className={styles.editorSectionText}>
                            <p className={styles.sectionLabel}>Zones</p>
                            <p className={styles.sectionHint}>
                              Total run {formatDuration(editorTotalRunSeconds)}
                            </p>
                          </div>
                        </div>
                        <span className={styles.sectionPill}>
                          <ListChecks size={13} aria-hidden />
                          {nSta} zones
                        </span>
                      </div>
                      <div className={styles.quickSetRow}>
                        <div
                          className={styles.quickSetDurWrap}
                          role="group"
                          aria-labelledby="quickset-dur-label"
                        >
                          <span className={styles.quickSetDurLabel} id="quickset-dur-label">
                            Set all zones to
                          </span>
                          <DurationInput
                            idBase="prog-quickset"
                            valueSeconds={editor.quickSetDurationSeconds}
                            maxSeconds={64800}
                            onChange={(sec) =>
                              setEditor((s) =>
                                s ? { ...s, quickSetDurationSeconds: sec } : s,
                              )
                            }
                          />
                        </div>
                        <Button
                          type="button"
                          variant="secondary"
                          onClick={() => {
                            const sec = editor.quickSetDurationSeconds
                            if (sec < 0 || sec > 64800) return
                            setEditor((s) => {
                              if (!s) return s
                              const next = [...s.durations]
                              for (let i = 0; i < next.length; i++) {
                                if (!isStationDisabled(stnDis, i)) next[i] = sec
                              }
                              return { ...s, durations: next, quickSetDurationSeconds: 0 }
                            })
                          }}
                        >
                          Apply to all zones
                        </Button>
                      </div>
                      {Array.from({ length: nSta }, (_, i) => i).every((i) =>
                        isStationDisabled(stnDis, i),
                      ) ? (
                        <p className={styles.editorHint}>
                          No enabled zones. Turn zones back on under <strong>Zones</strong> to assign
                          durations here.
                        </p>
                      ) : (
                        <div className={styles.editorDurGrid}>
                          {stationOrder
                            .filter((idx) => !isStationDisabled(stnDis, idx))
                            .map((idx) => (
                              <div
                                key={idx}
                                className={`${styles.editorDurZone} ${(editor.durations[idx] ?? 0) > 0 ? styles.editorDurZoneActive : ''}`}
                              >
                                <p className={styles.editorDurZoneTitle}>
                                  {stationDisplayName(idx, stationNames, prefs.showStationNum)}
                                </p>
                                <div className={styles.editorDurControls}>
                                  <DurationInput
                                    idBase={`editor-zone-${idx}`}
                                    valueSeconds={editor.durations[idx] ?? 0}
                                    maxSeconds={64800}
                                    onChange={(seconds) =>
                                      setEditor((s) => {
                                        if (!s) return s
                                        const next = [...s.durations]
                                        next[idx] = seconds
                                        return { ...s, durations: next }
                                      })
                                    }
                                  />
                                  <p className={styles.editorDurSummary}>
                                    {formatDuration(editor.durations[idx] ?? 0)}
                                  </p>
                                </div>
                              </div>
                            ))}
                        </div>
                      )}
                    </div>

                    <div className={styles.editorFooter}>
                      <Button disabled={save.isPending} onClick={saveEditor}>
                        {editor.pid >= 0
                          ? `Save · ${editor.name.trim() || `Program ${editor.pid + 1}`}`
                          : 'Create program'}
                      </Button>
                      {editor.pid >= 0 ? (
                        <Button
                          type="button"
                          variant="danger"
                          disabled={del.isPending}
                          onClick={async () => {
                            if (
                              window.confirm(
                                `Delete "${editor.name || `Program ${editor.pid + 1}`}"?`,
                              )
                            ) {
                              await runAction(() => del.mutateAsync(editor.pid), 'Program deleted.')
                              setEditor(null)
                            }
                          }}
                        >
                          Delete
                        </Button>
                      ) : null}
                      <Button variant="ghost" onClick={() => setEditor(null)}>
                        Cancel
                      </Button>
                    </div>
                  </div>
                </Card>
              </div>
            </div>,
            document.body,
          )
        : null}

      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        modifiers={[restrictToVerticalAxis]}
        onDragStart={(e: DragStartEvent) => setActiveDragId(e.active.id as string)}
        onDragCancel={() => setActiveDragId(null)}
        onDragEnd={async (e: DragEndEvent) => {
          const { active, over } = e
          if (!over || active.id === over.id) {
            setActiveDragId(null)
            return
          }
          const oldIndex = sortableIds.indexOf(String(active.id))
          const newIndex = sortableIds.indexOf(String(over.id))
          if (oldIndex < 0 || newIndex < 0) {
            setActiveDragId(null)
            return
          }

          const jpKey = qk.jp()
          const previous = qc.getQueryData(jpKey)

          flushSync(() => {
            qc.setQueryData(jpKey, (old) => {
              const raw = old as Record<string, unknown> | undefined
              if (!raw) return old
              const prevPd = (raw.pd as ProgramRow[] | undefined) ?? []
              if (
                oldIndex >= prevPd.length ||
                newIndex >= prevPd.length ||
                oldIndex === newIndex
              )
                return old
              return { ...raw, pd: arrayMove(prevPd, oldIndex, newIndex) }
            })
          })
          setActiveDragId(null)

          setActionErr(null)
          setActionMsg(null)
          try {
            await reorder.mutateAsync({ from: oldIndex, to: newIndex })
            setActionMsg('Programs reordered.')
          } catch (err) {
            if (previous !== undefined) qc.setQueryData(jpKey, previous)
            setActionErr(err instanceof Error ? err.message : 'Program action failed')
          }
        }}
      >
        <SortableContext items={sortableIds} strategy={verticalListSortingStrategy}>
          <div className={styles.list}>
            {pd.map((prog, pid) => (
              <SortableProgramRow
                key={pid}
                id={String(pid)}
                sortDisabled={reorder.isPending}
                prog={prog}
                pid={pid}
                stationNames={stationNames}
                stnDis={stnDis}
                nSta={nSta}
                setEditor={setEditor}
                toggleEn={toggleEn}
                toggleUwt={toggleUwt}
                del={del}
                runAction={runAction}
                stationOrder={stationOrder}
                showStationNum={prefs.showStationNum}
                onRunNow={(pid) => {
                  const row = pd[pid]
                  const uwt = row ? (flagUseWeather(row[0]) ? 1 : 0) : 1
                  setRunProgQo(2)
                  setRunProgUwt(uwt)
                  setRunProgramPid(pid)
                }}
              />
            ))}
          </div>
        </SortableContext>
        <DragOverlay dropAnimation={{ duration: 180, easing: 'cubic-bezier(0.25, 1, 0.5, 1)' }}>
          {activeDragId != null ? (
            <div className={styles.dragOverlayCard}>
              <span className={styles.dragOverlayTitle}>
                {pd[Number(activeDragId)]?.[5] || `Program ${Number(activeDragId) + 1}`}
              </span>
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>
    </div>
  )
}

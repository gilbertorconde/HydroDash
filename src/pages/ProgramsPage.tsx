import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type Dispatch,
  type ReactNode,
  type SetStateAction,
} from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
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
import {
  SortableContext,
  arrayMove,
  rectSortingStrategy,
  sortableKeyboardCoordinates,
  useSortable,
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
  useController,
  useManualStation,
  useRunProgram,
  useRunOnce,
  useStationStatus,
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
import {
  CONTROLLER_ACTION_UI_TIMEOUT_MS,
  isProgramActiveOnController,
  readQuickRunManualPid,
  stationMatchesProgramRuntime,
  writeQuickRunManualPid,
} from '../lib/opensprinklerRuntime'
import { isStationDisabled } from '../lib/stationDis'
import { useAppPreferences } from '../lib/appPreferences'
import { formatMinutesWall } from '../lib/formatLocale'
import { programGradient } from '../lib/schedulePreview'
import { findNextScheduledRun } from '../components/widgets/dashboardShared'
import {
  AdvancedSection,
  Button,
  EmptyState,
  ErrorBox,
  Input,
  Label,
  OverflowMenu,
  PageBody,
  PageHero,
  Pill,
  Segmented,
  Spinner,
  Switch,
} from '../components/ui'
import { useConfirm } from '../components/confirmContext'
import { DurationInput } from '../components/DurationInput'
import {
  CalendarClock,
  CalendarDays,
  CheckCircle2,
  Clock3,
  CloudSun,
  Droplets,
  Flower2,
  Leaf,
  ListChecks,
  MapPin,
  Pencil,
  Play,
  Plus,
  Repeat,
  Sprout,
  Square,
  Sun,
  Timer,
  Trash2,
  TreeDeciduous,
  X,
} from 'lucide-react'
import styles from './ProgramsPage.module.css'

const DAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
const FULL_DAY_NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']
const DEFAULT_OS_FROM = (1 << 5) + 1 // Jan 1
const DEFAULT_OS_TO = (12 << 5) + 31 // Dec 31
/** Icons cycled over program cards (decorative, by program number). */
const PROGRAM_ICONS = [Leaf, Sun, Sprout, Flower2, TreeDeciduous, Droplets]

const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(' ')

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

function describePick(p: StartPickState, is24Hour: boolean): string {
  if (p.mode === 'clock') return formatMinutesWall(p.clockMinutes, is24Hour)
  const ref = p.mode === 'sunrise' ? 'Sunrise' : 'Sunset'
  if (p.sunOffsetMin === 0) return `At ${ref.toLowerCase()}`
  const abs = Math.abs(p.sunOffsetMin)
  return `${abs} min ${p.sunOffsetMin > 0 ? 'after' : 'before'} ${ref.toLowerCase()}`
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

function summarizeWeekdays(days0: number): string {
  const active = DAY_NAMES.filter((_, idx) => ((days0 >> idx) & 1) === 1)
  if (active.length === 7) return 'Every day'
  if (active.length === 5 && ((days0 >> 5) & 3) === 0) return 'Weekdays'
  if (active.length === 2 && ((days0 >> 5) & 3) === 3) return 'Weekends'
  return active.length > 0 ? active.join(' · ') : 'No weekdays selected'
}

function summarizeDays(flag: number, days0: number, days1: number): string {
  const t = getProgramDayType(flag)
  if (t === 'weekly') return summarizeWeekdays(days0)
  if (t === 'interval') {
    return `Every ${days1} day(s), starting offset ${days0}`
  }
  if (t === 'monthly') {
    return days0 === 0 ? 'Last day of month' : `Day ${days0} of month`
  }
  const ep = unpackEpochDay16(days0, days1)
  return `Once · ${epochDaysToIsoDate(ep)}`
}

/**
 * Repeat settings of a repeating-type program (start type bit clear): start1 = count, start2 = interval
 * minutes. Returns null when the program does not actually repeat (controller stores -1 / 0 there).
 */
function repeatInfo(
  starts: [number, number, number, number],
  fixed: boolean,
): { count: number; intervalMin: number } | null {
  if (fixed) return null
  const count = Number.isFinite(starts[1]) ? Math.trunc(starts[1]) : 0
  const intervalMin = Number.isFinite(starts[2]) ? Math.trunc(starts[2]) : 0
  return count > 0 && intervalMin > 0 ? { count, intervalMin } : null
}

/** Start token label honouring the 12/24h preference (sun-relative tokens keep the codec label). */
function startLabel(token: number, is24Hour: boolean): string {
  const d = decodeStartToken(token)
  return d.kind === 'clock' ? formatMinutesWall(d.minutes, is24Hour) : formatStartTokenLabel(token)
}

function summarizeStarts(
  starts: [number, number, number, number],
  fixed: boolean,
  is24Hour: boolean,
): string {
  if (fixed) {
    const parts = starts
      .map((v) => (isStartDisabled(v) ? null : startLabel(v, is24Hour)))
      .filter(Boolean) as string[]
    return parts.length > 0 ? parts.join(' · ') : 'No start times'
  }
  if (isStartDisabled(starts[0])) return 'No start time'
  const first = startLabel(starts[0], is24Hour)
  const rep = repeatInfo(starts, fixed)
  return rep ? `${first}, then ${rep.count}× every ${rep.intervalMin} min` : first
}

/** Chip label for the start mode, kept consistent with `summarizeStarts`. */
function startModeShort(starts: [number, number, number, number], fixed: boolean): string {
  if (fixed) {
    const n = starts.filter((v) => !isStartDisabled(v)).length
    return n === 1 ? 'Fixed start time' : 'Fixed start times'
  }
  return repeatInfo(starts, fixed) ? 'Repeating runs' : 'Single start'
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

  const weekdays = parseWeeklyDays(days0)
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

/** One-line summary of everything that lives in the editor's Advanced section. */
function advancedSummary(e: ProgramEditorState): string {
  const parts: string[] = []
  if (e.dayType === 'weekly') parts.push('Weekly')
  else if (e.dayType === 'interval') parts.push(`Every ${e.intervalEvery} days`)
  else if (e.dayType === 'monthly') parts.push('Monthly')
  else parts.push('Single run')
  if (e.restriction !== 'none') parts.push(e.restriction === 'odd' ? 'odd days' : 'even days')
  if (e.primaryPick.mode !== 'clock') parts.push(`${e.primaryPick.mode} start`)
  if (e.startMode === 'fixed') {
    const n = 1 + e.fixedSlotOn.filter(Boolean).length
    parts.push(`${n} fixed starts`)
  } else if (e.repeatCount > 0) {
    parts.push(`repeats ×${e.repeatCount}`)
  }
  if (e.keepDateRange) parts.push('date range')
  return parts.join(' · ')
}

/* ---------- Local building blocks ---------- */

/** Text time input in the user's 12/24h format; keeps a draft while typing, commits valid values. */
function ClockInput({
  id,
  minutes,
  is24Hour,
  onChange,
  className,
}: {
  id: string
  minutes: number
  is24Hour: boolean
  onChange: (minutes: number) => void
  className?: string
}) {
  const [draft, setDraft] = useState<string | null>(null)
  const formatted = formatClockInput(minutes, is24Hour)
  const invalid = draft !== null && parseClockInput(draft, is24Hour) === null
  return (
    <Input
      id={id}
      className={cx(styles.clockInput, invalid && styles.inputInvalid, className)}
      type="text"
      inputMode={is24Hour ? 'numeric' : 'text'}
      autoComplete="off"
      placeholder={is24Hour ? '23:59' : '11:59 PM'}
      value={draft ?? formatted}
      aria-invalid={invalid || undefined}
      onChange={(e) => {
        setDraft(e.target.value)
        const m = parseClockInput(e.target.value, is24Hour)
        if (m !== null) onChange(m)
      }}
      onBlur={() => setDraft(null)}
    />
  )
}

/** Clock / Sunrise / Sunset reference with the matching time or offset input. */
function StartPickEditor({
  idPrefix,
  value,
  onChange,
  is24Hour,
  showClockInput = true,
}: {
  idPrefix: string
  value: StartPickState
  onChange: (next: StartPickState) => void
  is24Hour: boolean
  /** The first start's clock time is edited in the basic section, so Advanced hides it. */
  showClockInput?: boolean
}) {
  return (
    <div className={styles.startPick}>
      <Segmented
        label="Start reference"
        value={value.mode}
        onChange={(mode) => onChange({ ...value, mode })}
        options={[
          { value: 'clock', label: 'Clock' },
          { value: 'sunrise', label: 'Sunrise' },
          { value: 'sunset', label: 'Sunset' },
        ]}
      />
      {value.mode === 'clock' ? (
        showClockInput ? (
          <ClockInput
            id={`${idPrefix}-clock`}
            minutes={value.clockMinutes}
            is24Hour={is24Hour}
            onChange={(clockMinutes) => onChange({ ...value, mode: 'clock', clockMinutes })}
          />
        ) : null
      ) : (
        <div className={styles.offsetRow}>
          <label htmlFor={`${idPrefix}-off`} className={styles.srOnly}>
            Offset minutes from {value.mode}
          </label>
          <Input
            id={`${idPrefix}-off`}
            className={styles.offsetInput}
            type="number"
            min={-720}
            max={720}
            value={value.sunOffsetMin}
            title={`Minutes after ${value.mode} (negative = before)`}
            onChange={(e) => onChange({ ...value, sunOffsetMin: parseInt(e.target.value, 10) || 0 })}
          />
          <span className={styles.offsetSuffix}>min from {value.mode}</span>
        </div>
      )}
    </div>
  )
}

const QUEUE_OPTIONS = [
  { qo: 2, title: 'Run now, cancel others', desc: 'Replace: stops anything running or queued.' },
  { qo: 1, title: 'Run now, pause others', desc: 'Insert: others resume afterwards.' },
  { qo: 0, title: 'Run after others', desc: 'Append: waits for the current queue to finish.' },
] as const

function queueLabel(qo: number): string {
  return QUEUE_OPTIONS.find((o) => o.qo === qo)?.title ?? 'Run now, cancel others'
}

/** Queue behaviour (`qo`) as radio cards, kept in an Advanced section. */
function QueuePicker({
  name,
  value,
  onChange,
  disabled,
}: {
  name: string
  value: number
  onChange: (qo: number) => void
  disabled?: boolean
}) {
  return (
    <AdvancedSection
      id={`programs-${name}-queue`}
      title="Queue behaviour"
      description={`Currently: ${queueLabel(value).toLowerCase()}`}
    >
      <fieldset className={styles.radioCards} disabled={disabled}>
        <legend className={styles.srOnly}>Queue</legend>
        {QUEUE_OPTIONS.map((o) => (
          <label key={o.qo} className={cx(styles.radioCard, value === o.qo && styles.radioCardOn)}>
            <input
              type="radio"
              name={name}
              className={styles.radioInput}
              checked={value === o.qo}
              onChange={() => onChange(o.qo)}
            />
            <span className={styles.radioDot} aria-hidden />
            <span className={styles.radioText}>
              <span className={styles.radioTitle}>{o.title}</span>
              <span className={styles.radioDesc}>{o.desc}</span>
            </span>
          </label>
        ))}
      </fieldset>
    </AdvancedSection>
  )
}

/**
 * Modal sheet: full-screen on phones (`full`) or a bottom sheet (`auto`), centered dialog on
 * desktop. Esc / backdrop click / × close it; header and footer stay put while the body scrolls.
 */
function Sheet({
  title,
  subtitle,
  icon,
  iconBackground,
  size = 'auto',
  onClose,
  footer,
  children,
}: {
  title: ReactNode
  subtitle?: ReactNode
  icon?: ReactNode
  iconBackground?: string
  size?: 'auto' | 'full'
  onClose: () => void
  footer?: ReactNode
  children: ReactNode
}) {
  const titleId = useId()
  const panelRef = useRef<HTMLDivElement>(null)
  const onCloseRef = useRef(onClose)
  useEffect(() => {
    onCloseRef.current = onClose
  }, [onClose])

  useEffect(() => {
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const prevFocus = document.activeElement as HTMLElement | null
    panelRef.current?.focus({ preventScroll: true })
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onCloseRef.current()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.body.style.overflow = prevOverflow
      document.removeEventListener('keydown', onKeyDown)
      prevFocus?.focus?.({ preventScroll: true })
    }
  }, [])

  return createPortal(
    <div className={styles.sheetOverlay} onClick={onClose} role="presentation">
      <div
        ref={panelRef}
        tabIndex={-1}
        className={cx(styles.sheet, size === 'full' && styles.sheetFull)}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
      >
        <header className={styles.sheetHeader}>
          {icon ? (
            <span className={styles.sheetIcon} style={iconBackground ? { background: iconBackground } : undefined}>
              {icon}
            </span>
          ) : null}
          <div className={styles.sheetHeading}>
            <h2 id={titleId} className={styles.sheetTitle}>
              {title}
            </h2>
            {subtitle ? <p className={styles.sheetSubtitle}>{subtitle}</p> : null}
          </div>
          <button type="button" className={styles.sheetClose} aria-label="Close" onClick={onClose}>
            <X size={20} aria-hidden />
          </button>
        </header>
        <div className={styles.sheetBody}>{children}</div>
        {footer ? <footer className={styles.sheetFooter}>{footer}</footer> : null}
      </div>
    </div>,
    document.body,
  )
}

/** Titled group inside a sheet. */
function SheetSection({
  title,
  icon,
  aside,
  children,
}: {
  title: ReactNode
  icon?: ReactNode
  aside?: ReactNode
  children: ReactNode
}) {
  return (
    <section className={styles.sheetSection}>
      <div className={styles.sheetSectionHead}>
        <h3 className={styles.sheetSectionTitle}>
          {icon}
          {title}
        </h3>
        {aside ? <div className={styles.sheetSectionAside}>{aside}</div> : null}
      </div>
      {children}
    </section>
  )
}

/* ---------- Program card ---------- */

function SortableProgramCard({
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
  onProgramStop,
  programRunning,
  runNowBlocked,
  stopProgramStationsPending,
  stationOrder,
  showStationNum,
  is24Hour,
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
  runAction: (task: () => Promise<unknown>, successMessage: string) => Promise<boolean>
  onRunNow: (pid: number) => void
  onProgramStop: (pid: number) => void
  programRunning: boolean
  runNowBlocked: boolean
  stopProgramStationsPending: boolean
  stationOrder: number[]
  showStationNum: boolean
  is24Hour: boolean
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
  const confirm = useConfirm()

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

  const displayName = name || `Program ${pid + 1}`
  const repeating = !fixed && repeatInfo(starts, fixed) !== null
  const Icon = PROGRAM_ICONS[pid % PROGRAM_ICONS.length] ?? Leaf

  const menuItems = [
    {
      label: 'Duplicate as new',
      onSelect: () => {
        const row = cloneProgram(prog)
        const copy = createEditorState(row, -1, nSta)
        setEditor({
          ...copy,
          name: `${copy.name || `Program ${pid + 1}`} copy`,
        })
      },
    },
    {
      label: uwt ? 'Turn off weather adjustment' : 'Turn on weather adjustment',
      disabled: toggleUwt.isPending,
      onSelect: () =>
        void runAction(
          () => toggleUwt.mutateAsync({ pid, uwt: uwt ? 0 : 1 }),
          uwt ? 'Weather adjustment disabled.' : 'Weather adjustment enabled.',
        ),
    },
    {
      label: en ? 'Turn off program' : 'Turn on program',
      disabled: toggleEn.isPending,
      onSelect: () =>
        void runAction(
          () => toggleEn.mutateAsync({ pid, en: en ? 0 : 1 }),
          en ? 'Program disabled.' : 'Program enabled.',
        ),
    },
    {
      label: 'Delete program',
      danger: true,
      disabled: del.isPending,
      onSelect: async () => {
        const ok = await confirm({
          title: `Delete “${displayName}”?`,
          message: 'The program and its schedule are removed from the controller. This cannot be undone.',
          confirmLabel: 'Delete program',
          tone: 'danger',
        })
        if (ok) void runAction(() => del.mutateAsync(pid), 'Program deleted.')
      },
    },
  ]

  return (
    <article
      ref={setNodeRef}
      style={style}
      className={cx(
        styles.programCard,
        !en && styles.programCardOff,
        programRunning && styles.programCardRunning,
        isDragging && styles.programCardDragging,
      )}
      aria-label={displayName}
    >
      <header className={styles.programHead}>
        <span
          className={styles.programIcon}
          style={en ? { background: programGradient(pid) } : undefined}
          aria-hidden
        >
          <Icon size={22} strokeWidth={2.1} />
        </span>
        <div className={styles.programHeading}>
          <h2 className={styles.programName}>{displayName}</h2>
          <div className={styles.programPills}>
            {programRunning ? (
              <Pill tone="success" icon={<span className={styles.liveDot} aria-hidden />}>
                Running
              </Pill>
            ) : null}
            <span
              title={
                en
                  ? 'Program is enabled and can run on its schedule.'
                  : 'Program is disabled and will not run.'
              }
            >
              <Pill tone={en ? 'accent' : 'neutral'}>{en ? 'Enabled' : 'Disabled'}</Pill>
            </span>
            <span className={styles.programNumber}>#{pid + 1}</span>
          </div>
        </div>
        <div className={styles.programHeadActions}>
          <OverflowMenu items={menuItems} label={`More actions for ${displayName}`} />
          <button
            type="button"
            ref={setActivatorNodeRef}
            className={styles.dragHandle}
            aria-label={`Drag to reorder ${displayName}`}
            {...attributes}
            {...listeners}
          >
            <svg width="14" height="18" viewBox="0 0 14 18" aria-hidden>
              <circle cx="4" cy="4" r="1.75" fill="currentColor" />
              <circle cx="10" cy="4" r="1.75" fill="currentColor" />
              <circle cx="4" cy="9" r="1.75" fill="currentColor" />
              <circle cx="10" cy="9" r="1.75" fill="currentColor" />
              <circle cx="4" cy="14" r="1.75" fill="currentColor" />
              <circle cx="10" cy="14" r="1.75" fill="currentColor" />
            </svg>
          </button>
        </div>
      </header>

      {/* Only the details are muted for disabled programs; actions below stay full strength. */}
      <div className={cx(styles.programDetails, !en && styles.muted)}>
        <dl className={styles.metaTiles}>
          <div className={styles.metaTile}>
            <dt>
              <CalendarDays size={13} aria-hidden />
              Days
            </dt>
            <dd>{summarizeDays(flag, days0, days1)}</dd>
          </div>
          <div className={styles.metaTile}>
            <dt>
              <Clock3 size={13} aria-hidden />
              Starts
            </dt>
            <dd>{summarizeStarts(starts, fixed, is24Hour)}</dd>
          </div>
          <div className={styles.metaTile}>
            <dt>
              <Timer size={13} aria-hidden />
              Total
            </dt>
            <dd>{formatDuration(totalDurationSeconds)}</dd>
          </div>
        </dl>

        <ul className={styles.tagList} aria-label="How this program is configured to run">
          {uwt ? (
            <li className={styles.tag}>
              <CloudSun size={13} aria-hidden />
              Weather adjust on
            </li>
          ) : null}
          <li className={styles.tag}>
            <CalendarDays size={13} aria-hidden />
            {dayTypeShort(flag)}
          </li>
          <li className={styles.tag}>
            {repeating ? <Repeat size={13} aria-hidden /> : <ListChecks size={13} aria-hidden />}
            {startModeShort(starts, fixed)}
          </li>
          {rest ? <li className={styles.tag}>{rest}</li> : null}
          {dr ? (
            <li className={styles.tag} title="Only runs within this date range">
              <MapPin size={13} aria-hidden />
              {formatOsDateMmDd(range[1])} → {formatOsDateMmDd(range[2])}
            </li>
          ) : null}
        </ul>

        <div className={styles.zoneBlock}>
          <p className={styles.zoneLabel}>Zones</p>
          {activeZones.length === 0 ? (
            <p className={styles.mutedText}>No active zones in this program.</p>
          ) : (
            <ul className={styles.zoneChips}>
              {activeZones.map(({ idx, seconds }) => (
                <li
                  key={idx}
                  className={cx(styles.zoneChip, isStationDisabled(stnDis, idx) && styles.zoneChipMuted)}
                >
                  <span className={styles.zoneChipName}>
                    {stationDisplayName(idx, stationNames, showStationNum)}
                  </span>
                  <span className={styles.zoneChipDur}>{formatDuration(seconds)}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <div className={styles.programActions}>
        {programRunning ? (
          <Button
            variant="danger"
            startIcon={<Square size={15} aria-hidden />}
            disabled={stopProgramStationsPending}
            onClick={() => onProgramStop(pid)}
          >
            Stop
          </Button>
        ) : (
          <Button
            variant="primary"
            startIcon={<Play size={15} aria-hidden />}
            disabled={runNowBlocked}
            onClick={() => onRunNow(pid)}
          >
            Run now
          </Button>
        )}
        <Button
          variant="secondary"
          startIcon={<Pencil size={15} aria-hidden />}
          onClick={() => setEditor(createEditorState(prog, pid, nSta))}
        >
          Edit
        </Button>
      </div>
    </article>
  )
}

/* ---------- Page ---------- */

export function ProgramsPage() {
  const qc = useQueryClient()
  const navigate = useNavigate()
  const pr = useProgramsQuery()
  const jn = useStationsMeta()
  const toggleEn = useProgramToggle()
  const toggleUwt = useProgramUwt()
  const del = useDeleteProgram()
  const confirm = useConfirm()
  const reorder = useReorderPrograms()
  const mp = useRunProgram()
  const cr = useRunOnce()
  const save = useSaveProgram()
  const jc = useController(5000)
  const js = useStationStatus(4000)
  const manualStation = useManualStation()
  const prefs = useAppPreferences()

  const pd = useMemo(
    () => (pr.data?.pd as ProgramRow[] | undefined) ?? [],
    [pr.data?.pd],
  )
  const stationNames = useMemo(
    () => (jn.data?.snames as string[] | undefined) ?? [],
    [jn.data?.snames],
  )
  const stnDis = useMemo(
    () => jn.data?.stn_dis as number[] | undefined,
    [jn.data?.stn_dis],
  )
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
  const [startingProgramPid, setStartingProgramPid] = useState<number | null>(null)
  const progStartWatchdogRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [manualQuickRunPid, setManualQuickRunPid] = useState<number | null>(() => readQuickRunManualPid())
  const [runProgQo, setRunProgQo] = useState(2)
  const [runProgUwt, setRunProgUwt] = useState<0 | 1>(1)
  const [editor, setEditor] = useState<ProgramEditorState | null>(null)
  /** Avoid `createPortal` during SSR; no setState-in-effect (see react-hooks/set-state-in-effect). */
  const portalReady = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  )
  const [runDurs, setRunDurs] = useState<number[]>([])
  const [actionMsg, setActionMsg] = useState<string | null>(null)
  const [actionErr, setActionErr] = useState<string | null>(null)
  const [activeDragId, setActiveDragId] = useState<string | null>(null)

  const runningProgramPids = useMemo(() => {
    const ps = jc.data?.ps as [number, number, number, number][] | undefined
    const sn = js.data?.sn ?? []
    const next = new Set<number>()
    for (let pid = 0; pid < pd.length; pid++) {
      if (isProgramActiveOnController(pid, pd, ps, sn, nSta, manualQuickRunPid)) next.add(pid)
    }
    return next
  }, [pd, jc.data?.ps, js.data?.sn, nSta, manualQuickRunPid])

  const nextRun = useMemo(
    () =>
      findNextScheduledRun(
        pd,
        jc.data?.devt,
        Number(jc.data?.sunrise ?? 360),
        Number(jc.data?.sunset ?? 1080),
      ),
    [pd, jc.data?.devt, jc.data?.sunrise, jc.data?.sunset],
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
        tasks.push(manualStation.mutateAsync({ sid, en: 0 }))
      }
      await Promise.all(tasks)
      setManualQuickRunPid((m) => {
        if (m !== pid) return m
        writeQuickRunManualPid(null)
        return null
      })
    },
    [pd, jc.data?.ps, js.data?.sn, nSta, manualStation, manualQuickRunPid],
  )

  useEffect(() => {
    if (startingProgramPid === null) return
    const ps = jc.data?.ps as [number, number, number, number][] | undefined
    const sn = js.data?.sn ?? []
    if (!isProgramActiveOnController(startingProgramPid, pd, ps, sn, nSta, manualQuickRunPid)) return
    if (progStartWatchdogRef.current) {
      clearTimeout(progStartWatchdogRef.current)
      progStartWatchdogRef.current = null
    }
    queueMicrotask(() => {
      setStartingProgramPid(null)
      setRunProgramPid(null)
    })
  }, [startingProgramPid, jc.data?.ps, js.data?.sn, pd, nSta, manualQuickRunPid])

  useEffect(() => {
    if (startingProgramPid === null) return
    progStartWatchdogRef.current = setTimeout(() => {
      progStartWatchdogRef.current = null
      setStartingProgramPid(null)
      setRunProgramPid(null)
      setActionMsg(null)
      setActionErr('Timed out waiting for the controller to report this program as running.')
    }, CONTROLLER_ACTION_UI_TIMEOUT_MS)
    return () => {
      if (progStartWatchdogRef.current) {
        clearTimeout(progStartWatchdogRef.current)
        progStartWatchdogRef.current = null
      }
    }
  }, [startingProgramPid])

  const sortableIds = useMemo(() => pd.map((_, i) => String(i)), [pd])
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  const normalizedRunDurs = useMemo(
    () => Array.from({ length: nSta }, (_, i) => runDurs[i] ?? 0),
    [nSta, runDurs],
  )
  const runOnceTotalSeconds = useMemo(
    () => stationOrder.reduce((sum, i) => sum + (normalizedRunDurs[i] ?? 0), 0),
    [stationOrder, normalizedRunDurs],
  )

  const editorTotalRunSeconds = useMemo(() => {
    if (!editor) return 0
    return editor.durations.reduce((sum, d, i) => {
      if (isStationDisabled(stnDis, i)) return sum
      return sum + Math.max(0, d)
    }, 0)
  }, [editor, stnDis])

  const err = pr.error instanceof Error ? pr.error.message : null

  /** Runs a mutation, reporting success / failure in the page (and open sheet) banner. */
  async function runAction(task: () => Promise<unknown>, successMessage: string): Promise<boolean> {
    setActionErr(null)
    setActionMsg(null)
    try {
      await task()
      setActionMsg(successMessage)
      return true
    } catch (e) {
      setActionErr(e instanceof Error ? e.message : 'Program action failed')
      return false
    }
  }

  function closeEditor() {
    setEditor(null)
    setActionErr(null)
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
    const ok = await runAction(
      () => save.mutateAsync(payload),
      editor.pid >= 0 ? 'Program saved.' : 'Program created.',
    )
    // Keep the sheet open on failure so the edits are not lost; the error shows inside it.
    if (ok) setEditor(null)
  }

  function patchEditor(patch: Partial<ProgramEditorState>) {
    setEditor((s) => (s ? { ...s, ...patch } : s))
  }

  const runModalStarting =
    runProgramPid !== null &&
    startingProgramPid === runProgramPid &&
    !runningProgramPids.has(runProgramPid)

  const enabledCount = pd.filter((row) => flagEnabled(row[0])).length
  const runningNames = [...runningProgramPids].map((p) => pd[p]?.[5] || `Program ${p + 1}`)
  const nextLabel = nextRun
    ? `${nextRun.name} ${
        nextRun.dayOffset === 0
          ? 'at'
          : nextRun.dayOffset === 1
            ? 'tomorrow'
            : FULL_DAY_NAMES[(nextRun.weekday + 6) % 7]
      } ${formatMinutesWall(nextRun.startMin, prefs.is24Hour)}`
    : null
  const heroSubtitle = pr.isLoading
    ? 'Loading programs…'
    : pd.length === 0
      ? 'No programs yet'
      : [`${enabledCount} active`, nextLabel ? `next: ${nextLabel}` : null].filter(Boolean).join(' · ')

  const sheetOpen = editor !== null || runOnceOpen || runProgramPid !== null
  const sheetBanner = actionErr ? <ErrorBox message={actionErr} /> : null
  const runProgramRow = runProgramPid !== null ? pd[runProgramPid] : undefined
  const runProgramName =
    runProgramPid !== null ? runProgramRow?.[5] || `Program ${runProgramPid + 1}` : ''
  const enabledZoneIds = stationOrder.filter((idx) => !isStationDisabled(stnDis, idx))
  const allZonesDisabled = Array.from({ length: nSta }, (_, i) => i).every((i) =>
    isStationDisabled(stnDis, i),
  )

  return (
    <>
      <PageHero
        title="Programs"
        eyebrow={
          runningNames.length > 0 ? (
            <Pill tone="glass" icon={<span className={styles.liveDot} aria-hidden />}>
              Running · {runningNames.join(', ')}
            </Pill>
          ) : undefined
        }
        subtitle={heroSubtitle}
        actions={
          <>
            <Button
              variant="light"
              startIcon={<Plus size={17} aria-hidden />}
              onClick={() => {
                setActionErr(null)
                setEditor(createEditorState(null, -1, nSta))
              }}
            >
              New program
            </Button>
            <Button
              variant="glass"
              startIcon={<Play size={16} aria-hidden />}
              onClick={() => {
                setActionErr(null)
                setRunOnceQo(2)
                setRunOnceUwt(0)
                setRunOnceOpen(true)
              }}
            >
              Run once
            </Button>
            <Button
              variant="glass"
              startIcon={<CalendarClock size={16} aria-hidden />}
              onClick={() => void navigate({ to: '/preview' })}
            >
              Day preview
            </Button>
          </>
        }
      />
      <PageBody>
        {err ? <ErrorBox message={err} /> : null}
        {!sheetOpen && actionErr ? <ErrorBox message={actionErr} /> : null}
        {actionMsg ? (
          <p className={styles.ok} role="status">
            <CheckCircle2 size={17} aria-hidden />
            {actionMsg}
          </p>
        ) : null}
        {pr.isLoading ? (
          <div className={styles.loading}>
            <Spinner />
          </div>
        ) : null}

        {!pr.isLoading && !err && pd.length === 0 ? (
          <div className={styles.emptyCard}>
            <EmptyState
              icon={<CalendarDays size={26} aria-hidden />}
              title="No programs yet"
              description="Programs water your zones automatically on the days and times you choose."
              action={
                <Button
                  startIcon={<Plus size={17} aria-hidden />}
                  onClick={() => setEditor(createEditorState(null, -1, nSta))}
                >
                  New program
                </Button>
              }
            />
          </div>
        ) : null}

        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
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
          <SortableContext items={sortableIds} strategy={rectSortingStrategy}>
            <div className={styles.list}>
              {pd.map((prog, pid) => (
                <SortableProgramCard
                  key={pid}
                  id={String(pid)}
                  sortDisabled={reorder.isPending}
                  prog={prog}
                  pid={pid}
                  stationNames={stationNames}
                  stnDis={stnDis}
                  nSta={nSta}
                  setEditor={(next) => {
                    setActionErr(null)
                    setEditor(next)
                  }}
                  toggleEn={toggleEn}
                  toggleUwt={toggleUwt}
                  del={del}
                  runAction={runAction}
                  stationOrder={stationOrder}
                  showStationNum={prefs.showStationNum}
                  is24Hour={prefs.is24Hour}
                  programRunning={runningProgramPids.has(pid)}
                  runNowBlocked={startingProgramPid !== null}
                  stopProgramStationsPending={manualStation.isPending}
                  onProgramStop={(p) => {
                    const row = pd[p]
                    const label = row?.[5]?.trim() ? String(row[5]) : `Program ${p + 1}`
                    void runAction(() => stopProgramStations(p), `Program “${label}” stopped.`)
                  }}
                  onRunNow={(pid) => {
                    const row = pd[pid]
                    const uwt = row ? (flagUseWeather(row[0]) ? 1 : 0) : 1
                    setActionErr(null)
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
                <span
                  className={styles.dragOverlayIcon}
                  style={{ background: programGradient(Number(activeDragId)) }}
                  aria-hidden
                />
                <span className={styles.dragOverlayTitle}>
                  {pd[Number(activeDragId)]?.[5] || `Program ${Number(activeDragId) + 1}`}
                </span>
              </div>
            ) : null}
          </DragOverlay>
        </DndContext>
        {pd.length > 1 ? (
          <p className={styles.reorderHint}>Drag the ⠿ handle to change the program order (and numbering).</p>
        ) : null}
      </PageBody>

      {/* ---------- Run program sheet ---------- */}
      {portalReady && runProgramPid !== null ? (
        <Sheet
          title={`Run ${runProgramName}`}
          subtitle={`Program #${runProgramPid + 1}`}
          icon={<Play size={20} aria-hidden />}
          iconBackground={programGradient(runProgramPid)}
          onClose={() => {
            if (!runModalStarting) setRunProgramPid(null)
          }}
          footer={
            <>
              <Button variant="ghost" disabled={runModalStarting} onClick={() => setRunProgramPid(null)}>
                Cancel
              </Button>
              <Button
                disabled={mp.isPending || runModalStarting}
                aria-busy={runModalStarting}
                startIcon={runModalStarting ? <Spinner /> : <Play size={16} aria-hidden />}
                onClick={() => {
                  const pid = runProgramPid
                  if (pid == null) return
                  void runAction(async () => {
                    setStartingProgramPid(pid)
                    try {
                      await mp.mutateAsync({ pid, uwt: runProgUwt, qo: runProgQo })
                      setManualQuickRunPid(pid)
                      writeQuickRunManualPid(pid)
                    } catch (e) {
                      setStartingProgramPid(null)
                      throw e
                    }
                  }, 'Program started.')
                }}
              >
                {runModalStarting ? 'Starting…' : 'Start program'}
              </Button>
            </>
          }
        >
          {sheetBanner}
          {runProgramRow ? (
            <p className={styles.sheetLead}>
              Scheduled {summarizeStarts(runProgramRow[3], flagFixedStart(runProgramRow[0]), prefs.is24Hour)} ·{' '}
              {formatDuration(stationOrder.reduce((sum, idx) => sum + (runProgramRow[4][idx] ?? 0), 0))} in
              total. Starting it now runs each of its zones once.
            </p>
          ) : null}
          <div className={styles.switchCard}>
            <Switch
              checked={runProgUwt === 1}
              disabled={runModalStarting}
              onChange={(on) => setRunProgUwt(on ? 1 : 0)}
              label="Use weather adjustment"
              description="Scale durations by the current watering level."
            />
          </div>
          <QueuePicker
            name="prog-qo"
            value={runProgQo}
            onChange={setRunProgQo}
            disabled={runModalStarting}
          />
        </Sheet>
      ) : null}

      {/* ---------- Run-once sheet ---------- */}
      {portalReady && runOnceOpen ? (
        <Sheet
          title="Run once"
          subtitle="Water chosen zones one time, without saving a program"
          icon={<Play size={20} aria-hidden />}
          size="full"
          onClose={() => setRunOnceOpen(false)}
          footer={
            <>
              <span className={styles.footerTotal}>
                Total <strong>{formatDuration(runOnceTotalSeconds)}</strong>
              </span>
              <Button variant="ghost" onClick={() => setRunOnceOpen(false)}>
                Cancel
              </Button>
              <Button
                disabled={cr.isPending}
                startIcon={<Play size={16} aria-hidden />}
                onClick={async () => {
                  const ok = await runAction(
                    () =>
                      cr.mutateAsync({
                        t: JSON.stringify(normalizedRunDurs),
                        uwt: runOnceUwt,
                        qo: runOnceQo,
                      }),
                    'Run-once started.',
                  )
                  if (ok) setRunOnceOpen(false)
                }}
              >
                Start run-once
              </Button>
            </>
          }
        >
          {sheetBanner}
          <div className={styles.switchCard}>
            <Switch
              checked={runOnceUwt === 1}
              onChange={(on) => setRunOnceUwt(on ? 1 : 0)}
              label="Use weather adjustment for this run"
              description="Scale the durations below by the current watering level."
            />
          </div>
          <SheetSection
            title="Zone durations"
            icon={<Droplets size={16} aria-hidden />}
            aside={
              <div className={styles.inlineActions}>
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => setRunDurs(Array.from({ length: nSta }, () => 300))}
                >
                  Set all to 5 min
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setRunDurs(Array.from({ length: nSta }, () => 0))}
                >
                  Clear all
                </Button>
              </div>
            }
          >
            <p className={styles.sectionHint}>0 skips the zone.</p>
            <div className={styles.zoneEditGrid}>
              {stationOrder.map((i) => {
                const v = normalizedRunDurs[i] ?? 0
                const name = stationDisplayName(i, stationNames, prefs.showStationNum)
                return (
                  <div
                    key={i}
                    className={cx(
                      styles.zoneEdit,
                      v > 0 && styles.zoneEditActive,
                      isStationDisabled(stnDis, i) && styles.zoneEditMuted,
                    )}
                  >
                    <div className={styles.zoneEditHead}>
                      <span className={styles.zoneEditName}>{name}</span>
                      <span className={styles.zoneEditDur}>{v > 0 ? formatDuration(v) : 'Skip'}</span>
                    </div>
                    <DurationInput
                      idBase={`run-once-${i}`}
                      label={`Run duration for ${name}`}
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
                  </div>
                )
              })}
            </div>
          </SheetSection>
          <QueuePicker name="runonce-qo" value={runOnceQo} onChange={setRunOnceQo} />
        </Sheet>
      ) : null}

      {/* ---------- Program editor sheet ---------- */}
      {portalReady && editor ? (
        <Sheet
          title={editor.pid >= 0 ? 'Edit program' : 'New program'}
          subtitle={
            editor.pid >= 0
              ? `Program #${editor.pid + 1}${editor.name.trim() ? ` · ${editor.name.trim()}` : ''}`
              : 'Choose days, a start time and how long each zone waters'
          }
          icon={<CalendarDays size={20} aria-hidden />}
          iconBackground={programGradient(editor.pid >= 0 ? editor.pid : pd.length)}
          size="full"
          onClose={closeEditor}
          footer={
            <>
              <span className={styles.footerTotal}>
                Total <strong>{formatDuration(editorTotalRunSeconds)}</strong>
              </span>
              <Button variant="ghost" onClick={closeEditor}>
                Cancel
              </Button>
              <Button disabled={save.isPending} onClick={saveEditor}>
                {editor.pid >= 0 ? 'Save' : 'Create program'}
              </Button>
            </>
          }
        >
          {sheetBanner}

          <SheetSection title="Basics">
            <div className={styles.nameRow}>
              <div className={styles.nameField}>
                <Label htmlFor="program-name">Program name</Label>
                <Input
                  id="program-name"
                  value={editor.name}
                  maxLength={32}
                  placeholder={editor.pid >= 0 ? `Program ${editor.pid + 1}` : 'e.g. Morning lawn'}
                  onChange={(e) => patchEditor({ name: e.target.value })}
                />
              </div>
              <div className={styles.enabledField}>
                <Switch
                  checked={editor.enabled}
                  onChange={(enabled) => patchEditor({ enabled })}
                  label="Enabled"
                  description={editor.enabled ? 'Runs on its schedule' : 'Never runs on its own'}
                />
              </div>
            </div>
          </SheetSection>

          <SheetSection title="When" icon={<CalendarDays size={16} aria-hidden />}>
            <div className={styles.whenGrid}>
              <div className={styles.whenDays}>
                <p className={styles.fieldLabel}>Days</p>
                {editor.dayType === 'weekly' ? (
                  <>
                    <div className={styles.dayChips} role="group" aria-label="Days of the week">
                      {DAY_NAMES.map((day, idx) => (
                        <button
                          key={day}
                          type="button"
                          className={cx(styles.dayChip, editor.weekdays[idx] && styles.dayChipOn)}
                          aria-pressed={editor.weekdays[idx]}
                          aria-label={FULL_DAY_NAMES[idx]}
                          title={FULL_DAY_NAMES[idx]}
                          onClick={() =>
                            setEditor((s) => {
                              if (!s) return s
                              const next = [...s.weekdays]
                              next[idx] = !next[idx]
                              return { ...s, weekdays: next }
                            })
                          }
                        >
                          {day}
                        </button>
                      ))}
                    </div>
                    <div className={styles.dayPresets}>
                      <button
                        type="button"
                        className={styles.linkBtn}
                        onClick={() => patchEditor({ weekdays: [true, true, true, true, true, true, true] })}
                      >
                        Every day
                      </button>
                      <button
                        type="button"
                        className={styles.linkBtn}
                        onClick={() => patchEditor({ weekdays: [true, true, true, true, true, false, false] })}
                      >
                        Weekdays
                      </button>
                      <button
                        type="button"
                        className={styles.linkBtn}
                        onClick={() => patchEditor({ weekdays: [true, false, true, false, true, false, false] })}
                      >
                        Mon · Wed · Fri
                      </button>
                    </div>
                  </>
                ) : (
                  <p className={styles.noteBox}>
                    {editor.dayType === 'interval'
                      ? `Every ${editor.intervalEvery} days (starting in ${editor.intervalStarting}).`
                      : editor.dayType === 'monthly'
                        ? editor.monthlyDay === 0
                          ? 'Last day of each month.'
                          : `Day ${editor.monthlyDay} of each month.`
                        : `Once, on ${epochDaysToIsoDate(editor.singleEpochDay)}.`}{' '}
                    Change the schedule type under <strong>Advanced</strong>.
                  </p>
                )}
              </div>
              <div className={styles.whenStart}>
                {editor.primaryPick.mode === 'clock' ? (
                  <>
                    <Label htmlFor="primary-clock">First start</Label>
                    <ClockInput
                      id="primary-clock"
                      minutes={editor.primaryPick.clockMinutes}
                      is24Hour={prefs.is24Hour}
                      onChange={(clockMinutes) =>
                        patchEditor({ primaryPick: { ...editor.primaryPick, mode: 'clock', clockMinutes } })
                      }
                    />
                  </>
                ) : (
                  <>
                    <p className={styles.fieldLabel}>First start</p>
                    <p className={styles.noteBox}>
                      <strong>{describePick(editor.primaryPick, prefs.is24Hour)}</strong>. Sun-relative starts
                      are set under <strong>Advanced</strong>.
                    </p>
                  </>
                )}
                {editor.startMode === 'fixed' && editor.fixedSlotOn.some(Boolean) ? (
                  <p className={styles.sectionHint}>
                    <Clock3 size={12} aria-hidden /> Plus {editor.fixedSlotOn.filter(Boolean).length} more fixed
                    start time(s) in Advanced.
                  </p>
                ) : editor.startMode === 'repeating' && editor.repeatCount > 0 ? (
                  <p className={styles.sectionHint}>
                    <Repeat size={12} aria-hidden /> Then repeats {editor.repeatCount}× every{' '}
                    {editor.repeatIntervalMin} min (Advanced).
                  </p>
                ) : null}
              </div>
            </div>
          </SheetSection>

          <SheetSection
            title="Zone durations"
            icon={<Droplets size={16} aria-hidden />}
            aside={<Pill tone="accent">{formatDuration(editorTotalRunSeconds)} total</Pill>}
          >
            {allZonesDisabled ? (
              <p className={styles.noteBox}>
                No enabled zones. Turn zones back on under <strong>Zones</strong> to assign durations here.
              </p>
            ) : (
              <>
                <div className={styles.quickSet} role="group" aria-labelledby="quickset-dur-label">
                  <span className={styles.quickSetLabel} id="quickset-dur-label">
                    Set all zones to
                  </span>
                  <DurationInput
                    idBase="prog-quickset"
                    label="Duration for all zones"
                    valueSeconds={editor.quickSetDurationSeconds}
                    maxSeconds={64800}
                    onChange={(sec) => patchEditor({ quickSetDurationSeconds: sec })}
                  />
                  <Button
                    type="button"
                    size="sm"
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
                <div className={styles.zoneEditGrid}>
                  {enabledZoneIds.map((idx) => {
                    const v = editor.durations[idx] ?? 0
                    const name = stationDisplayName(idx, stationNames, prefs.showStationNum)
                    return (
                      <div key={idx} className={cx(styles.zoneEdit, v > 0 && styles.zoneEditActive)}>
                        <div className={styles.zoneEditHead}>
                          <span className={styles.zoneEditName}>{name}</span>
                          <span className={styles.zoneEditDur}>{v > 0 ? formatDuration(v) : 'Off'}</span>
                        </div>
                        <DurationInput
                          idBase={`editor-zone-${idx}`}
                          label={`Duration for ${name}`}
                          valueSeconds={v}
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
                      </div>
                    )
                  })}
                </div>
              </>
            )}
          </SheetSection>

          <div className={styles.switchCard}>
            <Switch
              checked={editor.useWeather}
              onChange={(useWeather) => patchEditor({ useWeather })}
              label="Use weather adjustment"
              description="Scale durations by the watering level from your weather settings."
            />
          </div>

          <AdvancedSection
            id="program-editor-advanced"
            title="Advanced scheduling"
            description={advancedSummary(editor)}
          >
            <div className={styles.advGroup}>
              <p className={styles.advLabel}>Schedule type</p>
              <Segmented
                label="Schedule type"
                value={editor.dayType}
                onChange={(dayType) => patchEditor({ dayType })}
                options={[
                  { value: 'weekly', label: 'Weekly' },
                  { value: 'interval', label: 'Interval' },
                  { value: 'single', label: 'Single run' },
                  { value: 'monthly', label: 'Monthly' },
                ]}
              />
              {editor.dayType === 'interval' ? (
                <div className={styles.fieldPair}>
                  <div>
                    <Label htmlFor="int-every">Every N days</Label>
                    <Input
                      id="int-every"
                      className={styles.numberInput}
                      type="number"
                      min={2}
                      max={128}
                      value={editor.intervalEvery}
                      onChange={(e) => patchEditor({ intervalEvery: parseInt(e.target.value, 10) || 2 })}
                    />
                  </div>
                  <div>
                    <Label htmlFor="int-start">Starting in (0 … N−1)</Label>
                    <Input
                      id="int-start"
                      className={styles.numberInput}
                      type="number"
                      min={0}
                      max={127}
                      value={editor.intervalStarting}
                      onChange={(e) => patchEditor({ intervalStarting: parseInt(e.target.value, 10) || 0 })}
                    />
                  </div>
                </div>
              ) : null}
              {editor.dayType === 'single' ? (
                <div>
                  <Label htmlFor="single-date">Run date</Label>
                  <Input
                    id="single-date"
                    type="date"
                    className={styles.dateInput}
                    value={epochDaysToIsoDate(editor.singleEpochDay)}
                    onChange={(e) => {
                      const ep = isoDateToEpochDays(e.target.value)
                      if (ep !== null) patchEditor({ singleEpochDay: ep })
                    }}
                  />
                </div>
              ) : null}
              {editor.dayType === 'monthly' ? (
                <div>
                  <Label htmlFor="month-day">Day of month</Label>
                  <Input
                    id="month-day"
                    className={styles.numberInput}
                    type="number"
                    min={0}
                    max={31}
                    value={editor.monthlyDay}
                    onChange={(e) => patchEditor({ monthlyDay: parseInt(e.target.value, 10) || 0 })}
                  />
                  <p className={styles.sectionHint}>Use 0 for the last day of the month. Needs recent firmware.</p>
                </div>
              ) : null}
            </div>

            <div className={styles.advGroup}>
              <p className={styles.advLabel}>Day restriction</p>
              <Segmented
                label="Day restriction"
                value={editor.restriction}
                onChange={(restriction) => patchEditor({ restriction })}
                options={[
                  { value: 'none', label: 'None' },
                  { value: 'odd', label: 'Odd days' },
                  { value: 'even', label: 'Even days' },
                ]}
              />
              <p className={styles.sectionHint}>Optional odd/even filter on top of the schedule.</p>
            </div>

            <div className={styles.advGroup}>
              <p className={styles.advLabel}>First start reference</p>
              <StartPickEditor
                idPrefix="primary"
                value={editor.primaryPick}
                is24Hour={prefs.is24Hour}
                showClockInput={false}
                onChange={(primaryPick) => patchEditor({ primaryPick })}
              />
              <p className={styles.sectionHint}>
                {editor.primaryPick.mode === 'clock'
                  ? 'Clock time is set under Start time above.'
                  : `0 = exactly at ${editor.primaryPick.mode}. Positive runs after, negative before (−720…720).`}
              </p>
            </div>

            <div className={styles.advGroup}>
              <p className={styles.advLabel}>Additional starts</p>
              <Segmented
                label="Additional start mode"
                value={editor.startMode}
                onChange={(startMode) => patchEditor({ startMode })}
                options={[
                  { value: 'repeating', label: 'Repeating' },
                  { value: 'fixed', label: 'Fixed times' },
                ]}
              />
              {editor.startMode === 'repeating' ? (
                <div className={styles.fieldPair}>
                  <div>
                    <Label htmlFor="repeat-count">Repeat count</Label>
                    <Input
                      id="repeat-count"
                      className={styles.numberInput}
                      type="number"
                      min={0}
                      value={editor.repeatCount}
                      onChange={(e) => patchEditor({ repeatCount: parseInt(e.target.value, 10) || 0 })}
                    />
                    <p className={styles.sectionHint}>0 = run only once at the first start.</p>
                  </div>
                  <div>
                    <Label htmlFor="repeat-interval">Every (minutes)</Label>
                    <Input
                      id="repeat-interval"
                      className={styles.numberInput}
                      type="number"
                      min={1}
                      value={editor.repeatIntervalMin}
                      onChange={(e) =>
                        patchEditor({ repeatIntervalMin: parseInt(e.target.value, 10) || 1 })
                      }
                    />
                  </div>
                </div>
              ) : (
                <div className={styles.fixedSlots}>
                  {(
                    [
                      ['2', 0, editor.fixedPick1],
                      ['3', 1, editor.fixedPick2],
                      ['4', 2, editor.fixedPick3],
                    ] as const
                  ).map(([label, idx, pick]) => (
                    <div key={label} className={styles.fixedSlot}>
                      <Switch
                        checked={editor.fixedSlotOn[idx]}
                        label={`Start ${label}`}
                        description={editor.fixedSlotOn[idx] ? undefined : 'Off'}
                        onChange={(on) =>
                          setEditor((s) => {
                            if (!s) return s
                            const next = [...s.fixedSlotOn] as [boolean, boolean, boolean]
                            next[idx] = on
                            return { ...s, fixedSlotOn: next }
                          })
                        }
                      />
                      {editor.fixedSlotOn[idx] ? (
                        <StartPickEditor
                          idPrefix={`fx-${idx}`}
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
                      ) : null}
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className={styles.advGroup}>
              <Switch
                checked={editor.keepDateRange}
                onChange={(keepDateRange) => patchEditor({ keepDateRange })}
                label="Limit to a date range"
                description="Seasonal programs: only run between these dates each year."
              />
              {editor.keepDateRange ? (
                <div className={styles.fieldPair}>
                  <div>
                    <Label htmlFor="dr-from">From (MM/DD)</Label>
                    <Input
                      id="dr-from"
                      className={styles.numberInput}
                      placeholder="01/01"
                      defaultValue={formatOsDateMmDd(editor.from)}
                      onChange={(e) => {
                        const c = parseMmDdToOsDate(e.target.value)
                        if (c !== null) patchEditor({ from: c })
                      }}
                    />
                  </div>
                  <div>
                    <Label htmlFor="dr-to">To (MM/DD)</Label>
                    <Input
                      id="dr-to"
                      className={styles.numberInput}
                      placeholder="12/31"
                      defaultValue={formatOsDateMmDd(editor.to)}
                      onChange={(e) => {
                        const c = parseMmDdToOsDate(e.target.value)
                        if (c !== null) patchEditor({ to: c })
                      }}
                    />
                  </div>
                </div>
              ) : null}
            </div>
          </AdvancedSection>

          {editor.pid >= 0 ? (
            <div className={styles.dangerZone}>
              <div className={styles.dangerText}>
                <span className={styles.dangerTitle}>Delete this program</span>
                <span className={styles.sectionHint}>Removes it from the controller. Cannot be undone.</span>
              </div>
              <Button
                type="button"
                size="sm"
                variant="danger"
                startIcon={<Trash2 size={15} aria-hidden />}
                disabled={del.isPending}
                onClick={async () => {
                  const confirmed = await confirm({
                    title: `Delete “${editor.name || `Program ${editor.pid + 1}`}”?`,
                    message: 'The program and its schedule are removed from the controller. This cannot be undone.',
                    confirmLabel: 'Delete program',
                    tone: 'danger',
                  })
                  if (confirmed) {
                    const ok = await runAction(() => del.mutateAsync(editor.pid), 'Program deleted.')
                    if (ok) setEditor(null)
                  }
                }}
              >
                Delete
              </Button>
            </div>
          ) : null}
        </Sheet>
      ) : null}
    </>
  )
}

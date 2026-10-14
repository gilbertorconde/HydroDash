import { useEffect, useId, useRef, useState, type ReactNode } from 'react'
import { Link } from '@tanstack/react-router'
import { ChevronDown, ChevronLeft, ChevronRight, MoreHorizontal, Wrench } from 'lucide-react'
import { useAppPreferences } from '../lib/appPreferences'
import styles from './ui.module.css'

const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(' ')

export function Card({
  title,
  subtitle,
  icon,
  titleAction,
  children,
  className,
  bodyClassName,
  variant = 'default',
  id,
}: {
  title?: ReactNode
  /** Small muted line under the title. */
  subtitle?: ReactNode
  /** Rounded icon badge left of the title. */
  icon?: ReactNode
  /** Renders on the right side of the title row (e.g. a link or menu). */
  titleAction?: ReactNode
  children: ReactNode
  className?: string
  /** Applied to the body only so the title row (e.g. header actions) stays full opacity. */
  bodyClassName?: string
  variant?: 'default' | 'plain' | 'flush'
  id?: string
}) {
  return (
    <section id={id} className={cx(styles.card, styles[`card_${variant}`], className)}>
      {title ? (
        <div className={styles.cardHeader}>
          {icon ? <span className={styles.cardIcon}>{icon}</span> : null}
          <div className={styles.cardHeading}>
            <h2 className={styles.cardTitle}>{title}</h2>
            {subtitle ? <p className={styles.cardSubtitle}>{subtitle}</p> : null}
          </div>
          {titleAction ? <div className={styles.cardHeaderAction}>{titleAction}</div> : null}
        </div>
      ) : null}
      <div className={cx(styles.cardBody, bodyClassName)}>{children}</div>
    </section>
  )
}

export function Button({
  children,
  variant = 'primary',
  size = 'md',
  startIcon,
  endIcon,
  className,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  /** `glass` is for buttons sitting on the blue page hero. */
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost' | 'cta' | 'glass' | 'light'
  size?: 'sm' | 'md' | 'lg'
  startIcon?: ReactNode
  endIcon?: ReactNode
}) {
  return (
    <button
      type="button"
      className={cx(styles.btn, styles[`btn_${variant}`], size !== 'md' && styles[`btn_${size}`], className)}
      {...props}
    >
      {startIcon}
      {children}
      {endIcon}
    </button>
  )
}

export function Input({ className, ...props }: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cx(styles.input, className)} {...props} />
}

export function Select({ className, children, ...props }: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select className={cx(styles.input, styles.select, className)} {...props}>
      {children}
    </select>
  )
}

export function Label({
  children,
  htmlFor,
}: {
  children: ReactNode
  htmlFor?: string
}) {
  return (
    <label className={styles.label} htmlFor={htmlFor}>
      {children}
    </label>
  )
}

/** Label + control + optional hint, stacked. */
export function Field({
  label,
  hint,
  htmlFor,
  children,
  className,
}: {
  label: ReactNode
  hint?: ReactNode
  htmlFor?: string
  children: ReactNode
  className?: string
}) {
  return (
    <div className={cx(styles.field, className)}>
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
      {hint ? <p className={styles.hint}>{hint}</p> : null}
    </div>
  )
}

/** iOS-style switch backed by a native checkbox. */
export function Switch({
  checked,
  onChange,
  label,
  description,
  disabled,
  id,
}: {
  checked: boolean
  onChange: (next: boolean) => void
  label: ReactNode
  description?: ReactNode
  disabled?: boolean
  id?: string
}) {
  const autoId = useId()
  const inputId = id ?? autoId
  return (
    <label className={cx(styles.switchRow, disabled && styles.switchDisabled)} htmlFor={inputId}>
      <span className={styles.switchText}>
        <span className={styles.switchLabel}>{label}</span>
        {description ? <span className={styles.switchDesc}>{description}</span> : null}
      </span>
      <input
        id={inputId}
        type="checkbox"
        role="switch"
        className={styles.switchInput}
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span className={styles.switchTrack} aria-hidden>
        <span className={styles.switchThumb} />
      </span>
    </label>
  )
}

export function ErrorBox({ message }: { message: string }) {
  return (
    <div className={styles.errorBox} role="alert">
      {message}
    </div>
  )
}

export function Spinner() {
  return <span className={styles.spinner} aria-label="Loading" />
}

export type PillTone = 'neutral' | 'accent' | 'success' | 'warning' | 'danger' | 'advanced' | 'glass'

export function Pill({
  tone = 'neutral',
  icon,
  children,
  className,
}: {
  tone?: PillTone
  icon?: ReactNode
  children: ReactNode
  className?: string
}) {
  return (
    <span className={cx(styles.pill, styles[`pill_${tone}`], className)}>
      {icon}
      {children}
    </span>
  )
}

/** Small coloured metric tile (Conditions row on Home, summaries elsewhere). */
export function StatTile({
  label,
  value,
  icon,
  tone = 'neutral',
  hint,
}: {
  label: ReactNode
  value: ReactNode
  icon?: ReactNode
  tone?: 'neutral' | 'accent' | 'success' | 'warning' | 'danger'
  hint?: ReactNode
}) {
  return (
    <div className={cx(styles.stat, styles[`stat_${tone}`])}>
      <div className={styles.statLabel}>
        {icon}
        {label}
      </div>
      <div className={styles.statValue}>{value}</div>
      {hint ? <div className={styles.statHint}>{hint}</div> : null}
    </div>
  )
}

/**
 * Blue gradient band at the top of every page. The header floats over it and the first
 * element after it overlaps its bottom edge (see `[data-page-hero] + *` in index.css).
 */
export function PageHero({
  title,
  eyebrow,
  subtitle,
  back,
  actions,
  children,
  size = 'default',
}: {
  title: ReactNode
  /** Small glass pill above the title (status, context). */
  eyebrow?: ReactNode
  subtitle?: ReactNode
  /** Back link for sub-pages, e.g. `{ to: '/more', label: 'More' }`. */
  back?: { to: string; label: string }
  /** Buttons on the right (desktop) / below the title (phone). Use `variant="glass"` or `"light"`. */
  actions?: ReactNode
  /** Extra hero content below the title row (e.g. the live watering countdown on Home). */
  children?: ReactNode
  /** `compact` keeps sub-pages short; `tall` leaves room for big hero content. */
  size?: 'compact' | 'default' | 'tall'
}) {
  return (
    <section data-page-hero className={cx(styles.hero, styles[`hero_${size}`])}>
      <div className={styles.heroWaves} aria-hidden />
      <div className={styles.heroInner}>
        {back ? (
          <Link to={back.to} className={styles.heroBack}>
            <ChevronLeft size={18} strokeWidth={2.4} aria-hidden />
            {back.label}
          </Link>
        ) : null}
        <div className={styles.heroRow}>
          <div className={styles.heroText}>
            {eyebrow ? <div className={styles.heroEyebrow}>{eyebrow}</div> : null}
            <h1 className={styles.heroTitle}>{title}</h1>
            {subtitle ? <p className={styles.heroSubtitle}>{subtitle}</p> : null}
          </div>
          {actions ? <div className={styles.heroActions}>{actions}</div> : null}
        </div>
        {children}
      </div>
    </section>
  )
}

/** Vertical stack of cards/sections with consistent spacing; use as the page body. */
export function PageBody({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cx(styles.pageBody, className)}>{children}</div>
}

/** Heading row for a group of content inside a page (not a card). */
export function SectionHeader({ title, action }: { title: ReactNode; action?: ReactNode }) {
  return (
    <div className={styles.sectionHeader}>
      <h2 className={styles.sectionTitle}>{title}</h2>
      {action ? <div>{action}</div> : null}
    </div>
  )
}

/** Inset list container for ListRow items. */
export function ListGroup({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cx(styles.listGroup, className)}>{children}</div>
}

type ListRowProps = {
  icon?: ReactNode
  /** Background colour of the icon badge (CSS colour or gradient). */
  iconTone?: 'accent' | 'success' | 'warning' | 'danger' | 'advanced' | 'neutral'
  title: ReactNode
  description?: ReactNode
  trailing?: ReactNode
  danger?: boolean
  chevron?: boolean
}

/** Tappable list row: icon badge, title, description, trailing slot, chevron. */
export function ListRow({
  to,
  onClick,
  icon,
  iconTone = 'accent',
  title,
  description,
  trailing,
  danger,
  chevron,
  disabled,
}: ListRowProps & { to?: string; onClick?: () => void; disabled?: boolean }) {
  const inner = (
    <>
      {icon ? <span className={cx(styles.rowIcon, styles[`rowIcon_${danger ? 'danger' : iconTone}`])}>{icon}</span> : null}
      <span className={styles.rowText}>
        <span className={cx(styles.rowTitle, danger && styles.rowTitleDanger)}>{title}</span>
        {description ? <span className={styles.rowDesc}>{description}</span> : null}
      </span>
      {trailing ? <span className={styles.rowTrailing}>{trailing}</span> : null}
      {chevron ?? (to || onClick) ? <ChevronRight className={styles.rowChevron} size={18} aria-hidden /> : null}
    </>
  )
  if (to) {
    return (
      <Link to={to} className={styles.row}>
        {inner}
      </Link>
    )
  }
  if (onClick) {
    return (
      <button type="button" className={styles.row} onClick={onClick} disabled={disabled}>
        {inner}
      </button>
    )
  }
  return <div className={cx(styles.row, styles.rowStatic)}>{inner}</div>
}

const ADV_KEY = 'hydrodash.advancedOpen'

function readAdvancedOpen(id: string): boolean | null {
  try {
    const raw = localStorage.getItem(ADV_KEY)
    const map = raw ? (JSON.parse(raw) as Record<string, boolean>) : {}
    return typeof map[id] === 'boolean' ? map[id] : null
  } catch {
    return null
  }
}

function writeAdvancedOpen(id: string, open: boolean) {
  try {
    const raw = localStorage.getItem(ADV_KEY)
    const map = raw ? (JSON.parse(raw) as Record<string, boolean>) : {}
    map[id] = open
    localStorage.setItem(ADV_KEY, JSON.stringify(map))
  } catch {
    /* ignore */
  }
}

/**
 * Installer / power-user controls. Collapsed by default (open when the "Show advanced
 * options" app preference is on); each section remembers its own open state.
 */
export function AdvancedSection({
  id,
  title = 'Advanced',
  description,
  children,
}: {
  /** Stable id used to remember open/closed state. */
  id: string
  title?: ReactNode
  description?: ReactNode
  children: ReactNode
}) {
  const prefs = useAppPreferences()
  const [open, setOpen] = useState<boolean>(() => readAdvancedOpen(id) ?? prefs.showAdvanced)
  const bodyId = useId()

  return (
    <section className={cx(styles.advanced, open && styles.advancedOpen)}>
      <button
        type="button"
        className={styles.advancedToggle}
        aria-expanded={open}
        aria-controls={bodyId}
        onClick={() => {
          setOpen((v) => {
            writeAdvancedOpen(id, !v)
            return !v
          })
        }}
      >
        <span className={styles.advancedIcon}>
          <Wrench size={16} aria-hidden />
        </span>
        <span className={styles.rowText}>
          <span className={styles.advancedTitle}>{title}</span>
          {description ? <span className={styles.rowDesc}>{description}</span> : null}
        </span>
        <ChevronDown className={styles.advancedChevron} size={18} aria-hidden />
      </button>
      {open ? (
        <div id={bodyId} className={styles.advancedBody}>
          {children}
        </div>
      ) : null}
    </section>
  )
}

export function EmptyState({
  icon,
  title,
  description,
  action,
}: {
  icon?: ReactNode
  title: ReactNode
  description?: ReactNode
  action?: ReactNode
}) {
  return (
    <div className={styles.empty}>
      {icon ? <span className={styles.emptyIcon}>{icon}</span> : null}
      <p className={styles.emptyTitle}>{title}</p>
      {description ? <p className={styles.emptyDesc}>{description}</p> : null}
      {action}
    </div>
  )
}

/** Pill-shaped segmented control (Table / Timeline, Day / Station, …). */
export function Segmented<T extends string>({
  value,
  onChange,
  options,
  label,
}: {
  value: T
  onChange: (v: T) => void
  options: { value: T; label: ReactNode }[]
  label: string
}) {
  return (
    <div className={styles.segmented} role="tablist" aria-label={label}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="tab"
          aria-selected={o.value === value}
          className={cx(styles.segment, o.value === value && styles.segmentActive)}
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

export type OverflowMenuItem = {
  label: string
  onSelect: () => void
  danger?: boolean
  disabled?: boolean
}

/** "⋯" button with a small popover of secondary / destructive actions. */
export function OverflowMenu({
  items,
  label = 'More actions',
  onHero,
}: {
  items: OverflowMenuItem[]
  label?: string
  /** Glass styling for use on the page hero. */
  onHero?: boolean
}) {
  const [open, setOpen] = useState(false)
  const wrapRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onDown = (e: PointerEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('pointerdown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('pointerdown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  return (
    <div className={cx(styles.menuWrap, open && styles.menuWrapOpen)} ref={wrapRef}>
      <button
        type="button"
        className={cx(styles.menuTrigger, onHero && styles.menuTriggerHero)}
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <MoreHorizontal size={18} aria-hidden />
      </button>
      {open ? (
        <div className={styles.menu} role="menu">
          {items.map((it) => (
            <button
              key={it.label}
              type="button"
              role="menuitem"
              disabled={it.disabled}
              className={cx(styles.menuItem, it.danger && styles.menuItem_danger)}
              onClick={() => {
                setOpen(false)
                it.onSelect()
              }}
            >
              {it.label}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  )
}

import { useEffect, useRef, useState, type ReactNode } from 'react'
import {
  Activity,
  Bell,
  BellOff,
  CalendarClock,
  CloudRain,
  CloudSun,
  Droplets,
  ListOrdered,
  Power,
  Router,
  X,
} from 'lucide-react'
import { useNavigate } from '@tanstack/react-router'
import {
  useNotificationsConfig,
  useNotificationsInbox,
  useNotificationsMarkAllRead,
  useNotificationsUnreadCount,
} from '../api/hooks'
import { NOTIFICATION_SERVICE_LABELS, type NotificationServiceKey } from '../server/notifications/types'
import styles from './NotificationsBell.module.css'

/** "Just now", "5 min ago", "3 h ago", "Yesterday 18:05", then "Oct 8, 18:05". */
function formatRelativeTime(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  const diff = (Date.now() - d.getTime()) / 1000
  const time = d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
  if (diff < 60) return 'Just now'
  if (diff < 3600) return `${Math.floor(diff / 60)} min ago`
  const today = new Date()
  if (d.toDateString() === today.toDateString()) return `${Math.floor(diff / 3600)} h ago`
  const yesterday = new Date(today)
  yesterday.setDate(today.getDate() - 1)
  if (d.toDateString() === yesterday.toDateString()) return `Yesterday ${time}`
  return `${d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}, ${time}`
}

type Tone = 'accent' | 'success' | 'warning' | 'danger' | 'advanced'

function serviceVisual(key: string): { icon: ReactNode; tone: Tone } {
  const s = 16
  if (key.startsWith('station_')) return { icon: <Droplets size={s} aria-hidden />, tone: 'accent' }
  if (key === 'program_queue_changed') return { icon: <ListOrdered size={s} aria-hidden />, tone: 'advanced' }
  if (key.startsWith('program_')) return { icon: <CalendarClock size={s} aria-hidden />, tone: 'success' }
  if (key.startsWith('rain_delay')) return { icon: <CloudRain size={s} aria-hidden />, tone: 'warning' }
  if (key.startsWith('weather')) return { icon: <CloudSun size={s} aria-hidden />, tone: 'danger' }
  if (key.startsWith('sensor_')) return { icon: <Activity size={s} aria-hidden />, tone: 'warning' }
  if (key === 'controller_offline') return { icon: <Router size={s} aria-hidden />, tone: 'danger' }
  if (key === 'controller_online') return { icon: <Router size={s} aria-hidden />, tone: 'success' }
  if (key.startsWith('controller_')) return { icon: <Power size={s} aria-hidden />, tone: 'advanced' }
  return { icon: <Bell size={s} aria-hidden />, tone: 'accent' }
}

export function NotificationsBell() {
  const config = useNotificationsConfig()
  const unread = useNotificationsUnreadCount()
  const [open, setOpen] = useState(false)
  /** Unread count when the panel was opened; opening marks everything read, but those items keep their dot. */
  const [newCount, setNewCount] = useState(0)
  const inbox = useNotificationsInbox(50, open)
  const { mutate: markAllRead } = useNotificationsMarkAllRead()
  const navigate = useNavigate()
  const wrapRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    markAllRead()
  }, [open, markAllRead])

  useEffect(() => {
    if (!open) return
    function onDoc(e: MouseEvent) {
      const el = wrapRef.current
      if (el && !el.contains(e.target as Node)) setOpen(false)
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDoc)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  if (!config.data?.enabled) return null

  const count = unread.data?.enabled ? unread.data.count : 0
  const items = inbox.data ?? []

  return (
    <div className={styles.wrap} ref={wrapRef}>
      <button
        type="button"
        className={styles.bellBtn}
        aria-label={open ? 'Close notifications' : count > 0 ? `Open notifications (${count} unread)` : 'Open notifications'}
        aria-expanded={open}
        onClick={() => {
          if (!open) setNewCount(count)
          setOpen((o) => !o)
        }}
      >
        <Bell size={16} aria-hidden />
        {count > 0 ? (
          <span className={styles.badge} aria-hidden>
            {count > 99 ? '99+' : count}
          </span>
        ) : null}
      </button>
      {open ? (
        <div className={styles.panel} role="dialog" aria-label="Notifications">
          <div className={styles.panelHeader}>
            <span className={styles.panelTitle}>Notifications</span>
            {newCount > 0 ? <span className={styles.newPill}>{newCount} new</span> : null}
            <button type="button" className={styles.closeBtn} aria-label="Close notifications" onClick={() => setOpen(false)}>
              <X size={16} aria-hidden />
            </button>
          </div>
          <div className={styles.list}>
            {inbox.isLoading ? (
              <div className={styles.skeletons} aria-label="Loading">
                {[0, 1, 2].map((i) => (
                  <span key={i} className={styles.skeleton} />
                ))}
              </div>
            ) : items.length === 0 ? (
              <div className={styles.empty}>
                <span className={styles.emptyIcon}>
                  <BellOff size={20} aria-hidden />
                </span>
                <p className={styles.emptyTitle}>You’re all caught up</p>
                <p className={styles.emptyDesc}>Watering and controller events will show up here.</p>
              </div>
            ) : (
              items.map((item, idx) => {
                const isNew = idx < newCount || !item.readAt
                const v = serviceVisual(item.serviceKey)
                const label =
                  NOTIFICATION_SERVICE_LABELS[item.serviceKey as NotificationServiceKey] ?? item.serviceKey
                return (
                  <button
                    key={item.id}
                    type="button"
                    className={`${styles.item} ${isNew ? styles.itemNew : ''}`}
                    onClick={() => {
                      setOpen(false)
                      ;(navigate as (opts: { to: string }) => void)({ to: item.route })
                    }}
                  >
                    <span className={`${styles.itemIcon} ${styles[`tone_${v.tone}`]}`}>{v.icon}</span>
                    <span className={styles.itemText}>
                      <span className={styles.itemTitle}>{item.title}</span>
                      {item.body ? <span className={styles.itemBody}>{item.body}</span> : null}
                      <span className={styles.itemMeta}>
                        {formatRelativeTime(item.createdAt)} · {label}
                      </span>
                    </span>
                    {isNew ? <span className={styles.unreadDot} aria-label="Unread" /> : null}
                  </button>
                )
              })
            )}
          </div>
        </div>
      ) : null}
    </div>
  )
}

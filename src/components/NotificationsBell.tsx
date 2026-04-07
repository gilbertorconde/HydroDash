import { useEffect, useRef, useState } from 'react'
import { Bell } from 'lucide-react'
import { useNavigate } from '@tanstack/react-router'
import {
  useNotificationsConfig,
  useNotificationsInbox,
  useNotificationsMarkAllRead,
  useNotificationsUnreadCount,
} from '../api/hooks'
import styles from './NotificationsBell.module.css'

function formatShortTime(iso: string): string {
  try {
    const d = new Date(iso)
    return d.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
  } catch {
    return iso
  }
}

export function NotificationsBell() {
  const config = useNotificationsConfig()
  const unread = useNotificationsUnreadCount()
  const [open, setOpen] = useState(false)
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
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [open])

  if (!config.data?.enabled) return null

  const count = unread.data?.enabled ? unread.data.count : 0

  return (
    <div className={styles.wrap} ref={wrapRef}>
      <button
        type="button"
        className={styles.bellBtn}
        aria-label={open ? 'Close notifications' : 'Open notifications'}
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
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
          <div className={styles.panelHeader}>Recent</div>
          {inbox.isLoading ? (
            <p className={styles.empty}>Loading…</p>
          ) : !inbox.data?.length ? (
            <p className={styles.empty}>No notifications yet.</p>
          ) : (
            inbox.data.map((item) => (
              <button
                key={item.id}
                type="button"
                className={styles.item}
                onClick={() => {
                  setOpen(false)
                  ;(navigate as (opts: { to: string }) => void)({ to: item.route })
                }}
              >
                <p className={styles.itemTitle}>
                  {!item.readAt ? <span className={styles.unreadDot} /> : null}
                  {item.title}
                </p>
                <p className={styles.itemMeta}>
                  {formatShortTime(item.createdAt)} · {item.serviceKey}
                </p>
              </button>
            ))
          )}
        </div>
      ) : null}
    </div>
  )
}

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { AlertCircle, CheckCircle2, Info, X } from 'lucide-react'
import { ToastContext, type ToastApi, type ToastTone } from './toastContext'
import styles from './Toaster.module.css'

type Toast = { id: number; message: string; tone: ToastTone }

const DURATION_MS: Record<ToastTone, number> = { success: 3500, info: 3500, error: 6000 }
const MAX_VISIBLE = 3

/** Hosts the floating toast stack; pages call `useToast()`. */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])
  const nextId = useRef(1)

  const dismiss = useCallback((id: number) => {
    setToasts((list) => list.filter((t) => t.id !== id))
  }, [])

  const show = useCallback((message: string, tone: ToastTone = 'success') => {
    const id = nextId.current++
    setToasts((list) => {
      // Same message again (e.g. double tap) just restarts instead of stacking.
      const rest = list.filter((t) => t.message !== message)
      return [...rest, { id, message, tone }].slice(-MAX_VISIBLE)
    })
  }, [])

  const api = useMemo<ToastApi>(
    () => ({
      show,
      success: (m) => show(m, 'success'),
      error: (m) => show(m, 'error'),
      info: (m) => show(m, 'info'),
    }),
    [show],
  )

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div className={styles.stack} aria-live="polite">
        {toasts.map((t) => (
          <ToastItem key={t.id} toast={t} onDismiss={dismiss} />
        ))}
      </div>
    </ToastContext.Provider>
  )
}

function ToastItem({ toast, onDismiss }: { toast: Toast; onDismiss: (id: number) => void }) {
  const [paused, setPaused] = useState(false)

  useEffect(() => {
    if (paused) return
    const t = window.setTimeout(() => onDismiss(toast.id), DURATION_MS[toast.tone])
    return () => window.clearTimeout(t)
  }, [paused, toast.id, toast.tone, onDismiss])

  const Icon = toast.tone === 'error' ? AlertCircle : toast.tone === 'info' ? Info : CheckCircle2
  return (
    <div
      className={`${styles.toast} ${styles[`toast_${toast.tone}`]}`}
      role={toast.tone === 'error' ? 'alert' : 'status'}
      onPointerEnter={() => setPaused(true)}
      onPointerLeave={() => setPaused(false)}
    >
      <Icon className={styles.icon} size={18} aria-hidden />
      <span className={styles.message}>{toast.message}</span>
      <button type="button" className={styles.close} aria-label="Dismiss" onClick={() => onDismiss(toast.id)}>
        <X size={16} aria-hidden />
      </button>
    </div>
  )
}

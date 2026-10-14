import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { AlertTriangle, HelpCircle } from 'lucide-react'
import { Button } from './ui'
import { ConfirmContext, type ConfirmFn, type ConfirmOptions } from './confirmContext'
import styles from './ConfirmDialog.module.css'

type Pending = ConfirmOptions & { resolve: (ok: boolean) => void }

/** Renders the in-app confirmation dialog; components ask for one via `useConfirm()`. */
export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [pending, setPending] = useState<Pending | null>(null)

  const confirm = useCallback<ConfirmFn>((options) => {
    const opts = typeof options === 'string' ? { title: options } : options
    return new Promise<boolean>((resolve) => {
      setPending({ ...opts, resolve })
    })
  }, [])

  const close = useCallback(
    (ok: boolean) => {
      pending?.resolve(ok)
      setPending(null)
    },
    [pending],
  )

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      {pending ? <ConfirmDialog options={pending} onClose={close} /> : null}
    </ConfirmContext.Provider>
  )
}

function ConfirmDialog({ options, onClose }: { options: ConfirmOptions; onClose: (ok: boolean) => void }) {
  const danger = options.tone === 'danger'
  const cancelRef = useRef<HTMLButtonElement>(null)
  const confirmRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    // Destructive dialogs focus Cancel so a stray Enter doesn't confirm.
    ;(danger ? cancelRef : confirmRef).current?.focus()
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose(false)
    }
    document.addEventListener('keydown', onKey)
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = prevOverflow
    }
  }, [danger, onClose])

  return (
    <div className={styles.backdrop} onClick={() => onClose(false)}>
      <div
        className={styles.dialog}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-title"
        aria-describedby={options.message ? 'confirm-message' : undefined}
        onClick={(e) => e.stopPropagation()}
      >
        <span className={danger ? `${styles.icon} ${styles.iconDanger}` : styles.icon} aria-hidden>
          {danger ? <AlertTriangle size={22} /> : <HelpCircle size={22} />}
        </span>
        <h2 id="confirm-title" className={styles.title}>
          {options.title}
        </h2>
        {options.message ? (
          <div id="confirm-message" className={styles.message}>
            {options.message}
          </div>
        ) : null}
        <div className={styles.actions}>
          <Button ref={cancelRef} variant="secondary" size="lg" onClick={() => onClose(false)}>
            {options.cancelLabel ?? 'Cancel'}
          </Button>
          <Button ref={confirmRef} variant={danger ? 'dangerSolid' : 'primary'} size="lg" onClick={() => onClose(true)}>
            {options.confirmLabel ?? 'Confirm'}
          </Button>
        </div>
      </div>
    </div>
  )
}

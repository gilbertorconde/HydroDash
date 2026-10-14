import { useState, type ReactNode } from 'react'
import { Button, Card } from '../../components/ui'
import styles from './settings.module.css'

/**
 * One settings section: a card of fields with a single Save / Discard bar.
 * The bar sticks to the bottom of the viewport while there are unsaved edits.
 */
export function SettingsForm({
  title,
  subtitle,
  icon,
  dirty,
  saving,
  onSave,
  onDiscard,
  children,
  footerNote,
}: {
  title?: ReactNode
  subtitle?: ReactNode
  icon?: ReactNode
  dirty: boolean
  saving: boolean
  /** Return true when the save went through (the draft is then cleared by the caller). */
  onSave: () => Promise<unknown>
  onDiscard: () => void
  children: ReactNode
  /** Short muted text shown in the bar when nothing is dirty (e.g. "Restart required"). */
  footerNote?: ReactNode
}) {
  const [busy, setBusy] = useState(false)
  const pending = busy || saving
  return (
    <Card title={title} subtitle={subtitle} icon={icon}>
      <div className={styles.formBody}>{children}</div>
      <div className={`${styles.saveBar} ${dirty ? styles.saveBarDirty : ''}`}>
        <span className={styles.saveStatus} aria-live="polite">
          {dirty ? 'Unsaved changes' : (footerNote ?? 'All changes saved')}
        </span>
        <div className={styles.saveActions}>
          {dirty ? (
            <Button variant="ghost" disabled={pending} onClick={onDiscard}>
              Discard
            </Button>
          ) : null}
          <Button
            variant="primary"
            disabled={!dirty || pending}
            onClick={() => {
              setBusy(true)
              void onSave().finally(() => setBusy(false))
            }}
          >
            {pending && dirty ? 'Saving…' : 'Save changes'}
          </Button>
        </div>
      </div>
    </Card>
  )
}

/** Small heading that splits a long section card into groups. */
export function SubHeading({ children, hint }: { children: ReactNode; hint?: ReactNode }) {
  return (
    <div className={styles.subHeading}>
      <h3 className={styles.subTitle}>{children}</h3>
      {hint ? <p className={styles.subHint}>{hint}</p> : null}
    </div>
  )
}

/** Two-up grid for short fields on wide screens. */
export function FieldGrid({ children }: { children: ReactNode }) {
  return <div className={styles.fieldGrid}>{children}</div>
}

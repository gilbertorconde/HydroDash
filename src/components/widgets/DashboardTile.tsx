import { useCallback, useId, useState, type ReactNode } from 'react'
import { GripVertical, Settings } from 'lucide-react'
import { Card } from '../ui'
import styles from './dashboardWidgets.module.css'

/** Stable class for RGL `dragConfig.handle` (CSS module hashes break string selectors). */
export const RGL_DRAG_HANDLE_CLASS = 'hydrodash-rgl-drag-handle'

type DashboardTileProps = {
  title: string
  children: ReactNode
  gridRowHeight: number
  minH: number
  maxH: number
  onCommitRowHeight: (h: number) => void
}

export function DashboardTile({
  title,
  children,
  gridRowHeight,
  minH,
  maxH,
  onCommitRowHeight,
}: DashboardTileProps) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(String(gridRowHeight))
  const heightInputId = useId()

  const commit = useCallback(() => {
    const n = Number.parseInt(draft, 10)
    if (!Number.isFinite(n)) {
      setDraft(String(gridRowHeight))
      setEditing(false)
      return
    }
    onCommitRowHeight(n)
    setEditing(false)
  }, [draft, gridRowHeight, onCommitRowHeight])

  const cancel = useCallback(() => {
    setDraft(String(gridRowHeight))
    setEditing(false)
  }, [gridRowHeight])

  return (
    <div className={styles.rglTile}>
      <Card
        title={title}
        className={styles.tileCard}
        bodyClassName={styles.tileCardBody}
        titleAction={
          <div className={styles.tileTitleActions}>
            {editing ? (
              <div className={styles.tileHeightEdit}>
                <input
                  id={heightInputId}
                  type="number"
                  className={styles.tileHeightInput}
                  min={minH}
                  max={maxH}
                  value={draft}
                  aria-label="Height in rows"
                  onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') commit()
                    if (e.key === 'Escape') cancel()
                  }}
                />
                <button type="button" className={styles.tileHeightOk} onClick={commit}>
                  OK
                </button>
              </div>
            ) : (
              <button
                type="button"
                className={styles.tileHeightCog}
                aria-label={`Change height of ${title}`}
                onClick={() => {
                  setDraft(String(gridRowHeight))
                  setEditing(true)
                }}
              >
                <Settings className={styles.tileHeightCogIcon} size={18} aria-hidden />
              </button>
            )}
            <span
              role="button"
              tabIndex={0}
              className={`${RGL_DRAG_HANDLE_CLASS} ${styles.dragHandle} ${styles.rglDragHandle}`}
              aria-label={`Drag to reorder ${title}`}
            >
              <GripVertical className={styles.dragHandleIcon} size={18} aria-hidden />
            </span>
          </div>
        }
      >
        {children}
      </Card>
    </div>
  )
}

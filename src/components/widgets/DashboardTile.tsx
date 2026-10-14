import { useCallback, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { GripVertical, MoveVertical } from 'lucide-react'
import { Card } from '../ui'
import styles from './dashboardWidgets.module.css'

/** Stable class for RGL `dragConfig.handle` (CSS module hashes break string selectors). */
export const RGL_DRAG_HANDLE_CLASS = 'hydrodash-rgl-drag-handle'

type DashboardTileProps = {
  id: string
  title: string
  children: ReactNode
  /** Customize mode: show the drag grip (and the max-height control when allowed). */
  editing: boolean
  /** Max-height control is only meaningful on the multi-column grid. */
  showHeightControl: boolean
  /** Cap in px (body scrolls past it); null = size to content. */
  maxHeightPx: number | null
  minHeightPx: number
  maxHeightLimitPx: number
  onCommitMaxHeight: (px: number | null) => void
  /** Reports the rendered card height (px) so the grid can size the cell to fit. */
  onContentHeight: (id: string, px: number) => void
}

export function DashboardTile({
  id,
  title,
  children,
  editing,
  showHeightControl,
  maxHeightPx,
  minHeightPx,
  maxHeightLimitPx,
  onCommitMaxHeight,
  onContentHeight,
}: DashboardTileProps) {
  const [heightEditing, setHeightEditing] = useState(false)
  const [draft, setDraft] = useState('')
  const measureRef = useRef<HTMLDivElement>(null)

  /** The card is never stretched by the grid cell, so its own height is the content height. */
  useLayoutEffect(() => {
    const el = measureRef.current
    if (!el) return
    const report = () => onContentHeight(id, el.offsetHeight)
    report()
    if (typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(report)
    ro.observe(el)
    return () => ro.disconnect()
  }, [id, onContentHeight])

  const commit = useCallback(() => {
    const t = draft.trim()
    if (!t) {
      onCommitMaxHeight(null)
      setHeightEditing(false)
      return
    }
    const n = Number.parseInt(t, 10)
    if (Number.isFinite(n) && n > 0) onCommitMaxHeight(n)
    setHeightEditing(false)
  }, [draft, onCommitMaxHeight])

  const cancel = useCallback(() => {
    setHeightEditing(false)
  }, [])

  const capped = maxHeightPx != null

  return (
    <div className={styles.rglTile}>
      <div
        ref={measureRef}
        className={[styles.tileMeasure, capped ? styles.tileMeasureCapped : ''].filter(Boolean).join(' ')}
        style={capped ? { maxHeight: maxHeightPx } : undefined}
      >
        <Card
          title={title}
          className={styles.tileCard}
          bodyClassName={styles.tileCardBody}
          titleAction={
            editing ? (
              <div className={styles.tileTitleActions}>
                {showHeightControl ? (
                  heightEditing ? (
                    <div className={styles.tileHeightEdit}>
                      <input
                        type="number"
                        className={styles.tileHeightInput}
                        min={minHeightPx}
                        max={maxHeightLimitPx}
                        step={10}
                        value={draft}
                        placeholder="Auto"
                        aria-label={`Maximum height of ${title} in pixels (empty fits content)`}
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
                      title={capped ? `Max height ${maxHeightPx}px` : 'Fits content'}
                      onClick={() => {
                        setDraft(capped ? String(maxHeightPx) : '')
                        setHeightEditing(true)
                      }}
                    >
                      <MoveVertical className={styles.tileHeightCogIcon} size={18} aria-hidden />
                    </button>
                  )
                ) : null}
                <span
                  role="button"
                  tabIndex={0}
                  className={`${RGL_DRAG_HANDLE_CLASS} ${styles.dragHandle} ${styles.rglDragHandle}`}
                  aria-label={`Drag to reorder ${title}`}
                >
                  <GripVertical className={styles.dragHandleIcon} size={18} aria-hidden />
                </span>
              </div>
            ) : undefined
          }
        >
          {children}
        </Card>
      </div>
    </div>
  )
}

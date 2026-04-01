import type { ReactNode } from 'react'
import { GripVertical } from 'lucide-react'
import { Card } from '../ui'
import styles from './dashboardWidgets.module.css'

/** Stable class for RGL `dragConfig.handle` (CSS module hashes break string selectors). */
export const RGL_DRAG_HANDLE_CLASS = 'hydrodash-rgl-drag-handle'

export function DashboardTile({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className={styles.rglTile}>
      <Card
        title={title}
        className={styles.tileCard}
        bodyClassName={styles.tileCardBody}
        titleAction={
          <span
            role="button"
            tabIndex={0}
            className={`${RGL_DRAG_HANDLE_CLASS} ${styles.dragHandle} ${styles.rglDragHandle}`}
            aria-label={`Drag to reorder ${title}`}
          >
            <GripVertical className={styles.dragHandleIcon} size={18} aria-hidden />
          </span>
        }
      >
        {children}
      </Card>
    </div>
  )
}

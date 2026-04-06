import { Link } from '@tanstack/react-router'
import { ChevronLeft } from 'lucide-react'
import type { ReactNode } from 'react'
import styles from './MoreSubpageLayout.module.css'

export function MoreSubpageLayout({
  title,
  titleClassName,
  children,
}: {
  title: ReactNode
  /** Extra classes for the page `h1` (e.g. flex row + logo on About). */
  titleClassName?: string
  children: ReactNode
}) {
  return (
    <div className={styles.shell}>
      <Link to="/more" className={styles.back}>
        <ChevronLeft size={18} strokeWidth={2.2} aria-hidden />
        More
      </Link>
      <h1 className={[styles.h1, titleClassName].filter(Boolean).join(' ')}>{title}</h1>
      {children}
    </div>
  )
}

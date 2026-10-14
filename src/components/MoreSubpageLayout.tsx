import type { ReactNode } from 'react'
import { PageBody, PageHero } from './ui'
import styles from './MoreSubpageLayout.module.css'

/**
 * Shell for every page under More: compact blue hero with a `‹ More` back link, then the page body
 * (whose first child overlaps the hero's bottom edge).
 */
export function MoreSubpageLayout({
  title,
  titleClassName,
  eyebrow,
  subtitle,
  actions,
  heroContent,
  children,
}: {
  title: ReactNode
  /** Extra classes for the title content (e.g. flex row + logo on About). */
  titleClassName?: string
  /** Small glass pill(s) above the title. */
  eyebrow?: ReactNode
  /** One-line explanation under the title (replaces the old in-body lead paragraph). */
  subtitle?: ReactNode
  /** Hero buttons (`variant="light"` / `"glass"`, `OverflowMenu onHero`). */
  actions?: ReactNode
  /** Extra hero content below the title row (big numbers, stat pills). */
  heroContent?: ReactNode
  children: ReactNode
}) {
  const compact = !heroContent
  return (
    <>
      <PageHero
        size={compact ? 'compact' : 'default'}
        back={{ to: '/more', label: 'More' }}
        eyebrow={eyebrow}
        title={titleClassName ? <span className={titleClassName}>{title}</span> : title}
        subtitle={subtitle}
        actions={actions}
      >
        {heroContent}
      </PageHero>
      <PageBody className={styles.body}>{children}</PageBody>
    </>
  )
}

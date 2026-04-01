import type { ReactNode } from 'react'
import styles from './ui.module.css'

export function Card({
  title,
  titleAction,
  children,
  className,
  bodyClassName,
  variant = 'default',
}: {
  title?: string
  /** Renders on the right side of the title row (e.g. enable/disable). */
  titleAction?: ReactNode
  children: ReactNode
  className?: string
  /** Applied to the body only so the title row (e.g. header actions) stays full opacity. */
  bodyClassName?: string
  variant?: 'default' | 'plain'
}) {
  return (
    <section className={[styles.card, styles[`card_${variant}`], className].filter(Boolean).join(' ')}>
      {title ? (
        <div className={styles.cardHeader}>
          <h2 className={styles.cardTitle}>{title}</h2>
          {titleAction ? <div className={styles.cardHeaderAction}>{titleAction}</div> : null}
        </div>
      ) : null}
      <div className={`${styles.cardBody} ${bodyClassName ?? ''}`}>{children}</div>
    </section>
  )
}

export function Button({
  children,
  variant = 'primary',
  startIcon,
  endIcon,
  className,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost' | 'cta'
  startIcon?: ReactNode
  endIcon?: ReactNode
}) {
  return (
    <button
      type="button"
      className={[styles.btn, styles[`btn_${variant}`], className].filter(Boolean).join(' ')}
      {...props}
    >
      {startIcon}
      {children}
      {endIcon}
    </button>
  )
}

export function Input({ className, ...props }: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input className={[styles.input, className].filter(Boolean).join(' ')} {...props} />
}

export function Label({
  children,
  htmlFor,
}: {
  children: ReactNode
  htmlFor?: string
}) {
  return (
    <label className={styles.label} htmlFor={htmlFor}>
      {children}
    </label>
  )
}

export function ErrorBox({ message }: { message: string }) {
  return (
    <div className={styles.errorBox} role="alert">
      {message}
    </div>
  )
}

export function Spinner() {
  return <span className={styles.spinner} aria-label="Loading" />
}

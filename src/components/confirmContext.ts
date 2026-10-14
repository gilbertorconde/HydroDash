import { createContext, useContext, type ReactNode } from 'react'

export type ConfirmOptions = {
  title: string
  message?: ReactNode
  confirmLabel?: string
  cancelLabel?: string
  /** `danger` = red confirm button + warning icon (deletes, resets, stop-all). */
  tone?: 'default' | 'danger'
}

export type ConfirmFn = (options: ConfirmOptions | string) => Promise<boolean>

export const ConfirmContext = createContext<ConfirmFn | null>(null)

/** In-app replacement for `window.confirm`; resolves true when the user confirms. */
export function useConfirm(): ConfirmFn {
  const ctx = useContext(ConfirmContext)
  if (!ctx) throw new Error('useConfirm must be used inside ConfirmProvider')
  return ctx
}

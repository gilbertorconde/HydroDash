import { createContext, useContext } from 'react'

export type ToastTone = 'success' | 'error' | 'info'

export type ToastApi = {
  /** Floating message at the bottom of the screen; auto-closes (errors stay a bit longer). */
  show: (message: string, tone?: ToastTone) => void
  success: (message: string) => void
  error: (message: string) => void
  info: (message: string) => void
}

export const ToastContext = createContext<ToastApi | null>(null)

/** Action feedback ("Zone 8 enabled.", "Failed to save") — use instead of inline banners. */
export function useToast(): ToastApi {
  const ctx = useContext(ToastContext)
  if (!ctx) throw new Error('useToast must be used inside ToastProvider')
  return ctx
}

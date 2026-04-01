import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react'

type ThemeMode = 'light' | 'dark' | 'system'

const STORAGE_KEY = 'hydrodash-theme'
const isBrowser = typeof window !== 'undefined'

function getSystemDark(): boolean {
  if (!isBrowser) return false
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false
}

function applyTheme(resolved: 'light' | 'dark') {
  if (typeof document === 'undefined') return
  document.documentElement.dataset.theme = resolved
  document.documentElement.style.colorScheme = resolved
}

type ThemeContextValue = {
  mode: ThemeMode
  resolved: 'light' | 'dark'
  setMode: (m: ThemeMode) => void
  toggle: () => void
}

const ThemeContext = createContext<ThemeContextValue | null>(null)

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [mode, setModeState] = useState<ThemeMode>(() => {
    if (!isBrowser) return 'system'
    try {
      const s = localStorage.getItem(STORAGE_KEY) as ThemeMode | null
      if (s === 'light' || s === 'dark' || s === 'system') return s
    } catch {
      /* ignore */
    }
    return 'system'
  })

  const resolved: 'light' | 'dark' =
    mode === 'system' ? (getSystemDark() ? 'dark' : 'light') : mode

  useEffect(() => {
    applyTheme(resolved)
  }, [resolved])

  useEffect(() => {
    if (!isBrowser) return
    if (mode !== 'system') return
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const fn = () => applyTheme(mq.matches ? 'dark' : 'light')
    mq.addEventListener('change', fn)
    return () => mq.removeEventListener('change', fn)
  }, [mode])

  const setMode = useCallback((m: ThemeMode) => {
    setModeState(m)
    if (!isBrowser) return
    try {
      localStorage.setItem(STORAGE_KEY, m)
    } catch {
      /* ignore */
    }
  }, [])

  const toggle = useCallback(() => {
    setModeState((prev) => {
      const current =
        prev === 'system' ? (getSystemDark() ? 'dark' : 'light') : prev
      const next = current === 'dark' ? 'light' : 'dark'
      if (!isBrowser) return next
      try {
        localStorage.setItem(STORAGE_KEY, next)
      } catch {
        /* ignore */
      }
      return next
    })
  }, [])

  const value = useMemo(
    () => ({ mode, resolved, setMode, toggle }),
    [mode, resolved, setMode, toggle],
  )

  return (
    <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
  )
}

export function useTheme() {
  const ctx = useContext(ThemeContext)
  if (!ctx) throw new Error('useTheme outside ThemeProvider')
  return ctx
}

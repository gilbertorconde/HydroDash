import { type FormEvent, useState } from 'react'
import { Navigate, useNavigate } from '@tanstack/react-router'
import { Eye, EyeOff, LogIn } from 'lucide-react'
import { useAuthLogin, useAuthSession } from '../api/hooks'
import { Button, ErrorBox, Input, Label } from '../components/ui'
import { HYDRODASH_LOGO_SVG_HEIGHT, HYDRODASH_LOGO_SVG_WIDTH } from '../lib/hydroDashLogo'
import styles from './LoginPage.module.css'

export function LoginPage() {
  const navigate = useNavigate()
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const auth = useAuthSession()
  const login = useAuthLogin()

  if (auth.data?.authenticated) {
    return <Navigate to="/" replace />
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    try {
      await login.mutateAsync(password)
      navigate({ to: '/', replace: true })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to connect right now.')
    }
  }

  return (
    <div className={styles.screen}>
      <div className={styles.waves} aria-hidden />
      <main className={styles.content}>
        <div className={styles.brand}>
          <span className={styles.logoWrap}>
            <img
              src="/hydroDashLogo.svg"
              alt=""
              className={styles.logo}
              width={HYDRODASH_LOGO_SVG_WIDTH}
              height={HYDRODASH_LOGO_SVG_HEIGHT}
              decoding="async"
            />
          </span>
          <span className={styles.brandName}>HydroDash</span>
        </div>

        <section className={styles.card} aria-labelledby="login-title">
          <h1 id="login-title" className={styles.title}>
            Welcome back
          </h1>
          <p className={styles.hint}>Sign in to HydroDash to control your garden.</p>
          {error ? <ErrorBox message={error} /> : null}
          <form onSubmit={onSubmit} className={styles.form}>
            <div>
              <Label htmlFor="pw">App password</Label>
              <div className={styles.pwWrap}>
                <Input
                  id="pw"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter password"
                  className={styles.pwInput}
                  autoFocus
                />
                <button
                  type="button"
                  className={styles.pwToggle}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  aria-pressed={showPassword}
                  onClick={() => setShowPassword((v) => !v)}
                >
                  {showPassword ? <EyeOff size={18} aria-hidden /> : <Eye size={18} aria-hidden />}
                </button>
              </div>
              <p className={styles.fieldHint}>This is the HydroDash password, not your controller’s.</p>
            </div>
            <Button
              type="submit"
              size="lg"
              className={styles.submit}
              startIcon={<LogIn size={18} aria-hidden />}
              disabled={login.isPending}
            >
              {login.isPending ? 'Signing in…' : 'Sign in'}
            </Button>
          </form>
        </section>

        <p className={styles.footer}>OpenSprinkler control, in your browser.</p>
      </main>
    </div>
  )
}

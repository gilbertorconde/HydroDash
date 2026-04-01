import { type FormEvent, useState } from 'react'
import { Navigate, useNavigate } from '@tanstack/react-router'
import { useAuthLogin, useAuthSession } from '../api/hooks'
import { Button, Card, ErrorBox, Input, Label } from '../components/ui'
import { HYDRODASH_LOGO_SVG_HEIGHT, HYDRODASH_LOGO_SVG_WIDTH } from '../lib/hydroDashLogo'
import styles from './LoginPage.module.css'

export function LoginPage() {
  const navigate = useNavigate()
  const [password, setPassword] = useState('')
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
    <div className={styles.wrap}>
      <div className={styles.brandBlock}>
        <img
          src="/hydroDashLogo.svg"
          alt="HydroDash"
          className={styles.brandLogo}
          width={HYDRODASH_LOGO_SVG_WIDTH}
          height={HYDRODASH_LOGO_SVG_HEIGHT}
          decoding="async"
        />
      </div>
      <Card title="HydroDash login">
        <p className={styles.hint}>Sign in to HydroDash to access controller actions.</p>
        {error ? <ErrorBox message={error} /> : null}
        <form onSubmit={onSubmit} className={styles.form}>
          <div>
            <Label htmlFor="pw">App password</Label>
            <Input
              id="pw"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter password"
            />
          </div>
          <Button type="submit" disabled={login.isPending}>
            {login.isPending ? 'Signing in…' : 'Sign in'}
          </Button>
        </form>
      </Card>
    </div>
  )
}

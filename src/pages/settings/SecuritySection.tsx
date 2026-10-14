import { useMemo, useState } from 'react'
import { KeyRound } from 'lucide-react'
import SparkMD5 from 'spark-md5'
import { Button, Card, Field, Input, Switch } from '../../components/ui'
import { useChangePassword } from '../../api/hooks'
import { SettingsForm } from './SettingsForm'
import { useDraft, type SectionCtx } from './settingsShared'
import styles from './settings.module.css'

export function SecuritySection({ ctx }: { ctx: SectionCtx }) {
  const { opts } = ctx
  const hasIpas = opts.ipas !== undefined
  const base = useMemo(() => ({ ipas: opts.ipas === 1 }), [opts.ipas])
  const d = useDraft(base)

  async function save() {
    if (
      d.values.ipas &&
      !window.confirm(
        'Ignore password lets anyone on your network control the controller without a password. Turn it on?',
      )
    )
      return
    if (await ctx.apply({ ipas: d.values.ipas ? 1 : 0 })) d.discard()
  }

  return (
    <>
      <ChangePasswordCard ctx={ctx} />
      {hasIpas ? (
        <SettingsForm dirty={d.dirty} saving={ctx.saving} onSave={save} onDiscard={d.discard}>
          <Switch
            checked={d.values.ipas}
            onChange={(c) => d.set('ipas', c)}
            label="Ignore password"
            description="The controller accepts commands without checking the password. Only for trusted, isolated networks."
          />
        </SettingsForm>
      ) : null}
    </>
  )
}

/** `/sp` — the firmware expects MD5 hashes of the new password (OpenSprinkler app behaviour). */
function ChangePasswordCard({ ctx }: { ctx: SectionCtx }) {
  const change = useChangePassword()
  const [npw, setNpw] = useState('')
  const [cpw, setCpw] = useState('')
  const mismatch = cpw.length > 0 && npw !== cpw
  const canSubmit = npw.length > 0 && npw === cpw && !change.isPending

  async function submit() {
    if (
      !window.confirm(
        'Change the controller password? HydroDash talks to the controller with the password configured on its server (OS_PASSWORD / OS_PW_HASH or OS_SITES) — update it there right after, or HydroDash will lose access.',
      )
    )
      return
    try {
      await change.mutateAsync({ npw: SparkMD5.hash(npw), cpw: SparkMD5.hash(cpw) })
      setNpw('')
      setCpw('')
      ctx.notify('Controller password changed. Update the HydroDash server configuration to match.')
    } catch (e) {
      ctx.fail(e instanceof Error ? e.message : 'Password change failed')
    }
  }

  return (
    <Card title="Controller password" icon={<KeyRound size={18} aria-hidden />}>
      <form
        className={styles.formBody}
        onSubmit={(e) => {
          e.preventDefault()
          if (canSubmit) void submit()
        }}
      >
        <p className={styles.warnNote}>
          HydroDash signs in to the controller with the password set on its server. After changing it here, update{' '}
          <code>OS_PASSWORD</code> (or <code>OS_PW_HASH</code> / <code>OS_SITES</code>) and restart HydroDash.
        </p>
        <Field label="New password" htmlFor="set-npw">
          <Input
            id="set-npw"
            type="password"
            autoComplete="new-password"
            value={npw}
            onChange={(e) => setNpw(e.target.value)}
          />
        </Field>
        <Field
          label="Confirm new password"
          htmlFor="set-cpw"
          hint={mismatch ? <span className={styles.errorText}>Passwords don't match.</span> : undefined}
        >
          <Input
            id="set-cpw"
            type="password"
            autoComplete="new-password"
            value={cpw}
            aria-invalid={mismatch || undefined}
            onChange={(e) => setCpw(e.target.value)}
          />
        </Field>
        <div className={styles.formActions}>
          <Button type="submit" variant="secondary" disabled={!canSubmit}>
            {change.isPending ? 'Changing…' : 'Change password'}
          </Button>
        </div>
      </form>
    </Card>
  )
}

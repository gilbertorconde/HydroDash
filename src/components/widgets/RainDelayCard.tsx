import { useId, useState } from 'react'
import { Umbrella } from 'lucide-react'
import { Button, Card, Input, Spinner } from '../ui'
import { formatDeviceDateTime, formatMinutesLong } from './dashboardShared'
import styles from './dashboardWidgets.module.css'

const PRESETS = [6, 12, 24, 48] as const
/** Firmware accepts up to 32767 h; keep the custom field to something sensible. */
const MAX_HOURS = 720

type Props = {
  loading: boolean
  active: boolean
  /** Delay end (`rdst`, controller-local epoch) when active. */
  until: number | null
  devt: number | undefined
  is24Hour: boolean
  busy: boolean
  /** `/cv rd=<hours>`; 0 clears the delay. */
  onSet: (hours: number) => void
  className?: string
}

/** Set (preset or custom hours) or clear the controller rain delay. */
export function RainDelayCard({ loading, active, until, devt, is24Hour, busy, onSet, className }: Props) {
  const [custom, setCustom] = useState('')
  const inputId = useId()
  const hours = Number(custom)
  const customValid = custom.trim() !== '' && Number.isInteger(hours) && hours >= 1 && hours <= MAX_HOURS
  const leftMin = active && until && devt ? Math.max(0, (until - devt) / 60) : null

  return (
    <Card
      className={className}
      title="Rain delay"
      subtitle={active ? 'Watering is suspended' : 'Pause scheduled watering for a while'}
      icon={<Umbrella size={18} aria-hidden />}
    >
      {loading ? (
        <Spinner />
      ) : (
        <div className={styles.stack}>
          {active ? (
            <div className={styles.rdActive}>
              <div>
                <strong>Until {until ? formatDeviceDateTime(until, devt, is24Hour) : '—'}</strong>
                {leftMin != null ? <span>{formatMinutesLong(leftMin)} left</span> : null}
              </div>
              <Button variant="secondary" size="sm" disabled={busy} onClick={() => onSet(0)}>
                Clear
              </Button>
            </div>
          ) : null}
          <div className={styles.chips} role="group" aria-label={active ? 'Replace delay with' : 'Delay for'}>
            {PRESETS.map((h) => (
              <button key={h} type="button" className={styles.chip} disabled={busy} onClick={() => onSet(h)}>
                {h} h
              </button>
            ))}
          </div>
          <form
            className={styles.hoursForm}
            onSubmit={(e) => {
              e.preventDefault()
              if (!customValid) return
              onSet(hours)
              setCustom('')
            }}
          >
            <label htmlFor={inputId} className={styles.srOnly}>
              Custom delay in hours
            </label>
            <Input
              id={inputId}
              type="number"
              inputMode="numeric"
              min={1}
              max={MAX_HOURS}
              step={1}
              placeholder="Custom hours"
              value={custom}
              onChange={(e) => setCustom(e.target.value)}
            />
            <Button type="submit" variant="primary" disabled={busy || !customValid}>
              {active ? 'Replace' : 'Set'}
            </Button>
          </form>
        </div>
      )}
    </Card>
  )
}

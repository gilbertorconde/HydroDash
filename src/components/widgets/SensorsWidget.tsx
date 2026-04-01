import { Spinner } from '../ui'
import styles from './dashboardWidgets.module.css'

type Settings = Record<string, unknown> | undefined

type Props = {
  settings: Settings
  providerLabel: string
  providerId: string
  weatherServiceRunning: string | null
}

export function SensorsWidget({
  settings,
  providerLabel,
  providerId,
  weatherServiceRunning,
}: Props) {
  if (!settings) return <Spinner />

  return (
    <dl className={styles.dl}>
      <dt>Sensor 1</dt>
      <dd>{settings.sn1 ? 'Active' : 'Inactive'}</dd>
      <dt>Sensor 2</dt>
      <dd>{settings.sn2 ? 'Active' : 'Inactive'}</dd>
      <dt>Weather provider</dt>
      <dd>
        {providerLabel}
        {providerId !== 'Apple' ? (
          <span className={styles.providerId}> ({providerId})</span>
        ) : null}
      </dd>
      <dt>Weather service</dt>
      <dd title="Name reported by the running weather script (wtdata.wp)">
        {weatherServiceRunning ?? '—'}
      </dd>
      <dt>Weather error</dt>
      <dd>{String(settings.wterr ?? 0)}</dd>
      <dt>Location</dt>
      <dd className={styles.mono}>{String(settings.loc ?? '—')}</dd>
    </dl>
  )
}

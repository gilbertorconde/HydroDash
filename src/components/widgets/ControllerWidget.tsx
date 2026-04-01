import type { UseQueryResult } from '@tanstack/react-query'
import type { JsonAll } from '../../api/types'
import { Spinner } from '../ui'
import styles from './dashboardWidgets.module.css'

type Props = {
  ja: UseQueryResult<JsonAll, Error>
  fwv: unknown
  fwm: unknown
}

export function ControllerWidget({ ja, fwv, fwm }: Props) {
  return (
    <>
      {ja.isLoading && !ja.data ? (
        <Spinner />
      ) : ja.isSuccess ? (
        <p className={styles.ok}>Connected and synced.</p>
      ) : null}
      <dl className={styles.dl}>
        <dt>Firmware</dt>
        <dd>
          {fwv != null ? `${fwv}` : '—'}
          {fwm != null ? `.${fwm}` : ''}
        </dd>
        <dt>Programs</dt>
        <dd>{ja.data?.programs?.nprogs ?? '—'}</dd>
        <dt>Stations</dt>
        <dd>{ja.data?.status?.nstations ?? '—'}</dd>
      </dl>
    </>
  )
}

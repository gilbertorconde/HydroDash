import type { UseQueryResult } from '@tanstack/react-query'
import type { JsonAll } from '../../api/types'
import { Spinner } from '../ui'
import styles from './dashboardWidgets.module.css'

type FirmwareUpdateHint = {
  /** e.g. 2.2.1(4), from defines.h when available */
  versionLabel: string
  releaseUrl: string
}

type Props = {
  ja: UseQueryResult<JsonAll, Error>
  fwv: unknown
  fwm: unknown
  /** When set, controller firmware is older than the latest GitHub unified release (informational only). */
  firmwareUpdate?: FirmwareUpdateHint | null
  /** When true, GitHub check succeeded and firmware matches or exceeds the latest published release. */
  firmwareUpToDate?: boolean
}

export function ControllerWidget({ ja, fwv, fwm, firmwareUpdate, firmwareUpToDate }: Props) {
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
      {firmwareUpdate ? (
        <p className={styles.firmwareUpdateNote} role="status">
          <a href={firmwareUpdate.releaseUrl} target="_blank" rel="noopener noreferrer">
            Update available
          </a>
          <span className={styles.mono}> {firmwareUpdate.versionLabel}</span>
        </p>
      ) : firmwareUpToDate ? (
        <p className={styles.firmwareUpToDateNote} role="status">
          Up to date
        </p>
      ) : null}
    </>
  )
}

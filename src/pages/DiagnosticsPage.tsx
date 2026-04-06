import { useDebugInfo } from '../api/hooks'
import { MoreSubpageLayout } from '../components/MoreSubpageLayout'
import shell from '../components/MoreSubpageLayout.module.css'
import { Card, ErrorBox, Spinner } from '../components/ui'
import styles from './DiagnosticsPage.module.css'

export function DiagnosticsPage() {
  const db = useDebugInfo(true)

  return (
    <MoreSubpageLayout title="Diagnostics">
      <p className={shell.lead}>
        Raw debug export from the controller (contents vary by firmware and build).
      </p>
      <Card title="Controller debug">
        {db.isLoading ? <Spinner /> : null}
        {db.error ? (
          <ErrorBox message={db.error instanceof Error ? db.error.message : 'Failed to load debug data'} />
        ) : null}
        {db.data ? <pre className={styles.pre}>{JSON.stringify(db.data, null, 2)}</pre> : null}
      </Card>
    </MoreSubpageLayout>
  )
}

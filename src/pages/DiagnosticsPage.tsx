import { useState } from 'react'
import { Check, Copy, Download, Stethoscope } from 'lucide-react'
import { useDebugInfo } from '../api/hooks'
import { MoreSubpageLayout } from '../components/MoreSubpageLayout'
import { Button, Card, ErrorBox, Pill, Spinner } from '../components/ui'
import styles from './DiagnosticsPage.module.css'

function downloadJson(filename: string, data: unknown) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

/** Top-level scalar fields from the debug payload, shown as a quick summary. */
function scalarEntries(data: Record<string, unknown>): [string, string][] {
  return Object.entries(data)
    .filter(([, v]) => typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean')
    .map(([k, v]) => [k, String(v)])
}

export function DiagnosticsPage() {
  const db = useDebugInfo(true)
  const [copied, setCopied] = useState(false)
  const json = db.data ? JSON.stringify(db.data, null, 2) : ''

  async function copy() {
    try {
      await navigator.clipboard.writeText(json)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1800)
    } catch {
      /* clipboard unavailable (e.g. insecure context) */
    }
  }

  const summary = db.data ? scalarEntries(db.data) : []

  return (
    <MoreSubpageLayout
      title="Diagnostics"
      eyebrow={<Pill tone="advanced">Advanced</Pill>}
      subtitle="Raw debug export from the controller. Contents vary by firmware and build."
    >
      <Card
        title="Controller debug"
        subtitle="From /db"
        icon={<Stethoscope size={18} aria-hidden />}
      >
        {db.isLoading ? (
          <div className={styles.loading}>
            <Spinner />
          </div>
        ) : null}
        {db.error ? (
          <ErrorBox message={db.error instanceof Error ? db.error.message : 'Failed to load debug data'} />
        ) : null}
        {db.data ? (
          <div className={styles.toolbar}>
            <Button
              variant="secondary"
              size="sm"
              startIcon={copied ? <Check size={15} aria-hidden /> : <Copy size={15} aria-hidden />}
              onClick={() => void copy()}
            >
              {copied ? 'Copied' : 'Copy JSON'}
            </Button>
            <Button
              variant="secondary"
              size="sm"
              startIcon={<Download size={15} aria-hidden />}
              onClick={() => downloadJson(`controller-debug-${new Date().toISOString().slice(0, 10)}.json`, db.data)}
            >
              Download
            </Button>
          </div>
        ) : null}
        {summary.length > 0 ? (
          <dl className={styles.summary}>
            {summary.map(([k, v]) => (
              <div key={k} className={styles.summaryItem}>
                <dt>{k}</dt>
                <dd>{v}</dd>
              </div>
            ))}
          </dl>
        ) : null}
        {db.data ? <pre className={styles.pre}>{json}</pre> : null}
      </Card>
    </MoreSubpageLayout>
  )
}

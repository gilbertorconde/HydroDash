import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useRef, useState } from 'react'
import { osCommand } from '../api/client'
import { qk, useJsonAll } from '../api/hooks'
import { MoreSubpageLayout } from '../components/MoreSubpageLayout'
import { Button, Card, ErrorBox, Spinner } from '../components/ui'
import { useAppPreferences } from '../lib/appPreferences'
import {
  type OpenSprinklerControllerBackup,
  controllerBackupNetworkWarning,
  exportControllerDocument,
  importOpenSprinklerControllerBackup,
  parseOpenSprinklerControllerBackup,
} from '../lib/controllerConfigImport'
import {
  applyHydroDashAppBackup,
  collectHydroDashAppBackup,
  parseHydroDashAppBackup,
} from '../lib/hydroDashAppBackup'
import styles from './ConfigBackupPage.module.css'

function downloadJson(filename: string, data: unknown) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

function backupFilename(prefix: string) {
  const d = new Date()
  const day = d.toISOString().slice(0, 10)
  return `${prefix}-${day}.json`
}

export function ConfigBackupPage() {
  const ja = useJsonAll()
  const prefs = useAppPreferences()
  const qc = useQueryClient()
  const controllerInputRef = useRef<HTMLInputElement>(null)
  const appInputRef = useRef<HTMLInputElement>(null)

  const [controllerMsg, setControllerMsg] = useState<string | null>(null)
  const [controllerLocalErr, setControllerLocalErr] = useState<string | null>(null)
  const [appMsg, setAppMsg] = useState<string | null>(null)

  const importController = useMutation({
    mutationFn: async ({ backup }: { backup: OpenSprinklerControllerBackup }) => {
      if (!ja.data) throw new Error('Controller data not loaded yet')
      await importOpenSprinklerControllerBackup(backup, ja.data, osCommand)
    },
    onSuccess: async () => {
      setControllerMsg('Configuration applied. Refreshing data from the controller.')
      await qc.invalidateQueries({ queryKey: qk.all })
    },
  })

  const importApp = useMutation({
    mutationFn: async (file: File) => {
      const text = await file.text()
      let raw: unknown
      try {
        raw = JSON.parse(text)
      } catch {
        throw new Error('File is not valid JSON')
      }
      const data = parseHydroDashAppBackup(raw)
      applyHydroDashAppBackup(data)
    },
    onSuccess: () => {
      setAppMsg('App settings restored. Reloading…')
      window.setTimeout(() => window.location.reload(), 400)
    },
  })

  function exportController() {
    if (!ja.data) return
    downloadJson(backupFilename('controller-backup'), exportControllerDocument(ja.data))
    setControllerMsg('Controller backup downloaded.')
  }

  function exportApp() {
    downloadJson(backupFilename('hydrodash-app-backup'), {
      hydrodashApp: collectHydroDashAppBackup(prefs),
    })
    setAppMsg('App backup downloaded (this browser only).')
  }

  async function onPickControllerFile(file: File) {
    setControllerMsg(null)
    setControllerLocalErr(null)
    importController.reset()
    const text = await file.text()
    let raw: unknown
    try {
      raw = JSON.parse(text.trim().replace(/[\u201c\u201d\u2033]/g, '"'))
    } catch {
      setControllerLocalErr('File is not valid JSON.')
      return
    }
    let backup: OpenSprinklerControllerBackup
    try {
      backup = parseOpenSprinklerControllerBackup(raw)
    } catch (e) {
      setControllerLocalErr(e instanceof Error ? e.message : 'Invalid backup')
      return
    }
    if (!ja.data) {
      setControllerMsg('Wait for controller data to load, then try again.')
      return
    }
    let msg =
      'Replace all programs, station options, and device options on this controller from the backup?'
    if (controllerBackupNetworkWarning(backup, ja.data)) {
      msg +=
        '\n\nWarning: network-related values differ. The device may no longer be reachable at this address.'
    }
    if (!window.confirm(msg)) {
      setControllerMsg('Import cancelled.')
      return
    }
    importController.mutate({ backup })
  }

  return (
    <MoreSubpageLayout title="Configuration backup">
      <div className={styles.intro}>
        <p className={styles.introPara}>
          Export saves a full snapshot of programs, zones, and options from the controller.
        </p>
        <p className={styles.introPara}>
          Import applies that snapshot and overwrites the configuration on the device you currently have
          selected.
        </p>
        <p className={styles.introPara}>
          The second card below is only for this browser: Home layout, theme, and display preferences. It
          does not include your login or server-side settings.
        </p>
      </div>

      <div className={styles.stack}>
        <Card title="Controller" bodyClassName={styles.cardBodyLoose}>
          {ja.isLoading && !ja.data ? <Spinner /> : null}
          {ja.isError ? <ErrorBox message="Could not load configuration from the controller." /> : null}

          <ul className={styles.bulletList}>
            <li>
              Import replaces <strong>all</strong> programs, zone names, station metadata, and device options
              on the active controller.
            </li>
            <li>If you use multiple controllers, choose the right one under Controllers before importing.</li>
            <li>
              Very old backup files (programs from firmware before 2.1) cannot be applied here until they
              have been loaded on the device with compatible firmware and you export a new backup.
            </li>
          </ul>

          <h3 className={styles.subheading}>Export</h3>
          <p className={styles.exportDesc}>
            Download a JSON file with the full configuration. You can archive it, move it to another machine,
            or import it later from this page.
          </p>
          <div className={styles.actions}>
            <Button variant="secondary" disabled={!ja.data} onClick={exportController}>
              Download controller backup
            </Button>
          </div>

          <h3 className={`${styles.subheading} ${styles.subheadingSpaced}`}>Import</h3>
          <p className={styles.importIntro}>
            Choose a backup JSON file. You will be asked to confirm before anything is written to the
            controller.
          </p>
          <div className={styles.actionsCol}>
            <Button
              variant="primary"
              disabled={importController.isPending || !ja.data}
              onClick={() => controllerInputRef.current?.click()}
            >
              {importController.isPending ? 'Importing…' : 'Choose file to import…'}
            </Button>
            <input
              ref={controllerInputRef}
              type="file"
              accept="application/json,.json"
              className={styles.hiddenFile}
              aria-hidden
              onChange={(e) => {
                const f = e.target.files?.[0]
                e.target.value = ''
                if (f) void onPickControllerFile(f)
              }}
            />
          </div>

          <div className={styles.feedback}>
            {controllerLocalErr ? <ErrorBox message={controllerLocalErr} /> : null}
            {importController.isError ? (
              <ErrorBox
                message={importController.error instanceof Error ? importController.error.message : 'Import failed'}
              />
            ) : null}
            {controllerMsg ? <p className={styles.ok}>{controllerMsg}</p> : null}
          </div>
        </Card>

        <Card title="HydroDash app (this browser)" bodyClassName={styles.cardBodyLoose}>
          <ul className={styles.bulletList}>
            <li>
              Covers display preferences, theme mode, and Home dashboard layout in <strong>this</strong>{' '}
              browser only.
            </li>
            <li>Does not include login sessions or server-side notification settings.</li>
          </ul>

          <h3 className={styles.subheading}>Export</h3>
          <p className={styles.exportDesc}>
            Download a JSON file you can keep as a snapshot of how HydroDash is set up on this device and
            browser.
          </p>
          <div className={styles.actions}>
            <Button variant="secondary" onClick={exportApp}>
              Download app backup
            </Button>
          </div>

          <h3 className={`${styles.subheading} ${styles.subheadingSpaced}`}>Import</h3>
          <p className={styles.importIntro}>
            Choose a HydroDash app backup file. You will be asked to confirm; the page reloads after a
            successful restore.
          </p>
          <div className={styles.actionsCol}>
            <Button
              variant="primary"
              disabled={importApp.isPending}
              onClick={() => appInputRef.current?.click()}
            >
              {importApp.isPending ? 'Restoring…' : 'Choose file to restore…'}
            </Button>
            <input
              ref={appInputRef}
              type="file"
              accept="application/json,.json"
              className={styles.hiddenFile}
              aria-hidden
              onChange={(e) => {
                const f = e.target.files?.[0]
                e.target.value = ''
                if (!f) return
                setAppMsg(null)
                if (
                  !window.confirm(
                    'Replace HydroDash display preferences, theme, and Home dashboard layout in this browser?',
                  )
                ) {
                  setAppMsg('Import cancelled.')
                  return
                }
                importApp.mutate(f)
              }}
            />
          </div>

          <div className={styles.feedback}>
            {importApp.isError ? (
              <ErrorBox
                message={importApp.error instanceof Error ? importApp.error.message : 'Import failed'}
              />
            ) : null}
            {appMsg ? <p className={styles.ok}>{appMsg}</p> : null}
          </div>
        </Card>
      </div>
    </MoreSubpageLayout>
  )
}

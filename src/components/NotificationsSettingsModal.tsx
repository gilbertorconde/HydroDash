import { useState } from 'react'
import { X } from 'lucide-react'
import {
  DEFAULT_SERVICE_ENABLED,
  defaultSettingsJson,
  mergeNotificationSettings,
  NOTIFICATION_SERVICE_KEYS,
  NOTIFICATION_SERVICE_LABELS,
  type NotificationServiceKey,
  type NotificationSettingsJson,
} from '../server/notifications/types'
import { Button, ErrorBox, Input, Label } from './ui'
import { useNotificationsSaveSettings, useNotificationsTest } from '../api/hooks'
import styles from './NotificationsSettingsModal.module.css'

type Props = {
  onClose: () => void
  initial: NotificationSettingsJson | null
  /** From server config; push uses persisted settings + NTFY_SERVER_URL. */
  pushConfigured?: boolean
}

function serviceEnabledLocal(settings: NotificationSettingsJson, key: NotificationServiceKey): boolean {
  const v = settings.enabledServices[key]
  if (typeof v === 'boolean') return v
  return DEFAULT_SERVICE_ENABLED[key]
}

export function NotificationsSettingsModal({ onClose, initial, pushConfigured }: Props) {
  const save = useNotificationsSaveSettings()
  const testNotify = useNotificationsTest()
  const [settings, setSettings] = useState<NotificationSettingsJson>(() =>
    initial ? mergeNotificationSettings(initial) : defaultSettingsJson(),
  )

  function toggleService(key: NotificationServiceKey, on: boolean) {
    setSettings((s) => ({
      ...s,
      enabledServices: { ...s.enabledServices, [key]: on },
    }))
  }

  return (
    <div className={styles.backdrop} role="presentation" onClick={onClose}>
      <div
        className={styles.dialog}
        role="dialog"
        aria-modal="true"
        aria-labelledby="notifications-settings-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className={styles.dialogHeader}>
          <h2 id="notifications-settings-title" className={styles.dialogTitle}>
            Notifications
          </h2>
          <button type="button" className={styles.closeBtn} onClick={onClose} aria-label="Close">
            <X size={20} aria-hidden />
          </button>
        </div>
        <div className={styles.dialogBody}>
          <p className={styles.hint}>
            Requires MariaDB (<code>DATABASE_URL</code>) and the <code>hydrodash-notify</code> service for polling.
            Set <code>NTFY_SERVER_URL</code> for push.
          </p>

          <div className={styles.field}>
            <Label htmlFor="ntfy-default-topic">Default ntfy topic</Label>
            <Input
              id="ntfy-default-topic"
              value={settings.defaultTopic}
              onChange={(e) => setSettings((s) => ({ ...s, defaultTopic: e.target.value }))}
              placeholder="hydrodash"
              autoComplete="off"
            />
          </div>

          <div className={styles.field}>
            <span className={styles.fieldLabel}>Notify when</span>
            <div className={styles.serviceList}>
              {NOTIFICATION_SERVICE_KEYS.map((key) => (
                <label key={key} className={styles.serviceRow}>
                  <input
                    type="checkbox"
                    checked={serviceEnabledLocal(settings, key)}
                    onChange={(e) => toggleService(key, e.target.checked)}
                  />
                  <span>
                    {NOTIFICATION_SERVICE_LABELS[key]}{' '}
                    <span className={styles.serviceKey}>({key})</span>
                  </span>
                </label>
              ))}
            </div>
          </div>

          <div className={styles.testBlock}>
            <div className={styles.testCopy}>
              <span className={styles.fieldLabel}>Try it</span>
              <p className={styles.testHint}>
                Inserts a test row in the inbox
                {pushConfigured ? ' and sends your default ntfy topic.' : ' (push requires NTFY_SERVER_URL on the server).'}
              </p>
            </div>
            <Button
              type="button"
              variant="secondary"
              disabled={testNotify.isPending}
              onClick={() => testNotify.mutate()}
            >
              {testNotify.isPending ? 'Sending…' : 'Send test notification'}
            </Button>
          </div>
          {testNotify.isError ? (
            <ErrorBox
              message={testNotify.error instanceof Error ? testNotify.error.message : 'Test failed'}
            />
          ) : null}
          {testNotify.isSuccess && testNotify.data ? (
            <p className={styles.testResult} role="status">
              {testNotify.data.push === 'skipped' &&
                'Saved to inbox. Push is not configured on the server.'}
              {testNotify.data.push === 'ok' && 'Saved to inbox and push sent to ntfy.'}
              {testNotify.data.push === 'failed' &&
                'Saved to inbox. Push was attempted but ntfy did not accept the message.'}
            </p>
          ) : null}

          {save.isError ? (
            <ErrorBox message={save.error instanceof Error ? save.error.message : 'Save failed'} />
          ) : null}

          <div className={styles.actions}>
            <Button variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button
              variant="primary"
              disabled={save.isPending}
              onClick={() =>
                save.mutate(settings, {
                  onSuccess: () => onClose(),
                })
              }
            >
              Save
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}

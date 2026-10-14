import { useState } from 'react'
import { Bell, Send, X } from 'lucide-react'
import {
  DEFAULT_SERVICE_ENABLED,
  defaultSettingsJson,
  mergeNotificationSettings,
  NOTIFICATION_SERVICE_KEYS,
  NOTIFICATION_SERVICE_LABELS,
  type NotificationServiceKey,
  type NotificationSettingsJson,
} from '../server/notifications/types'
import { Button, ErrorBox, Field, Input, Switch } from './ui'
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
          <span className={styles.headerIcon} aria-hidden>
            <Bell size={18} />
          </span>
          <div className={styles.headerText}>
            <h2 id="notifications-settings-title" className={styles.dialogTitle}>
              Push notifications
            </h2>
            <p className={styles.dialogSubtitle}>HydroDash alerts for this server (inbox + ntfy push)</p>
          </div>
          <button type="button" className={styles.closeBtn} onClick={onClose} aria-label="Close">
            <X size={20} aria-hidden />
          </button>
        </div>
        <div className={styles.dialogBody}>
          <Field
            label="Default ntfy topic"
            htmlFor="ntfy-default-topic"
            hint="Subscribe to this topic in the ntfy app to get pushes on your phone."
          >
            <Input
              id="ntfy-default-topic"
              value={settings.defaultTopic}
              onChange={(e) => setSettings((s) => ({ ...s, defaultTopic: e.target.value }))}
              placeholder="hydrodash"
              autoComplete="off"
            />
          </Field>

          <section className={styles.group} aria-labelledby="notify-when-title">
            <h3 id="notify-when-title" className={styles.groupTitle}>
              Notify when
            </h3>
            <div className={styles.serviceList}>
              {NOTIFICATION_SERVICE_KEYS.map((key) => (
                <Switch
                  key={key}
                  checked={serviceEnabledLocal(settings, key)}
                  onChange={(on) => toggleService(key, on)}
                  label={NOTIFICATION_SERVICE_LABELS[key]}
                />
              ))}
            </div>
          </section>

          <div className={styles.testBlock}>
            <div className={styles.testCopy}>
              <span className={styles.testTitle}>Try it</span>
              <p className={styles.testHint}>
                Adds a test message to the inbox
                {pushConfigured ? ' and pushes it to your default ntfy topic.' : ' (push needs NTFY_SERVER_URL on the server).'}
              </p>
            </div>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              startIcon={<Send size={15} aria-hidden />}
              disabled={testNotify.isPending}
              onClick={() => testNotify.mutate()}
            >
              {testNotify.isPending ? 'Sending…' : 'Send test'}
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

          <p className={styles.hint}>
            Needs MariaDB (<code>DATABASE_URL</code>) and the <code>hydrodash-notify</code> service for polling;
            set <code>NTFY_SERVER_URL</code> for phone push.
          </p>
        </div>
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
            {save.isPending ? 'Saving…' : 'Save'}
          </Button>
        </div>
      </div>
    </div>
  )
}

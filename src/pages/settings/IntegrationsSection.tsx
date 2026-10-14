import { useMemo, useState } from 'react'
import { AdvancedSection, Button, Field, Input, Switch } from '../../components/ui'
import {
  emailFromJson,
  emailToJson,
  mqttFromJson,
  mqttToJson,
  otcFromJson,
  otcToJson,
  type EmailForm,
  type MqttForm,
  type OtcForm,
} from '../../lib/integrationSettings'
import {
  NOTIFICATION_EVENT_LABELS,
  packNotificationEvents,
  unpackNotificationEvents,
} from '../../lib/opensprinklerOptions'
import { FieldGrid, SettingsForm, SubHeading } from './SettingsForm'
import {
  coJsonBlob,
  intOf,
  num,
  stringifySettingJson,
  useDraft,
  type OptionPayload,
  type SectionCtx,
} from './settingsShared'
import styles from './settings.module.css'

type IntegrationValues = {
  dname: string
  ifkey: string
  /** `ife` (bits 0–7) + `ife2` (bits 8+) packed into one number. */
  events: number
  otc: OtcForm
  mqtt: MqttForm
  email: EmailForm
}

export function IntegrationsSection({ ctx }: { ctx: SectionCtx }) {
  const { opts, st } = ctx
  const showDname = 'dname' in st
  const showIfkey = 'ifkey' in st || opts.ife !== undefined
  const showEvents = opts.ife !== undefined
  const hasIfe2 = opts.ife2 !== undefined && opts.ife2 !== null
  const showOtc = 'otc' in st

  const base = useMemo<IntegrationValues>(
    () => ({
      dname: String(st.dname ?? ''),
      ifkey: String(st.ifkey ?? ''),
      events: (num(opts.ife) & 0xff) | ((num(opts.ife2) & 0xff) << 8),
      otc: otcFromJson(st.otc),
      mqtt: mqttFromJson(st.mqtt),
      email: emailFromJson(st.email),
    }),
    [st.dname, st.ifkey, st.otc, st.mqtt, st.email, opts.ife, opts.ife2],
  )
  const d = useDraft(base)
  const v = d.values
  const bits = unpackNotificationEvents(v.events, NOTIFICATION_EVENT_LABELS.length)

  async function save() {
    const p: OptionPayload = {}
    if (showDname && d.isDirty('dname')) p.dname = v.dname
    if (showIfkey && d.isDirty('ifkey')) p.ifkey = v.ifkey
    if (showEvents && d.isDirty('events')) {
      p.ife = v.events & 0xff
      if (hasIfe2) p.ife2 = (v.events >> 8) & 0xff
    }
    if (showOtc && d.isDirty('otc')) p.otc = coJsonBlob(otcToJson(v.otc))
    if (d.isDirty('mqtt')) p.mqtt = coJsonBlob(mqttToJson(v.mqtt))
    if (d.isDirty('email')) p.email = coJsonBlob(emailToJson(v.email))
    if (Object.keys(p).length && (await ctx.apply(p))) d.discard()
  }

  const setMqtt = (patch: Partial<MqttForm>) => d.set('mqtt', { ...v.mqtt, ...patch })
  const setEmail = (patch: Partial<EmailForm>) => d.set('email', { ...v.email, ...patch })
  const setOtc = (patch: Partial<OtcForm>) => d.set('otc', { ...v.otc, ...patch })

  return (
    <>
      <SettingsForm dirty={d.dirty} saving={ctx.saving} onSave={save} onDiscard={d.discard}>
        {showDname || showIfkey ? (
          <>
            <SubHeading>Identity</SubHeading>
            <FieldGrid>
              {showDname ? (
                <Field label="Device name" htmlFor="set-dname" hint="Shown in email and IFTTT messages.">
                  <Input id="set-dname" value={v.dname} onChange={(e) => d.set('dname', e.target.value)} />
                </Field>
              ) : null}
              {showIfkey ? (
                <Field label="IFTTT webhooks key" htmlFor="set-ifkey" hint="From ifttt.com → Webhooks settings.">
                  <Input
                    id="set-ifkey"
                    value={v.ifkey}
                    spellCheck={false}
                    autoComplete="off"
                    onChange={(e) => d.set('ifkey', e.target.value)}
                  />
                </Field>
              ) : null}
            </FieldGrid>
          </>
        ) : null}

        {showEvents ? (
          <>
            <SubHeading hint="Which controller events are sent over MQTT, email and IFTTT. HydroDash's own push notifications are set up separately.">
              Events
            </SubHeading>
            <div className={styles.switchGrid}>
              {NOTIFICATION_EVENT_LABELS.map((label, i) => (
                <Switch
                  key={label}
                  checked={bits[i] ?? false}
                  disabled={!hasIfe2 && i >= 8}
                  onChange={(c) => {
                    const next = [...bits]
                    next[i] = c
                    d.set('events', packNotificationEvents(next))
                  }}
                  label={label}
                />
              ))}
            </div>
          </>
        ) : null}

        <SubHeading>MQTT</SubHeading>
        <Switch checked={v.mqtt.en === 1} onChange={(c) => setMqtt({ en: c ? 1 : 0 })} label="Enable MQTT" />
        <FieldGrid>
          <Field label="Broker / server" htmlFor="set-mq-host">
            <Input id="set-mq-host" value={v.mqtt.host} disabled={!v.mqtt.en} onChange={(e) => setMqtt({ host: e.target.value })} />
          </Field>
          <Field label="Port" htmlFor="set-mq-port">
            <Input
              id="set-mq-port"
              type="number"
              inputMode="numeric"
              min={0}
              max={65535}
              value={v.mqtt.port}
              disabled={!v.mqtt.en}
              onChange={(e) => setMqtt({ port: intOf(e.target.value) })}
            />
          </Field>
          <Field label="Username (optional)" htmlFor="set-mq-user">
            <Input
              id="set-mq-user"
              value={v.mqtt.user}
              autoComplete="off"
              disabled={!v.mqtt.en}
              onChange={(e) => setMqtt({ user: e.target.value })}
            />
          </Field>
          <Field label="Password (optional)" htmlFor="set-mq-pass">
            <Input
              id="set-mq-pass"
              type="password"
              autoComplete="new-password"
              value={v.mqtt.pass}
              disabled={!v.mqtt.en}
              onChange={(e) => setMqtt({ pass: e.target.value })}
            />
          </Field>
          <Field label="Publish topic" htmlFor="set-mq-pub">
            <Input id="set-mq-pub" value={v.mqtt.pubt} disabled={!v.mqtt.en} onChange={(e) => setMqtt({ pubt: e.target.value })} />
          </Field>
          <Field label="Subscribe topic (optional)" htmlFor="set-mq-sub">
            <Input id="set-mq-sub" value={v.mqtt.subt} disabled={!v.mqtt.en} onChange={(e) => setMqtt({ subt: e.target.value })} />
          </Field>
        </FieldGrid>

        <SubHeading>Email</SubHeading>
        <Switch checked={v.email.en === 1} onChange={(c) => setEmail({ en: c ? 1 : 0 })} label="Enable email" />
        <FieldGrid>
          <Field label="SMTP server" htmlFor="set-em-host">
            <Input id="set-em-host" value={v.email.host} disabled={!v.email.en} onChange={(e) => setEmail({ host: e.target.value })} />
          </Field>
          <Field label="Port" htmlFor="set-em-port">
            <Input
              id="set-em-port"
              type="number"
              inputMode="numeric"
              min={0}
              max={65535}
              value={v.email.port}
              disabled={!v.email.en}
              onChange={(e) => setEmail({ port: intOf(e.target.value) })}
            />
          </Field>
          <Field label="Sender email" htmlFor="set-em-user">
            <Input
              id="set-em-user"
              type="email"
              autoComplete="off"
              value={v.email.user}
              disabled={!v.email.en}
              onChange={(e) => setEmail({ user: e.target.value })}
            />
          </Field>
          <Field label="App password" htmlFor="set-em-pass">
            <Input
              id="set-em-pass"
              type="password"
              autoComplete="new-password"
              value={v.email.pass}
              disabled={!v.email.en}
              onChange={(e) => setEmail({ pass: e.target.value })}
            />
          </Field>
          <Field label="Recipient email" htmlFor="set-em-to">
            <Input
              id="set-em-to"
              type="email"
              value={v.email.recipient}
              disabled={!v.email.en}
              onChange={(e) => setEmail({ recipient: e.target.value })}
            />
          </Field>
        </FieldGrid>

        {showOtc ? (
          <>
            <SubHeading hint="Remote access through the OpenThings Cloud relay.">OpenThings Cloud (OTC)</SubHeading>
            <Switch checked={v.otc.en === 1} onChange={(c) => setOtc({ en: c ? 1 : 0 })} label="Enable OTC" />
            <FieldGrid>
              <Field label="Token" htmlFor="set-otc-token" hint="32 characters.">
                <Input
                  id="set-otc-token"
                  value={v.otc.token}
                  maxLength={64}
                  spellCheck={false}
                  disabled={!v.otc.en}
                  onChange={(e) => setOtc({ token: e.target.value })}
                />
              </Field>
              <Field label="Server host" htmlFor="set-otc-server">
                <Input
                  id="set-otc-server"
                  value={v.otc.server}
                  spellCheck={false}
                  disabled={!v.otc.en}
                  onChange={(e) => setOtc({ server: e.target.value })}
                />
              </Field>
            </FieldGrid>
          </>
        ) : null}
      </SettingsForm>

      <AdvancedSection
        id="settings.integrations.rawJson"
        title="Raw JSON"
        description="Edit the MQTT, email and OTC objects exactly as the firmware stores them"
      >
        <div className={styles.rawStack}>
          <RawJsonEditor key={`mqtt:${stringifySettingJson(st.mqtt)}`} ctx={ctx} optionKey="mqtt" label="MQTT" />
          <RawJsonEditor key={`email:${stringifySettingJson(st.email)}`} ctx={ctx} optionKey="email" label="Email" />
          {showOtc ? (
            <RawJsonEditor key={`otc:${stringifySettingJson(st.otc)}`} ctx={ctx} optionKey="otc" label="OTC" />
          ) : null}
        </div>
      </AdvancedSection>
    </>
  )
}

/** Textarea over one JSON option; saves the parsed object as-is (extra keys included). */
function RawJsonEditor({
  ctx,
  optionKey,
  label,
}: {
  ctx: SectionCtx
  optionKey: 'mqtt' | 'email' | 'otc'
  label: string
}) {
  const initial = stringifySettingJson(ctx.st[optionKey])
  const [text, setText] = useState(initial)
  const id = `set-raw-${optionKey}`

  function saveJson() {
    let parsed: unknown
    try {
      parsed = JSON.parse(text)
    } catch {
      ctx.fail(`Invalid JSON for ${label}.`)
      return
    }
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      ctx.fail(`${label} JSON must be an object.`)
      return
    }
    void ctx.apply({ [optionKey]: coJsonBlob(parsed as Record<string, unknown>) }, `${label} JSON saved.`)
  }

  return (
    <Field label={label} htmlFor={id}>
      <textarea
        id={id}
        className={styles.textarea}
        rows={6}
        value={text}
        spellCheck={false}
        onChange={(e) => setText(e.target.value)}
      />
      <div className={styles.rawActions}>
        {text !== initial ? (
          <Button variant="ghost" size="sm" onClick={() => setText(initial)}>
            Reset
          </Button>
        ) : null}
        <Button variant="secondary" size="sm" disabled={ctx.saving || text === initial} onClick={saveJson}>
          Parse &amp; save
        </Button>
      </div>
    </Field>
  )
}

import { useMemo } from 'react'
import { Field, Input, Switch } from '../../components/ui'
import { octetsToIp, parseIpToOctets } from '../../lib/ipOctets'
import { FieldGrid, SettingsForm, SubHeading } from './SettingsForm'
import { intOf, num, type OptionPayload, type SectionCtx, useDraft } from './settingsShared'
import styles from './settings.module.css'

/** Address fields → firmware option prefix (`ip1..ip4`, `gw1..gw4`, …). */
const ADDRESS_FIELDS = [
  { key: 'ip', prefix: 'ip', label: 'IP address' },
  { key: 'gw', prefix: 'gw', label: 'Gateway' },
  { key: 'subn', prefix: 'subn', label: 'Subnet mask' },
  { key: 'dns', prefix: 'dns', label: 'DNS server' },
] as const

const FLAG_KEYS = ['dhcp', 'ntp', 'ar', 'sar'] as const

/** Changing these can make the controller unreachable from HydroDash. */
const RISKY_KEYS = ['dhcp', 'ip', 'gw', 'subn', 'dns', 'port', 'hp0', 'hp1']

/** The HTTP port is stored as two bytes: `hp0` = low byte, `hp1` = high byte. */
function httpPortFromBytes(hp0: number, hp1: number): number {
  return ((hp1 & 0xff) << 8) | (hp0 & 0xff)
}

function splitHttpPort(port: number): { hp0: number; hp1: number } {
  const p = Math.max(0, Math.min(65535, Math.round(port)))
  return { hp0: p & 0xff, hp1: (p >> 8) & 0xff }
}

function addressFrom(opts: Record<string, unknown>, prefix: string): string | undefined {
  if (opts[`${prefix}1`] === undefined) return undefined
  return octetsToIp(num(opts[`${prefix}1`]), num(opts[`${prefix}2`]), num(opts[`${prefix}3`]), num(opts[`${prefix}4`]))
}

type NetValues = Record<string, string | number | boolean>

export function NetworkSection({ ctx }: { ctx: SectionCtx }) {
  const { opts } = ctx
  const hasPort = opts.hp0 !== undefined && opts.hp1 !== undefined

  const base = useMemo(() => {
    const b: NetValues = {}
    for (const k of FLAG_KEYS) if (opts[k] !== undefined) b[k] = opts[k] === 1
    for (const f of ADDRESS_FIELDS) {
      const a = addressFrom(opts, f.prefix)
      if (a !== undefined) b[f.key] = a
    }
    const ntpIp = addressFrom(opts, 'ntp')
    if (ntpIp !== undefined) b.ntpIp = ntpIp
    if (hasPort) b.port = httpPortFromBytes(num(opts.hp0), num(opts.hp1))
    else {
      if (opts.hp0 !== undefined) b.hp0 = num(opts.hp0)
      if (opts.hp1 !== undefined) b.hp1 = num(opts.hp1)
    }
    if (opts.devid !== undefined) b.devid = num(opts.devid)
    return b
  }, [opts, hasPort])

  const d = useDraft(base)
  const v = d.values
  const dhcpOn = v.dhcp === true
  const has = (k: string) => base[k] !== undefined

  async function save() {
    const p: OptionPayload = {}
    for (const k of d.dirtyKeys) {
      if ((FLAG_KEYS as readonly string[]).includes(k)) {
        p[k] = v[k] ? 1 : 0
        continue
      }
      const addr = ADDRESS_FIELDS.find((f) => f.key === k)
      if (addr || k === 'ntpIp') {
        // Static addresses only apply with DHCP off.
        if (addr && dhcpOn) continue
        const octets = parseIpToOctets(String(v[k]))
        if (!octets) {
          ctx.fail(`Enter a valid dotted address for ${addr ? addr.label : 'the NTP server'} (e.g. 192.168.1.20).`)
          return
        }
        const prefix = addr ? addr.prefix : 'ntp'
        octets.forEach((o, i) => (p[`${prefix}${i + 1}`] = o))
        continue
      }
      if (k === 'port') Object.assign(p, splitHttpPort(Number(v.port)))
      else p[k] = Number(v[k])
    }
    if (Object.keys(p).length === 0) {
      d.discard()
      return
    }
    if (
      d.dirtyKeys.some((k) => RISKY_KEYS.includes(k)) &&
      !window.confirm(
        'Network changes can make the controller unreachable from HydroDash until you fix them on the device. Some only apply after a restart. Save anyway?',
      )
    )
      return
    if (await ctx.apply(p)) d.discard()
  }

  return (
    <SettingsForm
      dirty={d.dirty}
      saving={ctx.saving}
      onSave={save}
      onDiscard={d.discard}
      footerNote="Some changes need a controller restart"
    >
      {has('dhcp') || ADDRESS_FIELDS.some((f) => has(f.key)) ? (
        <>
          <SubHeading>Connection</SubHeading>
          {has('dhcp') ? (
            <Switch
              checked={dhcpOn}
              onChange={(c) => d.set('dhcp', c)}
              label="Use DHCP"
              description="Get an address from your router automatically. Restart required."
            />
          ) : null}
          {ADDRESS_FIELDS.some((f) => has(f.key)) ? (
            <>
              {dhcpOn ? <p className={styles.note}>Turn DHCP off to set a static address.</p> : null}
              <FieldGrid>
                {ADDRESS_FIELDS.filter((f) => has(f.key)).map((f) => (
                  <Field key={f.key} label={f.label} htmlFor={`set-${f.key}`}>
                    <Input
                      id={`set-${f.key}`}
                      value={String(v[f.key])}
                      inputMode="decimal"
                      spellCheck={false}
                      disabled={dhcpOn}
                      onChange={(e) => d.set(f.key, e.target.value)}
                    />
                  </Field>
                ))}
              </FieldGrid>
            </>
          ) : null}
        </>
      ) : null}

      {has('ntp') || has('ntpIp') ? (
        <>
          <SubHeading>Time sync</SubHeading>
          {has('ntp') ? (
            <Switch checked={v.ntp === true} onChange={(c) => d.set('ntp', c)} label="NTP sync" description="Keep the controller clock in sync over the internet." />
          ) : null}
          {has('ntpIp') ? (
            <Field label="NTP server address" htmlFor="set-ntpip" hint="0.0.0.0 uses the firmware default.">
              <Input
                id="set-ntpip"
                value={String(v.ntpIp)}
                inputMode="decimal"
                spellCheck={false}
                onChange={(e) => d.set('ntpIp', e.target.value)}
              />
            </Field>
          ) : null}
        </>
      ) : null}

      {has('port') || has('hp0') || has('hp1') || has('devid') ? (
        <>
          <SubHeading>Web server</SubHeading>
          <FieldGrid>
            {has('port') ? (
              <Field label="HTTP port" htmlFor="set-port" hint="Restart required. HydroDash must be pointed at the new port.">
                <Input
                  id="set-port"
                  type="number"
                  inputMode="numeric"
                  min={0}
                  max={65535}
                  value={Number(v.port)}
                  onChange={(e) => d.set('port', intOf(e.target.value))}
                />
              </Field>
            ) : null}
            {/* Fallbacks when the firmware reports only one byte of the port. */}
            {has('hp0') ? (
              <Field label="HTTP port low byte" htmlFor="set-hp0" hint="Restart required.">
                <Input
                  id="set-hp0"
                  type="number"
                  min={0}
                  max={255}
                  value={Number(v.hp0)}
                  onChange={(e) => d.set('hp0', intOf(e.target.value))}
                />
              </Field>
            ) : null}
            {has('hp1') ? (
              <Field label="HTTP port high byte" htmlFor="set-hp1" hint="Restart required.">
                <Input
                  id="set-hp1"
                  type="number"
                  min={0}
                  max={255}
                  value={Number(v.hp1)}
                  onChange={(e) => d.set('hp1', intOf(e.target.value))}
                />
              </Field>
            ) : null}
            {has('devid') ? (
              <Field label="Device ID" htmlFor="set-devid" hint="Restart required.">
                <Input
                  id="set-devid"
                  type="number"
                  inputMode="numeric"
                  min={0}
                  value={Number(v.devid)}
                  onChange={(e) => d.set('devid', intOf(e.target.value))}
                />
              </Field>
            ) : null}
          </FieldGrid>
        </>
      ) : null}

      {has('ar') || has('sar') ? (
        <>
          <SubHeading>Other</SubHeading>
          {has('ar') ? (
            <Switch
              checked={v.ar === true}
              onChange={(c) => d.set('ar', c)}
              label="Auto reconnect"
              description="Reconnect to the network automatically after a drop."
            />
          ) : null}
          {has('sar') ? (
            <Switch
              checked={v.sar === true}
              onChange={(c) => d.set('sar', c)}
              label="Special station auto-refresh"
              description="Periodically re-send state to remote / special stations."
            />
          ) : null}
        </>
      ) : null}
    </SettingsForm>
  )
}

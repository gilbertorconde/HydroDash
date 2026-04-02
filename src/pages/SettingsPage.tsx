import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  useJsonAll,
  useController,
  useChangeOptions,
  useChangeStations,
  useDeleteAllPrograms,
} from '../api/hooks'
import { osCommand } from '../api/client'
import type { JsonAll } from '../api/types'
import {
  ADJUSTMENT_METHODS,
  NOTIFICATION_EVENT_LABELS,
  TIMEZONE_LABELS,
  packNotificationEvents,
  timezoneLabelFromTz,
  tzValueFromTimezoneLabel,
  unpackNotificationEvents,
} from '../lib/opensprinklerOptions'
import { saveAppPreference, useAppPreferences, type AppPreferences } from '../lib/appPreferences'
import { formatEpochSecondsLocale } from '../lib/formatLocale'
import { octetsToIp, parseIpToOctets } from '../lib/ipOctets'
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
} from '../lib/integrationSettings'
import { buildResetStationAttributesParams } from '../lib/resetStationAttributes'
import { Card, Button, Input, Label, ErrorBox, Spinner } from '../components/ui'
import styles from './SettingsPage.module.css'

function stringifySettingJson(val: unknown): string {
  if (val == null) return '{}'
  if (typeof val === 'object' && !Array.isArray(val))
    return JSON.stringify(val, null, 2)
  if (typeof val === 'string') {
    try {
      const p = JSON.parse(val) as unknown
      if (p && typeof p === 'object' && !Array.isArray(p))
        return JSON.stringify(p, null, 2)
    } catch {
      return val
    }
    return val
  }
  return String(val)
}

function coJsonBlob(parsed: Record<string, unknown>): string {
  return JSON.stringify(parsed).slice(1, -1)
}

function encodeFlowPulseRate(displayRate: number): { fpr0: number; fpr1: number } {
  const t = Math.round(displayRate * 100)
  const v = Math.max(0, Math.min(0xffff, t))
  return { fpr0: v & 0xff, fpr1: (v >> 8) & 0xff }
}

const LITERS_PER_GALLON = 3.78541

function httpPortFromBytes(hp0: number, hp1: number): number {
  return ((hp1 & 0xff) << 8) | (hp0 & 0xff)
}

function splitHttpPort(port: number): { hp0: number; hp1: number } {
  const p = Math.max(0, Math.min(65535, Math.round(port)))
  return { hp0: p & 0xff, hp1: (p >> 8) & 0xff }
}

function buildResetAllOptionsPayload(
  opts: Record<string, unknown>,
  hwv: number,
): Record<string, string | number | boolean> {
  const payload: Record<string, string | number | boolean> = {}
  const withIfPresent = (key: string, value: string | number | boolean) => {
    if (Object.prototype.hasOwnProperty.call(opts, key)) payload[key] = value
  }

  withIfPresent('ntp', 1)
  withIfPresent('dhcp', 1)
  withIfPresent('hp0', 80)
  withIfPresent('hp1', 0)
  withIfPresent('ext', 0)
  withIfPresent('sdt', 0)
  withIfPresent('mas', 0)
  withIfPresent('mton', 0)
  withIfPresent('mtof', 0)
  withIfPresent('rso', 1)
  withIfPresent('wl', 100)
  withIfPresent('devid', 0)
  withIfPresent('con', 110)
  withIfPresent('lit', 100)
  withIfPresent('dim', 15)
  withIfPresent('bst', 320)
  withIfPresent('uwt', 0)
  withIfPresent('lg', 1)
  withIfPresent('mas2', 0)
  withIfPresent('mton2', 0)
  withIfPresent('mtof2', 0)
  withIfPresent('fpr0', 100)
  withIfPresent('fpr1', 0)
  withIfPresent('dns1', 8)
  withIfPresent('dns2', 8)
  withIfPresent('dns3', 8)
  withIfPresent('dns4', 8)
  withIfPresent('sar', 0)
  withIfPresent('ife', 0)
  withIfPresent('sn1t', 0)
  withIfPresent('sn1o', 1)
  withIfPresent('sn2t', 0)
  withIfPresent('sn2o', 1)
  withIfPresent('sn1on', 0)
  withIfPresent('sn1of', 0)
  withIfPresent('sn2on', 0)
  withIfPresent('sn2of', 0)
  withIfPresent('ntp1', hwv >= 2199 ? 0 : 216)
  withIfPresent('ntp2', hwv >= 2199 ? 0 : 239)
  withIfPresent('ntp3', hwv >= 2199 ? 0 : 35)
  withIfPresent('ntp4', hwv >= 2199 ? 0 : 12)
  withIfPresent('loc', 'Boston,MA')
  withIfPresent('wto', '"key":""')

  return payload
}


export function SettingsPage() {
  const ja = useJsonAll()
  const jc = useController(15_000)
  const co = useChangeOptions()
  const cs = useChangeStations()
  const delAllProgs = useDeleteAllPrograms()

  const [wl, setWl] = useState('')
  const [loc, setLoc] = useState('')
  const [mqtt, setMqtt] = useState('')
  const [email, setEmail] = useState('')
  const [otc, setOtc] = useState('')
  const [msg, setMsg] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)

  const [timezoneLabel, setTimezoneLabel] = useState('+00:00')
  const [lg, setLg] = useState(false)
  const prefs = useAppPreferences()

  const [mas, setMas] = useState(0)
  const [mton, setMton] = useState(0)
  const [mtof, setMtof] = useState(0)
  const [mas2, setMas2] = useState(0)
  const [mton2, setMton2] = useState(0)
  const [mtof2, setMtof2] = useState(0)

  const [ext, setExt] = useState(0)
  const [sdt, setSdt] = useState(0)
  const [seq, setSeq] = useState(false)

  const [uwt, setUwt] = useState(0)

  const [dname, setDname] = useState('')
  const [ifkey, setIfkey] = useState('')
  const [notifBits, setNotifBits] = useState<boolean[]>(() =>
    unpackNotificationEvents(0, NOTIFICATION_EVENT_LABELS.length),
  )

  const [con, setCon] = useState(0)
  const [lit, setLit] = useState(0)
  const [dim, setDim] = useState(0)

  const [ntp, setNtp] = useState(false)
  const [dhcp, setDhcp] = useState(false)
  const [ar, setAr] = useState(false)
  const [ipas, setIpas] = useState(false)
  const [sar, setSar] = useState(false)

  const [ipStr, setIpStr] = useState('0.0.0.0')
  const [gwStr, setGwStr] = useState('0.0.0.0')
  const [subnStr, setSubnStr] = useState('255.255.255.0')
  const [dnsStr, setDnsStr] = useState('8.8.8.8')
  const [ntpStr, setNtpStr] = useState('0.0.0.0')
  const [hp0, setHp0] = useState(80)
  const [hp1, setHp1] = useState(0)
  const [devid, setDevid] = useState(0)
  const [bst, setBst] = useState(0)
  const [imin, setImin] = useState(0)
  const [imax, setImax] = useState(0)
  const [tpdv, setTpdv] = useState(0)
  const [laton, setLaton] = useState(0)
  const [latof, setLatof] = useState(0)

  const [urs, setUrs] = useState(0)
  const [sn1t, setSn1t] = useState(0)
  const [sn2t, setSn2t] = useState(0)
  const [rso, setRso] = useState(false)
  const [sn1o, setSn1o] = useState(false)
  const [sn2o, setSn2o] = useState(false)
  const [flowPulseRate, setFlowPulseRate] = useState(1)
  const [sn1on, setSn1on] = useState(0)
  const [sn1of, setSn1of] = useState(0)
  const [sn2on, setSn2on] = useState(0)
  const [sn2of, setSn2of] = useState(0)
  const [useRainLegacy, setUseRainLegacy] = useState(false)

  const [mqttForm, setMqttForm] = useState<MqttForm>(() => mqttFromJson(null))
  const [emailForm, setEmailForm] = useState<EmailForm>(() => emailFromJson(null))
  const [otcForm, setOtcForm] = useState<OtcForm>(() => otcFromJson(null))

  const [maintBusy, setMaintBusy] = useState(false)

  const hydratedOnce = useRef(false)

  const opts = ja.data?.options ?? {}
  const st = useMemo(() => ja.data?.settings ?? {}, [ja.data?.settings])
  const snames = (ja.data?.stations?.snames ?? []) as string[]
  const hasIfe2 = opts.ife2 !== undefined && opts.ife2 !== null
  const mexp = typeof opts.mexp === 'number' ? opts.mexp : 5
  const fwv = typeof opts.fwv === 'number' ? opts.fwv : 0

  const devt = useMemo(() => {
    const s = st as { devt?: number }
    if (typeof s.devt === 'number') return s.devt
    return jc.data?.devt
  }, [st, jc.data?.devt])

  const timezoneOptions = useMemo(() => {
    const cur = timezoneLabelFromTz(opts.tz)
    const set = new Set<string>([...TIMEZONE_LABELS])
    if (cur && !set.has(cur)) set.add(cur)
    if (timezoneLabel && !set.has(timezoneLabel)) set.add(timezoneLabel)
    return [...set]
  }, [opts.tz, timezoneLabel])

  const hydrateFrom = useCallback(
    (data: JsonAll) => {
      const o = data.options ?? {}
      const s = data.settings ?? {}
      setWl(String(o.wl ?? ''))
      setLoc(String(s.loc ?? '').replace(/^''$/, ''))
      setMqtt(stringifySettingJson(s.mqtt))
      setEmail(stringifySettingJson(s.email))
      setOtc(stringifySettingJson(s.otc))

      const tzStr = timezoneLabelFromTz(o.tz)
      if (tzStr) setTimezoneLabel(tzStr)

      setLg(o.lg === 1)

      setMas(Number(o.mas ?? 0))
      setMton(Number(o.mton ?? 0))
      setMtof(Number(o.mtof ?? 0))
      setMas2(Number(o.mas2 ?? 0))
      setMton2(Number(o.mton2 ?? 0))
      setMtof2(Number(o.mtof2 ?? 0))

      setExt(Number(o.ext ?? 0))
      setSdt(Number(o.sdt ?? 0))
      setSeq(o.seq === 1)

      setUwt(Number(o.uwt ?? 0))

      setDname(String(s.dname ?? ''))
      setIfkey(String(s.ifkey ?? ''))

      const ife = Number(o.ife ?? 0) & 0xff
      const ife2 = Number(o.ife2 ?? 0) & 0xff
      const packed = ife | (ife2 << 8)
      setNotifBits(unpackNotificationEvents(packed, NOTIFICATION_EVENT_LABELS.length))

      setCon(Number(o.con ?? 0))
      setLit(Number(o.lit ?? 0))
      setDim(Number(o.dim ?? 0))

      setNtp(o.ntp === 1)
      setDhcp(o.dhcp === 1)
      setAr(o.ar === 1)
      setIpas(o.ipas === 1)
      setSar(o.sar === 1)

      if (o.ip1 !== undefined) {
        setIpStr(octetsToIp(Number(o.ip1), Number(o.ip2), Number(o.ip3), Number(o.ip4)))
      }
      if (o.gw1 !== undefined) {
        setGwStr(octetsToIp(Number(o.gw1), Number(o.gw2), Number(o.gw3), Number(o.gw4)))
      }
      if (o.subn1 !== undefined) {
        setSubnStr(octetsToIp(Number(o.subn1), Number(o.subn2), Number(o.subn3), Number(o.subn4)))
      }
      if (o.dns1 !== undefined) {
        setDnsStr(octetsToIp(Number(o.dns1), Number(o.dns2), Number(o.dns3), Number(o.dns4)))
      }
      if (o.ntp1 !== undefined) {
        setNtpStr(octetsToIp(Number(o.ntp1), Number(o.ntp2), Number(o.ntp3), Number(o.ntp4)))
      }
      if (o.hp0 !== undefined) setHp0(Number(o.hp0))
      if (o.hp1 !== undefined) setHp1(Number(o.hp1))
      if (o.devid !== undefined) setDevid(Number(o.devid))
      if (o.bst !== undefined) setBst(Number(o.bst))
      if (o.imin !== undefined) setImin(Number(o.imin))
      if (o.imax !== undefined) setImax(Number(o.imax))
      if (o.tpdv !== undefined) setTpdv(Number(o.tpdv))
      if (o.laton !== undefined) setLaton(Number(o.laton))
      if (o.latof !== undefined) setLatof(Number(o.latof))

      if (o.urs !== undefined) {
        const u = Number(o.urs)
        setUrs(u)
        if (o.fpr0 === undefined) setUseRainLegacy(u === 1)
      }
      if (o.sn1t !== undefined) setSn1t(Number(o.sn1t))
      if (o.sn2t !== undefined) setSn2t(Number(o.sn2t))
      if (o.rso !== undefined) setRso(o.rso === 1)
      if (o.sn1o !== undefined) setSn1o(o.sn1o === 1)
      if (o.sn2o !== undefined) setSn2o(o.sn2o === 1)
      if (o.fpr0 !== undefined && o.fpr1 !== undefined) {
        const raw = Number(o.fpr1) * 256 + Number(o.fpr0)
        setFlowPulseRate(raw / 100)
      }
      if (o.sn1on !== undefined) setSn1on(Number(o.sn1on))
      if (o.sn1of !== undefined) setSn1of(Number(o.sn1of))
      if (o.sn2on !== undefined) setSn2on(Number(o.sn2on))
      if (o.sn2of !== undefined) setSn2of(Number(o.sn2of))

      setMqttForm(mqttFromJson(s.mqtt))
      setEmailForm(emailFromJson(s.email))
      setOtcForm(otcFromJson(s.otc))
    },
    [],
  )

  useEffect(() => {
    if (!ja.isSuccess || !ja.data || hydratedOnce.current) return
    const data = ja.data
    queueMicrotask(() => {
      hydrateFrom(data)
      hydratedOnce.current = true
    })
  }, [ja.isSuccess, ja.data, hydrateFrom])

  async function reloadFromDevice() {
    setErr(null)
    setMsg(null)
    const r = await ja.refetch()
    if (r.data) hydrateFrom(r.data)
    await jc.refetch()
    setMsg('Reloaded from controller.')
  }

  async function applyOptions(p: Record<string, string | number | boolean>) {
    setErr(null)
    setMsg(null)
    try {
      await co.mutateAsync(p)
      setMsg('Saved.')
      const r = await ja.refetch()
      if (r.data) hydrateFrom(r.data)
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed')
    }
  }

  function setPref<K extends keyof AppPreferences>(key: K, value: boolean) {
    saveAppPreference(key, value)
    setMsg('App preference saved locally.')
  }

  function locForDevice(): string {
    return loc.replace(/\s/g, '_')
  }

  const adjustmentChoices = useMemo(
    () => ADJUSTMENT_METHODS.filter((m) => !m.minFw || fwv >= m.minFw),
    [fwv],
  )

  const showDname = 'dname' in st
  const showIfkey = 'ifkey' in st || opts.ife !== undefined
  const showOtc = 'otc' in st

  const supportsSoilSensor = fwv >= 219
  const supportsProgSwitch = fwv >= 217
  const hasFlowPulse = opts.fpr0 !== undefined && opts.fpr1 !== undefined
  const legacyRainOnly = opts.urs !== undefined && !hasFlowPulse
  const hasSensorUi =
    opts.urs !== undefined ||
    opts.sn1t !== undefined ||
    opts.sn2t !== undefined ||
    opts.rso !== undefined

  const hasUrsMulti = opts.urs !== undefined && hasFlowPulse
  const hasSn1Multi = opts.sn1t !== undefined && hasFlowPulse && !hasUrsMulti
  const showRsoRow =
    opts.rso !== undefined &&
    (legacyRainOnly
      ? useRainLegacy
      : hasUrsMulti
        ? urs === 1 || urs === 240
        : hasSn1Multi
          ? sn1t === 1 || sn1t === 240
          : false)
  const activeSn1Type = hasUrsMulti ? urs : hasSn1Multi ? sn1t : 0
  const showSn1Delay =
    opts.sn1on !== undefined &&
    (activeSn1Type === 1 || activeSn1Type === 3)
  const showSn1oRow =
    opts.sn1o !== undefined && (activeSn1Type === 1 || activeSn1Type === 3 || activeSn1Type === 240)
  const showSn2oRow =
    opts.sn2o !== undefined && (sn2t === 1 || sn2t === 3 || sn2t === 240)
  const showSn2Delay = opts.sn2on !== undefined && (sn2t === 1 || sn2t === 3)
  const showFlowRow =
    hasFlowPulse &&
    (hasUrsMulti ? urs === 2 : hasSn1Multi ? sn1t === 2 : false)
  const primaryProgSwitch =
    hasUrsMulti ? urs === 240 : hasSn1Multi ? sn1t === 240 : false
  const showProgSwitchNote = supportsProgSwitch && (primaryProgSwitch || sn2t === 240)

  function deviceTimeLabel() {
    if (devt == null || devt <= 0) return '—'
    return formatEpochSecondsLocale(devt, { hour12: !prefs.is24Hour })
  }

  async function saveSensorOptions() {
    const p: Record<string, string | number | boolean> = {}
    if (legacyRainOnly) {
      p.urs = useRainLegacy ? 1 : 0
    } else {
      if (opts.urs !== undefined) p.urs = urs
      if (opts.sn1t !== undefined) p.sn1t = sn1t
      if (opts.sn2t !== undefined) p.sn2t = sn2t
    }
    if (opts.rso !== undefined) p.rso = rso ? 1 : 0
    if (opts.sn1o !== undefined) p.sn1o = sn1o ? 1 : 0
    if (opts.sn2o !== undefined) p.sn2o = sn2o ? 1 : 0
    const flowActive =
      hasFlowPulse &&
      (legacyRainOnly ? false : urs === 2 || (opts.sn1t !== undefined && sn1t === 2))
    if (flowActive) {
      const fp = encodeFlowPulseRate(flowPulseRate)
      p.fpr0 = fp.fpr0
      p.fpr1 = fp.fpr1
    }
    if (opts.sn1on !== undefined) p.sn1on = sn1on
    if (opts.sn1of !== undefined) p.sn1of = sn1of
    if (opts.sn2on !== undefined) p.sn2on = sn2on
    if (opts.sn2of !== undefined) p.sn2of = sn2of
    await applyOptions(p)
  }

  async function saveNetworkStatic() {
    const p: Record<string, string | number | boolean> = {}
    const ip = parseIpToOctets(ipStr)
    const gw = parseIpToOctets(gwStr)
    const sub = parseIpToOctets(subnStr)
    const dns = parseIpToOctets(dnsStr)
    const ntpIp = parseIpToOctets(ntpStr)
    if (!ip || !gw || !sub || !dns) {
      setErr('Enter valid dotted IP, gateway, subnet, and DNS.')
      return
    }
    if (opts.ip1 !== undefined) {
      p.ip1 = ip[0]
      p.ip2 = ip[1]
      p.ip3 = ip[2]
      p.ip4 = ip[3]
    }
    if (opts.gw1 !== undefined) {
      p.gw1 = gw[0]
      p.gw2 = gw[1]
      p.gw3 = gw[2]
      p.gw4 = gw[3]
    }
    if (opts.subn1 !== undefined) {
      p.subn1 = sub[0]
      p.subn2 = sub[1]
      p.subn3 = sub[2]
      p.subn4 = sub[3]
    }
    if (opts.dns1 !== undefined) {
      p.dns1 = dns[0]
      p.dns2 = dns[1]
      p.dns3 = dns[2]
      p.dns4 = dns[3]
    }
    if (ntpIp && opts.ntp1 !== undefined) {
      p.ntp1 = ntpIp[0]
      p.ntp2 = ntpIp[1]
      p.ntp3 = ntpIp[2]
      p.ntp4 = ntpIp[3]
    }
    await applyOptions(p)
  }

  async function saveAdvancedHardware() {
    const p: Record<string, string | number | boolean> = {}
    if (opts.hp0 !== undefined) p.hp0 = hp0
    if (opts.hp1 !== undefined) p.hp1 = hp1
    if (opts.devid !== undefined) p.devid = devid
    if (opts.bst !== undefined) p.bst = bst
    if (opts.imin !== undefined) p.imin = imin
    if (opts.imax !== undefined) p.imax = imax
    if (opts.tpdv !== undefined) p.tpdv = tpdv
    if (opts.laton !== undefined) p.laton = laton
    if (opts.latof !== undefined) p.latof = latof
    await applyOptions(p)
  }

  return (
    <div>
      <h1 className={styles.title}>Settings</h1>
      <p className={styles.lead}>
        This page mirrors the OpenSprinkler settings groups and fields exposed by your controller firmware. Local app
        preferences are stored in this browser only.
      </p>
      {err ? <ErrorBox message={err} /> : null}
      {msg ? <p className={styles.ok}>{msg}</p> : null}
      {ja.isLoading && !ja.data ? <Spinner /> : null}

      <div className={styles.toolbar}>
        <Button variant="ghost" type="button" disabled={ja.isFetching} onClick={() => void reloadFromDevice()}>
          Reload from controller
        </Button>
      </div>

      <details className={styles.collapse} open>
        <summary className={styles.collapseSummary}>System</summary>
        <Card variant="plain">
          {opts.ntp !== undefined ? (
            <p className={styles.fieldHint}>
              Device time: <strong>{deviceTimeLabel()}</strong>
              {ntp ? ' (NTP sync on — set time on the controller or turn NTP off to adjust manually.)' : null}
            </p>
          ) : null}
          {opts.tz !== undefined ? (
            <div className={styles.field}>
              <Label htmlFor="tz">Timezone</Label>
              <select
                id="tz"
                className={styles.select}
                value={timezoneLabel}
                onChange={(e) => setTimezoneLabel(e.target.value)}
              >
                {timezoneOptions.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
              <Button
                variant="secondary"
                className={styles.saveBtn}
                disabled={co.isPending}
                onClick={() => void applyOptions({ tz: tzValueFromTimezoneLabel(timezoneLabel) })}
              >
                Save timezone
              </Button>
            </div>
          ) : null}
          <div className={styles.field}>
            <Label htmlFor="set-loc">Location</Label>
            <Input
              id="set-loc"
              value={loc}
              onChange={(e) => setLoc(e.target.value)}
              placeholder="City, ZIP, or lat,lon"
            />
            <p className={styles.fieldHint}>Spaces are sent as underscores to the controller.</p>
            <Button variant="secondary" disabled={co.isPending} onClick={() => void applyOptions({ loc: locForDevice() })}>
              Save location
            </Button>
          </div>
          {opts.lg !== undefined ? (
            <label className={styles.checkRow}>
              <input type="checkbox" checked={lg} onChange={(e) => setLg(e.target.checked)} />
              Enable logging
            </label>
          ) : null}
          {opts.lg !== undefined ? (
            <Button variant="secondary" disabled={co.isPending} onClick={() => void applyOptions({ lg: lg ? 1 : 0 })}>
              Save logging option
            </Button>
          ) : null}
        </Card>
      </details>

      <details className={styles.collapse}>
        <summary className={styles.collapseSummary}>App Settings</summary>
        <Card variant="plain">
          <p className={styles.fieldHint}>Stored locally; does not change the controller.</p>
          <label className={styles.checkRow}>
            <input
              type="checkbox"
              checked={prefs.isMetric}
              onChange={(e) => setPref('isMetric', e.target.checked)}
            />
            Use metric units
          </label>
          <label className={styles.checkRow}>
            <input
              type="checkbox"
              checked={prefs.is24Hour}
              onChange={(e) => setPref('is24Hour', e.target.checked)}
            />
            Use 24-hour time
          </label>
          <label className={styles.checkRow}>
            <input
              type="checkbox"
              checked={prefs.groupView}
              onChange={(e) => setPref('groupView', e.target.checked)}
            />
            Order stations by groups
          </label>
          <label className={styles.checkRow}>
            <input
              type="checkbox"
              checked={prefs.sortByStationName}
              onChange={(e) => setPref('sortByStationName', e.target.checked)}
            />
            Order stations by name
          </label>
          <label className={styles.checkRow}>
            <input
              type="checkbox"
              checked={prefs.showDisabled}
              onChange={(e) => setPref('showDisabled', e.target.checked)}
            />
            Show disabled stations
          </label>
          <label className={styles.checkRow}>
            <input
              type="checkbox"
              checked={prefs.showStationNum}
              onChange={(e) => setPref('showStationNum', e.target.checked)}
            />
            Show station number
          </label>
        </Card>
      </details>

      {opts.mas !== undefined ? (
        <details className={styles.collapse}>
          <summary className={styles.collapseSummary}>Configure Master</summary>
          <Card variant="plain">
            <div className={styles.field}>
              <Label htmlFor="mas">Master station 1</Label>
              <select id="mas" className={styles.select} value={mas} onChange={(e) => setMas(Number(e.target.value))}>
                <option value={0}>None</option>
                {snames.map((name, i) => (
                  <option key={i} value={i + 1}>
                    {prefs.showStationNum
                      ? `${i + 1}. ${name || `Station ${i + 1}`}`
                      : name || `Station ${i + 1}`}
                  </option>
                ))}
              </select>
            </div>
            {opts.mton !== undefined ? (
              <div className={styles.field}>
                <Label htmlFor="mton">Master on adjustment (seconds)</Label>
                <Input
                  id="mton"
                  type="number"
                  min={0}
                  value={mton}
                  onChange={(e) => setMton(parseInt(e.target.value, 10) || 0)}
                  disabled={mas === 0}
                />
              </div>
            ) : null}
            {opts.mtof !== undefined ? (
              <div className={styles.field}>
                <Label htmlFor="mtof">Master off adjustment (seconds)</Label>
                <Input
                  id="mtof"
                  type="number"
                  min={0}
                  value={mtof}
                  onChange={(e) => setMtof(parseInt(e.target.value, 10) || 0)}
                  disabled={mas === 0}
                />
              </div>
            ) : null}

            {opts.mas2 !== undefined ? (
              <>
                <hr className={styles.divider} />
                <div className={styles.field}>
                  <Label htmlFor="mas2">Master station 2</Label>
                  <select
                    id="mas2"
                    className={styles.select}
                    value={mas2}
                    onChange={(e) => setMas2(Number(e.target.value))}
                  >
                    <option value={0}>None</option>
                    {snames.map((name, i) => (
                      <option key={i} value={i + 1}>
                        {prefs.showStationNum
                          ? `${i + 1}. ${name || `Station ${i + 1}`}`
                          : name || `Station ${i + 1}`}
                      </option>
                    ))}
                  </select>
                </div>
                {opts.mton2 !== undefined ? (
                  <div className={styles.field}>
                    <Label htmlFor="mton2">Master 2 on adjustment (seconds)</Label>
                    <Input
                      id="mton2"
                      type="number"
                      min={0}
                      value={mton2}
                      onChange={(e) => setMton2(parseInt(e.target.value, 10) || 0)}
                      disabled={mas2 === 0}
                    />
                  </div>
                ) : null}
                {opts.mtof2 !== undefined ? (
                  <div className={styles.field}>
                    <Label htmlFor="mtof2">Master 2 off adjustment (seconds)</Label>
                    <Input
                      id="mtof2"
                      type="number"
                      min={0}
                      value={mtof2}
                      onChange={(e) => setMtof2(parseInt(e.target.value, 10) || 0)}
                      disabled={mas2 === 0}
                    />
                  </div>
                ) : null}
              </>
            ) : null}

            <Button
              variant="secondary"
              disabled={co.isPending}
              onClick={() =>
                void applyOptions({
                  mas,
                  ...(opts.mton !== undefined ? { mton } : {}),
                  ...(opts.mtof !== undefined ? { mtof } : {}),
                  ...(opts.mas2 !== undefined ? { mas2 } : {}),
                  ...(opts.mton2 !== undefined ? { mton2 } : {}),
                  ...(opts.mtof2 !== undefined ? { mtof2 } : {}),
                })
              }
            >
              Save master settings
            </Button>
          </Card>
        </details>
      ) : null}

      {opts.ext !== undefined ? (
        <details className={styles.collapse}>
          <summary className={styles.collapseSummary}>Station handling</summary>
          <Card variant="plain">
            <div className={styles.field}>
              <Label htmlFor="ext">Number of stations</Label>
              <select id="ext" className={styles.select} value={ext} onChange={(e) => setExt(Number(e.target.value))}>
                {Array.from({ length: mexp + 1 }, (_, i) => (
                  <option key={i} value={i}>
                    {i * 8 + 8} stations
                  </option>
                ))}
              </select>
              {typeof opts.dexp === 'number' && opts.dexp < 255 && opts.dexp >= 0 ? (
                <p className={styles.fieldHint}>{opts.dexp * 8 + 8} available on this hardware.</p>
              ) : null}
            </div>
            {opts.sdt !== undefined ? (
              <div className={styles.field}>
                <Label htmlFor="sdt">Station delay (seconds)</Label>
                <Input
                  id="sdt"
                  type="number"
                  min={0}
                  value={sdt}
                  onChange={(e) => setSdt(parseInt(e.target.value, 10) || 0)}
                />
              </div>
            ) : null}
            {opts.seq !== undefined ? (
              <label className={styles.checkRow}>
                <input type="checkbox" checked={seq} onChange={(e) => setSeq(e.target.checked)} />
                Sequential (vs parallel)
              </label>
            ) : null}
            <Button
              variant="secondary"
              disabled={co.isPending}
              onClick={() =>
                void applyOptions({
                  ext,
                  ...(opts.sdt !== undefined ? { sdt } : {}),
                  ...(opts.seq !== undefined ? { seq: seq ? 1 : 0 } : {}),
                })
              }
            >
              Save station handling
            </Button>
          </Card>
        </details>
      ) : null}

      <details className={styles.collapse}>
        <summary className={styles.collapseSummary}>Weather and Sensors</summary>
        <Card variant="plain">
          <div className={styles.field}>
            <Label htmlFor="set-wl">Watering percentage</Label>
            <Input
              id="set-wl"
              type="number"
              min={0}
              max={250}
              value={wl}
              onChange={(e) => setWl(e.target.value)}
              disabled={opts.uwt !== undefined && uwt > 0}
            />
            <p className={styles.fieldHint}>
              0–250%. Disabled while a weather adjustment method other than Manual is selected.
            </p>
          </div>
          <Button
            variant="secondary"
            disabled={co.isPending || (opts.uwt !== undefined && uwt > 0)}
            onClick={() => void applyOptions({ wl: parseInt(wl, 10) || 0 })}
          >
            Save watering percentage
          </Button>
        </Card>

        {opts.uwt !== undefined ? (
          <Card variant="plain" title="Weather adjustment">
            <div className={styles.field}>
              <Label htmlFor="uwt">Adjustment method</Label>
              <select id="uwt" className={styles.select} value={uwt} onChange={(e) => setUwt(Number(e.target.value))}>
                {adjustmentChoices.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                  </option>
                ))}
              </select>
            </div>
            <Button variant="secondary" disabled={co.isPending} onClick={() => void applyOptions({ uwt })}>
              Save adjustment method
            </Button>
          </Card>
        ) : null}

        {hasSensorUi ? (
          <Card variant="plain" title="Rain, flow & sensors">
            {legacyRainOnly ? (
              <label className={styles.checkRow}>
                <input
                  type="checkbox"
                  checked={useRainLegacy}
                  onChange={(e) => setUseRainLegacy(e.target.checked)}
                />
                Use rain sensor
              </label>
            ) : null}
            {hasUrsMulti ? (
              <div className={styles.field}>
                <Label htmlFor="urs-type">Sensor (legacy port)</Label>
                <select
                  id="urs-type"
                  className={styles.select}
                  value={urs}
                  onChange={(e) => setUrs(Number(e.target.value))}
                >
                  <option value={0}>None</option>
                  <option value={1}>Rain</option>
                  <option value={2}>Flow</option>
                  {supportsSoilSensor ? <option value={3}>Soil</option> : null}
                  {supportsProgSwitch ? <option value={240}>Program switch (prog 1)</option> : null}
                </select>
              </div>
            ) : null}
            {hasSn1Multi ? (
              <div className={styles.field}>
                <Label htmlFor="sn1-type">Sensor 1 type</Label>
                <select
                  id="sn1-type"
                  className={styles.select}
                  value={sn1t}
                  onChange={(e) => setSn1t(Number(e.target.value))}
                >
                  <option value={0}>None</option>
                  <option value={1}>Rain</option>
                  <option value={2}>Flow</option>
                  {supportsSoilSensor ? <option value={3}>Soil</option> : null}
                  {supportsProgSwitch ? <option value={240}>Program switch (prog 1)</option> : null}
                </select>
              </div>
            ) : null}
            {opts.sn2t !== undefined ? (
              <div className={styles.field}>
                <Label htmlFor="sn2-type">Sensor 2 type</Label>
                <select
                  id="sn2-type"
                  className={styles.select}
                  value={sn2t}
                  onChange={(e) => setSn2t(Number(e.target.value))}
                >
                  <option value={0}>None</option>
                  <option value={1}>Rain</option>
                  {supportsSoilSensor ? <option value={3}>Soil</option> : null}
                  {supportsProgSwitch ? <option value={240}>Program switch (prog 2)</option> : null}
                </select>
              </div>
            ) : null}
            {showRsoRow ? (
              <label className={styles.checkRow}>
                <input type="checkbox" checked={rso} onChange={(e) => setRso(e.target.checked)} />
                Rain sensor: normally open
              </label>
            ) : null}
            {showSn1oRow ? (
              <label className={styles.checkRow}>
                <input type="checkbox" checked={sn1o} onChange={(e) => setSn1o(e.target.checked)} />
                Sensor 1: normally open
              </label>
            ) : null}
            {showSn2oRow ? (
              <label className={styles.checkRow}>
                <input type="checkbox" checked={sn2o} onChange={(e) => setSn2o(e.target.checked)} />
                Sensor 2: normally open
              </label>
            ) : null}
            {showFlowRow ? (
              <div className={styles.field}>
                <Label htmlFor="flow-pulse">
                  Flow pulse rate ({prefs.isMetric ? 'L per pulse' : 'Gal per pulse'})
                </Label>
                <Input
                  id="flow-pulse"
                  type="number"
                  min={0}
                  step={0.01}
                  value={prefs.isMetric ? flowPulseRate : flowPulseRate / LITERS_PER_GALLON}
                  onChange={(e) => {
                    const v = parseFloat(e.target.value) || 0
                    setFlowPulseRate(prefs.isMetric ? v : v * LITERS_PER_GALLON)
                  }}
                />
                <p className={styles.fieldHint}>
                  Firmware stores pulses x100 in liters per pulse; this input follows your App Settings unit preference.
                </p>
              </div>
            ) : null}
            {showSn1Delay ? (
              <>
                <div className={styles.field}>
                  <Label htmlFor="sn1on">Sensor 1 delayed on (minutes)</Label>
                  <Input
                    id="sn1on"
                    type="number"
                    min={0}
                    value={sn1on}
                    onChange={(e) => setSn1on(parseInt(e.target.value, 10) || 0)}
                  />
                </div>
                <div className={styles.field}>
                  <Label htmlFor="sn1of">Sensor 1 delayed off (minutes)</Label>
                  <Input
                    id="sn1of"
                    type="number"
                    min={0}
                    value={sn1of}
                    onChange={(e) => setSn1of(parseInt(e.target.value, 10) || 0)}
                  />
                </div>
              </>
            ) : null}
            {showSn2Delay ? (
              <>
                <div className={styles.field}>
                  <Label htmlFor="sn2on">Sensor 2 delayed on (minutes)</Label>
                  <Input
                    id="sn2on"
                    type="number"
                    min={0}
                    value={sn2on}
                    onChange={(e) => setSn2on(parseInt(e.target.value, 10) || 0)}
                  />
                </div>
                <div className={styles.field}>
                  <Label htmlFor="sn2of">Sensor 2 delayed off (minutes)</Label>
                  <Input
                    id="sn2of"
                    type="number"
                    min={0}
                    value={sn2of}
                    onChange={(e) => setSn2of(parseInt(e.target.value, 10) || 0)}
                  />
                </div>
              </>
            ) : null}
            {showProgSwitchNote ? (
              <p className={styles.fieldHint}>
                Program switch: hold the switch ~1s to trigger the linked program (see OpenSprinkler docs for wiring).
              </p>
            ) : null}
            <Button variant="secondary" disabled={co.isPending} onClick={() => void saveSensorOptions()}>
              Save sensors
            </Button>
          </Card>
        ) : null}

      </details>

      <details className={styles.collapse}>
        <summary className={styles.collapseSummary}>Integrations</summary>
        <Card variant="plain">
          {showDname ? (
            <div className={styles.field}>
              <Label htmlFor="dname">Device name</Label>
              <Input id="dname" value={dname} onChange={(e) => setDname(e.target.value)} placeholder="Shown in email / IFTTT" />
            </div>
          ) : null}
          {showIfkey ? (
            <div className={styles.field}>
              <Label htmlFor="ifkey">IFTTT webhooks key</Label>
              <Input id="ifkey" value={ifkey} onChange={(e) => setIfkey(e.target.value)} placeholder="From ifttt.com" />
            </div>
          ) : null}
          {opts.ife !== undefined ? (
            <div className={styles.notifGrid}>
              <p className={styles.fieldHint}>Notification events (MQTT, email, IFTTT)</p>
              {NOTIFICATION_EVENT_LABELS.map((label, i) => (
                <label key={label} className={styles.checkRow}>
                  <input
                    type="checkbox"
                    checked={notifBits[i] ?? false}
                    disabled={!hasIfe2 && i >= 8}
                    onChange={(e) => {
                      const next = [...notifBits]
                      next[i] = e.target.checked
                      setNotifBits(next)
                    }}
                  />
                  {label}
                </label>
              ))}
            </div>
          ) : null}
          <Button
            variant="secondary"
            disabled={co.isPending}
            onClick={() => {
              const packed = packNotificationEvents(notifBits)
              const low = packed & 0xff
              const high = hasIfe2 ? (packed >> 8) & 0xff : 0
              void applyOptions({
                ...(showDname ? { dname } : {}),
                ...(showIfkey ? { ifkey } : {}),
                ...(opts.ife !== undefined ? { ife: low, ...(hasIfe2 ? { ife2: high } : {}) } : {}),
              })
            }}
          >
            Save device name, IFTTT & events
          </Button>
        </Card>

        {showOtc ? (
          <Card variant="plain" title="OpenThings Cloud (OTC)">
            <label className={styles.checkRow}>
              <input
                type="checkbox"
                checked={otcForm.en === 1}
                onChange={(e) => setOtcForm((s) => ({ ...s, en: e.target.checked ? 1 : 0 }))}
              />
              Enable OTC
            </label>
            <div className={styles.field}>
              <Label htmlFor="otc-tok">Token (32 chars)</Label>
              <Input
                id="otc-tok"
                value={otcForm.token}
                disabled={!otcForm.en}
                maxLength={64}
                onChange={(e) => setOtcForm((s) => ({ ...s, token: e.target.value }))}
              />
            </div>
            <div className={styles.field}>
              <Label htmlFor="otc-srv">Server host</Label>
              <Input
                id="otc-srv"
                value={otcForm.server}
                disabled={!otcForm.en}
                onChange={(e) => setOtcForm((s) => ({ ...s, server: e.target.value }))}
              />
            </div>
            <Button
              variant="secondary"
              disabled={co.isPending}
              onClick={() => {
                const blob = coJsonBlob(otcToJson(otcForm) as Record<string, unknown>)
                void applyOptions({ otc: blob })
                setOtc(stringifySettingJson(otcToJson(otcForm)))
              }}
            >
              Save OTC
            </Button>
            <details className={styles.rawJson}>
              <summary>Raw JSON</summary>
              <textarea
                className={styles.textarea}
                rows={5}
                value={otc}
                onChange={(e) => setOtc(e.target.value)}
                spellCheck={false}
              />
              <Button
                variant="secondary"
                disabled={co.isPending}
                onClick={() => {
                  try {
                    const parsed = JSON.parse(otc) as Record<string, unknown>
                    setOtcForm(otcFromJson(parsed))
                    void applyOptions({ otc: coJsonBlob(parsed) })
                  } catch {
                    setErr('Invalid JSON for otc')
                  }
                }}
              >
                Parse &amp; save JSON
              </Button>
            </details>
          </Card>
        ) : null}

        <Card variant="plain" title="MQTT">
          <label className={styles.checkRow}>
            <input
              type="checkbox"
              checked={mqttForm.en === 1}
              onChange={(e) => setMqttForm((s) => ({ ...s, en: e.target.checked ? 1 : 0 }))}
            />
            Enable MQTT
          </label>
          <div className={styles.field}>
            <Label htmlFor="mq-host">Broker / server</Label>
            <Input
              id="mq-host"
              value={mqttForm.host}
              disabled={!mqttForm.en}
              onChange={(e) => setMqttForm((s) => ({ ...s, host: e.target.value }))}
            />
          </div>
          <div className={styles.field}>
            <Label htmlFor="mq-port">Port</Label>
            <Input
              id="mq-port"
              type="number"
              min={0}
              max={65535}
              value={mqttForm.port}
              disabled={!mqttForm.en}
              onChange={(e) => setMqttForm((s) => ({ ...s, port: parseInt(e.target.value, 10) || 0 }))}
            />
          </div>
          <div className={styles.field}>
            <Label htmlFor="mq-user">Username (optional)</Label>
            <Input
              id="mq-user"
              value={mqttForm.user}
              disabled={!mqttForm.en}
              onChange={(e) => setMqttForm((s) => ({ ...s, user: e.target.value }))}
            />
          </div>
          <div className={styles.field}>
            <Label htmlFor="mq-pass">Password (optional)</Label>
            <Input
              id="mq-pass"
              type="password"
              value={mqttForm.pass}
              disabled={!mqttForm.en}
              onChange={(e) => setMqttForm((s) => ({ ...s, pass: e.target.value }))}
            />
          </div>
          <div className={styles.field}>
            <Label htmlFor="mq-pub">Publish topic</Label>
            <Input
              id="mq-pub"
              value={mqttForm.pubt}
              disabled={!mqttForm.en}
              onChange={(e) => setMqttForm((s) => ({ ...s, pubt: e.target.value }))}
            />
          </div>
          <div className={styles.field}>
            <Label htmlFor="mq-sub">Subscribe topic (optional)</Label>
            <Input
              id="mq-sub"
              value={mqttForm.subt}
              disabled={!mqttForm.en}
              onChange={(e) => setMqttForm((s) => ({ ...s, subt: e.target.value }))}
            />
          </div>
          <Button
            variant="secondary"
            disabled={co.isPending}
            onClick={() => {
              const blob = coJsonBlob(mqttToJson(mqttForm) as Record<string, unknown>)
              void applyOptions({ mqtt: blob })
              setMqtt(stringifySettingJson(mqttToJson(mqttForm)))
            }}
          >
            Save MQTT
          </Button>
          <details className={styles.rawJson}>
            <summary>Raw JSON</summary>
            <textarea
              className={styles.textarea}
              rows={5}
              value={mqtt}
              onChange={(e) => setMqtt(e.target.value)}
              spellCheck={false}
            />
            <Button
              variant="secondary"
              disabled={co.isPending}
              onClick={() => {
                try {
                  const parsed = JSON.parse(mqtt) as Record<string, unknown>
                  setMqttForm(mqttFromJson(parsed))
                  void applyOptions({ mqtt: coJsonBlob(parsed) })
                } catch {
                  setErr('Invalid JSON for mqtt')
                }
              }}
            >
              Parse &amp; save JSON
            </Button>
          </details>
        </Card>

        <Card variant="plain" title="Email">
          <label className={styles.checkRow}>
            <input
              type="checkbox"
              checked={emailForm.en === 1}
              onChange={(e) => setEmailForm((s) => ({ ...s, en: e.target.checked ? 1 : 0 }))}
            />
            Enable email
          </label>
          <div className={styles.field}>
            <Label htmlFor="em-host">SMTP server</Label>
            <Input
              id="em-host"
              value={emailForm.host}
              disabled={!emailForm.en}
              onChange={(e) => setEmailForm((s) => ({ ...s, host: e.target.value }))}
            />
          </div>
          <div className={styles.field}>
            <Label htmlFor="em-port">Port</Label>
            <Input
              id="em-port"
              type="number"
              min={0}
              max={65535}
              value={emailForm.port}
              disabled={!emailForm.en}
              onChange={(e) => setEmailForm((s) => ({ ...s, port: parseInt(e.target.value, 10) || 0 }))}
            />
          </div>
          <div className={styles.field}>
            <Label htmlFor="em-user">Sender email</Label>
            <Input
              id="em-user"
              value={emailForm.user}
              disabled={!emailForm.en}
              onChange={(e) => setEmailForm((s) => ({ ...s, user: e.target.value }))}
            />
          </div>
          <div className={styles.field}>
            <Label htmlFor="em-pass">App password</Label>
            <Input
              id="em-pass"
              type="password"
              value={emailForm.pass}
              disabled={!emailForm.en}
              onChange={(e) => setEmailForm((s) => ({ ...s, pass: e.target.value }))}
            />
          </div>
          <div className={styles.field}>
            <Label htmlFor="em-to">Recipient email</Label>
            <Input
              id="em-to"
              value={emailForm.recipient}
              disabled={!emailForm.en}
              onChange={(e) => setEmailForm((s) => ({ ...s, recipient: e.target.value }))}
            />
          </div>
          <Button
            variant="secondary"
            disabled={co.isPending}
            onClick={() => {
              const blob = coJsonBlob(emailToJson(emailForm) as Record<string, unknown>)
              void applyOptions({ email: blob })
              setEmail(stringifySettingJson(emailToJson(emailForm)))
            }}
          >
            Save email
          </Button>
          <details className={styles.rawJson}>
            <summary>Raw JSON</summary>
            <textarea
              className={styles.textarea}
              rows={5}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              spellCheck={false}
            />
            <Button
              variant="secondary"
              disabled={co.isPending}
              onClick={() => {
                try {
                  const parsed = JSON.parse(email) as Record<string, unknown>
                  setEmailForm(emailFromJson(parsed))
                  void applyOptions({ email: coJsonBlob(parsed) })
                } catch {
                  setErr('Invalid JSON for email')
                }
              }}
            >
              Parse &amp; save JSON
            </Button>
          </details>
        </Card>
      </details>

      <details className={styles.collapse}>
        <summary className={styles.collapseSummary}>Reset</summary>
        <Card variant="plain">
          <p className={styles.fieldHint}>Clears irrigation history on the controller.</p>
          <Button
            variant="danger"
            onClick={() => {
              if (!window.confirm('Clear all log data on the controller?')) return
              void osCommand('/dl', { day: 'all' })
                .then(() => setMsg('Log data cleared.'))
                .catch((e) => setErr(e instanceof Error ? e.message : 'Failed'))
            }}
          >
            Clear log data
          </Button>
        </Card>
        <Card variant="plain">
          <p className={styles.fieldHint}>
            Same actions as the OpenSprinkler app maintenance section. These cannot be undone.
          </p>
          <div className={styles.row}>
            <Button
              variant="danger"
              disabled={delAllProgs.isPending || maintBusy}
              onClick={() => {
                if (!window.confirm('Delete ALL programs on this controller?')) return
                setMaintBusy(true)
                setErr(null)
                void delAllProgs
                  .mutateAsync()
                  .then(() => {
                    setMsg('All programs deleted.')
                    void ja.refetch()
                  })
                  .catch((e) => setErr(e instanceof Error ? e.message : 'Failed'))
                  .finally(() => setMaintBusy(false))
              }}
            >
              Delete all programs
            </Button>
            <Button
              variant="danger"
              disabled={co.isPending || maintBusy}
              onClick={() => {
                if (
                  !window.confirm(
                    'Reset all controller options to defaults? This matches OpenSprinkler app "Reset All Options".',
                  )
                )
                  return
                setMaintBusy(true)
                setErr(null)
                const p = buildResetAllOptionsPayload(opts, fwv)
                void co
                  .mutateAsync(p)
                  .then(() => {
                    setMsg('All options reset to defaults.')
                    void ja.refetch()
                  })
                  .catch((e) => setErr(e instanceof Error ? e.message : 'Failed'))
                  .finally(() => setMaintBusy(false))
              }}
            >
              Reset all options
            </Button>
            <Button
              variant="danger"
              disabled={cs.isPending || maintBusy || !ja.data}
              onClick={() => {
                if (!window.confirm('Reset all station attributes (groups, master ops, ignore flags, …)?')) return
                setMaintBusy(true)
                setErr(null)
                const p = buildResetStationAttributesParams(ja.data!)
                if (Object.keys(p).length === 0) {
                  setErr('No resettable station fields reported by the controller.')
                  setMaintBusy(false)
                  return
                }
                void cs
                  .mutateAsync(p as Record<string, string | number>)
                  .then(() => {
                    setMsg('Station attributes reset.')
                    void ja.refetch()
                  })
                  .catch((e) => setErr(e instanceof Error ? e.message : 'Failed'))
                  .finally(() => setMaintBusy(false))
              }}
            >
              Reset station attributes
            </Button>
            <Button
              variant="danger"
              disabled={maintBusy}
              style={{ display: opts.hwv !== undefined && Number(opts.hwv) >= 30 && Number(opts.hwv) < 40 ? undefined : 'none' }}
              onClick={() => {
                if (
                  !window.confirm(
                    'Reset wireless? This clears WiFi credentials and may put the device in AP mode.',
                  )
                )
                  return
                setMaintBusy(true)
                setErr(null)
                void osCommand('/cv', { ap: 1 })
                  .then(() => setMsg('Wireless reset requested — see device manual to reconnect.'))
                  .catch((e) => setErr(e instanceof Error ? e.message : 'Failed'))
                  .finally(() => setMaintBusy(false))
              }}
            >
              Reset wireless
            </Button>
          </div>
        </Card>
      </details>

      {opts.con !== undefined || opts.lit !== undefined || opts.dim !== undefined ? (
        <details className={styles.collapse}>
          <summary className={styles.collapseSummary}>LCD screen</summary>
          <Card variant="plain">
            {opts.con !== undefined ? (
              <div className={styles.field}>
                <Label htmlFor="con">Contrast (0–255)</Label>
                <Input
                  id="con"
                  type="number"
                  min={0}
                  max={255}
                  value={con}
                  onChange={(e) => setCon(parseInt(e.target.value, 10) || 0)}
                />
              </div>
            ) : null}
            {opts.lit !== undefined ? (
              <div className={styles.field}>
                <Label htmlFor="lit">Brightness (0–255)</Label>
                <Input
                  id="lit"
                  type="number"
                  min={0}
                  max={255}
                  value={lit}
                  onChange={(e) => setLit(parseInt(e.target.value, 10) || 0)}
                />
              </div>
            ) : null}
            {opts.dim !== undefined ? (
              <div className={styles.field}>
                <Label htmlFor="dim">Idle brightness (0–255)</Label>
                <Input
                  id="dim"
                  type="number"
                  min={0}
                  max={255}
                  value={dim}
                  onChange={(e) => setDim(parseInt(e.target.value, 10) || 0)}
                />
              </div>
            ) : null}
            <Button
              variant="secondary"
              disabled={co.isPending}
              onClick={() =>
                void applyOptions({
                  ...(opts.con !== undefined ? { con } : {}),
                  ...(opts.lit !== undefined ? { lit } : {}),
                  ...(opts.dim !== undefined ? { dim } : {}),
                })
              }
            >
              Save LCD settings
            </Button>
          </Card>
        </details>
      ) : null}

      <details className={styles.collapse}>
        <summary className={styles.collapseSummary}>Advanced</summary>
        {(opts.hp0 !== undefined ||
          opts.devid !== undefined ||
          opts.bst !== undefined ||
          opts.imin !== undefined ||
          opts.imax !== undefined ||
          opts.tpdv !== undefined ||
          opts.laton !== undefined ||
          opts.latof !== undefined) && (
          <Card variant="plain" title="HTTP, device ID &amp; timing">
            {opts.hp0 !== undefined && opts.hp1 !== undefined ? (
              <div className={styles.field}>
                <Label htmlFor="http-port">HTTP port (restart required)</Label>
                <Input
                  id="http-port"
                  type="number"
                  min={0}
                  max={65535}
                  value={httpPortFromBytes(hp0, hp1)}
                  onChange={(e) => {
                    const { hp0: h0, hp1: h1 } = splitHttpPort(parseInt(e.target.value, 10) || 0)
                    setHp0(h0)
                    setHp1(h1)
                  }}
                />
                <p className={styles.fieldHint}>
                  Controller HTTP port used by the OpenSprinkler API and built-in web UI. Restart required after change.
                </p>
              </div>
            ) : null}
            {opts.hp0 !== undefined && opts.hp1 === undefined ? (
              <div className={styles.field}>
                <Label htmlFor="hp0">HTTP port high byte (restart required)</Label>
                <Input
                  id="hp0"
                  type="number"
                  min={0}
                  max={255}
                  value={hp0}
                  onChange={(e) => setHp0(parseInt(e.target.value, 10) || 0)}
                />
              </div>
            ) : null}
            {opts.hp1 !== undefined && opts.hp0 === undefined ? (
              <div className={styles.field}>
                <Label htmlFor="hp1">HTTP port low byte (restart required)</Label>
                <Input
                  id="hp1"
                  type="number"
                  min={0}
                  max={255}
                  value={hp1}
                  onChange={(e) => setHp1(parseInt(e.target.value, 10) || 0)}
                />
              </div>
            ) : null}
            {opts.devid !== undefined ? (
              <div className={styles.field}>
                <Label htmlFor="devid">Device ID (restart required)</Label>
                <Input
                  id="devid"
                  type="number"
                  min={0}
                  value={devid}
                  onChange={(e) => setDevid(parseInt(e.target.value, 10) || 0)}
                />
              </div>
            ) : null}
            {opts.bst !== undefined ? (
              <div className={styles.field}>
                <Label htmlFor="bst">Boost Time</Label>
                <Input
                  id="bst"
                  type="number"
                  min={0}
                  value={bst}
                  onChange={(e) => setBst(parseInt(e.target.value, 10) || 0)}
                />
              </div>
            ) : null}
            {opts.imin !== undefined ? (
              <div className={styles.field}>
                <Label htmlFor="imin">Undercurrent threshold (mA)</Label>
                <Input
                  id="imin"
                  type="number"
                  min={0}
                  value={imin}
                  onChange={(e) => setImin(parseInt(e.target.value, 10) || 0)}
                />
              </div>
            ) : null}
            {opts.imax !== undefined ? (
              <div className={styles.field}>
                <Label htmlFor="imax">Overcurrent limit (mA)</Label>
                <Input
                  id="imax"
                  type="number"
                  min={0}
                  value={imax}
                  onChange={(e) => setImax(parseInt(e.target.value, 10) || 0)}
                />
              </div>
            ) : null}
            {opts.tpdv !== undefined ? (
              <div className={styles.field}>
                <Label htmlFor="tpdv">Target PD voltage</Label>
                <Input
                  id="tpdv"
                  type="number"
                  min={0}
                  value={tpdv}
                  onChange={(e) => setTpdv(parseInt(e.target.value, 10) || 0)}
                />
              </div>
            ) : null}
            {opts.laton !== undefined ? (
              <div className={styles.field}>
                <Label htmlFor="laton">Latch on voltage</Label>
                <Input
                  id="laton"
                  type="number"
                  min={0}
                  value={laton}
                  onChange={(e) => setLaton(parseInt(e.target.value, 10) || 0)}
                />
              </div>
            ) : null}
            {opts.latof !== undefined ? (
              <div className={styles.field}>
                <Label htmlFor="latof">Latch off voltage</Label>
                <Input
                  id="latof"
                  type="number"
                  min={0}
                  value={latof}
                  onChange={(e) => setLatof(parseInt(e.target.value, 10) || 0)}
                />
              </div>
            ) : null}
            <Button variant="secondary" disabled={co.isPending} onClick={() => void saveAdvancedHardware()}>
              Save hardware settings
            </Button>
          </Card>
        )}
        <Card variant="plain">
          {opts.dhcp !== undefined ? (
            <label className={styles.checkRow}>
              <input type="checkbox" checked={dhcp} onChange={(e) => setDhcp(e.target.checked)} />
              Use DHCP (restart required)
            </label>
          ) : null}
          {opts.ntp !== undefined ? (
            <label className={styles.checkRow}>
              <input type="checkbox" checked={ntp} onChange={(e) => setNtp(e.target.checked)} />
              NTP Sync
            </label>
          ) : null}
          {opts.ar !== undefined ? (
            <label className={styles.checkRow}>
              <input type="checkbox" checked={ar} onChange={(e) => setAr(e.target.checked)} />
              Auto Reconnect
            </label>
          ) : null}
          {opts.ipas !== undefined ? (
            <label className={styles.checkRow}>
              <input type="checkbox" checked={ipas} onChange={(e) => setIpas(e.target.checked)} />
              Ignore Password
            </label>
          ) : null}
          {opts.sar !== undefined ? (
            <label className={styles.checkRow}>
              <input type="checkbox" checked={sar} onChange={(e) => setSar(e.target.checked)} />
              Special Station Auto-Refresh
            </label>
          ) : null}
          {(opts.ntp !== undefined ||
            opts.dhcp !== undefined ||
            opts.ar !== undefined ||
            opts.ipas !== undefined ||
            opts.sar !== undefined) && (
            <Button
              variant="secondary"
              disabled={co.isPending}
              onClick={() =>
                void applyOptions({
                  ...(opts.ntp !== undefined ? { ntp: ntp ? 1 : 0 } : {}),
                  ...(opts.dhcp !== undefined ? { dhcp: dhcp ? 1 : 0 } : {}),
                  ...(opts.ar !== undefined ? { ar: ar ? 1 : 0 } : {}),
                  ...(opts.ipas !== undefined ? { ipas: ipas ? 1 : 0 } : {}),
                  ...(opts.sar !== undefined ? { sar: sar ? 1 : 0 } : {}),
                })
              }
            >
              Save network flags
            </Button>
          )}
        </Card>
        {opts.ip1 !== undefined ? (
          <Card variant="plain">
            <p className={styles.fieldHint}>
              Turn DHCP off above, then set these addresses and save.
            </p>
            {opts.ntp1 !== undefined ? (
              <div className={styles.field}>
                <Label htmlFor="ntp-addr">NTP IP address</Label>
                <Input id="ntp-addr" value={ntpStr} onChange={(e) => setNtpStr(e.target.value)} spellCheck={false} />
              </div>
            ) : null}
            <div className={styles.field}>
              <Label htmlFor="ip-addr">IP address</Label>
              <Input id="ip-addr" value={ipStr} onChange={(e) => setIpStr(e.target.value)} spellCheck={false} />
            </div>
            <div className={styles.field}>
              <Label htmlFor="gw-addr">Gateway address</Label>
              <Input id="gw-addr" value={gwStr} onChange={(e) => setGwStr(e.target.value)} spellCheck={false} />
            </div>
            <div className={styles.field}>
              <Label htmlFor="subn-addr">Subnet mask</Label>
              <Input id="subn-addr" value={subnStr} onChange={(e) => setSubnStr(e.target.value)} spellCheck={false} />
            </div>
            <div className={styles.field}>
              <Label htmlFor="dns-addr">DNS address</Label>
              <Input id="dns-addr" value={dnsStr} onChange={(e) => setDnsStr(e.target.value)} spellCheck={false} />
            </div>
            <Button variant="secondary" disabled={co.isPending || dhcp} onClick={() => void saveNetworkStatic()}>
              Save address settings
            </Button>
          </Card>
        ) : null}
      </details>
    </div>
  )
}

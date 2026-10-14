import { useState } from 'react'
import { Eraser, RotateCcw, Trash2, Wifi, Workflow } from 'lucide-react'
import { ListGroup, ListRow } from '../../components/ui'
import { useConfirm } from '../../components/confirmContext'
import { osCommand } from '../../api/client'
import { useChangeOptions, useChangeStations, useClearAllLogs, useDeleteAllPrograms } from '../../api/hooks'
import { buildResetStationAttributesParams } from '../../lib/resetStationAttributes'
import { num, type SectionCtx } from './settingsShared'
import styles from './settings.module.css'

/** Factory defaults sent by "Reset all options" (OpenSprinkler app "Reset All Options"). */
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

type Action = {
  id: string
  title: string
  description: string
  icon: React.ReactNode
  confirm: string
  run: () => Promise<unknown>
  done: string
  hidden?: boolean
}

export function DangerSection({ ctx }: { ctx: SectionCtx }) {
  const { opts, data } = ctx
  const co = useChangeOptions()
  const cs = useChangeStations()
  const delAllProgs = useDeleteAllPrograms()
  const clearLogs = useClearAllLogs()
  const confirm = useConfirm()
  const [busy, setBusy] = useState<string | null>(null)

  const hwv = num(opts.hwv, -1)
  const isOs3 = hwv >= 30 && hwv < 40

  const actions: Action[] = [
    {
      id: 'logs',
      title: 'Clear log data',
      description: 'Delete all watering history stored on the controller.',
      icon: <Eraser size={18} aria-hidden />,
      confirm: 'Clear all log data on the controller? This cannot be undone.',
      run: () => clearLogs.mutateAsync(),
      done: 'Log data cleared.',
    },
    {
      id: 'programs',
      title: 'Delete all programs',
      description: 'Remove every program from the controller.',
      icon: <Trash2 size={18} aria-hidden />,
      confirm: 'Delete ALL programs on this controller? This cannot be undone.',
      run: () => delAllProgs.mutateAsync(),
      done: 'All programs deleted.',
    },
    {
      id: 'options',
      title: 'Reset all options',
      description: 'Back to factory defaults, including network settings — the controller may become unreachable.',
      icon: <RotateCcw size={18} aria-hidden />,
      confirm:
        'Reset all controller options to factory defaults (same as the OpenSprinkler app "Reset All Options")? Network settings are reset too.',
      // Note: the firmware version is passed where the app passes the hardware version (kept as before).
      run: () => co.mutateAsync(buildResetAllOptionsPayload(opts, num(opts.fwv))),
      done: 'All options reset to defaults.',
    },
    {
      id: 'stations',
      title: 'Reset station attributes',
      description: 'Clear groups, master use, sensor-ignore and other per-zone flags.',
      icon: <Workflow size={18} aria-hidden />,
      confirm: 'Reset all station attributes (groups, master use, ignore flags, …)?',
      run: async () => {
        const p = buildResetStationAttributesParams(data)
        if (Object.keys(p).length === 0) throw new Error('No resettable station fields reported by the controller.')
        await cs.mutateAsync(p)
      },
      done: 'Station attributes reset.',
    },
    {
      id: 'wifi',
      title: 'Reset wireless',
      description: 'Forget the Wi-Fi network; the controller restarts as an access point.',
      icon: <Wifi size={18} aria-hidden />,
      confirm: 'Reset wireless? This clears Wi-Fi credentials and puts the device in AP mode.',
      run: () => osCommand('/cv', { ap: 1 }),
      done: 'Wireless reset requested — see the device manual to reconnect.',
      hidden: !isOs3,
    },
  ]

  async function run(a: Action) {
    const ok = await confirm({ title: `${a.title}?`, message: a.confirm, confirmLabel: a.title, tone: 'danger' })
    if (!ok) return
    setBusy(a.id)
    try {
      await a.run()
      ctx.notify(a.done)
    } catch (e) {
      ctx.fail(e instanceof Error ? e.message : 'Failed')
    } finally {
      setBusy(null)
    }
  }

  return (
    <>
      <ListGroup>
        {actions
          .filter((a) => !a.hidden)
          .map((a) => (
            <ListRow
              key={a.id}
              danger
              icon={a.icon}
              title={busy === a.id ? `${a.title}…` : a.title}
              description={a.description}
              disabled={busy !== null}
              chevron={false}
              onClick={() => void run(a)}
            />
          ))}
      </ListGroup>
      <p className={styles.dangerIntro}>
        Each action asks for confirmation, then changes the controller immediately. None of them can be undone — take
        a backup first (More → Backup &amp; restore).
      </p>
    </>
  )
}

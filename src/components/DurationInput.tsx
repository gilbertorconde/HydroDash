import { useEffect, useRef, useState } from 'react'
import styles from './DurationInput.module.css'

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

function splitSeconds(totalSeconds: number) {
  const clamped = Math.max(0, totalSeconds)
  const hours = Math.floor(clamped / 3600)
  const minutes = Math.floor((clamped % 3600) / 60)
  const seconds = clamped % 60
  return { hours, minutes, seconds }
}

/** Integer in range, or null if empty / invalid (still typing). */
function parseSegment(raw: string, maxVal: number): number | null {
  const t = raw.trim()
  if (t === '') return null
  const n = parseInt(t, 10)
  if (Number.isNaN(n)) return null
  return clamp(n, 0, maxVal)
}

type Fields = { h: string; m: string; s: string }

type DurationInputProps = {
  idBase: string
  valueSeconds: number
  maxSeconds?: number
  onChange: (seconds: number) => void
}

export function DurationInput({ idBase, valueSeconds, maxSeconds = 64800, onChange }: DurationInputProps) {
  const maxH = Math.floor(maxSeconds / 3600)
  const valueRef = useRef(valueSeconds)
  valueRef.current = valueSeconds

  const [fields, setFields] = useState<Fields>(() => {
    const d = splitSeconds(valueSeconds)
    return { h: String(d.hours), m: String(d.minutes), s: String(d.seconds) }
  })

  useEffect(() => {
    const d = splitSeconds(valueSeconds)
    setFields({ h: String(d.hours), m: String(d.minutes), s: String(d.seconds) })
  }, [valueSeconds])

  const fieldsRef = useRef(fields)
  fieldsRef.current = fields

  function tryCommit(next: Fields) {
    const h = parseSegment(next.h, maxH)
    const m = parseSegment(next.m, 59)
    const s = parseSegment(next.s, 59)
    if (h === null || m === null || s === null) return
    const total = clamp(h * 3600 + m * 60 + s, 0, maxSeconds)
    onChange(total)
  }

  function patch(which: keyof Fields, raw: string) {
    const next = { ...fieldsRef.current, [which]: raw }
    fieldsRef.current = next
    setFields(next)
    tryCommit(next)
  }

  function onBlurRestoreIfIncomplete() {
    const cur = fieldsRef.current
    const h = parseSegment(cur.h, maxH)
    const m = parseSegment(cur.m, 59)
    const s = parseSegment(cur.s, 59)
    if (h === null || m === null || s === null) {
      const d = splitSeconds(valueRef.current)
      const restored = { h: String(d.hours), m: String(d.minutes), s: String(d.seconds) }
      fieldsRef.current = restored
      setFields(restored)
    }
  }

  return (
    <div className={styles.wrap}>
      <div className={styles.grid}>
        <div className={styles.cell}>
          <label className={styles.cellLabel} htmlFor={`${idBase}-h`}>
            Hr
          </label>
          <input
            id={`${idBase}-h`}
            className={styles.value}
            type="number"
            min={0}
            max={maxH}
            step={1}
            inputMode="numeric"
            value={fields.h}
            onChange={(e) => patch('h', e.target.value)}
            onBlur={onBlurRestoreIfIncomplete}
          />
        </div>
        <div className={styles.cell}>
          <label className={styles.cellLabel} htmlFor={`${idBase}-m`}>
            Min
          </label>
          <input
            id={`${idBase}-m`}
            className={styles.value}
            type="number"
            min={0}
            max={59}
            step={1}
            inputMode="numeric"
            value={fields.m}
            onChange={(e) => patch('m', e.target.value)}
            onBlur={onBlurRestoreIfIncomplete}
          />
        </div>
        <div className={styles.cell}>
          <label className={styles.cellLabel} htmlFor={`${idBase}-s`}>
            Sec
          </label>
          <input
            id={`${idBase}-s`}
            className={styles.value}
            type="number"
            min={0}
            max={59}
            step={1}
            inputMode="numeric"
            value={fields.s}
            onChange={(e) => patch('s', e.target.value)}
            onBlur={onBlurRestoreIfIncomplete}
          />
        </div>
      </div>
    </div>
  )
}

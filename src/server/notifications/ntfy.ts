/** Post a message to ntfy. Does not throw on network errors — returns false. */
export async function postNtfy(params: {
  baseUrl: string
  topic: string
  title: string
  body: string
  accessToken?: string
  /** Stable id for PUT …/clear (X-Sequence-ID). */
  sequenceId?: string
}): Promise<boolean> {
  const root = params.baseUrl.replace(/\/+$/, '')
  const topic = encodeURIComponent(params.topic.trim())
  const url = `${root}/${topic}`
  const headers: Record<string, string> = {
    Accept: 'application/json',
    'Content-Type': 'text/plain; charset=utf-8',
    Title: params.title.slice(0, 256),
  }
  const sid = params.sequenceId?.trim()
  if (sid) headers['X-Sequence-ID'] = sid
  const token = params.accessToken?.trim()
  if (token) headers.Authorization = `Bearer ${token}`

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers,
      body: params.body,
    })
    return res.ok
  } catch {
    return false
  }
}

/** Mark ntfy message read / dismiss (emits message_clear). Best-effort; does not throw. */
export async function clearNtfyMessage(params: {
  baseUrl: string
  topic: string
  sequenceId: string
  accessToken?: string
}): Promise<boolean> {
  const root = params.baseUrl.replace(/\/+$/, '')
  const topicEnc = encodeURIComponent(params.topic.trim())
  const seqEnc = encodeURIComponent(params.sequenceId.trim())
  const url = `${root}/${topicEnc}/${seqEnc}/clear`
  const headers: Record<string, string> = { Accept: 'application/json' }
  const token = params.accessToken?.trim()
  if (token) headers.Authorization = `Bearer ${token}`

  try {
    const res = await fetch(url, { method: 'PUT', headers })
    return res.ok
  } catch {
    return false
  }
}

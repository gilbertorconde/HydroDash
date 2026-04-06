/** Post a message to ntfy. Does not throw on network errors — returns false. */
export async function postNtfy(params: {
  baseUrl: string
  topic: string
  title: string
  body: string
  accessToken?: string
}): Promise<boolean> {
  const root = params.baseUrl.replace(/\/+$/, '')
  const topic = encodeURIComponent(params.topic.trim())
  const url = `${root}/${topic}`
  const headers: Record<string, string> = {
    Accept: 'application/json',
    'Content-Type': 'text/plain; charset=utf-8',
    Title: params.title.slice(0, 256),
  }
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

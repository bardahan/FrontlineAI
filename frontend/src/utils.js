export function formatDuration(sec) {
  if (!sec) return null
  const m = Math.floor(sec / 60)
  const s = sec % 60
  return m > 0 ? `${m}m ${s}s` : `${s}s`
}

export function parseTranscript(transcriptStr) {
  if (!transcriptStr) return []
  try {
    const parsed = JSON.parse(transcriptStr)
    return Array.isArray(parsed) ? parsed : [parsed]
  } catch {
    return [{ role: 'agent', message: transcriptStr }]
  }
}

export function relativeTime(dt) {
  if (!dt) return ''
  const diff = Date.now() - new Date(dt).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'Just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  const days = Math.floor(hrs / 24)
  if (days === 1) return 'Yesterday'
  return `${days}d ago`
}

export function dateGroup(dt) {
  if (!dt) return 'Unknown'
  const d = new Date(dt)
  const today = new Date()
  const yesterday = new Date(today)
  yesterday.setDate(today.getDate() - 1)
  if (d.toDateString() === today.toDateString()) return 'Today'
  if (d.toDateString() === yesterday.toDateString()) return 'Yesterday'
  return d.toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' })
}

export function callerFlag(number) {
  if (!number) return ''
  if (number.startsWith('+972')) return '🇮🇱'
  if (number.startsWith('+1')) return '🇺🇸'
  if (number.startsWith('+44')) return '🇬🇧'
  if (number.startsWith('+33')) return '🇫🇷'
  if (number.startsWith('+49')) return '🇩🇪'
  return ''
}

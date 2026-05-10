import { useState, useEffect } from 'react'
import { getCalls, deleteCall } from '../api'
import TranscriptBubble from './TranscriptBubble'
import { formatDuration, parseTranscript, relativeTime, dateGroup, callerFlag } from '../utils'

function StatusChip({ status }) {
  const map = {
    completed: { dot: 'bg-green-500', text: 'text-green-400', label: 'Completed', bg: 'bg-green-500/10' },
    missed: { dot: 'bg-amber-500', text: 'text-amber-400', label: 'Missed', bg: 'bg-amber-500/10' },
    'ai-handled': { dot: 'bg-indigo-500', text: 'text-indigo-400', label: 'AI handled', bg: 'bg-indigo-500/10' },
  }
  const style = map[status] || { dot: 'bg-zinc-500', text: 'text-zinc-400', label: status, bg: 'bg-zinc-500/10' }
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${style.text} ${style.bg}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${style.dot}`} />
      {style.label}
    </span>
  )
}

function CallCard({ call, expanded, onToggle, onDelete }) {
  const transcript = parseTranscript(call.transcript)
  const flag = callerFlag(call.caller_number)
  const duration = formatDuration(call.duration_seconds)

  return (
    <div className="bg-zinc-900 rounded-2xl border border-zinc-800 overflow-hidden">
      {/* Card header */}
      <div className="p-4 flex items-start gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-mono text-sm text-white font-medium">
              {flag && <span className="mr-1">{flag}</span>}
              {call.caller_number || 'Unknown'}
            </span>
            <StatusChip status={call.status} />
            {duration && (
              <span className="text-xs text-zinc-500 bg-zinc-800 px-2 py-0.5 rounded-full">{duration}</span>
            )}
          </div>
          <div className="mt-1 flex items-center gap-2 text-xs text-zinc-500">
            <span>{relativeTime(call.started_at)}</span>
            {call.language_detected && (
              <>
                <span>·</span>
                <span className="uppercase">{call.language_detected}</span>
              </>
            )}
          </div>

          {/* Summary always visible */}
          {call.post_call_status === 'processing' && (
            <div className="mt-2 flex items-center gap-2 text-xs text-zinc-500">
              <span className="w-3 h-3 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin inline-block" />
              Generating summary...
            </div>
          )}
          {call.summary && (
            <p className="mt-2 text-sm text-zinc-300 leading-relaxed line-clamp-3" dir="auto">
              {call.summary}
            </p>
          )}
        </div>

        {/* Delete button */}
        <button
          onClick={(e) => { e.stopPropagation(); onDelete(call.id, e) }}
          className="flex-shrink-0 p-1.5 text-zinc-600 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors"
          aria-label="Delete"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
              d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
          </svg>
        </button>
      </div>

      {/* Transcript toggle */}
      {transcript.length > 0 && (
        <div className="border-t border-zinc-800">
          <button
            onClick={() => onToggle(call.id)}
            className="w-full flex items-center justify-between px-4 py-2.5 text-xs text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800/50 transition-colors"
          >
            <span>Transcript</span>
            <span className={`transition-transform ${expanded ? 'rotate-180' : ''}`}>
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </span>
          </button>

          {expanded && (
            <div className="px-4 pb-4 space-y-1 max-h-64 overflow-y-auto">
              {transcript.map((entry, i) => (
                <TranscriptBubble key={i} entry={entry} dark />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export default function ActivityFeed() {
  const [calls, setCalls] = useState([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [expandedId, setExpandedId] = useState(null)
  const [loading, setLoading] = useState(true)
  const limit = 20

  const load = (p = page) => {
    setLoading(true)
    getCalls(p, limit)
      .then(data => {
        setCalls(data.items || [])
        setTotal(data.total || 0)
      })
      .catch(console.error)
      .finally(() => setLoading(false))
  }

  useEffect(() => { load(page) }, [page])

  const handleDelete = async (id, e) => {
    e.stopPropagation()
    await deleteCall(id)
    load(page)
  }

  const toggleExpand = (id) => {
    setExpandedId(expandedId === id ? null : id)
  }

  const totalPages = Math.ceil(total / limit)

  if (loading && calls.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center py-20 text-zinc-600 text-sm">
        Loading...
      </div>
    )
  }

  if (!loading && calls.length === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center py-20 gap-3 text-center">
        <div className="w-14 h-14 rounded-full bg-zinc-900 border border-zinc-800 flex items-center justify-center text-2xl">
          📞
        </div>
        <p className="text-zinc-400 text-sm">No calls yet</p>
        <p className="text-zinc-600 text-xs max-w-xs">Incoming calls handled by the AI will appear here.</p>
      </div>
    )
  }

  // Group by date
  const groups = []
  let currentGroup = null
  for (const call of calls) {
    const label = dateGroup(call.started_at)
    if (!currentGroup || currentGroup.label !== label) {
      currentGroup = { label, calls: [] }
      groups.push(currentGroup)
    }
    currentGroup.calls.push(call)
  }

  return (
    <div className="flex-1 overflow-y-auto pb-20 md:pb-6">
      <div className="px-4 py-4 space-y-6">
        {groups.map(group => (
          <div key={group.label}>
            <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-3 px-1">
              {group.label}
            </p>
            <div className="space-y-3">
              {group.calls.map(call => (
                <CallCard
                  key={call.id}
                  call={call}
                  expanded={expandedId === call.id}
                  onToggle={toggleExpand}
                  onDelete={handleDelete}
                />
              ))}
            </div>
          </div>
        ))}

        {totalPages > 1 && (
          <div className="flex items-center justify-center gap-3 pt-2">
            <button
              onClick={() => setPage(p => Math.max(1, p - 1))}
              disabled={page === 1}
              className="px-3 py-1.5 text-sm border border-zinc-700 text-zinc-400 rounded-lg hover:bg-zinc-800 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              Previous
            </button>
            <span className="text-sm text-zinc-500">Page {page} of {totalPages}</span>
            <button
              onClick={() => setPage(p => Math.min(totalPages, p + 1))}
              disabled={page === totalPages}
              className="px-3 py-1.5 text-sm border border-zinc-700 text-zinc-400 rounded-lg hover:bg-zinc-800 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              Next
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

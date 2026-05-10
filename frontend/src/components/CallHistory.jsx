import { useState, useEffect } from 'react'
import { getCalls, deleteCall } from '../api'
import TranscriptBubble from './TranscriptBubble'
import { formatDuration, parseTranscript } from '../utils'

function StatusBadge({ status }) {
  const colors = {
    completed: 'bg-green-100 text-green-700',
    missed: 'bg-yellow-100 text-yellow-700',
    'ai-handled': 'bg-blue-100 text-blue-700',
  }
  return (
    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${colors[status] || 'bg-gray-100 text-gray-600'}`}>
      {status}
    </span>
  )
}

export default function CallHistory() {
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

  const formatDate = (dt) => {
    if (!dt) return '-'
    return new Date(dt).toLocaleString()
  }

  const totalPages = Math.ceil(total / limit)

  if (loading && calls.length === 0) {
    return <div className="text-center py-12 text-gray-400">Loading calls...</div>
  }

  if (!loading && calls.length === 0) {
    return (
      <div className="text-center py-12 text-gray-400">
        <p className="text-4xl mb-3">No calls</p>
        <p>No calls yet. Incoming calls handled by the AI will appear here.</p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-gray-500">{total} total call{total !== 1 ? 's' : ''}</p>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Caller</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Date / Time</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Duration</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Language</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Status</th>
              <th className="text-right px-4 py-3 font-medium text-gray-600">Actions</th>
            </tr>
          </thead>
          <tbody>
            {calls.map(call => {
              const transcript = parseTranscript(call.transcript)
              const isExpanded = expandedId === call.id

              return (
                <>
                  <tr
                    key={call.id}
                    onClick={() => toggleExpand(call.id)}
                    className="border-b border-gray-100 transition-colors cursor-pointer hover:bg-gray-50"
                  >
                    <td className="px-4 py-3 font-mono text-gray-700">{call.caller_number || 'Unknown'}</td>
                    <td className="px-4 py-3 text-gray-600">{formatDate(call.started_at)}</td>
                    <td className="px-4 py-3 text-gray-600">{formatDuration(call.duration_seconds) ?? '-'}</td>
                    <td className="px-4 py-3">
                      <span className="uppercase text-xs font-medium text-gray-500">{call.language_detected || '-'}</span>
                    </td>
                    <td className="px-4 py-3"><StatusBadge status={call.status} /></td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-2">
                        {transcript.length > 0 && (
                          <span className="text-gray-400 text-xs">{isExpanded ? 'Hide' : 'Show'}</span>
                        )}
                        <button
                          onClick={(e) => handleDelete(call.id, e)}
                          className="text-red-400 hover:text-red-600 text-xs px-2 py-1 rounded hover:bg-red-50 transition-colors"
                        >
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                  {isExpanded && (
                    <tr key={`transcript-${call.id}`} className="bg-gray-50">
                      <td colSpan={6} className="px-6 py-4 space-y-4">
                        {/* Summary */}
                        {call.post_call_status === 'processing' && (
                          <div className="flex items-center gap-2 text-sm text-gray-500">
                            <span className="w-3 h-3 border-2 border-blue-400 border-t-transparent rounded-full animate-spin inline-block" />
                            Generating summary...
                          </div>
                        )}
                        {call.summary && (
                          <div className="bg-blue-50 border border-blue-100 rounded-lg p-4">
                            <p className="text-xs font-semibold text-blue-600 uppercase tracking-wide mb-2">Callback Summary</p>
                            <p className="text-sm text-gray-800 whitespace-pre-wrap" dir="auto">{call.summary}</p>
                          </div>
                        )}
                        {call.post_call_status === 'failed' && !call.summary && (
                          <p className="text-xs text-red-400">Summary unavailable</p>
                        )}

                        {/* Transcript */}
                        {transcript.length > 0 && (
                          <div>
                            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Transcript</p>
                            <div className="max-h-64 overflow-y-auto space-y-1">
                              {transcript.map((entry, i) => (
                                <TranscriptBubble key={i} entry={entry} />
                              ))}
                            </div>
                          </div>
                        )}
                        {transcript.length === 0 && (
                          <p className="text-gray-400 text-sm">No transcript available.</p>
                        )}
                      </td>
                    </tr>
                  )}
                </>
              )
            })}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-3">
          <button
            onClick={() => setPage(p => Math.max(1, p - 1))}
            disabled={page === 1}
            className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Previous
          </button>
          <span className="text-sm text-gray-600">Page {page} of {totalPages}</span>
          <button
            onClick={() => setPage(p => Math.min(totalPages, p + 1))}
            disabled={page === totalPages}
            className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Next
          </button>
        </div>
      )}
    </div>
  )
}

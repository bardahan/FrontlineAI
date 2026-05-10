import { useState, useEffect } from 'react'
import { toast } from 'react-hot-toast'
import { getTools, disconnectTool } from '../api'

const API_BASE = import.meta.env.VITE_API_BASE ?? 'http://localhost:8000'

const ICONS = {
  calendar: (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
        d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
    </svg>
  ),
}

export default function ToolConnections() {
  const [tools, setTools] = useState([])
  const [loading, setLoading] = useState(true)

  const fetchTools = () => {
    getTools()
      .then(setTools)
      .catch(() => toast.error('Failed to load integrations'))
      .finally(() => setLoading(false))
  }

  useEffect(() => { fetchTools() }, [])

  const handleConnect = (toolName, accessLevel) => {
    // toolName format: "google_calendar" → auth path: "calendar"
    const authPath = toolName.replace(/^google_/, '')
    window.location.href = `${API_BASE}/auth/${authPath}?access=${accessLevel}`
  }

  const handleDisconnect = async (toolName) => {
    try {
      await disconnectTool(toolName)
      toast.success('Disconnected')
      fetchTools()
    } catch {
      toast.error('Failed to disconnect')
    }
  }

  if (loading) return null

  return (
    <div className="bg-zinc-900 rounded-2xl border border-zinc-800 p-5 space-y-4">
      <div>
        <h2 className="text-sm font-semibold text-white">Integrations</h2>
        <p className="text-xs text-zinc-500 mt-0.5">Connect tools the AI can use during calls.</p>
      </div>

      <div className="space-y-3">
        {tools.map(tool => (
          <div key={tool.name} className="flex items-center gap-4 p-4 rounded-xl border border-zinc-800 bg-zinc-800/50">
            <div className="flex-shrink-0 w-9 h-9 rounded-lg bg-indigo-500/10 text-indigo-400 flex items-center justify-center">
              {ICONS[tool.icon] ?? <span className="text-base">🔧</span>}
            </div>

            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-white">{tool.display_name}</p>
              <p className="text-xs text-zinc-500 mt-0.5">{tool.description}</p>
              {tool.connected && tool.access_level && (
                <span className="inline-block mt-1 text-xs text-indigo-400 bg-indigo-500/10 px-2 py-0.5 rounded-full">
                  {tool.access_level === 'readwrite' ? 'Read & Write' : 'Read Only'}
                </span>
              )}
            </div>

            <div className="flex-shrink-0 flex flex-col gap-2 items-end">
              {tool.connected ? (
                <>
                  <span className="inline-flex items-center gap-1 text-xs text-green-400 font-medium">
                    <span className="w-1.5 h-1.5 rounded-full bg-green-500" />
                    Connected
                  </span>
                  <button
                    onClick={() => handleDisconnect(tool.name)}
                    className="text-xs text-zinc-600 hover:text-red-400 transition-colors"
                  >
                    Disconnect
                  </button>
                </>
              ) : (
                <div className="flex gap-2">
                  <button
                    onClick={() => handleConnect(tool.name, 'read')}
                    className="text-xs px-3 py-1.5 border border-zinc-700 text-zinc-400 rounded-lg hover:border-indigo-500/50 hover:text-indigo-400 transition-colors"
                  >
                    Read Only
                  </button>
                  <button
                    onClick={() => handleConnect(tool.name, 'readwrite')}
                    className="text-xs px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg transition-colors"
                  >
                    Connect
                  </button>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

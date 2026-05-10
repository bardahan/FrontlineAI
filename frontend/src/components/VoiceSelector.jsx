import { useState, useEffect, useRef } from 'react'
import { getGeminiVoices } from '../api'
import { labelClass } from '../styles'

const API_BASE = import.meta.env.VITE_API_BASE ?? 'http://localhost:8000'

export default function VoiceSelector({ settings, onChange }) {
  const [voices, setVoices] = useState([])
  const [loading, setLoading] = useState(true)
  const [previewing, setPreviewing] = useState(null)
  const audioRef = useRef(null)
  const abortRef = useRef(null)

  useEffect(() => {
    getGeminiVoices()
      .then(setVoices)
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [])

  const selected = settings.gemini_voice || 'Kore'

  const stopCurrent = () => {
    abortRef.current?.abort()
    abortRef.current = null
    if (audioRef.current) {
      audioRef.current.pause()
      URL.revokeObjectURL(audioRef.current.src)
      audioRef.current = null
    }
  }

  const playPreview = async (e, voice) => {
    e.stopPropagation()
    if (previewing === voice) {
      stopCurrent()
      setPreviewing(null)
      return
    }
    stopCurrent()
    setPreviewing(voice)
    const controller = new AbortController()
    abortRef.current = controller
    try {
      const res = await fetch(`${API_BASE}/api/voice-preview?voice=${voice}`, {
        credentials: 'include',
        signal: controller.signal,
      })
      const blob = await res.blob()
      // Bail if the user already clicked a different voice while we were fetching
      if (controller.signal.aborted) return
      const url = URL.createObjectURL(blob)
      const audio = new Audio(url)
      audioRef.current = audio
      audio.onended = () => setPreviewing(null)
      audio.onerror = () => setPreviewing(null)
      await audio.play()
    } catch (err) {
      if (err.name !== 'AbortError') setPreviewing(null)
    }
  }

  return (
    <div className="bg-zinc-900 rounded-2xl border border-zinc-800 p-5 space-y-4">
      <h2 className="text-sm font-semibold text-white">Voice</h2>

      <div>
        <label className={labelClass}>Agent Voice</label>
        {loading ? (
          <div className="bg-zinc-800 border border-zinc-700 rounded-xl px-3 py-2.5 text-sm text-zinc-500">
            Loading voices...
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-2 max-h-72 overflow-y-auto pr-1">
            {voices.map(voice => {
              const isSelected = voice === selected
              const isPlaying = previewing === voice
              return (
                <div
                  key={voice}
                  onClick={() => onChange({ gemini_voice: voice })}
                  className={`flex items-center justify-between px-3 py-2.5 rounded-xl border text-left transition-colors cursor-pointer ${
                    isSelected
                      ? 'bg-indigo-600/20 border-indigo-500 text-white'
                      : 'bg-zinc-800 border-zinc-700 text-zinc-300 hover:border-zinc-500'
                  }`}
                >
                  <span className="text-sm truncate">{voice}</span>
                  <button
                    type="button"
                    onClick={(e) => playPreview(e, voice)}
                    className={`ml-2 shrink-0 w-7 h-7 flex items-center justify-center rounded-full transition-colors ${
                      isPlaying
                        ? 'bg-indigo-500 text-white'
                        : 'text-zinc-500 hover:text-indigo-400 hover:bg-zinc-700'
                    }`}
                    title={isPlaying ? 'Stop preview' : 'Preview voice'}
                  >
                    {isPlaying ? (
                      <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 24 24">
                        <rect x="6" y="6" width="4" height="12" rx="1"/>
                        <rect x="14" y="6" width="4" height="12" rx="1"/>
                      </svg>
                    ) : (
                      <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M8 5v14l11-7z"/>
                      </svg>
                    )}
                  </button>
                </div>
              )
            })}
          </div>
        )}
        {selected && (
          <p className="text-xs text-zinc-600 mt-2">
            Selected: <span className="text-zinc-400">{selected}</span>
          </p>
        )}
      </div>
    </div>
  )
}

import { useCallSession } from '../hooks/useCallSession'
import { useState, useEffect } from 'react'

function useCallTimer(active) {
  const [seconds, setSeconds] = useState(0)
  useEffect(() => {
    if (!active) { setSeconds(0); return }
    const id = setInterval(() => setSeconds(s => s + 1), 1000)
    return () => clearInterval(id)
  }, [active])
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${m}:${String(s).padStart(2, '0')}`
}

export default function LiveCallScreen() {
  const { status, startCall, endCall } = useCallSession()
  const timer = useCallTimer(status === 'active')

  return (
    <div className="flex-1 flex flex-col items-center justify-center gap-8 py-12 px-6">
      {/* Pulsing ring */}
      <div className="relative flex items-center justify-center">
        {status === 'active' && (
          <>
            <span className="absolute w-32 h-32 rounded-full bg-green-500/10 animate-ping" style={{ animationDuration: '1.5s' }} />
            <span className="absolute w-24 h-24 rounded-full bg-green-500/15 animate-ping" style={{ animationDuration: '1.5s', animationDelay: '0.3s' }} />
          </>
        )}
        {status === 'connecting' && (
          <span className="absolute w-28 h-28 rounded-full border-2 border-indigo-500/40 animate-ping" />
        )}
        <div className={`relative w-20 h-20 rounded-full flex items-center justify-center shadow-xl transition-colors duration-300 ${
          status === 'active' ? 'bg-green-500/20 border border-green-500/40' :
          status === 'connecting' ? 'bg-indigo-500/20 border border-indigo-500/40' :
          'bg-zinc-800 border border-zinc-700'
        }`}>
          <svg className={`w-8 h-8 ${status === 'active' ? 'text-green-400' : 'text-zinc-400'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
              d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
          </svg>
        </div>
      </div>

      {/* Status text */}
      <div className="text-center space-y-1">
        {status === 'idle' && (
          <>
            <p className="text-lg font-semibold text-white">Ready to connect</p>
            <p className="text-sm text-zinc-500">Talk to your AI agent directly</p>
          </>
        )}
        {status === 'connecting' && (
          <>
            <p className="text-lg font-semibold text-indigo-400">Connecting…</p>
            <p className="text-sm text-zinc-500">Setting up audio</p>
          </>
        )}
        {status === 'active' && (
          <>
            <p className="text-lg font-semibold text-green-400">Live · {timer}</p>
            <div className="flex items-center justify-center gap-0.5 h-5 mt-2">
              {[1, 2, 3, 4, 5, 4, 3, 2, 1].map((h, i) => (
                <span
                  key={i}
                  className="w-1 bg-green-500 rounded-full opacity-80"
                  style={{
                    height: `${h * 4}px`,
                    animation: `waveBar 0.8s ease-in-out infinite`,
                    animationDelay: `${i * 0.08}s`,
                  }}
                />
              ))}
            </div>
          </>
        )}
      </div>

      {/* Action button */}
      {status === 'idle' && (
        <button
          onClick={startCall}
          className="flex items-center gap-3 px-8 py-4 bg-green-500 hover:bg-green-400 text-white font-semibold rounded-2xl transition-all shadow-lg shadow-green-500/20 hover:shadow-green-500/30 hover:scale-105 active:scale-95"
        >
          <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
            <path d="M6.62 10.79c1.44 2.83 3.76 5.14 6.59 6.59l2.2-2.2c.27-.27.67-.36 1.02-.24 1.12.37 2.33.57 3.57.57.55 0 1 .45 1 1V20c0 .55-.45 1-1 1-9.39 0-17-7.61-17-17 0-.55.45-1 1-1h3.5c.55 0 1 .45 1 1 0 1.25.2 2.45.57 3.57.11.35.03.74-.25 1.02l-2.2 2.2z"/>
          </svg>
          Start Call
        </button>
      )}

      {status === 'connecting' && (
        <button disabled className="flex items-center gap-3 px-8 py-4 bg-zinc-800 text-zinc-500 font-semibold rounded-2xl cursor-not-allowed">
          <span className="w-5 h-5 border-2 border-zinc-500 border-t-transparent rounded-full animate-spin" />
          Connecting…
        </button>
      )}

      {status === 'active' && (
        <button
          onClick={endCall}
          className="flex items-center gap-3 px-8 py-4 bg-red-500 hover:bg-red-400 text-white font-semibold rounded-2xl transition-all shadow-lg shadow-red-500/20 hover:shadow-red-500/30 hover:scale-105 active:scale-95"
        >
          <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
            <path d="M12 9c-1.6 0-3.15.25-4.6.72v3.1c0 .39-.23.74-.56.9-.98.49-1.87 1.12-2.66 1.85-.18.18-.43.28-.7.28-.28 0-.53-.11-.71-.29L.29 13.08c-.18-.17-.29-.42-.29-.7 0-.28.11-.53.29-.71C3.34 8.78 7.46 7 12 7s8.66 1.78 11.71 4.67c.18.18.29.43.29.71 0 .28-.11.53-.29.71l-2.48 2.48c-.18.18-.43.29-.71.29-.27 0-.52-.1-.7-.28-.79-.73-1.68-1.36-2.66-1.85-.33-.16-.56-.51-.56-.9v-3.1C15.15 9.25 13.6 9 12 9z"/>
          </svg>
          End Call
        </button>
      )}

      <style>{`
        @keyframes waveBar {
          0%, 100% { transform: scaleY(0.5); opacity: 0.6; }
          50% { transform: scaleY(1.5); opacity: 1; }
        }
      `}</style>
    </div>
  )
}

import { useCallSession } from '../hooks/useCallSession'

export default function CallButton() {
  const { status, startCall, endCall } = useCallSession()

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-gray-800">Test Call</h2>
          <p className="text-xs text-gray-500 mt-0.5">Talk to the AI agent directly from your browser</p>
        </div>

        {status === 'idle' && (
          <button
            onClick={startCall}
            className="flex items-center gap-2 px-5 py-2.5 bg-green-500 hover:bg-green-600 text-white font-medium rounded-lg transition-colors"
          >
            <span>📞</span> Call
          </button>
        )}

        {status === 'connecting' && (
          <button disabled className="flex items-center gap-2 px-5 py-2.5 bg-gray-300 text-gray-500 font-medium rounded-lg cursor-not-allowed">
            <span className="animate-pulse">⏳</span> Connecting…
          </button>
        )}

        {status === 'active' && (
          <div className="flex items-center gap-3">
            <span className="flex items-center gap-1.5 text-sm text-green-600 font-medium">
              <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse inline-block"></span>
              Live
            </span>
            <button
              onClick={endCall}
              className="flex items-center gap-2 px-5 py-2.5 bg-red-500 hover:bg-red-600 text-white font-medium rounded-lg transition-colors"
            >
              <span>🔴</span> End
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

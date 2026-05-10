import PhoneSettings from './PhoneSettings'
import AISettings from './AISettings'
import VoiceSelector from './VoiceSelector'
import ToolConnections from './ToolConnections'

export default function SettingsScreen({ settings, onChange, onSave, saving, onBack }) {
  return (
    <div className="flex-1 overflow-y-auto pb-6">
      {/* Sticky header */}
      <div className="sticky top-0 z-30 flex items-center justify-between px-4 h-14 bg-zinc-950/90 backdrop-blur border-b border-zinc-800">
        <button
          onClick={onBack}
          className="flex items-center gap-1.5 text-zinc-400 hover:text-white transition-colors text-sm"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          Back
        </button>
        <span className="text-sm font-semibold text-white">Settings</span>
        <button
          onClick={onSave}
          disabled={saving}
          className="px-4 py-1.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-60 disabled:cursor-not-allowed text-white text-sm font-medium rounded-lg transition-colors"
        >
          {saving ? 'Saving…' : 'Save'}
        </button>
      </div>

      <div className="px-4 py-4 space-y-4">
        <PhoneSettings settings={settings} onChange={onChange} />
        <AISettings settings={settings} onChange={onChange} />
        <VoiceSelector settings={settings} onChange={onChange} />
        <ToolConnections />
      </div>
    </div>
  )
}

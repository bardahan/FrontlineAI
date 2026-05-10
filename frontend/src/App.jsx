import { useState, useEffect } from 'react'
import { Toaster, toast } from 'react-hot-toast'
import { getSettings, updateSettings, claimTwilioNumber } from './api'
import { useAuth } from './context/AuthContext'
import LoginPage from './components/LoginPage'
import ForwardingModal from './components/ForwardingModal'
import Header from './components/Header'
import BottomNav from './components/BottomNav'
import ActivityFeed from './components/ActivityFeed'
import LiveCallScreen from './components/LiveCallScreen'
import SettingsScreen from './components/SettingsScreen'

function ClaimConflictModal({ conflict, onClaim, onDismiss }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60">
      <div className="bg-zinc-900 rounded-2xl border border-zinc-700 w-full max-w-sm p-6 space-y-4">
        <h2 className="text-base font-bold text-white">Number Already Assigned</h2>
        <p className="text-sm text-zinc-400">
          <span className="font-mono text-zinc-200">{conflict.twilio_number}</span> is
          currently assigned to <span className="font-medium text-zinc-200">{conflict.holder_name}</span> ({conflict.holder_email}).
        </p>
        <p className="text-sm text-zinc-400">Claim this number? It will be removed from the other account.</p>
        <div className="flex gap-3 pt-1">
          <button
            onClick={onClaim}
            className="flex-1 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium rounded-lg transition-colors"
          >
            Claim Number
          </button>
          <button
            onClick={onDismiss}
            className="px-4 py-2.5 text-zinc-500 hover:text-zinc-300 text-sm font-medium transition-colors"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  )
}

export default function App() {
  const { user, loading, logout } = useAuth()

  const [screen, setScreen] = useState('feed') // 'feed' | 'call' | 'settings'
  const [settings, setSettings] = useState({
    personal_number: '',
    timeout_seconds: 15,
    system_prompt: '',
    greeting_message: '',
    gemini_voice: 'Kore',
    twilio_number: '',
    summary_language: '',
    timezone: 'UTC',
  })
  const [saving, setSaving] = useState(false)
  const [showForwardingModal, setShowForwardingModal] = useState(false)
  const [claimConflict, setClaimConflict] = useState(null)

  useEffect(() => {
    if (!user) return
    getSettings()
      .then(data => setSettings(data))
      .catch(() => toast.error('Failed to load settings'))
  }, [user])

  const handleChange = (patch) => setSettings(prev => ({ ...prev, ...patch }))

  const handleSave = async () => {
    setSaving(true)
    const prevTwilioNumber = settings.twilio_number
    try {
      const updated = await updateSettings({
        personal_number: settings.personal_number,
        timeout_seconds: settings.timeout_seconds,
        system_prompt: settings.system_prompt,
        greeting_message: settings.greeting_message,
        gemini_voice: settings.gemini_voice,
        twilio_number: settings.twilio_number,
        summary_language: settings.summary_language,
        timezone: settings.timezone,
      })
      setSettings(updated)
      toast.success('Settings saved!')
      if (updated.twilio_number && !prevTwilioNumber) {
        setShowForwardingModal(true)
      }
    } catch (err) {
      const detail = err?.response?.data?.detail
      if (detail?.code === 'twilio_number_in_use') {
        setClaimConflict(detail)
      } else {
        toast.error(typeof detail === 'string' ? detail : 'Failed to save settings')
      }
    } finally {
      setSaving(false)
    }
  }

  const handleClaim = async () => {
    try {
      const updated = await claimTwilioNumber(claimConflict.twilio_number)
      setSettings(s => ({ ...s, ...updated }))
      setClaimConflict(null)
      toast.success('Number claimed successfully!')
    } catch {
      toast.error('Failed to claim number')
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  if (!user) return <LoginPage />

  return (
    <div className="min-h-screen bg-zinc-950 flex flex-col md:flex-row">
      <Toaster
        position="top-right"
        toastOptions={{
          style: { background: '#18181b', color: '#fafafa', border: '1px solid #3f3f46' },
        }}
      />

      {claimConflict && (
        <ClaimConflictModal
          conflict={claimConflict}
          onClaim={handleClaim}
          onDismiss={() => setClaimConflict(null)}
        />
      )}

      {showForwardingModal && settings.twilio_number && (
        <ForwardingModal
          twilioNumber={settings.twilio_number}
          timeoutSeconds={settings.timeout_seconds}
          onClose={() => setShowForwardingModal(false)}
        />
      )}

      {/* Desktop sidebar */}
      <aside className="hidden md:flex flex-col w-56 shrink-0 border-r border-zinc-800 bg-zinc-950 sticky top-0 h-screen">
        <div className="flex items-center gap-2 px-5 h-14 border-b border-zinc-800">
          <span className="w-2 h-2 rounded-full bg-indigo-500 shadow-[0_0_6px_2px_rgba(99,102,241,0.5)]" />
          <span className="font-semibold text-white tracking-tight text-sm">FrontlineAI</span>
        </div>
        <nav className="flex-1 px-3 py-4 space-y-1">
          {[
            { id: 'feed', label: 'Feed', icon: <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" /></svg> },
            { id: 'call', label: 'Call', icon: <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" /></svg> },
          ].map(item => (
            <button
              key={item.id}
              onClick={() => setScreen(item.id)}
              className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors ${
                screen === item.id
                  ? 'bg-indigo-500/10 text-indigo-400'
                  : 'text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800'
              }`}
            >
              {item.icon}
              {item.label}
            </button>
          ))}
        </nav>
        <div className="px-3 pb-4 border-t border-zinc-800 pt-4 space-y-1">
          <button
            onClick={() => setScreen('settings')}
            className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors ${
              screen === 'settings'
                ? 'bg-indigo-500/10 text-indigo-400'
                : 'text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800'
            }`}
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
            Settings
          </button>
          <button
            onClick={logout}
            className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-zinc-600 hover:text-zinc-400 hover:bg-zinc-800 transition-colors"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
            </svg>
            Sign out
          </button>
        </div>
      </aside>

      {/* Main content area */}
      <div className="flex-1 flex flex-col min-h-screen md:min-h-0 md:h-screen md:overflow-hidden">
        {/* Mobile header (hidden on desktop sidebar) */}
        {screen !== 'settings' && (
          <div className="md:hidden">
            <Header user={user} onSettingsClick={() => setScreen('settings')} />
          </div>
        )}

        {/* Desktop header */}
        <div className="hidden md:flex items-center justify-between px-6 h-14 border-b border-zinc-800 shrink-0">
          <h2 className="text-sm font-semibold text-white capitalize">
            {screen === 'feed' ? 'Activity Feed' : screen === 'call' ? 'Test Call' : 'Settings'}
          </h2>
          <div className="flex items-center gap-2">
            {user?.avatar_url ? (
              <img src={user.avatar_url} className="w-7 h-7 rounded-full ring-1 ring-zinc-700" alt={user.name} />
            ) : (
              <div className="w-7 h-7 rounded-full bg-zinc-700 flex items-center justify-center text-xs text-zinc-300">
                {user?.name?.[0] ?? '?'}
              </div>
            )}
            <span className="text-xs text-zinc-500">{user?.name}</span>
          </div>
        </div>

        {/* Screen content */}
        <div className="flex-1 flex flex-col md:overflow-y-auto">
          {screen === 'feed' && <ActivityFeed />}
          {screen === 'call' && <LiveCallScreen />}
          {screen === 'settings' && (
            <SettingsScreen
              settings={settings}
              onChange={handleChange}
              onSave={handleSave}
              saving={saving}
              onBack={() => setScreen('feed')}
            />
          )}
        </div>
      </div>

      {/* Mobile bottom nav */}
      <BottomNav screen={screen} onNavigate={setScreen} />
    </div>
  )
}

import { useState, useEffect, useRef } from 'react'
import { getTwilioNumbers } from '../api'
import ForwardingModal from './ForwardingModal'
import { inputClass, labelClass } from '../styles'

function isMobile() {
  return /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent)
}

function telLink(code) {
  return 'tel:' + code.replace('+', '%2B').replace(/#/g, '%23')
}

export default function PhoneSettings({ settings, onChange, onSaved }) {
  const [twilioNumbers, setTwilioNumbers] = useState([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [timerNotice, setTimerNotice] = useState(null)
  const [copied, setCopied] = useState(false)
  const prevTimeout = useRef(null)
  const copyTimeoutRef = useRef(null)
  const mobile = isMobile()

  useEffect(() => {
    getTwilioNumbers()
      .then(setTwilioNumbers)
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    return () => {
      if (copyTimeoutRef.current) clearTimeout(copyTimeoutRef.current)
    }
  }, [])

  useEffect(() => {
    if (prevTimeout.current === null && settings.timeout_seconds) {
      prevTimeout.current = settings.timeout_seconds
    }
  }, [settings.timeout_seconds])

  function handleTimeoutChange(seconds) {
    onChange({ timeout_seconds: seconds })
    if (prevTimeout.current !== null && prevTimeout.current !== seconds && settings.twilio_number) {
      setTimerNotice(`**61*${settings.twilio_number}*11*${seconds}#`)
      setCopied(false)
    }
    prevTimeout.current = seconds
  }

  function handleCopy(code) {
    navigator.clipboard?.writeText(code)
    setCopied(true)
    if (copyTimeoutRef.current) clearTimeout(copyTimeoutRef.current)
    copyTimeoutRef.current = setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="bg-zinc-900 rounded-2xl border border-zinc-800 p-5 space-y-5">
      <h2 className="text-sm font-semibold text-white">Phone</h2>

      {/* Twilio number selector */}
      <div>
        <label className={labelClass}>Twilio Number</label>
        {loading ? (
          <div className="bg-zinc-800 border border-zinc-700 rounded-xl px-3 py-2.5 text-sm text-zinc-500">Loading numbers...</div>
        ) : twilioNumbers.length === 0 ? (
          <div className="bg-zinc-800 border border-zinc-700 rounded-xl px-3 py-2.5 text-sm text-zinc-500">No Twilio numbers found</div>
        ) : (
          <select
            value={settings.twilio_number || ''}
            onChange={e => onChange({ twilio_number: e.target.value })}
            className={inputClass}
          >
            <option value="">Select a number...</option>
            {twilioNumbers.map(n => (
              <option key={n.phone_number} value={n.phone_number}>
                {n.phone_number}{n.friendly_name ? ` — ${n.friendly_name}` : ''}
              </option>
            ))}
          </select>
        )}
        {settings.twilio_number && (
          <button
            onClick={() => setShowModal(true)}
            className="mt-2 text-xs text-indigo-400 hover:text-indigo-300 transition-colors"
          >
            Show call forwarding codes →
          </button>
        )}
      </div>

      {/* Personal number */}
      <div>
        <label className={labelClass}>Your Personal Number</label>
        <input
          type="tel"
          placeholder="+972501234567"
          value={settings.personal_number || ''}
          onChange={e => onChange({ personal_number: e.target.value })}
          className={inputClass}
        />
        <p className="text-xs text-zinc-600 mt-1.5">E.164 format — used to identify your account.</p>
      </div>

      {/* Timeout */}
      <div>
        <label className={labelClass}>
          Ring Timeout: <span className="text-indigo-400 normal-case">{settings.timeout_seconds || 15}s</span>
        </label>
        <input
          type="range"
          min={5}
          max={60}
          step={5}
          value={settings.timeout_seconds || 15}
          onChange={e => handleTimeoutChange(parseInt(e.target.value))}
          className="w-full accent-indigo-500"
        />
        <div className="flex justify-between text-xs text-zinc-600 mt-1">
          <span>5s</span>
          <span>60s</span>
        </div>
      </div>

      {/* Timezone */}
      <div>
        <label className={labelClass}>Default Timezone</label>
        <select
          value={settings.timezone || 'UTC'}
          onChange={e => onChange({ timezone: e.target.value })}
          className={inputClass}
        >
          <optgroup label="Africa">
            <option value="Africa/Cairo">Cairo (EET)</option>
            <option value="Africa/Johannesburg">Johannesburg (SAST)</option>
            <option value="Africa/Lagos">Lagos (WAT)</option>
          </optgroup>
          <optgroup label="Americas">
            <option value="America/New_York">New York (ET)</option>
            <option value="America/Chicago">Chicago (CT)</option>
            <option value="America/Denver">Denver (MT)</option>
            <option value="America/Los_Angeles">Los Angeles (PT)</option>
            <option value="America/Anchorage">Anchorage (AKT)</option>
            <option value="America/Sao_Paulo">São Paulo (BRT)</option>
            <option value="America/Argentina/Buenos_Aires">Buenos Aires (ART)</option>
            <option value="America/Toronto">Toronto (ET)</option>
            <option value="America/Vancouver">Vancouver (PT)</option>
            <option value="America/Mexico_City">Mexico City (CST)</option>
          </optgroup>
          <optgroup label="Asia / Pacific">
            <option value="Asia/Jerusalem">Jerusalem (IST)</option>
            <option value="Asia/Dubai">Dubai (GST)</option>
            <option value="Asia/Kolkata">Kolkata (IST)</option>
            <option value="Asia/Dhaka">Dhaka (BST)</option>
            <option value="Asia/Bangkok">Bangkok (ICT)</option>
            <option value="Asia/Singapore">Singapore (SGT)</option>
            <option value="Asia/Shanghai">Shanghai (CST)</option>
            <option value="Asia/Tokyo">Tokyo (JST)</option>
            <option value="Asia/Seoul">Seoul (KST)</option>
            <option value="Australia/Sydney">Sydney (AEDT)</option>
            <option value="Pacific/Auckland">Auckland (NZST)</option>
            <option value="Pacific/Honolulu">Honolulu (HST)</option>
          </optgroup>
          <optgroup label="Europe">
            <option value="Europe/London">London (GMT/BST)</option>
            <option value="Europe/Paris">Paris (CET)</option>
            <option value="Europe/Berlin">Berlin (CET)</option>
            <option value="Europe/Helsinki">Helsinki (EET)</option>
            <option value="Europe/Athens">Athens (EET)</option>
            <option value="Europe/Moscow">Moscow (MSK)</option>
            <option value="Europe/Istanbul">Istanbul (TRT)</option>
          </optgroup>
          <optgroup label="Other">
            <option value="UTC">UTC</option>
          </optgroup>
        </select>
        <p className="text-xs text-zinc-600 mt-1.5">
          Used when the caller's country can't be auto-detected.
        </p>
      </div>

      {/* Re-dial notification */}
      {timerNotice && (
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 space-y-2">
          <div className="flex items-start justify-between gap-2">
            <p className="text-sm font-medium text-amber-400">
              Ring timeout changed — re-dial this code to update call forwarding:
            </p>
            <button
              onClick={() => setTimerNotice(null)}
              className="text-amber-600 hover:text-amber-400 text-lg leading-none flex-shrink-0"
              aria-label="Dismiss"
            >
              ×
            </button>
          </div>
          <code className="block font-mono text-base font-bold text-white">{timerNotice}</code>
          <div className="flex gap-2">
            {mobile ? (
              <a
                href={telLink(timerNotice)}
                className="px-4 py-1.5 bg-green-500 hover:bg-green-400 text-white text-xs font-medium rounded-lg transition-colors"
              >
                Dial now
              </a>
            ) : (
              <button
                onClick={() => handleCopy(timerNotice)}
                className="px-4 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs font-medium rounded-lg transition-colors"
              >
                {copied ? 'Copied!' : 'Copy code'}
              </button>
            )}
            <button
              onClick={() => setTimerNotice(null)}
              className="px-4 py-1.5 text-zinc-500 hover:text-zinc-300 text-xs font-medium transition-colors"
            >
              Dismiss
            </button>
          </div>
        </div>
      )}

      {showModal && settings.twilio_number && (
        <ForwardingModal
          twilioNumber={settings.twilio_number}
          timeoutSeconds={settings.timeout_seconds}
          onClose={() => setShowModal(false)}
        />
      )}
    </div>
  )
}

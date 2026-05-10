import { useEffect, useState } from 'react'

function isMobile() {
  return /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent)
}

function telLink(code) {
  // Encode + and # for tel: URI
  return 'tel:' + code.replace('+', '%2B').replace(/#/g, '%23')
}

function CodeRow({ label, code, mobile }) {
  return (
    <div className="flex items-center justify-between py-2 border-b border-gray-100 last:border-0">
      <div>
        <p className="text-xs text-gray-500">{label}</p>
        <code className="text-sm font-mono font-semibold text-gray-800">{code}</code>
      </div>
      {mobile ? (
        <a
          href={telLink(code)}
          className="ml-4 flex-shrink-0 px-3 py-1.5 bg-green-500 hover:bg-green-600 text-white text-xs font-medium rounded-lg transition-colors"
        >
          Dial
        </a>
      ) : (
        <button
          onClick={() => navigator.clipboard?.writeText(code)}
          className="ml-4 flex-shrink-0 px-3 py-1.5 bg-gray-100 hover:bg-gray-200 text-gray-600 text-xs font-medium rounded-lg transition-colors"
          title="Copy to clipboard"
        >
          Copy
        </button>
      )}
    </div>
  )
}

export default function ForwardingModal({ twilioNumber, timeoutSeconds, onClose }) {
  const [mobile] = useState(isMobile())
  const delay = timeoutSeconds || 20

  // Close on Escape
  useEffect(() => {
    const handler = (e) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])

  const codes = [
    { label: 'Forward if unanswered (recommended)', code: `**61*${twilioNumber}*11*${delay}#` },
    { label: 'Forward if busy',                     code: `*67*${twilioNumber}#` },
    { label: 'Forward if unreachable',               code: `*62*${twilioNumber}#` },
  ]

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm">
        {/* Header */}
        <div className="px-6 pt-6 pb-4 border-b border-gray-100">
          <h2 className="text-lg font-bold text-gray-900">Set Up Call Forwarding</h2>
          <p className="text-sm text-gray-500 mt-1">
            {mobile
              ? 'Tap Dial to open each code in your phone dialer, then press Call.'
              : 'Dial these codes from your phone keypad and press Call after each.'}
          </p>
        </div>

        {/* Forwarding codes */}
        <div className="px-6 py-4">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Enable forwarding</p>
          {codes.map(({ label, code }) => (
            <CodeRow key={code} label={label} code={code} mobile={mobile} />
          ))}

          {/* Tip */}
          <p className="text-xs text-gray-400 mt-3">
            💡 Tip: {delay}s delay gives you enough time to answer before the AI picks up.
          </p>
        </div>

        {/* Cancel forwarding */}
        <div className="px-6 py-4 bg-gray-50 rounded-b-2xl border-t border-gray-100">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Disable all forwarding</p>
          <CodeRow label="Remove all call forwarding" code="##004#" mobile={mobile} />
        </div>

        {/* Actions */}
        <div className="px-6 py-4 flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors"
          >
            Done
          </button>
          <button
            onClick={onClose}
            className="px-4 py-2.5 text-gray-500 hover:text-gray-700 text-sm font-medium transition-colors"
          >
            Later
          </button>
        </div>
      </div>
    </div>
  )
}

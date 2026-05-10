import { inputClass, labelClass } from '../styles'

const SUMMARY_LANGUAGES = [
  { value: '',          label: 'Same as conversation (no translation)' },
  { value: 'English',   label: 'English' },
  { value: 'Hebrew',    label: 'Hebrew (עברית)' },
  { value: 'Arabic',    label: 'Arabic (عربي)' },
  { value: 'French',    label: 'French (Français)' },
  { value: 'Spanish',   label: 'Spanish (Español)' },
  { value: 'German',    label: 'German (Deutsch)' },
  { value: 'Russian',   label: 'Russian (Русский)' },
  { value: 'Portuguese',label: 'Portuguese (Português)' },
  { value: 'Italian',   label: 'Italian (Italiano)' },
  { value: 'Chinese',   label: 'Chinese (中文)' },
  { value: 'Japanese',  label: 'Japanese (日本語)' },
]

export default function AISettings({ settings, onChange }) {
  return (
    <div className="bg-zinc-900 rounded-2xl border border-zinc-800 p-5 space-y-5">
      <h2 className="text-sm font-semibold text-white">AI Agent</h2>

      <div>
        <label className={labelClass}>System Prompt</label>
        <textarea
          rows={6}
          placeholder="You are a helpful receptionist assistant. Respond in whatever language the caller uses."
          value={settings.system_prompt || ''}
          onChange={e => onChange({ system_prompt: e.target.value })}
          className={`${inputClass} resize-y`}
        />
        <p className="text-xs text-zinc-600 mt-1.5">Instructions for the AI agent's persona and behavior.</p>
      </div>

      <div>
        <label className={labelClass}>Greeting Message</label>
        <textarea
          rows={3}
          placeholder={`Hi, you've reached the assistant. How can I help?`}
          value={settings.greeting_message || ''}
          onChange={e => onChange({ greeting_message: e.target.value })}
          className={`${inputClass} resize-y`}
          dir="auto"
        />
        <p className="text-xs text-zinc-600 mt-1.5">The first thing the AI says when a call connects.</p>
      </div>

      <div>
        <label className={labelClass}>Translate Summaries To</label>
        <select
          value={settings.summary_language || ''}
          onChange={e => onChange({ summary_language: e.target.value })}
          className={inputClass}
        >
          {SUMMARY_LANGUAGES.map(({ value, label }) => (
            <option key={value} value={value}>{label}</option>
          ))}
        </select>
        <p className="text-xs text-zinc-600 mt-1.5">
          After each call, the summary is translated into this language. Leave blank to keep caller's language.
        </p>
      </div>
    </div>
  )
}

export default function TranscriptBubble({ entry, dark = false }) {
  const isAgent = entry.role === 'agent' || entry.speaker === 'agent' || entry.role === 'assistant'
  return (
    <div className={`flex ${isAgent ? 'justify-start' : 'justify-end'} mb-2`}>
      <div
        className={`max-w-xs lg:max-w-md px-3 py-2 rounded-xl text-sm ${
          isAgent
            ? dark
              ? 'bg-zinc-800 text-zinc-200 rounded-tl-none'
              : 'bg-blue-100 text-blue-900 rounded-tl-none'
            : dark
              ? 'bg-indigo-900/60 text-indigo-100 rounded-tr-none'
              : 'bg-gray-100 text-gray-900 rounded-tr-none'
        }`}
        dir="auto"
      >
        <span className={`block text-xs font-medium mb-1 ${dark ? 'opacity-50' : 'opacity-60'}`}>
          {isAgent ? 'Agent' : 'Caller'}
        </span>
        {entry.message || entry.text || entry.content || JSON.stringify(entry)}
      </div>
    </div>
  )
}

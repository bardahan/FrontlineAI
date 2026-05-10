export default function LoginPage() {
  return (
    <div className="min-h-screen bg-zinc-950 flex items-center justify-center px-4">
      <div className="w-full max-w-sm space-y-8">
        <div className="text-center space-y-3">
          <div className="flex justify-center">
            <span className="w-3 h-3 rounded-full bg-indigo-500 shadow-[0_0_12px_4px_rgba(99,102,241,0.4)]" />
          </div>
          <h1 className="text-2xl font-bold text-white">FrontlineAI</h1>
          <p className="text-sm text-zinc-500">AI Phone Receptionist</p>
        </div>
        <div className="bg-zinc-900 rounded-2xl border border-zinc-800 p-6 space-y-4">
          <a
            href={`${import.meta.env.VITE_API_BASE ?? 'http://localhost:8000'}/auth/login`}
            className="flex items-center justify-center gap-3 w-full px-5 py-3 bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 rounded-xl transition-colors text-sm font-medium text-zinc-200"
          >
            <img src="https://www.google.com/favicon.ico" className="w-4 h-4" alt="" />
            Sign in with Google
          </a>
        </div>
      </div>
    </div>
  )
}

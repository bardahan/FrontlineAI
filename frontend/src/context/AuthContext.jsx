import { createContext, useContext, useState, useEffect } from 'react'
import { getMe, logoutApi } from '../api'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    getMe()
      .then(setUser)
      .catch((err) => {
        console.error('[AuthContext] Failed to fetch user:', err)
        setUser(null)
      })
      .finally(() => setLoading(false))
  }, [])

  const logout = async () => {
    await logoutApi().catch((err) => console.error('[AuthContext] Logout failed:', err))
    setUser(null)
  }

  return (
    <AuthContext.Provider value={{ user, loading, logout }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => useContext(AuthContext)

import { createContext, useCallback, useContext, useEffect, useState } from 'react'
import { api, getToken, setToken } from './api'

const UserContext = createContext(null)

/** Keeps the signed-in user available everywhere: const { user } = useUser() */
export function UserProvider({ children }) {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)
  const [offline, setOffline] = useState(false)

  const refresh = useCallback(async () => {
    if (!getToken()) {
      setUser(null)
      setLoading(false)
      return null
    }
    try {
      const me = await api('/me')
      setUser(me)
      setOffline(false)
      return me
    } catch (e) {
      if (e.status === 401) {
        setToken(null)
        setUser(null)
      } else {
        setOffline(true)
      }
      return null
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    refresh()
  }, [refresh])

  const signIn = (token, me) => {
    setToken(token)
    setUser(me)
  }
  const signOut = () => {
    // Ends this device's session on the server too (best effort: we sign out locally either way)
    if (getToken()) api('/auth/logout', { method: 'POST' }).catch(() => {})
    setToken(null)
    setUser(null)
  }

  return (
    <UserContext.Provider value={{ user, setUser, loading, offline, refresh, signIn, signOut }}>
      {children}
    </UserContext.Provider>
  )
}

export function useUser() {
  return useContext(UserContext)
}

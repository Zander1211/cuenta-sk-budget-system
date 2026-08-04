import { createContext, useContext, useEffect, useMemo, useState } from 'react'
import { useAuth } from './AuthContext'
import { supabase } from '../supabase/supabaseClient'

const NotificationContext = createContext(null)
const STORAGE_KEY = 'cuenta.notifications.v2'

function getStoredNotifications() {
  if (typeof window === 'undefined') return []
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY)
    return stored ? JSON.parse(stored) : []
  } catch {
    return []
  }
}

function NotificationProvider({ children }) {
  const { role, isAuthenticated } = useAuth()
  const [notifications, setNotifications] = useState(() => getStoredNotifications())

  useEffect(() => {
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(notifications))
    }
  }, [notifications])

  useEffect(() => {
    function handleStorageChange(event) {
      if (event.key === STORAGE_KEY && event.newValue) {
        try {
          setNotifications(JSON.parse(event.newValue))
        } catch {
          // ignore parsing error
        }
      }
    }
    
    if (typeof window !== 'undefined') {
      window.addEventListener('storage', handleStorageChange)
      return () => window.removeEventListener('storage', handleStorageChange)
    }
  }, [])

  useEffect(() => {
    if (!isAuthenticated) return
    let mounted = true

    async function loadServerNotifications() {
      const { data, error } = await supabase
        .from('notifications')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(100)

      // The table is introduced by the approval migration. Older local
      // environments can continue using local notifications until it is run.
      if (error || !mounted) return

      const serverNotifications = (data || []).map((item) => ({
        id: item.id,
        type: item.type,
        title: item.title,
        message: item.message || '',
        timestamp: item.created_at,
        read: false,
        actorRole: item.actor_role || '',
        serverBacked: true,
      }))

      setNotifications((prev) => [
        ...serverNotifications,
        ...prev.filter((item) =>
          !serverNotifications.some((serverItem) => serverItem.id === item.id)
        ),
      ])
    }

    loadServerNotifications()
    const channel = supabase
      .channel('notifications-sync')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'notifications' },
        loadServerNotifications
      )
      .subscribe()

    return () => {
      mounted = false
      supabase.removeChannel(channel)
    }
  }, [isAuthenticated, role])

  const visibleNotifications = useMemo(() => {
    return notifications.filter((n) => n.actorRole !== role)
  }, [notifications, role])

  const unreadCount = useMemo(
    () => visibleNotifications.filter((n) => !n.read).length,
    [visibleNotifications]
  )

  function addNotification({ type = 'system', title, message }) {
    if (!title) return

    const id =
      typeof crypto !== 'undefined' && crypto.randomUUID
        ? crypto.randomUUID()
        : `${Date.now()}`

    setNotifications((prev) => [
      {
        id,
        type,
        title,
        message: message || '',
        timestamp: new Date().toISOString(),
        read: false,
        actorRole: role,
      },
      ...prev,
    ])
  }

  function markAsRead(notificationId) {
    setNotifications((prev) =>
      prev.map((n) => (n.id === notificationId ? { ...n, read: true } : n))
    )
  }

  function markAllAsRead() {
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })))
  }

  function clearAll() {
    setNotifications([])
  }

  const value = useMemo(
    () => ({
      notifications: visibleNotifications,
      unreadCount,
      addNotification,
      markAsRead,
      markAllAsRead,
      clearAll,
    }),
    [visibleNotifications, unreadCount, role]
  )

  return (
    <NotificationContext.Provider value={value}>
      {children}
    </NotificationContext.Provider>
  )
}

function useNotifications() {
  const context = useContext(NotificationContext)
  if (!context) {
    throw new Error('useNotifications must be used within NotificationProvider')
  }
  return context
}

export { NotificationProvider, useNotifications }

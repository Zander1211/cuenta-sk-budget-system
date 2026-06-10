import { createContext, useContext, useEffect, useMemo, useState } from 'react'
import { useAuth } from './AuthContext'

const NotificationContext = createContext(null)
const STORAGE_KEY = 'cuenta.notifications'

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
  const { role } = useAuth()
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

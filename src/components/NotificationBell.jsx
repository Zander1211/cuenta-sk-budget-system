import { useEffect, useRef, useState } from 'react'
import { Bell, Check, CheckCheck, Trash2, X } from 'lucide-react'
import { useNotifications } from '../context/NotificationContext'

function timeAgo(timestamp) {
  const now = Date.now()
  const then = new Date(timestamp).getTime()
  const diffSec = Math.floor((now - then) / 1000)

  if (diffSec < 60) return 'Just now'
  const diffMin = Math.floor(diffSec / 60)
  if (diffMin < 60) return `${diffMin}m ago`
  const diffHr = Math.floor(diffMin / 60)
  if (diffHr < 24) return `${diffHr}h ago`
  const diffDay = Math.floor(diffHr / 24)
  if (diffDay < 7) return `${diffDay}d ago`
  return new Date(timestamp).toLocaleDateString()
}

const typeIcons = {
  approval: '✅',
  rejection: '❌',
  archive: '📦',
  system: '🔔',
}

function NotificationBell() {
  const { notifications, unreadCount, markAsRead, markAllAsRead, clearAll } =
    useNotifications()
  const [isOpen, setIsOpen] = useState(false)
  const dropdownRef = useRef(null)
  const bellRef = useRef(null)

  // Close on outside click
  useEffect(() => {
    function handleClickOutside(e) {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(e.target) &&
        bellRef.current &&
        !bellRef.current.contains(e.target)
      ) {
        setIsOpen(false)
      }
    }
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside)
    }
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [isOpen])

  function handleBellClick() {
    setIsOpen((prev) => !prev)
  }

  function handleNotificationClick(notification) {
    if (!notification.read) {
      markAsRead(notification.id)
    }
  }

  return (
    <div className="notification-bell-wrap">
      <button
        ref={bellRef}
        className="icon-button notification-bell-btn"
        type="button"
        aria-label="Notifications"
        onClick={handleBellClick}
      >
        <Bell size={18} />
        {unreadCount > 0 ? (
          <span className="notification-badge">{unreadCount > 99 ? '99+' : unreadCount}</span>
        ) : null}
      </button>

      {isOpen ? (
        <div ref={dropdownRef} className="notification-dropdown">
          <div className="notification-dropdown-header">
            <h3>Notifications</h3>
            <div className="notification-header-actions">
              {unreadCount > 0 ? (
                <button
                  type="button"
                  className="notification-action-btn"
                  onClick={markAllAsRead}
                  title="Mark all as read"
                >
                  <CheckCheck size={14} />
                  <span>Read all</span>
                </button>
              ) : null}
              {notifications.length > 0 ? (
                <button
                  type="button"
                  className="notification-action-btn"
                  onClick={clearAll}
                  title="Clear all"
                >
                  <Trash2 size={14} />
                </button>
              ) : null}
              <button
                type="button"
                className="notification-action-btn"
                onClick={() => setIsOpen(false)}
                title="Close"
              >
                <X size={14} />
              </button>
            </div>
          </div>

          <div className="notification-dropdown-body">
            {notifications.length ? (
              notifications.slice(0, 30).map((notification) => (
                <button
                  key={notification.id}
                  type="button"
                  className={`notification-item ${notification.read ? 'is-read' : 'is-unread'}`}
                  onClick={() => handleNotificationClick(notification)}
                >
                  <span className="notification-item-icon">
                    {typeIcons[notification.type] || '🔔'}
                  </span>
                  <div className="notification-item-content">
                    <span className="notification-item-title">{notification.title}</span>
                    {notification.message ? (
                      <span className="notification-item-message">{notification.message}</span>
                    ) : null}
                    <span className="notification-item-time">{timeAgo(notification.timestamp)}</span>
                  </div>
                  {!notification.read ? (
                    <span className="notification-unread-dot" />
                  ) : (
                    <Check size={14} className="notification-read-check" />
                  )}
                </button>
              ))
            ) : (
              <div className="notification-empty">
                <Bell size={32} strokeWidth={1} />
                <p>No notifications yet</p>
              </div>
            )}
          </div>
        </div>
      ) : null}
    </div>
  )
}

export default NotificationBell

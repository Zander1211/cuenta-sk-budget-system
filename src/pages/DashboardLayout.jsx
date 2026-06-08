import { useState } from 'react'
import { NavLink, Navigate, Outlet, useNavigate } from 'react-router-dom'
import { Bell, Menu } from 'lucide-react'
import { logoutUser } from '../services/authService'
import { useAuditLog } from '../context/AuditLogContext'
import { useAuth } from '../context/AuthContext'

const navItems = [
  {
    label: 'Main Dashboard',
    path: '/dashboard',
    end: true,
    roles: ['SK Chairman', 'SK Treasurer', 'SK Kagawad', 'Barangay Treasurer'],
  },
  {
    label: 'Budgets',
    path: '/dashboard/budgets',
    roles: ['SK Chairman', 'SK Treasurer', 'SK Kagawad', 'Barangay Treasurer'],
  },
  {
    label: 'Projects',
    path: '/dashboard/projects',
    roles: ['SK Chairman', 'SK Treasurer'],
  },
  {
    label: 'Approved Projects',
    path: '/dashboard/approved-projects',
    roles: ['SK Kagawad', 'Barangay Treasurer'],
  },
  {
    label: 'Expenses',
    path: '/dashboard/expenses',
    roles: ['SK Chairman', 'SK Treasurer'],
  },
  {
    label: 'Request',
    path: '/dashboard/request',
    roles: ['SK Treasurer'],
  },
  {
    label: 'Documents',
    path: '/dashboard/documents',
    roles: ['SK Chairman', 'SK Treasurer'],
  },
  {
    label: 'Approvals',
    path: '/dashboard/approvals',
    roles: ['SK Chairman'],
  },
  {
    label: 'AI Analysis',
    path: '/dashboard/ai-analysis',
    roles: ['SK Chairman', 'SK Treasurer'],
  },
  {
    label: 'Report',
    path: '/dashboard/reports',
    roles: ['SK Chairman', 'SK Treasurer'],
  },
  {
    label: 'Audit Logs',
    path: '/dashboard/audit-logs',
    roles: ['SK Chairman'],
  },
  {
    label: 'User Management',
    path: '/dashboard/user-management',
    roles: ['SK Chairman'],
  },
  {
    label: 'Profile',
    path: '/dashboard/profile',
    roles: ['SK Chairman', 'SK Treasurer', 'SK Kagawad', 'Barangay Treasurer'],
  },
]

function DashboardLayout() {
  const navigate = useNavigate()
  const { addLog } = useAuditLog()
  const { role, isLoading, isAuthenticated, profileName, profileSurname, refreshSession } = useAuth()
  const [isSidebarOpen, setSidebarOpen] = useState(false)

  if (isLoading) {
    return null
  }

  if (!isAuthenticated) {
    return <Navigate to="/" replace />
  }

  const visibleItems = navItems.filter((item) => item.roles.includes(role))
  const fullName = profileName || ''
  const surname =
    profileSurname || (fullName ? fullName.split(' ').filter(Boolean).slice(-1)[0] : '') || ''
  const sidebarRole = [role, surname].filter(Boolean).join(', ')

  function handleNavClick(label) {
    addLog({ action: `Opened ${label} page` })
    setSidebarOpen(false)
  }

  function handleNotifications() {
    addLog({ action: 'Opened notifications' })
  }

  async function handleLogout() {
    await logoutUser()
    await refreshSession()
    addLog({ action: 'Logged out' })
    setSidebarOpen(false)
    navigate('/')
  }

  return (
    <div className="dashboard">
      <div className="dashboard-shell">
        <div className="dashboard-mobile-header">
          <button
            className="mobile-icon-button"
            type="button"
            onClick={() => setSidebarOpen((open) => !open)}
            aria-label="Toggle menu"
          >
            <Menu size={20} />
          </button>
          <div className="mobile-header-title">
            <span className="mobile-header-role">{role}</span>
            <span className="mobile-header-subtitle">Dashboard</span>
          </div>
          <button
            className="mobile-icon-button"
            type="button"
            onClick={handleNotifications}
            aria-label="Notifications"
          >
            <Bell size={20} />
          </button>
        </div>

        {isSidebarOpen ? (
          <button
            className="sidebar-scrim"
            type="button"
            onClick={() => setSidebarOpen(false)}
            aria-label="Close menu"
          />
        ) : null}

        <div className={`dashboard-layout ${isSidebarOpen ? 'is-sidebar-open' : ''}`}>
          <aside className="dashboard-sidebar">
            <div className="sidebar-brand">
              <span className="brand-chip">Cuenta</span>
              <span className="sidebar-role">{sidebarRole}</span>
            </div>
            <nav className="sidebar-nav" aria-label="Dashboard sections">
              {visibleItems.map((item) => (
                <NavLink
                  key={item.path}
                  to={item.path}
                  end={item.end}
                  className={({ isActive }) =>
                    `sidebar-tab ${isActive ? 'is-active' : ''}`
                  }
                  onClick={() => handleNavClick(item.label)}
                >
                  {item.label}
                </NavLink>
              ))}
            </nav>
            <div className="sidebar-footer">
              <button
                className="logout-button"
                type="button"
                onClick={handleLogout}
              >
                Logout
              </button>
            </div>
          </aside>

          <main className="dashboard-main">
            <Outlet />
          </main>
        </div>
      </div>
    </div>
  )
}

export default DashboardLayout

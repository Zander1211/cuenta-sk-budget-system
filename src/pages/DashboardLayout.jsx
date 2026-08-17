import { useState } from 'react'
import { NavLink, Navigate, Outlet } from 'react-router-dom'
import {
  Menu,
  ChevronsLeft,
  ChevronsRight,
  LayoutDashboard,
  Wallet,
  Briefcase,
  CheckSquare,
  Receipt,
  FileText,
  Files,
  ThumbsUp,
  BarChart3,
  ScrollText,
  Users,
  UserCircle,
  LogOut,
  DatabaseBackup
} from 'lucide-react'
import { logoutUser } from '../services/authService'
import { useAuditLog } from '../context/AuditLogContext'
import { useAuth } from '../context/AuthContext'
import NotificationBell from '../components/NotificationBell'

const SIDEBAR_COLLAPSE_KEY = 'cuenta.sidebarCollapsed'

const navItems = [
  {
    label: 'Main Dashboard',
    path: '/dashboard',
    end: true,
    roles: ['SK Chairman', 'SK Treasurer', 'SK Kagawad', 'Barangay Treasurer'],
    icon: LayoutDashboard
  },
  {
    label: 'Budgets',
    path: '/dashboard/budgets',
    roles: ['SK Chairman', 'SK Treasurer', 'SK Kagawad', 'Barangay Treasurer'],
    icon: Wallet
  },
  {
    label: 'Projects & Events',
    path: '/dashboard/projects-events',
    roles: ['SK Chairman', 'SK Treasurer', 'SK Kagawad', 'Barangay Treasurer'],
    icon: Briefcase
  },
  {
    label: 'Payroll',
    path: '/dashboard/payroll',
    roles: ['SK Chairman', 'SK Treasurer', 'SK Kagawad', 'Barangay Treasurer'],
    icon: CheckSquare
  },
  {
    label: 'Expense Summary',
    path: '/dashboard/expense-summary',
    roles: ['SK Kagawad', 'Barangay Treasurer'],
    icon: Receipt
  },
  {
    label: 'Expenses',
    path: '/dashboard/expenses',
    roles: ['SK Chairman', 'SK Treasurer'],
    icon: Receipt
  },
  {
    label: 'Request',
    path: '/dashboard/request',
    roles: ['SK Treasurer'],
    icon: FileText
  },
  {
    label: 'Documents',
    path: '/dashboard/documents',
    roles: ['SK Chairman', 'SK Treasurer', 'SK Kagawad', 'Barangay Treasurer'],
    icon: Files
  },
  {
    label: 'Request Review',
    path: '/dashboard/approvals',
    roles: ['SK Chairman'],
    icon: ThumbsUp
  },
  {
    label: 'Analysis',
    path: '/dashboard/analysis',
    roles: ['SK Chairman', 'SK Treasurer', 'SK Kagawad', 'Barangay Treasurer'],
    icon: BarChart3
  },
  {
    label: 'Receipts',
    path: '/dashboard/receipts',
    roles: ['SK Chairman', 'SK Treasurer', 'SK Kagawad', 'Barangay Treasurer'],
    icon: ScrollText
  },
  {
    label: 'Audit Trail',
    path: '/dashboard/audit-trail',
    roles: ['SK Chairman'],
    icon: FileText
  },
  {
    label: 'Backup & Restore',
    path: '/dashboard/backup-restore',
    roles: ['SK Chairman'],
    icon: DatabaseBackup
  },
  {
    label: 'User Management',
    path: '/dashboard/user-management',
    roles: ['SK Chairman'],
    icon: Users
  },
  {
    label: 'Profile',
    path: '/dashboard/profile',
    roles: ['SK Chairman', 'SK Treasurer', 'SK Kagawad', 'Barangay Treasurer'],
    icon: UserCircle
  },
]

function DashboardLayout() {
  const { addLog } = useAuditLog()
  const { role, isAuthenticated, profileName, profileSurname, refreshSession, user } = useAuth()
  const [isSidebarOpen, setSidebarOpen] = useState(false)
  const [isLogoutModalOpen, setIsLogoutModalOpen] = useState(false)
  const [isCollapsed, setIsCollapsed] = useState(() => {
    if (typeof window === 'undefined') return false
    return window.localStorage.getItem(SIDEBAR_COLLAPSE_KEY) === 'true'
  })

  function toggleCollapsed() {
    setIsCollapsed((prev) => {
      const next = !prev
      window.localStorage.setItem(SIDEBAR_COLLAPSE_KEY, String(next))
      return next
    })
  }

  if (!isAuthenticated) {
    return <Navigate to="/" replace />
  }

  const visibleItems = navItems.filter((item) => item.roles.includes(role))
  const fullName = profileName || ''
  const surname =
    profileSurname || (fullName ? fullName.split(' ').filter(Boolean).slice(-1)[0] : '') || ''
  const sidebarRole = [role, surname].filter(Boolean).join(', ')
  const avatarUrl = user?.user_metadata?.avatar_url || ''
  const initials = (fullName || role || 'U')
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('') || 'U'

  function handleNavClick() {
    setSidebarOpen(false)
  }

  function confirmLogout() {
    setIsLogoutModalOpen(true)
  }

  async function handleLogout() {
    setIsLogoutModalOpen(false)
    addLog({
      action: 'User Logout',
      actionType: 'User Logout',
      module: 'Authentication',
      recordType: 'User',
      description: `${profileName || role} logged out of the system`,
      status: 'Success',
    })
    await logoutUser()
    await refreshSession()
    setSidebarOpen(false)
  }

  return (
    <div className="dashboard">
      <div className="dashboard-shell">
        <div
          className={`dashboard-mobile-header ${isSidebarOpen ? 'is-hidden' : ''}`}
          aria-hidden={isSidebarOpen}
        >
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
          {['SK Chairman', 'SK Treasurer'].includes(role) && <NotificationBell />}
        </div>

        <div className={`dashboard-layout ${isSidebarOpen ? 'is-sidebar-open' : ''}`}>
          <button
            className="sidebar-scrim"
            type="button"
            onClick={() => setSidebarOpen(false)}
            aria-label="Close menu"
          />
          <aside className={`dashboard-sidebar ${isCollapsed ? 'is-collapsed' : ''}`} data-lenis-prevent>
            <button
              type="button"
              className="sidebar-collapse-toggle"
              onClick={toggleCollapsed}
              aria-label={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
              title={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            >
              {isCollapsed ? <ChevronsRight size={14} /> : <ChevronsLeft size={14} />}
            </button>
            <div className="sidebar-brand">
              <span className="brand-chip">C</span>
              <div className="sidebar-brand-text">
                <span style={{ fontWeight: 700, letterSpacing: '0.2rem' }}>CUENTA</span>
                <span className="sidebar-role">{sidebarRole}</span>
              </div>
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
                  title={isCollapsed ? item.label : undefined}
                >
                  <item.icon size={20} className="nav-icon" />
                  <span className="nav-label">{item.label}</span>
                </NavLink>
              ))}
            </nav>
            <div className="sidebar-footer">
              <div className="sidebar-profile">
                {avatarUrl ? (
                  <img src={avatarUrl} alt="" className="sidebar-profile-avatar" />
                ) : (
                  <span className="sidebar-profile-avatar" aria-hidden="true">{initials}</span>
                )}
                <div className="sidebar-profile-info">
                  <span className="sidebar-profile-name">{fullName || role}</span>
                  <span className="sidebar-profile-role">{role}</span>
                </div>
              </div>
              <button
                className="logout-button"
                type="button"
                onClick={confirmLogout}
                title={isCollapsed ? 'Logout' : undefined}
              >
                <LogOut size={20} className="nav-icon" />
                <span className="nav-label">Logout</span>
              </button>
            </div>
          </aside>

          {/* Mobile Bottom Navigation Bar */}
          <nav
            className={`mobile-bottom-nav ${isSidebarOpen ? 'is-nav-hidden' : ''}`}
            aria-label="Quick navigation"
          >
            {visibleItems.slice(0, 4).map((item) => (
              <NavLink
                key={item.path}
                to={item.path}
                end={item.end}
                className={({ isActive }) =>
                  `mobile-bottom-nav-item ${isActive ? 'is-active' : ''}`
                }
                onClick={handleNavClick}
              >
                <item.icon size={20} />
                <span>{item.label.split(' ')[0]}</span>
              </NavLink>
            ))}
            <button
              className="mobile-bottom-nav-item"
              type="button"
              onClick={() => setSidebarOpen((open) => !open)}
              aria-label="More pages"
            >
              <Menu size={20} />
              <span>More</span>
            </button>
          </nav>

          <main className="dashboard-main">
            <Outlet />
          </main>
        </div>
      </div>

      {isLogoutModalOpen && (
        <div className="modal-overlay">
          <div className="modal-content" style={{ maxWidth: '400px' }}>
            <div className="modal-header">
              <h2>Confirm Logout</h2>
            </div>
            <div className="modal-body" style={{ margin: '16px 0' }}>
              <p>Are you sure you want to log out?</p>
            </div>
            <div className="modal-footer" style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
              <button
                type="button"
                className="secondary-button"
                onClick={() => setIsLogoutModalOpen(false)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="primary-button"
                style={{ backgroundColor: '#ef4444', color: 'white', borderColor: '#ef4444' }}
                onClick={handleLogout}
              >
                Log Out
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default DashboardLayout

import { useState } from 'react'
import { NavLink, Navigate, Outlet, useNavigate } from 'react-router-dom'
import {
  Bell,
  Menu,
  LayoutDashboard,
  Wallet,
  Briefcase,
  CheckSquare,
  Receipt,
  FileText,
  Files,
  ThumbsUp,
  Bot,
  ScrollText,
  Users,
  UserCircle,
  LogOut,
  DatabaseBackup
} from 'lucide-react'
import { logoutUser } from '../services/authService'
import { useAuditLog } from '../context/AuditLogContext'
import { useAuth } from '../context/AuthContext'

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
    label: 'Projects',
    path: '/dashboard/projects',
    roles: ['SK Chairman', 'SK Treasurer', 'SK Kagawad', 'Barangay Treasurer'],
    icon: Briefcase
  },
  {
    label: 'Events',
    path: '/dashboard/events',
    roles: ['SK Chairman', 'SK Treasurer', 'SK Kagawad', 'Barangay Treasurer'],
    icon: CheckSquare
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
    label: 'AI Analysis',
    path: '/dashboard/ai-analysis',
    roles: ['SK Chairman', 'SK Treasurer', 'Barangay Treasurer', 'SK Kagawad'],
    icon: Bot
  },
  {
    label: 'Receipts',
    path: '/dashboard/receipts',
    roles: ['SK Chairman', 'SK Treasurer'],
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
  const navigate = useNavigate()
  const { addLog } = useAuditLog()
  const { role, isAuthenticated, profileName, profileSurname, refreshSession } = useAuth()
  const [isSidebarOpen, setSidebarOpen] = useState(false)
  const [isLogoutModalOpen, setIsLogoutModalOpen] = useState(false)

  if (!isAuthenticated) {
    return <Navigate to="/" replace />
  }

  const visibleItems = navItems.filter((item) => item.roles.includes(role))
  const fullName = profileName || ''
  const surname =
    profileSurname || (fullName ? fullName.split(' ').filter(Boolean).slice(-1)[0] : '') || ''
  const sidebarRole = [role, surname].filter(Boolean).join(', ')

  function handleNavClick() {
    setSidebarOpen(false)
  }

  function handleNotifications() {
    // no-op audit for notification panel open
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
          {['SK Chairman', 'SK Treasurer'].includes(role) && (
            <button
              className="mobile-icon-button"
              type="button"
              onClick={handleNotifications}
              aria-label="Notifications"
            >
              <Bell size={20} />
            </button>
          )}
        </div>

        <div className={`dashboard-layout ${isSidebarOpen ? 'is-sidebar-open' : ''}`}>
          <button
            className="sidebar-scrim"
            type="button"
            onClick={() => setSidebarOpen(false)}
            aria-label="Close menu"
          />
          <aside className="dashboard-sidebar">
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
                >
                  <item.icon size={20} className="nav-icon" />
                  <span className="nav-label">{item.label}</span>
                </NavLink>
              ))}
            </nav>
            <div className="sidebar-footer">
              <button
                className="logout-button"
                type="button"
                onClick={confirmLogout}
              >
                <LogOut size={20} className="nav-icon" />
                <span className="nav-label">Logout</span>
              </button>
            </div>
          </aside>

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

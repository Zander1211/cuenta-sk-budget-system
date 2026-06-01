import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import LoginPage from './pages/LoginPage'
import DashboardLayout from './pages/DashboardLayout'
import MainDashboardPage from './pages/MainDashboardPage'
import BudgetsPage from './pages/BudgetsPage'
import ProjectsPage from './pages/ProjectsPage'
import ExpensesPage from './pages/ExpensesPage'
import RequestPage from './pages/RequestPage'
import DocumentsPage from './pages/DocumentsPage'
import ApprovalsPage from './pages/ApprovalsPage'
import ArchivedRequestsPage from './pages/ArchivedRequestsPage'
import AiAnalysisPage from './pages/AiAnalysisPage'
import ReportsPage from './pages/ReportsPage'
import AuditLogsPage from './pages/AuditLogsPage'
import UserManagementPage from './pages/UserManagementPage'
import ProfilePage from './pages/ProfilePage'
import { AuditLogProvider } from './context/AuditLogContext'
import { BudgetProvider } from './context/BudgetContext'
import { AuthProvider } from './context/AuthContext'
import ChatWidget from './components/ChatWidget'

function App() {
  return (
    <AuthProvider>
      <AuditLogProvider>
        <BudgetProvider>
          <BrowserRouter>
            <Routes>
              <Route path="/" element={<LoginPage />} />
              <Route path="/dashboard" element={<DashboardLayout />}>
                <Route index element={<MainDashboardPage />} />
                <Route path="budgets" element={<BudgetsPage />} />
                <Route path="projects" element={<ProjectsPage />} />
                <Route path="expenses" element={<ExpensesPage />} />
                <Route path="request" element={<RequestPage />} />
                <Route path="documents" element={<DocumentsPage />} />
                <Route path="approvals" element={<ApprovalsPage />} />
                <Route path="archive" element={<ArchivedRequestsPage />} />
                <Route path="ai-analysis" element={<AiAnalysisPage />} />
                <Route path="reports" element={<ReportsPage />} />
                <Route path="audit-logs" element={<AuditLogsPage />} />
                <Route path="user-management" element={<UserManagementPage />} />
                <Route path="profile" element={<ProfilePage />} />
              </Route>
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
            <ChatWidget />
          </BrowserRouter>
        </BudgetProvider>
      </AuditLogProvider>
    </AuthProvider>
  )
}

export default App
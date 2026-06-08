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
import AiAnalysisPage from './pages/AiAnalysisPage'
import ReportsPage from './pages/ReportsPage'
import AuditLogsPage from './pages/AuditLogsPage'
import UserManagementPage from './pages/UserManagementPage'
import ProfilePage from './pages/ProfilePage'
import BudgetRequestsPage from './pages/BudgetRequestsPage'
import ReceiptReportsPage from './pages/ReceiptReportsPage'
import NarrativeReportPage from './pages/NarrativeReportPage'
import AnnualReportPage from './pages/AnnualReportPage'
import ApprovedProjectsPage from './pages/ApprovedProjectsPage'
import UpdateDetailsPage from './pages/UpdateDetailsPage'
import ChangePasswordPage from './pages/ChangePasswordPage'
import UpdateOtpPage from './pages/UpdateOtpPage'
import UpdateEmailPage from './pages/UpdateEmailPage'
import { AuditLogProvider } from './context/AuditLogContext'
import { BudgetProvider } from './context/BudgetContext'
import { AuthProvider } from './context/AuthContext'
import ChatWidget from './components/ChatWidget'
import { NotificationProvider } from './context/NotificationContext'

function App() {
  return (
    <AuthProvider>
      <AuditLogProvider>
        <NotificationProvider>
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
                <Route path="ai-analysis" element={<AiAnalysisPage />} />
                <Route path="reports" element={<ReportsPage />} />
                <Route path="audit-logs" element={<AuditLogsPage />} />
                <Route path="user-management" element={<UserManagementPage />} />
                <Route path="budget-requests" element={<BudgetRequestsPage />} />
                <Route path="approved-projects" element={<ApprovedProjectsPage />} />
                <Route path="receipt-reports" element={<ReceiptReportsPage />} />
                <Route path="narrative-report" element={<NarrativeReportPage />} />
                <Route path="annual-report" element={<AnnualReportPage />} />
                <Route path="profile">
                  <Route index element={<ProfilePage />} />
                  <Route path="update-details" element={<UpdateDetailsPage />} />
                  <Route path="change-password" element={<ChangePasswordPage />} />
                  <Route path="update-otp" element={<UpdateOtpPage />} />
                  <Route path="update-email" element={<UpdateEmailPage />} />
                </Route>
              </Route>
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
            <ChatWidget />
          </BrowserRouter>
          </BudgetProvider>
        </NotificationProvider>
      </AuditLogProvider>
    </AuthProvider>
  )
}

export default App
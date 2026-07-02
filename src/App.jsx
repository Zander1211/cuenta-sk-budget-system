import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { useAuth, AuthProvider } from './context/AuthContext'
import LoadingScreen from './components/LoadingScreen'
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
import ReceiptsPage from './pages/ReceiptsPage'
import ReceiptDetailsPage from './pages/ReceiptDetailsPage'
import AuditTrailPage from './pages/AuditTrailPage'
import BackupRestorePage from './pages/BackupRestorePage'
import UserManagementPage from './pages/UserManagementPage'
import ProfilePage from './pages/ProfilePage'
import BudgetRequestsPage from './pages/BudgetRequestsPage'
import NarrativeReportPage from './pages/NarrativeReportPage'
import AnnualReportPage from './pages/AnnualReportPage'
import ExpenseSummaryPage from './pages/ExpenseSummaryPage'
import NewRequestPage from './pages/NewRequestPage'
import EventsPage from './pages/EventsPage'
import PayrollPage from './pages/PayrollPage'
import UpdateDetailsPage from './pages/UpdateDetailsPage'
import ChangePasswordPage from './pages/ChangePasswordPage'
import UpdateOtpPage from './pages/UpdateOtpPage'
import UpdateEmailPage from './pages/UpdateEmailPage'
import { AuditLogProvider } from './context/AuditLogContext'
import { BudgetProvider } from './context/BudgetContext'
import { BackupRestoreProvider } from './context/BackupRestoreContext'
import { DocumentProvider } from './context/DocumentContext'
import ChatWidget from './components/ChatWidget'
import { NotificationProvider } from './context/NotificationContext'

function AppRoutes() {
  const { isLoading } = useAuth()

  if (isLoading) {
    return <LoadingScreen />
  }

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<LoginPage />} />
        <Route path="/dashboard" element={<DashboardLayout />}>
          <Route index element={<MainDashboardPage />} />
          <Route path="budgets" element={<BudgetsPage />} />
          <Route path="projects" element={<ProjectsPage />} />
          <Route path="expenses" element={<ExpensesPage />} />
          <Route path="request" element={<RequestPage />} />
          <Route path="request/new" element={<NewRequestPage />} />
          <Route path="documents" element={<DocumentsPage />} />
          <Route path="approvals" element={<ApprovalsPage />} />
          <Route path="ai-analysis" element={<AiAnalysisPage />} />
          <Route path="receipts" element={<ReceiptsPage />} />
          <Route path="audit-trail" element={<AuditTrailPage />} />
          <Route path="backup-restore" element={<BackupRestorePage />} />
          <Route path="user-management" element={<UserManagementPage />} />
          <Route path="budget-requests" element={<BudgetRequestsPage />} />
          <Route path="events" element={<EventsPage />} />
          <Route path="payroll" element={<PayrollPage />} />
          <Route path="expense-summary" element={<ExpenseSummaryPage />} />
          <Route path="receipt-details" element={<ReceiptDetailsPage />} />
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
  )
}

function App() {
  return (
    <AuthProvider>
      <AuditLogProvider>
        <NotificationProvider>
          <BudgetProvider>
            <BackupRestoreProvider>
              <DocumentProvider>
                <AppRoutes />
              </DocumentProvider>
            </BackupRestoreProvider>
          </BudgetProvider>
        </NotificationProvider>
      </AuditLogProvider>
    </AuthProvider>
  )
}

export default App
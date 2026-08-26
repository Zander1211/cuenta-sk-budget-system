import { lazy, Suspense } from 'react'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { useAuth, AuthProvider } from './context/AuthContext'
import LoadingScreen from './components/LoadingScreen'
import LoginPage from './pages/LoginPage'
import DashboardLayout from './pages/DashboardLayout'
import MainDashboardPage from './pages/MainDashboardPage'
import BudgetsPage from './pages/BudgetsPage'
import ProjectsEventsPage from './pages/ProjectsEventsPage'
import ExpensesPage from './pages/ExpensesPage'
import RequestPage from './pages/RequestPage'
import DocumentsPage from './pages/DocumentsPage'
import ApprovalsPage from './pages/ApprovalsPage'
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
import PayrollPage from './pages/PayrollPage'
import UpdateDetailsPage from './pages/UpdateDetailsPage'
import BiodataPage from './pages/BiodataPage'
import ChangePasswordPage from './pages/ChangePasswordPage'
import UpdateOtpPage from './pages/UpdateOtpPage'
import UpdateEmailPage from './pages/UpdateEmailPage'
import { AuditLogProvider } from './context/AuditLogContext'
import { BudgetProvider } from './context/BudgetContext'
import { BackupRestoreProvider } from './context/BackupRestoreContext'
import { DocumentProvider } from './context/DocumentContext'
import ChatWidget from './components/ChatWidget'
import SmoothScroll, { ScrollToTop } from './components/SmoothScroll'
import RouteErrorBoundary from './components/RouteErrorBoundary'
import { NotificationProvider } from './context/NotificationContext'
import PublicTransparencyPage from './pages/PublicTransparencyPage'

// Analysis module (lazy-loaded so its charts/hooks don't weigh down other routes)
const AnalysisOverviewPage = lazy(() => import('./pages/analysis/AnalysisOverviewPage'))
const BudgetVsActualPage = lazy(() => import('./pages/analysis/BudgetVsActualPage'))
const ExpensesByCategoryPage = lazy(() => import('./pages/analysis/ExpensesByCategoryPage'))
const MonthlySpendingPage = lazy(() => import('./pages/analysis/MonthlySpendingPage'))
const BudgetUtilizationPage = lazy(() => import('./pages/analysis/BudgetUtilizationPage'))
const CategoryBudgetDistributionPage = lazy(() => import('./pages/analysis/CategoryBudgetDistributionPage'))

function AppRoutes() {
  const { isLoading, isAuthenticated } = useAuth()

  if (isLoading) {
    return <LoadingScreen />
  }

  return (
    <SmoothScroll>
    <BrowserRouter>
      <ScrollToTop />
      <RouteErrorBoundary>
      <Routes>
        <Route path="/" element={<PublicTransparencyPage />} />
        <Route path="/budget" element={<Navigate to="/#budget" replace />} />
        <Route path="/projects" element={<Navigate to="/#projects" replace />} />
        <Route path="/projects/:id" element={<Navigate to="/#projects" replace />} />
        <Route path="/expenditures" element={<Navigate to="/#projects" replace />} />
        <Route path="/about" element={<Navigate to="/#about" replace />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/dashboard" element={<DashboardLayout />}>
          <Route index element={<MainDashboardPage />} />
          <Route path="budgets" element={<BudgetsPage />} />
          <Route path="projects-events" element={<ProjectsEventsPage />} />
          <Route path="expenses" element={<ExpensesPage />} />
          <Route path="request" element={<RequestPage />} />
          <Route path="request/new" element={<NewRequestPage />} />
          <Route path="documents" element={<DocumentsPage />} />
          <Route path="approvals" element={<ApprovalsPage />} />
          {/* Backwards-compatible redirect: old AI Analysis route now points at the Analysis module */}
          <Route path="ai-analysis" element={<Navigate to="/dashboard/analysis" replace />} />
          <Route
            path="analysis"
            element={
              <Suspense fallback={<LoadingScreen />}>
                <AnalysisOverviewPage />
              </Suspense>
            }
          />
          <Route
            path="analysis/budget-vs-actual"
            element={
              <Suspense fallback={<LoadingScreen />}>
                <BudgetVsActualPage />
              </Suspense>
            }
          />
          <Route
            path="analysis/expenses-by-category"
            element={
              <Suspense fallback={<LoadingScreen />}>
                <ExpensesByCategoryPage />
              </Suspense>
            }
          />
          <Route
            path="analysis/monthly-spending"
            element={
              <Suspense fallback={<LoadingScreen />}>
                <MonthlySpendingPage />
              </Suspense>
            }
          />
          <Route
            path="analysis/budget-utilization"
            element={
              <Suspense fallback={<LoadingScreen />}>
                <BudgetUtilizationPage />
              </Suspense>
            }
          />
          <Route
            path="analysis/budget-distribution"
            element={
              <Suspense fallback={<LoadingScreen />}>
                <CategoryBudgetDistributionPage />
              </Suspense>
            }
          />
          <Route path="receipts" element={<ReceiptsPage />} />
          <Route path="audit-trail" element={<AuditTrailPage />} />
          <Route path="backup-restore" element={<BackupRestorePage />} />
          <Route path="user-management" element={<UserManagementPage />} />
          <Route path="budget-requests" element={<BudgetRequestsPage />} />
          <Route path="payroll" element={<PayrollPage />} />
          <Route path="expense-summary" element={<ExpenseSummaryPage />} />
          <Route path="receipt-details" element={<ReceiptDetailsPage />} />
          <Route path="narrative-report" element={<NarrativeReportPage />} />
          <Route path="annual-report" element={<AnnualReportPage />} />
          <Route path="profile">
            <Route index element={<ProfilePage />} />
            <Route path="update-details" element={<UpdateDetailsPage />} />
            <Route path="biodata" element={<BiodataPage />} />
            <Route path="change-password" element={<ChangePasswordPage />} />
            <Route path="update-otp" element={<UpdateOtpPage />} />
            <Route path="update-email" element={<UpdateEmailPage />} />
          </Route>
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      </RouteErrorBoundary>
      {isAuthenticated && <ChatWidget />}
    </BrowserRouter>
    </SmoothScroll>
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

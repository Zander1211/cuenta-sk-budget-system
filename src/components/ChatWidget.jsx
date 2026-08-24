import React, { useState, useRef, useEffect } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { X, Bot, Send } from 'lucide-react'
import { useLocation } from 'react-router-dom'
import { useBudget } from '../context/BudgetContext'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../supabase/supabaseClient'
import { materializeActualExpenseRows, summarizeApprovedBudgetFinancials } from '../utils/projectEventFinancials'

const PAGE_NAMES = {
  '/dashboard': 'Main Dashboard',
  '/dashboard/budgets': 'Budgets',
  '/dashboard/projects': 'Projects and Events',
  '/dashboard/expenses': 'Expenses',
  '/dashboard/request': 'Submit Budget Request',
  '/dashboard/documents': 'Documents',
  '/dashboard/approvals': 'Approvals',
  '/dashboard/archive': 'Archive',
  '/dashboard/ai-analysis': 'Financial Analysis',
  '/dashboard/analysis': 'Financial Analysis',
  '/dashboard/analysis/budget-vs-actual': 'Budget vs Actual Analysis',
  '/dashboard/analysis/expenses-by-category': 'Expenses by Category Analysis',
  '/dashboard/analysis/monthly-spending': 'Monthly Spending Trend Analysis',
  '/dashboard/analysis/budget-utilization': 'Budget Utilization Analysis',
  '/dashboard/report': 'Reports',
  '/dashboard/audit-logs': 'Audit Logs',
  '/dashboard/user-management': 'User Management',
  '/dashboard/profile': 'Profile',
}

function computeTopCategories(expenses = []) {
  const totals = {}
  for (const e of expenses) {
    if (!e.category) continue
    totals[e.category] = (totals[e.category] || 0) + (Number(e.amount) || 0)
  }
  return Object.entries(totals)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([name, total]) => ({ name, total }))
}

function buildWelcome({ userName, budgetUtilization, pendingApprovals, missingReceipts, currentPage }) {
  const firstName = userName?.split(' ')[0] || 'there'
  let msg = `Hi ${firstName}! I'm Cue, your dedicated assistant for the Cuenta: SK Budget Monitoring and Document Tracking system.`

  const alerts = []
  if (pendingApprovals > 0) alerts.push(`${pendingApprovals} request(s) pending approval`)
  if (missingReceipts > 0) alerts.push(`${missingReceipts} expense(s) missing receipts`)
  if (budgetUtilization >= 75) alerts.push(`budget is at ${budgetUtilization}% utilization`)

  if (alerts.length > 0) {
    msg += ` Quick heads up \u2014 ` + alerts.join(', and ') + `.`
  } else {
    msg += ` Everything looks good right now.`
  }

  msg += ` You're on the ${currentPage} page. What can I help you with?`
  return msg
}

function getChips({ role, budgetUtilization, remaining, pendingApprovals, missingReceipts, currentPage }) {
  const chips = []
  if (budgetUtilization >= 75) chips.push(`How should I use the remaining \u20B1${Number(remaining).toLocaleString('en-PH')} budget?`)
  if (pendingApprovals > 0 && role === 'SK Chairman') chips.push(`Summarize the pending approval requests`)
  if (missingReceipts > 0) chips.push(`Which expenses are missing receipts?`)
  if (currentPage === 'Submit Budget Request') chips.push(`How do I fill out a Purchase Request?`)
  if (currentPage === 'Documents') chips.push(`What documents do I need for a disbursement?`)

  const fallback = [
    `How is our budget doing this month?`,
    `What are the top spending categories?`,
    `Explain SK Fund procurement rules`,
    `How should I allocate the remaining budget?`,
    `What does COA require for expenses?`,
  ]
  for (const f of fallback) {
    if (chips.length >= 3) break
    if (!chips.includes(f)) chips.push(f)
  }
  return chips.slice(0, 3)
}

const CUE_AVATAR_VIDEO = `${import.meta.env.BASE_URL}cue-ai-avatar.mp4`

function CueAnimatedAvatar({ className = '' }) {
  const videoRef = useRef(null)

  useEffect(() => {
    const video = videoRef.current
    if (!video) return undefined

    const syncPlayback = () => {
      if (document.hidden) {
        video.pause()
        return
      }

      const playPromise = video.play()
      if (playPromise?.catch) playPromise.catch(() => {})
    }

    video.muted = true
    syncPlayback()
    document.addEventListener('visibilitychange', syncPlayback)

    return () => {
      document.removeEventListener('visibilitychange', syncPlayback)
      video.pause()
    }
  }, [])

  return (
    <video
      ref={videoRef}
      className={`cue-avatar-video ${className}`.trim()}
      src={CUE_AVATAR_VIDEO}
      autoPlay
      loop
      muted
      playsInline
      preload="auto"
      disablePictureInPicture
      disableRemotePlayback
      aria-hidden="true"
      tabIndex={-1}
    />
  )
}

// Error boundary to prevent chatbot errors from crashing the whole app
class ChatErrorBoundary extends React.Component {
  constructor(props) {
    super(props)
    this.state = { hasError: false }
  }

  static getDerivedStateFromError() {
    return { hasError: true }
  }

  componentDidCatch(error, errorInfo) {
    console.error('ChatWidget caught an error:', error, errorInfo)
  }

  render() {
    if (this.state.hasError) {
      return (
        <button
          onClick={() => this.setState({ hasError: false })}
          className="chat-widget-fab cue-avatar-launcher fixed right-6 w-14 h-14 rounded-full flex items-center justify-center z-[9999] cursor-pointer border-none p-0"
          style={{ background: 'linear-gradient(135deg, #0C2E30 0%, #12805C 50%, #12b89a 100%)' }}
          aria-label="Chat error, click to reset"
        >
          <CueAnimatedAvatar className="cue-avatar-video--fab" />
        </button>
      )
    }
    return this.props.children
  }
}

/*
 * How many past turns are replayed to the model. Cue's figures all arrive in
 * systemContext, not in the transcript, so a long history buys nothing and
 * costs accuracy by pushing the data block out of the model's attention.
 */
const MAX_CHAT_HISTORY = 12

export default function ChatWidget() {
  const { user } = useAuth()

  /*
   * Keying on the user id remounts the widget whenever someone signs in or
   * out, which discards the conversation as a consequence of React's own
   * lifecycle. That is stronger than clearing state in an effect: there is no
   * render in between where the previous user's messages could still be shown.
   */
  return (
    <ChatErrorBoundary>
      <ChatWidgetInner key={user?.id || 'signed-out'} />
    </ChatErrorBoundary>
  )
}

function ChatWidgetInner() {
  const [isOpen, setIsOpen] = useState(false)
  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [hasUnread, setHasUnread] = useState(false)
  const [initialized, setInitialized] = useState(false)
  // Nothing is loaded from storage any more, so the widget is ready immediately.
  const [historyLoaded] = useState(true)
  const messagesEndRef = useRef(null)
  const inputRef = useRef(null)

  const location = useLocation()
  const { user, role, profileName } = useAuth()
  const { requests, expenses, totals, budgets, verifiedReceiptTotals } = useBudget()

  const approvedFinancials = summarizeApprovedBudgetFinancials(expenses, verifiedReceiptTotals)
  const actualExpenseRows = materializeActualExpenseRows(expenses, verifiedReceiptTotals)
    .filter((expense) => !expense.isAdditional && !expense.archivedAt)
  const actualExpenseTotal = approvedFinancials.totalExpenses

  const currentPage = PAGE_NAMES[location.pathname] || 'Dashboard'
  // Budget utilization = approved allocations / monthly budget total
  const budgetUtilization = totals?.totalBudget
    ? Math.round((totals.totalApprovedAllocations / totals.totalBudget) * 100)
    : 0
  const pendingApprovals = (requests || []).filter(r => r.status === 'Pending').length
  const missingReceipts = (expenses || []).filter(e => !e.receiptUrl && !e.receiptName).length
  const remaining = totals?.remaining ?? 0
  const userName = profileName || user?.user_metadata?.full_name || user?.email || 'Official'

  const LOCAL_CHAT_KEY = 'cuenta.chat_history.v1'

  /**
   * Conversations are held in React state only, for the lifetime of the
   * session. Nothing is written to the database or to storage, so signing out
   * (or closing the tab) leaves nothing behind.
   *
   * This is deliberate. Cue answers questions about budgets, expenses and
   * approvals, so a transcript is a record of what an official was looking
   * into. On a shared barangay computer that transcript should not survive the
   * session, and it is not something the system needs to keep.
   *
   * The purge below clears anything the earlier persisting version left on
   * this device or in the chat_history table.
   */
  useEffect(() => {
    let mounted = true

    // Drop transcripts written before chat became ephemeral. State itself does
    // not need clearing here: ChatWidget keys this component on the user id, so
    // signing in or out remounts it with fresh state.
    try {
      for (let i = window.localStorage.length - 1; i >= 0; i -= 1) {
        const key = window.localStorage.key(i)
        if (key && key.startsWith(LOCAL_CHAT_KEY)) window.localStorage.removeItem(key)
      }
    } catch {
      // Storage can be unavailable in private mode; nothing to clean up then.
    }

    if (user?.id) {
      supabase
        .from('chat_history')
        .delete()
        .eq('user_id', user.id)
        .then(({ error }) => {
          if (error && mounted) {
            console.warn('[Cue] Could not purge stored chat history:', error.message)
          }
        })
    }

    return () => { mounted = false }
  }, [user?.id])

  // Show welcome message on first open if no history exists
  useEffect(() => {
    if (isOpen && !initialized && historyLoaded) {
      const welcome = buildWelcome({ userName, budgetUtilization, pendingApprovals, missingReceipts, currentPage })
      setMessages(prev => {
        if (prev.length > 0) return prev
        return [{ role: 'assistant', content: welcome, timestamp: new Date().toISOString() }]
      })
      setInitialized(true)
    }
    if (isOpen) {
      setHasUnread(false)
      setTimeout(() => inputRef.current?.focus(), 100)
    }
  }, [isOpen, historyLoaded])

  // Auto-scroll on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, isLoading])

  const MONTH_NAMES = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ]

  function buildSystemContext() {
    const currentYear = new Date().getFullYear()
    const currentMonthNum = new Date().getMonth() + 1
    const currentMonthName = MONTH_NAMES[currentMonthNum - 1]

    // Group budgets by month and year
    const budgetsList = (budgets || []).map(b => {
      const mNum = Number(b.month)
      const mName = typeof b.month === 'number' || !isNaN(mNum) ? MONTH_NAMES[mNum - 1] : String(b.month)
      return {
        id: b.id,
        month: mName,
        monthNumber: mNum,
        year: Number(b.year),
        amount: Number(b.amount) || 0,
        source: b.source || 'Regular SK Budget'
      }
    })

    // Group expenses by month and year.
    //
    // type / projectStatus / isAdditional used to be dropped here, which is
    // why Cue answered "No approved projects are recorded in the system" while
    // the Projects & Events page listed four. An approved request becomes an
    // expense row, so these ARE the projects and events — but without `type`
    // nothing in the payload was identifiable as a project or an event, and
    // without `projectStatus` nothing could be reported as Ongoing/Completed.
    const expensesList = actualExpenseRows.map(e => {
      /*
       * Matches useBudgetCalculations' bucketing (BudgetContext.jsx), which is
       * what MainDashboardPage/AiAnalysisPage use for their own monthly
       * totals: eventDate first, then date, then approval/creation time. The
       * expense's raw `month`/`year` columns are NOT used here on purpose —
       * they are set once at submission and can go stale relative to the
       * event date, and using them would make Cue's month bucketing diverge
       * from what the rest of the app actually displays for "this month".
       */
      const dateVal = e.eventDate || e.date || e.approvedAt || e.createdAt
      const d = dateVal ? new Date(dateVal) : null
      const mNum = d && !isNaN(d.getTime()) ? d.getMonth() + 1 : null
      const yNum = d && !isNaN(d.getTime()) ? d.getFullYear() : currentYear
      return {
        id: e.id,
        project: e.project || e.event || 'Expense',
        type: e.type || 'Project',
        amount: Number(e.approvedBudget) || Number(e.amount) || 0,
        approvedBudget: Number(e.approvedBudget) || 0,
        actualExpense: Number(e.amount) || 0,
        category: e.category || 'Other',
        status: e.status || 'Approved',
        projectStatus: e.projectStatus || null,
        isAdditional: !!e.isAdditional,
        archived: !!e.archivedAt,
        venue: e.venue || '',
        description: e.description || e.purpose || '',
        month: mNum ? MONTH_NAMES[mNum - 1] : null,
        monthNumber: mNum,
        year: yNum,
        date: dateVal,
        hasReceipt: !!(e.receiptUrl || e.receiptName)
      }
    })

    // Group requests by month and year
    const requestsList = (requests || []).map(r => {
      const dateVal = r.date || r.eventDate || r.approvedAt || r.createdAt
      const d = dateVal ? new Date(dateVal) : null
      const mNum = d && !isNaN(d.getTime()) ? d.getMonth() + 1 : null
      const yNum = d && !isNaN(d.getTime()) ? d.getFullYear() : currentYear
      return {
        id: r.id,
        event: r.event || r.project || 'Request',
        type: r.type || 'Project',
        amount: Number(r.amount) || 0,
        status: r.status || 'Pending',
        category: r.category || 'Other',
        month: mNum ? MONTH_NAMES[mNum - 1] : null,
        monthNumber: mNum,
        year: yNum
      }
    })

    // Compute monthly summary for each month with budget or expenses
    const monthlySummaries = []
    const yearsToSummarize = Array.from(new Set([...budgetsList.map(b => b.year), currentYear]))
    
    for (const yr of yearsToSummarize) {
      for (let m = 1; m <= 12; m++) {
        const mName = MONTH_NAMES[m - 1]
        const mBudgets = budgetsList.filter(b => b.year === yr && (b.monthNumber === m || b.month === mName))
        const mBudgetTotal = mBudgets.reduce((sum, b) => sum + b.amount, 0)
        
        const workingBudget = summarizeApprovedBudgetFinancials(
          expenses,
          verifiedReceiptTotals,
          { view: 'monthly', year: yr, month: m },
        )
        const mExpenseTotal = workingBudget.totalExpenses
        const mRemaining = workingBudget.remainingBudget

        if (mBudgetTotal > 0 || workingBudget.records.length > 0) {
          monthlySummaries.push({
            month: mName,
            monthNumber: m,
            year: yr,
            allocatedBudget: mBudgetTotal,
            approvedBudget: workingBudget.totalApprovedBudget,
            totalExpenses: mExpenseTotal,
            remainingBalance: mRemaining,
            remainingMonthlyAllocation: mBudgetTotal - workingBudget.totalApprovedBudget,
            sources: mBudgets.map(b => b.source).join(', ') || 'Regular SK Budget',
            approvedRecordCount: workingBudget.records.length,
          })
        }
      }
    }

    return {
      role,
      userName,
      currentPage,
      currentYear,
      currentMonthName,
      totals: {
        // Total Budget = sum of all monthly budgets (SK Treasurer entries)
        totalBudget: totals?.totalBudget || 0,
        // Total Approved Allocations = sum of all approved budget requests
        totalApprovedAllocations: totals?.totalApprovedAllocations || 0,
        totalExpenses: actualExpenseTotal,
        remaining: totals?.remaining || 0,
        remainingMonthlyAllocation: totals?.remainingMonthlyAllocation || 0,
        budgetUtilization,
      },
      monthlySummaries,
      allBudgets: budgetsList,
      allExpenses: expensesList,
      allRequests: requestsList,
      topCategories: computeTopCategories(actualExpenseRows),
    }
  }

  const CUENTA_SCOPE_RESPONSE = `I'm Cue, the AI assistant for the Cuenta: SK Budget Monitoring and Document Tracking with AI Analysis system. I can only assist with questions related to this system, such as budgets, expenses, projects, events, payroll, documents, reports, AI Analysis, and system features. Please ask a question related to the Cuenta system.`

  function isRelatedToCuenta(queryText) {
    const cuentaKeywords = [
      'budget', 'expense', 'spending', 'spent', 'remaining', 'balance', 'allocation', 'allocate',
      'disbursement', 'financial', 'fund', 'funds', 'money', 'peso', 'amount', 'cost',
      'utilization', 'revenue', 'income', 'savings', 'deficit', 'surplus',
      'project', 'approved project', 'ongoing', 'completed', 'project budget', 'project status',
      'event', 'activity', 'program',
      'payroll', 'salary', 'honorarium', 'stipend', 'compensation',
      'document', 'receipt', 'narrative', 'report', 'upload', 'attachment', 'file',
      'supporting document', 'coa', 'commission on audit',
      'analysis', 'insight', 'recommendation', 'recommend', 'suggest', 'suggestion', 'where to spend', 'where should', 'risk', 'trend', 'forecast', 'summary',
      'ai analysis', 'financial analysis', 'spending trend',
      'dashboard', 'chart', 'statistic', 'overview', 'total',
      'audit', 'log', 'trail', 'activity log', 'approval', 'pending', 'approved', 'rejected',
      'how to', 'how do i', 'how can i', 'where is', 'where can', 'what is the',
      'create', 'submit', 'request', 'generate', 'update', 'profile', 'manage',
      'cuenta', 'system', 'sk', 'sangguniang kabataan', 'barangay',
      'purchase request', 'budget request', 'requisition',
      'january', 'february', 'march', 'april', 'may', 'june',
      'july', 'august', 'september', 'october', 'november', 'december',
      'this month', 'last month', 'next month', 'this year', 'last year', 'next year',
      'annual', 'monthly', 'quarterly', 'q1', 'q2', 'q3', 'q4',
      'category', 'breakdown', 'comparison', 'compare', 'vs', 'versus',
      'archive', 'archived', 'status', 'missing receipt',
      'implement', 'implemented', 'implementation', 'utilized', 'utilization',
      'user management', 'user role', 'chairman', 'treasurer', 'secretary',
      'dilg', 'procurement', 'bidding'
    ]
    for (const keyword of cuentaKeywords) {
      if (queryText.includes(keyword)) return true
    }
    if (/\b20\d\d\b/.test(queryText)) return true
    if (/\u20b1/.test(queryText)) return true
    return false
  }

  function processFinancialQuery(userQuery, systemCtx) {
    const text = (userQuery || '').trim().toLowerCase()
    const currentYear = new Date().getFullYear()
    
    // 0. Check Greetings (always allowed)
    const greetings = ['hello', 'hi', 'hey', 'good morning', 'good afternoon', 'good evening', 'greetings', 'kumusta', 'hello?', 'hi?']
    if (greetings.includes(text)) {
      const uName = systemCtx.userName || 'Official'
      return `Hi ${uName}! I'm Cue, your dedicated assistant for the Cuenta: SK Budget Monitoring and Document Tracking system. How can I help you with your budgets, expenses, projects, events, payroll, documents, or reports today?`
    }

    // 0b. Check for thank you / farewell (always allowed)
    const farewells = ['thank you', 'thanks', 'salamat', 'bye', 'goodbye', 'ok', 'okay', 'got it', 'alright']
    if (farewells.some(f => text.includes(f))) {
      return `You're welcome! If you have any more questions about your budgets, expenses, projects, or other Cuenta system features, feel free to ask anytime.`
    }

    // 1. OFF-TOPIC FILTER — Reject questions unrelated to the Cuenta system
    if (!isRelatedToCuenta(text)) {
      return CUENTA_SCOPE_RESPONSE
    }

    // 2. Extract Requested Year (e.g. 2024, 2025, 2026, 2027)
    let targetYear = null
    const yearMatch = text.match(/\b(20\d\d)\b/)
    if (yearMatch) {
      targetYear = Number(yearMatch[1])
    } else if (text.includes('this year')) {
      targetYear = currentYear
    } else if (text.includes('last year')) {
      targetYear = currentYear - 1
    } else if (text.includes('next year')) {
      targetYear = currentYear + 1
    }

    // 3. Extract Requested Month
    const monthsList = [
      'january', 'february', 'march', 'april', 'may', 'june',
      'july', 'august', 'september', 'october', 'november', 'december'
    ]
    let targetMonth = null
    const matchedMonthIndex = monthsList.findIndex(m => text.includes(m))
    if (matchedMonthIndex !== -1) {
      targetMonth = monthsList[matchedMonthIndex].charAt(0).toUpperCase() + monthsList[matchedMonthIndex].slice(1)
    } else if (text.includes('this month')) {
      targetMonth = monthsList[new Date().getMonth()].charAt(0).toUpperCase() + monthsList[new Date().getMonth()].slice(1)
    }

    // 4. Extract Record Type Intent
    /* "Implemented / utilized / used budget" asks how much was put into
       action, which is the expense total — answering it with the allocated
       budget is the wrong figure whenever the two differ. */
    const isExpenseQuery = text.includes('expense') || text.includes('spent') || text.includes('spending') || text.includes('disbursement') || /\b(implement\w*|utili[sz]\w*|used|executed|disbursed)\b/.test(text)
    const isRemainingQuery = text.includes('remaining') || text.includes('balance') || text.includes('left')
    const isSuggestionQuery = text.includes('suggest') || text.includes('recommend') || text.includes('where should') || text.includes('where to spend') || text.includes('how to spend') || text.includes('how should i use') || text.includes('how to allocate') || text.includes('allocate') || text.includes('project suggestion')

    const allBudgets = systemCtx.allBudgets || []
    const allExpenses = systemCtx.allExpenses || []
    const allRequests = systemCtx.allRequests || []
    const monthlySummaries = systemCtx.monthlySummaries || []

    if (isSuggestionQuery) {
      return generateDataDrivenRecommendation(systemCtx, allBudgets, allRequests, targetMonth, targetYear, currentYear)
    }

    /* "What are the spending patterns" is a question about shape, not size.
       Answering it with a single total is the wrong shape of answer, so this
       is checked before the plain expense-total rules below. */
    const isPatternQuery = /\b(pattern|patterns|trend|trends|breakdown|break down|distribution|spread|analyse|analyze|analysis|habits?|behaviou?r|compare|comparison|by month|per month|by category|per category|where.*(going|spent|spend))\b/.test(text)

    if (isPatternQuery) {
      return buildSpendingPatternAnalysis(systemCtx, allExpenses, targetYear, targetMonth)
    }

    /* "What is the newest project in August" names a RECORD; it is not asking
       for a total. Without this the question fell through to the month rules
       below and came back with August's allocated budget — the answer to a
       different question, and the same answer for every project question
       asked about the same month.

       Both cues are required. The record noun alone would hijack "what is the
       project budget for August", which really does want a total, so a
       listing cue ("newest", "which", "list", "how many"...) must appear too.
       Expense and remaining questions keep their own rules below. */
    const mentionsRecordNoun = /\b(projects?|events?|activit(?:y|ies)|programs?)\b/.test(text)
    const hasListingCue = /\b(newest|latest|most recent|recent|list|which|name|how many|what are|show)\b/.test(text)

    if (mentionsRecordNoun && hasListingCue && !isExpenseQuery && !isRemainingQuery) {
      return buildProjectListing(allExpenses, allRequests, targetMonth, targetYear, currentYear, text)
    }

    // -------------------------------------------------------------
    // RULE A: SPECIFIC YEAR AND MONTH REQUESTED (e.g. "July 2026", "July 2025")
    // -------------------------------------------------------------
    if (targetYear && targetMonth) {
      const matchingBudgets = allBudgets.filter(b => Number(b.year) === targetYear && String(b.month).toLowerCase() === targetMonth.toLowerCase())
      const matchingExpenses = allExpenses.filter(e => Number(e.year) === targetYear && String(e.month).toLowerCase() === targetMonth.toLowerCase())
      
      const budgetTotal = matchingBudgets.reduce((sum, b) => sum + (Number(b.amount) || 0), 0)
      const expenseTotal = matchingExpenses.reduce((sum, e) => sum + (Number(e.amount) || 0), 0)

      if (isExpenseQuery) {
        if (matchingExpenses.length === 0 && expenseTotal === 0) {
          return `No expenses have been recorded for ${targetMonth} ${targetYear}.`
        }
        return `The total expenses recorded for ${targetMonth} ${targetYear} is ₱${Number(expenseTotal).toLocaleString('en-PH')}.`
      }

      if (isRemainingQuery) {
        const working = monthlySummaries.find((row) => (
          Number(row.year) === targetYear
          && String(row.month).toLowerCase() === targetMonth.toLowerCase()
        ))
        if (!working || Number(working.approvedBudget) <= 0) {
          return `No approved Project, Event, or Payroll budget was recorded for ${targetMonth} ${targetYear}.`
        }
        return `The remaining approved working budget for ${targetMonth} ${targetYear} is ₱${Number(working.remainingBalance).toLocaleString('en-PH')} (Approved: ₱${Number(working.approvedBudget).toLocaleString('en-PH')}, Spent: ₱${Number(working.totalExpenses).toLocaleString('en-PH')}).`
      }

      // Default Budget Query for specific Month & Year
      if (matchingBudgets.length === 0) {
        return `No monthly budget has been recorded for ${targetMonth} ${targetYear}.`
      }
      return `The total allocated budget for ${targetMonth} ${targetYear} is ₱${Number(budgetTotal).toLocaleString('en-PH')}.`
    }

    // -------------------------------------------------------------
    // RULE B: SPECIFIC YEAR ONLY REQUESTED (e.g. "What is the budget for 2025?")
    // -------------------------------------------------------------
    if (targetYear) {
      const yearBudgets = allBudgets.filter(b => Number(b.year) === targetYear)
      const yearExpenses = allExpenses.filter(e => Number(e.year) === targetYear)

      const budgetTotal = yearBudgets.reduce((sum, b) => sum + (Number(b.amount) || 0), 0)
      const expenseTotal = yearExpenses.reduce((sum, e) => sum + (Number(e.amount) || 0), 0)

      if (isExpenseQuery) {
        if (yearExpenses.length === 0 && expenseTotal === 0) {
          return `No expenses have been recorded for ${targetYear}.`
        }
        return `The total expenses recorded for ${targetYear} is ₱${Number(expenseTotal).toLocaleString('en-PH')}.`
      }

      if (isRemainingQuery) {
        const workingRows = monthlySummaries.filter((row) => Number(row.year) === targetYear)
        const approvedBudget = workingRows.reduce((sum, row) => sum + Number(row.approvedBudget || 0), 0)
        const remainingVal = workingRows.reduce((sum, row) => sum + Number(row.remainingBalance || 0), 0)
        if (approvedBudget <= 0) {
          return `No approved Project, Event, or Payroll budget was recorded for ${targetYear}.`
        }
        return `The remaining approved working budget for ${targetYear} is ₱${Number(remainingVal).toLocaleString('en-PH')} from ₱${Number(approvedBudget).toLocaleString('en-PH')} in approved requests.`
      }

      // Budget query for specific year
      if (yearBudgets.length === 0) {
        return `No monthly budget has been recorded for ${targetYear}.`
      }
      return `The total budget recorded for ${targetYear} is ₱${Number(budgetTotal).toLocaleString('en-PH')}.`
    }

    // -------------------------------------------------------------
    // RULE C: SPECIFIC MONTH ONLY REQUESTED (e.g. "budget for July")
    // Default to current year
    // -------------------------------------------------------------
    if (targetMonth) {
      const effectiveYear = currentYear
      const monthBudgets = allBudgets.filter(b => Number(b.year) === effectiveYear && String(b.month).toLowerCase() === targetMonth.toLowerCase())
      const monthExpenses = allExpenses.filter(e => Number(e.year) === effectiveYear && String(e.month).toLowerCase() === targetMonth.toLowerCase())

      const budgetTotal = monthBudgets.reduce((sum, b) => sum + (Number(b.amount) || 0), 0)
      const expenseTotal = monthExpenses.reduce((sum, e) => sum + (Number(e.amount) || 0), 0)

      if (isExpenseQuery) {
        if (monthExpenses.length === 0 && expenseTotal === 0) {
          return `No expenses have been recorded for ${targetMonth} ${effectiveYear}.`
        }
        return `The total expenses recorded for ${targetMonth} ${effectiveYear} is ₱${Number(expenseTotal).toLocaleString('en-PH')}.`
      }

      if (isRemainingQuery) {
        const working = monthlySummaries.find((row) => (
          Number(row.year) === effectiveYear
          && String(row.month).toLowerCase() === targetMonth.toLowerCase()
        ))
        if (!working || Number(working.approvedBudget) <= 0) {
          return `No approved Project, Event, or Payroll budget was recorded for ${targetMonth} ${effectiveYear}.`
        }
        return `The remaining approved working budget for ${targetMonth} ${effectiveYear} is ₱${Number(working.remainingBalance).toLocaleString('en-PH')}.`
      }

      if (monthBudgets.length === 0) {
        return `No monthly budget has been recorded for ${targetMonth} ${effectiveYear}.`
      }
      return `The total allocated budget for ${targetMonth} ${effectiveYear} is ₱${Number(budgetTotal).toLocaleString('en-PH')}.`
    }

    // -------------------------------------------------------------
    // RULE D: EXPLICIT OVERALL ANNUAL / TOTAL QUERY
    // -------------------------------------------------------------
    if (text.includes('overall') || text.includes('all years') || text.includes('total budget')) {
      const totalB = systemCtx.totals?.totalBudget || 0
      const totalR = systemCtx.totals?.remaining || 0
      if (totalB === 0) {
        return `No approved Project, Event, or Payroll budgets have been recorded in the system yet.`
      }
      return `The overall approved working budget across all years is ₱${Number(totalB).toLocaleString('en-PH')} and ₱${Number(totalR).toLocaleString('en-PH')} remains after recorded expenses.`
    }

    // Default fallback summary
    const totalB = systemCtx.totals?.totalBudget || 0
    const totalR = systemCtx.totals?.remaining || 0
    if (totalB === 0) {
      return `No approved Project, Event, or Payroll budgets have been recorded in the system yet.`
    }
    return `Your overall approved working budget is ₱${Number(totalB).toLocaleString('en-PH')} and ₱${Number(totalR).toLocaleString('en-PH')} remains after recorded expenses.`
  }

  /**
   * Answers "what are the spending patterns" with an actual distribution.
   *
   * A pattern question asks how spending is shaped across time and category,
   * so the answer reports where the money concentrates, which months are busy
   * or quiet, the direction of travel, and how much of it is backed by
   * receipts. A single total answers none of that.
   *
   * Every figure is computed from recorded expenses. Nothing is estimated, and
   * where there is too little data to support a claim the claim is omitted
   * rather than softened.
   */
  /*
   * Answers questions that name projects or events rather than asking for a
   * total: "what is the newest project in August", "which events ran in Q3",
   * "how many projects this year".
   *
   * Approved projects and events live in allExpenses — that is what an
   * approved request becomes. allRequests still holds the pending ones, so a
   * "newest" question can say something useful for a period where nothing has
   * been approved yet instead of just reporting nothing.
   */
  function buildProjectListing(allExpenses, allRequests, targetMonth, targetYear, currentYear, text) {
    /*
     * Only filter by year when the user actually named one. This used to
     * default effectiveYear to currentYear unconditionally, so an unscoped
     * "list all approved projects" silently dropped every record from other
     * years while claiming to answer for "all" of them — the opposite of
     * what an unfiltered listing request means.
     */
    const hasYearFilter = !!targetYear
    const effectiveYear = targetYear || currentYear
    const period = targetMonth
      ? `${targetMonth} ${effectiveYear}`
      : (hasYearFilter ? `${effectiveYear}` : 'all recorded years')

    const inPeriod = (r) =>
      (!hasYearFilter || Number(r.year) === effectiveYear) &&
      (!targetMonth || String(r.month || '').toLowerCase() === targetMonth.toLowerCase())

    // Newest first. Records with no usable date sort last rather than
    // silently taking the top spot in a "newest" answer.
    const byNewest = (a, b) => {
      const ta = a.date ? new Date(a.date).getTime() : NaN
      const tb = b.date ? new Date(b.date).getTime() : NaN
      if (Number.isNaN(ta) && Number.isNaN(tb)) return 0
      if (Number.isNaN(ta)) return 1
      if (Number.isNaN(tb)) return -1
      return tb - ta
    }

    const approved = (allExpenses || []).filter(e => !e.isAdditional && inPeriod(e)).sort(byNewest)
    const pending = (allRequests || []).filter(
      r => inPeriod(r) && String(r.status || '').toLowerCase() === 'pending'
    )

    const money = (n) => `₱${Number(n || 0).toLocaleString('en-PH')}`

    const describe = (e) => {
      const when = e.date && !Number.isNaN(new Date(e.date).getTime())
        ? new Date(e.date).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' })
        : 'date not recorded'
      return `"${e.project}" — ${money(e.amount)} | ${e.category || 'Uncategorized'} | ${e.status || 'Approved'} | ${when}`
    }

    const plural = (n, one, many) => (n === 1 ? one : many)

    if (approved.length === 0) {
      if (pending.length > 0) {
        const lines = pending.map(r => `- "${r.event}" — ${money(r.amount)} (${r.status})`).join('\n')
        return [
          `No approved projects or events are recorded for ${period}.`,
          '',
          `There ${plural(pending.length, 'is', 'are')} ${pending.length} pending ${plural(pending.length, 'request', 'requests')} for that period:`,
          lines,
        ].join('\n')
      }
      return `No projects or events are recorded for ${period}.`
    }

    const listAll = approved.map(e => `- ${describe(e)}`).join('\n')

    if (/\b(how many|count)\b/.test(text)) {
      return [
        `${approved.length} ${plural(approved.length, 'project or event is', 'projects and events are')} recorded for ${period}.`,
        '',
        listAll,
      ].join('\n')
    }

    if (/\b(newest|latest|most recent|recent)\b/.test(text)) {
      const newest = approved[0]
      const others = approved.slice(1)
      if (others.length === 0) {
        return `The most recent project recorded for ${period} is ${describe(newest)}.`
      }
      return [
        `The most recent project recorded for ${period} is ${describe(newest)}.`,
        '',
        `${others.length} ${plural(others.length, 'other is', 'others are')} recorded for that period:`,
        others.map(e => `- ${describe(e)}`).join('\n'),
      ].join('\n')
    }

    return [
      `Projects and events recorded for ${period} (${approved.length} total):`,
      listAll,
    ].join('\n')
  }

  function buildSpendingPatternAnalysis(systemCtx, allExpenses, targetYear, targetMonth) {
    const peso = value => `₱${Number(value || 0).toLocaleString('en-PH')}`

    let scope = allExpenses
    let periodLabel = 'all recorded periods'

    if (targetYear) {
      scope = scope.filter(e => Number(e.year) === targetYear)
      periodLabel = String(targetYear)
    }
    if (targetMonth) {
      scope = scope.filter(e => String(e.month || '').toLowerCase() === targetMonth.toLowerCase())
      periodLabel = targetYear ? `${targetMonth} ${targetYear}` : targetMonth
    }

    if (scope.length === 0) {
      return `No expenses have been recorded for ${periodLabel}, so there is no spending pattern to describe yet.`
    }

    const total = scope.reduce((sum, e) => sum + (Number(e.amount) || 0), 0)

    // ── Distribution across months ──────────────────────────────────────
    const byMonth = new Map()
    for (const expense of scope) {
      const key = expense.monthNumber || 0
      const entry = byMonth.get(key) || { month: expense.month || 'Undated', number: key, total: 0, count: 0 }
      entry.total += Number(expense.amount) || 0
      entry.count += 1
      byMonth.set(key, entry)
    }
    const months = [...byMonth.values()].sort((a, b) => a.number - b.number)
    const activeMonths = months.filter(m => m.total > 0)

    // ── Distribution across categories ──────────────────────────────────
    const byCategory = new Map()
    for (const expense of scope) {
      const key = expense.category || 'Other'
      const entry = byCategory.get(key) || { category: key, total: 0, count: 0 }
      entry.total += Number(expense.amount) || 0
      entry.count += 1
      byCategory.set(key, entry)
    }
    const categories = [...byCategory.values()].sort((a, b) => b.total - a.total)

    const lines = []
    lines.push(`Spending pattern for ${periodLabel}`)
    lines.push('')
    lines.push(
      `${peso(total)} across ${scope.length} expense${scope.length === 1 ? '' : 's'}` +
        (activeMonths.length ? ` in ${activeMonths.length} active month${activeMonths.length === 1 ? '' : 's'}.` : '.'),
    )

    // ── Where it concentrates ───────────────────────────────────────────
    lines.push('')
    lines.push('By category')
    for (const row of categories.slice(0, 5)) {
      const share = total > 0 ? Math.round((row.total / total) * 100) : 0
      lines.push(`  ${row.category}: ${peso(row.total)} (${share}%, ${row.count} item${row.count === 1 ? '' : 's'})`)
    }
    if (categories.length > 5) {
      const rest = categories.slice(5).reduce((sum, row) => sum + row.total, 0)
      lines.push(`  ${categories.length - 5} other categories: ${peso(rest)}`)
    }

    // ── Month by month ──────────────────────────────────────────────────
    if (activeMonths.length > 1) {
      lines.push('')
      lines.push('By month')
      for (const row of activeMonths) {
        const share = total > 0 ? Math.round((row.total / total) * 100) : 0
        lines.push(`  ${row.month}: ${peso(row.total)} (${share}%)`)
      }
    }

    // ── What the shape actually says ────────────────────────────────────
    const observations = []

    const leader = categories[0]
    if (leader && total > 0) {
      const leadShare = (leader.total / total) * 100
      if (leadShare >= 60) {
        observations.push(
          `Spending is heavily concentrated: ${leader.category} alone accounts for ${Math.round(leadShare)}% of the total.`,
        )
      } else if (categories.length >= 3 && leadShare < 40) {
        observations.push(`Spending is spread fairly evenly across ${categories.length} categories.`)
      }
    }

    if (activeMonths.length > 1) {
      const peak = activeMonths.reduce((a, b) => (b.total > a.total ? b : a))
      const quiet = activeMonths.reduce((a, b) => (b.total < a.total ? b : a))
      const average = total / activeMonths.length

      observations.push(
        `${peak.month} was the heaviest month at ${peso(peak.total)}; ${quiet.month} was the lightest at ${peso(quiet.total)}. The average active month is ${peso(Math.round(average))}.`,
      )

      // Direction of travel, stated only when the sample can support it.
      if (activeMonths.length >= 4) {
        const midpoint = Math.floor(activeMonths.length / 2)
        const firstHalf = activeMonths.slice(0, midpoint).reduce((sum, m) => sum + m.total, 0) / midpoint
        const secondHalfMonths = activeMonths.slice(midpoint)
        const secondHalf = secondHalfMonths.reduce((sum, m) => sum + m.total, 0) / secondHalfMonths.length

        if (firstHalf > 0) {
          const change = ((secondHalf - firstHalf) / firstHalf) * 100
          if (Math.abs(change) >= 15) {
            observations.push(
              `Spending is ${change > 0 ? 'rising' : 'falling'}: the later months average ${Math.abs(Math.round(change))}% ${change > 0 ? 'more' : 'less'} than the earlier ones.`,
            )
          } else {
            observations.push('The monthly pace has stayed broadly steady across the period.')
          }
        }
      }
    }

    // ── Budget utilisation, when a budget exists for the period ─────────
    const summaries = (systemCtx.monthlySummaries || []).filter(s => !targetYear || s.year === targetYear)
    const budgeted = summaries.reduce((sum, s) => sum + (Number(s.allocatedBudget) || 0), 0)
    if (budgeted > 0) {
      const utilisation = Math.round((total / budgeted) * 100)
      observations.push(
        `Against ${peso(budgeted)} allocated, that is ${utilisation}% utilised with ${peso(Math.max(budgeted - total, 0))} unspent.`,
      )
    }

    // ── Documentation coverage ──────────────────────────────────────────
    const withReceipts = scope.filter(e => e.hasReceipt).length
    if (withReceipts < scope.length) {
      const missing = scope.length - withReceipts
      observations.push(
        `${missing} of ${scope.length} expense${scope.length === 1 ? '' : 's'} ${missing === 1 ? 'has' : 'have'} no receipt attached yet.`,
      )
    }

    if (observations.length) {
      lines.push('')
      lines.push('What this shows')
      for (const note of observations) lines.push(`  ${note}`)
    }

    return lines.join('\n')
  }

  function generateDataDrivenRecommendation(systemCtx, allBudgets, allRequests, targetMonth, targetYear, currentYear) {
    const fmt = (n) => `₱${Number(n).toLocaleString('en-PH')}`

    const effectiveYear = targetYear || currentYear
    const effectiveMonth = targetMonth || MONTH_NAMES[new Date().getMonth()]
    const periodLabel = `${effectiveMonth} ${effectiveYear}`

    const periodBudgets = allBudgets.filter(b =>
      Number(b.year) === effectiveYear &&
      String(b.month).toLowerCase() === effectiveMonth.toLowerCase()
    )
    const workingBudget = (systemCtx.monthlySummaries || []).find((row) => (
      Number(row.year) === effectiveYear
      && String(row.month).toLowerCase() === effectiveMonth.toLowerCase()
    ))
    const pendingRequests = (allRequests || []).filter(r =>
      String(r.status).toLowerCase() === 'pending'
    )

    const budgetTotal = periodBudgets.reduce((sum, b) => sum + (Number(b.amount) || 0), 0)
    const approvedBudget = Number(workingBudget?.approvedBudget || 0)
    const expenseTotal = Number(workingBudget?.totalExpenses || 0)
    const workingRemaining = Number(workingBudget?.remainingBalance || 0)
    const remaining = budgetTotal - approvedBudget
    const utilization = approvedBudget > 0 ? Math.round((expenseTotal / approvedBudget) * 100) : 0

    if (periodBudgets.length === 0 || budgetTotal === 0) {
      return `I couldn't provide budget allocation suggestions because no monthly budget has been recorded for ${periodLabel}. Please add a monthly budget first so I can generate personalized recommendations.`
    }

    let response = ''

    response += `📊 Current Financial Status for ${periodLabel}:\n`
    response += `• Monthly Allocation: ${fmt(budgetTotal)}\n`
    response += `• Approved Working Budgets: ${fmt(approvedBudget)}\n`
    response += `• Total Expenses: ${fmt(expenseTotal)}\n`
    response += `• Remaining Approved Budget: ${fmt(workingRemaining)}\n`
    response += `• Remaining Monthly Approval Capacity: ${fmt(remaining)}\n`
    response += `• Approved Budget Utilization: ${utilization}%\n`
    if (pendingRequests.length > 0) {
      const pendingTotal = pendingRequests.reduce((sum, r) => sum + (Number(r.amount) || 0), 0)
      response += `• Pending Requests: ${pendingRequests.length} (totaling ${fmt(pendingTotal)})\n`
    }

    const reserveAmount = Math.round(remaining * 0.15)
    const allocatable = remaining - reserveAmount

    response += `\n💡 Recommended Budget Allocation:\n`

    if (remaining <= 0) {
      response += `Your budget for ${periodLabel} has been fully utilized. No additional allocations can be made at this time. Consider requesting a supplemental budget if there are urgent pending activities.\n`
    } else if (allocatable < 3000) {
      response += `With only ${fmt(remaining)} remaining, I recommend reserving the full amount as a contingency fund for emergency expenses or pending payroll obligations.\n`
    } else {
      const youthDev = Math.round(allocatable * 0.30)
      const healthSports = Math.round(allocatable * 0.25)
      const environment = Math.round(allocatable * 0.15)
      const training = Math.round(allocatable * 0.15)
      response += `• Youth Development & Education: ${fmt(youthDev)} (30%)\n`
      response += `• Health, Sports & Wellness: ${fmt(healthSports)} (25%)\n`
      response += `• Environmental Programs: ${fmt(environment)} (15%)\n`
      response += `• Leadership & Skills Training: ${fmt(training)} (15%)\n`
      response += `• Contingency Reserve: ${fmt(reserveAmount)} (15%)\n`
    }

    if (remaining > 0) {
      response += `\n🎯 Suggested Projects:\n`

      if (remaining >= 30000) {
        response += `• Community Sports Festival — Estimated cost: ₱15,000–₱25,000. Promotes health, teamwork, and youth engagement across puroks.\n`
        response += `• School Supply Distribution — Estimated cost: ₱10,000–₱20,000. Supports underprivileged students with essential school materials.\n`
        response += `• Youth Leadership Summit — Estimated cost: ₱8,000–₱15,000. Develops youth governance and leadership skills.\n`
        response += `• Disaster Preparedness Training — Estimated cost: ₱5,000–₱12,000. Equips youth with emergency response knowledge.\n`
      } else if (remaining >= 10000) {
        response += `• Basketball or Volleyball Tournament — Estimated cost: ₱8,000–₱12,000. Encourages youth sportsmanship and physical activity.\n`
        response += `• Youth Leadership Seminar — Estimated cost: ₱5,000–₱8,000. Builds leadership capacity among young officials.\n`
        response += `• Digital Literacy Workshop — Estimated cost: ₱3,000–₱6,000. Teaches basic digital skills to out-of-school youth.\n`
        response += `• Environmental Clean-up Drive — Estimated cost: ₱2,000–₱5,000. Organizes a barangay-wide clean-up with youth volunteers.\n`
      } else {
        response += `• Community Clean-up Drive — Estimated cost: ₱1,000–₱3,000. Mobilizes youth for environmental stewardship.\n`
        response += `• Reading & Storytelling Program — Estimated cost: ₱1,500–₱3,000. Promotes literacy among children in the barangay.\n`
        response += `• Anti-Drug Awareness Poster Campaign — Estimated cost: ₱500–₱2,000. Creates visual awareness materials for the community.\n`
        response += `• First Aid Orientation — Estimated cost: ₱1,000–₱2,500. Teaches basic first aid skills to SK members.\n`
      }
    }

    response += `\n📋 Financial Advice:\n`

    if (utilization < 50) {
      response += `Your budget utilization is at ${utilization}%, which is a healthy spending pace. You have room to fund new youth programs and activities this period.`
    } else if (utilization < 75) {
      response += `Your budget utilization is at ${utilization}%, a moderate pace. I recommend prioritizing the completion of ongoing approved projects before starting new ones.`
    } else if (utilization < 90) {
      response += `Your budget utilization is at ${utilization}%, approaching the limit. Reserve the remaining ${fmt(remaining)} for essential expenses, pending payroll, and emergency needs. Avoid starting large new projects.`
    } else {
      response += `Your budget utilization is at ${utilization}%, which is critical. Avoid any new expenses and ensure all pending requests and payroll obligations are covered first. Consider requesting a supplemental budget if urgent needs arise.`
    }

    if (pendingRequests.length > 0) {
      response += ` Note: You have ${pendingRequests.length} pending request(s) that may further reduce available funds once approved.`
    }

    return response
  }

  async function sendMessage(text) {
    const userText = (text || input).trim()
    if (!userText || isLoading) return
    setInput('')

    // Reset textarea height
    if (inputRef.current) {
      inputRef.current.style.height = 'auto'
    }

    const userMsg = { role: 'user', content: userText, timestamp: new Date().toISOString() }
    const updatedMessages = [...messages, userMsg]
    setMessages(updatedMessages)
    setIsLoading(true)

    const systemCtx = buildSystemContext()

    try {
      // Call Groq AI via Supabase Edge Function
      // Only the recent turns are replayed. Every figure Cue can quote already
      // travels in systemContext, so older turns add no information — they just
      // crowd the data out of the model's context and make late answers drift.
      const { data, error } = await supabase.functions.invoke('chatbot', {
        body: {
          messages: updatedMessages.slice(-MAX_CHAT_HISTORY).map(m => ({ role: m.role, content: m.content })),
          systemContext: systemCtx,
        },
      })

      if (error) {
        const errorObj = new Error(error.message || 'Edge function request failed')
        errorObj.code = 'EDGE_FUNCTION_ERROR'
        throw errorObj
      }

      // Parse reply from the edge function response
      let replyText = data?.reply || ''
      try {
        const parsed = JSON.parse(replyText)
        if (parsed && typeof parsed.content === 'string') {
          replyText = parsed.content
        }
      } catch {
        // reply is already plain text, use as-is
      }

      // An empty reply means the model returned nothing usable; fall back, but
      // flag it, because the rule engine answers in a different voice and an
      // unlabelled switch reads as the assistant contradicting itself.
      const usedFallback = !replyText
      if (usedFallback) {
        replyText = processFinancialQuery(userText, systemCtx)
      }

      const assistantMsg = {
        role: 'assistant',
        content: replyText,
        offline: usedFallback,
        timestamp: new Date().toISOString(),
      }

      setMessages(prev => [...prev, assistantMsg])

      if (!isOpen) setHasUnread(true)

    } catch (err) {
      console.warn('[Cue Chat Widget] API request failed, utilizing client context fallback:', err)

      const fallbackMsg = processFinancialQuery(userText, systemCtx)
      const assistantFallbackMsg = {
        role: 'assistant',
        content: fallbackMsg,
        offline: true,
        timestamp: new Date().toISOString(),
      }

      setMessages(prev => [...prev, assistantFallbackMsg])
    } finally {
      setIsLoading(false)
    }
  }

  // Hide widget on login page
  if (location.pathname === '/') {
    return null
  }

  const chips = getChips({ role, budgetUtilization, remaining, pendingApprovals, missingReceipts, currentPage })

  return (
    <>
      {/* FAB Toggle Button */}
      <button
        id="cue-chat-fab"
        onClick={() => setIsOpen(prev => !prev)}
        className={`chat-widget-fab cue-avatar-launcher${isOpen ? ' is-open' : ''} fixed right-6 w-14 h-14 rounded-full flex items-center justify-center z-[9999] cursor-pointer border-none p-0`}
        style={{
          background: 'linear-gradient(135deg, #0C2E30 0%, #12805C 50%, #12b89a 100%)',
        }}
        aria-label={isOpen ? 'Close chat' : 'Open chat'}
      >
        {isOpen
          ? <X size={22} color="white" />
          : <CueAnimatedAvatar className="cue-avatar-video--fab" />
        }
        {hasUnread && !isOpen && (
          <span
            className="absolute flex items-center justify-center w-5 h-5 rounded-full text-white font-bold"
            style={{
              top: '-4px',
              right: '-4px',
              fontSize: '10px',
              background: 'var(--negative)',
              animation: 'cue-pulse 2s infinite ease-in-out',
            }}
          >
            !
          </span>
        )}
      </button>

      {/* Chat Panel */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: 16, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 16, scale: 0.97 }}
            transition={{ duration: 0.18, ease: 'easeOut' }}
            className="chat-widget-panel fixed flex flex-col z-[9999] overflow-hidden"
            style={{
              bottom: '96px',
              right: '24px',
              width: 'min(400px, 92vw)',
              height: 'min(520px, 75vh)',
              background: 'var(--surface)',
              borderRadius: 'var(--radius-surface)',
              boxShadow: 'var(--shadow-lift)',
            }}
          >
            {/* Header */}
            <div
              className="flex items-center justify-between px-4 py-3 shrink-0"
              style={{
                background: 'linear-gradient(135deg, #0C2E30 0%, #12805C 50%, #12b89a 100%)',
                borderBottom: '1px solid rgba(255,255,255,0.1)',
              }}
            >
              <div className="flex items-center gap-2.5">
                <div
                  className="cue-avatar-shell w-9 h-9 rounded-full flex items-center justify-center overflow-hidden shrink-0"
                  style={{ background: 'rgba(255,255,255,0.2)', backdropFilter: 'blur(8px)' }}
                >
                  <CueAnimatedAvatar className="cue-avatar-video--header" />
                </div>
                <div>
                  <p className="text-white text-sm font-semibold" style={{ lineHeight: 1, margin: 0 }}>Cue</p>
                  <p style={{ color: 'rgba(255,255,255,0.6)', fontSize: '11px', marginTop: '2px', lineHeight: 1 }}>SK Financial Assistant</p>
                </div>
              </div>
              <button
                onClick={() => setIsOpen(false)}
                className="w-8 h-8 rounded-full flex items-center justify-center cursor-pointer border-none transition-all duration-200"
                style={{ background: 'rgba(255,255,255,0.15)' }}
                onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.3)'}
                onMouseLeave={e => e.currentTarget.style.background = 'rgba(255,255,255,0.15)'}
                aria-label="Close chat"
              >
                <X size={16} color="rgba(255,255,255,0.8)" />
              </button>
            </div>

            {/* Messages */}
            <div
              data-lenis-prevent
              className="flex-1 overflow-y-auto px-4 py-3"
              style={{
                background: 'var(--surface-2)',
                display: 'flex',
                flexDirection: 'column',
                gap: '12px',
                scrollBehavior: 'smooth',
              }}
            >
              {messages.map((msg, i) => (
                <div
                  key={i}
                  className="flex items-end gap-2"
                  style={{ flexDirection: msg.role === 'user' ? 'row-reverse' : 'row' }}
                >
                  {msg.role === 'assistant' && (
                    <div
                      className="w-7 h-7 rounded-full flex items-center justify-center shrink-0"
                      style={{ background: 'linear-gradient(135deg, #12805C 0%, #12b89a 100%)' }}
                    >
                      <Bot size={13} color="white" />
                    </div>
                  )}
                  <div
                    style={{
                      maxWidth: '80%',
                      borderRadius: msg.role === 'user' ? '16px 4px 16px 16px' : '4px 16px 16px 16px',
                      padding: '10px 14px',
                      fontSize: '0.9rem',
                      lineHeight: '1.55',
                      whiteSpace: 'pre-wrap',
                      wordBreak: 'break-word',
                      ...(msg.role === 'user'
                        ? {
                            background: 'var(--accent)',
                            color: 'var(--accent-ink)',
                          }
                        : {
                            background: 'var(--surface)',
                            color: 'var(--ink)',
                            border: '1px solid var(--line)',
                            boxShadow: 'var(--shadow)',
                          }),
                    }}
                  >
                    {msg.content}
                    {msg.offline && (
                      <div style={{
                        marginTop: '8px',
                        paddingTop: '6px',
                        borderTop: '1px solid var(--line)',
                        fontSize: '0.72rem',
                        color: 'var(--ink-3)',
                      }}>
                        Answered offline from your recorded figures — the AI service was unreachable.
                      </div>
                    )}
                  </div>
                </div>
              ))}

              {/* Typing indicator */}
              {isLoading && (
                <div className="flex items-end gap-2">
                  <div
                    className="w-7 h-7 rounded-full flex items-center justify-center shrink-0"
                    style={{ background: 'linear-gradient(135deg, #12805C 0%, #12b89a 100%)' }}
                  >
                    <Bot size={13} color="white" />
                  </div>
                  <div
                    className="flex gap-1 items-center"
                    style={{
                      background: 'var(--surface)',
                      border: '1px solid var(--line)',
                      borderRadius: '4px 16px 16px 16px',
                      padding: '12px 14px',
                      boxShadow: 'var(--shadow)',
                    }}
                  >
                    {[0, 150, 300].map(delay => (
                      <span
                        key={delay}
                        style={{
                          width: '6px',
                          height: '6px',
                          background: 'var(--ink-3)',
                          borderRadius: '50%',
                          animation: 'cue-bounce 1.4s infinite both',
                          animationDelay: `${delay}ms`,
                        }}
                      />
                    ))}
                  </div>
                </div>
              )}

              {/* Suggestion chips — show only with welcome message */}
              {messages.length <= 1 && !isLoading && (
                <div className="flex flex-wrap gap-2 pt-1">
                  {chips.map((chip, i) => (
                    <button
                      key={i}
                      onClick={() => sendMessage(chip)}
                      className="cursor-pointer border-none transition-all duration-200"
                      style={{
                        fontSize: '0.8rem',
                        padding: '7px 12px',
                        background: 'var(--surface)',
                        border: '1px solid var(--line-strong)',
                        borderRadius: '999px',
                        color: 'var(--ink-2)',
                        textAlign: 'left',
                        boxShadow: 'var(--shadow)',
                      }}
                      onMouseEnter={e => {
                        e.currentTarget.style.background = '#EEF9F4'
                        e.currentTarget.style.borderColor = '#7FC9AE'
                        e.currentTarget.style.color = '#0E6B4D'
                      }}
                      onMouseLeave={e => {
                        e.currentTarget.style.background = '#ffffff'
                        e.currentTarget.style.borderColor = '#cbd5e1'
                        e.currentTarget.style.color = '#334155'
                      }}
                    >
                      {chip}
                    </button>
                  ))}
                </div>
              )}

              <div ref={messagesEndRef} />
            </div>

            {/* Input */}
            <div
              className="flex items-end gap-2 shrink-0"
              style={{
                borderTop: '1px solid #e2e8f0',
                padding: '10px 12px',
                background: 'var(--surface)',
              }}
            >
              <textarea
                ref={inputRef}
                value={input}
                onChange={e => {
                  setInput(e.target.value)
                  e.target.style.height = 'auto'
                  e.target.style.height = Math.min(e.target.scrollHeight, 96) + 'px'
                }}
                onKeyDown={e => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault()
                    sendMessage()
                  }
                }}
                placeholder="Ask Cue anything..."
                rows={1}
                style={{
                  flex: 1,
                  resize: 'none',
                  fontSize: '0.9rem',
                  border: '1px solid var(--line-strong)',
                  borderRadius: 'var(--radius-surface)',
                  padding: '10px 14px',
                  outline: 'none',
                  background: 'var(--surface-2)',
                  color: 'var(--ink)',
                  maxHeight: '96px',
                  transition: 'border-color 0.2s, box-shadow 0.2s',
                  fontFamily: 'inherit',
                  lineHeight: '1.4',
                }}
                onFocus={e => {
                  e.target.style.borderColor = '#12805C'
                  e.target.style.boxShadow = '0 0 0 3px rgba(18, 128, 92, 0.1)'
                  e.target.style.background = '#ffffff'
                }}
                onBlur={e => {
                  e.target.style.borderColor = '#cbd5e1'
                  e.target.style.boxShadow = 'none'
                  e.target.style.background = '#f8fafc'
                }}
              />
              <button
                onClick={() => sendMessage()}
                disabled={!input.trim() || isLoading}
                className="flex items-center justify-center shrink-0 cursor-pointer border-none transition-all duration-200"
                style={{
                  width: '38px',
                  height: '38px',
                  borderRadius: '50%',
                  background: (!input.trim() || isLoading)
                    ? '#cbd5e1'
                    : 'linear-gradient(135deg, #12805C 0%, #12b89a 100%)',
                  opacity: (!input.trim() || isLoading) ? 0.5 : 1,
                  boxShadow: (!input.trim() || isLoading)
                    ? 'none'
                    : '0 4px 12px rgba(18, 128, 92, 0.2)',
                }}
                aria-label="Send message"
              >
                <Send size={15} color="white" />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Keyframe animations */}
      <style>{`
        @keyframes cue-bounce {
          0%, 80%, 100% { transform: scale(0); opacity: 0.5; }
          40% { transform: scale(1); opacity: 1; }
        }
        @keyframes cue-pulse {
          0% { transform: scale(1); opacity: 0.8; }
          50% { transform: scale(1.15); opacity: 1; }
          100% { transform: scale(1); opacity: 0.8; }
        }
      `}</style>
    </>
  )
}

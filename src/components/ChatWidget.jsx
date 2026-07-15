import React, { useMemo, useState, useRef, useEffect } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import './ChatWidget.css'
import { useAuth } from '../context/AuthContext'
import { useBudget } from '../context/BudgetContext'
import { useAuditLog } from '../context/AuditLogContext'
import { useDocuments } from '../context/DocumentContext'
import { supabase } from '../supabase/supabaseClient'
import ReactMarkdown from 'react-markdown'

const QUICK_SUGGESTIONS = [
  "Remaining Budget",
  "Pending Requests",
  "Budget Recommendation"
]

class ChatErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true };
  }

  componentDidCatch(error, errorInfo) {
    console.error("ChatWidget caught an error:", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="chat-widget">
          <button className="chat-toggle" onClick={() => this.setState({ hasError: false })} aria-label="Chat error, click to reset">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="red" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10"></circle>
              <line x1="12" y1="8" x2="12" y2="12"></line>
              <line x1="12" y1="16" x2="12.01" y2="16"></line>
            </svg>
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

export default function ChatWidget() {
  return (
    <ChatErrorBoundary>
      <ChatWidgetInner />
    </ChatErrorBoundary>
  )
}

function ChatWidgetInner() {
  const location = useLocation()
  const navigate = useNavigate()
  const { user, role } = useAuth()
  const { totals, requests, expenses, budgets } = useBudget()
  const { logs } = useAuditLog()
  const { documents } = useDocuments()
  
  const [open, setOpen] = useState(false)
  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [initialLoading, setInitialLoading] = useState(true)
  const messagesEndRef = useRef(null)

  // Load chat history from Supabase based on user ID
  useEffect(() => {
    let mounted = true
    async function loadHistory() {
      // 🚨 CRITICAL PRIVACY FIX: Immediately clear previous messages when user changes!
      if (mounted) setMessages([])

      if (!user?.id) {
        if (mounted) setInitialLoading(false)
        return
      }
      
      setInitialLoading(true)
      try {
        const { data, error } = await supabase
          .from('chat_history')
          .select('*')
          .eq('user_id', user.id)
          .order('created_at', { ascending: true })

        if (error) {
          console.warn('Chat history query error:', error.message)
          // If the table doesn't exist or RLS blocks it, we must ensure it stays empty
          if (mounted) setMessages([])
          return
        }

        if (data && mounted) {
          const history = data.map(row => ({
            role: row.role,
            content: row.content,
            timestamp: row.created_at
          }))
          setMessages(history)
        }
      } catch (err) {
        console.warn('Failed to load chat history', err)
        if (mounted) setMessages([])
      } finally {
        if (mounted) setInitialLoading(false)
      }
    }
    
    loadHistory()
    
    return () => {
      mounted = false
    }
  }, [user?.id])

  useEffect(() => {
    scrollToBottom()
  }, [messages, open, loading])

  function scrollToBottom() {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }

  function normalizeAuditAction(action = '') {
    const lowered = action.toLowerCase()
    if (lowered.includes('approved')) return 'approved request'
    if (lowered.includes('rejected')) return 'rejected request'
    if (lowered.includes('archived')) return 'archived item'
    if (lowered.includes('restored')) return 'restored item'
    if (lowered.includes('submitted')) return 'submitted request'
    if (lowered.includes('opened')) return 'opened page'
    if (lowered.includes('logged out')) return 'logout'
    return 'activity'
  }

  function formatTimestamp(isoString) {
    if (!isoString) return ''
    const date = new Date(isoString)
    const now = new Date()
    const diffMs = now.getTime() - date.getTime()
    const diffMins = Math.floor(diffMs / 60000)
    
    if (diffMins < 1) return 'Just now'
    if (diffMins < 60) return `${diffMins} min ago`
    
    if (date.toDateString() === now.toDateString()) {
      return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    }
    return date.toLocaleDateString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
  }

function generateDeterministicResponse(input, dbContext) {
  const query = input.toLowerCase()
  const { totalBudget, totalExpenses, remainingBalance, budgetUtilization, totalRequests } = dbContext.verifiedCalculations
  const formatCurrency = (val) => new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' }).format(val || 0)

  // 1. Remaining Budget
  if (query.includes('remaining') || query.includes('balance') || query.includes('left')) {
    return `**Remaining Budget Analysis**\n\nYour current remaining budget is **${formatCurrency(remainingBalance)}**.\n- **Total Allocated Budget**: ${formatCurrency(totalBudget)}\n- **Total Expenses**: ${formatCurrency(totalExpenses)}\n- **Utilization**: ${budgetUtilization}`
  }

  // 2. Budget Utilization / Summary
  if (query.includes('utilization') || query.includes('summary') || query.includes('report')) {
    return `**AI Financial Summary**\n\nHere is your real-time system summary:\n\n- **Total Budget Allocated**: ${formatCurrency(totalBudget)}\n- **Total Expenses Incurred**: ${formatCurrency(totalExpenses)}\n- **Remaining Balance**: ${formatCurrency(remainingBalance)}\n- **Budget Utilization Rate**: **${budgetUtilization}**\n- **Total Active Requests**: ${totalRequests}`
  }

  // 3. Expenses
  if (query.includes('expense') || query.includes('spent') || query.includes('cost')) {
    let highestExpense = dbContext.rawExpenses !== "No expenses found in database" && dbContext.rawExpenses.length > 0 
      ? dbContext.rawExpenses.reduce((max, e) => (e.amount || e.total || 0) > (max.amount || max.total || 0) ? e : max, dbContext.rawExpenses[0]) 
      : null

    return `**Expense Analysis**\n\nThe system has recorded a total of **${formatCurrency(totalExpenses)}** in expenses across ${dbContext.verifiedCalculations.totalActiveExpenses} active records.\n${highestExpense ? `\n*Highest Single Expense*: **${highestExpense.event || highestExpense.project}** (${formatCurrency(highestExpense.amount || highestExpense.total || 0)})` : ''}`
  }

  // 4. Pending Requests
  if (query.includes('pending') || query.includes('request')) {
    const pendingReqs = dbContext.rawRequests !== "No requests found in database" 
      ? dbContext.rawRequests.filter(r => r.status === 'Pending') 
      : []
    
    if (pendingReqs.length === 0) {
      return `There are currently **0** pending budget requests in the system.`
    }
    
    let text = `You have **${pendingReqs.length}** pending budget requests:\n\n`
    pendingReqs.forEach(r => {
      text += `- **${r.event || r.project || 'Unknown'}**: ${formatCurrency(r.amount)}\n`
    })
    return text
  }

  // 5. Approved Projects
  if (query.includes('approved') || query.includes('project')) {
    const approvedReqs = dbContext.rawRequests !== "No requests found in database" 
      ? dbContext.rawRequests.filter(r => r.status === 'Approved') 
      : []
    
    if (approvedReqs.length === 0) {
      return `There are currently no approved projects in the system.`
    }
    
    return `There are **${approvedReqs.length}** approved projects in the system. The total recorded expenses across all approved activities currently stand at ${formatCurrency(totalExpenses)}.`
  }

  // 6. Budget Recommendation / AI Risk Detection
  if (query.includes('recommendation') || query.includes('risk') || query.includes('advice')) {
    const utilNum = parseFloat(budgetUtilization)
    let risk = "Low Risk"
    let advice = "Your budget is well-managed. Continue monitoring standard expenses."
    
    if (utilNum >= 80) {
      risk = "High Risk"
      advice = "⚠️ **Warning**: You have consumed over 80% of your budget. Immediate restrictions on non-essential projects are recommended to prevent a deficit."
    } else if (utilNum >= 50) {
      risk = "Medium Risk"
      advice = "You have consumed over half of your allocated budget. Prioritize upcoming mandatory youth programs and limit miscellaneous spending."
    }

    return `**AI Budget Recommendation & Risk Detection**\n\n- **Overall System Risk Level**: **${risk}**\n- **Budget Utilization**: ${budgetUtilization}\n- **Remaining Balance**: ${formatCurrency(remainingBalance)}\n\n**Recommendation**: ${advice}`
  }
  
  if (query.includes('receipt') || query.includes('document')) {
    return `**Document Assistant**\n\nThere are **${dbContext.verifiedCalculations.totalDocuments}** documents uploaded to the system.`
  }

  // Default Fallback
  return `I am Cue, your intelligent financial assistant. I am connected to the real-time Supabase database.\n\nCurrently, your total remaining budget is **${formatCurrency(remainingBalance)}**. You can ask me about:\n- "Remaining Budget"\n- "AI Financial Summary"\n- "Pending Requests"\n- "Budget Recommendation"`
}

  async function handleSendMessage(text) {
    const trimmed = text.trim()
    if (!trimmed) return
    
    const userMsg = { role: 'user', content: trimmed, timestamp: new Date().toISOString() }
    const newMessages = [...messages, userMsg]
    setMessages(newMessages)
    setInput('')
    setLoading(true)

    // Insert user message to Supabase
    if (user?.id) {
      await supabase.from('chat_history').insert({
        user_id: user.id,
        role: 'user',
        content: trimmed
      })
    }

    try {
      // 1. Use the Context data directly to ensure an exact match with the Dashboard
      const safeBudgets = budgets || []
      const safeExpenses = expenses || []
      const safeRequests = requests || []
      const safeDocuments = documents || []

      // Totals from BudgetContext are already verified and match the dashboard
      const totalBudget = totals?.totalBudget || 0
      const totalExpenses = totals?.totalExpenses || 0
      const remainingBalance = totals?.remaining || 0
      const budgetUtilization = totalBudget > 0 ? ((totalExpenses / totalBudget) * 100).toFixed(2) + '%' : '0%'

      const dbContext = {
        role: role || 'Viewer',
        verifiedCalculations: {
          totalBudget,
          totalExpenses,
          remainingBalance,
          budgetUtilization,
          totalBudgetsAdded: safeBudgets.length,
          totalActiveExpenses: safeExpenses.filter(e => !e.archivedAt && e.status !== 'Cancelled').length,
          totalRequests: safeRequests.length,
          totalDocuments: safeDocuments.length
        },
        rawBudgets: safeBudgets.length > 0 ? safeBudgets : "No budgets found in database",
        rawExpenses: safeExpenses.length > 0 ? safeExpenses : "No expenses found in database",
        rawRequests: safeRequests.length > 0 ? safeRequests : "No requests found in database",
        rawDocuments: safeDocuments.length > 0 ? safeDocuments : "No documents found in database",
      }

      // Simulate network delay for natural AI feel
      await new Promise(resolve => setTimeout(resolve, 800))

      const aiResponseText = generateDeterministicResponse(trimmed, dbContext)

      const assistantMsg = { 
        role: 'assistant', 
        content: aiResponseText,
        timestamp: new Date().toISOString()
      }

      setMessages((prev) => [...prev, assistantMsg])

      if (user?.id) {
        await supabase.from('chat_history').insert({
          user_id: user.id,
          role: 'assistant',
          content: assistantMsg.content
        })
      }
    } catch (err) {
      console.error('Chat error:', err)
      const assistantMsg = { 
        role: 'assistant', 
        content: `Sorry, I encountered an error. ${err.message}`,
        timestamp: new Date().toISOString()
      }

      setMessages((prev) => [...prev, assistantMsg])
      
      if (user?.id) {
        await supabase.from('chat_history').insert({
          user_id: user.id,
          role: 'assistant',
          content: assistantMsg.content
        })
      }
    } finally {
      setLoading(false)
    }
  }

  function onSubmit(e) {
    e.preventDefault()
    handleSendMessage(input)
  }

  if (location.pathname === '/') {
    return null
  }

  // Show suggestions if chat is empty, or if the last message is from assistant
  const showSuggestions = messages.length === 0 || messages[messages.length - 1]?.role === 'assistant'

  return (
    <div className={open ? 'chat-widget open' : 'chat-widget'}>
      {open ? (
        <>
          <div className="chat-header" onClick={() => setOpen(false)}>
            <div className="chat-header-main">
              <div className="chat-title">Cue Financial Assistant</div>
              <div className="chat-sub">Intelligent insights & system help</div>
            </div>
            <button
              type="button"
              className="chat-close"
              aria-label="Close chat"
              onClick={(event) => {
                event.stopPropagation()
                setOpen(false)
              }}
            >
              ×
            </button>
          </div>
          <div className="chat-body">
            <div className="chat-messages">
            {messages.length === 0 && (
              <div className="chat-welcome">
                <div className="chat-welcome-icon">✨</div>
                <h3>Hi {user?.user_metadata?.first_name || 'there'}! I'm Cue.</h3>
                <p>I can help you monitor budgets, track requests, analyze expenses, and navigate the system.</p>
              </div>
            )}
            
            {messages.map((m, i) => (
              <div key={i} className={m.role === 'user' ? 'msg user' : 'msg assistant'}>
                {m.role === 'assistant' && (
                  <div className="msg-avatar assistant">🤖</div>
                )}
                <div className="msg-bubble">
                  {m.summary && <div className="msg-summary">{m.summary}</div>}
                  <div className="msg-content">
                    {m.role === 'assistant' ? (
                      <div className="markdown-body">
                        <ReactMarkdown>{m.content || ''}</ReactMarkdown>
                      </div>
                    ) : (
                      m.content || ''
                    )}
                  </div>
                  {Array.isArray(m.alerts) && m.alerts.length > 0 && (
                    <ul className="msg-alerts">
                      {m.alerts.map((alert, idx) => (
                        <li key={idx}>{alert}</li>
                      ))}
                    </ul>
                  )}
                  {Array.isArray(m.actions) && m.actions.length > 0 && (
                    <div className="chat-actions">
                      {m.actions.map((action, idx) => (
                        <button
                          key={`${action.to || 'action'}-${idx}`}
                          type="button"
                          className="chat-action-btn"
                          onClick={() => action.to && navigate(action.to)}
                        >
                          {action.label || 'Open'}
                        </button>
                      ))}
                    </div>
                  )}
                  <div className="msg-timestamp">{formatTimestamp(m.timestamp)}</div>
                </div>
                {m.role === 'user' && (
                  <div className="msg-avatar user">{user?.email?.charAt(0).toUpperCase() || 'U'}</div>
                )}
              </div>
            ))}
            
            {loading && (
              <div className="msg assistant typing">
                 <div className="msg-avatar assistant">🤖</div>
                 <div className="msg-bubble">
                    <div className="typing-indicator">
                      <span></span>
                      <span></span>
                      <span></span>
                    </div>
                 </div>
              </div>
            )}

            {showSuggestions && !loading && (
              <div className="chat-suggestions">
                {QUICK_SUGGESTIONS.map((sug, idx) => (
                  <button key={idx} onClick={() => handleSendMessage(sug)} className="suggestion-chip">
                    {sug}
                  </button>
                ))}
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          <form className="chat-input" onSubmit={onSubmit}>
            <input
              value={input}
              onChange={e => setInput(e.target.value)}
              placeholder="Ask about budgets, reports, or projects..."
              disabled={loading}
              autoFocus
            />
            <button type="submit" disabled={loading || !input.trim()}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="22" y1="2" x2="11" y2="13"></line>
                <polygon points="22 2 15 22 11 13 2 9 22 2"></polygon>
              </svg>
            </button>
          </form>
        </div>
        </>
      ) : (
        <button className="chat-toggle" onClick={() => setOpen(true)} aria-label="Open chat">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
          </svg>
        </button>
      )}
    </div>
  )
}


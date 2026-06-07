import React, { useMemo, useState, useRef, useEffect } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import './ChatWidget.css'
import { useAuth } from '../context/AuthContext'
import { useBudget } from '../context/BudgetContext'
import { useAuditLog } from '../context/AuditLogContext'

export default function ChatWidget() {
  const location = useLocation()
  const navigate = useNavigate()
  const { role } = useAuth()
  const { totals, requests, expenses, budgets } = useBudget()
  const { logs } = useAuditLog()
  const [open, setOpen] = useState(false)
  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const messagesEndRef = useRef(null)

  if (location.pathname === '/') {
    return null
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

  const contextPayload = useMemo(() => {
    const safeRequests = (requests || []).map((request) => ({
      status: request.status || 'Pending',
      amount: Number(request.amount || 0),
      category: request.category || 'Uncategorized',
      submittedAt: request.submittedAt || null,
      approvedAt: request.approvedAt || null,
      archivedAt: request.archivedAt || null,
    }))

    const safeExpenses = (expenses || []).map((expense) => ({
      amount: Number(expense.amount || 0),
      category: expense.category || 'Uncategorized',
      status: expense.status || 'Approved',
      date: expense.date || null,
      approvedAt: expense.approvedAt || null,
      archivedAt: expense.archivedAt || null,
      receiptAttached: Boolean(expense.receiptUrl || expense.receiptName),
    }))

    const safeBudgets = (budgets || []).map((budget) => ({
      month: budget.month,
      year: budget.year,
      amount: Number(budget.amount || 0),
      createdAt: budget.createdAt || null,
    }))

    const safeLogs = (logs || []).map((log) => ({
      type: normalizeAuditAction(log.action || ''),
      timestamp: log.timestamp || null,
    }))

    return {
      role: role || 'Unknown',
      currentPage: location.pathname || '/dashboard',
      totals: totals || {
        totalBudget: 0,
        totalExpenses: 0,
        remaining: 0,
      },
      requests: safeRequests,
      expenses: safeExpenses,
      budgets: safeBudgets,
      auditLogs: safeLogs,
    }
  }, [role, location.pathname, totals, requests, expenses, budgets, logs])

  // Removed API Health check since chatbot is now local

  useEffect(() => {
    scrollToBottom()
  }, [messages, open])

  function scrollToBottom() {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }

  function generateLocalResponse(input, context) {
    const text = input.toLowerCase()
    
    if (text.includes('budget') || text.includes('total') || text.includes('remaining')) {
      const { totalBudget, totalExpenses, remaining } = context.totals || {}
      return {
        summary: 'Budget Overview',
        content: `Your total budget is ₱${(totalBudget || 0).toLocaleString()}. You have spent ₱${(totalExpenses || 0).toLocaleString()}, leaving you with a remaining balance of ₱${(remaining || 0).toLocaleString()}.`,
        actions: [{ label: 'View Budgets', to: '/dashboard/budgets' }]
      }
    }
    
    if (text.includes('expense') || text.includes('spent') || text.includes('spending')) {
      const expenses = context.expenses || []
      const recent = expenses.slice(0, 3)
      if (!recent.length) return { content: 'You have no recorded expenses yet.' }
      
      const alerts = recent.map(e => `${e.category || 'Uncategorized'}: ₱${Number(e.amount || 0).toLocaleString()}`)
      return {
        summary: 'Recent Expenses',
        content: `Here are your most recent expenses:`,
        alerts,
        actions: [{ label: 'View Expenses', to: '/dashboard/expenses' }]
      }
    }
    
    if (text.includes('request') || text.includes('pending') || text.includes('approve')) {
      const requests = context.requests || []
      const pending = requests.filter(r => r.status === 'Pending')
      if (!pending.length) return { content: 'There are no pending budget requests.' }
      
      return {
        summary: 'Pending Requests',
        content: `You have ${pending.length} pending budget request(s) waiting for approval.`,
        actions: [{ label: 'View Approvals', to: '/dashboard/approvals' }]
      }
    }
    
    if (text.includes('receipt') || text.includes('missing')) {
      const expenses = context.expenses || []
      const missing = expenses.filter(e => !e.receiptAttached)
      if (!missing.length) return { content: 'Great job! All your expenses have receipts attached.' }
      
      return {
        summary: 'Missing Receipts',
        content: `You have ${missing.length} approved expenses without receipts.`,
        actions: [{ label: 'Upload Receipts', to: '/dashboard/reports' }]
      }
    }

    return {
      content: "I'm Cue, your local AI assistant. I can answer questions about your budgets, expenses, pending requests, and missing receipts. What would you like to know?"
    }
  }

  async function sendMessage(e) {
    e.preventDefault()
    const trimmed = input.trim()
    if (!trimmed) return
    const userMsg = { role: 'user', content: trimmed }
    const newMessages = [...messages, userMsg]
    setMessages(newMessages)
    setInput('')
    setLoading(true)

    setTimeout(() => {
      const reply = generateLocalResponse(trimmed, contextPayload)
      setMessages(prev => [...prev, { role: 'assistant', ...reply }])
      setLoading(false)
    }, 800)
  }

  return (
    <div className={open ? 'chat-widget open' : 'chat-widget'}>
      <div className="chat-header" onClick={() => setOpen(o => !o)}>
        <div className="chat-header-main">
          <div className="chat-title">Cue</div>
          <div className="chat-sub">Insights, actions, and quick answers</div>
        </div>
        {open ? (
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
        ) : null}
      </div>

      {open ? (
        <div className="chat-body">
          <div className="chat-messages">
            {messages.length ? (
              messages.map((m, i) => (
                <div key={i} className={m.role === 'user' ? 'msg user' : 'msg assistant'}>
                  {m.summary ? <div className="msg-summary">{m.summary}</div> : null}
                  <div className="msg-content">{m.content || ''}</div>
                  {Array.isArray(m.alerts) && m.alerts.length ? (
                    <ul className="msg-alerts">
                      {m.alerts.map((alert, idx) => (
                        <li key={idx}>{alert}</li>
                      ))}
                    </ul>
                  ) : null}
                  {Array.isArray(m.actions) && m.actions.length ? (
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
                  ) : null}
                </div>
              ))
            ) : (
              <div className="chat-empty">
                Ask me about budgets, approvals, expenses, or receipts.
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          <form className="chat-input" onSubmit={sendMessage}>
            <input
              value={input}
              onChange={e => setInput(e.target.value)}
              placeholder={loading ? 'Waiting for response...' : 'Ask about budgets, approvals, or receipts...'}
              disabled={loading}
            />
            <button type="submit" disabled={loading || !input.trim()}>
              {loading ? '…' : 'Send'}
            </button>
          </form>
        </div>
      ) : (
        <button className="chat-toggle" onClick={() => setOpen(true)} aria-label="Open chat">
          💬
        </button>
      )}
    </div>
  )
}

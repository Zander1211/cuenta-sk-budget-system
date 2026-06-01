import React, { useMemo, useState, useRef, useEffect } from 'react'
import { useLocation } from 'react-router-dom'
import './ChatWidget.css'
import { useAuth } from '../context/AuthContext'
import { useBudget } from '../context/BudgetContext'
import { useAuditLog } from '../context/AuditLogContext'

export default function ChatWidget() {
  const apiBaseUrl = import.meta.env.VITE_API_BASE_URL || ''
  const apiEndpoint = apiBaseUrl ? `${apiBaseUrl.replace(/\/$/, '')}/api/chat` : '/api/chat'
  const location = useLocation()
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

  // Health check for server env configuration
  useEffect(() => {
    let mounted = true
    ;(async () => {
      try {
        const res = await fetch(apiEndpoint)
        if (!mounted) return
        if (res.ok) {
          const info = await res.json()
          if (!info.hasOpenAI) {
            setMessages(prev => [...prev, { role: 'assistant', content: 'Configuration missing: OPENAI_API_KEY. Set it in the server environment and redeploy.' }])
          }
        } else {
          setMessages(prev => [...prev, { role: 'assistant', content: `Server API returned ${res.status}. Check deployment and logs.` }])
        }
      } catch (e) {
        if (!mounted) return
        // network or server error — show simple guidance
        setMessages(prev => [...prev, { role: 'assistant', content: 'Cannot reach server API — ensure deployment and env vars are configured.' }])
      }
    })()
    return () => { mounted = false }
  }, [])

  useEffect(() => {
    scrollToBottom()
  }, [messages, open])

  function scrollToBottom() {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
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

    try {
      const res = await fetch(apiEndpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: newMessages, context: contextPayload }),
      })
      if (!res.ok) {
        const text = await res.text()
        throw new Error(text || 'Request failed')
      }
      const data = await res.json()
      const reply =
        typeof data.reply === 'string'
          ? data.reply
          : JSON.stringify(data.reply || {}, null, 2)
      const assistant = { role: 'assistant', content: reply || 'No response' }
      setMessages(prev => [...prev, assistant])
    } catch (err) {
      setMessages(prev => [...prev, { role: 'assistant', content: 'Error: ' + (err.message || err) }])
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className={open ? 'chat-widget open' : 'chat-widget'}>
      <div className="chat-header" onClick={() => setOpen(o => !o)}>
        <div className="chat-title">Cuenta Assistant</div>
        <div className="chat-sub">Budget insights & next actions</div>
      </div>

      {open ? (
        <div className="chat-body">
          <div className="chat-messages">
            {messages
              .map((m, i) => (
                <div key={i} className={m.role === 'user' ? 'msg user' : 'msg assistant'}>
                  {m.content}
                </div>
              ))}
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

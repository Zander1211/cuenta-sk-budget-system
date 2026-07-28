import React, { useState, useRef, useEffect } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { MessageCircle, X, Bot, Send } from 'lucide-react'
import { useLocation } from 'react-router-dom'
import { useBudget } from '../context/BudgetContext'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../supabase/supabaseClient'

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
  let msg = `Hi ${firstName}! I'm Cue, your SK financial assistant.`

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
          className="fixed bottom-6 right-6 w-14 h-14 rounded-full flex items-center justify-center shadow-lg z-[9999]"
          style={{ background: 'linear-gradient(135deg, #0C2E30 0%, #12805C 50%, #12b89a 100%)' }}
          aria-label="Chat error, click to reset"
        >
          <MessageCircle size={22} color="white" />
        </button>
      )
    }
    return this.props.children
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
  const [isOpen, setIsOpen] = useState(false)
  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [hasUnread, setHasUnread] = useState(false)
  const [initialized, setInitialized] = useState(false)
  const [historyLoaded, setHistoryLoaded] = useState(false)
  const messagesEndRef = useRef(null)
  const inputRef = useRef(null)

  const location = useLocation()
  const { user, role, profileName } = useAuth()
  const { requests, expenses, totals } = useBudget()

  const currentPage = PAGE_NAMES[location.pathname] || 'Dashboard'
  const budgetUtilization = totals?.totalBudget
    ? Math.round((totals.totalExpenses / totals.totalBudget) * 100)
    : 0
  const pendingApprovals = (requests || []).filter(r => r.status === 'Pending').length
  const missingReceipts = (expenses || []).filter(e => !e.receiptUrl && !e.receiptName).length
  const remaining = totals?.remaining || 0
  const userName = profileName || user?.user_metadata?.full_name || user?.email || 'Official'

  // Load chat history from Supabase on user change
  useEffect(() => {
    let mounted = true
    async function loadHistory() {
      if (mounted) setMessages([])

      if (!user?.id) {
        if (mounted) {
          setHistoryLoaded(true)
          setInitialized(false)
        }
        return
      }

      try {
        const { data, error } = await supabase
          .from('chat_history')
          .select('*')
          .eq('user_id', user.id)
          .order('created_at', { ascending: true })

        if (error) {
          console.warn('Chat history query error:', error.message)
          if (mounted) setMessages([])
        } else if (data && mounted) {
          const history = data.map(row => ({
            role: row.role,
            content: row.content,
            timestamp: row.created_at,
          }))
          setMessages(history)
          if (history.length > 0) {
            setInitialized(true)
          }
        }
      } catch (err) {
        console.warn('Failed to load chat history', err)
        if (mounted) setMessages([])
      } finally {
        if (mounted) setHistoryLoaded(true)
      }
    }

    setHistoryLoaded(false)
    setInitialized(false)
    loadHistory()

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

  function buildSystemContext() {
    return {
      role,
      userName,
      currentPage,
      totalBudget: totals?.totalBudget || 0,
      totalExpenses: totals?.totalExpenses || 0,
      remaining,
      budgetUtilization,
      pendingApprovals,
      missingReceipts,
      recentRequests: (requests || []).slice(0, 5).map(r => ({
        event: r.event,
        amount: r.amount,
        status: r.status,
        category: r.category,
      })),
      recentExpenses: (expenses || []).slice(0, 5).map(e => ({
        project: e.project || e.event,
        amount: e.amount,
        category: e.category,
      })),
      topCategories: computeTopCategories(expenses || []),
    }
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

    // Save user message to Supabase (fire-and-forget)
    if (user?.id) {
      supabase.from('chat_history').insert({
        user_id: user.id,
        role: 'user',
        content: userText,
      }).then()
    }

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: updatedMessages.map(m => ({ role: m.role, content: m.content })),
          systemContext: buildSystemContext(),
          context: buildSystemContext(), // backward compat with deployed API
        }),
      })

      const data = await res.json().catch(() => ({ error: 'Invalid response from server' }))
      if (!res.ok) {
        const errorObj = new Error(data.error || 'Request failed')
        errorObj.code = data.code
        errorObj.status = res.status
        throw errorObj
      }

      // Parse reply — handles both new plain text and old JSON-structured format
      let replyText = data.reply || ''
      try {
        const parsed = JSON.parse(replyText)
        if (parsed && typeof parsed.content === 'string') {
          replyText = parsed.content
        }
      } catch {
        // reply is already plain text, use as-is
      }

      const assistantMsg = {
        role: 'assistant',
        content: replyText,
        timestamp: new Date().toISOString(),
      }

      setMessages(prev => [...prev, assistantMsg])

      // Save assistant message to Supabase (fire-and-forget)
      if (user?.id) {
        supabase.from('chat_history').insert({
          user_id: user.id,
          role: 'assistant',
          content: replyText,
        }).then()
      }

      if (!isOpen) setHasUnread(true)

    } catch (err) {
      console.error('[Cue Chat Widget] Error sending message:', err)

      let friendlyMessage = 'An unexpected error occurred. Please try again.'
      const isNetworkError = err instanceof TypeError || err.message?.includes('Failed to fetch') || err.message?.includes('network')

      const systemCtx = buildSystemContext()
      const hasNoData = !systemCtx.totalBudget && (!systemCtx.recentExpenses || systemCtx.recentExpenses.length === 0) && (!systemCtx.recentRequests || systemCtx.recentRequests.length === 0)

      if (hasNoData) {
        friendlyMessage = 'There is currently no financial data available to analyze.'
      } else if (err.code === 'AUTH_ERROR' || err.status === 401 || err.status === 403) {
        friendlyMessage = 'You do not have permission to access this information.'
      } else if (err.code === 'AI_QUOTA_EXCEEDED' || err.code === 'AI_UNAVAILABLE' || err.status === 503) {
        friendlyMessage = 'The AI service is temporarily unavailable. Please try again in a few moments.'
      } else if (isNetworkError || err.status === 502 || err.status === 504) {
        friendlyMessage = 'Unable to connect to the server. Please check your internet connection and try again.'
      } else if (err.message) {
        // Safe fallback for other backend errors
        friendlyMessage = `The AI service is temporarily unavailable. Please try again in a few moments.`
      }

      setMessages(prev => [...prev, {
        role: 'assistant',
        content: friendlyMessage,
        timestamp: new Date().toISOString(),
        isError: true, // flag for optional error styling
      }])
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
        className="fixed bottom-6 right-6 w-14 h-14 rounded-full flex items-center justify-center shadow-lg z-[9999] transition-all duration-300 cursor-pointer border-none"
        style={{
          background: 'linear-gradient(135deg, #0C2E30 0%, #12805C 50%, #12b89a 100%)',
          boxShadow: '0 12px 24px rgba(18, 128, 92, 0.3), inset 0 2px 4px rgba(255,255,255,0.2)',
        }}
        aria-label={isOpen ? 'Close chat' : 'Open chat'}
      >
        {isOpen
          ? <X size={22} color="white" />
          : <MessageCircle size={22} color="white" />
        }
        {hasUnread && !isOpen && (
          <span
            className="absolute flex items-center justify-center w-5 h-5 rounded-full text-white font-bold"
            style={{
              top: '-4px',
              right: '-4px',
              fontSize: '10px',
              background: '#ef4444',
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
            className="fixed flex flex-col z-[9999] overflow-hidden"
            style={{
              bottom: '96px',
              right: '24px',
              width: 'min(400px, 92vw)',
              height: 'min(520px, 75vh)',
              background: '#ffffff',
              borderRadius: '18px',
              boxShadow: '0 20px 60px rgba(15, 31, 54, 0.22), 0 0 0 1px rgba(15, 31, 54, 0.08)',
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
                  className="w-9 h-9 rounded-full flex items-center justify-center"
                  style={{ background: 'rgba(255,255,255,0.2)', backdropFilter: 'blur(8px)' }}
                >
                  <Bot size={18} color="white" />
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
                background: '#f8fafc',
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
                            background: '#12805C',
                            color: '#ffffff',
                          }
                        : {
                            background: '#ffffff',
                            color: '#1e293b',
                            border: '1px solid #e2e8f0',
                            boxShadow: '0 1px 3px rgba(15, 31, 54, 0.04)',
                          }),
                    }}
                  >
                    {msg.content}
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
                      background: '#ffffff',
                      border: '1px solid #e2e8f0',
                      borderRadius: '4px 16px 16px 16px',
                      padding: '12px 14px',
                      boxShadow: '0 1px 3px rgba(15, 31, 54, 0.04)',
                    }}
                  >
                    {[0, 150, 300].map(delay => (
                      <span
                        key={delay}
                        style={{
                          width: '6px',
                          height: '6px',
                          background: '#94a3b8',
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
                        background: '#ffffff',
                        border: '1px solid #cbd5e1',
                        borderRadius: '999px',
                        color: '#334155',
                        textAlign: 'left',
                        boxShadow: '0 1px 2px rgba(15, 31, 54, 0.04)',
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
                background: '#ffffff',
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
                  border: '1px solid #cbd5e1',
                  borderRadius: '14px',
                  padding: '10px 14px',
                  outline: 'none',
                  background: '#f8fafc',
                  color: '#1e293b',
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

import React, { useState, useRef, useEffect } from 'react'
import './ChatWidget.css'
import { supabase } from '../supabase/supabaseClient'

export default function ChatWidget() {
  const [open, setOpen] = useState(false)
  const [messages, setMessages] = useState([
    { role: 'system', content: 'You are an assistant that summarizes reports and answers questions about them.' },
  ])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const messagesEndRef = useRef(null)
  const [reportsList, setReportsList] = useState([])

  useEffect(() => {
    async function loadReportsList() {
      try {
        const { data, error } = await supabase
          .from('liquidation_reports')
          .select('id, title')
          .order('created_at', { ascending: false })
          .limit(10)

        if (error) return
        setReportsList(data ?? [])
      } catch (e) {
        // ignore
      }
    }

    loadReportsList()
  }, [])

  // Health check for server env configuration
  useEffect(() => {
    let mounted = true
    ;(async () => {
      try {
        const res = await fetch('/api/chat')
        if (!mounted) return
        if (res.ok) {
          const info = await res.json()
          const missing = []
          if (!info.hasOpenAI) missing.push('OPENAI_API_KEY')
          if (!info.hasSupabaseKey) missing.push('SUPABASE_SERVICE_ROLE_KEY')
          if (missing.length) {
            setMessages(prev => [...prev, { role: 'assistant', content: 'Configuration missing: ' + missing.join(', ') + '. Set them in Vercel env and redeploy.' }])
          }
        }
      } catch (e) {
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
    if (!input.trim()) return
    const userMsg = { role: 'user', content: input.trim() }
    const newMessages = [...messages, userMsg]
    setMessages(newMessages)
    setInput('')
    setLoading(true)

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: newMessages }),
      })
      if (!res.ok) {
        const text = await res.text()
        throw new Error(text || 'Request failed')
      }
      const data = await res.json()
      const assistant = { role: 'assistant', content: data.reply || 'No response' }
      setMessages(prev => [...prev, assistant])
    } catch (err) {
      setMessages(prev => [...prev, { role: 'assistant', content: 'Error: ' + (err.message || err) }])
    } finally {
      setLoading(false)
    }
  }

  async function summarizeReport(reportId, title) {
    setLoading(true)
    const userMsg = { role: 'user', content: `Please summarize the report: ${title || reportId}` }
    setMessages(prev => [...prev, userMsg])

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: [userMsg], reportId }),
      })
      if (!res.ok) {
        const text = await res.text()
        throw new Error(text || 'Request failed')
      }
      const data = await res.json()
      const assistant = { role: 'assistant', content: data.reply || 'No response' }
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
        <div className="chat-title">AI Reports</div>
        <div className="chat-sub">Summarize & ask about reports</div>
      </div>

      {open ? (
        <div className="chat-body">
          <div className="chat-toolbar" style={{ padding: 8, borderBottom: '1px solid #eee' }}>
            <select
              style={{ padding: 6, borderRadius: 6, border: '1px solid #ddd' }}
              onChange={(e) => {
                const id = e.target.value
                const rpt = reportsList.find(r => String(r.id) === String(id))
                // store selected id on the select element dataset for quick access
                e.target.dataset.selected = id
              }}
            >
              <option value="">Select report…</option>
              {reportsList.map(r => (
                <option key={r.id} value={r.id}>{r.title}</option>
              ))}
            </select>
            <button
              style={{ marginLeft: 8, padding: '6px 10px', borderRadius: 6, background: '#06b6d4', color: 'white', border: 'none' }}
              onClick={() => {
                const sel = document.querySelector('.chat-toolbar select')
                const id = sel?.value
                const title = sel?.selectedOptions?.[0]?.text || ''
                if (id) summarizeReport(id, title)
              }}
              disabled={loading}
            >Summarize</button>
          </div>
          <div className="chat-messages">
            {messages
              .filter(m => m.role !== 'system')
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
              placeholder={loading ? 'Waiting for response...' : 'Ask about reports or request a summary...'}
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

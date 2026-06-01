export default async function handler(req, res) {
  // Health check: GET returns presence of required env vars (no secrets)
  if (req.method === 'GET') {
    const OPENAI_API_KEY = process.env.OPENAI_API_KEY
    res.json({ ok: true, hasOpenAI: !!OPENAI_API_KEY })
    return
  }

  if (req.method !== 'POST') {
    res.status(405).send('Method Not Allowed')
    return
  }

  const { messages, context } = req.body || {}
  if (!messages) {
    res.status(400).json({ error: 'Missing messages in request body' })
    return
  }

  const OPENAI_API_KEY = process.env.OPENAI_API_KEY

  if (!OPENAI_API_KEY) {
    res.status(500).json({ error: 'OPENAI_API_KEY is not configured on the server' })
    return
  }

  const MODEL_SYNTH = process.env.OPENAI_MODEL || 'gpt-4o-mini'
  const MODEL_FALLBACK = process.env.OPENAI_FALLBACK_MODEL || 'gpt-4o-mini'

  function shouldFallback(error) {
    if (!error || typeof error.message !== 'string') return false
    const message = error.message.toLowerCase()
    return error.status === 404 ||
      (error.status === 400 && (
        message.includes('model') ||
        message.includes('not found') ||
        message.includes('does not exist')
      ))
  }

  async function requestOpenAI(model, messagesPayload) {
    const resp = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${OPENAI_API_KEY}`,
      },
      body: JSON.stringify({ model, messages: messagesPayload }),
    })

    const text = await resp.text()
    if (!resp.ok) {
      const error = new Error(text || `OpenAI request failed with status ${resp.status}`)
      error.status = resp.status
      throw error
    }

    const data = text ? JSON.parse(text) : {}
    return data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content
  }

  // Helper to call OpenAI (with model fallback)
  async function callOpenAI(messagesPayload, modelOverride) {
    const primaryModel = modelOverride || MODEL_SYNTH
    try {
      return await requestOpenAI(primaryModel, messagesPayload)
    } catch (error) {
      if (primaryModel !== MODEL_FALLBACK && shouldFallback(error)) {
        return await requestOpenAI(MODEL_FALLBACK, messagesPayload)
      }
      throw error
    }
  }

  const systemPrompt = [
    'You are "Cuenta Assistant" - a helpful, concise assistant for the Cuenta budgeting app.',
    'You receive a JSON context object containing: role, currentPage, totals, requests (list), expenses (list), budgets (list), auditLogs (list).',
    'Use that live data only (do not invent facts). Always avoid exposing or echoing any PII from context.',
    '',
    'Behavior:',
    '- Analyze the provided context and the user query. Be concise and actionable.',
    "- Prioritize safety: if data is missing say you don't have enough info and list what's needed.",
    '- Detect issues: high utilization (>85%), negative remaining, many pending requests, large spikes, unusual monthly totals.',
    '- Provide suggestions the user can act on (approve, generate documents, review expenses, reconcile receipts).',
    '- Prefer bullet points and short sentences.',
    '',
    'Output format (RETURN EXACT JSON): Return a single JSON object with these fields:',
    '- content: string (Markdown or plain). Friendly short explanation and findings.',
    '- summary: string (one-line TL;DR).',
    '- alerts: array of strings (each a short alert).',
    '- actions: array of objects { label: string, to: string } — suggested UI navigation (e.g. {label: "Open Approvals", to: "/approvals"}).',
    '- dataHighlights: object with optional keys like { topExpenses: [{label,amount}], topCategories: [{cat,amount}], lastAction: string } — only include if available.',
    '- If you cannot provide structured actions (no permission/data), set actions: [].',
    '',
    'Rules:',
    '- Never reveal or repeat PII (names, emails, IDs, tokens).',
    '- If uncertain, say: “I don’t have enough data to answer — please provide …”.',
    '- Keep content <= ~300 words for readability.',
    '- Use currency formatting consistent with the context when showing amounts.',
    '- Tailor suggestions to the user role responsibilities.',
    '- Return only JSON. No extra text, no code fences.',
  ].join('\n')

  const sanitizedMessages = Array.isArray(messages)
    ? messages.filter((msg) => msg && msg.role && msg.role !== 'system')
    : []

  const contextJson = JSON.stringify(context ?? {}, null, 2)

  const finalMessages = [
    { role: 'system', content: systemPrompt },
    { role: 'system', content: `Context JSON:\n${contextJson}` },
    ...sanitizedMessages,
  ]

  try {
    const reply = await callOpenAI(finalMessages)
    const trimmed = String(reply || '').trim()
    let normalized = trimmed

    try {
      const parsed = JSON.parse(trimmed)
      normalized = JSON.stringify(parsed)
    } catch {
      const fallback = {
        content:
          "I don't have enough data to answer — please provide the missing totals, requests, expenses, budgets, or audit logs.",
        summary: 'Insufficient data.',
        alerts: [],
        actions: [],
        dataHighlights: {},
      }
      normalized = JSON.stringify(fallback)
    }

    res.json({ reply: normalized })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: err.message || String(err) })
  }
}

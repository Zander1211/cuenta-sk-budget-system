// /api/chat/index.js — Cue Conversational AI Backend
// Supports both Google Gemini and OpenAI with automatic provider fallback
// Implements detailed console logging and robust error categorization

function buildSystemPrompt(ctx) {
  const {
    role = 'SK Official',
    userName = 'the user',
    currentPage = 'Dashboard',
    totalBudget = 0,
    totalExpenses = 0,
    remaining = 0,
    budgetUtilization = 0,
    pendingApprovals = 0,
    missingReceipts = 0,
    recentRequests = [],
    recentExpenses = [],
    topCategories = [],
  } = ctx

  const utilizationWarning = budgetUtilization >= 90
    ? 'CRITICAL: Budget is over 90% used. Warn the user urgently.'
    : budgetUtilization >= 75
    ? 'Budget is above 75% used. Mention this as a risk.'
    : ''

  const requestsText = recentRequests.length > 0
    ? recentRequests.map(r => `- "${r.event}" | P${Number(r.amount).toLocaleString('en-PH')} | ${r.status} | ${r.category}`).join('\n')
    : '- No recent requests.'

  const expensesText = recentExpenses.length > 0
    ? recentExpenses.map(e => `- "${e.project}" | P${Number(e.amount).toLocaleString('en-PH')} | ${e.category}`).join('\n')
    : '- No recent expenses.'

  const categoriesText = topCategories.length > 0
    ? topCategories.map(c => `- ${c.name}: P${Number(c.total).toLocaleString('en-PH')}`).join('\n')
    : '- No category data yet.'

  return `You are Cue, the AI financial assistant for the Sangguniang Kabataan (SK) of Barangay Upper Glad II, Midsayap, Cotabato, Philippines.

You are talking to: ${userName} (Role: ${role})
They are currently on: ${currentPage}

LIVE FINANCIAL DATA:
- Total Budget: P${Number(totalBudget).toLocaleString('en-PH')}
- Total Expenses: P${Number(totalExpenses).toLocaleString('en-PH')}
- Remaining Balance: P${Number(remaining).toLocaleString('en-PH')}
- Budget Utilization: ${budgetUtilization}%
${utilizationWarning ? `- WARNING: ${utilizationWarning}` : ''}
- Pending Approvals: ${pendingApprovals}
- Expenses Missing Receipts: ${missingReceipts}

Recent Budget Requests (last 5):
${requestsText}

Recent Expenses (last 5):
${expensesText}

Top Spending Categories:
${categoriesText}

YOUR JOB AS CUE:
1. Answer questions about this SK's finances using ONLY the live data above. Never invent numbers.
2. Give practical budget recommendations — e.g. "You've used 86% of your budget. I'd limit new requests to under P4,000 combined."
3. Explain SK and Barangay finance rules — RA 7160, SK Fund (10% IRA), COA requirements, procurement rules, DILG guidelines.
4. Help users navigate the system — tell them which page to go to for each task.
5. Warn proactively about risks — overspending, missing receipts, unreviewed approvals.
6. Give advice on how to allocate the remaining budget wisely — e.g. reserving funds for unforeseen project expenses, youth capability training, sports/cultural programs, emergency youth/community activities, or keeping it as a contingency fund if there are no pending obligations, complying with RA 7160 and DILG guidelines.
7. If asked something you have no data for, say so clearly. Do not guess.

TONE AND FORMAT:
- Be conversational, warm, and concise — like a knowledgeable colleague
- Plain text only. NO markdown headers (##), NO asterisks (**bold**)
- You CAN use short bullet points with a dash (-) when listing things
- Keep most replies to 3-6 sentences unless the user asks for more detail
- Always use the Philippine Peso sign for amounts
- If the user writes in Filipino or Tagalog, respond in Filipino
- Never say "I am an AI" or "As an AI language model" — just be Cue
- Never mention OpenAI, GPT, Gemini, or Claude
- If asked about unrelated topics, redirect: "I'm focused on SK financial matters. Is there something about your budget I can help with?"

${role === 'SK Chairman' ? `CHAIRMAN NOTE: Remind about pending approvals when relevant. The Chairman has final approval authority over all budget requests.` : ''}
${role === 'SK Treasurer' ? `TREASURER NOTE: Remind to attach receipts to all expenses. Purchase Requests must be submitted before any procurement. Responsible for DVs and payroll.` : ''}
${role === 'SK Kagawad' ? `KAGAWAD NOTE: Kagawad has view-only access to most data. Can certify DVs (Section A). Cannot submit requests or edit budgets — that requires Treasurer access.` : ''}`
}

// --- Helper: Fallback checks ---

function isQuotaOrRateLimitError(err) {
  const msg = String(err.message || '').toLowerCase()
  const orig = String(err.originalMessage || '').toLowerCase()
  return msg.includes('quota') || msg.includes('rate limit') || msg.includes('429') || msg.includes('exhausted') ||
         orig.includes('quota') || orig.includes('rate limit') || orig.includes('429') || orig.includes('exhausted')
}

// --- Provider 1: Gemini ---

async function requestGemini(apiKey, model, systemPrompt, contents) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`
  console.log(`[Cue API] [Gemini] Dispatching request to ${model}...`)

  const resp = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: systemPrompt }] },
      contents,
      generationConfig: { temperature: 0.5, maxOutputTokens: 600 },
    }),
  })

  const text = await resp.text()
  if (!resp.ok) {
    let errMsg = `Gemini request failed: ${resp.status}`
    try {
      const errData = JSON.parse(text)
      errMsg = errData.error?.message || errMsg
    } catch {}
    const error = new Error(errMsg)
    error.status = resp.status
    throw error
  }

  const data = JSON.parse(text)
  const reply = data.candidates?.[0]?.content?.parts?.[0]?.text
  return reply || ''
}

async function callGemini(apiKey, systemPrompt, messages) {
  const contents = messages
    .filter(m => m.role === 'user' || m.role === 'assistant')
    .map(m => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: m.content }],
    }))

  if (contents.length === 0 || contents[0].role !== 'user') {
    contents.unshift({ role: 'user', parts: [{ text: 'Hello' }] })
  }

  const alternatingContents = []
  for (const msg of contents) {
    if (alternatingContents.length > 0 && alternatingContents[alternatingContents.length - 1].role === msg.role) {
      alternatingContents[alternatingContents.length - 1].parts[0].text += '\n' + msg.parts[0].text
    } else {
      alternatingContents.push({ ...msg })
    }
  }

  // Updated to prioritize gemini-flash-latest and gemini-3.1-flash-lite due to availability
  const candidates = ['gemini-flash-latest', 'gemini-3.1-flash-lite', 'gemini-3.5-flash', 'gemini-2.5-flash']
  let lastError = null

  for (const model of candidates) {
    try {
      return await requestGemini(apiKey, model, systemPrompt, alternatingContents)
    } catch (err) {
      lastError = err
      console.warn(`[Cue API] [Gemini] Model ${model} failed: ${err.message}`)
      const isFatal = err.status === 400 || err.status === 401 || err.status === 403
      if (isFatal) throw err // Don't try other models if key is invalid or request is malformed
    }
  }

  throw lastError || new Error('All Gemini models failed')
}

// --- Provider 2: OpenAI ---

async function requestOpenAI(apiKey, model, systemPrompt, messages) {
  const url = 'https://api.openai.com/v1/chat/completions'
  console.log(`[Cue API] [OpenAI] Dispatching request to ${model}...`)

  const formattedMessages = [
    { role: 'system', content: systemPrompt },
    ...messages.map(m => ({ role: m.role, content: m.content })),
  ]

  const resp = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages: formattedMessages,
      temperature: 0.5,
      max_tokens: 600,
    }),
  })

  const text = await resp.text()
  if (!resp.ok) {
    let errMsg = `OpenAI request failed: ${resp.status}`
    try {
      const errData = JSON.parse(text)
      errMsg = errData.error?.message || errMsg
    } catch {}
    const error = new Error(errMsg)
    error.status = resp.status
    throw error
  }

  const data = JSON.parse(text)
  return data.choices?.[0]?.message?.content || ''
}

async function callOpenAI(apiKey, systemPrompt, messages) {
  const candidates = ['gpt-4o-mini', 'gpt-3.5-turbo']
  let lastError = null

  for (const model of candidates) {
    try {
      return await requestOpenAI(apiKey, model, systemPrompt, messages)
    } catch (err) {
      lastError = err
      console.warn(`[Cue API] [OpenAI] Model ${model} failed: ${err.message}`)
      const isFatal = err.status === 400 || err.status === 401 || err.status === 403
      if (isFatal) throw err
    }
  }

  throw lastError || new Error('All OpenAI models failed')
}

// --- Main Handler ---

export default async function handler(req, res) {
  const time = new Date().toISOString()
  console.log(`[Cue API] [${time}] Incoming request: ${req.method}`)

  // Health check
  if (req.method === 'GET') {
    return res.status(200).json({
      ok: true,
      hasGemini: !!process.env.GEMINI_API_KEY,
      hasOpenAI: !!process.env.OPENAI_API_KEY,
    })
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const { messages = [], systemContext = {} } = req.body || {}

  // 1. Log incoming context & verification queries
  console.log(`[Cue API] [Data Query] User: "${systemContext.userName || 'Unknown'}" | Role: "${systemContext.role || 'Unknown'}" | Page: "${systemContext.currentPage || 'Unknown'}"`)
  console.log(`[Cue API] [Data Query] Budget: P${systemContext.totalBudget || 0} | Expenses: P${systemContext.totalExpenses || 0} | Remaining: P${systemContext.remaining || 0}`)

  // 2. Database Integration Check: Verify if data actually exists
  const hasNoData = !systemContext || (
    !systemContext.totalBudget &&
    !systemContext.totalExpenses &&
    (!systemContext.recentRequests || systemContext.recentRequests.length === 0) &&
    (!systemContext.recentExpenses || systemContext.recentExpenses.length === 0)
  )

  if (hasNoData) {
    console.log('[Cue API] [INFO] Skipping AI call: No financial data exists in the context.')
    return res.status(200).json({
      reply: 'No financial data is currently available for analysis.',
      code: 'NO_DATA',
    })
  }

  const systemPrompt = buildSystemPrompt(systemContext)

  // 3. Provider Configuration and Try Sequence
  const geminiKey = process.env.GEMINI_API_KEY
  const openAIKey = process.env.OPENAI_API_KEY

  if (!geminiKey && !openAIKey) {
    console.error('[Cue API] [Error] Neither GEMINI_API_KEY nor OPENAI_API_KEY is configured in the server environment.')
    return res.status(500).json({
      error: 'AI service API keys are not configured in the server environment.',
      code: 'AUTH_ERROR',
    })
  }

  // Determine provider sequence: try the one we have a key for.
  // If we have both, prefer Gemini first (and fallback to OpenAI if Gemini fails).
  const providers = []
  if (geminiKey) providers.push({ name: 'Gemini', key: geminiKey, caller: callGemini })
  if (openAIKey) providers.push({ name: 'OpenAI', key: openAIKey, caller: callOpenAI })

  let replyText = ''
  let finalSuccess = false
  let lastError = null

  for (const provider of providers) {
    try {
      console.log(`[Cue API] [Router] Attempting to generate response using ${provider.name}...`)
      replyText = await provider.caller(provider.key, systemPrompt, messages)
      finalSuccess = true
      console.log(`[Cue API] [Router] Success! Generated response from ${provider.name} (${replyText.length} chars)`)
      break
    } catch (err) {
      lastError = err
      console.error(`[Cue API] [Router] ${provider.name} provider run failed: ${err.message}`)
    }
  }

  if (finalSuccess) {
    return res.status(200).json({ reply: replyText.trim() })
  }

  // 4. Fallback: If AI fails (e.g. Quota Exceeded limit: 0), use local data to generate a helpful response!
  console.error(`[Cue API] [Final Failure] All AI providers failed (Status: ${lastError?.status}). Error: ${lastError?.message}. Switching to local fallback mode.`)

  const isQuota = isQuotaOrRateLimitError(lastError)
  const fallbackReason = isQuota ? '(Note: AI quota exceeded, using automated response)' : '(Note: AI offline, using automated response)'

  // Generate a smart local response based on the context data
  const { remaining = 0, budgetUtilization = 0, totalBudget = 0 } = systemContext
  const userMessage = messages.length > 0 ? messages[messages.length - 1].content.toLowerCase() : ''
  let fallbackReply = ''

  if (userMessage.includes('remaining') || userMessage.includes('how should i use') || userMessage.includes('budget')) {
    fallbackReply = `Your remaining budget for this month is ₱${Number(remaining).toLocaleString('en-PH')}. With a budget utilization of ${budgetUtilization}%, I recommend reserving the remaining funds for unforeseen project expenses, emergency youth activities, or keeping it as a contingency fund in compliance with DILG guidelines.\n\n${fallbackReason}`
  } else if (userMessage.includes('expense') || userMessage.includes('receipt')) {
    const missing = systemContext.missingReceipts || 0
    fallbackReply = `You currently have ${missing} expense(s) missing receipts. Please ensure all disbursements have proper documentation attached for COA compliance.\n\n${fallbackReason}`
  } else if (userMessage.includes('approval') || userMessage.includes('pending')) {
    const pending = systemContext.pendingApprovals || 0
    fallbackReply = `There are ${pending} budget request(s) pending approval. You can review them on the Approvals page.\n\n${fallbackReason}`
  } else {
    fallbackReply = `Your total budget is ₱${Number(totalBudget).toLocaleString('en-PH')} and you have ₱${Number(remaining).toLocaleString('en-PH')} remaining. If you have specific questions about allocations, please check the main dashboard.\n\n${fallbackReason}`
  }

  return res.status(200).json({
    reply: fallbackReply,
    code: 'LOCAL_FALLBACK'
  })
}

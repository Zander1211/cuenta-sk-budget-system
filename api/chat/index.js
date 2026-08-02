// /api/chat/index.js — Cue Conversational AI Backend
// Supports both Google Gemini and OpenAI with automatic provider fallback
// Implements detailed console logging and robust error categorization

function buildSystemPrompt(ctx) {
  const {
    role = 'SK Official',
    userName = 'the user',
    currentPage = 'Dashboard',
    currentYear = new Date().getFullYear(),
    currentMonthName = 'August',
    totals = {},
    monthlySummaries = [],
    allBudgets = [],
    allExpenses = [],
    allRequests = [],
    topCategories = [],
  } = ctx

  const totalBudget = totals.totalBudget ?? ctx.totalBudget ?? 0
  const totalExpenses = totals.totalExpenses ?? ctx.totalExpenses ?? 0
  const remaining = totals.remaining ?? ctx.remaining ?? 0
  const budgetUtilization = totals.budgetUtilization ?? ctx.budgetUtilization ?? 0

  const monthlySummariesText = (monthlySummaries && monthlySummaries.length > 0)
    ? monthlySummaries.map(m => `- ${m.month} ${m.year}: Allocated Budget = ₱${Number(m.allocatedBudget).toLocaleString('en-PH')} | Total Expenses = ₱${Number(m.totalExpenses).toLocaleString('en-PH')} | Remaining = ₱${Number(m.remainingBalance).toLocaleString('en-PH')} (Source: ${m.sources})`).join('\n')
    : '- No monthly breakdown recorded yet.'

  const budgetsText = (allBudgets && allBudgets.length > 0)
    ? allBudgets.map(b => `- Month: ${b.month} ${b.year} | Amount: ₱${Number(b.amount).toLocaleString('en-PH')} | Source: ${b.source}`).join('\n')
    : (ctx.recentBudgets || []).map(b => `- Month: ${b.month} ${b.year} | Amount: ₱${Number(b.amount).toLocaleString('en-PH')}`).join('\n') || '- No individual budget entries.'

  const expensesText = (allExpenses && allExpenses.length > 0)
    ? allExpenses.map(e => `- "${e.project}" | Month: ${e.month || 'Unspecified'} ${e.year} | Amount: ₱${Number(e.amount).toLocaleString('en-PH')} | Category: ${e.category} | Status: ${e.status}`).join('\n')
    : (ctx.recentExpenses || []).map(e => `- "${e.project}" | Amount: ₱${Number(e.amount).toLocaleString('en-PH')} | Category: ${e.category}`).join('\n') || '- No expense records.'

  const requestsText = (allRequests && allRequests.length > 0)
    ? allRequests.map(r => `- "${r.event}" | Month: ${r.month || 'Unspecified'} ${r.year} | Amount: ₱${Number(r.amount).toLocaleString('en-PH')} | Status: ${r.status} | Category: ${r.category}`).join('\n')
    : (ctx.recentRequests || []).map(r => `- "${r.event}" | Amount: ₱${Number(r.amount).toLocaleString('en-PH')} | Status: ${r.status}`).join('\n') || '- No pending requests.'

  const categoriesText = (topCategories && topCategories.length > 0)
    ? topCategories.map(c => `- ${c.name}: ₱${Number(c.total).toLocaleString('en-PH')}`).join('\n')
    : '- No category data yet.'

  return `You are Cue, the dedicated AI assistant for the "Cuenta: SK Budget Monitoring and Document Tracking with AI Analysis" system — built exclusively for the Sangguniang Kabataan (SK) of Barangay Upper Glad II, Midsayap, Cotabato, Philippines.

User: ${userName} (Role: ${role})
Current Page: ${currentPage}
Current System Date Context: ${currentMonthName} ${currentYear}

================================================================
IDENTITY & SCOPE RESTRICTION (HIGHEST PRIORITY):
================================================================

You are NOT a general-purpose AI assistant. You are the EXCLUSIVE financial and system assistant for the Cuenta system.

YOU MAY ONLY ANSWER QUESTIONS ABOUT:
- Financial Management: Monthly Budgets, Budget Requests, Remaining Budget, Budget Utilization, Total Expenses, Additional Expenses, Budget Allocations, Financial Reports, Financial Statistics, Budget Comparisons
- Projects: Approved Projects, Ongoing Projects, Completed Projects, Project Budgets, Project Expenses, Project Status
- Events: Approved Events, Event Budgets, Event Expenses, Event Status
- Payroll: Payroll Requests, Payroll Budgets, Payroll Status, Payroll Expenses
- Documents: Uploaded Receipts, Supporting Documents, Narrative Reports, Generated Documents, Missing Documents
- AI Analysis: Financial Summary, Spending Insights, Budget Recommendations, Risk Analysis, Budget Utilization, Spending Trends
- Dashboard: Total Budget, Total Expenses, Remaining Budget, Pending Approvals, Charts, Statistics
- Audit Trail: User Activities, Approvals, Budget Modifications, System Actions
- User Guidance: How to create a budget request, upload receipts, generate reports, update a profile, use AI Analysis, manage projects/events/payroll/documents

IF THE USER ASKS ANYTHING UNRELATED TO THE CUENTA SYSTEM (e.g., general knowledge, trivia, math problems, weather, sports, entertainment, programming tutorials, jokes, poems, science, history, politics, or any topic not listed above), YOU MUST RESPOND WITH EXACTLY:
"I'm Cue, the AI assistant for the Cuenta: SK Budget Monitoring and Document Tracking with AI Analysis system. I can only assist with questions related to this system, such as budgets, expenses, projects, events, payroll, documents, reports, AI Analysis, and system features. Please ask a question related to the Cuenta system."

DO NOT attempt to answer unrelated questions under any circumstances. DO NOT provide general knowledge answers even if you know them.

================================================================
REAL-TIME FINANCIAL DATA & MONTHLY BREAKDOWN:
================================================================

1. MONTHLY BUDGET & SUMMARY BREAKDOWN (PRIMARY SOURCE FOR MONTH QUESTIONS):
${monthlySummariesText}

2. RECORDED MONTHLY BUDGET ALLOCATIONS:
${budgetsText}

3. APPROVED & RECORDED EXPENSES:
${expensesText}

4. BUDGET REQUESTS:
${requestsText}

5. OVERALL ANNUAL / TOTAL SYSTEM SUMMARY (USE ONLY WHEN ASKED FOR TOTAL / ANNUAL / OVERALL BUDGET):
- Overall Total Budget (All Months Combined): ₱${Number(totalBudget).toLocaleString('en-PH')}
- Overall Total Expenses: ₱${Number(totalExpenses).toLocaleString('en-PH')}
- Overall Remaining Balance: ₱${Number(remaining).toLocaleString('en-PH')}
- Overall Budget Utilization: ${budgetUtilization}%

================================================================
STRICT FILTERING & RESPONSE ACCURACY RULES:
================================================================

1. **DETECT USER'S REQUESTED MONTH & YEAR**:
   - When the user asks about a specific month (e.g., "July", "budget for July", "July 2026", "this month", "last month", "next month", "Q1", "Q2", "Q3", "Q4"), FILTER THE DATA AND ANSWER ONLY FOR THAT SPECIFIC MONTH!
   - Example Question: "What is the budget for July?"
     -> Look up July (or July 2026) in the Monthly Breakdown above.
     -> July 2026 Allocated Budget is ₱50,000.
     -> CORRECT RESPONSE: "The total allocated budget for July 2026 is ₱50,000."
     -> DO NOT state ₱100,000 or include August/other months unless the user explicitly asks for annual/total budget across all months!

2. **NEVER AGGREGATE UNRELATED MONTHS**:
   - Never combine or sum budgets from different months unless the user explicitly requests "total budget", "annual budget", "overall budget", "entire year budget", or "all months combined".
   - If the user asks about July, give ONLY July figures.

3. **MONTH-SPECIFIC CALCULATIONS**:
   - Remaining balance for a month = That Month's Budget minus That Month's Approved Expenses.

4. **DATE CONTEXT MAPPINGS**:
   - "this month" = ${currentMonthName} ${currentYear}
   - "this year" = ${currentYear}
   - "Q1" = Jan-Mar | "Q2" = Apr-Jun | "Q3" = Jul-Sep | "Q4" = Oct-Dec

6. **STRICT YEAR MATCHING & ZERO RECORD RULE**:
   - If the user specifies a YEAR (e.g., "2025", "What is the budget for 2025?"), FILTER BY THAT EXACT YEAR.
   - If ZERO budget entries exist for that requested year (e.g. 2025), YOU MUST RESPOND: "No monthly budget has been recorded for 2025."
   - NEVER return 2026 data, ₱100,000, or overall totals from another year when a specific year (like 2025) is asked!

7. **INTELLIGENT BUDGET ALLOCATION & PROJECT RECOMMENDATIONS (AI FINANCIAL ADVISOR MODE)**:
   When the user asks for suggestions, recommendations, allocation advice, project ideas, or how to spend/use the budget:

   A. FIRST, analyze the financial data for the requested period (month/year or current month if unspecified):
      - Identify: Total Budget, Total Expenses, Remaining Balance, Budget Utilization %
      - Check: Number of Approved Projects, Pending Requests, Additional Expenses

   B. IF NO BUDGET EXISTS for that period:
      - Respond: "I couldn't provide budget allocation suggestions because no monthly budget has been recorded for [period]. Please add a monthly budget first so I can generate personalized recommendations."
      - DO NOT generate generic recommendations.

   C. IF BUDGET EXISTS, structure your response into these sections:

      **Current Financial Status**:
      - State the exact budget, expenses, remaining balance, and utilization % for the period.

      **Recommended Budget Allocation**:
      - Based on the REMAINING BUDGET amount, suggest realistic allocations across SK priority categories:
        * Youth Development Programs, Sports Activities, Educational Programs
        * Environmental Projects, Health Programs, Community Outreach
        * Disaster Preparedness, Leadership Training, Skills Development, Livelihood Programs
      - Allocations must be proportional to the remaining budget (do NOT suggest ₱50,000 projects when only ₱5,000 remains).

      **Suggested Projects**:
      - Recommend 2-4 specific, actionable SK activities that are financially feasible:
        * Small budget (under ₱10,000): Clean-up Drive, Reading Program, Anti-Drug Poster Campaign, First Aid Orientation
        * Medium budget (₱10,000-₱30,000): Basketball Tournament, Youth Leadership Seminar, School Supply Distribution, Digital Literacy Workshop
        * Large budget (₱30,000+): Community Sports Festival, Feeding Program, Career Guidance Summit, Environmental Awareness Campaign, Disaster Preparedness Training
      - Only suggest projects the remaining budget can actually support.

      **Financial Advice**:
      - If utilization < 50%: Healthy spending pace, can fund new programs.
      - If utilization 50%-75%: Moderate pace, prioritize completing ongoing projects before starting new ones.
      - If utilization 75%-90%: Approaching limit, reserve funds for emergencies and pending payroll.
      - If utilization > 90%: Critical, avoid new expenses, ensure pending requests and payroll are covered first.
      - Always recommend keeping 10%-15% as a contingency reserve for unforeseen youth needs.
      - Warn if there are pending budget requests or upcoming payroll that will reduce available funds.

   D. NEVER give generic advice like "spend wisely" or "manage your budget carefully." Every recommendation must reference actual numbers from the data.

8. **TONE & FORMAT**:
   - Plain text only. Always use Philippine Peso symbol (₱) with formatted commas (e.g., ₱50,000.00).
   - Keep replies concise, friendly, warm, and accurate to the requested period.
   - When providing recommendations, organize them clearly with sections but keep the overall length reasonable.
`
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

  // Prioritize Google Gemini 1.5 Flash for Cue AI Chatbot
  const candidates = ['gemini-1.5-flash', 'gemini-flash-latest', 'gemini-2.5-flash']
  let lastError = null

  for (const model of candidates) {
    try {
      return await requestGemini(apiKey, model, systemPrompt, alternatingContents)
    } catch (err) {
      lastError = err
      console.warn(`[Cue API] [Gemini] Model ${model} failed: ${err.message}`)
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

  const totalBudget = systemContext.totals?.totalBudget ?? systemContext.totalBudget ?? 0
  const totalExpenses = systemContext.totals?.totalExpenses ?? systemContext.totalExpenses ?? 0
  const remaining = systemContext.totals?.remaining ?? systemContext.remaining ?? 0

  // 1. Log incoming context & verification queries
  console.log(`[Cue API] [Data Query] User: "${systemContext.userName || 'Unknown'}" | Role: "${systemContext.role || 'Unknown'}" | Page: "${systemContext.currentPage || 'Unknown'}"`)
  console.log(`[Cue API] [Data Query] Budget: ₱${totalBudget} | Expenses: ₱${totalExpenses} | Remaining: ₱${remaining}`)

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

  // 4. Fallback: If AI fails or is offline, use strict financial query processing
  const userMessage = messages.length > 0 ? (messages[messages.length - 1].content || '') : ''
  const fallbackReply = processFinancialQuery(userMessage, systemContext)

  return res.status(200).json({
    reply: fallbackReply,
    code: 'LOCAL_FALLBACK'
  })
}

const CUENTA_SCOPE_RESPONSE = `I'm Cue, the AI assistant for the Cuenta: SK Budget Monitoring and Document Tracking with AI Analysis system. I can only assist with questions related to this system, such as budgets, expenses, projects, events, payroll, documents, reports, AI Analysis, and system features. Please ask a question related to the Cuenta system.`

function isRelatedToCuenta(text) {
  // Keywords covering the Cuenta system's scope
  const cuentaKeywords = [
    // Financial Management
    'budget', 'expense', 'spending', 'spent', 'remaining', 'balance', 'allocation', 'allocate',
    'disbursement', 'financial', 'fund', 'funds', 'money', 'peso', 'amount', 'cost',
    'utilization', 'revenue', 'income', 'savings', 'deficit', 'surplus',
    // Projects
    'project', 'approved project', 'ongoing', 'completed', 'project budget', 'project status',
    // Events
    'event', 'activity', 'program',
    // Payroll
    'payroll', 'salary', 'honorarium', 'stipend', 'compensation',
    // Documents
    'document', 'receipt', 'narrative', 'report', 'upload', 'attachment', 'file',
    'supporting document', 'coa', 'commission on audit',
    // AI Analysis & Recommendations
    'analysis', 'insight', 'recommendation', 'recommend', 'suggest', 'suggestion', 'where to spend', 'where should', 'risk', 'trend', 'forecast', 'summary',
    'ai analysis', 'financial analysis', 'spending trend',
    // Dashboard
    'dashboard', 'chart', 'statistic', 'overview', 'total',
    // Audit
    'audit', 'log', 'trail', 'activity log', 'approval', 'pending', 'approved', 'rejected',
    // System Usage
    'how to', 'how do i', 'how can i', 'where is', 'where can', 'what is the',
    'create', 'submit', 'request', 'generate', 'update', 'profile', 'manage',
    'cuenta', 'system', 'sk', 'sangguniang kabataan', 'barangay',
    // Budget Requests
    'purchase request', 'budget request', 'requisition',
    // Dates (year/month context often related to budget queries)
    'january', 'february', 'march', 'april', 'may', 'june',
    'july', 'august', 'september', 'october', 'november', 'december',
    'this month', 'last month', 'next month', 'this year', 'last year', 'next year',
    'annual', 'monthly', 'quarterly', 'q1', 'q2', 'q3', 'q4',
    // Misc
    'category', 'breakdown', 'comparison', 'compare', 'vs', 'versus',
    'archive', 'archived', 'status', 'missing receipt',
    'user management', 'user role', 'chairman', 'treasurer', 'secretary',
    'dilg', 'procurement', 'bidding'
  ]

  // Check if the text contains any Cuenta-related keyword
  for (const keyword of cuentaKeywords) {
    if (text.includes(keyword)) return true
  }

  // Check for year patterns (e.g. 2024, 2025, 2026) — likely a budget/financial query
  if (/\b20\d\d\b/.test(text)) return true

  // Check for peso amounts (e.g. ₱50,000 or 50000)
  if (/₱/.test(text) || /\b\d{4,}\b/.test(text) && (text.includes('budget') || text.includes('expense'))) return true

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
  const isExpenseQuery = text.includes('expense') || text.includes('spent') || text.includes('spending') || text.includes('disbursement')
  const isRemainingQuery = text.includes('remaining') || text.includes('balance') || text.includes('left')
  const isSuggestionQuery = text.includes('suggest') || text.includes('recommend') || text.includes('where should') || text.includes('where to spend') || text.includes('how to spend') || text.includes('how should i use') || text.includes('how to allocate') || text.includes('allocate') || text.includes('project suggestion')

  const allBudgets = systemCtx.allBudgets || []
  const allExpenses = systemCtx.allExpenses || []
  const allRequests = systemCtx.allRequests || []

  if (isSuggestionQuery) {
    return generateRecommendation(systemCtx, allBudgets, allExpenses, allRequests, targetMonth, targetYear, currentYear)
  }

  // RULE A: SPECIFIC YEAR AND MONTH REQUESTED (e.g. "July 2026", "July 2025")
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
      if (matchingBudgets.length === 0) {
        return `No monthly budget has been recorded for ${targetMonth} ${targetYear}.`
      }
      const remainingVal = budgetTotal - expenseTotal
      return `The remaining balance for ${targetMonth} ${targetYear} is ₱${Number(remainingVal).toLocaleString('en-PH')}.`
    }

    if (matchingBudgets.length === 0) {
      return `No monthly budget has been recorded for ${targetMonth} ${targetYear}.`
    }
    return `The total allocated budget for ${targetMonth} ${targetYear} is ₱${Number(budgetTotal).toLocaleString('en-PH')}.`
  }

  // RULE B: SPECIFIC YEAR ONLY REQUESTED (e.g. "What is the budget for 2025?")
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
      if (yearBudgets.length === 0) {
        return `No monthly budget has been recorded for ${targetYear}.`
      }
      const remainingVal = budgetTotal - expenseTotal
      return `The remaining balance for ${targetYear} is ₱${Number(remainingVal).toLocaleString('en-PH')}.`
    }

    if (yearBudgets.length === 0) {
      return `No monthly budget has been recorded for ${targetYear}.`
    }
    return `The total budget recorded for ${targetYear} is ₱${Number(budgetTotal).toLocaleString('en-PH')}.`
  }

  // RULE C: SPECIFIC MONTH ONLY REQUESTED (e.g. "budget for July")
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
      if (monthBudgets.length === 0) {
        return `No monthly budget has been recorded for ${targetMonth} ${effectiveYear}.`
      }
      const remainingVal = budgetTotal - expenseTotal
      return `The remaining balance for ${targetMonth} ${effectiveYear} is ₱${Number(remainingVal).toLocaleString('en-PH')}.`
    }

    if (monthBudgets.length === 0) {
      return `No monthly budget has been recorded for ${targetMonth} ${effectiveYear}.`
    }
    return `The total allocated budget for ${targetMonth} ${effectiveYear} is ₱${Number(budgetTotal).toLocaleString('en-PH')}.`
  }

  // RULE D: EXPLICIT OVERALL TOTAL QUERY
  if (text.includes('overall') || text.includes('all years') || text.includes('total budget')) {
    const totalB = systemCtx.totals?.totalBudget || 0
    const totalR = systemCtx.totals?.remaining || 0
    if (totalB === 0) {
      return `No budgets have been recorded in the system yet.`
    }
    return `The overall total budget recorded across all years is ₱${Number(totalB).toLocaleString('en-PH')} and you have ₱${Number(totalR).toLocaleString('en-PH')} remaining.`
  }

  const totalB = systemCtx.totals?.totalBudget || 0
  const totalR = systemCtx.totals?.remaining || 0
  if (totalB === 0) {
    return `No budgets have been recorded in the system yet.`
  }
  return `Your overall total budget recorded is ₱${Number(totalB).toLocaleString('en-PH')} and you have ₱${Number(totalR).toLocaleString('en-PH')} remaining.`
}

function generateRecommendation(systemCtx, allBudgets, allExpenses, allRequests, targetMonth, targetYear, currentYear) {
  const fmt = (n) => `₱${Number(n).toLocaleString('en-PH')}`

  // Determine the period to analyze
  const effectiveYear = targetYear || currentYear
  const effectiveMonth = targetMonth || (new Date().toLocaleString('en-US', { month: 'long' }))
  const periodLabel = `${effectiveMonth} ${effectiveYear}`

  // Filter budgets and expenses for the target period
  const periodBudgets = allBudgets.filter(b =>
    Number(b.year) === effectiveYear &&
    String(b.month).toLowerCase() === effectiveMonth.toLowerCase()
  )
  const periodExpenses = allExpenses.filter(e =>
    Number(e.year) === effectiveYear &&
    String(e.month).toLowerCase() === effectiveMonth.toLowerCase()
  )
  const pendingRequests = (allRequests || []).filter(r =>
    String(r.status).toLowerCase() === 'pending'
  )

  const budgetTotal = periodBudgets.reduce((sum, b) => sum + (Number(b.amount) || 0), 0)
  const expenseTotal = periodExpenses.reduce((sum, e) => sum + (Number(e.amount) || 0), 0)
  const remaining = budgetTotal - expenseTotal
  const utilization = budgetTotal > 0 ? Math.round((expenseTotal / budgetTotal) * 100) : 0

  // NO BUDGET EXISTS — cannot generate recommendations
  if (periodBudgets.length === 0 || budgetTotal === 0) {
    return `I couldn't provide budget allocation suggestions because no monthly budget has been recorded for ${periodLabel}. Please add a monthly budget first so I can generate personalized recommendations.`
  }

  // Build the recommendation response
  let response = ''

  // SECTION 1: Current Financial Status
  response += `📊 Current Financial Status for ${periodLabel}:\n`
  response += `• Allocated Budget: ${fmt(budgetTotal)}\n`
  response += `• Total Expenses: ${fmt(expenseTotal)}\n`
  response += `• Remaining Balance: ${fmt(remaining)}\n`
  response += `• Budget Utilization: ${utilization}%\n`
  if (pendingRequests.length > 0) {
    const pendingTotal = pendingRequests.reduce((sum, r) => sum + (Number(r.amount) || 0), 0)
    response += `• Pending Requests: ${pendingRequests.length} (totaling ${fmt(pendingTotal)})\n`
  }

  // SECTION 2: Recommended Budget Allocation
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

  // SECTION 3: Suggested Projects (proportional to remaining budget)
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

  // SECTION 4: Financial Advice
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

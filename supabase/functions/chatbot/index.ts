// @ts-nocheck
// supabase/functions/chatbot/index.ts
// Cue AI Chatbot — Groq API (llama-3.3-70b-versatile)
// Supabase Edge Function for the Cuenta SK Budget Monitoring System

// @ts-ignore
import { serve } from 'https://deno.land/std@0.224.0/http/server.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// ================================================================
// System Prompt Builder — mirrors the full logic from api/chat/index.js
// ================================================================

function buildSystemPrompt(ctx: any) {
  const {
    role = 'SK Official',
    userName = 'the user',
    currentPage = 'Dashboard',
    currentYear = new Date().getFullYear(),
    currentMonthName = 'August',
    totals = {} as any,
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
    ? monthlySummaries.map((m: any) => `- ${m.month} ${m.year}: Allocated Budget = ₱${Number(m.allocatedBudget).toLocaleString('en-PH')} | Total Expenses = ₱${Number(m.totalExpenses).toLocaleString('en-PH')} | Remaining = ₱${Number(m.remainingBalance).toLocaleString('en-PH')} (Source: ${m.sources})`).join('\n')
    : '- No monthly breakdown recorded yet.'

  const budgetsText = (allBudgets && allBudgets.length > 0)
    ? allBudgets.map((b: any) => `- Month: ${b.month} ${b.year} | Amount: ₱${Number(b.amount).toLocaleString('en-PH')} | Source: ${b.source}`).join('\n')
    : '- No individual budget entries.'

  const expensesText = (allExpenses && allExpenses.length > 0)
    ? allExpenses.map((e: any) => `- "${e.project}" | Month: ${e.month || 'Unspecified'} ${e.year} | Amount: ₱${Number(e.amount).toLocaleString('en-PH')} | Category: ${e.category} | Status: ${e.status}`).join('\n')
    : '- No expense records.'

  const requestsText = (allRequests && allRequests.length > 0)
    ? allRequests.map((r: any) => `- "${r.event}" | Month: ${r.month || 'Unspecified'} ${r.year} | Amount: ₱${Number(r.amount).toLocaleString('en-PH')} | Status: ${r.status} | Category: ${r.category}`).join('\n')
    : '- No pending requests.'

  const categoriesText = (topCategories && topCategories.length > 0)
    ? topCategories.map((c: any) => `- ${c.name}: ₱${Number(c.total).toLocaleString('en-PH')}`).join('\n')
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

5. TOP SPENDING CATEGORIES:
${categoriesText}

6. OVERALL ANNUAL / TOTAL SYSTEM SUMMARY (USE ONLY WHEN ASKED FOR TOTAL / ANNUAL / OVERALL BUDGET):
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

// ================================================================
// Main Edge Function Handler
// ================================================================

serve(async (req: Request) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  // @ts-ignore
  const groqApiKey = Deno.env.get('GROQ_API_KEY')

  if (!groqApiKey) {
    console.error('[Cue Edge Function] GROQ_API_KEY is not set in Supabase secrets.')
    return new Response(JSON.stringify({ error: 'AI service API key is not configured.', code: 'AUTH_ERROR' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  let body: any = {}
  try {
    body = await req.json()
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid request body' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  const { messages = [], systemContext = {} } = body

  if (!messages || messages.length === 0) {
    return new Response(JSON.stringify({ error: 'Missing messages' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  // Build the system prompt with full financial context
  const systemPrompt = buildSystemPrompt(systemContext)

  // Format messages for Groq (OpenAI-compatible format)
  const formattedMessages = [
    { role: 'system', content: systemPrompt },
    ...messages.map((m: any) => ({
      role: m.role === 'assistant' ? 'assistant' : 'user',
      content: m.content,
    })),
  ]

  const totalBudget = systemContext.totals?.totalBudget ?? systemContext.totalBudget ?? 0
  const totalExpenses = systemContext.totals?.totalExpenses ?? systemContext.totalExpenses ?? 0
  const remaining = systemContext.totals?.remaining ?? systemContext.remaining ?? 0

  console.log(`[Cue Edge Function] User: "${systemContext.userName || 'Unknown'}" | Role: "${systemContext.role || 'Unknown'}" | Page: "${systemContext.currentPage || 'Unknown'}"`)
  console.log(`[Cue Edge Function] Budget: ₱${totalBudget} | Expenses: ₱${totalExpenses} | Remaining: ₱${remaining}`)
  console.log(`[Cue Edge Function] Sending ${formattedMessages.length} messages to Groq (llama-3.3-70b-versatile)...`)

  try {
    const groqResponse = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${groqApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
        messages: formattedMessages,
        temperature: 0.5,
        max_tokens: 800,
      }),
    })

    if (!groqResponse.ok) {
      const errorText = await groqResponse.text()
      console.error(`[Cue Edge Function] Groq API error: ${groqResponse.status} — ${errorText}`)
      return new Response(JSON.stringify({
        error: `Groq API error: ${groqResponse.status}`,
        code: 'AI_ERROR',
      }), {
        status: 502,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const data = await groqResponse.json()
    const replyText = data.choices?.[0]?.message?.content || ''

    console.log(`[Cue Edge Function] Success! Generated response (${replyText.length} chars)`)

    return new Response(JSON.stringify({ reply: replyText.trim() }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })

  } catch (err: any) {
    console.error(`[Cue Edge Function] Unexpected error: ${err.message}`)
    return new Response(JSON.stringify({
      error: 'Failed to generate AI response.',
      code: 'AI_ERROR',
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})

// @ts-ignore
import { serve } from 'https://deno.land/std@0.224.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// @ts-ignore
const geminiModel = Deno.env.get('GEMINI_MODEL') || 'gemini-1.5-flash'
const geminiEndpoint = `https://generativelanguage.googleapis.com/v1beta/models/${geminiModel}:generateContent`

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
]

const buildSystemPrompt = (context: any) => {
  return `You are Cue, the dedicated AI assistant for the "Cuenta: SK Budget Monitoring and Document Tracking with AI Analysis" system — built exclusively for the Sangguniang Kabataan (SK) of Barangay Upper Glad II, Midsayap, Cotabato, Philippines.

User Role: ${context.role || 'SK Official'}

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
REAL-TIME SYSTEM DATA & MONTHLY BREAKDOWN:
================================================================
<CONTEXT>
${JSON.stringify(context, null, 2)}
</CONTEXT>

CRITICAL FILTERING & RESPONSE ACCURACY RULES:
1. **DETECT REQUESTED MONTH & YEAR**:
   - If the user asks about a specific month (e.g. "July", "budget for July", "July 2026", "this month", "last month", "next month", "Q1", "Q2", "Q3", "Q4"), FILTER THE DATA AND RETURN ONLY THAT SPECIFIC MONTH'S RECORD!
   - Example Question: "What is the budget for July?"
     -> Look up July in the monthlySummaries / rawBudgets context.
     -> If July 2026 budget is ₱50,000, answer: "The total allocated budget for July 2026 is ₱50,000."
     -> DO NOT state ₱100,000 or combine other months unless explicitly asked for total annual/overall budget!

2. **NEVER AGGREGATE UNRELATED MONTHS**:
   - Never combine or sum budgets from different months unless the user explicitly requests "total budget", "annual budget", "overall budget", "entire year budget", or "all months combined".

3. **STRICT YEAR MATCHING & ZERO RECORD RULE**:
   - If the user specifies a YEAR (e.g., "2025"), FILTER BY THAT EXACT YEAR.
   - If ZERO budget entries exist for that year, RESPOND: "No monthly budget has been recorded for 2025."
   - NEVER return data from another year when a specific year is asked!

4. **MONTH-SPECIFIC CALCULATIONS**:
   - Remaining balance for a month = That Month's Allocated Budget minus That Month's Approved Expenses.

5. **INTELLIGENT BUDGET ALLOCATION & PROJECT RECOMMENDATIONS (AI FINANCIAL ADVISOR MODE)**:
   When the user asks for suggestions, recommendations, allocation advice, project ideas, or how to spend/use the budget:

   A. FIRST, analyze the financial data for the requested period. Identify: Total Budget, Total Expenses, Remaining Balance, Budget Utilization %.

   B. IF NO BUDGET EXISTS for that period:
      - Respond: "I couldn't provide budget allocation suggestions because no monthly budget has been recorded for [period]. Please add a monthly budget first so I can generate personalized recommendations."

   C. IF BUDGET EXISTS, structure your response with these sections:
      **Current Financial Status**: State exact budget, expenses, remaining balance, utilization % for the period.
      **Recommended Budget Allocation**: Suggest proportional allocations across Youth Development, Sports, Education, Environment, Health, Disaster Preparedness, Leadership Training, and Contingency Reserve (10-15%).
      **Suggested Projects**: Recommend 2-4 specific, financially feasible SK activities:
        * Small budget (under ₱10,000): Clean-up Drive, Reading Program, Anti-Drug Poster Campaign, First Aid Orientation
        * Medium budget (₱10,000-₱30,000): Basketball Tournament, Youth Leadership Seminar, School Supply Distribution, Digital Literacy Workshop
        * Large budget (₱30,000+): Community Sports Festival, Feeding Program, Career Guidance Summit, Disaster Preparedness Training
      **Financial Advice**: Based on utilization level (healthy <50%, moderate 50-75%, high 75-90%, critical >90%).

   D. NEVER give generic advice. Every recommendation must reference actual numbers from the data.

6. **FORMATTING**:
   - Always use the Philippine Peso (₱) symbol. Format numbers with commas (e.g., ₱50,000.00).
   - Be concise, friendly, warm, and accurate to the requested period.
   - When providing recommendations, organize them clearly with sections.`
}

serve(async (req: any) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  if (req.method !== 'POST') {
    return new Response('Method Not Allowed', {
      status: 405,
      headers: corsHeaders,
    })
  }

  // @ts-ignore
  const apiKey = Deno.env.get('GEMINI_API_KEY')
  // @ts-ignore
  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  // @ts-ignore
  const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')

  if (!apiKey || !supabaseUrl || !supabaseAnonKey) {
    return new Response(JSON.stringify({ error: 'Missing configuration variables' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  let body: any = {}
  try {
    body = await req.json()
  } catch {
    body = {}
  }

  const { input = '', messages = [], role = 'Viewer' } = body

  if (!input && (!messages || messages.length === 0)) {
    return new Response(JSON.stringify({ error: 'Missing input or messages' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  // 1. Initialize Supabase client with the user's Auth token for strict RLS
  const authHeader = req.headers.get('Authorization')
  const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: authHeader || '' } }
  })

  // 2. Perform Real-Time Database Queries
  const [
    { data: budgets },
    { data: expenses },
    { data: requests },
    { data: documents }
  ] = await Promise.all([
    supabase.from('budgets').select('*'),
    supabase.from('expenses').select('*').is('archived_at', null).neq('status', 'Cancelled'),
    supabase.from('budget_requests').select('*'),
    supabase.from('documents').select('*')
  ])

  // 3. Perform Verified Backend Calculations & Monthly Breakdown
  let totalBudget = 0
  let totalExpenses = 0

  const safeBudgets = budgets || []
  const safeExpenses = expenses || []
  const safeRequests = requests || []
  const safeDocuments = documents || []

  safeBudgets.forEach((b: any) => { totalBudget += Number(b.amount || 0) })
  safeExpenses.forEach((e: any) => { totalExpenses += Number(e.amount || e.total || 0) })

  const remainingBalance = totalBudget - totalExpenses
  const budgetUtilization = totalBudget > 0 ? ((totalExpenses / totalBudget) * 100).toFixed(2) + '%' : '0%'

  const currentYear = new Date().getFullYear()
  const monthlySummaries: any[] = []

  const formattedBudgets = safeBudgets.map((b: any) => {
    const mNum = Number(b.month)
    const mName = typeof b.month === 'number' || !isNaN(mNum) ? MONTH_NAMES[mNum - 1] : String(b.month)
    return { ...b, monthName: mName, monthNumber: mNum, year: Number(b.year), amount: Number(b.amount || 0) }
  })

  for (let m = 1; m <= 12; m++) {
    const mName = MONTH_NAMES[m - 1]
    const mBudgets = formattedBudgets.filter((b: any) => b.year === currentYear && (b.monthNumber === m || b.monthName === mName))
    const mBudgetTotal = mBudgets.reduce((sum: number, b: any) => sum + b.amount, 0)
    
    if (mBudgetTotal > 0) {
      monthlySummaries.push({
        month: mName,
        year: currentYear,
        allocatedBudget: mBudgetTotal,
        source: mBudgets.map((b: any) => b.source || 'Regular SK Budget').join(', ')
      })
    }
  }

  const dbContext = {
    role,
    currentYear,
    currentMonthName: MONTH_NAMES[new Date().getMonth()],
    verifiedCalculations: {
      totalBudget,
      totalExpenses,
      remainingBalance,
      budgetUtilization,
      totalBudgetsAdded: safeBudgets.length,
      totalActiveExpenses: safeExpenses.length,
      totalRequests: safeRequests.length,
      totalDocuments: safeDocuments.length
    },
    monthlySummaries,
    rawBudgets: formattedBudgets,
    rawExpenses: safeExpenses,
    rawRequests: safeRequests,
    rawDocuments: safeDocuments,
  }

  // Format history for Gemini
  const formattedContents = []
  let isFirstUserMessage = true;

  for (const msg of messages) {
    let text = msg.content || '';
    if (msg.role === 'user' && isFirstUserMessage) {
      text = buildSystemPrompt(dbContext) + '\n\nUser Question:\n' + text;
      isFirstUserMessage = false;
    }
    formattedContents.push({
      role: msg.role === 'assistant' ? 'model' : 'user',
      parts: [{ text }]
    })
  }

  if (formattedContents.length === 0 && input) {
    formattedContents.push({
      role: 'user',
      parts: [{ text: buildSystemPrompt(dbContext) + '\n\nUser Question:\n' + input }]
    })
  }

  const response = await fetch(`${geminiEndpoint}?key=${apiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: formattedContents,
    }),
  })

  if (!response.ok) {
    const errorText = await response.text()
    return new Response(JSON.stringify({ error: errorText }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  const data = await response.json()
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text ?? 'I could not generate a response.'

  return new Response(JSON.stringify({ content: text }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
})



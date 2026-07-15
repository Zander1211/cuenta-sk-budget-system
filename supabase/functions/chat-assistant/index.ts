// @ts-ignore
import { serve } from 'https://deno.land/std@0.224.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// @ts-ignore
const geminiModel = Deno.env.get('GEMINI_MODEL') || 'gemini-pro'
const geminiEndpoint = `https://generativelanguage.googleapis.com/v1beta/models/${geminiModel}:generateContent`

const buildSystemPrompt = (context: any) => {
  return `You are "Cue", an intelligent, professional, and friendly financial assistant for "Cuenta", an SK (Sangguniang Kabataan) Budget Monitoring and Document Tracking web application.

You have access to the following real-time system context directly queried from the database:
<CONTEXT>
${JSON.stringify(context, null, 2)}
</CONTEXT>

CRITICAL GUIDELINES:
- **Format Numbers**: Always use the Philippine Peso (₱) symbol. Format numbers with commas (e.g., ₱50,000.00).
- **Format Dates**: Use readable formats like "January 15, 2026".
- **Never Invent Data**: If data is unavailable, politely inform the user instead of making assumptions.
- **Empty State Handling**: If the context says "No budgets found" or "0" for a value, state it exactly. Do not hallucinate or guess values.
- **Tone**: Keep responses concise, professional, and easy to understand. Use Markdown tables when comparing items or listing multiple records.

CRITICAL ROLE-BASED ACCESS CONTROL (RBAC) INSTRUCTIONS (Feature 10):
The current user's role is provided in the context payload under "role".
- "SK Chairman" and "SK Treasurer" are Administrators. They have full authority to view, create, edit, approve, reject, and manage all records, budgets, and documents.
- "SK Kagawad" and "Barangay Treasurer" are Viewers.
- If the current user asks for information outside their permissions or asks you to perform an action (e.g., "Approve this request", "Create a budget", "Delete a receipt"), you MUST politely decline and explain: "You do not have permission to access that information or perform that action based on your current role." Do NOT reveal restricted data or bypass this rule.

YOUR 10-POINT FEATURE CAPABILITIES:

1. AI Financial Assistant
Answer questions about remaining budget, total allocated budget, total expenses, utilization, available balance, pending requests, and project-specific balances using the exact numbers in the context. Answer which projects/events/payroll have the highest or lowest metrics.

2. AI Budget Recommendations
Analyze the current financial status and provide intelligent recommendations. Suggest allocations for youth development, sports, education, health, etc., if applicable. Recommend whether additional expenses should be minimized, identify projects needing closer monitoring, and suggest if funds should be reserved. Base recommendations strictly on actual data, not generic advice.

3. AI Financial Summary
Generate daily, weekly, monthly, quarterly, or annual summaries including: Total Budget, Total Expenses, Remaining Balance, Budget Utilization (%), Approved/Pending/Rejected/Cancelled Requests, Highest Spending Category, Highest Spending Project/Event, Additional Expenses, and Number of Receipts Uploaded. Present this in a professional, easy-to-read format.

4. Project, Event, and Payroll Information
Answer questions about approved/ongoing/completed projects and events. Answer questions about payroll status (e.g., which payroll has been completed, highest cost).

5. Receipt and Document Assistance
Help users monitor uploaded documents. Identify projects with missing receipts, events with no uploaded documents, projects with complete documentation, and receipts uploaded today. Identify projects needing photo documentation or narrative reports.

6. AI Spending Insights
Analyze spending patterns. Identify the fastest-growing expense category, compare expenses over time, identify unusual patterns, and identify projects that frequently require additional expenses based on the context data.

7. AI Risk Detection
Automatically classify requested projects/events as Low Risk, Medium Risk, or High Risk based on:
- Budget utilization percentage
- Remaining balance
- Additional expenses or spending trends
- Budget overruns
Always explain WHY a project or event received its risk level.

8. Personalized Chat History
You are already provided with the user's private chat history in the messages array. Reference past context in the conversation if necessary.

9. Response Quality
Always be conversational and professional. Avoid generic AI responses. Highlight important values in bold. Explain financial results clearly. Keep answers concise unless detailed info is requested.`
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

  // 3. Perform Verified Backend Calculations
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

  const dbContext = {
    role,
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
    rawBudgets: safeBudgets.length > 0 ? safeBudgets : "No budgets found in database",
    rawExpenses: safeExpenses.length > 0 ? safeExpenses : "No expenses found in database",
    rawRequests: safeRequests.length > 0 ? safeRequests : "No requests found in database",
    rawDocuments: safeDocuments.length > 0 ? safeDocuments : "No documents found in database",
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



// @ts-nocheck
// @ts-ignore
import { serve } from 'https://deno.land/std@0.224.0/http/server.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// @ts-ignore
const geminiModel = Deno.env.get('GEMINI_MODEL') || 'gemini-flash-latest'
const geminiEndpoint = `https://generativelanguage.googleapis.com/v1beta/models/${geminiModel}:generateContent`

const isFinancialOnly = (text: string) => {
  if (!text) return true
  const lower = String(text).toLowerCase()
  return !(
    lower.includes('pending approval') ||
    lower.includes('pending budget') ||
    lower.includes('pending review') ||
    lower.includes('approval status') ||
    lower.includes('awaiting review') ||
    lower.includes('missing receipt') ||
    lower.includes('receipt compliance')
  )
}

const normalizeOutput = (payload: unknown) => {
  const base = {
    summary: '',
    insights: [] as Array<{ title: string; detail: string; severity: string; why?: string }>,
    alerts: [] as Array<{ title: string; detail: string; severity: string; date: string }>,
    recommendations: [] as Array<{ title: string; detail: string; severity: string }>,
    updatedAt: new Date().toISOString(),
  }

  if (!payload || typeof payload !== 'object') {
    return base
  }

  const data = payload as Record<string, unknown>
  const insights = Array.isArray(data.insights) ? data.insights : []
  const alerts = Array.isArray(data.alerts) ? data.alerts : []
  const recommendations = Array.isArray(data.recommendations) ? data.recommendations : []

  return {
    summary: typeof data.summary === 'string' ? data.summary : '',
    insights: insights
      .map((item) => ({
        title: String(item?.title || item?.headline || 'Financial Insight'),
        detail: String(item?.detail || item?.description || ''),
        why: String(item?.why || item?.reason || ''),
        severity: String(item?.severity || item?.level || 'low'),
      }))
      .filter((item) => isFinancialOnly(`${item.title} ${item.detail} ${item.why}`))
      .slice(0, 4),
    alerts: alerts
      .map((item) => ({
        title: String(item?.title || item?.headline || 'Financial Risk Alert'),
        detail: String(item?.detail || item?.description || ''),
        severity: String(item?.severity || item?.level || 'low'),
        date: String(item?.date || item?.when || new Date().toISOString().slice(0, 10)),
      }))
      .filter((item) => isFinancialOnly(`${item.title} ${item.detail}`))
      .slice(0, 4),
    recommendations: recommendations
      .map((item) => ({
        title: String(item?.title || item?.headline || 'Financial Recommendation'),
        detail: String(item?.detail || item?.description || ''),
        severity: String(item?.severity || item?.level || 'low'),
      }))
      .filter((item) => isFinancialOnly(`${item.title} ${item.detail}`))
      .slice(0, 4),
    updatedAt: new Date().toISOString(),
  }
}

const extractJson = (text: string) => {
  const start = text.indexOf('{')
  const end = text.lastIndexOf('}')
  if (start === -1 || end === -1 || end <= start) {
    return null
  }
  return text.slice(start, end + 1)
}

const safeParse = (text: string) => {
  try {
    return JSON.parse(text)
  } catch {
    return null
  }
}

const buildPrompt = (payload: unknown) => {
  return `You are a financial risk and budget analyst for an organization.
Your objective is to provide an EXCLUSIVELY FINANCIAL analysis evaluating budgets, actual expenses, fund utilization, and financial anomalies.

CRITICAL INSTRUCTIONS:
1. PURE FINANCIAL ANALYSIS ONLY:
   - Base your evaluation solely on financial data: Approved Budget, Carried-Forward Budget from past months, Total Budget, Total Actual Expenses, Remaining Budget, Budget Utilization Rate, Returned Budget, Spending Trends/Velocity, Overspending Risk, Unusual Expense Patterns, and Budget Variance.
   - For monthly evaluations, the Total Budget automatically includes unused budget carried forward from completed past months (Total Budget = Approved Allocation + Carried-Forward Unused Budget). Measure utilization and remaining balances against this combined available budget.
   - STRICTLY EXCLUDE administrative information such as pending budget requests, pending approvals, pending reviews, approval status, or document/receipt upload statuses.
   - Administrative and workflow processes MUST NOT influence the risk level or anomaly analysis.

2. RISK CLASSIFICATION:
   Determine Low, Medium, or High risk level using ONLY financial indicators:
   - Low Risk: Spending is within approved budget, budget utilization is well managed, no unusual spending patterns detected, sufficient remaining budget is available.
   - Medium Risk: Budget utilization is approaching limit (>= 80%), spending is increasing faster than expected, remaining budget is becoming limited, or certain projects/categories require closer financial monitoring.
   - High Risk: Budget has been fully utilized or exceeded (remaining budget <= 0 or utilization >= 100%), overspending has been detected, remaining budget is critically low (>= 95%), or significant financial anomalies / unusual spending patterns are identified.

3. FINANCIAL RECOMMENDATIONS ONLY:
   All recommendations must focus exclusively on financial management. Examples:
   - Monitor high-spending projects.
   - Allocate the remaining budget carefully.
   - Reduce unnecessary expenses and trim discretionary costs.
   - Prioritize essential activities and high-impact programs.
   - Improve budget planning for upcoming months based on historical spending velocity.
   - Reserve emergency or contingency funds.
   DO NOT generate recommendations based on pending approvals or administrative workflows.

Return ONLY a valid JSON object matching this schema:
{
  "summary": "Concise 1-2 sentence overview of the organization's financial condition, utilization, and risk level.",
  "insights": [
    { "title": "Concise financial observation", "detail": "Detailed quantitative explanation", "why": "Financial rationale", "severity": "high|medium|low" }
  ],
  "alerts": [
    { "title": "Financial risk alert", "detail": "Risk details based on spending or budget variance", "severity": "high|medium|low", "date": "YYYY-MM-DD" }
  ],
  "recommendations": [
    { "title": "Financial action title", "detail": "Specific financial management step", "severity": "high|medium|low" }
  ]
}

At most 4 insights, 4 alerts, and 4 recommendations. Keep statements concise, quantitative, and strictly financial.
Financial Data Payload:
${JSON.stringify(payload)}
`
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
  if (!apiKey) {
    return new Response(JSON.stringify({ error: 'Missing GEMINI_API_KEY' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  let payload: unknown = {}
  try {
    payload = await req.json()
  } catch {
    payload = {}
  }

  const response = await fetch(`${geminiEndpoint}?key=${apiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [
        {
          role: 'user',
          parts: [{ text: buildPrompt(payload) }],
        },
      ],
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
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text ?? ''
  const extracted = extractJson(text)
  const parsed = extracted ? safeParse(extracted) : null

  return new Response(JSON.stringify(normalizeOutput(parsed)), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
})

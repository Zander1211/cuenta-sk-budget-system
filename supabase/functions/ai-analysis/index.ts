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

const normalizeOutput = (payload: unknown) => {
  const base = {
    summary: '',
    insights: [] as Array<{ title: string; detail: string; severity: string }>,
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
        title: String(item?.title || item?.headline || 'Insight'),
        detail: String(item?.detail || item?.description || ''),
        severity: String(item?.severity || item?.level || 'low'),
      }))
      .slice(0, 4),
    alerts: alerts
      .map((item) => ({
        title: String(item?.title || item?.headline || 'Alert'),
        detail: String(item?.detail || item?.description || ''),
        severity: String(item?.severity || item?.level || 'low'),
        date: String(item?.date || item?.when || new Date().toISOString().slice(0, 10)),
      }))
      .slice(0, 4),
    recommendations: recommendations
      .map((item) => ({
        title: String(item?.title || item?.headline || 'Recommendation'),
        detail: String(item?.detail || item?.description || ''),
        severity: String(item?.severity || item?.level || 'low'),
      }))
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
  return `You are a finance analyst for a local government office.
Please provide intelligent recommendations on how to allocate and manage budgets effectively to avoid overspending.
Analyze the following aspects: previous projects, events, recorded expenses, budget allocations, remaining balances, and spending trends.
Based on this analysis, provide recommendations such as:
- How the remaining budget can be utilized effectively for ongoing projects or events.
- Suggestions for improving budget allocation in future projects and events.
- Recommendations for reducing unnecessary expenses.
- Budget planning strategies for the next month based on historical spending patterns.
- Suggested allocations for upcoming activities, projects, and events.
- Areas where funds can be optimized to maximize community impact.
- Insights on whether the current spending pattern is sustainable.
- Recommendations for reserving emergency or contingency funds.
- Forecasts and suggestions for future budget requirements based on previous expenditures.

Return ONLY JSON with this schema:
{
  "summary": "short sentence overview of financial health",
  "insights": [
    { "title": "...", "detail": "...", "severity": "high|medium|low" }
  ],
  "alerts": [
    { "title": "...", "detail": "...", "severity": "high|medium|low", "date": "YYYY-MM-DD" }
  ],
  "recommendations": [
    { "title": "...", "detail": "...", "severity": "high|medium|low" }
  ]
}
Use at most 4 insights, 4 alerts, and 4 recommendations. Keep statements concise.
Data:
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

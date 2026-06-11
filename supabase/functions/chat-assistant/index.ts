// @ts-ignore
import { serve } from 'https://deno.land/std@0.224.0/http/server.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// @ts-ignore
const geminiModel = Deno.env.get('GEMINI_MODEL') || 'gemini-pro'
const geminiEndpoint = `https://generativelanguage.googleapis.com/v1beta/models/${geminiModel}:generateContent`

const buildPrompt = (input: string, context: unknown) => {
  return `You are "Cue", an intelligent financial assistant for a local government office (SK).
You have access to the following context regarding budgets, expenses, requests, and logs:
${JSON.stringify(context)}

The user asks: "${input}"

Guidelines for your response:
1. Always respond in structured Markdown.
2. If the user asks about how to spend the budget for a specific project/event (e.g. "Basketball Tournament"), provide a structured response including:
   - Recommended budget allocation by category
   - Suggested spending priorities
   - Estimated costs for common expenses
   - Cost-saving recommendations
   - Risk areas that could lead to overspending
   - Remaining budget management suggestions
   - Recommendations for future improvements
3. If the user asks for a summary of a completed project or event, analyze the data to explain:
   - How the budget was spent
   - Major expense categories
   - Remaining funds (if any)
   - Budget efficiency
   - Recommendations for future projects or events
4. If the user asks general questions about the budget, use the context to give an accurate, polite, and detailed answer.
5. If the question is outside of financial/budget scope, gracefully guide the user back to budget topics.
6. Do NOT invent data unless providing estimates as explicitly requested for planning. Use the provided context where applicable.

Provide your response directly in Markdown format.`
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

  let body: any = {}
  try {
    body = await req.json()
  } catch {
    body = {}
  }

  const { input = '', contextPayload = {} } = body

  if (!input) {
    return new Response(JSON.stringify({ error: 'Missing input' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  const response = await fetch(`${geminiEndpoint}?key=${apiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [
        {
          role: 'user',
          parts: [{ text: buildPrompt(input, contextPayload) }],
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
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text ?? 'I could not generate a response.'

  return new Response(JSON.stringify({ content: text }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
})

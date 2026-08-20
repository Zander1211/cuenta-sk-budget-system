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

  /*
   * An approved request becomes an expense row, so allExpenses IS the list of
   * projects and events. It used to be rendered as one block headed "APPROVED
   * & RECORDED EXPENSES", which meant nothing in the prompt was labelled a
   * project or an event — so "list all approved projects" was answered, quite
   * logically, with "No approved projects are recorded in the system" while
   * the Projects & Events page showed four. They are split by type here, and
   * each line carries its approval status and its Ongoing/Completed progress.
   */
  const liveRecords = (allExpenses || []).filter((e: any) => !e.isAdditional && !e.archived)

  const describeRecord = (e: any) => {
    const parts = [
      `- "${e.project}"`,
      `Category: ${e.category || 'Uncategorized'}`,
      `Amount: ₱${Number(e.amount).toLocaleString('en-PH')}`,
      `Month: ${e.month || 'Unspecified'} ${e.year}`,
      `Approval: ${e.status || 'Approved'}`,
    ]
    if (e.projectStatus) parts.push(`Progress: ${e.projectStatus}`)
    if (e.venue) parts.push(`Venue: ${e.venue}`)
    return parts.join(' | ')
  }

  const renderGroup = (rows: any[], emptyLabel: string) =>
    rows.length > 0 ? rows.map(describeRecord).join('\n') : emptyLabel

  /*
   * Older clients do not send `type` at all. The projects filter still catches
   * every record (it accepts a missing type), but the events and payroll
   * filters match nothing — so the prompt would state "No approved events
   * recorded" while four approved events sat in the projects list above it.
   * That is asserting something false about real data, which is exactly the
   * failure this whole section exists to prevent.
   *
   * When no record carries a type, those two empty labels stop making a claim
   * and point at the combined list instead.
   */
  const typesReported = liveRecords.some((e: any) => !!e.type)

  const untypedNote = (kind: string) =>
    `- The record type is not reported by this client version, so ${kind} cannot be listed separately. ` +
    `The APPROVED PROJECTS section above contains ALL approved records, ${kind} included. ` +
    `Answer ${kind} questions from that list and say the type is not distinguished. ` +
    `Do NOT reply that no ${kind} are recorded.`

  const emptyLabelFor = (kind: string) =>
    (!typesReported && liveRecords.length > 0)
      ? untypedNote(kind)
      : `- No approved ${kind} recorded.`

  const projectsText = renderGroup(
    liveRecords.filter((e: any) => !e.type || e.type === 'Project'),
    '- No approved projects recorded.'
  )
  const eventsText = renderGroup(
    liveRecords.filter((e: any) => e.type === 'Event'),
    emptyLabelFor('events')
  )
  const payrollText = renderGroup(
    liveRecords.filter((e: any) => e.type === 'Payroll'),
    emptyLabelFor('payroll records')
  )

  const additionalText = (allExpenses || []).filter((e: any) => e.isAdditional).length > 0
    ? (allExpenses || []).filter((e: any) => e.isAdditional).map(describeRecord).join('\n')
    : '- No additional expenses recorded.'

  const expensesText = liveRecords.length > 0
    ? liveRecords.map(describeRecord).join('\n')
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

NEVER use that refusal for a question about budgets, expenses, projects, events, payroll, documents, receipts, reports, months, quarters or years. Those are IN SCOPE even when the answer turns out to be that nothing is recorded. "What is the budget for 2024?" is a Cuenta data question, not an unrelated one — the correct reply is that no budget is recorded for 2024, NOT the refusal above. A bare month, quarter or year is always a data question. Reserve the refusal for topics genuinely outside the system, such as sports results, weather, celebrities or programming help.

================================================================
REAL-TIME FINANCIAL DATA & MONTHLY BREAKDOWN:
================================================================

1. MONTHLY BUDGET & SUMMARY BREAKDOWN (PRIMARY SOURCE FOR MONTH QUESTIONS):
${monthlySummariesText}

2. RECORDED MONTHLY BUDGET ALLOCATIONS:
${budgetsText}

3. APPROVED PROJECTS (this IS the project list — answer every "list/how many/newest project" question from here):
${projectsText}

4. APPROVED EVENTS (this IS the event list — answer every "list/how many/newest event" question from here):
${eventsText}

5. APPROVED PAYROLL:
${payrollText}

6. ADDITIONAL EXPENSES (extra costs attached to an approved project or event):
${additionalText}

7. ALL APPROVED SPENDING RECORDS COMBINED (projects + events + payroll):
${expensesText}

8. BUDGET REQUESTS (submitted; not all are approved yet):
${requestsText}

9. TOP SPENDING CATEGORIES:
${categoriesText}

10. OVERALL ANNUAL / TOTAL SYSTEM SUMMARY (USE ONLY WHEN ASKED FOR TOTAL / ANNUAL / OVERALL BUDGET):
- Overall Total Budget (All Months Combined): ₱${Number(totalBudget).toLocaleString('en-PH')}
- Overall Total Expenses: ₱${Number(totalExpenses).toLocaleString('en-PH')}
- Overall Remaining Balance: ₱${Number(remaining).toLocaleString('en-PH')}
- Overall Budget Utilization: ${budgetUtilization}%

================================================================
STRICT FILTERING & RESPONSE ACCURACY RULES:
================================================================

0. **THE DATA BLOCK ABOVE IS THE ONLY SOURCE OF FACT**:
   - Every peso figure, month, project name and status you state MUST be copied from the REAL-TIME FINANCIAL DATA section above.
   - This instruction block contains NO financial data. Any number appearing in these rules is a formatting placeholder, never a value to report.
   - If a figure the user asks for is not present in the data block, say it is not recorded. NEVER estimate, infer, or invent a number.

1. **DETECT USER'S REQUESTED MONTH & YEAR**:
   - When the user asks about a specific month (e.g., "budget for July", "July 2026", "this month", "last month", "next month", "Q1", "Q2", "Q3", "Q4"), FILTER THE DATA AND ANSWER ONLY FOR THAT SPECIFIC MONTH.
   - Procedure: find that exact "Month Year" line in the MONTHLY BUDGET & SUMMARY BREAKDOWN above, then report the figures written on that line and nothing else.
   - If that "Month Year" has NO line in the breakdown, respond: "No monthly budget has been recorded for <month> <year>." Never substitute another month's line or the overall totals for a month that has no line.
   - Only when the user asks for the ALLOCATED budget (plain "budget", "allocated budget", "allocation" — with none of the implementation words in rule 1B), answer in the form: "The total allocated budget for <month> <year> is <the Allocated Budget shown on that line>."
   - Do NOT include other months, and do NOT substitute the overall/annual totals, unless the user explicitly asks for the annual or overall figure.

1B. **IMPLEMENTED / UTILIZED / SPENT BUDGET IS NOT THE ALLOCATED BUDGET**:
   - The words "implemented", "implementation", "utilized", "used", "spent", "executed" and "disbursed" refer to the budget that has been PUT INTO ACTION — the approved spending records (projects, events, payroll) and the Total Expenses figure — NEVER the Allocated Budget.
   - "How much of the budget was implemented/used/spent for <month>?" → report the Total Expenses on that month's summary line (and you may add the Remaining for context).
   - "What are the implemented budgets/projects for <month>?" → list that month's approved records from the APPROVED PROJECTS / EVENTS / PAYROLL sections, each with its amount and Progress status, then give the month's Total Expenses.
   - Progress meaning: "Completed" = fully implemented; "Ongoing" = currently being implemented. If the user asks only for one of these, filter the list by that Progress value.
   - Answering an implementation question with the Allocated Budget figure is a WRONG ANSWER even when the two amounts happen to be equal.

2. **NEVER AGGREGATE UNRELATED MONTHS**:
   - Never combine or sum budgets from different months unless the user explicitly requests "total budget", "annual budget", "overall budget", "entire year budget", or "all months combined".
   - If the user asks about July, give ONLY July figures.

3. **NEVER RECOMPUTE WHAT IS ALREADY GIVEN**:
   - Allocated Budget, Total Expenses and Remaining for every month are ALREADY CALCULATED on each line of the MONTHLY BUDGET & SUMMARY BREAKDOWN. Read the Remaining value off that line — do NOT subtract it yourself.
   - Overall Budget, Overall Expenses, Overall Remaining and Overall Utilization are likewise already calculated in the OVERALL summary section. Read them; do not recompute them.
   - Perform arithmetic ONLY when the user asks for a figure that genuinely is not listed (for example, combining two named months they explicitly asked to be added). Show which listed lines you added.

4. **DATE CONTEXT MAPPINGS**:
   - "this month" = ${currentMonthName} ${currentYear}
   - "this year" = ${currentYear}
   - "Q1" = Jan-Mar | "Q2" = Apr-Jun | "Q3" = Jul-Sep | "Q4" = Oct-Dec

5. **ANSWER THE SAME QUESTION THE SAME WAY**:
   - These figures are records, not opinions. If you are asked the same question twice, give the same figures and the same wording both times.
   - Do not soften, re-round or restyle a number you have already reported in this conversation.

6. **STRICT YEAR MATCHING & ZERO RECORD RULE**:
   - If the user specifies a YEAR, FILTER BY THAT EXACT YEAR.
   - If ZERO budget entries exist for that requested year, YOU MUST RESPOND: "No monthly budget has been recorded for <that year>."
   - NEVER substitute another year's data, and never fall back to the overall totals, when a specific year was asked for.

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
      - Allocations must be proportional to the REMAINING BUDGET shown in the data above. Never propose an allocation larger than the remaining balance, and never name a figure that is not derived from it.

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
   - PLAIN TEXT ONLY. The chat window renders your reply as raw text: it does NOT render markdown. Never use markdown tables (pipes and dashes), headings (#), bold (**), or italics (*) — they reach the user as literal punctuation. List records as simple lines starting with "- ".
   - Always write amounts with the Philippine Peso symbol (₱) and thousands separators, copying the figure exactly as it appears in the data above.
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

  // @ts-ignore
  const groqApiKey = Deno.env.get('GROQ_API_KEY')

  if (!groqApiKey) {
    console.error('[Cue Edge Function] GROQ_API_KEY is not set in Supabase secrets.')
    return new Response(JSON.stringify({ error: 'AI service API key is not configured.', code: 'AUTH_ERROR' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  /*
   * GET is a health check that also reports the models Groq is serving right
   * now. This whole outage came down to nobody being able to see that a
   * pinned model name had been retired: the function failed, the client fell
   * back to its offline rule engine, and nothing anywhere said "that model is
   * gone". Asking Groq directly turns that into a one-request answer.
   *
   * Only model ids are returned. The key stays server-side.
   */
  if (req.method === 'GET') {
    let models: string[] = []
    let listOk = false
    try {
      const r = await fetch('https://api.groq.com/openai/v1/models', {
        headers: { 'Authorization': `Bearer ${groqApiKey}` },
      })
      listOk = r.ok
      const listBody: any = await r.json().catch(() => ({}))
      models = Array.isArray(listBody?.data)
        ? listBody.data.map((m: any) => m.id).filter(Boolean).sort()
        : []
    } catch (err: any) {
      console.error(`[Cue Edge Function] Could not list Groq models: ${err.message}`)
    }

    return new Response(JSON.stringify({
      ok: true,
      hasGroqKey: true,
      groqModelsReachable: listOk,
      configuredModel: Deno.env.get('GROQ_MODEL') || null,
      availableModels: models,
    }, null, 2), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
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
  /*
   * Only the tail of the conversation is replayed. The whole transcript used
   * to be resent every turn, and because the system prompt already carries
   * the entire budget/expense/request dataset, a long chat steadily pushed
   * that data down the context until answers drifted from the records. The
   * figures live in the system prompt, not in the history, so the older turns
   * cost accuracy without adding anything.
   */
  const MAX_HISTORY = 12
  const recentMessages = messages.slice(-MAX_HISTORY)

  const formattedMessages = [
    { role: 'system', content: systemPrompt },
    ...recentMessages.map((m: any) => ({
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

  /*
   * Groq retires models periodically, and a retired name returns 404 from the
   * completions endpoint. Pinning a single name means the day it is retired
   * the assistant silently degrades to the client-side rule engine, which is
   * exactly what happened with llama-3.3-70b-versatile.
   *
   * This list was built from what the account actually serves on 2026-08-20
   * (GET this function to re-check — it asks Groq and returns the live ids).
   * Every llama chat model has been retired: llama-3.3-70b-versatile,
   * llama-3.1-8b-instant and meta-llama/llama-4-scout all return 404.
   *
   * The three below are the only general chat models available, ordered
   * strongest first. They are deliberately from two different families and
   * three different sizes, so a rate limit or a retirement on one does not
   * take the others with it.
   *
   * Excluded on purpose: whisper-* (speech-to-text), canopylabs/orpheus-*
   * (text-to-speech), meta-llama/llama-prompt-guard-* and
   * openai/gpt-oss-safeguard-20b (safety classifiers, not chat), allam-2-7b
   * (Arabic-focused), and groq/compound* (agentic systems that can reach the
   * web — wrong for an assistant that must answer only from the data block).
   *
   * GROQ_MODEL overrides the list without a redeploy.
   */
  const configuredModel = Deno.env.get('GROQ_MODEL')
  const candidateModels = configuredModel
    ? [configuredModel]
    : [
        'openai/gpt-oss-120b',
        'openai/gpt-oss-20b',
        'qwen/qwen3.6-27b',
      ]
  try {
    let groqResponse: Response | null = null
    let usedModel = ''
    const attempts: string[] = []

    for (const model of candidateModels) {
      const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${groqApiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model,
          messages: formattedMessages,
          /*
           * Deterministic decoding. This assistant reports recorded figures,
           * so sampling variety is not a feature — at temperature 0.5 the
           * same question genuinely produced different answers between sends,
           * which is what users were reporting. temperature 0 + top_p 1 +
           * a fixed seed makes a repeated question return a repeated answer.
           */
          temperature: 0,
          top_p: 1,
          seed: 1,
          /*
           * The recommendation format asks for four labelled sections; 800
           * tokens truncated them mid-sentence, which read as the bot getting
           * the answer wrong rather than running out of room.
           */
          max_tokens: 1600,
        }),
      })

      if (response.ok) {
        groqResponse = response
        usedModel = model
        break
      }

      const errorText = await response.text()
      attempts.push(`${model} -> ${response.status}`)
      console.error(`[Cue Edge Function] Groq rejected ${model}: ${response.status} - ${errorText}`)

      /*
       * Which failures are worth trying the next model for:
       *   404 - this model is gone; a different one may exist.
       *   429 - rate limited. Groq meters each model separately, so another
       *         model very often still has budget. This used to break here,
       *         which meant one busy model took the whole assistant down
       *         while an idle fallback sat untried.
       * Anything else (401/403 bad key, 5xx outage) fails identically for
       * every model, so stop rather than burn latency on certain failures.
       */
      const worthTryingNext = response.status === 404 || response.status === 429
      if (!worthTryingNext) break
    }

    if (!groqResponse) {
      return new Response(JSON.stringify({
        error: `Groq API error. Tried: ${attempts.join(', ')}`,
        code: 'AI_ERROR',
      }), {
        status: 502,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    if (usedModel !== candidateModels[0]) {
      console.warn(`[Cue Edge Function] Fell back to ${usedModel}. Set GROQ_MODEL to pin it.`)
    }

    const data = await groqResponse.json()
    /*
     * Normalise exotic Unicode spaces before returning. Even at
     * temperature 0 the model sometimes emits U+202F (narrow no-break
     * space) where it otherwise emits U+0020 -- batched GPU inference is
     * not bit-deterministic, so ties break differently between runs. The
     * words and figures are identical either way, but the raw bytes were
     * not, and a no-break space also breaks copy-paste and text search in
     * exported reports. Collapsing them keeps repeated answers byte-equal.
     */
    /*
     * qwen/qwen3.6-27b is a reasoning model: it emits its chain of thought in
     * <think> ... </think> before the answer, and that was landing verbatim in
     * the chat bubble ("<think> Here's a thinking process: 1. Analyze User
     * Input..."). Stripped here rather than by dropping the model, because it
     * is one of only three chat models the account can reach and it is the
     * last line of defence when the two gpt-oss models are rate limited.
     * An unterminated <think> (hit the token cap mid-thought) drops the rest.
     */
    const replyText = (data.choices?.[0]?.message?.content || '')
      .replace(/<think>[\s\S]*?<\/think>/gi, '')
      .replace(/<think>[\s\S]*$/gi, '')
      .replace(/[\u00A0\u2007\u202F\u2009\u2002-\u2006\u2008\u205F\u3000]/g, ' ')
      /*
       * Strip markdown bold. The bubble in ChatWidget renders msg.content as
       * plain text (white-space: pre-wrap), so "**₱39,000**" reached the user
       * with the asterisks visible. The prompt already asks for plain text,
       * but the models apply emphasis anyway and — worse — apply it
       * inconsistently, so the same question came back bolded on one run and
       * unbolded on the next. Only ** and __ are removed; single asterisks
       * are left alone because the recommendation format uses them as bullets.
       */
      .replace(/\*\*(.+?)\*\*/g, '$1')
      .replace(/__(.+?)__/g, '$1')

    console.log(`[Cue Edge Function] Success! Generated response (${replyText.length} chars)`)

    // `model` is returned so a silent fallback to a different (weaker) model
    // is visible to the caller instead of looking like the bot changed its mind.
    return new Response(JSON.stringify({ reply: replyText.trim(), model: usedModel }), {
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

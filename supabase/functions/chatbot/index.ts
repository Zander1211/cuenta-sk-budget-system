// @ts-nocheck
// supabase/functions/chatbot/index.ts
// Cue AI Chatbot — Groq API (llama-3.3-70b-versatile)
// Supabase Edge Function for the Cuenta SK Budget Monitoring System

// @ts-ignore
import { serve } from 'https://deno.land/std@0.224.0/http/server.ts'
import { fetchWithFallback, ProviderConfig } from '../_shared/ai-client.ts'

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
    currentMonthName = 'October',
    totals = {} as any,
    previousMonthsSummary = null,
    monthlySummaries = [],
    allBudgets = [],
    allExpenses = [],
    allRequests = [],
    topCategories = [],
    prediction = null,
    skChairman = null,
    skTreasurer = null,
    activeOfficials = [],
    recentReceipts = [],
    recentDocuments = [],
    recentActivityLogs = [],
    reportSummaries = [],
  } = ctx

  const totalBudget = totals.totalBudget ?? ctx.totalBudget ?? 0
  const totalApprovedAllocations = totals.totalApprovedAllocations ?? ctx.totalApprovedAllocations ?? 0
  const totalExpenses = totals.totalExpenses ?? ctx.totalExpenses ?? 0
  const remaining = totals.remaining ?? ctx.remaining ?? 0
  const remainingMonthlyAllocation = totals.remainingMonthlyAllocation ?? ctx.remainingMonthlyAllocation ?? 0
  const budgetUtilization = totals.budgetUtilization ?? ctx.budgetUtilization ?? 0

  const monthlySummariesText = (monthlySummaries && monthlySummaries.length > 0)
    ? monthlySummaries.map((m: any) => {
        const allocated = Number(m.allocatedBudget || 0)
        const approved = Number(m.approvedBudget || 0)
        const carryForward = Number(m.carryForwardBudget || 0)
        const totalBudget = Number(m.totalBudget || (allocated + (m.isCurrentMonth ? carryForward : 0)))
        const remainingBal = Number(m.remainingBudget ?? m.remainingBalance ?? (totalBudget - approved))
        const actualExp = Number(m.totalExpenses ?? m.actualExpenses ?? 0)
        const util = totalBudget > 0 ? Math.round((approved / totalBudget) * 100) : 0
        const availablePct = 100 - util

        if (m.isCurrentMonth && carryForward > 0) {
          return `- ${m.month} ${m.year} (CURRENT ACTIVE MONTH): Total Available Budget = ₱${totalBudget.toLocaleString('en-PH')} (Approved Budget: ₱${allocated.toLocaleString('en-PH')} + Carried Forward Unused Budget from Completed Past Months: ₱${carryForward.toLocaleString('en-PH')}) | Approved Allocations = ₱${approved.toLocaleString('en-PH')} | REMAINING BUDGET = ₱${remainingBal.toLocaleString('en-PH')} (${availablePct}% available) | Actual Expenses = ₱${actualExp.toLocaleString('en-PH')}`
        }

        const tag = m.isPastMonth ? ' [Completed Past Month]' : ''
        return `- ${m.month} ${m.year}${tag}: Total Budget = ₱${allocated.toLocaleString('en-PH')} | Approved Allocations = ₱${approved.toLocaleString('en-PH')} | REMAINING BUDGET (Unused from this month) = ₱${remainingBal.toLocaleString('en-PH')} (${availablePct}% available) | Actual Expenses (Verified Receipts) = ₱${actualExp.toLocaleString('en-PH')} | Budget Utilization = ${util}% (Source: ${m.sources || 'Regular SK Budget'})`
      }).join('\n')
    : '- No monthly breakdown recorded yet.'

  const prevSummary = previousMonthsSummary || ctx.previousMonthsSummary || null
  const previousMonthsText = prevSummary
    ? `- Total Remaining (Unused Budget from Previous Months): ₱${Number(prevSummary.totalRemaining || 0).toLocaleString('en-PH')}\n` +
      `- Completed Past Months: ${prevSummary.completedMonthsCount || 0} months (${prevSummary.completedPeriodLabel || ''})\n` +
      `- Total Budget for Past Months: ₱${Number(prevSummary.totalAllocated || 0).toLocaleString('en-PH')}\n` +
      `- Total Approved Budgets for Past Months: ₱${Number(prevSummary.totalApproved || 0).toLocaleString('en-PH')}\n` +
      `- Current Active Month: ${prevSummary.currentActiveMonth || currentMonthName + ' ' + currentYear} (EXCLUDED from previous months summary)\n` +
      `- Completed Months Breakdown:\n` +
      (prevSummary.breakdown || []).map((b: any) => `  * ${b.month}: Total Budget ₱${Number(b.allocatedBudget || 0).toLocaleString('en-PH')} | Approved Budgets ₱${Number(b.approvedBudget || 0).toLocaleString('en-PH')} | Remaining Budget ₱${Number(b.remainingBudget || 0).toLocaleString('en-PH')} (${b.status})`).join('\n')
    : '- No previous months carryover recorded.'

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
    ? allRequests.map((r: any) => {
        let line = `- "${r.event}" (${r.type || 'Request'}) | Month: ${r.month || 'Unspecified'} ${r.year} | Amount: ₱${Number(r.amount).toLocaleString('en-PH')} | Status: ${r.status} | Category: ${r.category}`
        if (r.rejectionReason) line += ` | Rejection Reason: ${r.rejectionReason}`
        if (r.cancellationReason) line += ` | Cancellation Reason: ${r.cancellationReason}`
        return line
      }).join('\n')
    : '- No pending or recorded requests.'

  const categoriesText = (topCategories && topCategories.length > 0)
    ? topCategories.map((c: any) => `- ${c.name}: ₱${Number(c.total).toLocaleString('en-PH')}`).join('\n')
    : '- No category data yet.'

  const skChairmanName = skChairman || 'Not yet assigned'
  const skTreasurerName = skTreasurer || 'Not yet assigned'

  const officialsText = (activeOfficials && activeOfficials.length > 0)
    ? activeOfficials.map((o: any) => `- ${o.role}: ${o.name} (${o.email || 'No email'})`).join('\n')
    : `- SK Chairman: ${skChairmanName}\n- SK Treasurer: ${skTreasurerName}`

  const receiptsText = (recentReceipts && recentReceipts.length > 0)
    ? recentReceipts.map((r: any) => `- "${r.fileName}" | Merchant/Supplier: ${r.merchant || 'N/A'} | Amount: ₱${Number(r.amount || 0).toLocaleString('en-PH')} | Status: ${r.isVerified ? 'OCR Verified' : 'Pending Verification'} | Uploaded: ${r.uploadedAt ? new Date(r.uploadedAt).toLocaleDateString('en-PH') : 'Recently'}`).join('\n')
    : '- No recent receipt records.'

  const documentsText = (recentDocuments && recentDocuments.length > 0)
    ? recentDocuments.map((d: any) => `- "${d.name}" (${d.type || 'Document'}) | Generated by: ${d.generatedBy || 'SK Official'} | Date: ${d.dateGenerated ? new Date(d.dateGenerated).toLocaleDateString('en-PH') : 'Recently'}`).join('\n')
    : '- No generated documents recorded.'

  const activityLogsText = (recentActivityLogs && recentActivityLogs.length > 0)
    ? recentActivityLogs.map((a: any) => `- [${a.date ? new Date(a.date).toLocaleDateString('en-PH') : 'Recent'}] ${a.user} (${a.role || 'Official'}): ${a.action} — ${a.description || ''} (Module: ${a.module || 'System'})`).join('\n')
    : '- No recent activity logs.'

  const reportSummariesText = (reportSummaries && reportSummaries.length > 0)
    ? reportSummaries.map((rep: any) => `- Report ID ${rep.reportId}: ${rep.summary}`).join('\n')
    : '- No AI report summaries recorded.'

  /*
   * Prediction is computed client-side (buildSystemContext in ChatWidget.jsx)
   * as a trailing average of the most recent recorded months — never here,
   * and never by the model. This mirrors why remainingBalance is precomputed
   * per month: the model must read a number, not derive one.
   */
  const predictionText = (prediction && prediction.available)
    ? `- Predicted period: ${prediction.nextMonth} ${prediction.nextYear}\n` +
      `- Estimated Allocated Budget needed: ₱${Number(prediction.predictedAllocatedBudget).toLocaleString('en-PH')}\n` +
      `- Estimated Expenses: ₱${Number(prediction.predictedExpenses).toLocaleString('en-PH')}\n` +
      `- Method: trailing average of the most recent recorded months: ${(prediction.basisMonths || []).join(', ')}\n` +
      `- This is a TREND ESTIMATE derived from past months, NOT a recorded or guaranteed figure.`
    : `- Not enough historical data to generate a prediction yet (at least 2 months of recorded budget/expense data are needed; ${prediction?.monthsRecorded ?? 0} currently recorded).`

  return `You are Cue, the dedicated AI assistant for the "Cuenta: SK Budget Monitoring and Document Tracking with AI Analysis" system — built exclusively for the Sangguniang Kabataan (SK) of Barangay Upper Glad II, Midsayap, Cotabato, Philippines.

User: ${userName} (Role: ${role})
Current Page: ${currentPage}
Current System Date Context: ${currentMonthName} ${currentYear}

================================================================
LANGUAGE — ALWAYS REPLY IN THE USER'S LANGUAGE (HIGHEST PRIORITY):
================================================================

Detect the language of the user's MOST RECENT message before writing your reply, and respond ENTIRELY in that language:
- Message is in Tagalog/Filipino → reply entirely in natural, professional Tagalog.
- Message is in English → reply entirely in English.
- Message mixes Tagalog and English ("Taglish") → reply naturally in Taglish, the way Filipino speakers actually blend the two languages — not a stiff word-for-word translation. Stay professional and easy to understand.
- If earlier turns were in a different language, follow the LATEST user message — the user may switch languages mid-conversation, and you must switch with them.
- Never ask the user which language to use and never mention that you detected one. Just answer in it.
- This rule governs every reply you produce below: data answers, the off-topic refusal, and recommendations all follow the detected language.
- Regardless of reply language, copy peso amounts (₱...), dates, month names, and record names (project/event/category names) EXACTLY as they appear in the data block — never translate a proper name or invent a localized figure. Established SK program names (e.g. "Youth Leadership Seminar") may stay in English even inside a Tagalog reply, since that is how they are actually named in the system.

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
- User Accounts & Roles: SK Chairman, SK Treasurer, SK Kagawad, Barangay Treasurer, account assignments and permissions
- Receipts & OCR: Uploaded receipts, verification status, OCR extracted details
- Audit Trail: User Activities, Approvals, Budget Modifications, System Actions
- User Guidance: How to create a budget request, upload receipts, generate reports, update a profile, use AI Analysis, manage projects/events/payroll/documents

IF THE USER ASKS ANYTHING UNRELATED TO THE CUENTA SYSTEM (e.g., general knowledge, trivia, math problems, weather, sports, entertainment, programming tutorials, jokes, poems, science, history, politics, or any topic not listed above), YOU MUST RESPOND WITH EXACTLY the version matching the detected language of the user's message (see LANGUAGE section above):

- If the user's message is in English, respond with EXACTLY:
"I'm Cue, the AI assistant for the Cuenta: SK Budget Monitoring and Document Tracking with AI Analysis system. I can only assist with questions related to this system, such as budgets, expenses, projects, events, payroll, documents, reports, AI Analysis, and system features. Please ask a question related to the Cuenta system."

- If the user's message is in Tagalog/Filipino, respond with EXACTLY:
"Ako si Cue, ang AI assistant para sa Cuenta: SK Budget Monitoring and Document Tracking with AI Analysis system. Tumutulong lang ako sa mga tanong tungkol sa system na ito, tulad ng mga budget, gastos, proyekto, event, payroll, dokumento, ulat, AI Analysis, at iba pang feature ng system. Mangyaring magtanong tungkol sa Cuenta system."

- If the user's message is Taglish (mixed Tagalog and English), respond with EXACTLY:
"Ako si Cue, ang AI assistant para sa Cuenta: SK Budget Monitoring and Document Tracking with AI Analysis system. I can only help with questions related dito sa system — tulad ng budgets, expenses, projects, events, payroll, documents, reports, AI Analysis, at iba pang system features. Paki-tanong na lang ang tungkol sa Cuenta system."

DO NOT attempt to answer unrelated questions under any circumstances. DO NOT provide general knowledge answers even if you know them.

NEVER use that refusal for a question about budgets, expenses, projects, events, payroll, documents, receipts, reports, months, quarters or years. Those are IN SCOPE even when the answer turns out to be that nothing is recorded. "What is the budget for 2024?" is a Cuenta data question, not an unrelated one — the correct reply is that no budget is recorded for 2024, NOT the refusal above. A bare month, quarter or year is always a data question. Reserve the refusal for topics genuinely outside the system, such as sports results, weather, celebrities or programming help.

================================================================
REAL-TIME FINANCIAL & SYSTEM DATA (LIVE DATABASE RECORDS):
================================================================

1. MONTHLY BUDGET & SUMMARY BREAKDOWN (PRIMARY SOURCE FOR MONTH QUESTIONS):
${monthlySummariesText}

2. UNUSED BUDGET FROM PREVIOUS MONTHS (CARRIED OVER UNUSED FUNDS / REMAINING BUDGETS CARD):
${previousMonthsText}

3. RECORDED MONTHLY BUDGET ALLOCATIONS:
${budgetsText}

4. APPROVED PROJECTS (this IS the project list — answer every "list/how many/newest project" question from here):
${projectsText}

5. APPROVED EVENTS (this IS the event list — answer every "list/how many/newest event" question from here):
${eventsText}

6. APPROVED PAYROLL:
${payrollText}

7. ADDITIONAL EXPENSES (extra costs attached to an approved project or event):
${additionalText}

8. ALL APPROVED SPENDING RECORDS COMBINED (projects + events + payroll):
${expensesText}

9. BUDGET REQUESTS (Status: Pending, Approved, Rejected, Cancelled):
${requestsText}

10. TOP SPENDING CATEGORIES:
${categoriesText}

11. BUDGET PREDICTION (NEXT MONTH — TREND ESTIMATE COMPUTED FROM PAST MONTHS, NOT A RECORDED FACT):
${predictionText}

12. CURRENT SK OFFICIALS & USER ACCOUNTS (ROLES & RESPONSIBILITIES):
- Current Active SK Chairman: ${skChairmanName}
- Current Active SK Treasurer: ${skTreasurerName}
- All Registered Active User Accounts:
${officialsText}

13. RECEIPTS & OCR RECORDS:
${receiptsText}

14. GENERATED SYSTEM DOCUMENTS & NARRATIVE REPORTS:
${documentsText}

15. RECENT ACTIVITY LOGS (AUDIT TRAIL):
${activityLogsText}

16. AI REPORT SUMMARIES:
${reportSummariesText}

17. OVERALL ANNUAL / TOTAL SYSTEM SUMMARY (USE ONLY WHEN ASKED FOR TOTAL / ANNUAL / OVERALL BUDGET):
- Overall Total Budget (All Months Combined): ₱${Number(totalBudget).toLocaleString('en-PH')}
- Overall Total Approved Budget Allocations: ₱${Number(totalApprovedAllocations).toLocaleString('en-PH')}
- Overall Total Expenses: ₱${Number(totalExpenses).toLocaleString('en-PH')}
- Overall Remaining Balance: ₱${Number(remaining).toLocaleString('en-PH')}
- Overall Budget Utilization: ${budgetUtilization}%

================================================================
STRICT FILTERING & RESPONSE ACCURACY RULES:
================================================================

0. **DYNAMIC DATA RETRIEVAL & SOURCE OF FACT**:
   - The data sections above are dynamically fetched from the live database on every user interaction.
   - Every peso figure, month, project name, user name, role, receipt, document, or log entry you state MUST be copied directly from the REAL-TIME DATA section above.
   - Do NOT rely on previous conversation turns or static memory if the data block above reflects updated information.
   - If a budget amount is updated, a new expense is added, a request is approved/rejected/cancelled, a receipt is uploaded, or a user role changes, the section above reflects it immediately — use that live figure.

0A. **DATA PRIORITY ORDER (MANDATORY)**:
   When answering questions, you MUST prioritize information in this exact order:
   1. Latest database records (the live sections above).
   2. Current approved financial records (approved budgets, expenses, allocations).
   3. Current user roles and permissions (active officials from user accounts in Section 12).
   4. Activity history (recent audit logs in Section 15).
   5. General system knowledge.

0B. **PREVENT INCORRECT ANSWERS / MISSING INFORMATION RULE**:
   - Cue should NEVER guess, speculate, or provide outdated or invented information.
   - If the user asks for a specific piece of information, record, document, receipt, or person that is NOT available in the data blocks above, respond clearly with:
     "I could not find the latest record for this information. Please check the related module or try again."
     (If responding in Tagalog/Filipino: "Hindi ko mahanap ang pinakabagong tala para sa impormasyong ito. Pakisuri ang kaugnay na module o subukang muli.")
     (If responding in Taglish: "Hindi ko mahanap ang latest record para sa information na ito. Please check the related module or try again.")

0C. **DYNAMIC SYSTEM ROLE & USER ACCOUNT AWARENESS**:
   - Always provide the currently assigned SK Chairman and SK Treasurer from the system records above, NEVER an old stored name or placeholder.
   - User: "Who is the current SK Chairman?" → Answer with the current active SK Chairman: "${skChairmanName}".
   - User: "Who is the SK Treasurer?" → Answer with the current active SK Treasurer: "${skTreasurerName}".
   - If asked about user accounts or positions, refer directly to Section 12.
   - Role Responsibilities:
     * SK Chairman: Approves/rejects budget requests, cancels approved requests, monitors financial records, manages user accounts, has full access.
     * SK Treasurer: Sets monthly budget allocations, creates/submits budget requests (Projects, Events, Payroll), uploads receipts, generates project documents and narrative reports.
     * SK Kagawad: Views approved financial records and transparency reports (read-only monitoring).
     * Barangay Treasurer: Read-only access to approved financial records and transparency reports.

0D. **REAL-TIME STATUS CHANGE AWARENESS**:
   - Recognize changes in status immediately:
     * New budget added: immediately reflect the new budget amount in the monthly breakdown.
     * Budget amount updated: use the updated number from Section 1 & 3.
     * Request approved: counts towards Approved Allocations and becomes a project/event expense record.
     * Request pending: listed in Budget Requests (Section 9) awaiting approval; not yet deducted.
     * Request rejected or cancelled: report status and rejection/cancellation reason if recorded.
     * Receipt uploaded or replaced: reflected in Receipts (Section 13) and verified totals in Actual Expenses.
     * Document generated: reflected in Generated Documents (Section 14).
     * User information or role changed: reflected in Section 12.

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

1C. **LIST EVERY MATCHING RECORD — NEVER TRUNCATE OR SAMPLE**:
   - When asked to list, count, or enumerate projects, events, payroll, expenses, budgets, or requests, include EVERY record from the data block above that matches the user's stated filters — never stop early, never show only "the first few," and never silently cap a list at a round number.
   - If the user names no month, year, project, event, payroll or status filter, do NOT invent one. Treat the request as unscoped and include every matching record from every period recorded.
   - When your answer lists 2 or more records, state the total count first — e.g. "There are 4 approved projects for August 2026:" — and the number you state MUST equal the number of lines you then list.
   - If a filter you applied (a month, a year, a status) narrows the results below what another part of the system shows at a glance (for example, a records page that lists every period together), name that filter in your first sentence so the scope is obvious — e.g. "for August 2026" — instead of leaving the user to guess why your count differs from an unfiltered view elsewhere.

1D. **PREDICTION / FORECAST QUESTIONS ("predict", "prediction", "forecast", "projected", "estimate", "next month's budget", "how much will ... need")**:
   - Use ONLY the BUDGET PREDICTION section above. NEVER average, extrapolate, or invent your own trend figure — the estimate is already computed for you.
   - If that section says there is not enough historical data, say so plainly (name how many months are recorded) and do NOT produce a number.
   - Always call the figure an ESTIMATE based on a trailing average of past months, name the months used as the basis, and note that the actual approved budget may differ. Never present it as a recorded or guaranteed amount.
   - The section can only project ONE month ahead. If the user asks about a further-out or different specific month, say you can currently only estimate the next recorded month (name it) and do not guess a figure for the one they actually asked about.

1E. **UNUSED BUDGET FROM PREVIOUS MONTHS (REMAINING BUDGETS CARD & BREAKDOWN MODAL)**:
   - When asked about unused budget from previous months, past months carryover, remaining budgets from previous months, or the "Remaining Budgets" card (e.g., "How much the remaining budgets that unused budget from previous months?", "How much unused budget from past months?", "What is the remaining budget carried over?"):
   - PRIMARY AUTHORITY: Section 2 ("UNUSED BUDGET FROM PREVIOUS MONTHS") is the SOLE authoritative source for this question.
   - ALWAYS state the EXACT Total Remaining (Previous Months) figure from Section 2: ₱${Number(prevSummary?.totalRemaining || 0).toLocaleString('en-PH')} (e.g. ₱169,502).
   - Under NO circumstances should you ever sum up cumulative carryover figures or report an inflated number like ₱774,267. The total unused budget carried over is ₱${Number(prevSummary?.totalRemaining || 0).toLocaleString('en-PH')}.
   - Explain that this represents the unused budget carried over from completed months (${prevSummary?.completedPeriodLabel || 'January – September ' + currentYear}), calculated as:
     * Total Budget (Past Months): ₱${Number(prevSummary?.totalAllocated || 0).toLocaleString('en-PH')}
     * Approved Allocations (Past Months): ₱${Number(prevSummary?.totalApproved || 0).toLocaleString('en-PH')}
     * Total Remaining Unused Budget: ₱${Number(prevSummary?.totalRemaining || 0).toLocaleString('en-PH')}
   - State clearly that the current active month (${prevSummary?.currentActiveMonth || currentMonthName + ' ' + currentYear}) is active and is EXCLUDED from the previous months summary.
   - When providing the monthly breakdown, quote the exact monthly figures from Section 2:
${(prevSummary?.breakdown || []).map((b: any) => `     - ${b.month}: ₱${Number(b.remainingBudget || 0).toLocaleString('en-PH')} (Total Budget: ₱${Number(b.allocatedBudget || 0).toLocaleString('en-PH')} | Approved: ₱${Number(b.approvedBudget || 0).toLocaleString('en-PH')} | Status: ${b.status})`).join('\n')}
   - Sum of the completed months remaining budgets: ₱${Number(prevSummary?.totalRemaining || 0).toLocaleString('en-PH')}.
   - NEVER invent or calculate a different number. Use ₱${Number(prevSummary?.totalRemaining || 0).toLocaleString('en-PH')}.

1F. **MONTHLY REMAINING BUDGET (MONTHLY BUDGET MINUS APPROVED ALLOCATIONS)**:
   - When asked for the remaining budget of a specific month (e.g., "How much the remaining budget for the month of october?"):
   - The Remaining Budget is: Monthly Budget minus Approved Allocations.
   - Look up that specific month in section 1 (MONTHLY BUDGET & SUMMARY BREAKDOWN) above and read the exact REMAINING BUDGET written on that line.
   - For October 2026: Monthly Budget is ₱150,000, Approved Allocations is ₱25,000, and REMAINING BUDGET is ₱125,000 (83% available).
   - Answer: "The remaining budget for October 2026 is ₱125,000 (Monthly budget: ₱150,000 minus approved allocations: ₱25,000)."
   - NEVER confuse the Remaining Budget with the Approved Allocations (₱25,000) or Verified Receipts (₱0).

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
   - Write the ENTIRE reply — including section labels like "Current Financial Status" or "Suggested Projects" — in the language detected from the user's latest message (see LANGUAGE section above). Translate section labels naturally into Tagalog/Taglish when replying in those languages; do not leave the surrounding prose in English while only the data is localized.
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
  const primaryKey = Deno.env.get('PRIMARY_AI_API_KEY') || Deno.env.get('GROQ_API_KEY')
  
  if (!primaryKey) {
    console.error('[Cue Edge Function] API_KEY is not set.')
    return new Response(JSON.stringify({ error: 'AI service API key is not configured.', code: 'AUTH_ERROR' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  if (req.method === 'GET') {
    return new Response(JSON.stringify({ ok: true, configured: true }), {
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

  const systemPrompt = buildSystemPrompt(systemContext)

  const MAX_HISTORY = 10
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

  console.log(`[Cue] User: "${systemContext.userName || 'Unknown'}" | Page: "${systemContext.currentPage || 'Unknown'}"`)
  
  // Default Groq endpoint — working models verified 2026-08-20.
  // llama-3.3-70b-versatile and llama-3.1-8b-instant are retired (404).
  const groqEndpoint = 'https://api.groq.com/openai/v1/chat/completions'
  const primaryEndpoint = Deno.env.get('PRIMARY_AI_ENDPOINT') || groqEndpoint
  const primaryModel = Deno.env.get('PRIMARY_AI_MODEL') || 'openai/gpt-oss-120b'

  const fallbackKey = Deno.env.get('FALLBACK_AI_API_KEY')
  const fallbackEndpoint = Deno.env.get('FALLBACK_AI_ENDPOINT')
  const fallbackModel = Deno.env.get('FALLBACK_AI_MODEL')

  const providers: ProviderConfig[] = []
  
  if (primaryKey) {
    providers.push({ apiKey: primaryKey, endpoint: primaryEndpoint, model: primaryModel, label: 'Primary (Chat)' })
    // When using the default Groq setup (no custom PRIMARY_AI_API_KEY set),
    // add internal model fallbacks. Groq meters each model separately so a
    // rate-limited model doesn't take down the others.
    if (!Deno.env.get('PRIMARY_AI_API_KEY')) {
      providers.push({ apiKey: primaryKey, endpoint: groqEndpoint, model: 'openai/gpt-oss-20b', label: 'Groq Fallback 1' })
      providers.push({ apiKey: primaryKey, endpoint: groqEndpoint, model: 'qwen/qwen3.6-27b', label: 'Groq Fallback 2' })
    }
  }

  if (fallbackKey && fallbackEndpoint && fallbackModel) {
    providers.push({ apiKey: fallbackKey, endpoint: fallbackEndpoint, model: fallbackModel, label: 'Secondary Fallback (Chat)' })
  }

  const aiResponse = await fetchWithFallback({
    messages: formattedMessages,
    providers,
    temperature: 0,
    topP: 1,
    seed: 1,
    maxTokens: 1600,
    timeoutMs: 25000,
  })

  if (!aiResponse.ok) {
    return new Response(JSON.stringify({
      error: aiResponse.error,
      code: 'AI_ERROR',
    }), {
      status: 502,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  const usedModel = aiResponse.usedModel
  
  const replyText = aiResponse.text
    .replace(/<think>[\s\S]*?<\/think>/gi, '')
    .replace(/<think>[\s\S]*$/gi, '')
    .replace(/[\u00A0\u2007\u202F\u2009\u2002-\u2006\u2008\u205F\u3000]/g, ' ')
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/__(.+?)__/g, '$1')

  console.log(`[Cue] Generated response (${replyText.length} chars) using ${usedModel}`)

  return new Response(JSON.stringify({ reply: replyText.trim(), model: usedModel }), {
    status: 200,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
})

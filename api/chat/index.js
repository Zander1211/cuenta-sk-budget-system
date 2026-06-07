const MONTH_LABELS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
]

const PAGE_CONTEXTS = [
  { match: '/dashboard/user-management', label: 'User Management', hint: 'Manage roles and account access.', action: '/dashboard/user-management' },
  { match: '/dashboard/audit-logs', label: 'Audit Logs', hint: 'Review activity trails and compliance checks.', action: '/dashboard/audit-logs' },
  { match: '/dashboard/ai-analysis', label: 'AI Analysis', hint: 'Compare trends and review anomalies.', action: '/dashboard/ai-analysis' },
  { match: '/dashboard/budgets', label: 'Budgets', hint: 'Review or add monthly budgets.', action: '/dashboard/budgets' },
  { match: '/dashboard/projects', label: 'Projects', hint: 'Review project allocations and spending.', action: '/dashboard/projects' },
  { match: '/dashboard/expenses', label: 'Expenses', hint: 'Review expenses and attach missing receipts.', action: '/dashboard/expenses' },
  { match: '/dashboard/request', label: 'Requests', hint: 'Submit new budget requests.', action: '/dashboard/request' },
  { match: '/dashboard/documents', label: 'Receipts', hint: 'Check missing receipts and upload documents.', action: '/dashboard/documents' },
  { match: '/dashboard/approvals', label: 'Approvals', hint: 'Review and approve pending requests.', action: '/dashboard/approvals' },
  { match: '/dashboard/archive', label: 'Archive', hint: 'Audit archived requests and expenses.', action: '/dashboard/archive' },
  { match: '/dashboard/reports', label: 'Reports', hint: 'Generate reports for the current month.', action: '/dashboard/reports' },
  { match: '/dashboard/profile', label: 'Profile', hint: 'Update your account and notification settings.', action: '/dashboard/profile' },
  { match: '/dashboard', label: 'Main Dashboard', hint: 'Review totals, alerts, and key actions.', action: '/dashboard' },
]

const PAGE_LABELS = PAGE_CONTEXTS.reduce((acc, item) => {
  acc[item.action] = item.label
  return acc
}, {})

const SYSTEM_TOPICS = [
  {
    key: 'budgets',
    label: 'Budgets',
    route: '/dashboard/budgets',
    keywords: ['budget', 'allocation', 'monthly budget', 'funding'],
    tips: [
      'Use the Budgets page to add monthly allocations.',
      'Review totals to see how much is allocated and remaining.',
    ],
  },
  {
    key: 'requests',
    label: 'Requests',
    route: '/dashboard/request',
    keywords: ['request', 'submit', 'proposal'],
    tips: [
      'Submit a budget request with category, amount, and notes.',
      'Requests show up in Approvals for review.',
    ],
  },
  {
    key: 'approvals',
    label: 'Approvals',
    route: '/dashboard/approvals',
    keywords: ['approve', 'approval', 'pending request'],
    tips: [
      'Review pending requests and approve or reject them.',
      'Approved requests become expenses automatically.',
    ],
  },
  {
    key: 'expenses',
    label: 'Expenses',
    route: '/dashboard/expenses',
    keywords: ['expense', 'spend', 'vendor', 'reimburse'],
    tips: [
      'Track approved expenses and attach receipts.',
      'Use categories to monitor where funds are going.',
    ],
  },
  {
    key: 'receipts',
    label: 'Receipts',
    route: '/dashboard/documents',
    keywords: ['receipt', 'document', 'upload', 'file'],
    tips: [
      'Upload or review receipts for expenses.',
      'Missing receipts are highlighted for follow-up.',
    ],
  },
  {
    key: 'reports',
    label: 'Reports',
    route: '/dashboard/reports',
    keywords: ['report', 'summary', 'export'],
    tips: [
      'Generate reports for council or committee updates.',
      'Use totals and approvals to build summaries.',
    ],
  },
  {
    key: 'audit',
    label: 'Audit Logs',
    route: '/dashboard/audit-logs',
    keywords: ['audit', 'log', 'history', 'activity'],
    tips: [
      'Audit Logs show user actions and approvals.',
      'Use them for compliance reviews.',
    ],
  },
  {
    key: 'projects',
    label: 'Projects',
    route: '/dashboard/projects',
    keywords: ['project', 'program'],
    tips: [
      'Track spending by project and review allocations.',
      'Use it to prioritize active initiatives.',
    ],
  },
  {
    key: 'ai-analysis',
    label: 'AI Analysis',
    route: '/dashboard/ai-analysis',
    keywords: ['ai', 'analysis', 'trend', 'anomaly'],
    tips: [
      'Review trend lines and anomalies based on expenses.',
      'Use it to spot risk and overspending.',
    ],
  },
  {
    key: 'profile',
    label: 'Profile',
    route: '/dashboard/profile',
    keywords: ['profile', 'account', 'settings'],
    tips: [
      'Update your personal details and notifications.',
      'Keep contact info current for reports.',
    ],
  },
]

const ROLE_ACCESS = {
  'SK Chairman': [
    '/dashboard',
    '/dashboard/budgets',
    '/dashboard/projects',
    '/dashboard/expenses',
    '/dashboard/approvals',
    '/dashboard/documents',
    '/dashboard/ai-analysis',
    '/dashboard/reports',
    '/dashboard/audit-logs',
    '/dashboard/user-management',
    '/dashboard/profile',
  ],
  'SK Treasurer': [
    '/dashboard',
    '/dashboard/budgets',
    '/dashboard/projects',
    '/dashboard/expenses',
    '/dashboard/request',
    '/dashboard/documents',
    '/dashboard/archive',
    '/dashboard/ai-analysis',
    '/dashboard/reports',
    '/dashboard/profile',
  ],
  'SK Kagawad': [
    '/dashboard',
    '/dashboard/budgets',
    '/dashboard/profile',
  ],
  'Barangay Treasurer': [
    '/dashboard',
    '/dashboard/budgets',
    '/dashboard/profile',
  ],
}

const currency = new Intl.NumberFormat('en-PH', {
  style: 'currency',
  currency: 'PHP',
  maximumFractionDigits: 0,
})

function toNumber(value) {
  const num = Number(value)
  return Number.isFinite(num) ? num : 0
}

function parseDate(value) {
  if (!value) return null
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}

function getMonthKey(date) {
  const month = String(date.getMonth() + 1).padStart(2, '0')
  return `${date.getFullYear()}-${month}`
}

function formatMonthLabel(monthKey) {
  const [year, month] = monthKey.split('-').map(Number)
  if (!Number.isFinite(year) || !Number.isFinite(month)) return monthKey
  const label = MONTH_LABELS[month - 1] || `Month ${month}`
  return `${label} ${year}`
}

function formatTimestamp(value) {
  const date = parseDate(value)
  if (!date) return null
  return date.toLocaleString('en-PH', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

function getPageContext(path) {
  if (!path) return null
  const match = PAGE_CONTEXTS.find((entry) => path.startsWith(entry.match))
  return match || null
}

function findSystemTopic(message) {
  if (!message) return null
  const text = message.toLowerCase()
  return SYSTEM_TOPICS.find((topic) => topic.keywords.some((keyword) => text.includes(keyword))) || null
}

function wantsSystemHelp(message) {
  if (!message) return false
  const text = message.toLowerCase()
  return (
    text.includes('help') ||
    text.includes('system') ||
    text.includes('app') ||
    text.includes('how do i') ||
    text.includes('how can i') ||
    text.includes('where do i') ||
    text.includes('what is') ||
    text.includes('what can') ||
    text.includes('create ') ||
    text.includes('add ') ||
    text.includes('submit ') ||
    text.includes('approve ') ||
    text.includes('upload ') ||
    text.includes('generate ') ||
    text.includes('view ') ||
    text.includes('open ') ||
    text.includes('navigate ') ||
    text.includes('edit ') ||
    text.includes('delete ')
  )
}

function wantsRoleHelp(message) {
  if (!message) return false
  const text = message.toLowerCase()
  return (
    text.includes('role') ||
    text.includes('permission') ||
    text.includes('access') ||
    text.includes('who can')
  )
}

function buildSystemResponse({
  message,
  role,
  pageContext,
  currentPage,
  recentActivity,
  topActivity,
}) {
  const topic = findSystemTopic(message)
  const isRoleHelp = wantsRoleHelp(message)
  const lines = []

  if (pageContext) {
    lines.push(`You are on ${pageContext.label}. ${pageContext.hint}`)
  }

  if (topic) {
    lines.push(`${topic.label}: ${topic.tips.join(' ')}`)
  }

  if (isRoleHelp) {
    const routes = ROLE_ACCESS[role] || []
    if (routes.length) {
      const labels = routes.map((route) => PAGE_LABELS[route] || route)
      lines.push(`Your role: ${role}. You can access: ${labels.join(', ')}.`)
    } else {
      lines.push(`I do not have access rules for role ${role}.`)
    }
  }

  if (!topic && !isRoleHelp) {
    lines.push('You can ask about budgets, requests, approvals, expenses, receipts, reports, audit logs, projects, or user management.')
  }

  if (recentActivity.length) {
    lines.push(`Recent activity: ${recentActivity.join(', ')}.`)
  }

  if (topActivity) {
    lines.push(`Most frequent activity: ${topActivity}.`)
  }

  const actions = []
  if (topic?.route) {
    actions.push({ label: `Open ${topic.label}`, to: topic.route })
  }
  if (pageContext?.action) {
    actions.push({ label: `Open ${pageContext.label}`, to: pageContext.action })
  }

  const uniqueActions = []
  const seen = new Set()
  actions.forEach((action) => {
    if (!action?.to || seen.has(action.to)) return
    seen.add(action.to)
    uniqueActions.push(action)
  })

  const summary = topic
    ? `System help: ${topic.label}.`
    : isRoleHelp
      ? `Role access for ${role}.`
      : 'System help.'

  return {
    content: lines.join('\n'),
    summary,
    alerts: [],
    actions: uniqueActions.slice(0, 3),
    dataHighlights: {
      recentActivity,
      topActivity: topActivity || null,
      currentPage,
    },
  }
}

function getLastUserMessage(messages) {
  if (!Array.isArray(messages)) return ''
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const item = messages[i]
    if (item?.role === 'user' && item?.content) {
      return String(item.content)
    }
  }
  return ''
}

function buildLocalAnalysis(context, messages) {
  const lastUserMessage = getLastUserMessage(messages).toLowerCase()
  const totals = context?.totals || {}
  const budgets = Array.isArray(context?.budgets) ? context.budgets : []
  const expenses = Array.isArray(context?.expenses) ? context.expenses : []
  const requests = Array.isArray(context?.requests) ? context.requests : []
  const auditLogs = Array.isArray(context?.auditLogs) ? context.auditLogs : []
  const role = context?.role || 'Unknown'
  const currentPage = context?.currentPage || '/dashboard'
  const pageContext = getPageContext(currentPage)

  const totalBudget = toNumber(totals.totalBudget) || budgets.reduce(
    (sum, budget) => sum + toNumber(budget.amount),
    0
  )
  const totalExpenses = toNumber(totals.totalExpenses) || expenses.reduce(
    (sum, expense) => sum + toNumber(expense.amount),
    0
  )
  const remaining = Number.isFinite(totals.remaining)
    ? toNumber(totals.remaining)
    : totalBudget - totalExpenses

  const usedPercent = totalBudget > 0
    ? Math.round((totalExpenses / totalBudget) * 100)
    : 0

  const pendingRequests = requests.filter((request) => {
    const status = String(request.status || '').toLowerCase()
    return status === 'pending' || status === 'submitted'
  })

  const missingReceipts = expenses.filter((expense) => !expense.receiptAttached)

  const recentActivity = auditLogs
    .slice(0, 4)
    .map((entry) => {
      const label = entry.type || entry.action || 'activity'
      const timestamp = formatTimestamp(entry.timestamp)
      return timestamp ? `${label} (${timestamp})` : label
    })

  const activityCounts = new Map()
  auditLogs.forEach((entry) => {
    const label = entry.type || entry.action || 'activity'
    activityCounts.set(label, (activityCounts.get(label) || 0) + 1)
  })
  const topActivity = Array.from(activityCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 1)
    .map(([label]) => label)[0]

  const systemTopic = findSystemTopic(lastUserMessage)
  const isDataQuestion = [
    'how much',
    'total',
    'remaining',
    'spent',
    'balance',
    'utilization',
    'usage',
    'summary',
    'status',
    'trend',
  ].some((keyword) => lastUserMessage.includes(keyword))

  const isSystemHelp = wantsRoleHelp(lastUserMessage) || (
    !isDataQuestion && wantsSystemHelp(lastUserMessage) && (
      systemTopic ||
      lastUserMessage.includes('system') ||
      lastUserMessage.includes('app')
    )
  )

  if (isSystemHelp) {
    return buildSystemResponse({
      message: lastUserMessage,
      role,
      pageContext,
      currentPage,
      recentActivity,
      topActivity,
    })
  }

  const categoryTotals = new Map()
  expenses.forEach((expense) => {
    const category = expense.category || 'Uncategorized'
    categoryTotals.set(category, (categoryTotals.get(category) || 0) + toNumber(expense.amount))
  })
  const topCategories = Array.from(categoryTotals, ([cat, amount]) => ({ cat, amount }))
    .sort((a, b) => b.amount - a.amount)
    .slice(0, 3)

  const topExpenses = expenses
    .map((expense) => ({
      label: expense.category || 'Expense',
      amount: toNumber(expense.amount),
    }))
    .sort((a, b) => b.amount - a.amount)
    .slice(0, 3)

  const expenseByMonth = new Map()
  expenses.forEach((expense) => {
    const date = parseDate(expense.date) || parseDate(expense.approvedAt)
    if (!date) return
    const key = getMonthKey(date)
    expenseByMonth.set(key, (expenseByMonth.get(key) || 0) + toNumber(expense.amount))
  })

  const budgetByMonth = new Map()
  budgets.forEach((budget) => {
    const month = Number(budget.month)
    const year = Number(budget.year)
    if (!Number.isFinite(month) || !Number.isFinite(year)) return
    const key = `${year}-${String(month + 1).padStart(2, '0')}`
    budgetByMonth.set(key, (budgetByMonth.get(key) || 0) + toNumber(budget.amount))
  })

  const monthlyExpenseEntries = Array.from(expenseByMonth.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))

  const monthlyBudgetEntries = Array.from(budgetByMonth.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))

  let latestMonthSnapshot = null
  if (monthlyExpenseEntries.length) {
    const latestExpense = monthlyExpenseEntries[monthlyExpenseEntries.length - 1]
    const matchingBudget = monthlyBudgetEntries.find((entry) => entry[0] === latestExpense[0])
    if (matchingBudget) {
      const monthKey = latestExpense[0]
      const spend = latestExpense[1]
      const budget = matchingBudget[1]
      const percent = budget > 0 ? Math.round((spend / budget) * 100) : 0
      latestMonthSnapshot = { monthKey, spend, budget, percent }
    }
  }

  let trendLine = null
  if (monthlyExpenseEntries.length >= 2) {
    const recent = monthlyExpenseEntries.slice(-3)
    const first = recent[0][1]
    const last = recent[recent.length - 1][1]
    const change = first > 0 ? (last - first) / first : (last > 0 ? 1 : 0)
    const direction = change > 0.1 ? 'up' : change < -0.1 ? 'down' : 'flat'
    trendLine = {
      direction,
      changePercent: Math.round(change * 100),
      from: recent[0][0],
      to: recent[recent.length - 1][0],
    }
  }

  let anomalies = []
  if (monthlyExpenseEntries.length >= 4) {
    const totalsList = monthlyExpenseEntries.map((entry) => entry[1])
    const avg = totalsList.reduce((sum, value) => sum + value, 0) / totalsList.length
    const variance = totalsList.reduce((sum, value) => sum + Math.pow(value - avg, 2), 0) / totalsList.length
    const stdDev = Math.sqrt(variance)
    anomalies = monthlyExpenseEntries
      .filter(([, value]) => value > avg + stdDev * 1.5 || value > avg * 1.6)
      .map(([monthKey, value]) => ({
        monthKey,
        value,
      }))
  }

  const alerts = []
  if (totalBudget > 0 && usedPercent >= 85) {
    alerts.push(`Budget utilization is at ${usedPercent}%.`)
  }
  if (remaining < 0) {
    alerts.push('Remaining budget is negative.')
  }
  if (pendingRequests.length >= 3) {
    alerts.push(`${pendingRequests.length} pending budget requests need review.`)
  }
  if (missingReceipts.length > 0) {
    alerts.push(`${missingReceipts.length} expenses are missing receipts.`)
  }
  if (anomalies.length > 0) {
    alerts.push(`${anomalies.length} month(s) show unusually high spending.`)
  }

  const lines = []
  if (!totalBudget && !totalExpenses && budgets.length === 0 && expenses.length === 0) {
    if (pageContext) {
      lines.push(`You are on ${pageContext.label}. ${pageContext.hint}`)
    }
    if (recentActivity.length) {
      lines.push(`Recent activity: ${recentActivity.join(', ')}.`)
    }
    if (topActivity) {
      lines.push(`Most frequent activity: ${topActivity}.`)
    }
    return {
      content:
        "I don't have enough budget data to answer yet. Add budgets, requests, or expenses and try again.",
      summary: pageContext
        ? `No budget data yet on ${pageContext.label}.`
        : 'No budget data available.',
      alerts: [],
      actions: pageContext?.action ? [{ label: `Open ${pageContext.label}`, to: pageContext.action }] : [],
      dataHighlights: {
        recentActivity,
        topActivity: topActivity || null,
        currentPage,
      },
    }
  }

  if (pageContext) {
    lines.push(`You are on ${pageContext.label}. ${pageContext.hint}`)
  }
  if (recentActivity.length) {
    lines.push(`Recent activity: ${recentActivity.join(', ')}.`)
  }
  if (topActivity) {
    lines.push(`Most frequent activity: ${topActivity}.`)
  }

  lines.push(`Budget overview: ${currency.format(totalExpenses)} spent of ${currency.format(totalBudget)} (${usedPercent}% used).`)
  lines.push(`Remaining balance: ${currency.format(remaining)}.`)

  if (latestMonthSnapshot) {
    lines.push(`Latest month (${formatMonthLabel(latestMonthSnapshot.monthKey)}): ${currency.format(latestMonthSnapshot.spend)} spent of ${currency.format(latestMonthSnapshot.budget)} (${latestMonthSnapshot.percent}% used).`)
  }

  if (trendLine) {
    const trendLabel = trendLine.direction === 'flat'
      ? 'stable'
      : trendLine.direction === 'up'
        ? 'rising'
        : 'declining'
    lines.push(`Trend line: spending is ${trendLabel} (${trendLine.changePercent}% from ${formatMonthLabel(trendLine.from)} to ${formatMonthLabel(trendLine.to)}).`)
  }

  if (topCategories.length) {
    const topCategory = topCategories[0]
    lines.push(`Top category: ${topCategory.cat} at ${currency.format(topCategory.amount)}.`)
  }

  if (missingReceipts.length) {
    lines.push(`Receipts missing: ${missingReceipts.length} expenses need documentation.`)
  }

  if (pendingRequests.length) {
    lines.push(`Pending requests: ${pendingRequests.length} awaiting approval.`)
  }

  if (anomalies.length) {
    const anomalyLabels = anomalies
      .slice(0, 2)
      .map((item) => `${formatMonthLabel(item.monthKey)} (${currency.format(item.value)})`)
    lines.push(`Anomalous spend: ${anomalyLabels.join(', ')}.`)
  }

  if (lastUserMessage.includes('receipt') && !missingReceipts.length) {
    lines.push('Receipts look complete for recorded expenses.')
  }

  const actions = []
  if (pageContext?.action) {
    actions.push({ label: `Open ${pageContext.label}`, to: pageContext.action })
  }
  if (pendingRequests.length) {
    actions.push({ label: 'Open Approvals', to: '/dashboard/approvals' })
  }
  if (missingReceipts.length) {
    actions.push({ label: 'Review Receipts', to: '/dashboard/documents' })
  }
  if (expenses.length) {
    actions.push({ label: 'Review Expenses', to: '/dashboard/expenses' })
  }
  if (budgets.length) {
    actions.push({ label: 'Open Budgets', to: '/dashboard/budgets' })
  }

  const uniqueActions = []
  const seen = new Set()
  actions.forEach((action) => {
    if (!action?.to || seen.has(action.to)) return
    seen.add(action.to)
    uniqueActions.push(action)
  })

  const lastLog = auditLogs[0]

  return {
    content: lines.join('\n'),
    summary: `Role ${role}: ${usedPercent}% of budget used.`,
    alerts,
    actions: uniqueActions.slice(0, 3),
    dataHighlights: {
      topExpenses,
      topCategories,
      lastAction: lastLog ? `${lastLog.type || 'activity'} at ${lastLog.timestamp}` : 'No recent activity',
      currentPage,
    },
  }
}

export default async function handler(req, res) {
  // Health check: GET returns presence of required env vars (no secrets)
  if (req.method === 'GET') {
    const OPENAI_API_KEY = process.env.OPENAI_API_KEY
    const ASSISTANT_MODE = process.env.CUENTA_ASSISTANT_MODE || 'auto'
    const usesOpenAI = ASSISTANT_MODE === 'openai' || (ASSISTANT_MODE === 'auto' && !!OPENAI_API_KEY)
    res.json({ ok: true, hasOpenAI: !!OPENAI_API_KEY, usesOpenAI, mode: usesOpenAI ? 'openai' : 'local' })
    return
  }

  if (req.method !== 'POST') {
    res.status(405).send('Method Not Allowed')
    return
  }

  const { messages, context } = req.body || {}
  if (!messages) {
    res.status(400).json({ error: 'Missing messages in request body' })
    return
  }

  const OPENAI_API_KEY = process.env.OPENAI_API_KEY
  const ASSISTANT_MODE = process.env.CUENTA_ASSISTANT_MODE || 'auto'
  const localReply = buildLocalAnalysis(context, messages)
  const shouldUseOpenAI = ASSISTANT_MODE === 'openai' || (ASSISTANT_MODE === 'auto' && !!OPENAI_API_KEY)

  if (!shouldUseOpenAI) {
    res.json({ reply: JSON.stringify(localReply) })
    return
  }

  if (!OPENAI_API_KEY) {
    res.json({ reply: JSON.stringify(localReply) })
    return
  }

  const DEFAULT_MODEL = 'gpt-4o-mini'
  const MODEL_SYNTH = process.env.OPENAI_MODEL || DEFAULT_MODEL
  const MODEL_FALLBACK = process.env.OPENAI_FALLBACK_MODEL || DEFAULT_MODEL

  function parseMaybeJson(text) {
    if (!text || typeof text !== 'string') return null
    try {
      return JSON.parse(text)
    } catch {
      return null
    }
  }

  function extractOpenAIError(text) {
    const payload = parseMaybeJson(text)
    if (payload && typeof payload.error === 'string') {
      const nested = parseMaybeJson(payload.error)
      if (nested && nested.error) {
        return {
          message: nested.error.message,
          code: nested.error.code,
          type: nested.error.type,
        }
      }
      if (nested && nested.message) {
        return { message: nested.message, code: nested.code, type: nested.type }
      }
    }

    if (payload && payload.error && typeof payload.error === 'object') {
      return {
        message: payload.error.message,
        code: payload.error.code,
        type: payload.error.type,
      }
    }

    return { message: text }
  }

  function shouldFallback(error) {
    if (!error) return false
    const message = typeof error.message === 'string' ? error.message.toLowerCase() : ''
    const code = typeof error.code === 'string' ? error.code.toLowerCase() : ''

    if (code === 'model_not_found') return true
    if (message.includes('model_not_found')) return true
    if (
      message.includes('does not exist') ||
      message.includes('not found') ||
      message.includes('no access') ||
      message.includes('not have access') ||
      message.includes('not available')
    ) {
      return true
    }

    if ([400, 401, 403, 404].includes(error.status) && message.includes('model')) return true

    return false
  }

  async function requestOpenAI(model, messagesPayload) {
    const resp = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${OPENAI_API_KEY}`,
      },
      body: JSON.stringify({ model, messages: messagesPayload }),
    })

    const text = await resp.text()
    if (!resp.ok) {
      const details = extractOpenAIError(text)
      const error = new Error(details.message || `OpenAI request failed with status ${resp.status}`)
      error.status = resp.status
      error.code = details.code
      error.type = details.type
      throw error
    }

    const data = text ? JSON.parse(text) : {}
    return data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content
  }

  // Helper to call OpenAI (with model fallback)
  async function callOpenAI(messagesPayload, modelOverride) {
    const primaryModel = modelOverride || MODEL_SYNTH
    const candidates = [
      primaryModel,
      MODEL_FALLBACK,
      'gpt-4o-mini',
    ].filter(Boolean)
    const tried = new Set()

    for (const model of candidates) {
      if (tried.has(model)) continue
      tried.add(model)
      try {
        return await requestOpenAI(model, messagesPayload)
      } catch (error) {
        if (!shouldFallback(error)) {
          throw error
        }
      }
    }

    const lastError = new Error('No available model could be used.')
    lastError.status = 500
    throw lastError
  }

  const systemPrompt = [
    'You are "Cuenta Assistant" - a helpful, concise assistant for the Cuenta budgeting app.',
    'You receive a JSON context object containing: role, currentPage, totals, requests (list), expenses (list), budgets (list), auditLogs (list).',
    'Use that live data only (do not invent facts). Always avoid exposing or echoing any PII from context.',
    '',
    'Behavior:',
    '- Analyze the provided context and the user query. Be concise and actionable.',
    "- Prioritize safety: if data is missing say you don't have enough info and list what's needed.",
    '- Detect issues: high utilization (>85%), negative remaining, many pending requests, large spikes, unusual monthly totals.',
    '- Provide suggestions the user can act on (approve, generate documents, review expenses, reconcile receipts).',
    '- Prefer bullet points and short sentences.',
    '',
    'Output format (RETURN EXACT JSON): Return a single JSON object with these fields:',
    '- content: string (Markdown or plain). Friendly short explanation and findings.',
    '- summary: string (one-line TL;DR).',
    '- alerts: array of strings (each a short alert).',
    '- actions: array of objects { label: string, to: string } - suggested UI navigation (e.g. {label: "Open Approvals", to: "/approvals"}).',
    '- dataHighlights: object with optional keys like { topExpenses: [{label,amount}], topCategories: [{cat,amount}], lastAction: string } - only include if available.',
    '- If you cannot provide structured actions (no permission/data), set actions: [].',
    '',
    'Rules:',
    '- Never reveal or repeat PII (names, emails, IDs, tokens).',
    "- If uncertain, say: \"I don't have enough data to answer - please provide ...\".",
    '- Keep content <= ~300 words for readability.',
    '- Use currency formatting consistent with the context when showing amounts.',
    '- Tailor suggestions to the user role responsibilities.',
    '- Return only JSON. No extra text, no code fences.',
  ].join('\n')

  const sanitizedMessages = Array.isArray(messages)
    ? messages
      .filter((msg) => msg && msg.role && msg.role !== 'system')
      .map((msg) => ({ role: msg.role, content: String(msg.content || '') }))
    : []

  const contextJson = JSON.stringify(context ?? {}, null, 2)

  const finalMessages = [
    { role: 'system', content: systemPrompt },
    { role: 'system', content: `Context JSON:\n${contextJson}` },
    ...sanitizedMessages,
  ]

  try {
    const reply = await callOpenAI(finalMessages)
    const trimmed = String(reply || '').trim()
    let normalized = trimmed

    try {
      const parsed = JSON.parse(trimmed)
      normalized = JSON.stringify(parsed)
    } catch {
      normalized = JSON.stringify(localReply)
    }

    res.json({ reply: normalized })
  } catch (err) {
    console.error(err)
    res.json({ reply: JSON.stringify(localReply) })
  }
}

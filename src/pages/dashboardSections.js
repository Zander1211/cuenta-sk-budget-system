export const dashboardSections = {
  main: {
    eyebrow: 'Main Dashboard',
    title: 'SK Chairman',
    description:
      'Track budgets, approvals, and governance signals in one secure workspace.',
    overviewTitle: 'Priority actions for today',
    actions: [
      'Review 3 pending approvals from the finance committee.',
      'Finalize the Q3 project allocation draft.',
      'Share the audit summary with the council.',
    ],
    stats: [
      { label: 'Active Budgets', value: '12', meta: '3 awaiting revision' },
      { label: 'Open Approvals', value: '7', meta: '2 marked urgent' },
      { label: 'Monthly Spend', value: '$84.2k', meta: '-6% vs last month' },
    ],
  },
  budgets: {
    eyebrow: 'Budgets',
    title: 'Budgets Overview',
    description: 'Monitor allocations, utilization, and pending revisions.',
    primaryAction: 'Create Budget',
    overviewTitle: 'Budget priorities',
    actions: [
      'Draft the 2026 youth development budget.',
      'Lock in funding for 4 ongoing projects.',
      'Review variance alerts on procurement.',
    ],
    stats: [
      { label: 'Allocated', value: '$410k', meta: 'FY 2026' },
      { label: 'Spent', value: '$192k', meta: '46.8% used' },
      { label: 'Revisions', value: '5', meta: '2 awaiting sign-off' },
    ],
  },
  projects: {
    eyebrow: 'Projects',
    title: 'Projects Pulse',
    description: 'Track delivery status and milestone progress.',
    overviewTitle: 'Project focus',
    actions: [
      'Approve the community center timeline update.',
      'Assign a project lead for skills training.',
      'Review the youth sports rollout plan.',
    ],
    stats: [
      { label: 'Active Projects', value: '9', meta: '3 in planning' },
      { label: 'On Track', value: '6', meta: '67% healthy' },
      { label: 'At Risk', value: '2', meta: 'Needs attention' },
    ],
  },
  expenses: {
    eyebrow: 'Expenses',
    title: 'Expense Control',
    description: 'Stay ahead of reimbursements and vendor spend.',
    overviewTitle: 'Expense priorities',
    actions: [
      'Confirm receipts for last week.',
      'Audit vendor invoices over $5k.',
      'Approve travel reimbursements.',
    ],
    stats: [
      { label: 'Pending Claims', value: '14', meta: '7 due today' },
      { label: 'Vendors', value: '22', meta: '4 new this month' },
      { label: 'Disputes', value: '2', meta: 'Awaiting response' },
    ],
  },
  documents: {
    eyebrow: 'Documents',
    title: 'Document Center',
    description: 'Manage resolutions, memos, and compliance files.',
    overviewTitle: 'Document tasks',
    actions: [
      'Upload council meeting minutes.',
      'Archive completed project reports.',
      'Share the procurement policy update.',
    ],
    stats: [
      { label: 'Files Stored', value: '248', meta: '12 new this week' },
      { label: 'Signatures', value: '8', meta: 'Awaiting approval' },
      { label: 'Expiring', value: '3', meta: 'Due in 30 days' },
    ],
  },
  approvals: {
    eyebrow: 'Approvals',
    title: 'Approvals Desk',
    description: 'Resolve requests and keep spending on track.',
    overviewTitle: 'Items to approve',
    actions: [
      'Approve budget release for project Alpha.',
      'Send feedback on the grant proposal.',
      'Confirm supplier onboarding.',
    ],
    stats: [
      { label: 'Pending', value: '7', meta: '2 urgent' },
      { label: 'Approved', value: '31', meta: 'This month' },
      { label: 'Rejected', value: '3', meta: 'Needs review' },
    ],
  },
  aiAnalysis: {
    eyebrow: 'AI Analysis',
    title: 'AI Analysis',
    description: 'Surface risk signals and funding insights.',
    overviewTitle: 'AI highlights',
    actions: [
      'Review overspend probability alerts.',
      'Generate a council summary.',
      'Inspect vendor concentration risks.',
    ],
    stats: [
      { label: 'Alerts', value: '4', meta: 'High confidence' },
      { label: 'Forecast', value: '$96k', meta: 'Next 30 days' },
      { label: 'Savings', value: '3.2%', meta: 'Suggested cuts' },
    ],
  },
  receipts: {
    eyebrow: 'Receipts',
    title: 'Receipts',
    description: 'Build summaries for council and committees.',
    primaryAction: 'New Receipt',
    overviewTitle: 'Receipts in progress',
    actions: [
      'Finalize the monthly financial report.',
      'Export project impact metrics.',
      'Schedule the council update deck.',
    ],
    stats: [
      { label: 'Drafts', value: '6', meta: 'In progress' },
      { label: 'Published', value: '18', meta: 'Year to date' },
      { label: 'Scheduled', value: '3', meta: 'Next week' },
    ],
  },
  auditLogs: {
    eyebrow: 'Audit Logs',
    title: 'Audit Logs',
    description: 'Review activity trails and compliance checks.',
    overviewTitle: 'Recent checks',
    actions: [
      'Verify the latest expense approvals.',
      'Export access history for auditors.',
      'Lock a sensitive record.',
    ],
    stats: [
      { label: 'Events', value: '1,248', meta: 'Last 30 days' },
      { label: 'Flags', value: '5', meta: 'Need review' },
      { label: 'Exports', value: '2', meta: 'Completed' },
    ],
  },
  profile: {
    eyebrow: 'Profile',
    title: 'Profile Settings',
    description: 'Manage account preferences and personal data.',
    overviewTitle: 'Profile checklist',
    actions: [
      'Update your contact information.',
      'Review notification settings.',
      'Enable two-factor authentication.',
    ],
    stats: [
      { label: 'Security', value: 'Strong', meta: '2FA enabled' },
      { label: 'Devices', value: '3', meta: '1 new this week' },
      { label: 'Alerts', value: 'On', meta: 'Weekly summary' },
    ],
  },
}

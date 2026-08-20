# Cuenta Financial Management System Flow

## System overview

Cuenta manages the financial activities of the Sangguniang Kabataan from budget preparation and request approval through expense documentation, reporting, auditing, and public disclosure. Access to internal functions is controlled according to the assigned user role.

## Main system flow

```mermaid
flowchart TD
    START([Start]) --> ENTRY{User type}

    ENTRY -->|Public visitor| PUBLIC[Open public transparency portal]
    PUBLIC --> VIEW[View published budget allocations and completed projects]
    VIEW --> END([End])

    ENTRY -->|Authorized officer| LOGIN[Enter email and password]
    LOGIN --> CAPTCHA[Complete reCAPTCHA verification]
    CAPTCHA --> AUTH{Credentials valid?}
    AUTH -->|No| ERROR[Display login error]
    ERROR --> LOGIN
    AUTH -->|Yes| DASH[Open role-based dashboard]

    DASH --> ROLE{Assigned role}

    ROLE -->|SK Treasurer| BUDGET[Create or update monthly budget]
    BUDGET --> REQUEST[Prepare project, event, or payroll request]
    REQUEST --> SUBMIT[Submit request]
    SUBMIT --> PENDING[(Pending request)]

    ROLE -->|SK Chairman| REVIEW[Review pending request]
    PENDING --> REVIEW
    REVIEW --> DECISION{Approve request?}

    DECISION -->|No| REJECT[Record rejection reason]
    REJECT --> NOTIFY_REJECT[Notify SK Treasurer]
    NOTIFY_REJECT --> REVISE[Revise and resubmit request]
    REVISE --> PENDING

    DECISION -->|Yes| APPROVE[Mark request as approved]
    APPROVE --> EXPENSE[Create approved expense or project record]
    EXPENSE --> NOTIFY_APPROVE[Notify SK Treasurer]

    NOTIFY_APPROVE --> IMPLEMENT[Implement project, event, or payroll activity]
    IMPLEMENT --> RECEIPT[Upload or scan supporting receipts]
    RECEIPT --> VERIFY[Store receipt record and scan metadata]
    VERIFY --> UPDATE[Update expense and project information]

    ROLE -->|SK Kagawad or Barangay Treasurer| MONITOR[Review approved requests, expenses, projects, and receipts]
    UPDATE --> MONITOR

    MONITOR --> REPORTS[Generate summaries, narrative reports, and annual reports]
    UPDATE --> REPORTS
    REPORTS --> ANALYSIS[View charts and AI-assisted financial analysis]
    ANALYSIS --> PUBLISH[Publish verified completed-project figures]
    PUBLISH --> PUBLIC

    LOGIN --> AUDIT[Record authentication and user actions]
    SUBMIT --> AUDIT
    APPROVE --> AUDIT
    REJECT --> AUDIT
    RECEIPT --> AUDIT
    REPORTS --> AUDIT
    AUDIT --> BACKUP[Backup and restore controls]
```

## Financial transaction flow

```mermaid
flowchart LR
    A[Monthly budget allocation] --> B[Budget request]
    B --> C{Chairman review}
    C -->|Rejected| D[Return for revision]
    D --> B
    C -->|Approved| E[Approved expense or project]
    E --> F[Project, event, or payroll implementation]
    F --> G[Receipt upload or scanning]
    G --> H[Expense monitoring and summaries]
    H --> I[Financial and annual reports]
    I --> J[Verified public transparency data]
```

## Role responsibilities

| User role | Primary system responsibilities |
|---|---|
| Public visitor | View published budget allocations and completed-project information without an account. |
| SK Chairman | Manage users, approve or reject requests, review audit records, manage backups, and access reports and analysis. |
| SK Treasurer | Maintain monthly budgets, prepare and submit project, event, and payroll requests, manage financial documents, receipts, and reports. |
| SK Kagawad | Monitor approved requests, projects, expenses, receipts, summaries, and available financial analysis. |
| Barangay Treasurer | Review approved financial activity, supporting receipts, expense summaries, projects, and available financial analysis. |

## Data and control flow

1. An authorized officer signs in, and the system validates the credentials through Supabase Authentication.
2. Role-based access control determines which pages and actions the authenticated officer may use.
3. The SK Treasurer records monthly budgets and submits a budget request with its category, amount, date, venue, description, and itemized breakdown.
4. The request remains pending until the SK Chairman reviews it.
5. A rejected request is returned with a reason and may be revised and resubmitted.
6. Approval updates the request and creates the corresponding approved expense or project record.
7. Supporting receipts are uploaded or scanned and linked to the approved transaction.
8. Approved financial records feed the dashboards, summaries, charts, analysis, narrative reports, and annual reports.
9. Verified completed-project information is published to the public transparency portal.
10. Significant actions are recorded in the audit trail, while backup and restore functions protect system records.

## Suggested figure caption

**Figure: Cuenta Financial Management System Flow.** The diagram shows how authenticated SK officers prepare budgets, submit and approve requests, document expenses, generate reports, and publish verified financial information for public transparency.

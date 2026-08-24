# Cuenta — System Flow Documentation

> **Last updated:** August 2026  
> **Stack:** React (Vite) · Supabase (PostgreSQL + Auth + Storage) · Vercel

---

## 1. System Overview

**Cuenta** is the financial management system of the *Sangguniang Kabataan* (SK). It covers the full lifecycle of public funds — from monthly budget allocation through request approval, expense documentation, receipt management, financial reporting, AI analysis, and public transparency publishing — with access strictly governed by user roles.

---

## 2. Architecture

```mermaid
graph TD
    subgraph Browser["Browser (React + Vite)"]
        UI["Pages & Components"]
        CTX["Context Providers\n(Auth · Budget · AuditLog · Document · BackupRestore · Notification)"]
        UI <--> CTX
    end

    subgraph Supabase["Supabase (Backend)"]
        AUTH["Auth (JWT + RLS)"]
        DB["PostgreSQL\n(budgets · expenses · budget_requests\nreceipt_records · documents · audit_trail\nbackups · notifications · …)"]
        STORAGE["Storage Buckets\n(receipts · project-photos · avatars)"]
        RPC["RPC Functions\n(approve_budget_request · rollback_restored_backup · …)"]
    end

    subgraph External["External"]
        AI["Google Gemini AI\n(Chat Widget + Analysis)"]
        RECAPTCHA["Google reCAPTCHA v3"]
        VERCEL["Vercel (Hosting)"]
    end

    UI --> AUTH
    CTX --> DB
    CTX --> STORAGE
    CTX --> RPC
    UI --> AI
    UI --> RECAPTCHA
```

---

## 3. User Roles & Access

| Role | Description | Key Permissions |
|---|---|---|
| **Public Visitor** | No account required | View public transparency portal only |
| **SK Chairman** | Highest authority | Full access — approvals, user management, audit trail, backup/restore |
| **SK Treasurer** | Financial officer | Budgets, requests, expenses, documents, receipts, reports |
| **SK Kagawad** | Council member | Read-only monitoring — requests, expenses, projects, receipts, summaries |
| **Barangay Treasurer** | External auditor | Read-only — approved financials, receipts, expense summaries, projects |

---

## 4. Application Routes

```mermaid
graph LR
    ROOT["/  Public Transparency Portal"]
    LOGIN["/login  Login Page"]

    subgraph Dashboard["/dashboard — Authenticated"]
        D_INDEX["/ — Main Dashboard"]
        D_BUDGET["budgets — Monthly Budgets"]
        D_PROJ["projects-events — Projects & Events"]
        D_EXP["expenses — Expenses"]
        D_REQ["request — Budget Requests"]
        D_NEWREQ["request/new — New Request Form"]
        D_BREQ["budget-requests — Budget Requests (Chairman)"]
        D_APPROVALS["approvals — Approvals"]
        D_PAY["payroll — Payroll"]
        D_DOCS["documents — Documents"]
        D_RECEIPTS["receipts — Receipts"]
        D_RDETAIL["receipt-details — Receipt Details"]
        D_EXPSUMM["expense-summary — Expense Summary"]
        D_NARR["narrative-report — Narrative Report"]
        D_ANNUAL["annual-report — Annual Report"]
        D_ANA["analysis — Analysis Overview"]
        D_ANA_BVA["analysis/budget-vs-actual"]
        D_ANA_EBC["analysis/expenses-by-category"]
        D_ANA_MS["analysis/monthly-spending"]
        D_ANA_BU["analysis/budget-utilization"]
        D_AUDIT["audit-trail — Audit Trail"]
        D_BACKUP["backup-restore — Backup & Restore"]
        D_USERS["user-management — User Management"]
        D_PROFILE["profile — Profile"]
        D_BIO["profile/biodata — Biodata"]
        D_PWD["profile/change-password"]
        D_EMAIL["profile/update-email"]
        D_OTP["profile/update-otp"]
    end

    ROOT --> LOGIN
    LOGIN --> Dashboard
```

---

## 5. Main System Flow

```mermaid
flowchart TD
    START([User opens app]) --> TYPE{Authenticated?}

    TYPE -->|No — public| PUBLIC["Public Transparency Portal\n(budget overview, completed projects)"]
    PUBLIC --> END([End session])

    TYPE -->|No — officer| LOGIN["Login Page\n(email + password + reCAPTCHA)"]
    LOGIN --> AUTHCHECK{Credentials valid?}
    AUTHCHECK -->|No| LOGINERR["Show error · retry"]
    LOGINERR --> LOGIN
    AUTHCHECK -->|Yes| ROLECHECK{Role?}

    ROLECHECK -->|SK Treasurer| TREAS_FLOW["Budget & Request Flow"]
    ROLECHECK -->|SK Chairman| CHAIR_FLOW["Approval & Management Flow"]
    ROLECHECK -->|SK Kagawad / Barangay Treasurer| MONITOR_FLOW["Read-only Monitoring Flow"]

    TREAS_FLOW --> DASH["Main Dashboard\n(summary cards, charts, year spinner)"]
    CHAIR_FLOW --> DASH
    MONITOR_FLOW --> DASH
```

---

## 6. Financial Transaction Flow

```mermaid
flowchart TD
    A["SK Treasurer\nAllocates Monthly Budget\n(budgets table)"] --> B["Prepares Budget Request\n(budget_requests table)\nType: Project · Event · Payroll"]
    B --> C["Submits Request\nStatus → Pending"]
    C --> D{"SK Chairman\nReviews Request"}

    D -->|Rejected| E["Rejection recorded\nNotification sent to Treasurer"]
    E --> F["Treasurer revises\nand resubmits"]
    F --> C

    D -->|Approved| G["Request Status → Approved\napprove_budget_request() RPC called"]
    G --> H["Approved expense row created\n(expenses table)\nParent row (is_additional = false)"]
    H --> I["SK Treasurer implements\nProject · Event · Payroll"]

    I --> J["Receipts uploaded or scanned\n(receipt_records table)\nFiles in Storage: receipts bucket"]
    J --> K["Requisition line items added\nas child expenses\n(is_additional = true,\nparent_project_id = parent.id)"]

    K --> L["Expense Summary\nProjects & Events Page\nReceipts Page"]
    L --> M["Reports Generated\nNarrative · Annual · Documents"]
    M --> N["Analysis\nBudget vs Actual · Category Breakdown\nMonthly Spending · Utilization"]
    N --> O["Verified data published\nto Public Transparency Portal"]
```

---

## 7. Request Approval Detail

```mermaid
sequenceDiagram
    actor Treasurer as SK Treasurer
    actor Chairman as SK Chairman
    participant DB as Supabase DB
    participant Notif as Notifications

    Treasurer->>DB: INSERT into budget_requests (status=Pending)
    DB-->>Chairman: Notification: new pending request
    Chairman->>DB: Review request details
    alt Approve
        Chairman->>DB: CALL approve_budget_request()
        DB->>DB: UPDATE budget_requests SET status=Approved
        DB->>DB: INSERT into expenses (parent row)
        DB->>DB: INSERT into audit_trail
        DB-->>Treasurer: Notification: request approved
    else Reject
        Chairman->>DB: UPDATE budget_requests SET status=Rejected + reason
        DB->>DB: INSERT into audit_trail
        DB-->>Treasurer: Notification: request rejected
        Treasurer->>DB: UPDATE budget_requests (revise + resubmit)
    end
```

---

## 8. Receipt & Document Flow

```mermaid
flowchart LR
    A["Treasurer uploads receipt\n(image / PDF)"] --> B["Stored in Supabase Storage\nreceipts bucket"]
    B --> C["receipt_records row inserted\nrecord_id → parent expense id\nrequisition_id → child expense id (optional)"]
    C --> D["OCR / AI scan metadata\nattached to receipt_records"]
    D --> E["ReceiptsPage · ReceiptDetailsPage\ndisplay receipt with print preview"]
    E --> F["DocumentGenerator\ncreates formal PDF documents\n(stored in documents table)"]
    F --> G["DocumentsPage\narchive and download generated docs"]
```

---

## 9. Database Tables

| Table | Purpose |
|---|---|
| `budgets` | Append-only monthly budget allocations (cumulative per month) |
| `budget_requests` | Project / Event / Payroll requests pending or approved by Chairman |
| `expenses` | Approved financial records; parent rows + requisition child rows |
| `projects` | Standalone project records (if separate from expenses) |
| `receipt_records` | Uploaded or scanned receipts linked to expense records |
| `project_photos` | Photo uploads attached to project records |
| `documents` | Generated financial documents (PDF metadata + storage path) |
| `document_counters` | Serial counter per document type / year |
| `report_summaries` | Cached narrative and annual report summaries |
| `audit_trail` | Immutable log of all significant user actions |
| `notifications` | In-app notifications dispatched to officers |
| `chat_history` | AI Chat Widget conversation history |
| `backups` | Backup file metadata (filename, created_at) |
| `restore_history` | Restore operation log including pre-restore snapshot (JSONB) |
| `profiles` | User profile data (name, avatar, contact) |
| `member_biodata` | SK member official biodata |
| `verification_codes` | Email OTP verification codes for account actions |

> ⚠️ **User tables** (`auth.users`, `profiles`, `member_biodata`, `verification_codes`) are **never** cleared by the data reset script.

---

## 10. Context Providers

| Provider | Responsibility |
|---|---|
| `AuthContext` | Supabase session, user role, sign-in / sign-out |
| `BudgetContext` | Budget allocations, expenses, requests, projects (main data store) |
| `AuditLogContext` | Writing to and reading from `audit_trail` |
| `DocumentContext` | Document generation, archiving, counter management |
| `BackupRestoreContext` | Full database backup to JSON, restore, and rollback via RPC |
| `NotificationContext` | Real-time in-app notifications via Supabase Realtime |

---

## 11. Analysis Module

The **Analysis** section (lazy-loaded) provides four chart views:

| Route | Chart | Description |
|---|---|---|
| `analysis/budget-vs-actual` | Bar / Line | Monthly allocated budget vs actual expenses |
| `analysis/expenses-by-category` | Doughnut / Pie | Spending breakdown by expense category |
| `analysis/monthly-spending` | Line | Spending trend across months in the selected year |
| `analysis/budget-utilization` | Gauge / Bar | Percentage of budget consumed per month |

An **AI Chat Widget** (powered by Google Gemini) is available to all authenticated officers for natural-language financial Q&A backed by live database context.

---

## 12. Public Transparency Portal

The root route `/` is publicly accessible without authentication. It displays:

- Current-year **budget overview** (total allocated vs spent)
- List of **completed projects** with actual expenditure figures
- Sections navigable via URL hash: `/#budget`, `/#projects`, `/#about`

Data is served through the `publicTransparencyService` using a restricted read-only Supabase query that only surfaces verified/approved records.

---

## 13. Audit & Security Model

```mermaid
flowchart LR
    ACTION["Any significant action\n(login · submit · approve · reject\nreceipt upload · document generate\nbackup · restore · rollback)"]
    --> AUDIT["INSERT into audit_trail\n(user_id, user_name, user_role,\naction, action_type, module,\nrecord_id, description, status)"]

    AUDIT --> VIEW["AuditTrailPage\n(Chairman only)"]

    RLS["Row Level Security (RLS)\non every table"] --> ROLE_CHECK{"Role check via\nauth.jwt() → app_metadata.role"}
    ROLE_CHECK --> ALLOW["Allow read / write"]
    ROLE_CHECK --> DENY["Deny with 42501"]
```

- All tables have **RLS enabled**
- Role is stored in `app_metadata` (set server-side by Chairman on user creation)
- `SECURITY DEFINER` RPC functions (`approve_budget_request`, `rollback_restored_backup`) bypass RLS only for atomic operations after internal role validation

---

## 14. Backup & Restore Flow

```mermaid
flowchart TD
    A["SK Chairman triggers\nCreate Backup"] --> B["BudgetContext snapshots\nall operational tables to JSONB"]
    B --> C["JSONB saved to backups table\n+ optionally to localStorage"]
    C --> D["BackupRestorePage\nlists all backup files"]

    D --> E["Chairman selects backup\nand triggers Restore"]
    E --> F["rollback_restored_backup() RPC\n1. Verify role = SK Chairman\n2. Clear all operational tables\n3. Re-insert rows from snapshot\n4. Record restore_history row\n5. Write audit_trail entry"]
    F --> G["System returns to\nsnapshot state"]

    G --> H{"Rollback needed?"}
    H -->|Yes| I["Chairman triggers Rollback Restore\nPre-restore snapshot retrieved\nfrom restore_history.snapshot"]
    I --> F
    H -->|No| J["Done"]
```

---

## 15. Data Reset (Admin Only)

The [`reset_database_data.sql`](../supabase/migrations/reset_database_data.sql) script wipes all operational data while preserving all user accounts.

**Cleared:** budgets · budget_requests · expenses · projects · receipt_records · project_photos · documents · document_counters (reset to 0) · report_summaries · chat_history · audit_trail · restore_history · backups · notifications

**Preserved:** `auth.users` · `profiles` · `member_biodata` · `verification_codes`

---

*Figure: Cuenta Financial Management System — complete flow from public access through role-based officer workflows, financial lifecycle, reporting, and public transparency.*

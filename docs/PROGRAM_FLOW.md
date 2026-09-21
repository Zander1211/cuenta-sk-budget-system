# Cuenta — Program Flow Documentation

> **Last updated:** September 2026  
> **Stack:** React (Vite) · Supabase (PostgreSQL + Auth + Storage) · Vercel

This document traces **runtime control flow** — the order in which the program
actually executes, branch by branch. It is the companion to
[SYSTEM_FLOW.md](SYSTEM_FLOW.md), which covers architecture and data movement.
Where that document answers *where the data lives*, this one answers
*what happens next*.

---

## Table of Contents

| Section | Flow |
|---|---|
| [A](#a-system-startup-flow) | System startup |
| [B](#b-authentication-flow) | Authentication — login and initial chairman setup |
| [C](#c-route-protection-flow) | Route protection |
| [D](#d-core-transaction-flow) | Core transaction — budget → request → approval |
| [E](#e-expense-documentation-flow) | Expense documentation and project lifecycle |
| [F](#f-reporting-analysis--publishing-flow) | Reporting, analysis and publishing |
| [G](#g-administration-flow) | Administration — chairman only |
| [H](#h-cross-cutting-flows) | Cross-cutting flows |
| [I](#i-drawing-this-as-a-program-flowchart) | Drawing this as a program flowchart |

---

## A. System Startup Flow

The entry point is [`src/main.jsx`](../src/main.jsx), which mounts the root and
loads the three stylesheets in a deliberate order — `system-components.css` is
last because it aliases the public portal's classes onto the internal component
names and has to win on equal specificity.

```mermaid
flowchart TD
    START([User opens Cuenta]) --> BOOT["main.jsx mounts the React root<br/>loads index.css · analysis.css · system-components.css"]
    BOOT --> PROV["App.jsx builds the provider stack:<br/>AuthProvider → AuditLogProvider → NotificationProvider<br/>→ BudgetProvider → BackupRestoreProvider → DocumentProvider"]
    PROV --> AUTHINIT["AuthContext: supabase.auth.getSession()<br/>subscribes to onAuthStateChange"]
    AUTHINIT --> LOADING{isLoading?}
    LOADING -->|Yes| SCREEN["Render LoadingScreen"] --> LOADING
    LOADING -->|No| ROLERES["Resolve role by priority chain"]
    ROLERES --> SYNC["Sync role and name back into<br/>Auth user_metadata if stale"]
    SYNC --> ROUTER["BrowserRouter renders AppRoutes"]
    ROUTER --> PATH{Requested path}
    PATH -->|/| PUBLIC["Public Transparency Portal"]
    PATH -->|/login| LOGIN["Login Page"]
    PATH -->|/dashboard/*| GATE["DashboardLayout + RoleGate"]
    PATH -->|unknown| REDIR["Navigate to /"] --> PUBLIC
```

### Role resolution priority chain

`AuthContext` does not trust a single source for the user's role. It resolves in
this order and stops at the first value found:

1. `session.user.app_metadata.role` — set server-side, authoritative
2. `session.user.user_metadata.role`
3. `created_accounts` row matched by **user id**
4. `created_accounts` row matched by **email**, ordered `is_active` descending
   and capped at one row — a disabled account can share an email with a newer
   active one, so the active row has to win
5. Fallback: `'SK Chairman'`

Once resolved, the role and name are written back to `user_metadata` when they
differ, so JWT-backed RLS policies stay current.

---

## B. Authentication Flow

Two modes share one page: normal sign-in, and a one-time initial setup that
registers the SK Chairman. The setup form is hidden once a chairman exists.

```mermaid
flowchart TD
    A([Login Page loaded]) --> MODE{Mode?}

    MODE -->|Sign in| L1["Enter email and password"]
    L1 --> L2{reCAPTCHA token present?}
    L2 -->|No| LERR1["Complete the CAPTCHA to continue"] --> L1
    L2 -->|Yes| L3["POST /api/login"]
    L3 --> L4["Server verifies the token with<br/>google.com/recaptcha/api/siteverify"]
    L4 --> L5{Verification success?}
    L5 -->|No| LERR2["400 — reCAPTCHA failed"] --> RESET["Reset captcha<br/>write Failed audit log"] --> L1
    L5 -->|Yes| L6{Hostname in allowlist?}
    L6 -->|No| LERR3["400 — unauthorized hostname"] --> RESET
    L6 -->|Yes| L7["supabase.auth.signInWithPassword()"]
    L7 --> L8{Credentials valid?}
    L8 -->|No| LERR4["401 — invalid credentials"] --> RESET
    L8 -->|Yes| L9["Admin client reads created_accounts.is_active<br/>service role, bypasses RLS"]
    L9 --> L10{Account active?}
    L10 -->|No| LERR5["signOut() immediately<br/>403 — account disabled by the SK Chairman"] --> RESET
    L10 -->|Yes| L11["Return the session to the client<br/>supabase.auth.setSession()"]
    L11 --> L12["Write Success audit log<br/>refreshSession()"] --> DASH([Dashboard])

    MODE -->|Initial setup| R1{Chairman already exists?}
    R1 -->|Yes| RBLOCK["Registration blocked"] --> A
    R1 -->|No| R2["Validate Gmail format · password rules · captcha"]
    R2 --> R3["POST /api/send-otp — email a 6-digit code"]
    R3 --> R4["Enter OTP → POST /api/verify-otp"]
    R4 --> R5{Code valid?}
    R5 -->|No| RERR["That code is not valid"] --> R4
    R5 -->|Yes| R6["POST /api/register-chairman"] --> R7["SK Chairman account registered"] --> A
```

**Note:** sign-in is email + password + reCAPTCHA only. There is **no OTP step on
login**. OTP is used for chairman registration, officer-account creation, and
email changes.

The disabled-account check runs *after* a successful password sign-in and signs
the user straight back out, so no session token is left active on a disabled
account.

---

## C. Route Protection Flow

`RoleGate` wraps every protected page and runs on each navigation.

```mermaid
flowchart TD
    N([Navigate to /dashboard/xyz]) --> G1{AuthContext isLoading?}
    G1 -->|Yes| G2["Render nothing — wait for the session"] --> G1
    G1 -->|No| G3{isAuthenticated?}
    G3 -->|No| G4["Redirect to /"] --> END1([Public portal])
    G3 -->|Yes| G5{"allow[] includes role?"}
    G5 -->|No| G6["Redirect to /dashboard"] --> END2([Main dashboard])
    G5 -->|Yes| G7["Render the page"]
    G7 --> G8["Sidebar filters navItems by role<br/>NotificationBell renders only for<br/>SK Chairman and SK Treasurer"]
    G8 --> END3([Page in use])
```

Protection is layered: the sidebar hides what a role cannot reach, `RoleGate`
blocks direct URL entry, and Row Level Security refuses the query even if both
front-end checks were bypassed.

### Role to page access matrix

| Page | Chairman | Treasurer | Kagawad | Brgy. Treasurer |
|---|:--:|:--:|:--:|:--:|
| Main Dashboard | ✔ | ✔ | ✔ | ✔ |
| Budgets & Analysis | ✔ | ✔ (edit) | ✔ | ✔ |
| Approved Records | ✔ | ✔ | ✔ | ✔ |
| Documents & Receipts | ✔ | ✔ | ✔ | ✔ |
| Expenses | ✔ | ✔ | — | — |
| Expense Summary | — | — | ✔ | ✔ |
| Request / New Request | — | ✔ | — | — |
| Request Review (approvals) | ✔ | — | — | — |
| Narrative / Annual Report | ✔ | ✔ | — | — |
| Activity Logs (view-only) | ✔ | ✔ | ✔ | ✔ |
| Backup & Restore | ✔ | — | — | — |
| User Management | ✔ | — | — | — |
| Profile | ✔ | ✔ | ✔ | ✔ |

Budget **editing** is narrower than budget viewing: `canEdit` is true only for
`SK Treasurer`.

---

## D. Core Transaction Flow

This is the main program loop — budget allocation through approval.

```mermaid
flowchart TD
    B1([SK Treasurer opens Budgets]) --> B2{canEdit — role is SK Treasurer?}
    B2 -->|No| B3["Read-only view"] --> STOP1([End])
    B2 -->|Yes| B4["Enter month · year · amount · source"]
    B4 --> B5{"month within 1-12 and year numeric?"}
    B5 -->|No| B4
    B5 -->|Yes| B6["quarter = floor((month-1)/3)+1<br/>optimistic UI update applied first"]
    B6 --> B7{Row exists for that month and year?}
    B7 -->|Yes| B8["UPDATE budgets"]
    B7 -->|No| B9["INSERT budgets"]
    B8 --> B10["addLog → audit_trail"]
    B9 --> B10

    B10 --> C1([Treasurer opens Request → New Request])
    C1 --> C2["Choose type: Project · Event · Payroll<br/>fill event, category, amount, date,<br/>venue, description, breakdown lines"]
    C2 --> C3["INSERT budget_requests<br/>status = Pending · project_status = Pending"]
    C3 --> C4{Insert succeeded?}
    C4 -->|No| C5["Show error, preserve form data"] --> C2
    C4 -->|Yes| C6["INSERT notifications for<br/>SK Chairman · SK Kagawad · Barangay Treasurer"]
    C6 --> C7["Realtime channel notifications-sync<br/>pushes to NotificationBell"]

    C7 --> D1([SK Chairman opens Request Review])
    D1 --> D2["Inspect the request and its breakdown"]
    D2 --> D3{Decision}

    D3 -->|Reject| E1["UPDATE budget_requests<br/>status = Rejected + rejection_reason"]
    E1 --> E2["INSERT audit_trail + notifications"]
    E2 --> E3([Treasurer revises])
    E3 --> E4["resubmitRequest() → status back to Pending"] --> D1

    D3 -->|Approve| F1["CALL rpc approve_budget_request(p_request_id)"]
    F1 --> F2{RPC returned both request and expense?}
    F2 -->|Yes| F5["Atomic path complete"]
    F2 -->|No or error| F3["FALLBACK — direct mutation:<br/>1. UPDATE budget_requests → Approved / Ongoing<br/>2. INSERT expenses parent row"]
    F3 --> F5
    F5 --> F6["INSERT audit_trail<br/>INSERT notifications → Treasurer"]
    F6 --> G0([Implementation phase])
```

### Why approval has two paths

Approval has to update `budget_requests` and create the matching `expenses`
parent row together, or not at all. The `approve_budget_request` SECURITY
DEFINER stored procedure does both in one transaction. If the RPC errors or is
not deployed, the client logs a warning and falls back to running the two
mutations directly. The fallback is a deliberate availability trade-off: it keeps
approvals working on an environment where the migration has not been applied, at
the cost of atomicity.

---

## E. Expense Documentation Flow

```mermaid
flowchart TD
    G0([Approved parent expense exists]) --> H1["Treasurer implements the project, event or payroll"]
    H1 --> H2{Add requisition line items?}
    H2 -->|Yes| H3["addAdditionalRequisition()<br/>INSERT child expenses<br/>is_additional = true<br/>parent_project_id = parent.id"]
    H3 --> H4
    H2 -->|No| H4{Attach receipt?}
    H4 -->|Yes| H5["validateReceiptFile(file, role)"]
    H5 --> H6{Valid type and size?}
    H6 -->|No| H7["Show validation error"] --> H4
    H6 -->|Yes| H8["Upload to Storage bucket receipts"]
    H8 --> H9["INSERT receipt_records<br/>record_id → parent expense<br/>requisition_id → child expense, optional"]
    H9 --> H10{Run OCR scan?}
    H10 -->|Yes| H11["Tesseract.js extracts vendor · date · total<br/>metadata attached to receipt_records"]
    H11 --> H12
    H10 -->|No| H12["Receipt visible to all four roles on<br/>Documents & Receipts and Approved Records"]
    H4 -->|No| H12

    H12 --> I1{Project lifecycle action}
    I1 -->|Complete| I2["rpc complete_project_event()<br/>unused budget returned"]
    I1 -->|Reopen| I3["rpc reopen_project_event()<br/>budget restored"]
    I1 -->|Archive| I4{role is SK Chairman?}
    I4 -->|No| I5["Action hidden — canArchive is false"]
    I4 -->|Yes| I6["archiveExpense<br/>+ audit_trail"]
    I2 --> J0([Reporting])
    I3 --> J0
    I6 --> J0
```

### Parent and child expense rows

The `expenses` table holds two kinds of row:

| Row | `is_additional` | `parent_project_id` | Created by |
|---|---|---|---|
| Approved parent | `false` | `null` | Approval RPC or its fallback |
| Requisition child | `true` | parent row id | `addAdditionalRequisition()` |

Totals have to sum children against their parent's approved amount — never sum
the whole table flat, or approved allocations get double-counted alongside their
own line items.

---

## F. Reporting, Analysis & Publishing Flow

```mermaid
flowchart TD
    J0([Financial data settled]) --> J1{Which output?}

    J1 -->|Expense Summary| J2["SK Kagawad / Barangay Treasurer<br/>filter by year · month · category"]
    J1 -->|Narrative Report| J3["SK Chairman / SK Treasurer<br/>compose, cache in report_summaries"]
    J1 -->|Annual Report| J4["SK Chairman / SK Treasurer<br/>aggregate full-year figures"]
    J1 -->|Analysis| J5["Lazy-load chart route:<br/>Budget vs Actual · Expenses by Category<br/>Monthly Spending · Utilization · Distribution"]
    J1 -->|Formal document| J6["DocumentGenerator<br/>increment document_counters<br/>INSERT documents + storage path"]

    J2 --> K1{Export?}
    J3 --> K1
    J4 --> K1
    J5 --> K1
    J6 --> K1
    K1 -->|PDF| K2["jsPDF + html2canvas → download"]
    K1 -->|CSV| K3["exportCsv util → download"]
    K1 -->|No| K4
    K2 --> K4["Verified records surface in the<br/>public_projects view"]
    K3 --> K4

    K4 --> L1([Public Visitor opens /])
    L1 --> L2["getPublicTransparencyData()<br/>read-only query, verified records only"]
    L2 --> L3{Query succeeded?}
    L3 -->|No| L4["Transparency information could not be loaded"]
    L3 -->|Yes| L5["Render sections #budget · #projects · #about"]
```

The analysis routes are lazy-loaded behind `Suspense` so their chart libraries do
not weigh down any other route. The legacy `ai-analysis` and `analysis` paths
redirect to `/dashboard/budgets?tab=analysis`, and `receipts` and `payroll`
redirect into the Documents and Projects & Events pages respectively — old
bookmarks keep working after those merges.

---

## G. Administration Flow

Every branch below is SK Chairman only, enforced by `RoleGate` and RLS.

```mermaid
flowchart TD
    M0([Chairman opens the admin area]) --> M1{Which task?}

    M1 -->|Create account| N1["Choose a role from availableRoles"]
    N1 --> N2["checkRoleLimit(role)"]
    N2 --> N3{Limit reached?}
    N3 -->|Yes| N4["Disable an existing account first"] --> N1
    N3 -->|No| N5["Send OTP → verify → POST /api/create-user"]
    N5 --> N6["INSERT created_accounts + audit_trail"]

    M1 -->|Enable / disable| O1["Toggle is_active"]
    O1 --> O2{Re-enabling?}
    O2 -->|Yes| O3["Re-check the role limit first"] --> O4
    O2 -->|No| O4["UPDATE created_accounts<br/>record disabled_at and disabled_by<br/>+ audit_trail"]

    M1 -->|Activity logs| P1["Read audit_trail<br/>filter by module · action type · date · status"]

    M1 -->|Backup| Q1["Snapshot operational tables to JSONB<br/>INSERT backups"]
    M1 -->|Restore| Q2["rpc rollback_restored_backup():<br/>1. verify role is SK Chairman<br/>2. clear operational tables<br/>3. re-insert rows from the snapshot<br/>4. INSERT restore_history with pre-restore snapshot<br/>5. INSERT audit_trail"]
    Q2 --> Q3{Rollback needed?}
    Q3 -->|Yes| Q4["Retrieve restore_history.snapshot<br/>and re-run the restore"] --> Q2
    Q3 -->|No| Q5([Done])
```

### Active-account limits

Limits count **active** accounts only; disabling an account frees its slot.

| Role | Maximum active accounts |
|---|---|
| SK Chairman | 1, created through initial setup |
| SK Treasurer | 1 |
| Barangay Treasurer | 1 |
| SK Kagawad | 8 |

The limit is checked twice — before the OTP is sent, so no unnecessary email goes
out, and again before an account is re-enabled.

---

## H. Cross-cutting Flows

These run alongside every flow above rather than in sequence with them.

| Flow | Trigger | Path |
|---|---|---|
| **Audit logging** | Any significant write | `addLog()` → `INSERT audit_trail` (user_id, user_name, user_role, action, action_type, module, record_id, description, status) |
| **Notifications** | Request submitted, approved, rejected or cancelled | `INSERT notifications` → Supabase Realtime channel `notifications-sync` → NotificationBell |
| **AI assistant** | Authenticated user opens ChatWidget | `supabase.functions.invoke('chatbot')` → Gemini, with live database context |
| **Session change** | Token refresh, sign-out, or a change in another tab | `onAuthStateChange` → re-resolve role → re-render gated routes |
| **Error containment** | Any route throws during render | `RouteErrorBoundary` renders a fallback instead of blanking the app |
| **RLS enforcement** | Every database call | Policy checks `auth.jwt() → app_metadata.role`; denial returns Postgres error `42501` |

Failed logins are logged too — the audit trail records the attempt with
`status: 'Failed'` and the error message before the form error is shown.

---

## I. Drawing this as a program flowchart

For documentation that requires ANSI flowchart symbols rather than the diagrams
above:

| Symbol | Use for | Example from this document |
|---|---|---|
| Oval | Start / End | `User opens Cuenta`, `Session ends` |
| Parallelogram | Input / Output | `Enter email and password`, `Display dashboard` |
| Rectangle | Process | `Compute quarter`, `Insert expense row` |
| Diamond | Decision | `Credentials valid?`, `Role is SK Chairman?` |
| Cylinder | Data store | Supabase tables |
| Double-sided rectangle | Predefined process | `approve_budget_request()`, `complete_project_event()`, `rollback_restored_backup()` |
| Circle | Off-page connector | Links section A → B → D |

Draw one chart per lettered section — a single combined chart will not fit a page
legibly. Section **D** is the one to feature in the main body, since it is the
system's core loop; the others belong in an appendix.

---

*Figure: Cuenta — runtime control flow from application boot through
authentication, role gating, the budget-request-approval loop, expense
documentation, reporting, and administration.*

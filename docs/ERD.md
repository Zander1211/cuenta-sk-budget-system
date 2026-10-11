# Cuenta entity relationship diagram

Based on the SQL migrations and application code in this repository, reviewed September 29, 2026. This describes the repository's intended schema; the live Supabase database was not inspected. Fields are selected for readability, rather than an exhaustive column inventory.

`PK` means primary key, `FK` means a foreign key explicitly declared in the migrations, and `UK` means unique key. Relationships labeled `app` are application-level associations, not confirmed database foreign keys. Mermaid solid/dashed lines retain their standard identifying/non-identifying meaning; use the labels and FK markers to determine enforcement. `||` means exactly one, `o|` means zero or one, and `o{` means zero or many. Application relationship cardinalities describe intended use, not enforced referential integrity.

## Financial records and supporting documents

```mermaid
erDiagram
    AUTH_USERS |o..o{ BUDGET_REQUESTS : "FK created_by"
    AUTH_USERS |o..o{ BUDGETS : "app added_by"
    AUTH_USERS |o..o{ EXPENSES : "app created_by"
    BUDGET_REQUESTS |o..o| EXPENSES : "app request_id - unique when set"
    EXPENSES |o..o{ EXPENSES : "FK parent_project_id"
    EXPENSES ||..o{ RECEIPT_RECORDS : "app record_id - parent owner"
    EXPENSES |o..o{ RECEIPT_RECORDS : "app requisition_id - optional child"
    AUTH_USERS |o..o{ RECEIPT_RECORDS : "app uploaded_by_id"
    AUTH_USERS |o..o{ DOCUMENTS : "app created_by"
    EXPENSES |o..o{ DOCUMENTS : "app related_entity_id by type"
    BUDGET_REQUESTS |o..o{ DOCUMENTS : "app related_entity_id by type"

    AUTH_USERS {
        uuid id PK
        text email
        jsonb raw_app_meta_data
        jsonb raw_user_meta_data
    }
    BUDGETS {
        uuid id PK
        integer month
        integer quarter
        integer year
        numeric amount
        text source
        text description
        uuid added_by "app user reference"
        text added_by_name
        text transparency_status
        text public_category
        timestamptz published_at
        timestamptz created_at
    }
    BUDGET_REQUESTS {
        uuid id PK
        uuid created_by FK
        text requested_by
        text type
        text event
        text category
        numeric amount
        numeric approved_amount
        date event_date
        text status
        text project_status
        jsonb breakdown
        jsonb expenses_breakdown
        jsonb revision_history
        timestamptz submitted_at
        timestamptz approved_at
        timestamptz archived_at
    }
    EXPENSES {
        deployment_id id PK "original definition absent"
        uuid request_id UK "app request reference - nullable"
        deployment_id parent_project_id FK "same type as id"
        uuid created_by "app user reference"
        boolean is_additional
        text type
        text event
        text project
        text category
        numeric amount
        numeric requested_budget
        numeric approved_budget
        numeric original_approved_budget
        numeric returned_budget
        integer month
        integer year
        date event_date
        text status
        text project_status
        jsonb expenses_breakdown
        text transparency_status
        timestamptz returned_at
    }
    RECEIPT_RECORDS {
        uuid id PK
        text record_type
        text record_id "app parent expense reference"
        text requisition_id "app child expense reference"
        text file_path
        text original_path
        text file_name
        text uploaded_by_id "app user reference"
        boolean is_scanned
        jsonb ocr_metadata
        jsonb scan_settings
        timestamptz ocr_verified_at
        text ocr_verified_by
        timestamptz uploaded_at
    }
    DOCUMENTS {
        uuid id PK
        uuid created_by "app user reference"
        text name
        text type
        text generated_by
        text related_entity_type
        text related_entity_id "polymorphic reference"
        text file_path
        text storage_url
        text status
        jsonb data
        timestamptz date_generated
        timestamptz archived_at
    }
```

- Projects, events, payroll allocations, and recorded requisitions are represented by `expenses`. A requisition is a child expense with `is_additional = true` and `parent_project_id` pointing to its approved parent. Deleting a parent cascades to these child rows through the declared FK.
- Approval creates an expense associated with `budget_requests.id`. The partial unique index on `expenses.request_id` allows at most one expense per non-null request ID. The repository does not declare a request foreign key.
- `budgets` contains cumulative allocation entries. Multiple entries per month/year are intentional. Requests and expenses consume the period's available budget through date/period calculations; there is no `budget_id` column tying each expense to a single allocation row.
- Receipts belong to the approved parent through `record_id`. An optional `requisition_id` identifies the child line item. Both are text references without declared FKs.
- `documents.related_entity_id` is interpreted with `related_entity_type`: it may identify a request, an approved expense record, or a reporting year. The two displayed document relationships are alternatives, not simultaneous requirements.
- `deployment_id` is a diagram placeholder, not a PostgreSQL type. The migration deliberately derives `parent_project_id` from the deployed `expenses.id` type and mentions older BIGINT deployments. Confirm that type in the live database.

## Accounts, activity, and operations

```mermaid
erDiagram
    AUTH_USERS ||..o| CREATED_ACCOUNTS : "app shared id"
    AUTH_USERS ||--o| MEMBER_BIODATA : "FK shared primary key"
    AUTH_USERS ||..o{ CHAT_HISTORY : "FK user_id"
    AUTH_USERS |o..o{ AUDIT_TRAIL : "FK user_id"
    AUTH_USERS |o..o{ BACKUPS : "FK created_by_id"
    AUTH_USERS |o..o{ RESTORE_HISTORY : "FK restored_by_id"
    AUTH_USERS |o..o{ NOTIFICATIONS : "app actor_id"
    AUTH_USERS |o..o{ CREATED_ACCOUNTS : "app disabled_by"
    BUDGET_REQUESTS |o..o{ NOTIFICATIONS : "app request_id"

    AUTH_USERS {
        uuid id PK
        text email
        jsonb raw_app_meta_data
        jsonb raw_user_meta_data
    }
    CREATED_ACCOUNTS {
        uuid id "shared auth ID - base DDL absent"
        text full_name
        text email
        text role
        boolean is_active
        timestamptz disabled_at
        uuid disabled_by "app administrator reference"
    }
    MEMBER_BIODATA {
        uuid id PK,FK
        date birthdate
        text sex
        text civil_status
        text citizenship
        text complete_address
        text mobile_number
        timestamptz updated_at
    }
    CHAT_HISTORY {
        uuid id PK
        uuid user_id FK
        text role "user or assistant message"
        text content
        timestamptz created_at
    }
    AUDIT_TRAIL {
        uuid id PK
        uuid user_id FK
        text user_name
        text user_role
        text action
        text action_type
        text module
        text record_type
        text record_id "polymorphic reference"
        jsonb previous_value
        jsonb new_value
        text status
        timestamptz created_at
    }
    BACKUPS {
        uuid id PK
        text filename
        bigint backup_size
        uuid created_by_id FK
        text created_by_name
        timestamptz created_at
    }
    RESTORE_HISTORY {
        uuid id PK
        text filename
        uuid restored_by_id FK
        text restored_by_name
        text restore_status
        text details
        jsonb snapshot
        timestamptz restored_at
    }
    NOTIFICATIONS {
        uuid id PK
        uuid actor_id "app user reference"
        uuid request_id "app request reference"
        text actor_role
        text recipient_role
        text type
        text title
        text message
        timestamptz created_at
    }
    BUDGET_REQUESTS {
        uuid id PK
    }
```

`AUTH_USERS` denotes Supabase `auth.users`; the other entities are in `public`. Only relevant Auth fields are shown. User roles are stored in metadata and the account directory; there is no separate roles table in the repository. `chat_history.role` identifies a message speaker, not an officer role.

The account creation API writes `auth.users.id` into `created_accounts.id`. Its original CREATE TABLE statement is absent, so its primary key, uniqueness, and FK constraints cannot be confirmed from this repository. The `expenses` base CREATE TABLE is also absent; its ID key is inferred from the later self-referencing FK and application use.

Notifications target roles through `recipient_role`, not individual recipient user IDs. Audit targets are polymorphic `record_type`/`record_id` values. `restore_history` stores a filename and snapshot, with no declared `backup_id` relationship to `backups`.

## Other persisted entities

```mermaid
erDiagram
    PROJECT_PHOTOS {
        uuid id PK
        text project_id "intended project association"
        text url
        text caption
        timestamptz created_at
    }
    DOCUMENT_COUNTERS {
        text id PK
        integer last_number
        integer year
    }
    REPORT_SUMMARIES {
        bigint id PK
        text report_id "part of composite unique key"
        text model "part of composite unique key"
        text summary
        timestamptz updated_at
    }
    VERIFICATION_CODES {
        uuid id PK
        text email
        text code
        timestamptz expires_at
        boolean verified
        timestamptz created_at
    }
```

- `project_photos` is defined in a migration with no FK. The current narrative report implementation stores photos in browser IndexedDB (`CuentaPhotosDB.photos`) through `src/utils/photoDB.js`, so the SQL table should not be assumed to hold those current photos.
- `document_counters` supplies document numbering; no document-to-counter FK is defined.
- `report_summaries` has a composite unique constraint on `(report_id, model)`. `report_id` is a text key, not a declared document reference; the annual report also uses this table for settings.
- `verification_codes` identifies verification attempts by email and may exist before an Auth account is created. No user FK is defined.
- Public transparency views and Storage buckets are derived views and file infrastructure, respectively, rather than additional business entities in this diagram.

## Source references

- [Budget requests](../supabase/migrations/20260803120000_create_budget_requests_table.sql), [approval and notifications](../supabase/migrations/20260804100000_atomic_budget_approval.sql), [monthly allocations](../supabase/migrations/20260821190000_budget_allocation_history.sql).
- [Expense parent FK](../supabase/migrations/20260822200000_project_event_recorded_expenses.sql), [receipt requisition association](../supabase/migrations/20260822213000_consolidate_requisitions.sql), [returned budgets](../supabase/migrations/20260903000000_return_unused_budget_on_completion.sql).
- [Receipt records](../supabase/migrations/create_receipt_records.sql), [scan metadata](../supabase/migrations/20260819160000_receipt_scan_metadata.sql), [document associations](../supabase/migrations/20260821210000_document_tracking_metadata.sql).
- [Account creation](../api/create-user.js), [biodata](../supabase/migrations/create_member_biodata.sql), [chat](../supabase/migrations/create_chat_history_table.sql), [audit and backup tables](../supabase/migrations/audit_trail_and_backup_tables.sql).
- [Document generation](../src/components/DocumentGenerator.jsx), [narrative report photos](../src/pages/NarrativeReportPage.jsx), [annual report settings](../src/pages/AnnualReportPage.jsx).

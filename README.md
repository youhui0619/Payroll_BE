# Payroll backend: database setup

Run the commands below from the `payrollbe` directory. Use your existing PostgreSQL server; Docker is not required.

**Migration policy (2026-11-23): preserve migration history and use new incremental migrations.** This replaces the earlier single-init/reset workflow mentioned in historical feature notes below. For an existing database, apply pending migrations with `npx prisma migrate deploy`, then run `npm run db:generate`. Do not drop or reseed it for normal updates. Fresh-database setup follows below.

## 1. Create a fresh database

After you have recreated your database, skip this SQL step. Otherwise, connect to the `postgres` maintenance database using pgAdmin or your SQL client and run:

```sql
CREATE DATABASE payroll;
```

Use a PostgreSQL account that owns the new database or has permission to create tables, types and indexes in its schema. Dropping an old database deletes its data; this guide does not require running a reset command.

## 2. Configure the environment

If `.env` does not exist, copy the example in PowerShell:

```powershell
Copy-Item .env.example .env
```

Edit your existing `.env` directly if it already exists. Set:

```dotenv
DATABASE_URL="postgresql://YOUR_USER:YOUR_PASSWORD@localhost:5432/payroll?schema=public"
JWT_SECRET="YOUR_RANDOM_SECRET_AT_LEAST_32_CHARACTERS"
JWT_TTL_SECONDS=3600
SEED_COMPANY_NAME="Your Company"
SEED_OWNER_EMAIL="owner@example.com"
SEED_OWNER_PASSWORD="YOUR_UNIQUE_PASSWORD_AT_LEAST_8_CHARACTERS"
PORT=3000
SWAGGER_ENABLED=true
```

Replace the placeholders. URL-encode special characters in the database username/password. Generate a JWT secret with:

```powershell
node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
```

Keep `.env` private; it is excluded from Git.

## 3. Apply migrations, generate the client, and seed

Stop the running backend first to avoid Windows locking Prisma's engine file. If dependencies are not installed, run `npm ci`. Then run each command below and proceed only after it succeeds:

```powershell
npx prisma migrate deploy
npm run db:generate
npm run db:seed
```

- `migrate deploy` applies the migration files already in this repository and creates the tables. It does not generate the Prisma client or seed data.
- `db:generate` generates TypeScript database access code; it does not create tables.
- `db:seed` creates one company, one owner user with a hashed password, and one OWNER membership in a transaction.

The current seed does not add employees, departments, positions, salary history or payroll demo records. It refuses to overwrite an existing owner email. After a successful seed, use that email/password to sign in; do not rerun it just to start the application. Changing the seed email and rerunning creates another company and owner.

Prisma migrations create lowercase snake_case tables and match the mappings in `prisma/schema.prisma`. Existing migration history is preserved; new schema changes use incremental migrations. For a fresh database, run the migration chain and seed commands below. Do not edit an already-applied migration or reset the application database.

```text
users
companies
company_memberships
employees
departments
positions
salary_history
work_locations
work_schedules
public_holidays
audit_events
attendance_sessions
leave_policies
leave_requests
leave_events
leave_ledger
claim_types
claims
claim_events
stored_files
statutory_rulesets
employee_payroll_profiles
employee_payroll_profile_versions
payroll_settings
payroll_component_definitions
payroll_runs
payroll_employees
```

Prisma also creates `_prisma_migrations` to track applied migrations. Column names retain their current casing.

## 4. Verify and start

```powershell
npx prisma migrate status
npx prisma studio
```

Check that `users`, `companies`, and `company_memberships` contain the seeded records. Close Studio when finished, then start the API:

```powershell
npm run start:dev
```

Open Swagger at `http://localhost:3000/docs`. Call `POST /api/v1/auth/login` with the seed email/password, then use the returned access token with Swagger's Authorize button. The OpenAPI document is at `/openapi.json`.

## Employee and organization APIs

All routes below use the `/api/v1` prefix and require a bearer access token. OWNER and HR can manage these resources; FINANCE can additionally read salary history.

| Method | Route | Purpose |
| --- | --- | --- |
| PATCH | `/employees/:id` | Update name/email; email may be null to clear it |
| GET | `/employees/:id/salaries` | Paginated salary history, newest first |
| POST | `/employees/:id/salaries` | Append a salary effective date |
| GET | `/positions/:id` | Read position |
| PATCH | `/positions/:id` | Update position title |
| POST | `/departments/:id/deactivate` | Deactivate a department without active dependents |
| POST | `/positions/:id/deactivate` | Deactivate a position without active employees |

Salary creation body:

```json
{
  "amount": "3500.00",
  "effectiveFrom": "2026-11-01"
}
```

Amounts are decimal strings. Each new effective date must follow the latest existing salary date and cannot precede employment. The previous record's end date is exclusive; the new record begins on that date. Existing amounts are preserved. Concurrent changes may return `409 CONCURRENT_MODIFICATION`; reload before retrying. These endpoints use existing tables and need no additional migration.

## Employee accounts and self-service

The employee-account link is represented by the current migration chain. After recreating your development database, apply all migrations and regenerate the client (stop the backend first on Windows):

```powershell
npx prisma migrate deploy
npm run db:generate
```

Then run `npm run db:seed` to create the initial owner/company again. Existing databases should use `npx prisma migrate deploy` and must not be reset for normal updates. Employee records can still exist without a login.

As OWNER or HR, call `POST /api/v1/employees/:id/account` with:

```json
{
  "email": "employee@example.com",
  "password": "employee123"
}
```

Use a unique password in practice and share it privately. The API stores a password hash and returns only account identifiers, email and roles. The role is always EMPLOYEE; callers cannot supply roles. Existing login emails and already-linked employees return 409. For a first-login flow without an email adapter, OWNER/HR can instead call `POST /api/v1/employees/:id/account/invite` with an optional email and expiry. The response contains a one-time activation token for the configured delivery adapter or development handoff; only its hash is stored. The invited user submits that token and a password to public `POST /api/v1/auth/activate`. Expired, revoked or consumed tokens cannot be reused.

The employee can log in through `/api/v1/auth/login`, change their password, and call `GET /api/v1/employees/me`. This returns their linked active profile only (identity, contact email, joining date, department and position IDs). An unlinked/inactive employee profile returns 404. The employee role cannot list staff, read other profiles, provision accounts, or read the administrative salary-history endpoints. `/api/v1/auth/me` now includes `employeeId` (null for unlinked memberships).

Owners can issue a one-time administrative reset token with `POST /api/v1/memberships/:id/password-reset`; the account completes it through public `POST /api/v1/auth/reset-password`. Issuing or completing a reset invalidates earlier reset tokens and existing JWTs. Tokens are hashed at rest, expire, are single-use, and are never written to logs. Email delivery is intentionally behind a future adapter; the current response is the handoff boundary for FE/development.

OWNER/HR can use the explicit employee lifecycle commands `POST /api/v1/employees/:id/activate`, `/confirm`, `/resign`, `/terminate`, and `/archive`. Each accepts an optional `effectiveDate`; resign, terminate and archive also require a reason. Commands are tenant-scoped, reject invalid transitions and dates before joining, block calculated/finalized payroll periods, and record the actor, previous state, new state and effective date in the audit log. Historical employee rows are retained; archive is a soft state change.

Attendance self-service includes `POST /api/v1/attendance/adjustments` and `GET /api/v1/attendance/me/adjustments`. The request accepts a date, one or both corrected clock times, an idempotency key and a reason. Manager/HR queues use `GET /api/v1/attendance/adjustments` and `/adjustments/pending`; decisions use `POST /api/v1/attendance/adjustments/:id/decision`. OWNER/HR can make a direct reasoned correction with `POST /api/v1/attendance/adjustments/correct`. Approval creates or updates the attendance session and recalculates duration, worked minutes and overtime. Adjustments are rejected for calculated/finalized payroll periods and retain a complete decision event history.

OWNER/HR can run leave accruals with `POST /api/v1/leave/accruals/run` and `{ "year": 2026 }`. The run uses the policy’s grant method, default/service-tier entitlement and eligibility settings, prorates annual grants for employment dates, calculates monthly or service-anniversary grants, and carries prior-year balances according to `NONE`, `LIMITED`, `UNLIMITED` or `HR_REVIEW`. Carry-forward caps use `maximumCarryForward`; HR-review carry is intentionally not auto-posted. Each ledger entry has a deterministic key, so rerunning a year does not duplicate balances. The command is audited; scheduling and expiry jobs remain future work.

## Later schema changes

Keep `prisma/schema.prisma` and new migration files in sync. Preserve the existing init and all later migrations, including their check constraints and partial indexes. Do not consolidate migration history or rewrite applied SQL. The user ended the single-init workflow on 2026-11-23.

Create separate migrations for new schema changes against your designated development database:

```powershell
npm run db:migrate -- --name describe_your_change
npm run db:generate
```

`db:migrate` runs `prisma migrate dev` and requires a shadow database, so the development database account needs database-creation permission or a separately configured shadow database. Applying existing migrations with `migrate deploy` does not require a shadow database. Commit the new migration files. Do not edit already-applied migrations or accept a reset prompt for data you need to keep.

## Troubleshooting

- **Table does not exist:** run `npx prisma migrate deploy` against the intended database before seeding.
- **Seed failed:** check all three `SEED_*` values, password length, database connectivity, migrations, and whether the owner already exists. The current seed prints a generic failure message.
- **Prisma engine EPERM on Windows:** stop the backend/Node process using this project, then retry `npm run db:generate`.
- **Connection refused/authentication failed:** verify PostgreSQL is running and the host, port, database and credentials in `DATABASE_URL` are correct.

## Implemented workflow APIs

Swagger at `/docs` is the route reference. All business routes use `/api/v1`.

- Owners can create HR, Finance, Owner or Employee logins with `POST /memberships` and change company access using `PATCH /memberships/:id`. Create bodies contain email, password (8+ characters), roles, and optional employeeId. Update bodies contain roles and active. Existing global accounts cannot be attached through this endpoint. Only owners can assign privileged roles; an owner cannot remove their own owner access.
- Assign a reporting manager, location and schedule using `PATCH /employees/:id/assignment`. Configure work locations, schedules and public holidays first.
- Linked employees clock in/out using attendance endpoints with UUID idempotency keys. Times come from the server. Only one open session is allowed per employee.
- Configure leave policies, grant opening balances, then create and submit leave applications. Submission revalidates eligibility, schedules, holidays and notice. Pending applications reserve balance; final approval posts usage; eligible cancellation reverses it.
- Claims follow draft → reporting-manager approval → Finance approval. Bank-transfer claims can be marked paid once. Payroll claims cannot be paid through the standalone payment endpoint.
- File uploads accept PDF, PNG and JPEG, up to 5 MiB. Uploads and downloads enforce employee/claim access and file signatures. Content is private and downloaded through the API.
- Dashboard and attendance/claims CSV exports are available. Export filters are bounded and formula-like CSV cells are escaped.
- Payroll settings, statutory categories, draft payroll runs and preflight checks are available. Preflight uses the configured salary proration/statutory switches and returns actionable setup issues; the calculate command performs the final full-input validation.

### Payroll processing and payslips

Contribution-table/rate/exemption validation and preview exist, including a LINDUNG_24_JAM scheme. No official contribution data is seeded. Source URL/hash are supplied by the importer; the server does not independently verify the downloaded source.

The API now persists payroll calculations, applies the saved earning/statutory inclusion switches, enforces the DRAFT → CALCULATED → APPROVED → PUBLISHED → PAID lifecycle, publishes tenant-safe FE-shaped payslips, and settles payroll-linked claims, commissions and overtime. Pre-publication reopen, in-app notifications, secure one-page PDF payslip downloads and versioned statutory review CSVs are available. Finalized-period corrections, official statutory submission layouts and password-protected PDF encryption remain outside this slice. See [implementation status](IMPLEMENTATION_STATUS.md) and the [MVP backlog](../BACKEND_TASKS.md).

### Leave balances and history

`GET /leave/me/balances?year=2027` returns each relevant policy's posted `balance`, pending `reserved` days and `available` balance. Omitting the year selects the current year in the company timezone. This replaces the earlier all-years response. Active policies within the selected year appear even with no grants; inactive policies with ledger activity or pending requests remain visible. Values are decimal strings. Unpaid policies return `available: null`, since they do not consume paid entitlement. Fixed policies use `defaultEntitlement`; service-based policies use `serviceEntitlementTiers`.

OWNER/HR can use `GET /leave/employees/:id/balances?year=2027` for another employee, including historical inactive profiles. Managers do not receive administrative access to staff balances.

Employees can replace their draft using `PATCH /leave/applications/:id` with the same body as creation. Editing recalculates eligibility and duration; submitted applications cannot be edited. `GET /leave/applications/:id` returns the application and all retained workflow events, including each manager/HR decision and comment. Access is limited to the employee, assigned manager, OWNER and HR. Submission still revalidates eligibility; approval posts usage and cancellation reverses it atomically.

### Employee import

`POST /api/v1/employees/import/preview` accepts a JSON batch with an `idempotencyKey` UUID and up to 1,000 employee rows. Required fields are `employeeNo`, `name` and `joinedDate`; optional department/position/manager/location/schedule UUIDs, employment type, salary and payment fields are validated against the authenticated company. The response reports normalized rows, row numbers, duplicate/reference errors and `canCommit` without writing employees.

`POST /api/v1/employees/import/commit` repeats the same batch after review. It creates employees and optional opening salary rows in one serializable transaction, records an `import_batches` row and audit event, and returns the original result on a repeated company/entity/idempotency key. It never updates an existing employee. Spreadsheet/file parsing and provider-specific column mappings can be layered over this stable JSON contract later.

### Reports and exports

In addition to attendance and claims CSVs, the API provides `GET /api/v1/reports/leave-balances.csv?year=YYYY`, `GET /api/v1/reports/leave-applications.csv?from=YYYY-MM-DD&to=YYYY-MM-DD`, and `GET /api/v1/reports/payslip-history.csv?year=YYYY&month=M`. These OWNER/HR/FINANCE exports are tenant scoped, bounded, formula-safe and audited. Payroll register and statutory review exports are documented in the payroll section; official authority submission layouts remain separate from the review CSV contract.

The revised init migration includes `leave_events`. These changes do not migrate an already-applied older init.

### Claims and receipts

OWNER, HR and FINANCE can create claim types with `POST /claims/types` and replace settings with `PATCH /claims/types/:id`. Read a type with `GET /claims/types/:id`. Example settings:

```json
{
  "code": "TRAVEL",
  "name": "Travel",
  "description": "Approved business travel",
  "active": true,
  "receiptRequired": true,
  "maxAmount": "500.00",
  "effectiveFrom": "2026-01-01",
  "effectiveTo": null
}
```

The maximum is **per claim**, not an annual allowance. Effective dates are inclusive and apply to the expense date. A null amount/date removes that restriction. PATCH replaces settings: omitted optional fields return to defaults (active=true, receiptRequired=false, other optional settings=null). These settings are company-defined and do not supply statutory rules.

Employees create a draft, edit it with `PATCH /claims/:id`, attach receipts through `POST /files`, and submit it. Submission revalidates the current type, employment, active reporting manager, amount and receipts, then saves the policy and receipt IDs in a snapshot. Later type changes affect drafts and new submissions only. Unscanned receipts require the explicit development bypass; production requires CLEAN scans.

`GET /claims/:id` returns accessible claim details, receipt metadata and all workflow events with actor, time, action, status and decision comment. Claim lists (`/claims`, `/claims/me`, `/claims/pending`) accept `status`, `typeId`, `employeeId`, `from`, `to`, `search`, `page` and `pageSize`. Filters narrow the caller's existing permissions.

`GET /files` lists accessible active metadata and accepts `employeeId`, `claimId`, `category`, `search`, `page` and `pageSize`. Finance can read claim receipts but cannot use this access to browse other employees' personal documents. Reporting managers can read receipts linked to their assigned claims.

`POST /files/:id/archive` hides an employee document or draft receipt without deleting stored bytes. Only the employee or OWNER/HR can archive. Receipts on any submitted claim remain retained, including after rejection or cancellation. Upload a replacement before submitting the draft; receipt uploads and archiving are locked after submission.

These additions are included in the revised init migration, including `claim_events`. Apply them to your recreated database using the setup commands above; do not apply the edited init over an older applied version.

### Storage configuration

`STORAGE_PROVIDER=local` uses `STORAGE_LOCAL_PATH` (default `storage`). S3 uses `STORAGE_PROVIDER=s3`, `S3_BUCKET`, `AWS_REGION` and the standard AWS credentials chain. Files are not served as public static assets.

Configure `CLAMAV_HOST` and optionally `CLAMAV_PORT` for upload scanning. Scanner failures reject uploads. For local development only, `ALLOW_UNSCANNED_UPLOADS=true` permits unscanned files; production still requires scanning. ClamAV and S3 require separate infrastructure and have not been exercised against live services by the automated tests.

### Effective-month payroll profiles

`PATCH /employees/:id/payroll-profile` (OWNER/HR) now requires `effectiveFrom` (the first day of a month), `reason`, `lindungParticipation` and all six statutory categories. Participation is `ENROLLED`, `OPTED_OUT`, `MANDATORY` or `NOT_ELIGIBLE`; these are recorded declarations, not automatic legal eligibility decisions. Keep supporting references in the reason. Preflight requires contribution rules for enrolled/mandatory participation and an explicit exemption ruleset for opted-out/ineligible participation.

Every write appends an immutable revision. Same-month corrections preserve earlier revisions; dates before the latest recorded effective month are rejected. Changes affecting any calculated or finalized company payroll are rejected. The latest-profile GET includes revision/effective-month/actor metadata, including future scheduled changes. `GET /employees/:id/payroll-profile/history` returns paginated revisions for OWNER/HR/FINANCE.

Preflight selects the latest revision effective at the beginning of the salary month. A future revision cannot replace the historical selection; profiles without a revision covering the month are reported as missing. The new lowercase history table is included in the consolidated init. Existing unversioned profiles are not automatically assigned historical dates; recreate and configure the development database as planned.

### Earning and deduction definitions

`POST /payroll/component-definitions` (OWNER) appends an effective-month definition. Required fields are `code`, `name`, `kind` (`EARNING`/`DEDUCTION`), `effectiveFrom` (first of month), `active`, `affectsGross`, `affectsNet`, `statutoryBases` (scheme array) and `reason`. For example, BASIC may affect gross/net and applicable contribution bases; a reimbursement can affect net only; unpaid leave subtracts from configured gross/net/bases. Flags must be reviewed against actual wage classifications rather than treating every payment as taxable.

`GET /payroll/component-definitions?asOf=2026-10-01` resolves the latest applicable version per code, including archived codes. OWNER/HR/FINANCE may read. Standard pagination applies; `search` filters code only. `GET /payroll/component-definitions/:code/history` returns all revisions. Same-month corrections append a revision; older-date insertion and changes affecting calculated/finalized company payroll are rejected. Set `active=false` in a new revision to archive a code. The company limit is 1,000 codes.

OWNER/FINANCE can add manual inputs with `POST /payroll/runs/:runId/inputs`: send `employeeId`, a UUID `idempotencyKey`, `componentCode`, positive decimal-string `amount`, and `reason`. The employee must be active and joined by period end, and the component must be active for that salary month. Component kind determines earning versus deduction. A repeated key with identical normalized fields returns the original record (including its void status); changed fields return a conflict. Use a new key for a replacement.

`GET /payroll/runs/:runId/inputs` provides paginated history including voided records. `POST /payroll/runs/:runId/inputs/:id/void` requires a reason and preserves the original amount, creator and reason. Creation and voiding require a DRAFT run; at most 500 active manual inputs are permitted per employee/run. These retained inputs are stored in `payroll_inputs` in the consolidated init. Calculation orchestration is still pending: these APIs currently record inputs, without calculating or publishing payroll. Component flags will be resolved and snapshotted when calculation runs.

The pure payroll calculator now produces explicit gross, payable earnings, deductions, net, statutory bases and source/version traces. Net reconciles to payable earnings minus deductions; reimbursements and gross-reducing deductions can make this different from gross minus deductions. It rejects duplicate source references and inconsistent contributions. Company-paid EPF remittance rounding is applied to employer costs, as confirmed by the user; the employee share is unchanged. This calculation core is not yet connected to calculate/finalize/publish payroll endpoints.

### Statutory catalog APIs

`GET /statutory/rulesets/catalog` lists bundled EPF Parts A/C/E and EIS references, source checksums and limitations (OWNER/FINANCE). `POST /statutory/rulesets/catalog/:key/import` imports an inactive draft into the authenticated company (OWNER only). Duplicate scheme/category/version imports return 409. Use the existing `/:id/preview` and `/:id/activate` endpoints to review and explicitly activate it.

Catalog entries retain provenance in `parameters.provenance` and preview responses. `ORIGINAL_PDF` hashes the archived authority PDF; `EXTRACTED_DATA` hashes the extracted source JSON, **not** the original PDF. EPF direct download was blocked, so its reviewed web-reader extraction uses the latter. Source artifacts are under `statutory/sources`; `npm run statutory:catalog` rebuilds bundled TypeScript without connecting to PostgreSQL.

EPF A/C/E use tables through RM20,000 and the published percentage branch above that boundary (`2025-10-v2`). Part F is a separate rate entry. Percentage previews expose `employee`, `employer`, the combined whole-ringgit `total`, and `remittanceRounding`. Raw values remain in the trace. Statutory previews leave the difference unallocated; payroll assembly assigns it to employer cost under the confirmed company-paid policy. Do not independently round both shares or drop the difference. Supporting formula/example evidence has its own checksum in provenance. EIS uses the RM6,000 ceiling. Eligibility, HRD, complete PCB and payroll integration remain pending. No catalog data is automatically seeded or activated.

Owners can `POST /statutory/rulesets/:id/retire` to deactivate an old version before activating its replacement. Retirement preserves source parameters and allows historical previews; it is idempotent and tenant scoped. An active overlapping version still prevents activation.

### SOCSO and LINDUNG references

The catalog also includes `SOCSO_2026_06_CATEGORY_ONE`, `SOCSO_2026_06_CATEGORY_TWO` and `LINDUNG_2026_06_PHASE_ONE`, extracted from PERKESO's combined schedule. SOCSO excludes the LINDUNG employee share so each deduction can remain separate. Each uses the published wage bands and RM6,000 ceiling. The LINDUNG entry covers June–December 2026 only: its end date is a verification cutoff, not the scheme's legal expiry. Confirm future phase dates and import a successor before processing later periods. Participation, opt-out and worker eligibility resolution remain pending.

`scripts/extract-perkeso.py` reproduces the PERKESO extraction using Python and `pypdf`, checks all 65 printed row totals and the duplicate above-ceiling row, and writes the source JSON. Then run `npm run statutory:catalog` to rebuild the deployable catalog. Original PDFs and extracted data are retained under `statutory/sources`.

### PCB calculation endpoint

`POST /statutory/pcb/preview` (OWNER/FINANCE) previews the 2026 standard resident/non-resident calculation from normalized decimal-string inputs. Swagger contains the complete request model. Resident previews include annual income projections, the RM4,000 EPF relief cap, additional remuneration, prior MTD/zakat, current zakat and rounding traces. The caller must supply already verified taxable remuneration and combined qualifying reliefs; this endpoint does not verify TP1/TP3 eligibility, determine exemptions or alter payroll records. REP, knowledge-worker and C-suite regimes are not supported yet. The archived original LHDN PDF checksum accompanies every result. Published worked examples are tested; full LHDN conformance/approval and payroll integration remain pending.

### Test commands

Use Node.js 24 LTS for the current dependency set.

```powershell
npm run build
npm run lint
npm test -- --runInBand
npm run test:e2e -- --runInBand
npm run openapi
npm run test:integration
```

`openapi` generates an ignored local `openapi.json` and checks operation IDs and schema references without connecting to PostgreSQL. Success-response documentation is still incomplete.

`test:integration` uses the server/credentials from `DATABASE_URL`, connects to its `postgres` maintenance database, creates a random `payroll_test_<uuid>` database, applies the complete incremental migration chain there and removes it in a finally block. The account needs CREATE DATABASE permission. It never migrates or resets the application database. If the process is forcibly killed, identify the printed test database name before removing that test database manually.

Integration checks cover tenant foreign keys, concurrent clocking/approval/payment, leave reversal, stale drafts, balance protection and payroll draft/preflight isolation. These are representative workflow tests, not statutory conformance tests.

Liveness is `GET /health/live`; database readiness is `GET /health/ready`. Request IDs appear in the `X-Request-Id` header and compact errors. Login IP throttling is process-local; distributed deployment needs a shared limiter.

Salary calculation core uses calendar days for a calendar-month wage period, following Employment Act section 18A's incomplete-month formula: monthly wages / days in wage period * eligible days. Source: https://www.investmalaysia.gov.my/media/felj30g0/employment-act-1955.pdf (page 28). Joining and last employment days are inclusive; salary-history end dates are exclusive. Mid-month rate changes are weighted by each rate's employed days. Numerators are summed before division, with HALF_UP currency rounding only on aggregate employed/payable salary; the unpaid deduction is their difference so displayed amounts reconcile. These rounding and rate-change choices are application policy, not a quoted statutory rounding rule.

The pure engine accepts resolved half/whole unpaid days with source references and returns salary segments and calculation traces. It rejects gaps, overlapping salary records, duplicate source/date pairs and more than one unpaid day per date. Preflight and persisted payroll use the resolved payroll inclusion policy and calendar, fixed-26 or working-day salary proration. Fixed-26 keeps a fully employed month at the contracted monthly rate and applies the configured daily basis to partial employment and unpaid time. Salary-history writes affecting calculated or finalized payroll months are now rejected.

Leave submission stores `daySnapshot` on the request: schema version, schedule ID/working weekdays, location/state and exact working dates with `1` or `0.5` day quantities. Approval retains that snapshot. Payroll preflight resolves approved unpaid requests from those dates, clips cross-month requests to the salary month and verifies their quantities reconcile to the approved total. Later schedule/holiday changes do not recalculate submitted leave. Missing legacy snapshots cause `LEAVE_SNAPSHOT_REQUIRED`; do not infer them from current schedules. Drafts may retain a null snapshot until submission. The new column remains in the consolidated init.

Submitting or deciding leave, and cancelling submitted leave, is rejected when its date range intersects a calculated/finalized payroll month. Draft cancellation remains available. A later correction workflow is still pending. These changes supply validated unpaid dates to salary preflight; persisted payroll-run calculation and statutory integration are not yet complete.

Draft payroll input preview: `GET /payroll/runs/:id/employees/:employeeId/input-preview` (OWNER/FINANCE) resolves one employee's salary history, approved frozen unpaid dates, active manual inputs and explicitly allocated approved claims, commissions and overtime in a consistent read transaction. It returns component lines, effective definition references, gross/payable earnings, wage bases, salary traces, source details and the resolved payroll inclusion switches. Disabled allocated sources fail explicitly instead of being silently omitted; unallocated recurring allowances are not collected. This endpoint does not persist a calculation or change run status.

Configure `BASIC` as an active earning affecting gross and net. When unpaid deductions exist, configure `UNPAID_LEAVE` as a deduction affecting gross/net and the same statutory bases as BASIC. Those two codes are generated automatically and cannot be entered manually; use separate adjustment definitions for corrections. Voided manual inputs are excluded, and missing/archived effective definitions fail validation. The effective definition and source references are preserved in each line for future payroll snapshots.

Approved claim payroll allocation: OWNER/FINANCE may call `POST /payroll/runs/:runId/claims/:claimId/allocate` with `componentCode` and `reason`. Only approved PAYROLL claims can be allocated, to one draft run at a time. Claim/employee dates must be eligible by period end. Select an active earning definition affecting net pay; review gross/statutory flags according to the expense classification. Repeating the same allocation returns it without another event. A different run conflicts. `POST .../release` requires a reason and releases only a draft allocation. Allocation/release events retain run, component and reason; approved claim amounts remain unchanged.

Allocated claims are now included automatically in employee input previews, with CLAIM source references and claim descriptions/dates. Reimbursements can affect net only when their definition uses those flags. Unallocated claims are omitted. Allocation is not payment: claims remain APPROVED until a future payroll payment command settles them. Run finalization/payment is still pending. Claim allocation fields and a tenant composite run FK are included in the single init.


The employee input preview now includes `contributionPreview`: effective profile ID/revision, per-enabled-scheme issues, and calculated EPF/SOCSO/EIS/LINDUNG/HRD contributions. Each calculation retains category, ruleset/version, source URL/checksum, effective dates, parameters, wage basis and arithmetic trace. Employer cost includes the employer-paid remittance rounding difference; employee withholding is unchanged. Exactly one active category ruleset must cover each enabled scheme for the entire month; disabled schemes are not required. LINDUNG participation must agree with the selected contribution/exemption rule. Overall `complete` stays false: final PCB/net-pay validation and profile eligibility still rely on reviewed declarations.

PCB remuneration classification: component definitions now accept `pcbTreatment` (`NORMAL`, `ADDITIONAL`, `EXCLUDED`, `UNCLASSIFIED`). A component flagged for the PCB wage basis must explicitly use NORMAL or ADDITIONAL. Tax-exempt EPF-bearing components use EXCLUDED_NORMAL or EXCLUDED_ADDITIONAL so their EPF can be allocated correctly. Other components outside the PCB basis may use EXCLUDED or the default UNCLASSIFIED; this does not determine legal exemption eligibility. BASIC must use NORMAL when PCB-bearing, and generated unpaid salary deductions must use the same class. Bonuses and other additional remuneration require reviewed additional classifications according to the LHDN specification. Application and database validation reject contradictory combinations.

Input previews expose `pcbRemuneration.normal`, `.additional`, and `.unclassified`, with classification retained on each line. Category-specific deductions cannot make a category negative. Legacy in-memory unclassified lines are reported separately rather than assumed to be normal. Reviewed tax declarations and EPF allocation are available in the preview; current-employer year-to-date resolution and final PCB integration remain pending. The component field/constraint is part of the single init migration.

Previous-employer tax opening declarations: `POST /employees/:employeeId/tax-openings` (OWNER/FINANCE) appends reviewed cumulative `taxableIncome`, `employeeEpf`, `mtd` and `zakat` for a `year` and `effectiveMonth`, with `evidenceReference` and `reason`. Amounts are decimal strings. These are previous-employer totals only; exclude this company's payroll, CP38 and voluntary extra withholding from MTD. A correction replaces the applicable declaration total; revisions must never be summed. Zero declarations are permitted with an evidence reference. Recording the declaration does not independently validate the underlying TP3 document.

`GET /employees/:employeeId/tax-openings?year=2026` (OWNER/HR/FINANCE) returns paginated revision history. Earlier effective-month insertion and revisions affecting calculated/finalized months of the same year are blocked. The employee input preview includes the latest applicable declaration as `taxOpening`; null means no declaration recorded, not a confirmed zero. The lowercase `employee_tax_openings` table is in the consolidated init. Current-employer YTD and final PCB integration remain pending.

Reviewed family tax declarations: `POST /employees/:employeeId/tax-family` (OWNER/FINANCE) records `year=2026`, `effectiveMonth`, `residency`, PCB `category` (1/2/3), `disabledIndividual`, `spouseReliefEligible`, `disabledSpouseReliefEligible`, `children`, `evidenceReference` and `reason`. Each child uses a stable internal `reference`, one `kind` (STANDARD, HIGHER_EDUCATION, DISABLED, DISABLED_HIGHER_EDUCATION), and FULL/HALF share. Do not put national identity numbers into these references. Eligibility must be reviewed: STANDARD includes qualifying under-18/full-time education cases; higher education, disability, spouse income/assessment and shared-claim conditions require supporting evidence. HALF is not an automatic split for spouses living together.

The service calculates amounts from the retained 2026 PCB specification, rejects duplicate child references and category contradictions, and saves declaration plus relief breakdown/source reference as an immutable revision. Non-resident personal relief amounts are zero. `GET .../tax-family?year=2026` provides history to OWNER/HR/FINANCE. Older-month insertion and changes affecting calculated/finalized payroll are blocked. Input previews include the applicable revision as `taxFamily`. Family relief totals exclude EPF and TP1 expense deductions and must not be treated as the complete combined relief input. The new `employee_tax_families` table remains in the consolidated init.

TP1 expense limits preview: `POST /statutory/pcb/tp1-preview` (OWNER/FINANCE) accepts `year=2026`, `amounts` keyed by the official form codes, `spouseRelief` already claimed and `projectedMandatoryEpf` already deducted by the PCB projection. Monetary values are decimal strings. Supported keys are C1AB, C1C, C2, C3AB, C3C, C4AB, C4C, C4D, C4E, C4F, C5–C10, C11A, C11B, C12–C15, C16A, C16B and C17. AB combines those two unrestricted subitems; separate sublimited items must retain their own keys. Omitted codes are zero; unknown codes, negatives and excess decimal precision are rejected.

Submit reviewed cumulative current-year amounts including previous employment, not monthly increments or summed correction revisions. The response shows claimed amounts, sublimits, shared group caps and allowed totals. C10 shares the spouse allowance; C11A uses the remaining mandatory/voluntary EPF allowance; the two C16 home-price bands cannot both be claimed. Review receipt eligibility, repeat-year restrictions and shared claim conditions before using the preview. Do not claim one expense under multiple codes or automatically add payroll SOCSO/EIS a second time. D1 rebates are separate and not included. This endpoint does not save declarations or complete payroll PCB integration.

Official schedule: https://www.hasil.gov.my/wp-content/uploads/bi-tp1-form-2026.pdf (reviewed 2026-11-02). The preview uses the schedule limits; it does not independently verify legal eligibility or supporting receipts.

Saved TP1 expense declarations: `POST /employees/:employeeId/tax-expenses` (OWNER/FINANCE) accepts `year=2026`, `effectiveMonth`, `amounts`, `evidenceReference` and `reason`. Amount keys/values follow the TP1 preview API. Submit reviewed cumulative totals, including eligible previous-employer expenses once. Corrections replace the applicable declaration; revisions must not be summed. Empty `amounts` is an explicit reviewed zero declaration. Omitted codes are stored as zero and currency values are normalized to two decimals. Claimed amounts above a cap are retained; the allowed deduction is recalculated using payroll spouse/EPF context rather than saved as an arbitrary total.

`GET .../tax-expenses?year=2026` returns paginated history to OWNER/HR/FINANCE. Earlier effective-month insertion and changes affecting calculated/finalized periods are rejected. Input preview includes the applicable revision as `taxExpenses`; null means not recorded. Receipt eligibility and recurring-claim checks are recorded through the review reference; automated receipt reconciliation remains pending. The lowercase `employee_tax_expenses` table is included in the consolidated init. These APIs do not yet finalize PCB or payroll runs.

Declaration-based PCB calculation now has a reusable internal helper, `calculateDeclaredPcb`, which derives family reliefs from reviewed declarations and applies TP1 expenses to each normal/additional-remuneration projection. The mandatory EPF allowance already used can differ between those projections, so C11A headroom is recomputed separately. Calculation traces retain the EPF projection, combined qualifying reliefs, family breakdown and both TP1 breakdowns. Non-residents do not receive resident reliefs. This helper still expects normalized remuneration, EPF allocation and accumulated tax amounts; automatic run-level resolution/persistence remains pending.

EPF allocation for PCB: the employee input preview includes `epfAllocation` with `normalEpf`, `additionalEpf`, `totalEmployeeEpf` and source/calculation traces. Normal EPF is calculated using normal EPF-bearing wages; additional EPF is the total employee share minus the normal share. This includes reviewed tax-exempt allowances and leaves company-paid remittance rounding out of employee deductions. Missing rules or ambiguous EPF classifications return a null allocation plus `epfAllocationIssue` with a code/message. Negative remuneration classes are rejected. The preview remains incomplete until final payroll/PCB orchestration is implemented.

Taxable remuneration is not an upper bound for EPF because tax-exempt payments may still bear EPF. Previous-employer openings and normalized PCB inputs therefore permit EPF above taxable income, while retaining non-negative currency validation. These constraint changes are included in the single init; no additional migration is created.

Source reconciliation: LHDN 2026 section 13 illustrates the allocation method with RM297 deducted on RM2,400 salary plus RM250 regular childcare allowance. The selected October 2025 KWSP Part A table gives RM293 for RM2,650 wages. Allocation uses the selected EPF ruleset's amount, not the illustrative RM297. The one-off RM450 allowance and RM3,600 bonus examples reconcile to additional EPF of RM51 and RM396 respectively. See the archived source artifacts and allocation tests.

### FE payroll overview: draft employee roster

`GET /api/v1/payroll/runs/:id/employees` (OWNER/FINANCE) supplies the employee rows for preparing a monthly draft run. Query parameters are `page`, `pageSize` (maximum 100), `search` (employee number/name), and repeated `departmentIds` UUID values for the FE multi-select. Example: `?page=1&pageSize=20&departmentIds=<uuid>&departmentIds=<uuid>`. Omit the department filter to include unassigned employees too. Unknown/other-company department IDs return no matching employees and never widen tenant access.

The response uses `{ data, meta }`. Each row contains `employeeId` (internal UUID), `employeeNo` (display number), `employee` (name), nullable `departmentId`/`department`, and nullable `positionId`/`position`. `meta.total` counts all matching rows, not just this page; metadata also includes `runId`, `year`, `month`, `runStatus: "DRAFT"` and `complete: false`. Active employees joined before the next month's first day are included even if salary/tax setup is incomplete. Assignments are current data, not historical payroll snapshots. Non-draft runs return 409; unknown/other-company runs return 404.

Compared with `Payroll_FE/src/app/pages/payroll/overview/overview.component.ts`, its HTML, `data/payroll/payroll.data.ts`, and `models/payroll/payslip.model.ts` (reviewed 2026-11-22):

| FE mock field/behavior | API mapping |
| --- | --- |
| `employeeId` such as `EMP-0042` | Display `employeeNo`; retain UUID `employeeId` for API requests |
| `employee`, `department`, `position` | Same display fields; missing assignments are null |
| Department name multi-select | Send department UUIDs from the department API |
| Employee count card | `meta.total` for the selected filters |
| Initials | Derive from employee name in the FE |
| Basic pay, deductions, contributions, net pay and totals | Not supplied by this roster; use individual input previews for available preparation data. Final payroll calculation is still pending |
| Payslip status/actions | Not available from draft roster; do not infer paid/published status from the run |

Use the existing run API to select/create a monthly draft, this endpoint to list employees, the run preflight to identify setup gaps, and `.../employees/:employeeId/input-preview` for an individual breakdown. The hosted mockup could not be read through the web tool, so comparison used the full local FE source. This feature adds no tables or migration and does not modify FE source.

### Current-employer tax YTD

The employee input preview now includes `taxYtd` with `ready`, decimal-string `totals` (`taxableIncome`, `employeeEpf`, `mtd`, `zakat`), `sources` and `issues`. This is separate from `taxOpening`, which contains previous-employer totals. Never add correction revisions together or copy cumulative totals into a monthly snapshot.

For the current monthly workflow, each earlier employment month in the salary year must have one PAID run and a matching employee calculation. Draft, calculated, approved and published runs are not treated as settled tax deductions. Missing months, missing employee calculations and invalid snapshots block readiness; any returned totals are partial when `ready=false`. No prior months are required for January or the employee's joining month. Mid-year migration/rehire reconciliation remains pending rather than treating absent history as zero.

The internal persisted calculation contract is `PayrollEmployee.snapshot.taxPeriod`, version 1: companyId, employeeId, runId, year, month, taxableIncome, employeeEpf, mtd and zakat. Monetary fields are non-negative decimal strings for that period only. Resolution validates scope, period, version and currency precision; it does not infer taxable wages from gross/net. Source references identify the original run and employee calculation row. Snapshot creation and payroll settlement APIs remain pending; the YTD reader does not manufacture paid history or change payroll status.

The FE's current payslip model has no YTD breakdown. Display `taxYtd.issues` as preparation issues and keep current-period PCB/net columns separate; do not map accumulated MTD into the current month's PCB deduction.

### Resolved employee calculation preview

`POST /api/v1/payroll/runs/:id/employees/:employeeId/calculation-preview` (OWNER/FINANCE) connects the stored salary/manual/allocated-claim inputs, EPF allocation, other contributions, tax declarations and current-employer YTD to the standard 2026 PCB engine and payroll totals. Request:

```json
{
  "taxRegime": "STANDARD",
  "currentZakat": "0.00",
  "zakatEvidence": "Reviewed declaration: no current-month zakat"
}
```

The effective payroll profile `pcbCategory` must be `RESIDENT` or `NON_RESIDENT`, matching the reviewed family declaration. Other categories/special regimes are rejected. Explicit opening, family and TP1 declarations are required, including reviewed zero declarations. Missing contributions/EPF allocation or unsettled/missing prior-month YTD blocks calculation with 409. Caller-supplied accumulated income, PCB amounts and relief totals are not accepted.

The result contains `input` (resolved source records), `pcb` (amount, tax/relief traces and source hash), `totals` (gross, deductions, net and separate statutory rows), `taxPeriod` (period-only snapshot candidate) and `taxReview`. Monetary values remain decimal strings. `currentZakat` is a reviewed current-month PCB credit; it does not create a salary deduction. If zakat is withheld from salary, its separate net-only deduction component must already be included among payroll inputs. Avoid applying that deduction again in the FE.

FE payroll overview/detail mapping: `totals.gross` → grossPay, `totals.net` → netPay, and `pcb.amount` → pcb. Resolve EPF/SOCSO/EIS/LINDUNG rows from `totals.statutory` by scheme, using employeeDeduction/employerCost/remittance; keep LINDUNG separate. Do not map `totals.deductions` into the mock's non-statutory deduction column because it includes statutory deductions. Earnings categories must come from reviewed component lines, not guessed from mock amounts. Traces and tax review are backend extensions to the current FE Payslip model.

The response deliberately remains `previewOnly: true, complete: false`. It calculates the currently resolved inputs using the saved inclusion and proration switches; it does not automatically collect unallocated overtime/commissions/recurring allowances or change run status. Persisted calculation and lifecycle commands are documented below.

### Commission allocation to payroll

OWNER/FINANCE can allocate or release a ready commission using `POST /api/v1/payroll/runs/:runId/commissions/:recordId/allocate` or `/release`, with `{ "reason": "Reviewed payout" }`. The saved record supplies its amount and `payrollEarningCode`; the request cannot override either. Configure that code as an active gross/net earning with reviewed statutory/PCB treatment for the salary month. BASIC and UNPAID_LEAVE are reserved. An employee can have at most 100 allocated commission records per run; the shared component count limit also applies.

Only READY_FOR_PAYROLL records and DRAFT runs are eligible. CURRENT_PAYROLL permits the record's creation month or later; NEXT_PAYROLL permits the following month or later. SEPARATE_PAYOUT and unclassified timing cannot enter this monthly workflow. These are earliest-month checks, allowing reviewed delayed payouts; the API does not automatically select a run. Employees must be active and joined by period end. A record cannot belong to two runs; same-state retries do not duplicate events. Release preserves the approved record and its original amount.

`GET /api/v1/payroll/commissions/:recordId/allocation-history` returns paginated allocation/release events with run, actor, time and reason. Allocations feed both input and calculation previews through COMMISSION source lines and `commissionSources`. They retain the saved plan code/name, amount, earning code and reference, rather than recomputing from a plan that may have changed.

FE comparison: `Payroll_FE/src/app/models/commission/commission-payroll-record.model.ts`, its mock data and the payroll commission overview distinguish PENDING_APPROVAL, READY_FOR_PAYROLL and PAID. Allocation keeps READY_FOR_PAYROLL; `payrollRunId` identifies its assigned run. Show release only for a draft run. The FE Payslip's commissionReferences/commissionItems can use source IDs and the corresponding records; amounts remain decimal strings in the API. The new lowercase commission_allocation_events table retains allocation history. Payroll payment settlement and separate payouts remain pending.

### Payroll calculation, lifecycle and payslips

The payroll lifecycle is now explicit:

- `POST /api/v1/payroll/runs/:id/calculate` resolves every eligible employee and persists `payroll_employees` snapshots.
- `POST /api/v1/payroll/runs/:id/approve` moves CALCULATED to APPROVED and applies maker-checker when enabled.
- `POST /api/v1/payroll/runs/:id/publish` assigns stable payslip numbers and publishes the run.
- `POST /api/v1/payroll/runs/:id/pay` records a payment reference, moves the run to PAID and settles PAYROLL claims, allocated commissions and approved overtime.
- `POST /api/v1/payroll/runs/:id/reopen` returns a CALCULATED or APPROVED run to DRAFT, deletes its derived employee snapshots and records a required audit reason. PUBLISHED and PAID runs remain immutable.
- `GET /api/v1/payroll/runs/:id/register` returns the calculated payroll overview grid for OWNER/HR/FINANCE, with employee search and department UUID filters. It is available from CALCULATED through PAID; draft runs continue to use the roster endpoint because no amounts exist yet.
- `GET /api/v1/payroll/runs/:id/register.csv` exports the same FE overview columns for up to 5,000 filtered employees and records an audit event.
- `GET /api/v1/payroll/runs/:id/statutory-exports/:scheme` returns a finalized-run review CSV for `EPF`, `SOCSO`, `EIS`, `LINDUNG_24_JAM`, `PCB` or `HRD`. It is tenant scoped, OWNER/FINANCE only and audited. The `payroll-statutory-review-v1` schema is intentionally not an official e-filing layout until the required provider/authority format is confirmed.

In-app notifications are available at `GET /api/v1/notifications` with `unreadOnly=true`, `PATCH /api/v1/notifications/:id/read`, and `POST /api/v1/notifications/read-all`. Results are scoped to the authenticated user and company. Payslip publication emits one idempotent `PAYSLIP_PUBLISHED` notification to the linked employee; leave and claim decisions emit settings-aware `LEAVE_DECISION` and `CLAIM_DECISION` events. Invitation/approval-queue events and email delivery remain behind future adapters.

Calculation runs in one serializable transaction; a failed employee blocks the status change. Snapshots retain the resolved source lines, statutory traces, PCB review, tax-period values, company and employee display data. `GET /api/v1/payroll/runs/:id/payslips` and `.../payslips/:employeeId` expose FE-shaped payslip data only after publication. OWNER/HR/FINANCE can read a run; an EMPLOYEE can read only their own row. Numeric amounts are returned for the current FE payslip model, while persisted calculation/source traces remain decimal strings. Reopen is a pre-publication correction primitive; finalized-period corrections still require a later-period adjustment workflow. `GET .../payslips/:employeeId/pdf` returns a tenant-authorized PDF attachment and audits the download; configured password-protected PDFs fail closed until an encryption adapter is installed. Bank files and statutory submission exports remain outside this MVP slice.

### Finalized payroll corrections

Published and paid payroll runs cannot be edited. To correct an employee's finalized line, create the correction on a later draft run:

```http
POST /api/v1/payroll/runs/{laterRunId}/adjustments
```

```json
{
  "sourceRunId": "<published-or-paid-run>",
  "employeeId": "<employee>",
  "idempotencyKey": "<uuid>",
  "componentCode": "COMM",
  "amount": "125.00",
  "reason": "Correct January commission underpayment"
}
```

The source must be `PUBLISHED` or `PAID`, the target must be a later calendar month and `DRAFT`, and the component must be active for the target month. The response retains `sourceRunId`, `targetRunId`, `inputId`, amount and reason. Reusing the same request key is safe only with identical values. `GET /api/v1/payroll/runs/{laterRunId}/adjustments` lists the trace; `POST .../adjustments/{id}/void` voids the linked target input with a required reason while the target remains draft. Once the target is calculated, the correction is locked with the rest of the run. The original finalized snapshot is never modified.

### Attendance monthly calendar

`GET /api/v1/attendance/calendar?year=2026&month=11` (OWNER/HR) returns the active company employees for the month. Add `departmentId` to narrow the response. Each employee row contains `employeeId`, `employeeNo`, display name/department, one day object per calendar date, and `summary` totals. A day can include `attendance` (server timestamps, duration, worked minutes, overtime and remark), an approved `leave`, approved `overtime`, and an active `holiday`. `GET /api/v1/attendance/me/calendar` uses the linked employee from the JWT and ignores company-wide filters. The response is bounded to 500 employees and is designed to drive the FE attendance grid and monthly detail dialog; dates are ISO calendar dates and times are ISO timestamps.
Publication snapshots the configured payslip visibility and masking settings. Bank account details are opt-in and account numbers are masked to their final four digits when masking is enabled; footer text is returned only when configured. Hidden sections are returned as `null` so the FE can honor the saved layout without changing the immutable calculation totals. `employeeVisibility=ADMINS_ONLY` is enforced from that immutable snapshot for list, detail and PDF reads, and `notifyEmployees=false` suppresses publication notifications.

### Overtime allocation to payroll

OWNER/FINANCE can allocate or release an approved overtime request using `POST /api/v1/payroll/runs/:runId/overtime/:requestId/allocate` or `/release`, with `{ "reason": "Reviewed overtime" }`. Only draft runs, approved requests, active employees and overtime dates in the run month are accepted. Allocation is single-run and idempotent; release is blocked after the run is calculated. `GET /api/v1/payroll/overtime/:requestId/allocation-history` returns retained allocation/release events.

Allocated overtime is included in `GET .../input-preview` and the calculation preview as an `OVERTIME` source line. The saved earning code and multiplier on the request are used; BASIC and UNPAID_LEAVE are reserved. The amount is rounded to cents after `netMinutes / 60 × hourlyRate × multiplier`. Employee overtime uses the FE-compatible `HOURLY_RATE`, `DAILY_RATE_CONVERTED`, or `MONTHLY_SALARY_CONVERTED` basis. Converted rates use the employee salary effective on the overtime date, the payroll proration method (calendar days, fixed 26 days, or weekdays for WORKING_DAYS), and `standardWorkingHoursPerDay`. Missing employee or company overtime enablement, salary, hours, or earning definitions returns a setup error rather than zero.

FE comparison: `Payroll_FE/src/app/models/overtime/overtime.model.ts` expects numeric multipliers, ISO dates, `Pending`/`Approved`/`Rejected`/`Paid` display statuses, supporting-document names and employee/department labels. The overtime request API now serializes those display types; internal workflow statuses remain explicit in query filters. `overtime_allocation_events` is a new lowercase incremental table. Payroll payment settlement still changes approved allocated records to `PAID` and remains pending.

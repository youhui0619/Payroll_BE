# Payroll backend: database setup

Run the commands below from the `payrollbe` directory. Use your existing PostgreSQL server; Docker is not required.

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

The init migration creates lowercase tables directly and matches the mappings in `prisma/schema.prisma`. It was revised for a fresh database; recreate your database before using it if you previously applied the old init migration. The current init includes these tables (some payroll tables are groundwork for unfinished modules):

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

The employee-account link is included in the consolidated init migration. After recreating your development database, apply init and regenerate the client (stop the backend first on Windows):

```powershell
npx prisma migrate deploy
npm run db:generate
```

Then run `npm run db:seed` to create the initial owner/company again. This consolidated init is for a fresh database; it does not upgrade a database that already applied an older init. Employee records can still exist without a login.

As OWNER or HR, call `POST /api/v1/employees/:id/account` with:

```json
{
  "email": "employee@example.com",
  "password": "employee123"
}
```

Use a unique password in practice and share it privately. The API stores a password hash and returns only account identifiers, email and roles. The role is always EMPLOYEE; callers cannot supply roles. Existing login emails and already-linked employees return 409. Linking an existing user or sending an email invitation is not yet supported.

The employee can log in through `/api/v1/auth/login`, change their password, and call `GET /api/v1/employees/me`. This returns their linked active profile only (identity, contact email, joining date, department and position IDs). An unlinked/inactive employee profile returns 404. The employee role cannot list staff, read other profiles, provision accounts, or read the administrative salary-history endpoints. `/api/v1/auth/me` now includes `employeeId` (null for unlinked memberships).

## Later schema changes

During the current MVP development/reset phase, keep implemented models in `prisma/schema.prisma` and consolidate their SQL into `prisma/migrations/20261028132921_init/migration.sql`. This is the agreed workflow until the initial schema is frozen. Tables for unimplemented modules will be added as those modules are developed; the current init contains the tables listed above, plus a partial unique index preventing two open attendance sessions per employee and check constraints for dates, amounts and membership roles. Recreate the development database when applying a revised init. Do not try to upgrade an old init with `migrate deploy` alone.

After the initial schema is frozen and data must be preserved, create separate migrations for new schema changes:

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
- Payroll settings, statutory categories, draft payroll runs and preflight checks are available. Preflight returns setup issues and explicitly reports unfinished calculation engines.

### Payroll is not yet ready to process salaries

Contribution-table/rate/exemption validation and preview exist, including a LINDUNG_24_JAM scheme. No official contribution data is seeded. Source URL/hash are supplied by the importer; the server does not independently verify the downloaded source.

PCB calculation, salary proration, payroll adjustments, approval/publication/payment and payslip generation remain unfinished. PCB cannot be replaced by a flat contribution rule. No payroll run can be calculated or paid through the current API. See [implementation status](IMPLEMENTATION_STATUS.md) and the [MVP backlog](../BACKEND_TASKS.md).

### Leave balances and history

`GET /leave/me/balances?year=2027` returns each relevant policy's posted `balance`, pending `reserved` days and `available` balance. Omitting the year selects the current year in the company timezone. This replaces the earlier all-years response. Active policies within the selected year appear even with no grants; inactive policies with ledger activity or pending requests remain visible. Values are decimal strings. Unpaid policies return `available: null`, since they do not consume paid entitlement. `annualDays` is still a policy setting, not an automatic grant.

OWNER/HR can use `GET /leave/employees/:id/balances?year=2027` for another employee, including historical inactive profiles. Managers do not receive administrative access to staff balances.

Employees can replace their draft using `PUT /leave/applications/:id` with the same body as creation. Editing recalculates eligibility and duration; submitted applications cannot be edited. `GET /leave/applications/:id` returns the application and all retained workflow events, including each manager/HR decision and comment. Access is limited to the employee, assigned manager, OWNER and HR. Submission still revalidates eligibility; approval posts usage and cancellation reverses it atomically.

The revised init migration includes `leave_events`. These changes do not migrate an already-applied older init.

### Claims and receipts

OWNER, HR and FINANCE can create claim types with `POST /claims/types` and replace settings with `PUT /claims/types/:id`. Read a type with `GET /claims/types/:id`. Example settings:

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

The maximum is **per claim**, not an annual allowance. Effective dates are inclusive and apply to the expense date. A null amount/date removes that restriction. PUT replaces settings: omitted optional fields return to defaults (active=true, receiptRequired=false, other optional settings=null). These settings are company-defined and do not supply statutory rules.

Employees create a draft, edit it with `PUT /claims/:id`, attach receipts through `POST /files`, and submit it. Submission revalidates the current type, employment, active reporting manager, amount and receipts, then saves the policy and receipt IDs in a snapshot. Later type changes affect drafts and new submissions only. Unscanned receipts require the explicit development bypass; production requires CLEAN scans.

`GET /claims/:id` returns accessible claim details, receipt metadata and all workflow events with actor, time, action, status and decision comment. Claim lists (`/claims`, `/claims/me`, `/claims/pending`) accept `status`, `typeId`, `employeeId`, `from`, `to`, `search`, `page` and `pageSize`. Filters narrow the caller's existing permissions.

`GET /files` lists accessible active metadata and accepts `employeeId`, `claimId`, `category`, `search`, `page` and `pageSize`. Finance can read claim receipts but cannot use this access to browse other employees' personal documents. Reporting managers can read receipts linked to their assigned claims.

`POST /files/:id/archive` hides an employee document or draft receipt without deleting stored bytes. Only the employee or OWNER/HR can archive. Receipts on any submitted claim remain retained, including after rejection or cancellation. Upload a replacement before submitting the draft; receipt uploads and archiving are locked after submission.

These additions are included in the revised init migration, including `claim_events`. Apply them to your recreated database using the setup commands above; do not apply the edited init over an older applied version.

### Storage configuration

`STORAGE_PROVIDER=local` uses `STORAGE_LOCAL_PATH` (default `storage`). S3 uses `STORAGE_PROVIDER=s3`, `S3_BUCKET`, `AWS_REGION` and the standard AWS credentials chain. Files are not served as public static assets.

Configure `CLAMAV_HOST` and optionally `CLAMAV_PORT` for upload scanning. Scanner failures reject uploads. For local development only, `ALLOW_UNSCANNED_UPLOADS=true` permits unscanned files; production still requires scanning. ClamAV and S3 require separate infrastructure and have not been exercised against live services by the automated tests.

### Effective-month payroll profiles

`PUT /employees/:id/payroll-profile` (OWNER/HR) now requires `effectiveFrom` (the first day of a month), `reason`, `lindungParticipation` and all six statutory categories. Participation is `ENROLLED`, `OPTED_OUT`, `MANDATORY` or `NOT_ELIGIBLE`; these are recorded declarations, not automatic legal eligibility decisions. Keep supporting references in the reason. Preflight requires contribution rules for enrolled/mandatory participation and an explicit exemption ruleset for opted-out/ineligible participation.

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

`test:integration` uses the server/credentials from `DATABASE_URL`, connects to its `postgres` maintenance database, creates a random `payroll_test_<uuid>` database, applies init there and removes it in a finally block. The account needs CREATE DATABASE permission. It never migrates or resets the application database. If the process is forcibly killed, identify the printed test database name before removing that test database manually.

Integration checks cover tenant foreign keys, concurrent clocking/approval/payment, leave reversal, stale drafts, balance protection and payroll draft/preflight isolation. These are representative workflow tests, not statutory conformance tests.

Liveness is `GET /health/live`; database readiness is `GET /health/ready`. Request IDs appear in the `X-Request-Id` header and compact errors. Login IP throttling is process-local; distributed deployment needs a shared limiter.

Salary calculation core uses calendar days for a calendar-month wage period, following Employment Act section 18A's incomplete-month formula: monthly wages / days in wage period * eligible days. Source: https://www.investmalaysia.gov.my/media/felj30g0/employment-act-1955.pdf (page 28). Joining and last employment days are inclusive; salary-history end dates are exclusive. Mid-month rate changes are weighted by each rate's employed days. Numerators are summed before division, with HALF_UP currency rounding only on aggregate employed/payable salary; the unpaid deduction is their difference so displayed amounts reconcile. These rounding and rate-change choices are application policy, not a quoted statutory rounding rule.

The pure engine accepts resolved half/whole unpaid days with source references and returns salary segments and calculation traces. It rejects gaps, overlapping salary records, duplicate source/date pairs and more than one unpaid day per date. Preflight uses the engine to check salary history. Automatic leave-date resolution, employment termination fields, configurable proration policy and persisted run calculations remain pending. Salary-history writes affecting calculated or finalized payroll months are now rejected.

Leave submission stores `daySnapshot` on the request: schema version, schedule ID/working weekdays, location/state and exact working dates with `1` or `0.5` day quantities. Approval retains that snapshot. Payroll preflight resolves approved unpaid requests from those dates, clips cross-month requests to the salary month and verifies their quantities reconcile to the approved total. Later schedule/holiday changes do not recalculate submitted leave. Missing legacy snapshots cause `LEAVE_SNAPSHOT_REQUIRED`; do not infer them from current schedules. Drafts may retain a null snapshot until submission. The new column remains in the consolidated init.

Submitting or deciding leave, and cancelling submitted leave, is rejected when its date range intersects a calculated/finalized payroll month. Draft cancellation remains available. A later correction workflow is still pending. These changes supply validated unpaid dates to salary preflight; persisted payroll-run calculation and statutory integration are not yet complete.

Draft payroll input preview: `GET /payroll/runs/:id/employees/:employeeId/input-preview` (OWNER/FINANCE) resolves one employee's salary history, approved frozen unpaid dates and active manual inputs in a consistent read transaction. It returns component lines, effective definition references, gross/payable earnings, wage bases, salary traces and manual-entry reasons. `complete=false` and `limitations` are explicit: no statutory deductions or final net pay, overtime or recurring allowance collection yet. Allocated approved claims are included. This endpoint does not persist a calculation or change run status.

Configure `BASIC` as an active earning affecting gross and net. When unpaid deductions exist, configure `UNPAID_LEAVE` as a deduction affecting gross/net and the same statutory bases as BASIC. Those two codes are generated automatically and cannot be entered manually; use separate adjustment definitions for corrections. Voided manual inputs are excluded, and missing/archived effective definitions fail validation. The effective definition and source references are preserved in each line for future payroll snapshots.

Approved claim payroll allocation: OWNER/FINANCE may call `POST /payroll/runs/:runId/claims/:claimId/allocate` with `componentCode` and `reason`. Only approved PAYROLL claims can be allocated, to one draft run at a time. Claim/employee dates must be eligible by period end. Select an active earning definition affecting net pay; review gross/statutory flags according to the expense classification. Repeating the same allocation returns it without another event. A different run conflicts. `POST .../release` requires a reason and releases only a draft allocation. Allocation/release events retain run, component and reason; approved claim amounts remain unchanged.

Allocated claims are now included automatically in employee input previews, with CLAIM source references and claim descriptions/dates. Reimbursements can affect net only when their definition uses those flags. Unallocated claims are omitted. Allocation is not payment: claims remain APPROVED until a future payroll payment command settles them. Run finalization/payment is still pending. Claim allocation fields and a tenant composite run FK are included in the single init.


The employee input preview now includes `contributionPreview`: effective profile ID/revision, per-scheme issues, and calculated EPF/SOCSO/EIS/LINDUNG/HRD contributions. Each calculation retains category, ruleset/version, source URL/checksum, effective dates, parameters, wage basis and arithmetic trace. Employer cost includes the employer-paid remittance rounding difference; employee withholding is unchanged. Exactly one active category ruleset must cover the entire month; absent, overlapping or partial coverage is an issue, never an assumed zero. LINDUNG participation must agree with the selected contribution/exemption rule. `nonPcbReady` describes these five schemes only. Overall `complete` stays false: PCB input resolution, final net pay and persisted payroll execution remain pending, and profile eligibility still relies on reviewed declarations.

PCB remuneration classification: component definitions now accept `pcbTreatment` (`NORMAL`, `ADDITIONAL`, `EXCLUDED`, `UNCLASSIFIED`). A component flagged for the PCB wage basis must explicitly use NORMAL or ADDITIONAL. Components outside that basis use EXCLUDED or the default UNCLASSIFIED; this does not determine legal exemption eligibility. BASIC must use NORMAL when PCB-bearing, and generated unpaid salary deductions must use the same class. Bonuses and other additional remuneration require reviewed additional classifications according to the LHDN specification. Application and database validation reject contradictory combinations.

Input previews expose `pcbRemuneration.normal`, `.additional`, and `.unclassified`, with classification retained on each line. Category-specific deductions cannot make a category negative. Legacy in-memory unclassified lines are reported separately rather than assumed to be normal. Employee tax reliefs/TP1/TP3, EPF allocation between remuneration classes, year-to-date resolution and the final PCB integration remain pending. The component field/constraint is part of the single init migration.

Previous-employer tax opening declarations: `POST /employees/:employeeId/tax-openings` (OWNER/FINANCE) appends reviewed cumulative `taxableIncome`, `employeeEpf`, `mtd` and `zakat` for a `year` and `effectiveMonth`, with `evidenceReference` and `reason`. Amounts are decimal strings. These are previous-employer totals only; exclude this company's payroll, CP38 and voluntary extra withholding from MTD. A correction replaces the applicable declaration total; revisions must never be summed. Zero declarations are permitted with an evidence reference. Recording the declaration does not independently validate the underlying TP3 document.

`GET /employees/:employeeId/tax-openings?year=2026` (OWNER/HR/FINANCE) returns paginated revision history. Earlier effective-month insertion and revisions affecting calculated/finalized months of the same year are blocked. The employee input preview includes the latest applicable declaration as `taxOpening`; null means no declaration recorded, not a confirmed zero. The lowercase `employee_tax_openings` table is in the consolidated init. Current-employer YTD, reliefs, EPF allocation and final PCB integration remain pending.

Reviewed family tax declarations: `POST /employees/:employeeId/tax-family` (OWNER/FINANCE) records `year=2026`, `effectiveMonth`, `residency`, PCB `category` (1/2/3), `disabledIndividual`, `spouseReliefEligible`, `disabledSpouseReliefEligible`, `children`, `evidenceReference` and `reason`. Each child uses a stable internal `reference`, one `kind` (STANDARD, HIGHER_EDUCATION, DISABLED, DISABLED_HIGHER_EDUCATION), and FULL/HALF share. Do not put national identity numbers into these references. Eligibility must be reviewed: STANDARD includes qualifying under-18/full-time education cases; higher education, disability, spouse income/assessment and shared-claim conditions require supporting evidence. HALF is not an automatic split for spouses living together.

The service calculates amounts from the retained 2026 PCB specification, rejects duplicate child references and category contradictions, and saves declaration plus relief breakdown/source reference as an immutable revision. Non-resident personal relief amounts are zero. `GET .../tax-family?year=2026` provides history to OWNER/HR/FINANCE. Older-month insertion and changes affecting calculated/finalized payroll are blocked. Input previews include the applicable revision as `taxFamily`. Family relief totals exclude EPF and TP1 expense deductions and must not be treated as the complete combined relief input. The new `employee_tax_families` table remains in the consolidated init.

TP1 expense limits preview: `POST /statutory/pcb/tp1-preview` (OWNER/FINANCE) accepts `year=2026`, `amounts` keyed by the official form codes, `spouseRelief` already claimed and `projectedMandatoryEpf` already deducted by the PCB projection. Monetary values are decimal strings. Supported keys are C1AB, C1C, C2, C3AB, C3C, C4AB, C4C, C4D, C4E, C4F, C5–C10, C11A, C11B, C12–C15, C16A, C16B and C17. AB combines those two unrestricted subitems; separate sublimited items must retain their own keys. Omitted codes are zero; unknown codes, negatives and excess decimal precision are rejected.

Submit reviewed cumulative current-year amounts including previous employment, not monthly increments or summed correction revisions. The response shows claimed amounts, sublimits, shared group caps and allowed totals. C10 shares the spouse allowance; C11A uses the remaining mandatory/voluntary EPF allowance; the two C16 home-price bands cannot both be claimed. Review receipt eligibility, repeat-year restrictions and shared claim conditions before using the preview. Do not claim one expense under multiple codes or automatically add payroll SOCSO/EIS a second time. D1 rebates are separate and not included. This endpoint does not save declarations or complete payroll PCB integration.

Official schedule: https://www.hasil.gov.my/wp-content/uploads/bi-tp1-form-2026.pdf (reviewed 2026-11-02). The preview uses the schedule limits; it does not independently verify legal eligibility or supporting receipts.

Saved TP1 expense declarations: `POST /employees/:employeeId/tax-expenses` (OWNER/FINANCE) accepts `year=2026`, `effectiveMonth`, `amounts`, `evidenceReference` and `reason`. Amount keys/values follow the TP1 preview API. Submit reviewed cumulative totals, including eligible previous-employer expenses once. Corrections replace the applicable declaration; revisions must not be summed. Empty `amounts` is an explicit reviewed zero declaration. Omitted codes are stored as zero and currency values are normalized to two decimals. Claimed amounts above a cap are retained; the allowed deduction is recalculated using payroll spouse/EPF context rather than saved as an arbitrary total.

`GET .../tax-expenses?year=2026` returns paginated history to OWNER/HR/FINANCE. Earlier effective-month insertion and changes affecting calculated/finalized periods are rejected. Input preview includes the applicable revision as `taxExpenses`; null means not recorded. Receipt eligibility and recurring-claim checks are recorded through the review reference; automated receipt reconciliation remains pending. The lowercase `employee_tax_expenses` table is included in the consolidated init. These APIs do not yet finalize PCB or payroll runs.

Declaration-based PCB calculation now has a reusable internal helper, `calculateDeclaredPcb`, which derives family reliefs from reviewed declarations and applies TP1 expenses to each normal/additional-remuneration projection. The mandatory EPF allowance already used can differ between those projections, so C11A headroom is recomputed separately. Calculation traces retain the EPF projection, combined qualifying reliefs, family breakdown and both TP1 breakdowns. Non-residents do not receive resident reliefs. This helper still expects normalized remuneration, EPF allocation and accumulated tax amounts; automatic run-level resolution/persistence remains pending.

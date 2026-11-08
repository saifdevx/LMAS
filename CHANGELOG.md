# CHANGELOG.md

All notable changes to LMAS are documented here.

## [1.0.0] — Checkpoint 5: Testing, Refinement and Release (2026-11-08)

### Added
- **Security review (PRD §7.5)**: renderer Content-Security-Policy (`default-src 'self'; script-src 'self'; object-src 'none'; frame-src 'none'`) — remote code, frames and plugins are impossible; the `ws://localhost:*` connection allowance exists only for the Vite HMR channel in development. Automated tests assert the CSP is present and that renderer sources contain no external URLs (offline-first verification).
- **Change your own password** (any signed-in user): header key-icon opens a modal requiring the current password, clears the must-change flag, refreshes the session badge and writes `USER_OWN_PASSWORD_CHANGE` to the audit trail — closes the gap where only administrators could set passwords.
- **Application icon**: teal flask mark generated as `build/icon.ico` (16–256 px) + `build/icon.png`; wired into the executable and the NSIS installer (desktop + start-menu shortcuts named "LMAS").
- **electron-builder config** (`electron-builder.config.js`): Windows NSIS target with version info (`1.0.0`), copyright, installer/uninstaller icons, desktop & start-menu shortcuts. Platform-aware: on the Windows build machine the executable is stamped with icon + version resources and asar integrity natively; cross-builds from Linux skip Wine-dependent steps.
- **Migration drill test**: builds a real version-1 database (Checkpoint 2 era), stores patients/bills, then applies migration 002 — proving in-place upgrades never erase records (PRD CP5 acceptance "Updates do not erase records").
- **Performance smoke test**: 300 bills created transactionally; bill history page and laboratory worklist queries stay well under generous bounds with pagination.
- **Installation guide** in `USER_GUIDE.md` (§1b): installer steps, first-run backup advice and the data-folder location.

### Changed
- `dist:win` now passes the builder config explicitly (`--config electron-builder.config.js`).
- Default-password reminder in the header is now a button that opens the change-password dialog.

### Verification (full regression, 2026-11-08)
- `npm run typecheck` (both projects) — pass.
- `npm test` — **112/112 pass** (7 suites; +5 in `tests/cp5.test.ts`).
- `npm run build` — production bundles clean (renderer 626 kB JS / 30 kB CSS).
- Headless smoke: fresh DB `SMOKE_OK ... migrated=0->2`; restart persistence `SMOKE_OK ... migrated=2->2`.
- Windows installer: **build on a Windows machine** with `npm run dist:win` (Node 20+). The Linux sandbox cannot run Wine, which electron-builder requires for the Windows resource/data steps — the NSIS project, icon, shortcuts and version metadata are fully preconfigured and were exercised up to the Wine-dependent step.

### Known limitations
- Code signing is not configured (unsigned installer, standard SmartScreen warning on first install).
- The installer binary itself must be produced on Windows (`npm run dist:win`); everything else (source, schema, tests, packaging config, icon) is complete and cross-verified.

## [0.4.0] — Checkpoint 4: Accounting, Dashboard and Administration (2026-11-08)

### Added
- **Commission management**: per-practitioner accounts (accrued / paid / outstanding computed as Σentries − Σpayments so payments can never double-count commission expenses), full ledger modal (accruals, adjustments, reversals + payment history), commission payments with overpayment protection and client transaction-id duplicate rejection (`CMP-YYYY-####` codes).
- **Expense management**: expenses with `EXP-YYYY-####` codes, categories (add / activate / deactivate), date/category/free-text filters with period totals; entries are immutable (corrections via new entries), all writes audited.
- **Financial reports (11 types)**: daily, weekly, monthly, custom summary, self-patient, referred-patient, practitioner commissions, expenses by category, patient outstanding balances, cash collections, and profitability — all from real SQL aggregates with cancelled bills excluded, clear totals and summary figures. One generic table model feeds the UI, PDF and Excel.
- **Report exports**: professional A4 PDF (laboratory identity, PKR formatting, DD-MM-YYYY dates, Urdu-safe RTL cells) via Electron's offline print engine; real Excel (.xlsx) workbooks via SheetJS — both audited (`REPORT_PDF_EXPORTED` / `REPORT_EXCEL_EXPORTED`).
- **Refunds** (`refunds.issue` permission): audited refunds on paid bills (`REF-YYYY-####`), outstanding recomputed as net − paid + refunded, bill marked REFUNDED when the refunded total reaches the amount received; completes the Checkpoint 2 decision D11.
- **Transaction history**: unified read-only ledger over `v_transaction_history` (patient payments, commission payments, expenses, refunds, adjustments) with type/date/search filters, pagination and money-in/out totals.
- **User management**: create users (username rules, 8+ char password, role assignment, must-change-password flag), edit name/role, set passwords, activate/deactivate with last-active-Administrator and self-deactivation guards, role permission matrix viewer; all changes audited.
- **Backup & restore**: manual backups via SQLite `VACUUM INTO` (consistent snapshot while the app stays usable), integrity + schema verification before recording, automatic once-per-day backup on first launch, backup history, and restore with explicit warning + pre-restore safety copy + automatic application relaunch.
- **Audit log viewer**: searchable, paginated audit trail (Users & roles tab) restricted to `users.manage`.
- **IPC**: 25 new Zod-validated channels across refunds, commissions, expenses, reports/exports, transactions, users, backups and audit (64 channels total).
- **Tests**: 22 new tests (107 total) covering refund rules, commission reconciliation/double-count protection, expense immutability, unified history, every report's reconciliation with underlying transactions, HTML/xlsx export contents, backup-verify-restore round trip and user guards.

### Changed
- All 15 sidebar navigation entries are now implemented — placeholder pages removed.
- Bill detail modal: refund panel for paid bills, refunded totals shown in the balance summary.
- `package.json` version aligned with the changelog (0.4.0).

### Verification
- `npm run typecheck` (both projects) — pass.
- `npm test` — 107/107 pass.
- `npm run build` — production bundles build clean (renderer 622 kB JS / 30 kB CSS).
- Headless smoke (Xvfb + Electron 33) — `SMOKE_OK user_version=2 users=1 migrated=0->2`; restart persistence `SMOKE_OK ... migrated=2->2`.

### Known limitations
- Windows installer ships in Checkpoint 5; CSP/fuses hardening tracked for the Checkpoint 5 security review.
- Commission payments are not auto-reversed when a referred bill is refunded; administrators can record a reversal adjustment (documented in USER_GUIDE).

## [0.3.0] — Checkpoint 3: Laboratory Workflow and Reports (2026-11-08)

### Added
- **Laboratory worklist** (Test Results page): every active bill with its tests, counts by status, sample codes and patient/visit context; search by patient (English/Urdu), ID, visit or bill number and test name; date-range and status filters; results auto-created as PENDING for every billed test (idempotent back-fill for legacy items).
- **Sample tracking**: samples with auto codes (`SMP-YYYY-####`), collector, timestamps and technician assignment; forward-only lifecycle Not collected → Collected → Received → Processing → Completed; rejection and re-collection always require a reason; linking a sample to another bill's tests is rejected transactionally.
- **Test status workflow**: PENDING → IN_PROGRESS → COMPLETED with guards (completion requires a value, no backward moves, cancellation requires a reason and is blocked for completed tests).
- **Result entry with revision history**: value/unit/reference-range/observations saves append immutable revisions (revision no, user, timestamp, old → new); no-change saves create nothing; unit and reference range pre-fill from the catalog's new `default_unit` / `default_reference_range` columns (migration 002).
- **Verification ladder**: Draft → Verified → Approved with `results.approve` permission enforcement (technicians cannot verify/approve/reset; receptionists cannot enter results at all); editing locked once verified; supervisor reset back to draft requires a reason and is audited (`RESULT_RESET`).
- **Laboratory reports**: A4 report HTML with laboratory identity/header, patient details (English + Urdu rendered RTL), sample codes, per-test value/unit/reference-range, entered-by/verified-by stamps and signature line; cancelled tests shown as *Cancelled*, pending as *Pending* (rows never dropped); printing via Electron print dialog and PDF export via `printToPDF`; every issued report recorded immutably in `lab_reports` with `RPT-` codes, generator and timestamp.
- **Patient test history**: all laboratory tests of a patient across all visits in the patient profile, with values, sample codes and the latest report reference.
- **IPC**: 14 new Zod-validated lab channels (`lab:worklist`, `lab:billWork`, `lab:saveResult`, `lab:setTestStatus`, `lab:createSample`, `lab:updateSample`, `lab:verifyResult`, `lab:approveResult`, `lab:resetResult`, `lab:revisions`, `lab:patientHistory`, `lab:technicians`, `lab:reportPrint`, `lab:reportPdf`) with per-channel permission checks.
- **Tests**: 27 new lab tests (85 total) covering PRD §12 CP3 acceptance criteria: status transitions, worklist filters, revision history, verify/approve permission denials, sample lifecycle, patient/visit isolation of results, report data + HTML contents (incl. Urdu RTL) and report history.

### Changed
- Sidebar "Test Results" placeholder replaced by the implemented laboratory worklist; Patient Profile gained a laboratory-work modal (samples, results, verification, report printing).
- Laboratory Tests page supports per-test default unit and reference range.

### Verification
- `npm run typecheck` (both projects) — pass.
- `npm test` — 85/85 pass.
- `npm run build` — production bundles build clean.

### Known limitations
- Administration modules (Commission Management, Expenses, Financial Reports, Transaction History, User Management, Backup & Restore) remain placeholders planned for Checkpoint 4.
- Windows installer ships in Checkpoint 5; CSP hardening remains tracked for the Checkpoint 5 security review.

## [0.2.0] — Checkpoint 2: Patients, Practitioners, Tests & Billing (2026-11-08)

### Added
- **Patients**: registration (English + Urdu names), edit, unified search (patient ID, name, phone, registration date, bill number), patient profile with visits, bills, payment history and reconciling financial summary.
- **Practitioners**: CRUD with `DR-####` codes, activate/deactivate, commission-rate changes that always write an immutable history row with reason, per-practitioner account view (referred visits/bills, eligible revenue, accrued, outstanding, commission ledger, rate history).
- **Test catalog**: tests with auto/manual codes, categories (add category), prices, optional direct laboratory cost, sample type, turnaround; activate/deactivate; price changes audited and never applied to historical bills.
- **Billing**: single-transaction bill creation (visit `VIS-YYYY-####` + bill `BILL-YYYY-####` + snapshot items + commission ACCRUAL + initial payment), live commission preview using the central calculation service, discount permission enforcement (`billing.discount`) at both IPC and service level, overpayment rejection.
- **Patient payments**: full and partial payments with client-generated transaction IDs, UNIQUE-constraint duplicate protection (PRD Scenario 8), automatic status transitions (FINALIZED → PARTIALLY_PAID → PAID).
- **Commission accounting**: NET_BILL basis (accrue at finalization) and COLLECTED basis (incremental accrual per payment) both implemented; bill-level rate/basis snapshots; cancellation of payment-free bills creates an `adjustments` row and a REVERSAL commission entry with audit.
- **Receipts**: laboratory-branded receipt HTML (thermal 80 mm and A4 layouts) with logo support, Urdu patient names, totals, received, balance and status; printing via Electron print dialog and PDF export via `printToPDF` (both offline, PDF exports audited); logo upload in Settings.
- **UI**: Patients, Patient Profile, New Registration, Billing, Bills History (filters + pagination + bill detail with in-place payments/cancellation), Laboratory Tests, Practitioners pages; bill detail modal shared by history and profile; Settings logo upload.
- **IPC**: 19 new Zod-validated channels across patients, practitioners, tests, bills and receipts; permissions enforced per channel.
- **Tests**: 22 new tests (58 total) covering PRD Scenarios 1–8 at service level, price/rate snapshot immutability, COLLECTED basis, cancellation rules, numbering sequences, search modes, patient profile reconciliation, practitioner account reconciliation and receipt HTML contents.

### Changed
- Sidebar placeholders replaced by implemented modules (Test Results and the administration modules remain labelled placeholders).
- Dashboard financial cards now populate from real billing data.

## [0.1.0] — Checkpoint 1: Foundation, Planning & Project Setup (2026-11-08)

### Added
- Electron 33 + React 18 + TypeScript (strict) + Vite (`electron-vite`) + Tailwind CSS project scaffold with production build.
- Complete SQLite schema (migration `001_initial_schema`, version 1): 25 tables covering users/roles/permissions, patients, visits, practitioners + commission history, test catalog, bills, bill items, payments, commission ledger entries, commission payments, samples, test results + revisions, expenses, adjustments, refunds, audit logs, settings, backup history — plus the `v_transaction_history` unified view (PRD §6).
- Transactional migrator keyed on `PRAGMA user_version`; first-run seed (3 roles, 25 permissions, initial administrator, default expense & test categories, default settings).
- Central financial calculation service: integer-paisa money utilities, commission/allocation with exact half-up rounding and remainder allocation, bill totals guardrails, outstanding balance and estimated-profit formulas (`src/shared/commission.ts`, `src/shared/money.ts`).
- Authentication: scrypt password hashing, 12-hour sessions, login/logout/verify, inactive-account blocking, login auditing.
- Settings service: laboratory profile, currency/date-format constants, default commission rate (basis points), commission calculation policy (`NET_BILL`/`COLLECTED`), numbering prefixes; updates audited with old/new values.
- Dashboard service: period-aware (today/yesterday/last 7 days/this month/custom) aggregates for patients, tests, financials, commissions — all real SQL, zero mock data.
- Secure IPC layer: Zod-validated handlers, permission checks, session verification; sandboxed renderer with a six-function typed preload bridge.
- Renderer shell: dark sidebar with the 15 PRD §5.2 navigation entries (permission-filtered), header with lab identity and user chip, login screen, dashboard with all PRD §Module A cards and period filters, working Settings page, and clearly-labelled placeholders for modules planned in Checkpoints 2–4.
- Test suite: 36 Vitest tests covering money formatting, PRD Scenarios 1–6 & 8 at calculation/DB level, migrations, seed idempotency, FK/CHECK/UNIQUE integrity, auth, settings/audit, dashboard aggregation.
- Documentation set: PRD.md, AGENTS.md, ARCHITECTURE.md, DATABASE.md, ACCOUNTING_RULES.md, IMPLEMENTATION_PLAN.md, TESTING.md, CHANGELOG.md, USER_GUIDE.md.

### Verification
- `npm run typecheck` (both projects) — pass.
- `npm test` — 36/36 pass.
- `npm run build` — production bundles build clean.
- Headless smoke launch + restart — DB created/migrated once, survives restart without re-seeding.

### Known limitations
- Modules planned for Checkpoints 2–4 are placeholders (visibly marked).
- Windows installer ships in Checkpoint 5; `npm run dist:win` preconfigured.
- CSP hardening deferred to the Checkpoint 5 security review.

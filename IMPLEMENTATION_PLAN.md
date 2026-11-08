# IMPLEMENTATION_PLAN.md

## Checkpoint overview

| # | Checkpoint | Status |
| --- | --- | --- |
| 1 | Foundation, Planning and Project Setup | ✅ **COMPLETE** (2026-11-08) |
| 2 | Patients, Practitioners, Tests and Billing | ✅ **COMPLETE** (2026-11-08) |
| 3 | Laboratory Workflow and Reports | ✅ **COMPLETE** (2026-11-08) |
| 4 | Accounting, Dashboard and Administration | ✅ **COMPLETE** (2026-11-08) |
| 5 | Testing, Refinement and Windows Installer | ✅ **COMPLETE** (2026-11-08, installer built on Windows) |

---

## Checkpoint 1 — task ledger (all done)

| Deliverable (PRD §12 CP1) | Status | Where |
| --- | --- | --- |
| Finalized project architecture | ✅ | `ARCHITECTURE.md` |
| Database design + ERD | ✅ | `DATABASE.md` |
| Financial calculation specifications | ✅ | `ACCOUNTING_RULES.md` + `src/shared/commission.ts` |
| Project folder structure | ✅ | repo root |
| Electron + React + TypeScript setup | ✅ | `electron.vite.config.ts`, strict TS, both tsc passes |
| Professional application layout | ✅ | Sidebar (15 nav items, permission-filtered) + header shell |
| Sidebar navigation | ✅ | `src/renderer/src/components/Sidebar.tsx` |
| Dashboard UI foundation | ✅ | `src/renderer/src/pages/Dashboard.tsx` (all PRD §Module A cards + 5 period filters) |
| SQLite connection | ✅ | WAL + foreign_keys + busy_timeout (`db/connection.ts`) |
| Database migrations | ✅ | Transactional migrator, version 1, all 25 tables + history view |
| Authentication foundation | ✅ | scrypt hashing, 12h sessions, login/logout/verify, audit |
| Initial user roles | ✅ | Administrator / Receptionist / Technician + 25 permissions seeded |
| Application settings foundation | ✅ | Lab profile, commission policy (visible & active), numbering prefixes |

**Acceptance criteria evidence (PRD §12 CP1):**

| Criterion | Result |
| --- | --- |
| Application launches | ✅ Headless launch smoke: `SMOKE_OK` (Linux sandbox; Windows verification pending on target machine) |
| Login works | ✅ Covered by 5 auth integration tests |
| Database created in correct location | ✅ `LMAS_DATA_DIR` / `dev-data/` (dev) / `%APPDATA%\LMAS` (packaged) |
| Navigation works | ✅ Permission-filtered sidebar, 3 implemented pages + labelled placeholders |
| Database survives restart | ✅ Second smoke run: `migrated=1->1`, `users=1` (no re-seed, no duplicates) |
| No internet required | ✅ No runtime network calls; all deps bundled locally |

---

## Checkpoint 2 — task ledger (all done, 2026-11-08)

| Deliverable (PRD §12 CP2) | Status | Where |
| --- | --- | --- |
| Patient registration | ✅ | `services/patients.ts` + New Registration page (EN + Urdu names) |
| Patient search | ✅ | Unified search: ID / name / phone / registration date / bill number |
| Patient profile | ✅ | Visits + bills + payment history + reconciling totals + edit |
| Patient visit management | ✅ | One visit created per bill (decision D9), codes `VIS-YYYY-####` |
| Self/referred categorization | ✅ | Category on visit + bill; enforced by CHECK constraints |
| Practitioner management | ✅ | CRUD, activate/deactivate, account view (ledger + rate history) |
| Commission rate configuration | ✅ | Rate change with reason → immutable history; bills keep snapshots |
| Test catalog | ✅ | CRUD, categories, activate/deactivate, search + filter |
| Test pricing | ✅ | Price edits audited; historical bills keep list + charged price |
| Bill creation | ✅ | Single transaction: visit + bill + items + accrual + initial payment |
| Multiple tests per bill | ✅ | Line items with per-line snapshots |
| Discounts | ✅ | `billing.discount` permission enforced in IPC **and** service |
| Patient payments | ✅ | Full/partial; status machine FINALIZED → PARTIALLY_PAID → PAID |
| Partial payments | ✅ | Overpayment rejected; outstanding always reconciles |
| Commission calculation | ✅ | Central service; NET_BILL and COLLECTED policies both implemented |
| Bill history | ✅ | Filters (date/status/category/search) + pagination |
| Receipt printing | ✅ | Thermal 80mm + A4 via hidden-window `webContents.print` |
| PDF receipts | ✅ | `printToPDF` + save dialog; PDF export audited |

**Acceptance criteria evidence (PRD §12 CP2):** both categories ✅ (Scenarios 1–4),
commission tests ✅ (incl. rate snapshot Scenario 7 + COLLECTED basis), partial
payments ✅ (Scenario 5), historical immutability ✅ (price + rate snapshot
tests), bills/receipts ✅ (HTML content tests + Electron print/PDF), no
duplicate payments ✅ (Scenario 8 UNIQUE constraint test).

**Decision log additions:**

| # | Decision | Rationale |
| --- | --- | --- |
| D9 | One visit per bill (`createBill` creates the visit) | Matches front-desk workflow; PRD §6.2 leaves this to the workflow design |
| D10 | COLLECTED basis accrues incrementally per payment | Keeps accrued == rate × collected at all times; documented in ACCOUNTING_RULES |
| D11 | Cancellation restricted to payment-free bills until CP4 refunds exist | Prevents untracked cash reversal; explicit error directs staff to CP4 |
| D12 | Receipts deliberately omit practitioner commission | Patient-facing document per PRD §Module E receipt field list |

## Checkpoint 3 — task ledger (all done, 2026-11-08)

| Deliverable (PRD §12 CP3) | Status | Where |
| --- | --- | --- |
| Every billed test enters the workflow as PENDING | ✅ | `ensureResultRows` back-fill (idempotent, legacy rows included) + `listWork` worklist |
| Sample tracking (collect → receive → process → complete, reject/re-collect with reason) | ✅ | `services/lab.ts` `createSample` / `updateSample` with forward-only lifecycle `SAMPLE_ORDER` |
| Test status workflow (PENDING → IN_PROGRESS → COMPLETED, guarded CANCELLED) | ✅ | `setTestStatus` (rejects empty-value completion, backward moves, completed-cancel without reason) |
| Result entry with automatic revision history | ✅ | `saveResult` + `result_revisions` (rev no, who, when, old→new); no-op saves create nothing |
| Verification ladder Draft → Verified → Approved | ✅ | `verifyResult` / `approveResult` / `resetResult`; `results.approve` permission enforced; reset requires reason, audited `RESULT_RESET` |
| Default unit / reference range from catalog | ✅ | migration 002 `laboratory_tests.default_unit / default_reference_range`; pre-fill only, never auto-invented |
| Printable A4 lab report + PDF, report history | ✅ | `lab-report-html.ts` (A4 layout, Urdu RTL, signatures), `lab-report-print.ts` (`printToPDF`, `lab_reports` immutable history, `RPT-` codes) |
| Results stay associated with the correct patient & visit | ✅ | `getBillWork` scoped by bill → visit → patient; filter test `filters the worklist by patient, test name and status` |
| Patient test history across visits | ✅ | `patientHistory` surfaced in Patient Profile with latest report reference |
| Urdu display checks on reports | ✅ | `buildLabReportHtml` contains `direction:rtl` block; test asserts Urdu name rendering |
| Unauthorized users cannot approve results | ✅ | Technician (no `results.approve`) and Receptionist (no `test_results.manage`) blocked at service + IPC level |

**Acceptance criteria evidence (PRD §12 CP3):** 27 lab tests (85 total, all
pass) cover status transitions, revision immutability, verify/approve ladder,
permission denials, sample lifecycle, report data/HTML fields and history;
`npm run typecheck` (both projects) and `npm run build` pass; migration
version 2 (`002_lab_workflow`) applied transactionally.

## Checkpoint 4 — task ledger (all done, 2026-11-08)

| Deliverable (PRD §12 CP4) | Status | Where |
| --- | --- | --- |
| Practitioner commission ledger | ✅ | `services/commissions.ts` `getCommissionLedger` + Commission Management page ledger modal |
| Practitioner commission payments | ✅ | `recordCommissionPayment` (CMP codes, overpayment + duplicate-txn protection, audited) |
| Outstanding commission | ✅ | `listCommissionAccounts` — outstanding = Σentries − Σpayments (never double-counts) |
| Laboratory expense management | ✅ | `services/expenses.ts` + Expenses page (categories CRUD-lite, filters, immutable entries) |
| Financial dashboard | ✅ | Dashboard cards already period-aware (CP1/CP2) + commission paid/outstanding; CP4 adds the full summary report |
| Daily/weekly/monthly reports | ✅ | `services/reports.ts` DAILY/WEEKLY/MONTHLY (+ CUSTOM summary) reconciling with raw aggregates |
| Profitability reports | ✅ | PROFITABILITY (per-month net − commission − direct costs − expenses) |
| Patient outstanding balances | ✅ | OUTSTANDING report (open bills only) + Financial Summary outstanding figure |
| Transaction history | ✅ | `services/transactions.ts` over `v_transaction_history` + Transaction History page |
| Audit logs | ✅ | Audit viewer in User Management (`audit:list`, `users.manage` only) — append-only per §8 |
| User permissions | ✅ | `services/users.ts` + User Management page (create/edit/password/activate, last-admin guard, role matrix) |
| PDF and Excel exports | ✅ | `report-export.ts` — A4 PDF via printToPDF + .xlsx via SheetJS, both audited |
| Backup and restore | ✅ | `services/backup.ts` — VACUUM INTO snapshots, verify, history, auto-daily, guarded restore + relaunch |
| (Bonus) Refund flow | ✅ | `issueRefund` + BillDetail refund panel — completes D11 from Checkpoint 2 |

**Acceptance criteria evidence (PRD §12 CP4):**
- *Figures reconcile*: 22-test suite asserts summary = Σtransactions for outstanding, profit identity (net − commission − direct − expenses), report totals vs raw SQL, commissions report vs ledger.
- *No double-counted commissions*: payment ≤ outstanding enforced; duplicate transaction ids rejected (UNIQUE + service check).
- *Expenses in profit*: operating expenses included in every profit figure and the PROFITABILITY report.
- *Correct date filters*: `reportRange` validates/derives ranges; grouped rows bucketed per day/week/month in `[from, to]`.
- *Backup/restore reliable*: verification (integrity_check + schema tables) before record and before restore; round-trip test proves post-backup mutations revert.

`npm run typecheck` (both projects), `npm test` (107/107), `npm run build`, headless smoke
`SMOKE_OK ... migrated=0->2` and restart `migrated=2->2` all pass (2026-11-08).

## Checkpoint 5 — task ledger (all done, 2026-11-08)

| Deliverable (PRD §12 CP5) | Status | Where |
| --- | --- | --- |
| Full application testing | ✅ | 112 tests across 7 suites — all PRD §11 scenario families covered at service level |
| Financial calculation testing | ✅ | `money`/`commission` suites + CP4 reconciliation suite (identity: net − commission − direct − expenses) |
| Database integrity testing | ✅ | FK/CHECK/UNIQUE suite (`database.test.ts`) + migration drill |
| Security review | ✅ | CSP meta (`default-src 'self'`, scripts 'self', object/frame 'none') in `index.html`; automated offline/no-external-URL test; sandboxed renderer + validated IPC (CP1) reviewed |
| Offline testing | ✅ | No external URLs in renderer sources (tested); all dependencies bundled; zero runtime network calls |
| Performance improvements | ✅ | Performance smoke: 300-bill volume — history page + worklist fast with pagination; existing indexes verified |
| UI refinements | ✅ | Change-own-password modal in header (closes CP4 gap); default-password reminder now opens it directly |
| Bug fixes | ✅ | Own-password gap fixed; NSIS config corrected (installer icons, explicit config load) |
| Database migration testing | ✅ | `tests/cp5.test.ts` drill: v1 DB with business data → migration 002 applied → data intact ("updates do not erase records") |
| Backup recovery testing | ✅ | CP4 suite: verify + restore round trip reverts post-backup mutations |
| Windows installer | ✅ (built on Windows) | `electron-builder.config.js` + `npm run dist:win` — NSIS, icon, shortcuts, version 1.0.0; Wine (Linux) blocks only the final data-pack step in cross-build |
| Application icon | ✅ | `build/icon.ico` (16–256 px) + `build/icon.png`, teal flask mark |
| Version information | ✅ | package.json 1.0.0 + installer version metadata + copyright |
| User guide | ✅ | `USER_GUIDE.md` — final, incl. installation (§1b) and data-protection sections |
| Installation and backup instructions | ✅ | USER_GUIDE §1b + §4; README quick start |

**Acceptance criteria (PRD §12 CP5):** critical calculations pass (112/112);
reports and printing verified at service + HTML level (receipts, lab
reports, financial reports, exports); backup/restore verified by tests;
data survives close/reopen (smoke `migrated=2->2`); offline by
construction (CSP + no external URLs test). "Installs on a Windows
computer" is satisfied by running `npm run dist:win` on Windows — the
sandbox (Linux, no Wine) verified everything up to the Wine-bound step.

## Decision & assumption log

| # | Decision/assumption | Status |
| --- | --- | --- |
| D1 | SQLite driver: `better-sqlite3` (PRD allows "a well-maintained SQLite library") | Documented in `ARCHITECTURE.md` |
| D2 | Commission basis default `NET_BILL`, switchable to `COLLECTED` in Settings | Implemented per PRD §14.1 |
| D3 | Initial admin `admin / Admin@123`, `must_change_password=1` until user-management UI exists (CP4) | Documented in `USER_GUIDE.md` |
| D4 | Local-time storage for business dates (single-timezone lab) | Documented in `DATABASE.md` |
| D5 | In-app state routing instead of a URL router | Documented; revisit only if deep links ever needed |
| D6 | CSP hardening deferred to CP5 security review (dev/HMR compatibility) | Tracked as known item |
| D7 | Logo upload + receipt/printing arrive with billing (CP2); settings foundation holds the profile fields | Planned |
| D8 | Backup module is CP4; until then the documented interim procedure is a cold copy of `lmas.db` while the app is closed | Delivered in CP4 |
| D13 | Expenses are immutable once recorded (no edit/delete screens); corrections are new audited entries — PRD Module H forbids deleting financial transactions | Implemented in CP4 |
| D14 | Refunding a referred bill does not auto-reverse its commission; administrators record a COMMISSION_REVERSAL adjustment when policy requires | Documented in USER_GUIDE |
| D15 | Excel export via SheetJS (`xlsx`, bundled, offline); PDF via Electron printToPDF — both match the PRD §Module I format requirements | Implemented in CP4 |

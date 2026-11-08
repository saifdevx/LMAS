# AGENTS.md — Instructions for the Coding Agent

## Project status

| Checkpoint | Scope | Status |
| --- | --- | --- |
| 1 — Foundation, planning, project setup | Architecture, DB, auth, layout, dashboard | **COMPLETE** (2026-11-08) |
| 2 — Patients, practitioners, tests, billing | Registration, visits, catalog, bills, payments, receipts | **COMPLETE** (2026-11-08) |
| 3 — Laboratory workflow & reports | Samples, results, verification, lab report printing | **COMPLETE** (2026-11-08) |
| 4 — Accounting, dashboard & administration | Commission ledger, expenses, reports, exports, users, backup | **COMPLETE** (2026-11-08) |
| 5 — Testing, refinement & installer | Hardening, performance, NSIS installer, user guide | **COMPLETE** (2026-11-08) — installer built on Windows via `npm run dist:win` |

**All checkpoints complete — LMAS v1.0.0.**

**Do not begin Checkpoint 2 without explicit approval of Checkpoint 1.**

## Commands

```bash
npm run dev          # develop
npm run typecheck    # must pass before any commit
npm test             # must pass before any checkpoint completion claim
npm run build        # production build
npm run smoke        # headless launch verification (built output)
npm run rebuild:deps # after npm install: rebind better-sqlite3 to Electron ABI
```

## Non-negotiable rules

1. Financial calculations exist ONLY in `src/shared/commission.ts` and
   `src/shared/money.ts`. Never compute money or commission inside a UI
   component or ad-hoc service. (The Billing page imports the same central
   module for live preview — display only; the server recomputes on save.)
2. All stored money is integer paisa; all rates are integer basis points.
   No floats in persisted financial values.
3. Never silently edit finalized bills, historical prices, commission
   snapshots, or delete financial transactions. Corrections go through
   `adjustments` / `refunds` with audit records.
4. Every mutation of financial data runs inside a DB transaction and writes
   an audit row.
5. The renderer never touches SQLite — only the typed preload bridge
   (`window.lmas`) → IPC handlers in `src/main/ipc/` (Zod-validated).
6. Migration files are append-only. Never edit an applied migration; add a
   new one and bump `MIGRATIONS` in `src/main/db/migrations.ts`.
7. Tests must be extended for every new module. Do not claim a feature works
   without a passing test or an explicitly recorded manual check.
8. Do not introduce cloud services, external APIs, or paid dependencies.

## Structure conventions

- `src/shared/` — pure logic shared by main and renderer (money, commission,
  permissions, API types). No Electron imports here.
- `src/main/` — main process: `db/`, `services/`, `ipc/`, `lib/`.
  Services: `auth`, `settings`, `dashboard`, `audit`, `patients`,
  `practitioners`, `tests` (catalog), `billing`, `receipt-html` (pure),
  `receipt-print` (Electron).
- `src/preload/` — the only bridge; keep it minimal and typed.
- `src/renderer/` — React UI; pages in `pages/`, primitives in
  `components/ui/`, routing table in `lib/navigation.ts`.
- Placeholder pages must stay clearly labelled with their target checkpoint
  (PRD §16.17) until implemented.

## Checkpoint 2 module notes

- **Billing transaction**: `createBill` writes visit + bill + items +
  commission ACCRUAL + initial payment in ONE transaction, snapshotting
  prices, rate and basis. `bills.commission_paisa` is the display figure on
  the net bill; the ACCRUAL ledger follows the active policy
  (NET_BILL → full accrual at finalization; COLLECTED → incremental accrual
  per payment).
- **Duplicate payments**: the renderer generates a `crypto.randomUUID()`
  transaction_id per attempt; the UNIQUE constraint rejects repeats.
- **Cancellation**: allowed only for payment-free bills → status CANCELLED,
  `adjustments` row (−net), REVERSAL commission entry, audit with reason.
  Paid-bill refunds arrive in Checkpoint 4.
- **Receipts**: pure HTML builder (testable) + hidden Electron window for
  `webContents.print` and `printToPDF` (thermal 80mm / A4).

## Checkpoint completion protocol

At the end of every checkpoint update: `IMPLEMENTATION_PLAN.md`, `TESTING.md`,
`CHANGELOG.md`, this file's status table, and produce the 8-item completion
report (implemented, files, working features, tests, bugs/limitations,
remaining tasks, run instructions, completeness statement).

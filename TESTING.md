# TESTING.md

Run everything with: `npm run typecheck && npm test` (and `npm run smoke` for a
launch check on a built output).

## 1. Automated results — Checkpoint 2 (2026-11-08)

| Suite | Result |
| --- | --- |
| TypeScript strict (main/preload/shared/tests) | ✅ pass |
| TypeScript strict (renderer) | ✅ pass |
| Vitest: `tests/money.test.ts` | ✅ 6 tests |
| Vitest: `tests/commission.test.ts` | ✅ 12 tests |
| Vitest: `tests/database.test.ts` | ✅ 18 tests |
| Vitest: `tests/billing.test.ts` (new, CP2) | ✅ 22 tests |
| **Total** | ✅ **58 passed, 0 failed, 0 skipped** |
| Production build (`electron-vite build`) | ✅ renderer 483 kB JS / 28 kB CSS |
| Headless launch smoke (Xvfb + Electron 33) | ✅ `SMOKE_OK user_version=1 users=1 migrated=0->1` (full CP2 IPC wiring loads) |
| Restart persistence smoke | ✅ `SMOKE_OK ... migrated=1->1 users=1` |

## 2. PRD §11 scenario coverage

| Scenario | Where validated | Status |
| --- | --- | --- |
| 1 Self patient (100% lab) | `tests/commission.test.ts` + `tests/billing.test.ts` (end-to-end via service) | ✅ |
| 2 Referred 50% split + ACCRUAL entry | `tests/billing.test.ts` | ✅ |
| 3 Different rate (40%) | `tests/billing.test.ts` | ✅ |
| 4 Discounted bill basis | `tests/billing.test.ts` (+ discount permission enforcement) | ✅ |
| 5 Partial patient payments | `tests/billing.test.ts` (1000+500+500 → PAID, overpay rejected) | ✅ |
| 6 Partial commission payment | `tests/commission.test.ts` (formula) | ✅ formula; ledger settlement in CP4 |
| 7 Rate change history | `tests/billing.test.ts` — old bill keeps 50% & entry; new bill at 40%; unchanged-rate & empty-reason rejected | ✅ |
| 8 Duplicate payment protection | `tests/billing.test.ts` + DB UNIQUE constraint | ✅ |
| 9 Refund flow | Cancellation of payment-free bills fully tested; paid-bill refunds arrive CP4 | 🟡 partial by design (D11) |
| 10 Restart persistence | Smoke restart: no re-migration, no duplicate seed | ✅ |
| Extra: net = subtotal − discount invariant | CHECK constraint test + service rejection test | ✅ |
| Extra: price snapshot immutability | `tests/billing.test.ts` (catalog change → old bills keep old price) | ✅ |
| Extra: COLLECTED basis incremental accrual | `tests/billing.test.ts` (80k then 40k collected → accruals 40k + 20k) | ✅ |
| Extra: settings/audit/login/dashboard | `tests/database.test.ts` | ✅ |
| Extra: receipt HTML mandatory fields | `tests/billing.test.ts` (A4 + thermal, escaping, totals, status) | ✅ |
| Extra: patient search modes | `tests/billing.test.ts` (name/phone/code/Urdu/bill-no/date) | ✅ |
| Extra: practitioner account reconciliation | `tests/billing.test.ts` | ✅ |

## 3. Manual / environment checks performed

- App boots to login screen; all 25 IPC channels register without error in the
  real Electron runtime (smoke covers main-process wiring).
- GPU warnings under Xvfb are headless artifacts, not app errors.
- Print dialogs and save dialogs require an interactive session — they are
  wired through Electron's standard `webContents.print` / `showSaveDialog`
  and were validated by construction + unit tests of the generated HTML;
  interactive print verification on target Windows hardware is planned for
  the Checkpoint 5 hardware pass.

## 4. Known limitations (Checkpoint 2 scope)

1. Refunds for PAID bills are not available until Checkpoint 4 — cancellation
   is limited to payment-free bills with a clear error message.
2. Commission *settlement* (paying practitioners) is Checkpoint 4; the
   practitioner account shows accrued/outstanding and full ledger already.
3. Test packages/panels are modelled as ordinary multi-test bills; a
   first-class "panel" entity can be added later without schema change.
4. Print layout fine-tuning on specific thermal printers lands in the
   Checkpoint 5 hardware pass.
5. CSP and Electron fuses hardening remain scheduled for CP5.

## 5. Automated results — Checkpoint 3 (2026-11-08)

| Suite | Result |
| --- | --- |
| TypeScript strict (main/preload/shared/tests) | ✅ pass |
| TypeScript strict (renderer) | ✅ pass |
| Vitest: `tests/money.test.ts` | ✅ 6 tests |
| Vitest: `tests/commission.test.ts` | ✅ 12 tests |
| Vitest: `tests/database.test.ts` | ✅ 18 tests |
| Vitest: `tests/billing.test.ts` | ✅ 22 tests |
| Vitest: `tests/lab.test.ts` (new, CP3) | ✅ 27 tests |
| **Total** | ✅ **85 passed, 0 failed, 0 skipped** |
| Production build (`electron-vite build`) | ✅ renderer 540 kB JS / 29 kB CSS |
| Headless launch smoke (Xvfb + Electron 33) | ✅ `SMOKE_OK user_version=2 users=1 migrated=0->2` (migration 002 lab workflow applied) |

CP3 coverage in `tests/lab.test.ts` maps to the PRD §12 CP3 acceptance
criteria: every billed test enters the workflow as PENDING (incl. idempotent
back-fill); status transitions PENDING → IN_PROGRESS → COMPLETED with illegal
moves rejected; cancellation requires a reason and is blocked for completed
tests; revision history recorded per save with user and timestamps; default
unit/range pre-fill from the catalog; verify → approve ladder with permission
denials for technician and receptionist; reset with reason audited; sample
lifecycle with reject/re-collect reasons; results isolated per patient/visit;
worklist filters (patient, test name, status); report data + A4 HTML fields
including Urdu RTL rendering and report history rows.

**Developer note (native ABI):** `better-sqlite3` is a native module and can
only be bound to one runtime at a time — `npm run rebuild:deps` targets
Electron, while `npm test` runs under system Node.js. After running
`rebuild:deps`, re-run `npm rebuild better-sqlite3` before `npm test`
(and vice versa before `npm run dev` / `npm run smoke`).

## 6. Automated results — Checkpoint 4 (2026-11-08)

| Suite | Result |
| --- | --- |
| TypeScript strict (main/preload/shared/tests) | ✅ pass |
| TypeScript strict (renderer) | ✅ pass |
| Vitest: all suites (`money` 6, `commission` 12, `database` 18, `billing` 22, `lab` 27) | ✅ 85 tests |
| Vitest: `tests/cp4.test.ts` (new, CP4) | ✅ 22 tests |
| **Total** | ✅ **107 passed, 0 failed, 0 skipped** |
| Production build (`electron-vite build`) | ✅ renderer 622 kB JS / 30 kB CSS |
| Headless launch smoke (Xvfb + Electron 33) | ✅ `SMOKE_OK user_version=2 users=1 migrated=0->2` |
| Restart persistence smoke | ✅ `SMOKE_OK ... migrated=2->2` |

CP4 coverage in `tests/cp4.test.ts` maps to the PRD §12 CP4 acceptance
criteria:

- **Figures reconcile with transactions**: financial summary outstanding =
  Σnet billed − Σpayments + Σrefunds (all-time); estimated net profit =
  net − commission − direct costs − operating expenses; monthly report
  totals equal the summary figures; commissions report equals the ledger;
  expenses report equals the expense list total; cash report totals equal
  Σpayment rows.
- **Commission payments never double-count**: payment > outstanding is
  rejected; duplicate transaction ids rejected (service + UNIQUE).
- **Expenses included in profit**: asserted in the profit identity test.
- **Correct date filters**: daily/monthly grouping buckets rows strictly
  within the range; out-of-range filters return empty.
- **Backup/restore work**: verified snapshot (integrity_check + required
  tables), garbage file rejected, restore round-trip reverts post-backup
  data while preserving earlier records.
- **Additional CP4 flows**: refunds (permission, over-refund, REFUNDED
  status), user management (dup username, password rules, last-admin
  guard, self-deactivation guard, inactive login blocked), audit trail
  presence for every CP4 action, HTML report contents (Urdu RTL, PKR)
  and a real .xlsx round trip via SheetJS.


## 7. Automated results — Checkpoint 5 / release 1.0.0 (2026-11-08)

| Suite | Result |
| --- | --- |
| TypeScript strict (both projects) | ✅ pass |
| Vitest: all suites incl. `tests/cp5.test.ts` (new) | ✅ **112 passed, 0 failed** (7 files) |
| Production build (`electron-vite build`) | ✅ renderer 626 kB JS / 30 kB CSS |
| Headless smoke (fresh DB) | ✅ `SMOKE_OK ... migrated=0->2` |
| Restart persistence smoke | ✅ `SMOKE_OK ... migrated=2->2` |
| Migration drill (v1 DB → migration 002) | ✅ business data preserved |
| Performance smoke (300 bills) | ✅ history + worklist under bounds |
| Offline verification | ✅ no external URLs in renderer sources (tested); CSP asserted |
| Windows NSIS installer | ✅ preconfigured (`npm run dist:win` on Windows); Linux cross-build verified up to the Wine-bound step |

CP5 tests (`tests/cp5.test.ts`): CSP present and strict; renderer sources
contain no external URLs; change-own-password (current-password check,
must-change flag cleared, audited, old password rejected afterwards);
migration drill; performance smoke.

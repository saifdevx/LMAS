# ACCOUNTING_RULES.md

This document is the single source of truth for LMAS financial behaviour.
Implementation lives exclusively in `src/shared/commission.ts` and
`src/shared/money.ts` (pure, unit-tested functions).

## 1. Money representation

- **Unit:** integer paisa. 1 PKR = 100 paisa. UI entry accepts rupees with up
  to 2 decimals; `toPaisa()` converts, rejects negatives and invalid input.
- **Rates:** integer basis points (50% = 5000 bp, 12.5% = 1250 bp).
- **Formatting:** `formatPKR(paisa)` → `PKR 2,000.00` (report standard,
  DD-MM-YYYY dates per PRD Module I).

## 2. Bill formulas (PRD §3.1)

```
Subtotal   = Σ line totals
Net Bill   = Subtotal − Discount            (discount > subtotal is rejected)
```

The `bills` table enforces `net_paisa = subtotal_paisa − discount_paisa` via a
CHECK constraint; the service layer rejects the same condition with a readable
error. Both original (list) price and charged price are stored per line.

## 3. Commission formulas (PRD §3.2)

```
Practitioner Commission = roundHalfUp(Eligible Amount × rateBp / 10000)
Laboratory Allocation   = Eligible Amount − Practitioner Commission
```

- **Self patient:** commission = 0; allocation = full eligible amount.
- **Referred patient:** rate comes from the **bill snapshot**
  (`bills.practitioner_rate_bp`), never from the practitioner's current
  setting — changing a rate cannot rewrite history (PRD §3.6, Scenario 7).
- **Eligible amount** follows the configured policy (`app.commissionBasis`):
  - `NET_BILL` (default) — net bill after discount. The full accrual is
    created in the same transaction that finalizes the bill.
  - `COLLECTED` — amount actually collected from the patient. The accrual is
    **incremental**: the initial payment creates an accrual on that amount,
    and every later payment adds an accrual on the newly collected amount,
    so at any moment accrued commission = rate × total collected for that
    bill. Full collection therefore converges to the same figure as the
    NET_BILL basis.
  The active policy is shown in Settings and stamped onto each bill
  (`bills.commission_basis`); the practitioner rate and basis are snapshots
  that later policy changes never rewrite.
- **Rounding:** commission is rounded half-up **to the paisa using integer
  arithmetic** (`floor(p/10000) + (p mod 10000 ≥ 5000)`); the laboratory
  allocation is computed as the **remainder**, so commission + allocation
  always equals the eligible amount exactly (PRD §3.2). Example:
  eligible PKR 1,000.01 at 50% → commission PKR 500.01, allocation PKR 500.00.

## 4. Distinct financial figures (PRD §3.3)

The system stores separately: gross billed, discounts, net billed, patient
payments received, outstanding patient balances, commission accrued, commission
paid, outstanding commission, direct test costs, operating expenses, estimated
net profit, and cash movement. A PKR 2,000 referred bill at 50% is **never**
recorded as PKR 2,000 laboratory profit — it is 1,000 allocation + 1,000
commission liability.

## 5. Balances (PRD §3.4, §3.5)

```
Outstanding Patient Balance = Net Bill − Total Valid Payments
Outstanding Commission      = Commission Accrued − Valid Commission Payments
```

- Payments carry a **unique transaction_id** (DB UNIQUE constraint) — a
  duplicate submit is impossible (PRD Scenario 8).
- Multiple partial payments per bill and per practitioner account are
  supported; each payment reduces the outstanding balance and never
  re-creates the underlying charge or commission expense.
- Commission **payments reduce liability only**; the expense is the ACCRUAL
  entry created once when the bill is finalized (NET_BILL basis) or as
  collections arrive (COLLECTED basis). Commission settlement (practitioner
  payments) lands in Checkpoint 4.
- **Cancellation** (payment-free bills only, until CP4 refunds): the bill
  becomes CANCELLED, an `adjustments` row records −net with the reason, and a
  REVERSAL commission entry cancels the accrual. Cancelled bills are excluded
  from all totals and reports.

## 6. Profitability vs cash flow (PRD §3.8)

```
Estimated Net Profit = Net Billed Revenue − Practitioner Commission
                       − Direct Test Costs − Operating Expenses
```

This is a **management figure**: billed revenue is not cash received. Cash
collections appear separately ("Collections received") and cash-flow reporting
will be a distinct report class in Checkpoint 4.

## 7. Refunds & corrections (PRD §14.3)

Refunds insert a `refunds` row and a signed `adjustments` entry; commission
reversal follows the **original bill's** snapshot policy/rate. No historical
transaction is deleted or rewritten; audit rows record actor, reason, and
old/new values. (Workflow UI lands in Checkpoints 2/4; the schema is ready.)

## 8. Category separation (PRD §2.3)

Self and referred figures are tagged on the **visit and bill** (never frozen
onto the patient profile) and reported independently everywhere: dashboard
cards (`Self-patient billed` / `Referred-patient billed`), visits
(`selfVisits` / `referredVisits`), and future reports.

## 9. Worked examples (all covered by tests)

| Scenario (PRD §11) | Input | Result |
| --- | --- | --- |
| 1 — Self | CBC 800 + Sugar 300 | Net 1,100 · commission 0 · lab 1,100 |
| 2 — Referred 50% | CBC 800 + Lipid 1,200 | commission 1,000 · lab 1,000 |
| 3 — Rate 40% | Bill 3,000 | commission 1,200 · lab 1,800 |
| 4 — Discount basis | 2,500 − 500 @50% | commission 1,000 · lab 1,000 |
| 5 — Partial patient pay | 2,000; pay 1,000 + 500 | received 1,500 · outstanding 500 |
| 6 — Partial commission pay | accrued 5,000; pay 2,000 | outstanding 3,000 |
| Rounding | 1,000.01 @50% | commission 500.01 · lab 500.00 |

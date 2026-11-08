# USER_GUIDE.md — For Laboratory Staff

Welcome to **LMAS v1.0.0**, your Laboratory Management & Accounting System.
This guide covers everything in the complete application.

## 1. Installing and starting the application

**Option A — installed version (recommended for the laboratory):**

1. On any Windows 10/11 computer, run `LMAS Setup 1.0.0.exe` (built with
   `npm run dist:win`, see the README) and follow the wizard — you can
   install for yourself only or for all users.
2. Start **LMAS** from the desktop or start-menu shortcut. The application
   never needs an internet connection.
3. Your data lives in `C:\Users\<you>\AppData\Roaming\LMAS\lmas.db` —
   safely outside the program folder, so updates and reinstalls never
   erase your records.

**Option B — developer mode (from the source folder):**

1. Install Node.js 20 or newer (`https://nodejs.org` — the LTS version).
2. Open a terminal in the project folder and run:
   ```
   npm install
   npm run rebuild:deps
   npm run dev
   ```
3. In developer mode the data folder is `dev-data\` next to the project.

## 1b. Backing up and moving to a new computer

- Use **Backup & Restore** (sidebar) — one click writes a verified backup
  into the data folder's `backups/` directory; an automatic backup also
  runs on the first launch of each day.
- To move the laboratory to a new computer: install LMAS there, copy the
  most recent backup file over, open **Backup & Restore → Restore** and
  pick it. The app restarts with all patients, bills and history intact.
- Extra safety: occasionally copy the whole data folder to a USB drive
  while the application is closed.

## 2. First sign-in

| Field | Value |
| --- | --- |
| Username | `admin` |
| Password | `Admin@123` |

The app shows a reminder while the default password is in use — click it (or
the key icon in the header) to set your own password immediately. Give every
staff member their own account in **User Management**.

## 3. What you can do (complete system)

### Daily front-desk workflow (Checkpoint 2)

A normal patient visit now works end to end:

1. **Patients → Register patient** (or *New Registration* in the sidebar).
   Enter the name in English and optionally in Urdu, age, gender, phone.
   The patient receives a permanent ID like `PAT-2026-0001`.
2. **Billing** in the sidebar: search and select the patient, choose
   **Self** (walk-in) or **Referred** (pick the doctor — their current
   commission rate is shown and will be locked to this bill), add one or more
   tests by searching the catalog, optionally apply a discount (permission
   required), and type the amount received now (cash by default — partial
   payments are fine).
3. The preview shows the net bill, the practitioner's commission and the
   laboratory's share before you save. **Save bill** stores everything in one
   atomic step and issues a receipt number like `BILL-2026-0001`.
4. Print the receipt (**Thermal** or **A4**) or **Save PDF** from the
   confirmation screen.
5. Later payments: **Bills History** → open the bill → *Record a payment*.
   The balance updates and the bill becomes *Partially paid* then *Paid*.
6. Mistakes: a bill with **no payments** can be cancelled with a reason
   (permission required) — the cancellation and any commission reversal are
   recorded in the audit trail. Bills that already have payments will use the
   refund process arriving in Checkpoint 4.

### Laboratory workflow (Checkpoint 3)

After a bill is saved, every test on it automatically appears in **Test Results**
(the laboratory worklist) with status **Pending**:

1. **Worklist** — search by patient name, ID, Urdu name, visit or bill number
   or test name; filter by date and status (Pending / In progress / Completed /
   Cancelled). The row shows test counts, sample codes and the patient's age,
   gender and referring doctor.
2. **Open a bill** to start laboratory work:
   - **Sample tracking** — record each sample (blood, urine, …) with an
     automatic code like `SMP-2026-0001`, the collector and the collection
     time, then walk it forward: Not collected → Collected → Received →
     Processing → Completed. Rejecting or re-requesting a sample always asks
     for a reason.
   - **Result entry** — type the value; unit and reference range pre-fill from
     the test catalog (administrators maintain them per test — the system
     never invents a range). Every save keeps a revision, and the revision
     history (who changed what, when, old value → new value) stays with the
     test forever.
3. **Verification ladder** — a saved result moves Pending → In progress;
   marking it **Completed** requires a value. A user with approve permission
   then **Verifies** it and finally **Approves** it. Verified/approved results
   are locked; a supervisor can still **Reset** one back to draft — always
   with a reason, always audited.
4. **Report** — once results exist, print the laboratory report (**A4**) or
   **Save PDF**. The report carries the lab identity, patient details (English
   and Urdu, RTL-rendered), sample codes, each test's value with unit and
   reference range, entered-by / verified-by names and a signature line.
   Cancelled tests print as *Cancelled* and pending ones as *Pending* — rows
   are never silently dropped. Every issued report is remembered in the
   report history with its code (`RPT-2026-0001`), who generated it and when.
5. **Patient history** — the patient profile lists every laboratory test the
   patient ever had across all visits, with its value and latest report.

### Commission management (Checkpoint 4)

Every practitioner's commission in one place: **accrued**, **paid** and
**outstanding** (always accrued − paid, so money can never be counted
twice). Open **Ledger** to see every accrual, adjustment, reversal and
payment with the bills behind them. **Pay** records a commission payment —
it cannot exceed the outstanding amount, duplicate transaction ids are
rejected, and everything is audited.

### Expenses (Checkpoint 4)

Record laboratory expenses (rent, salaries, electricity, reagents…) under
categories you manage. Filter by date, category or free text; the period
total is always visible. Expense entries are permanent — corrections are
recorded as new entries, never deletions.

### Financial reports (Checkpoint 4)

Eleven reports with PDF and Excel (.xlsx) export:

| Report | Shows |
| --- | --- |
| Daily / Weekly / Monthly | Billed, collected, commission, costs, expenses and profit per period |
| Financial summary (custom range) | The complete Module G figure set |
| Self / Referred patient | Per-bill rows for each category with outstanding |
| Practitioner commissions | Accrued / paid / outstanding per doctor |
| Expenses | Totals per category |
| Outstanding balances | Every bill with an open balance, ready for follow-up calls |
| Cash collections | Every payment received, grouped by method |
| Profitability | Monthly net profit breakdown |

PDF exports use the laboratory identity, PKR amounts and DD-MM-YYYY dates;
Excel exports open directly in Excel. Cancelled bills are excluded
everywhere. Both exports are recorded in the audit trail.

### Refunds (Checkpoint 4)

Bills that already have payments can be **refunded** (permission
`refunds.issue`) from the bill window: enter the amount and reason; the
bill is marked *Refunded* once the refunded amount reaches what was
actually received. Refunding does not automatically reverse the doctor's
commission — ask the administrator to record a reversal if needed.

### Transaction history (Checkpoint 4)

The complete money ledger: patient payments, commission payments,
expenses, refunds and adjustments. Filter by type, date range or free
text; money-in and money-out totals update live. Entries are read-only —
corrections always appear as separate reversal records.

### User management & audit log (Checkpoint 4)

- Add users, assign roles (Administrator / Receptionist / Technician),
  set passwords, require a change at next login, deactivate accounts.
- Guards: you cannot deactivate your own account, and the last active
  Administrator can never be removed or demoted.
- The **Audit log** tab lists every important action (who, what, when,
  old → new value, reason) and is searchable.

### Backup & restore (Checkpoint 4)

- **Back up now** writes a verified snapshot into the data folder's
  `backups/` directory; an automatic backup also runs on the first launch
  of each day.
- Every backup is integrity-checked before it is recorded in the history.
- **Restore** replaces the current database with a chosen backup — after
  a clear warning and an automatic safety copy of the live database, the
  application restarts itself.

### Patients
- Search by patient ID, name (English or Urdu), phone, registration date
  (type `YYYY-MM-DD`) or even a bill number.
- The patient profile shows every visit and bill, the full payment history,
  and a financial summary (billed / paid / outstanding).

### Practitioners
- Add doctors and clinics with their commission percentage (default 50%).
- Changing a rate always asks for a reason and never changes old bills — each
  bill keeps the rate that was valid when it was made.
- **Account** shows, per doctor: referred visits and bills, eligible revenue,
  commission accrued, commission still owed, the complete commission ledger
  and the rate history. Paying practitioners arrives in Checkpoint 4.

### Laboratory tests
- Build your catalog: name, code (automatic if left blank), category, price,
  optional direct laboratory cost, sample type and turnaround hours.
- Deactivated tests stay in history but disappear from new bills.
- Changing a price never changes old bills — they keep the original prices.

### Dashboard
- Switch the period: **Today · Yesterday · Last 7 days · This month · Custom**.
- Patient, test and financial cards now fill in automatically from real bills
  and payments, always separating **Self** and **Referred** figures.

### Settings (administrators)
- **Laboratory profile:** name, address, phone, email, report header, receipt
  footer, and logo upload — all used on receipts.
- **Financial defaults:** the default practitioner commission percentage
  (PRD default 50%) and the active commission policy — *net bill after
  discount* (default) or *amount actually collected*. The active policy is
  always displayed here and stamped onto each bill.
- **Numbering prefixes** for bills, patients and reports.

### Navigation
The sidebar implements the complete planned system (PRD §5.2): Operations,
Finance and Administration. Entries appear only when your role has the
matching permission — nothing is hidden or faked.

### Who sees what
| Role | Sees |
| --- | --- |
| Administrator | Everything: commission payments, expenses, all reports, user management, backup & restore, verification/approval, settings |
| Receptionist | Dashboard, patients, billing & payments, refunds, bills history, catalog (view), practitioner directory (view), financial reports, transaction history |
| Technician | Dashboard, patients (view), catalog (view), sample tracking, result entry, reports; verification/approval requires the administrator |

## 4. Protecting your data

Use **Backup & Restore** in the sidebar: one click creates a verified
backup. An automatic backup also runs on the first launch of each day.
Keep a periodic copy of the whole data folder (`dev-data\` in development,
`%APPDATA%\LMAS` when installed) on a USB drive for extra safety.

## 5. Good to know

- Urdu patient names are supported at registration and printed on receipts.
- A patient can visit directly on one day and be referred by a doctor on
  another — the category is chosen per visit, not stored permanently on the
  patient.
- The system keeps gross billed, discounts, net billed, collections,
  commissions and expenses as **separate figures** — the dashboard labels make
  clear what is money received versus money billed.
- All times use this computer's local clock; dates print as DD-MM-YYYY and
  money as `PKR 2,000.00` style amounts.
- Old bills never change: if you edit a test price or a doctor's commission
  tomorrow, yesterday's receipts stay exactly as they were.

## 6. If something goes wrong

| Problem | What to do |
| --- | --- |
| App does not start | Run `npm run rebuild:deps` once, then `npm run dev` again. |
| "Session has expired" | Sign in again; sessions last 12 hours. |
| "You do not have permission…" | Your role restricts that action; ask the administrator. |
| "Duplicate payment blocked" | That payment was already recorded — check the bill's payment list before trying again. |
| Wrong name/setting saved | Corrections are always recorded — nothing is silently overwritten; administrators can review the audit trail. |

## 7. Release notes

This is **LMAS v1.0.0** — the complete system: patients, billing and
receipts, laboratory workflow with reports, commissions, expenses,
financial reports with PDF/Excel export, transaction history, users and
audit trail, and backup & restore. See `CHANGELOG.md` for the full history
and `IMPLEMENTATION_PLAN.md` for how the product was delivered.

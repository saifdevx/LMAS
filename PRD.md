# Product Requirements Document (PRD)
## Laboratory Management & Accounting System (LMAS)

**Project Type:** Windows Desktop Application  
**Business Domain:** Medical Diagnostic Laboratory  
**Location:** Dera Ismail Khan, Khyber Pakhtunkhwa, Pakistan  
**Currency:** Pakistani Rupee (PKR)  
**Primary Language:** English  
**Additional Language Support:** Urdu and English patient names  
**Operating Mode:** Offline-first  
**Document Version:** 1.0  
**Development Approach:** AI-assisted / Vibe Coding  
**Target:** A reliable, professional application replacing the laboratory's manual registers, notebooks, and calculator.

---

# 1. Project Overview

## 1.1 Product Vision

Build a complete Laboratory Management and Accounting System (LMAS) for a medical diagnostic laboratory in Dera Ismail Khan, Pakistan.

The laboratory currently manages patients, laboratory tests, billing, practitioner commissions, expenses, and financial records manually.

The application must computerize these operations through a simple, professional, and easy-to-use Windows desktop interface.

The system must maintain accurate patient records, manage laboratory tests, generate bills and reports, automatically calculate practitioner commissions, and provide reliable financial reporting.

The application must work without an internet connection and permanently store all records locally.

## 1.2 Primary Objectives

1. Replace manual patient registration with computerized patient records.
2. Manage laboratory tests, prices, and results.
3. Generate bills and receipts automatically.
4. Separate self patients from referred patients.
5. Automatically calculate practitioner commissions.
6. Track payments received and payments made to practitioners.
7. Manage laboratory expenses and calculate profitability.
8. Generate daily, weekly, and monthly financial reports.
9. Maintain complete transaction histories and audit logs.
10. Provide automatic backups and restoration.
11. Make the system simple enough for non-technical laboratory staff.

## 1.3 Target Users

**Administrator / Laboratory Owner**
- Full application access.
- Manage patients, tests, doctors, billing, and expenses.
- Manage practitioner commission settings.
- View all financial reports.
- Manage users and permissions.
- Perform backups and restoration.
- View audit logs.

**Receptionist / Billing Staff**
- Register patients.
- Create bills.
- Receive patient payments.
- Print receipts.
- Search patient records.
- View permitted patient and billing information.

**Laboratory Technician**
- View assigned laboratory tests.
- Update sample and test status.
- Enter test results.
- Prepare laboratory reports.
- View relevant patient information.

**Practitioner Account Management**
- Track referrals.
- View commission balances.
- Record commission payments.
- Generate practitioner statements.

Practitioner management is initially performed by authorized laboratory staff. External doctor logins are not required in Version 1.

---

# 2. Core Business Structure

The laboratory has two patient categories.

## 2.1 Category A — Self Patients

Self patients visit the laboratory directly.

Business rules:
- No referring practitioner is required.
- The laboratory receives 100% of the test charges.
- No referral commission is generated.
- Their financial records must remain separately identifiable.
- Self-patient income must be displayed separately in reports.

Example:

| Description | Amount |
|---|---:|
| Test charges | PKR 2,000 |
| Practitioner commission | PKR 0 |
| Laboratory allocation | PKR 2,000 |

The laboratory's allocation is not automatically its net profit. Test costs and operating expenses must still be deducted.

## 2.2 Category B — Referred Patients

Referred patients are sent by doctors, clinics, or medical practitioners.

Business rules:
- A referring practitioner must be selected.
- The default commission rate is 50%.
- The commission rate must be configurable for each practitioner.
- The commission must be calculated automatically.
- The system must maintain separate records for each practitioner.
- The laboratory's share and practitioner commission must be displayed independently.

Example:

| Description | Amount |
|---|---:|
| Total test charges | PKR 2,000 |
| Practitioner commission (50%) | PKR 1,000 |
| Laboratory allocation (50%) | PKR 1,000 |

The system must also support different rates, such as 40%, 45%, or 60%.

## 2.3 Patient Category Separation

This is a critical requirement.

The system must never mix self-patient and referred-patient financial records.

Every patient visit/bill must have a clearly identifiable category:
- Self
- Referred

The dashboard and reports must always provide separate figures for these categories.

A patient may visit directly on one occasion and be referred on another. Therefore, patient category should belong to the visit or bill, not permanently to the patient profile.

---

# 3. Financial and Accounting Rules

Financial calculations are among the most important parts of this application.

The application must use a centralized financial calculation service. Individual screens must not implement their own independent commission or payment calculations.

## 3.1 Bill Calculation

Each bill can contain multiple laboratory tests.

Example:

| Test | Price |
|---|---:|
| CBC | PKR 800 |
| Blood Sugar | PKR 300 |
| Lipid Profile | PKR 1,200 |
| **Subtotal** | **PKR 2,300** |
| Discount | PKR 300 |
| **Net Bill** | **PKR 2,000** |

Formula:

`Net Bill = Subtotal - Discount`

Discounts must never produce a negative bill.

The application must store the original test prices and the final prices charged.

## 3.2 Commission Calculation

For a referred patient:

`Practitioner Commission = Eligible Commission Amount × Commission Rate`

`Laboratory Allocation = Eligible Commission Amount - Practitioner Commission`

For a self patient:

`Practitioner Commission = 0`

`Laboratory Allocation = Eligible Commission Amount`

The commission calculation must use the actual bill-level commission policy configured by the administrator.

**Initial configurable policy:**
- Default basis: net bill amount after discounts.
- Alternative basis: amount actually collected from the patient.

The administrator must be able to select the policy. The application must clearly show which policy is active.

Commission calculations must be rounded to two decimal places. The laboratory allocation must be calculated as the remainder to prevent rounding discrepancies.

## 3.3 Important Accounting Distinctions

The application must maintain separate records for:

1. Gross billed amount.
2. Discounts.
3. Net billed amount.
4. Patient payments received.
5. Outstanding patient balances.
6. Practitioner commission accrued.
7. Practitioner commission paid.
8. Outstanding practitioner commission.
9. Laboratory direct costs.
10. Operating expenses.
11. Net profit.
12. Cash received and cash paid.

These figures must not be confused.

For example, a PKR 2,000 referred bill with 50% commission must not automatically be recorded as PKR 2,000 of laboratory profit.

## 3.4 Partial and Full Patient Payments

The application must support:
- Full payment.
- Partial payment.
- Unpaid bills.
- Multiple payments against one bill.
- Payment method selection.
- Payment date and time.
- Payment transaction history.

Example:

| Description | Amount |
|---|---:|
| Bill amount | PKR 2,000 |
| First payment | PKR 1,000 |
| Second payment | PKR 500 |
| Total received | PKR 1,500 |
| Outstanding patient balance | PKR 500 |

Formula:

`Outstanding Patient Balance = Net Bill - Total Valid Payments`

The system must never count the same payment twice.

A payment must have a unique transaction ID and must be linked to the relevant bill.

## 3.5 Practitioner Commission Management

Each practitioner must have:
- Practitioner ID.
- Doctor/practitioner name.
- Clinic name.
- Contact number.
- Address (optional).
- Commission percentage.
- Active/inactive status.
- Registration date.
- Notes.

The practitioner account must display:
- Total referred patients.
- Total referred bills.
- Total eligible revenue.
- Total commission accrued.
- Total commission paid.
- Outstanding commission balance.

Example:

| Description | Amount |
|---|---:|
| Total commission accrued | PKR 15,000 |
| Commission paid | PKR 10,000 |
| Outstanding commission | PKR 5,000 |

Formula:

`Outstanding Commission = Commission Accrued - Valid Commission Payments`

The system must support:
- Full commission payment.
- Partial commission payment.
- Multiple commission payments.
- Payment date.
- Payment method.
- Reference number.
- Printable practitioner payment receipt.
- Practitioner account statement.

Commission payments must reduce the outstanding liability. They must not create the commission expense a second time.

## 3.6 Commission Rate History

Commission percentages may change over time.

The application must save the commission rate applied to each bill when that bill is finalized.

Changing a practitioner's current commission percentage must not modify historical bills or their commission calculations.

## 3.7 Laboratory Expenses

The application must include an expense management module.

Expense fields:
- Expense ID.
- Expense category.
- Description.
- Amount.
- Date.
- Payment method.
- Reference number.
- Notes.
- Created by.

Suggested expense categories:
- Electricity.
- Rent.
- Staff salaries.
- Laboratory supplies.
- Reagents and chemicals.
- Equipment maintenance.
- Internet and telephone.
- Transportation.
- Miscellaneous.

The administrator must be able to add and edit expense categories.

Expense records must be included in financial reports.

## 3.8 Laboratory Test Costs

Each laboratory test may optionally have a direct laboratory cost.

Example:

| Description | Amount |
|---|---:|
| Patient test price | PKR 1,000 |
| Direct laboratory cost | PKR 250 |

The cost field is optional and can be configured for individual tests.

Reports must distinguish between:
- Test revenue.
- Practitioner commission.
- Direct test costs.
- Operating expenses.
- Estimated profit.

**Initial profitability calculation:**

`Net Profit = Net Billed Revenue - Practitioner Commission - Direct Test Costs - Operating Expenses`

This is a management-reporting calculation. The system must not describe billed revenue as cash received.

Cash-flow reports must be separate from profitability reports.

---

# 4. Application Modules

## Module A — Dashboard

The dashboard is the application's home screen.

It must display:

### Today's Overview
- Total patients today.
- Self patients today.
- Referred patients today.
- Total tests booked today.
- Completed tests.
- Pending tests.
- In-progress tests.

### Financial Overview
- Today's gross billed amount.
- Today's discounts.
- Today's net billed amount.
- Today's actual collections.
- Self-patient billed amount.
- Referred-patient billed amount.
- Practitioner commission accrued.
- Practitioner commission paid.
- Outstanding practitioner commission.
- Outstanding patient balances.
- Total expenses.
- Estimated net profit.

### Dashboard Filters
- Today.
- Yesterday.
- Last 7 days.
- This month.
- Custom date range.

All financial figures must respect the selected reporting period.

Dashboard cards must be clickable where practical, opening the corresponding filtered records.

## Module B — Patient Management

### Patient Registration

Fields:
- Automatically generated Patient ID.
- Patient name.
- Age.
- Gender.
- Contact number.
- Optional address.
- Registration date and time.
- Notes.

Patient names must support English and Urdu text.

### Patient Search

Search by:
- Patient ID.
- Patient name.
- Phone number.
- Date.
- Bill number.

### Patient Profile

Display:
- Patient information.
- Visit history.
- Previous bills.
- Tests performed.
- Test results and reports.
- Payment history.
- Outstanding balances.

A patient must be allowed to have multiple visits.

Each visit must have its own category, bill, tests, and payment records.

## Module C — Doctor / Practitioner Management

Features:
- Add practitioner.
- Edit practitioner.
- Activate/deactivate practitioner.
- Configure commission percentage.
- Search practitioner.
- View referral history.
- View commission account.
- Record commission payment.
- Generate statements.

The practitioner profile must show a complete financial summary.

## Module D — Laboratory Test Management

The administrator must be able to create and manage a laboratory test catalog.

Test fields:
- Test ID.
- Test name.
- Test code.
- Category.
- Patient price.
- Direct laboratory cost (optional).
- Sample type (optional).
- Instructions (optional).
- Estimated turnaround time (optional).
- Active/inactive status.

Features:
- Add tests.
- Edit tests.
- Change prices.
- Deactivate tests.
- Search tests.
- Organize tests into categories.
- Support test packages or panels.
- Support multiple tests in one bill.

Changing a test's current price must not change previously finalized bills.

Deleted or deactivated tests must remain identifiable in historical records.

## Module E — Billing and Invoicing

This is a core module and should be extremely easy to use.

### New Bill Workflow

1. Search for an existing patient or register a new one.
2. Select patient category.
3. If referred, select practitioner.
4. Add one or more laboratory tests.
5. Automatically calculate subtotal.
6. Apply discount if authorized.
7. Calculate net bill.
8. Display commission and laboratory allocation.
9. Enter amount received.
10. Save bill.
11. Generate and print receipt.

### Bill Information

- Automatically generated bill number.
- Patient ID.
- Visit ID.
- Patient category.
- Practitioner (if applicable).
- Test details.
- Test prices.
- Subtotal.
- Discount.
- Net bill.
- Commission percentage.
- Practitioner commission.
- Laboratory allocation.
- Amount received.
- Outstanding amount.
- Payment status.
- Date and time.
- Created by.

### Bill Status

- Draft.
- Finalized.
- Partially Paid.
- Paid.
- Cancelled.
- Refunded (where applicable).

Finalized bills must not be silently edited.

Corrections must use an authorized adjustment, cancellation, or refund process with an audit record.

### Receipt Printing

Support:
- A4 printing.
- Small thermal receipt printers.
- PDF generation.

Receipt must include:
- Laboratory name and logo.
- Address and contact details.
- Receipt/bill number.
- Date and time.
- Patient information.
- Patient category.
- Referring practitioner, if applicable.
- Test names.
- Individual prices.
- Subtotal.
- Discount.
- Total amount.
- Amount received.
- Remaining balance.
- Payment status.

Receipt templates should be configurable.

## Module F — Laboratory Workflow

The system must track the progress of laboratory tests.

### Test Status

- Pending.
- In Progress.
- Completed.
- Cancelled.

### Sample Tracking

Each test may have:
- Sample ID.
- Sample type.
- Collection date and time.
- Sample status.
- Assigned technician.
- Notes.

Suggested sample statuses:
- Not Collected.
- Collected.
- Received.
- Rejected.
- Processing.
- Completed.

### Result Entry

Authorized staff must be able to:
- Open a patient's pending test.
- Enter test results.
- Add observations.
- Add remarks.
- Save results.
- Edit results before final approval.

The application must maintain a history of changes.

### Result Verification

The application should support:
- Draft results.
- Verified results.
- Approved reports.

Only authorized users should be allowed to verify or approve results.

The system must record the user and time of verification.

### Laboratory Reports

Generate printable laboratory reports containing:
- Laboratory information.
- Patient information.
- Patient ID.
- Report ID.
- Test name.
- Test result.
- Units.
- Reference ranges.
- Remarks.
- Sample information where applicable.
- Report date.
- Technician/verifier information.
- Authorized signature area.

Test-specific reference ranges and units must be configurable and validated by qualified laboratory personnel.

Do not invent medical reference ranges or automatically diagnose patients.

## Module G — Financial Management

Provide a dedicated financial section.

### Financial Summary

Display:
- Total billed revenue.
- Total discounts.
- Total collected payments.
- Total outstanding patient balances.
- Self-patient revenue.
- Referred-patient revenue.
- Commission accrued.
- Commission paid.
- Outstanding commission.
- Direct laboratory costs.
- Operating expenses.
- Estimated net profit.

### Financial Reports

The user must be able to generate:
- Daily financial report.
- Weekly financial report.
- Monthly financial report.
- Custom date-range report.
- Self-patient financial report.
- Referred-patient financial report.
- Practitioner commission report.
- Expense report.
- Patient outstanding balance report.
- Cash collection report.
- Profitability report.

All reports must support PDF and Excel export.

## Module H — Transaction History

Maintain a complete transaction history.

Transaction types:
- Patient payment.
- Practitioner commission payment.
- Laboratory expense.
- Refund.
- Bill adjustment.
- Discount adjustment.

Each transaction must contain:
- Unique transaction ID.
- Transaction type.
- Amount.
- Date and time.
- Related bill or practitioner.
- Payment method.
- Reference number.
- Created by.
- Notes.

The system must prevent accidental duplicate transactions.

Financial transactions must not be permanently deleted through normal application screens.

Corrections should be handled through authorized reversal or adjustment records.

## Module I — Reports and Exports

All major modules should provide search, filters, and exports.

Supported formats:
- PDF.
- Excel (.xlsx).

Reports should use:
- PKR currency formatting.
- DD-MM-YYYY date format.
- Clear totals.
- Professional print layouts.

Urdu text must be displayed correctly wherever Urdu content is included.

## Module J — Settings

Administrator settings:

### Laboratory Profile
- Laboratory name.
- Logo.
- Address.
- Phone number.
- Email (optional).
- Report header.
- Receipt footer.

### Application Settings
- Currency: PKR.
- Date format: DD-MM-YYYY.
- Default commission percentage: 50%.
- Commission calculation policy.
- Default discount permissions.
- Bill numbering.
- Patient ID numbering.
- Report numbering.

### User Management
- Add users.
- Edit users.
- Change passwords.
- Activate/deactivate users.
- Assign roles.
- Configure permissions.

### Backup and Restore
- Manual backup.
- Automatic daily backup.
- Restore from backup.
- Backup location selection.
- Backup history.
- Backup verification.

The application must warn users before restoring a backup because restoration may replace the current database.

---

# 5. User Interface and Experience

The application must look like professional desktop business software, not a basic website placed inside a desktop window.

## 5.1 Design Direction

Use a clean, modern, professional medical/business dashboard.

Design principles:
- Simple navigation.
- Clear typography.
- Consistent spacing.
- Professional colors.
- Readable tables.
- Fast patient search.
- Minimal unnecessary animations.
- Clear financial summaries.
- Easy-to-understand forms.
- Responsive layout for different Windows screen sizes.

Suggested visual direction:
- Light background.
- White content cards.
- Dark navy or slate sidebar.
- Subtle blue/teal accents.
- Clear green indicators for completed/paid.
- Orange indicators for pending.
- Red indicators for unpaid, rejected, or critical warnings.

Avoid excessive gradients, unnecessary decorative elements, and complicated dashboards.

## 5.2 Main Navigation

Recommended sidebar:

1. Dashboard
2. Patients
3. New Registration
4. Billing
5. Bills History
6. Laboratory Tests
7. Test Results
8. Practitioners
9. Commission Management
10. Expenses
11. Financial Reports
12. Transaction History
13. User Management
14. Backup & Restore
15. Settings

Navigation visibility must respect user permissions.

## 5.3 Usability Requirements

- Search fields should be easy to access.
- Forms must have clear labels.
- Required fields must be indicated.
- Validation messages must explain what needs correction.
- Tables should support sorting and filtering.
- Important actions must request confirmation.
- Keyboard navigation should be supported.
- Patient registration and billing should require minimal steps.
- Financial totals should be visually prominent.
- Users must receive clear success and error messages.

---

# 6. Database Requirements

Use SQLite for the initial single-computer offline deployment.

Use a structured relational database with foreign keys, constraints, indexes, and transactions.

Recommended database entities:

| Entity | Purpose |
|---|---|
| Users | Application accounts |
| Roles | User roles and permissions |
| Patients | Patient profiles |
| Visits | Individual patient visits |
| Practitioners | Doctors and clinics |
| PractitionerCommissionHistory | Historical commission rates |
| TestCategories | Laboratory test categories |
| LaboratoryTests | Test catalog and current prices |
| Bills | Bill headers |
| BillItems | Individual tests on a bill |
| Samples | Sample collection and tracking |
| TestResults | Laboratory test results |
| Payments | Patient payment transactions |
| PractitionerCommissionEntries | Commission accrued and adjustments |
| PractitionerPayments | Commission payments |
| Expenses | Laboratory expenses |
| ExpenseCategories | Expense categories |
| Refunds | Refund records |
| AuditLogs | User action history |
| ApplicationSettings | Application configuration |
| BackupHistory | Backup records |

## 6.1 Critical Database Rules

1. Every primary entity must have a unique ID.
2. Financial records must use appropriate decimal-safe money handling, preferably integer minor units (paisa) or another rigorously tested exact-money representation.
3. Foreign key constraints must be enabled.
4. Financial operations must use database transactions.
5. Historical bill items must preserve the test name, code, price, and relevant details at the time of billing.
6. Historical commission records must preserve the applied rate and calculation basis.
7. A patient must be able to have multiple visits.
8. A visit must be associated with a patient category.
9. Referred visits must be associated with a practitioner.
10. A finalized bill must not be silently overwritten.
11. Financial corrections must be traceable.
12. Database migrations must preserve existing records.

## 6.2 Suggested Relationships

- One patient can have many visits.
- One visit can have one or more bills, subject to the billing workflow design.
- One bill can contain many bill items.
- One bill can have multiple payment transactions.
- One practitioner can refer many visits.
- One practitioner can have many commission entries.
- One practitioner can receive multiple commission payments.
- One visit can contain multiple samples and test records.
- One test record can have multiple result revisions.
- One user can create many transactions and audit events.

The coding agent must produce a complete entity relationship diagram before implementing the database.

---

# 7. Technical Architecture

## 7.1 Recommended Technology Stack

| Layer | Technology |
|---|---|
| Desktop framework | Electron |
| Frontend | React |
| Programming language | TypeScript |
| Build tool | Vite |
| UI styling | Tailwind CSS |
| UI components | shadcn/ui |
| Backend | Electron main process / Node.js |
| Database | SQLite |
| Database access | Prisma or a well-maintained SQLite library |
| Validation | Zod |
| Charts | Recharts |
| PDF generation | Suitable local PDF generation library |
| Excel export | ExcelJS or equivalent |
| Testing | Vitest |
| End-to-end testing | Playwright |
| Packaging | electron-builder |

The agent must evaluate Electron-compatible versions of libraries before selecting them.

Do not introduce unnecessary cloud services, external APIs, or paid services.

## 7.2 Application Architecture

Use a modular architecture.

Recommended modules:
- Authentication.
- Patient management.
- Practitioner management.
- Laboratory tests.
- Billing.
- Payments.
- Commission accounting.
- Expenses.
- Laboratory workflow.
- Reports.
- Audit logging.
- Backup management.
- Settings.

Business logic must be separated from UI components.

Financial calculations must be centralized in tested services.

The frontend must never directly modify the SQLite database.

All database operations should pass through validated application services and secure IPC communication.

## 7.3 Offline Requirements

The application must:
- Start without internet.
- Register patients without internet.
- Create bills without internet.
- Record payments without internet.
- Manage tests and results without internet.
- Generate reports without internet.
- Print receipts without internet.
- Create backups without internet.

Do not make core functionality dependent on external APIs.

## 7.4 Data Storage

Store the SQLite database in the Windows application data directory, not inside the installation folder.

Application updates must not erase or overwrite the existing database.

The application must be able to upgrade database schemas safely through migrations.

## 7.5 Security

- Password-protected login.
- Secure password hashing using an established password-hashing algorithm.
- Role-based access control.
- Protected financial operations.
- Input validation.
- Secure Electron configuration.
- Context isolation.
- No unnecessary Node.js access from the renderer.
- Audit logging.
- Safe backup handling.

The administrator must be able to control which users can modify bills, issue refunds, change commission rates, record expenses, and approve laboratory results.

---

# 8. Audit Logging

The system must maintain an audit log for important actions.

Examples:
- Patient registration.
- Patient information updates.
- Bill creation.
- Bill cancellation.
- Payment entry.
- Refund.
- Commission rate changes.
- Commission payment.
- Expense entry.
- Test price changes.
- Test result modifications.
- Report approval.
- User creation.
- Permission changes.
- Backup restoration.

Each audit record should include:
- User ID.
- Action.
- Entity type.
- Entity ID.
- Date and time.
- Previous value where appropriate.
- New value where appropriate.
- Reason for correction where applicable.

Normal users must not be able to modify or delete audit records.

---

# 9. Backup and Recovery

Backup is essential because the laboratory's entire working history will be stored in the application.

Requirements:
- Daily automatic backup.
- Manual backup button.
- Configurable backup directory.
- Backup timestamp.
- Backup history.
- Restore from selected backup.
- Validation before restoration.
- Clear confirmation before replacing current records.
- Error messages if backup creation fails.
- Preserve database integrity during backup.

The application should use a safe SQLite backup mechanism rather than simply copying a live database file while it is being written.

Do not store backups only in the installation directory.

---

# 10. Non-Functional Requirements

## Performance
- Application should open quickly.
- Search should remain responsive with large patient histories.
- Tables should support pagination or efficient loading.
- Financial reports should calculate accurately.
- Database queries should use appropriate indexes.

## Reliability
- Avoid losing data during unexpected shutdowns.
- Use database transactions for financial operations.
- Prevent duplicate payments.
- Validate financial calculations.
- Provide clear error handling.
- Maintain data integrity.

## Maintainability
- Modular project structure.
- Reusable UI components.
- Centralized business logic.
- Type-safe implementation.
- Database migrations.
- Documented configuration.
- Automated tests.

## Usability
- Suitable for non-technical laboratory staff.
- Clear forms and labels.
- Simple billing process.
- Easy report generation.
- Clear financial summaries.
- Minimal unnecessary steps.

---

# 11. Important Business Scenarios to Test

The coding agent must implement automated tests for these scenarios.

## Scenario 1 — Self Patient

Bill:
- CBC: PKR 800.
- Blood Sugar: PKR 300.
- Total: PKR 1,100.
- No discount.

Expected:
- Net bill: PKR 1,100.
- Commission: PKR 0.
- Laboratory allocation: PKR 1,100.

## Scenario 2 — Referred Patient

Bill:
- CBC: PKR 800.
- Lipid Profile: PKR 1,200.
- Total: PKR 2,000.
- Commission rate: 50%.

Expected:
- Commission: PKR 1,000.
- Laboratory allocation: PKR 1,000.

## Scenario 3 — Different Commission Rate

Bill:
- Total: PKR 3,000.
- Practitioner commission rate: 40%.

Expected:
- Commission: PKR 1,200.
- Laboratory allocation: PKR 1,800.

## Scenario 4 — Discounted Referred Bill

Bill:
- Subtotal: PKR 2,500.
- Discount: PKR 500.
- Net bill: PKR 2,000.
- Commission rate: 50%.
- Commission basis: net bill after discount.

Expected:
- Commission: PKR 1,000.
- Laboratory allocation: PKR 1,000.

## Scenario 5 — Partial Patient Payment

Bill:
- Total: PKR 2,000.
- First payment: PKR 1,000.
- Second payment: PKR 500.

Expected:
- Total received: PKR 1,500.
- Outstanding balance: PKR 500.

## Scenario 6 — Partial Practitioner Payment

Commission accrued:
- PKR 5,000.

Payment:
- PKR 2,000.

Expected:
- Commission paid: PKR 2,000.
- Outstanding commission: PKR 3,000.

## Scenario 7 — Commission Rate Change

A practitioner has an existing finalized bill at 50%.

The administrator changes their current commission rate to 40%.

Expected:
- Historical bill remains at 50%.
- New eligible bills use 40%.
- Historical commission balance does not change.

## Scenario 8 — Duplicate Payment Protection

Attempt to submit the same payment transaction twice.

Expected:
- The system must prevent duplicate posting.
- The patient's balance must remain correct.

## Scenario 9 — Refund

A finalized bill is partially refunded.

Expected:
- The original bill remains in history.
- The refund is recorded separately.
- Financial balances are adjusted through a traceable reversal or adjustment.
- Related commission entries are adjusted according to the configured commission policy.
- No historical transaction is silently erased.

## Scenario 10 — Application Restart

Create patient records, bills, payments, expenses, and commission entries.

Close and reopen the application.

Expected:
- All records remain available.
- Financial balances remain unchanged.
- No duplicate transactions are created.

---

# 12. Development Plan — Five Checkpoints

Development must be completed in five major checkpoints.

Do not attempt to implement the entire application in one generation.

Each checkpoint must produce working code, documentation, and tests.

## Checkpoint 1 — Foundation, Planning and Project Setup

Deliverables:
- Finalized project architecture.
- Database design.
- Entity relationship diagram.
- Financial calculation specifications.
- Project folder structure.
- Electron + React + TypeScript setup.
- Professional application layout.
- Sidebar navigation.
- Dashboard UI foundation.
- SQLite connection.
- Database migrations.
- Authentication foundation.
- Initial user roles.
- Application settings foundation.

Acceptance criteria:
- Application launches on Windows.
- Login works.
- Database is created in the correct location.
- Navigation works.
- Database survives application restart.
- No internet is required for startup.

## Checkpoint 2 — Patients, Practitioners, Tests and Billing

Deliverables:
- Patient registration.
- Patient search.
- Patient profile.
- Patient visit management.
- Self/referred patient categorization.
- Practitioner management.
- Commission rate configuration.
- Test catalog.
- Test pricing.
- Bill creation.
- Multiple tests per bill.
- Discounts.
- Patient payments.
- Partial payments.
- Commission calculation.
- Bill history.
- Receipt printing.
- PDF receipts.

Acceptance criteria:
- Both patient categories work correctly.
- Commission calculations pass all relevant tests.
- Partial payments work.
- Historical prices and commission rates remain unchanged.
- Bills and receipts can be generated.
- No duplicate payments.

## Checkpoint 3 — Laboratory Workflow and Reports

Deliverables:
- Sample tracking.
- Test status management.
- Result entry.
- Result editing and history.
- Result verification.
- Report approval.
- Laboratory report generation.
- A4 report printing.
- PDF reports.
- Patient test history.

Acceptance criteria:
- Test statuses update correctly.
- Results remain associated with the correct patient and visit.
- Unauthorized users cannot approve results.
- Report history is maintained.
- Urdu and English patient names display correctly.

## Checkpoint 4 — Accounting, Dashboard and Administration

Deliverables:
- Practitioner commission ledger.
- Practitioner commission payments.
- Outstanding commission.
- Laboratory expense management.
- Financial dashboard.
- Daily/weekly/monthly reports.
- Profitability reports.
- Patient outstanding balances.
- Transaction history.
- Audit logs.
- User permissions.
- PDF and Excel exports.
- Backup and restore.

Acceptance criteria:
- All financial figures reconcile with their underlying transactions.
- Commission payments do not double-count commission expenses.
- Expenses are included in profit calculations.
- Reports use the correct date filters.
- Backup and restore work reliably.

## Checkpoint 5 — Testing, Refinement and Windows Installer

Deliverables:
- Full application testing.
- Financial calculation testing.
- Database integrity testing.
- Security review.
- Offline testing.
- Performance improvements.
- UI refinements.
- Bug fixes.
- Database migration testing.
- Backup recovery testing.
- Windows installer.
- Application icon.
- Version information.
- User guide.
- Installation and backup instructions.

Acceptance criteria:
- Application installs on a Windows computer.
- Application runs without internet.
- Data remains after closing and reopening.
- Updates do not erase records.
- All critical calculations pass tests.
- Reports and printing work.
- Backup and restoration work.
- No known critical bugs remain.

---

# 13. Scope Boundaries

The first release should focus on the requirements already provided by the laboratory owner.

Do not unnecessarily expand the application.

### Included in Version 1
- Patient management.
- Self and referred categories.
- Practitioner management.
- Test management.
- Billing.
- Commission calculations.
- Payment tracking.
- Laboratory expenses.
- Laboratory test workflow.
- Test results.
- Reports.
- Financial management.
- Dashboard.
- Audit logs.
- User permissions.
- Backup and restore.
- Windows installer.
- Offline functionality.

### Not Required Initially
- Online patient portal.
- Mobile application.
- Cloud synchronization.
- Multiple laboratory branches.
- Online payment gateways.
- SMS gateway integration.
- WhatsApp API integration.
- External doctor accounts.
- AI-based medical diagnosis.
- Automatic integration with laboratory equipment.
- Advanced inventory management.

These may be considered in future versions if the client requests them.

---

# 14. Assumptions and Configurable Decisions

The following points are not fully established by the client's requirements.

The first version should support them through settings or clearly documented defaults.

1. Commission calculation basis:
   - Default: net bill after discount.
   - Alternative: actual amount collected.

2. Commission recognition:
   - The system should maintain accrued commission and paid commission separately.
   - The selected commission policy must be documented and consistently applied.

3. Refunds:
   - Refunds must create traceable financial adjustments.
   - Commission reversal must follow the original bill's commission policy.

4. Test pricing:
   - Historical bills retain their original prices.
   - New bills use current prices.

5. Direct laboratory costs:
   - Optional per test.
   - Must be configurable.

6. User accounts:
   - Initial administrator account.
   - Additional users can be created as required.

7. Deployment:
   - First deployment targets one Windows computer.
   - Multi-computer access is a future architecture decision.

8. Medical reports:
   - The laboratory owner must approve report templates, units, and reference ranges before real-world use.

The coding agent must not silently invent additional business rules.

When an implementation decision affects financial correctness, document it and make it configurable where practical.

---

# 15. Final Product Definition

The completed application should allow laboratory staff to manage the entire daily workflow from one Windows desktop application.

A typical working day should look like this:

1. Open the application and log in.
2. View today's dashboard.
3. Register a new patient or search for an existing patient.
4. Select Self or Referred.
5. Select the practitioner if the patient is referred.
6. Add the requested tests.
7. Generate the bill.
8. Automatically calculate commission and laboratory allocation.
9. Record the patient's payment.
10. Print the receipt.
11. Track sample collection and laboratory progress.
12. Enter and verify results.
13. Generate the final laboratory report.
14. Record practitioner commission payments.
15. Record laboratory expenses.
16. Review daily financial performance.
17. Automatically back up the database.

**Final goal:** Replace the laboratory's manual registers and calculator with a reliable, accurate, professional, and easy-to-use Laboratory Management and Accounting System.

The application must prioritize data integrity, financial accuracy, offline reliability, and ease of use over unnecessary features or visual complexity.

---

# 16. Instructions for the AI Development Agent

You are responsible for implementing this PRD as a senior full-stack software engineer and software architect.

Follow these instructions throughout development:

1. Read this complete PRD before making implementation decisions.
2. Do not start by generating the entire application in one response.
3. Begin with Checkpoint 1.
4. Create a clear implementation plan before writing code.
5. Produce the database schema and relationship diagram before implementing business modules.
6. Implement financial calculations as centralized, independently tested services.
7. Never hardcode commission percentages into UI components.
8. Never silently change historical financial records.
9. Never delete financial transaction history to correct mistakes.
10. Preserve existing functionality when adding new features.
11. Use reusable components and modular architecture.
12. Keep the code readable and maintainable.
13. Run tests after every major implementation.
14. Do not claim a feature works without testing it.
15. Avoid unnecessary dependencies and paid services.
16. Do not use mock data as a substitute for actual database functionality in completed modules.
17. Clearly distinguish implemented features from placeholders.
18. Keep the application functional after each checkpoint.
19. Update project documentation as the application evolves.
20. Maintain a record of unresolved assumptions and decisions.

## Required Project Documentation

Create and maintain:

- `PRD.md` — Product requirements.
- `AGENTS.md` — Instructions for the coding agent.
- `ARCHITECTURE.md` — Application architecture.
- `DATABASE.md` — Database schema and relationships.
- `ACCOUNTING_RULES.md` — Financial rules and formulas.
- `IMPLEMENTATION_PLAN.md` — Checkpoint progress.
- `TESTING.md` — Test cases and results.
- `CHANGELOG.md` — Changes between versions.
- `USER_GUIDE.md` — Instructions for laboratory staff.

## Checkpoint Completion Rule

At the end of every checkpoint, provide:

1. What was implemented.
2. Files created or modified.
3. Features that are working.
4. Tests performed and their results.
5. Known bugs or limitations.
6. Remaining tasks.
7. Instructions for running the application.
8. A clear statement that the checkpoint is complete or incomplete.

Do not begin the next checkpoint until the current checkpoint has been reviewed and approved.

**Start with Checkpoint 1 only. Do not proceed to Checkpoint 2 automatically.**

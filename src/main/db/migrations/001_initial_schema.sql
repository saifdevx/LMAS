-- LMAS initial schema (Checkpoint 1) — implements the full entity model from PRD §6.
-- Conventions:
--   * Money columns are INTEGER PAISA (1 PKR = 100 paisa) — never floats.
--   * Commission rates are INTEGER BASIS POINTS (50% = 5000).
--   * Timestamps are TEXT 'YYYY-MM-DD HH:MM:SS' local time; pure dates are 'YYYY-MM-DD'.
--   * Hard DELETE of financial rows is not exposed by the application layer.

-- ============================== AUTH / ADMIN ==============================

CREATE TABLE roles (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  description TEXT NOT NULL DEFAULT ''
);

CREATE TABLE permissions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT NOT NULL UNIQUE,
  module TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT ''
);

CREATE TABLE role_permissions (
  role_id INTEGER NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  permission_id INTEGER NOT NULL REFERENCES permissions(id) ON DELETE CASCADE,
  PRIMARY KEY (role_id, permission_id)
);

CREATE TABLE users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT NOT NULL UNIQUE COLLATE NOCASE,
  password_hash TEXT NOT NULL,
  full_name TEXT NOT NULL,
  role_id INTEGER NOT NULL REFERENCES roles(id),
  is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
  must_change_password INTEGER NOT NULL DEFAULT 0 CHECK (must_change_password IN (0, 1)),
  created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
  last_login_at TEXT,
  created_by INTEGER REFERENCES users(id)
);

CREATE TABLE audit_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER REFERENCES users(id),
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT,
  old_value TEXT,   -- JSON snapshot where applicable
  new_value TEXT,   -- JSON snapshot where applicable
  reason TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
);
CREATE INDEX idx_audit_time ON audit_logs(created_at);
CREATE INDEX idx_audit_user ON audit_logs(user_id);
CREATE INDEX idx_audit_entity ON audit_logs(entity_type, entity_id);

CREATE TABLE application_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
  updated_by INTEGER REFERENCES users(id)
);

CREATE TABLE backup_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  file_path TEXT NOT NULL,
  file_size INTEGER,
  backup_type TEXT NOT NULL CHECK (backup_type IN ('MANUAL', 'AUTO')),
  status TEXT NOT NULL DEFAULT 'OK' CHECK (status IN ('OK', 'FAILED')),
  verified INTEGER NOT NULL DEFAULT 0 CHECK (verified IN (0, 1)),
  created_by INTEGER REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
);

-- ============================== PATIENTS ==============================

CREATE TABLE patients (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  patient_code TEXT NOT NULL UNIQUE,
  full_name TEXT NOT NULL,
  full_name_urdu TEXT,                -- Urdu names supported (PRD §Module B)
  age INTEGER CHECK (age IS NULL OR (age >= 0 AND age <= 150)),
  gender TEXT NOT NULL CHECK (gender IN ('MALE', 'FEMALE', 'OTHER')),
  phone TEXT,
  address TEXT,
  notes TEXT,
  is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
  created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
  created_by INTEGER REFERENCES users(id)
);
CREATE INDEX idx_patients_name ON patients(full_name);
CREATE INDEX idx_patients_phone ON patients(phone);

-- One patient can have many visits; category belongs to the VISIT, not the
-- patient profile (PRD §2.3: a patient may visit directly once and be
-- referred on another occasion).
CREATE TABLE visits (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  visit_code TEXT NOT NULL UNIQUE,
  patient_id INTEGER NOT NULL REFERENCES patients(id),
  category TEXT NOT NULL CHECK (category IN ('SELF', 'REFERRED')),
  practitioner_id INTEGER REFERENCES practitioners(id),
  visit_date TEXT NOT NULL,
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
  created_by INTEGER REFERENCES users(id),
  CHECK (category = 'SELF' OR practitioner_id IS NOT NULL)  -- referred visits need a practitioner
);
CREATE INDEX idx_visits_patient ON visits(patient_id);
CREATE INDEX idx_visits_date ON visits(visit_date);
CREATE INDEX idx_visits_practitioner ON visits(practitioner_id);

-- ============================== PRACTITIONERS ==============================

CREATE TABLE practitioners (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  practitioner_code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  clinic_name TEXT,
  phone TEXT,
  address TEXT,
  commission_rate_bp INTEGER NOT NULL CHECK (commission_rate_bp >= 0 AND commission_rate_bp <= 10000),
  is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
  notes TEXT,
  registered_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
  created_by INTEGER REFERENCES users(id)
);
CREATE INDEX idx_practitioners_name ON practitioners(name);

-- Rate history: changing the current rate never rewrites historical bills
-- (PRD §3.6, Scenario 7).
CREATE TABLE practitioner_commission_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  practitioner_id INTEGER NOT NULL REFERENCES practitioners(id),
  rate_bp INTEGER NOT NULL CHECK (rate_bp >= 0 AND rate_bp <= 10000),
  effective_from TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
  changed_by INTEGER REFERENCES users(id),
  reason TEXT
);
CREATE INDEX idx_pch_practitioner ON practitioner_commission_history(practitioner_id);

-- ============================== TEST CATALOG ==============================

CREATE TABLE test_categories (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  description TEXT NOT NULL DEFAULT '',
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1))
);

CREATE TABLE laboratory_tests (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  test_code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  category_id INTEGER REFERENCES test_categories(id),
  price_paisa INTEGER NOT NULL CHECK (price_paisa >= 0),
  direct_cost_paisa INTEGER CHECK (direct_cost_paisa IS NULL OR direct_cost_paisa >= 0),
  sample_type TEXT,
  instructions TEXT,
  tat_hours INTEGER,
  is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
  created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
);
CREATE INDEX idx_tests_name ON laboratory_tests(name);
CREATE INDEX idx_tests_category ON laboratory_tests(category_id);

-- ============================== BILLING ==============================

CREATE TABLE bills (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  bill_number TEXT NOT NULL UNIQUE,
  visit_id INTEGER NOT NULL REFERENCES visits(id),
  patient_id INTEGER NOT NULL REFERENCES patients(id),
  category TEXT NOT NULL CHECK (category IN ('SELF', 'REFERRED')),
  practitioner_id INTEGER REFERENCES practitioners(id),
  practitioner_rate_bp INTEGER,               -- snapshot at finalization (PRD §3.6)
  commission_basis TEXT CHECK (commission_basis IN ('NET_BILL', 'COLLECTED')),
  subtotal_paisa INTEGER NOT NULL CHECK (subtotal_paisa >= 0),
  discount_paisa INTEGER NOT NULL DEFAULT 0 CHECK (discount_paisa >= 0),
  net_paisa INTEGER NOT NULL CHECK (net_paisa >= 0),
  commission_paisa INTEGER NOT NULL DEFAULT 0 CHECK (commission_paisa >= 0),
  lab_allocation_paisa INTEGER NOT NULL DEFAULT 0 CHECK (lab_allocation_paisa >= 0),
  status TEXT NOT NULL DEFAULT 'DRAFT'
    CHECK (status IN ('DRAFT', 'FINALIZED', 'PARTIALLY_PAID', 'PAID', 'CANCELLED', 'REFUNDED')),
  bill_date TEXT NOT NULL,
  notes TEXT,
  created_by INTEGER REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
  finalized_at TEXT,
  CHECK (net_paisa = subtotal_paisa - discount_paisa),        -- PRD §3.1
  CHECK (category = 'SELF' OR practitioner_id IS NOT NULL)
);
CREATE INDEX idx_bills_visit ON bills(visit_id);
CREATE INDEX idx_bills_patient ON bills(patient_id);
CREATE INDEX idx_bills_date ON bills(bill_date);
CREATE INDEX idx_bills_status ON bills(status);
CREATE INDEX idx_bills_practitioner ON bills(practitioner_id);

-- Line items snapshot name/code/prices at billing time (PRD §6.1 rule 5).
CREATE TABLE bill_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  bill_id INTEGER NOT NULL REFERENCES bills(id) ON DELETE CASCADE,
  test_id INTEGER REFERENCES laboratory_tests(id),
  test_name TEXT NOT NULL,
  test_code TEXT NOT NULL,
  list_price_paisa INTEGER NOT NULL CHECK (list_price_paisa >= 0),  -- catalog price at billing
  price_paisa INTEGER NOT NULL CHECK (price_paisa >= 0),            -- price actually charged
  direct_cost_paisa INTEGER CHECK (direct_cost_paisa IS NULL OR direct_cost_paisa >= 0),
  line_total_paisa INTEGER NOT NULL CHECK (line_total_paisa >= 0)
);
CREATE INDEX idx_bill_items_bill ON bill_items(bill_id);
CREATE INDEX idx_bill_items_test ON bill_items(test_id);

-- Patient payments: unique transaction_id is the duplicate-payment guard
-- (PRD §3.4, Scenario 8).
CREATE TABLE payments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  transaction_id TEXT NOT NULL UNIQUE,
  bill_id INTEGER NOT NULL REFERENCES bills(id),
  amount_paisa INTEGER NOT NULL CHECK (amount_paisa > 0),
  method TEXT NOT NULL CHECK (method IN ('CASH', 'BANK_TRANSFER', 'CARD', 'MOBILE_WALLET', 'CHEQUE')),
  reference_number TEXT,
  paid_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
  received_by INTEGER REFERENCES users(id),
  notes TEXT
);
CREATE INDEX idx_payments_bill ON payments(bill_id);
CREATE INDEX idx_payments_date ON payments(paid_at);

-- ============================== COMMISSION LEDGER ==============================

-- Accrual happens once per finalized bill; commission payments reduce the
-- outstanding liability and never re-create the expense (PRD §3.5).
CREATE TABLE practitioner_commission_entries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  bill_id INTEGER NOT NULL REFERENCES bills(id),
  practitioner_id INTEGER NOT NULL REFERENCES practitioners(id),
  entry_type TEXT NOT NULL CHECK (entry_type IN ('ACCRUAL', 'ADJUSTMENT', 'REVERSAL')),
  basis TEXT NOT NULL CHECK (basis IN ('NET_BILL', 'COLLECTED')),
  rate_bp INTEGER NOT NULL CHECK (rate_bp >= 0 AND rate_bp <= 10000),
  eligible_paisa INTEGER NOT NULL CHECK (eligible_paisa >= 0),
  commission_paisa INTEGER NOT NULL,          -- signed: negative for reversals
  created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
  created_by INTEGER REFERENCES users(id),
  notes TEXT
);
CREATE INDEX idx_pce_practitioner ON practitioner_commission_entries(practitioner_id);
CREATE INDEX idx_pce_bill ON practitioner_commission_entries(bill_id);
CREATE INDEX idx_pce_date ON practitioner_commission_entries(created_at);

CREATE TABLE practitioner_payments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  transaction_id TEXT NOT NULL UNIQUE,
  practitioner_id INTEGER NOT NULL REFERENCES practitioners(id),
  amount_paisa INTEGER NOT NULL CHECK (amount_paisa > 0),
  method TEXT NOT NULL CHECK (method IN ('CASH', 'BANK_TRANSFER', 'CARD', 'MOBILE_WALLET', 'CHEQUE')),
  reference_number TEXT,
  paid_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
  paid_by INTEGER REFERENCES users(id),
  notes TEXT
);
CREATE INDEX idx_pp_practitioner ON practitioner_payments(practitioner_id);
CREATE INDEX idx_pp_date ON practitioner_payments(paid_at);

-- ============================== LABORATORY WORKFLOW ==============================

CREATE TABLE samples (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  sample_code TEXT NOT NULL UNIQUE,
  visit_id INTEGER NOT NULL REFERENCES visits(id),
  sample_type TEXT,
  status TEXT NOT NULL DEFAULT 'NOT_COLLECTED'
    CHECK (status IN ('NOT_COLLECTED', 'COLLECTED', 'RECEIVED', 'REJECTED', 'PROCESSING', 'COMPLETED')),
  collected_at TEXT,
  assigned_technician_id INTEGER REFERENCES users(id),
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
);
CREATE INDEX idx_samples_visit ON samples(visit_id);
CREATE INDEX idx_samples_status ON samples(status);

CREATE TABLE test_results (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  bill_item_id INTEGER NOT NULL REFERENCES bill_items(id) ON DELETE CASCADE,
  sample_id INTEGER REFERENCES samples(id),
  status TEXT NOT NULL DEFAULT 'PENDING'
    CHECK (status IN ('PENDING', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED')),
  result_state TEXT NOT NULL DEFAULT 'DRAFT' CHECK (result_state IN ('DRAFT', 'VERIFIED', 'APPROVED')),
  value TEXT,
  unit TEXT,
  reference_range TEXT,
  observations TEXT,
  remarks TEXT,
  entered_by INTEGER REFERENCES users(id),
  entered_at TEXT,
  verified_by INTEGER REFERENCES users(id),
  verified_at TEXT,
  approved_by INTEGER REFERENCES users(id),
  approved_at TEXT,
  updated_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
);
CREATE INDEX idx_results_item ON test_results(bill_item_id);
CREATE INDEX idx_results_status ON test_results(status);

-- Full revision history for result edits (PRD Module F).
CREATE TABLE result_revisions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  result_id INTEGER NOT NULL REFERENCES test_results(id) ON DELETE CASCADE,
  revision_no INTEGER NOT NULL,
  value TEXT,
  unit TEXT,
  reference_range TEXT,
  observations TEXT,
  remarks TEXT,
  changed_by INTEGER REFERENCES users(id),
  changed_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
  UNIQUE (result_id, revision_no)
);

-- ============================== EXPENSES / CORRECTIONS ==============================

CREATE TABLE expense_categories (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1))
);

CREATE TABLE expenses (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  expense_code TEXT NOT NULL UNIQUE,
  category_id INTEGER NOT NULL REFERENCES expense_categories(id),
  description TEXT NOT NULL,
  amount_paisa INTEGER NOT NULL CHECK (amount_paisa > 0),
  expense_date TEXT NOT NULL,
  method TEXT NOT NULL CHECK (method IN ('CASH', 'BANK_TRANSFER', 'CARD', 'MOBILE_WALLET', 'CHEQUE')),
  reference_number TEXT,
  notes TEXT,
  created_by INTEGER REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
);
CREATE INDEX idx_expenses_date ON expenses(expense_date);
CREATE INDEX idx_expenses_category ON expenses(category_id);

CREATE TABLE adjustments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  adjustment_code TEXT NOT NULL UNIQUE,
  bill_id INTEGER NOT NULL REFERENCES bills(id),
  adjustment_type TEXT NOT NULL CHECK (adjustment_type IN ('DISCOUNT_ADJUSTMENT', 'BILL_ADJUSTMENT', 'COMMISSION_REVERSAL')),
  amount_paisa INTEGER NOT NULL,              -- signed
  reason TEXT NOT NULL,
  created_by INTEGER REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
);
CREATE INDEX idx_adjustments_bill ON adjustments(bill_id);

CREATE TABLE refunds (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  refund_code TEXT NOT NULL UNIQUE,
  bill_id INTEGER NOT NULL REFERENCES bills(id),
  amount_paisa INTEGER NOT NULL CHECK (amount_paisa > 0),
  reason TEXT NOT NULL,
  method TEXT NOT NULL CHECK (method IN ('CASH', 'BANK_TRANSFER', 'CARD', 'MOBILE_WALLET', 'CHEQUE')),
  created_by INTEGER REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
);
CREATE INDEX idx_refunds_bill ON refunds(bill_id);

-- ============================== UNIFIED TRANSACTION HISTORY (PRD Module H) ==============================

CREATE VIEW v_transaction_history AS
SELECT p.transaction_id AS txn_id, 'PATIENT_PAYMENT' AS txn_type, p.amount_paisa,
       p.paid_at AS txn_at, p.method, p.reference_number,
       'bill:' || p.bill_id AS related_ref, p.notes, p.received_by AS user_id
  FROM payments p
UNION ALL
SELECT pp.transaction_id, 'COMMISSION_PAYMENT', pp.amount_paisa,
       pp.paid_at, pp.method, pp.reference_number,
       'practitioner:' || pp.practitioner_id, pp.notes, pp.paid_by
  FROM practitioner_payments pp
UNION ALL
SELECT e.expense_code, 'EXPENSE', e.amount_paisa,
       e.created_at, e.method, e.reference_number,
       'expense_category:' || e.category_id, e.notes, e.created_by
  FROM expenses e
UNION ALL
SELECT r.refund_code, 'REFUND', r.amount_paisa,
       r.created_at, r.method, NULL,
       'bill:' || r.bill_id, r.reason, r.created_by
  FROM refunds r
UNION ALL
SELECT a.adjustment_code, 'ADJUSTMENT', a.amount_paisa,
       a.created_at, NULL, NULL,
       'bill:' || a.bill_id, a.reason, a.created_by
  FROM adjustments a;

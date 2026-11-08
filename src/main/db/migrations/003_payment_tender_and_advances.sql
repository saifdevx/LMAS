-- Preserve the amount physically received separately from the amount applied to a bill.
ALTER TABLE payments ADD COLUMN tendered_paisa INTEGER NOT NULL DEFAULT 0 CHECK (tendered_paisa >= 0);
ALTER TABLE payments ADD COLUMN change_paisa INTEGER NOT NULL DEFAULT 0 CHECK (change_paisa >= 0);
UPDATE payments SET tendered_paisa = amount_paisa;

-- Excess non-cash bank transfers are patient liabilities (credit), not bill revenue.
CREATE TABLE patient_advances (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  patient_id INTEGER NOT NULL REFERENCES patients(id),
  source_payment_id INTEGER NOT NULL UNIQUE REFERENCES payments(id),
  amount_paisa INTEGER NOT NULL CHECK (amount_paisa > 0),
  remaining_paisa INTEGER NOT NULL CHECK (remaining_paisa >= 0 AND remaining_paisa <= amount_paisa),
  method TEXT NOT NULL CHECK (method = 'BANK_TRANSFER'),
  reference_number TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
  created_by INTEGER REFERENCES users(id),
  notes TEXT
);
CREATE INDEX idx_patient_advances_patient ON patient_advances(patient_id);

-- Show patient advances as their own money-in ledger entries, separate from bill payments.
DROP VIEW IF EXISTS v_transaction_history;
CREATE VIEW v_transaction_history AS
SELECT p.transaction_id AS txn_id, 'PATIENT_PAYMENT' AS txn_type, p.amount_paisa,
       p.paid_at AS txn_at, p.method, p.reference_number,
       'bill:' || p.bill_id AS related_ref, p.notes, p.received_by AS user_id
  FROM payments p
UNION ALL
SELECT 'ADV-' || pa.id, 'PATIENT_ADVANCE', pa.amount_paisa,
       pa.created_at, pa.method, pa.reference_number,
       'patient:' || pa.patient_id, pa.notes, pa.created_by
  FROM patient_advances pa
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

-- LMAS migration 002 (Checkpoint 3) — Laboratory workflow and reports.
-- Adds:
--   * lab_reports        — immutable history of every issued report (PRD §12 CP3
--                          acceptance criterion "Report history is maintained").
--   * laboratory_tests.default_unit / default_reference_range — configurable,
--                          qualified-personnel-maintained defaults that pre-fill
--                          result entry (PRD §Module F: ranges must be
--                          configurable; the system never invents them).
--   * workflow indexes used by the laboratory worklist.

CREATE TABLE lab_reports (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  report_code TEXT NOT NULL UNIQUE,
  bill_id INTEGER NOT NULL REFERENCES bills(id),
  kind TEXT NOT NULL CHECK (kind IN ('PRINT', 'PDF')),
  file_path TEXT,
  generated_by INTEGER REFERENCES users(id),
  generated_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
);
CREATE INDEX idx_lab_reports_bill ON lab_reports(bill_id);
CREATE INDEX idx_lab_reports_date ON lab_reports(generated_at);

ALTER TABLE laboratory_tests ADD COLUMN default_unit TEXT;
ALTER TABLE laboratory_tests ADD COLUMN default_reference_range TEXT;

CREATE INDEX idx_test_results_state ON test_results(result_state);
CREATE INDEX idx_test_results_sample ON test_results(sample_id);
CREATE INDEX idx_result_revisions_result ON result_revisions(result_id);

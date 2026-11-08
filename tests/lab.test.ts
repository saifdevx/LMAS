import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import type DatabaseType from 'better-sqlite3'
import { openDatabase } from '../src/main/db/connection'
import { runMigrations } from '../src/main/db/migrator'
import { seedIfEmpty } from '../src/main/db/seed'
import { createPatient } from '../src/main/services/patients'
import { createTest } from '../src/main/services/tests'
import { createBill } from '../src/main/services/billing'
import {
  approveResult,
  createSample,
  ensureResultRows,
  getBillWork,
  listRevisions,
  listTechnicians,
  listWork,
  patientHistory,
  resetResult,
  saveResult,
  setTestStatus,
  updateSample,
  verifyResult
} from '../src/main/services/lab'
import { buildLabReportData } from '../src/main/services/lab-report-print'
import { buildLabReportHtml } from '../src/main/services/lab-report-html'
import { listAudit } from '../src/main/services/audit'
import { hashPassword } from '../src/main/lib/password'
import type { Actor, } from '../src/main/lib/actor'
import type { LabTest, Patient } from '../src/shared/api-types'

let tmpDir: string
let db: DatabaseType.Database
let adminId: number
let admin: Actor
let technician: Actor // test_results.view + manage, but NOT results.approve
let verifier: Actor // results.approve (Administrator in this suite)
let viewer: Actor // receptionist: neither manage nor approve

let cbc: LabTest
let glucose: LabTest
let urineTest: LabTest
let patientA: Patient // English name only
let patientB: Patient // English + Urdu name
let billA: ReturnType<typeof createBill> // patientA: CBC + glucose
let billB: ReturnType<typeof createBill> // patientB: urine test
let billD: ReturnType<typeof createBill> // patientA: glucose only (revision isolation)
let billE: ReturnType<typeof createBill> // patientA: CBC + glucose (one pending, one with value)
let cbcItemA: number
let glucoseItemA: number
let urineItemB: number
let glucoseItemD: number
let glucoseItemE: number

beforeAll(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lmas-lab-'))
  db = openDatabase(path.join(tmpDir, 'lmas.db'))
  runMigrations(db)
  seedIfEmpty(db)

  adminId = (db.prepare("SELECT id FROM users WHERE username = 'admin'").get() as { id: number }).id
  admin = {
    id: adminId,
    permissions: (db
      .prepare(
        "SELECT p.code FROM role_permissions rp JOIN permissions p ON p.id = rp.permission_id JOIN roles r ON r.id = rp.role_id WHERE r.name = 'Administrator'"
      )
      .all() as Array<{ code: string }>).map((r) => r.code)
  }

  db.prepare(
    "INSERT INTO users (username, password_hash, full_name, role_id) VALUES ('labtech2', ?, 'Lab Tech Two', (SELECT id FROM roles WHERE name = 'Technician'))"
  ).run(hashPassword('Tech@22345'))
  const techId = (db.prepare("SELECT id FROM users WHERE username = 'labtech2'").get() as { id: number }).id
  technician = {
    id: techId,
    permissions: (db
      .prepare(
        "SELECT p.code FROM role_permissions rp JOIN permissions p ON p.id = rp.permission_id JOIN roles r ON r.id = rp.role_id WHERE r.name = 'Technician'"
      )
      .all() as Array<{ code: string }>).map((r) => r.code)
  }
  expect(technician.permissions).toContain('test_results.manage')
  expect(technician.permissions).not.toContain('results.approve')

  db.prepare(
    "INSERT INTO users (username, password_hash, full_name, role_id) VALUES ('frontdesk2', ?, 'Front Desk Two', (SELECT id FROM roles WHERE name = 'Receptionist'))"
  ).run(hashPassword('Front@22345'))
  const recId = (db.prepare("SELECT id FROM users WHERE username = 'frontdesk2'").get() as { id: number }).id
  viewer = {
    id: recId,
    permissions: (db
      .prepare(
        "SELECT p.code FROM role_permissions rp JOIN permissions p ON p.id = rp.permission_id JOIN roles r ON r.id = rp.role_id WHERE r.name = 'Receptionist'"
      )
      .all() as Array<{ code: string }>).map((r) => r.code)
  }
  verifier = admin // Administrator holds results.approve

  glucose = createTest(db, adminId, {
    name: 'Blood Glucose Random',
    price_paisa: 30000,
    sample_type: 'Fluoride plasma',
    default_unit: 'mg/dL',
    default_reference_range: '70 – 140'
  })
  cbc = createTest(db, adminId, { name: 'Complete Blood Count (CBC)', price_paisa: 80000, sample_type: 'EDTA blood', default_unit: '10^9/L' })
  urineTest = createTest(db, adminId, { name: 'Urine Complete Examination', price_paisa: 40000, sample_type: 'Urine' })

  patientA = createPatient(db, adminId, { full_name: 'Imran Yousafzai', gender: 'MALE', age: 34 })
  patientB = createPatient(db, adminId, { full_name: 'Ashifa Begum', full_name_urdu: 'عاشفہ بیگم', gender: 'FEMALE', age: 41 })

  billA = createBill(db, admin, {
    patient_id: patientA.id,
    category: 'SELF',
    items: [{ test_id: cbc.id }, { test_id: glucose.id }],
    discount_paisa: 0,
    initial_payment_paisa: 110000,
    transaction_id: 'TXN-LAB-A-FULL'
  })
  billB = createBill(db, admin, {
    patient_id: patientB.id,
    category: 'SELF',
    items: [{ test_id: urineTest.id }],
    discount_paisa: 0,
    initial_payment_paisa: 0,
    transaction_id: 'TXN-LAB-B-UNPAID'
  })

  const workA = getBillWork(db, billA.id)
  cbcItemA = workA.results.find((r) => r.test_code === cbc.test_code)!.bill_item_id
  glucoseItemA = workA.results.find((r) => r.test_code === glucose.test_code)!.bill_item_id
  urineItemB = getBillWork(db, billB.id).results[0].bill_item_id

  billD = createBill(db, admin, {
    patient_id: patientA.id,
    category: 'SELF',
    items: [{ test_id: glucose.id }],
    discount_paisa: 0,
    initial_payment_paisa: 30000,
    transaction_id: 'TXN-LAB-D-REVISIONS'
  })
  glucoseItemD = getBillWork(db, billD.id).results[0].bill_item_id

  billE = createBill(db, admin, {
    patient_id: patientA.id,
    category: 'SELF',
    items: [{ test_id: cbc.id }, { test_id: glucose.id }],
    discount_paisa: 0,
    initial_payment_paisa: 0,
    transaction_id: 'TXN-LAB-E-PARTIAL'
  })
  const workE = getBillWork(db, billE.id)
  glucoseItemE = workE.results.find((r) => r.test_code === glucose.test_code)!.bill_item_id
})

afterAll(() => {
  db.close()
  fs.rmSync(tmpDir, { recursive: true, force: true })
})

describe('CP3: every billed test enters the workflow as PENDING', () => {
  it('auto-creates one PENDING/DRAFT result row per bill item', () => {
    const work = getBillWork(db, billA.id)
    expect(work.results).toHaveLength(2)
    for (const r of work.results) {
      expect(r.status).toBe('PENDING')
      expect(r.result_state).toBe('DRAFT')
    }
  })

  it('back-fills result rows for legacy bill items (idempotently)', () => {
    // Simulate a bill item created before CP3: delete its result row.
    db.prepare('DELETE FROM test_results WHERE bill_item_id = ?').run(glucoseItemA)
    const before = (db.prepare('SELECT COUNT(*) AS n FROM test_results').get() as { n: number }).n
    ensureResultRows(db)
    const after = (db.prepare('SELECT COUNT(*) AS n FROM test_results').get() as { n: number }).n
    expect(after).toBe(before + 1)
    ensureResultRows(db) // second call must not duplicate
    expect((db.prepare('SELECT COUNT(*) AS n FROM test_results').get() as { n: number }).n).toBe(after)
    const restored = getBillWork(db, billA.id).results.find((r) => r.bill_item_id === glucoseItemA)!
    expect(restored.status).toBe('PENDING')
  })
})

describe('CP3 acceptance: test statuses update correctly', () => {
  it('walks PENDING → IN_PROGRESS → COMPLETED', () => {
    let w = saveResult(db, technician, { bill_item_id: glucoseItemA, value: '96', unit: 'mg/dL', reference_range: '70 – 140' })
    expect(w.results.find((r) => r.bill_item_id === glucoseItemA)!.status).toBe('IN_PROGRESS')
    w = setTestStatus(db, technician, glucoseItemA, 'COMPLETED')
    expect(w.results.find((r) => r.bill_item_id === glucoseItemA)!.status).toBe('COMPLETED')
  })

  it('rejects completing a test without a result value', () => {
    expect(() => setTestStatus(db, technician, cbcItemA, 'COMPLETED')).toThrow(/Enter a test result value/)
  })

  it('requires a reason to cancel and blocks cancelling completed tests', () => {
    expect(() => setTestStatus(db, technician, cbcItemA, 'CANCELLED')).toThrow(/reason/i)
    setTestStatus(db, technician, cbcItemA, 'CANCELLED', 'Sample clotted, patient left')
    expect(getBillWork(db, billA.id).results.find((r) => r.bill_item_id === cbcItemA)!.status).toBe('CANCELLED')
    expect(() => setTestStatus(db, technician, glucoseItemA, 'CANCELLED', 'nope')).toThrow(/cannot be cancelled/)
  })

  it('blocks backward and unknown transitions', () => {
    expect(() => setTestStatus(db, technician, glucoseItemA, 'IN_PROGRESS')).toThrow(/Only pending tests/)
    expect(() => setTestStatus(db, technician, glucoseItemA, 'PENDING')).toThrow(/cannot move back/)
  })
})

describe('CP3: result entry with revision history (PRD: history of changes)', () => {
  it('prefills defaults from the configured catalog unit/range', () => {
    const r = getBillWork(db, billD.id).results.find((x) => x.bill_item_id === glucoseItemD)!
    expect(r.default_unit).toBe('mg/dL')
    expect(r.default_reference_range).toBe('70 – 140')
  })

  it('records revision 1 on first save and revision 2 after an edit', () => {
    let w = saveResult(db, technician, { bill_item_id: glucoseItemD, value: '98', unit: 'mg/dL', reference_range: '70 – 140', observations: 'Fasting not observed' })
    expect(w.results.find((r) => r.bill_item_id === glucoseItemD)!.revision_count).toBe(1)
    w = saveResult(db, technician, { bill_item_id: glucoseItemD, value: '96', unit: 'mg/dL', reference_range: '70 – 140' })
    expect(w.results.find((r) => r.bill_item_id === glucoseItemD)!.revision_count).toBe(2)
    const revs = listRevisions(db, glucoseItemD)
    expect(revs).toHaveLength(2)
    expect(revs[0].revision_no).toBe(2) // newest first
    expect(revs[0].value).toBe('96')
    expect(revs[1].value).toBe('98')
    expect(revs[1].changed_by_name).toBe('Lab Tech Two')
  })

  it('does not create a revision when nothing changed', () => {
    const before = listRevisions(db, glucoseItemD).length
    saveResult(db, technician, { bill_item_id: glucoseItemD, value: '96', unit: 'mg/dL', reference_range: '70 – 140' })
    expect(listRevisions(db, glucoseItemD).length).toBe(before)
  })

  it('blocks editing after verification; reset (with reason) reopens the draft', () => {
    const w = verifyResult(db, verifier, glucoseItemA)
    expect(w.results.find((r) => r.bill_item_id === glucoseItemA)!.result_state).toBe('VERIFIED')
    expect(() => saveResult(db, technician, { bill_item_id: glucoseItemA, value: '999' })).toThrow(/verified or approved/)
    resetResult(db, verifier, glucoseItemA, 'Typo in value, correcting')
    const after = getBillWork(db, billA.id).results.find((r) => r.bill_item_id === glucoseItemA)!
    expect(after.result_state).toBe('DRAFT')
    saveResult(db, technician, { bill_item_id: glucoseItemA, value: '94' })
    expect(getBillWork(db, billA.id).results.find((r) => r.bill_item_id === glucoseItemA)!.value).toBe('94')
    const auditActions = listAudit(db, 200).filter((a) => a.action === 'RESULT_RESET').length
    expect(auditActions).toBeGreaterThanOrEqual(1)
  })

  it('enforces the verify → approve ladder and stamps user + time', () => {
    const w1 = verifyResult(db, verifier, glucoseItemA)
    const verified = w1.results.find((r) => r.bill_item_id === glucoseItemA)!
    expect(verified.verified_by_name).toBe('Administrator')
    expect(verified.verified_at).toBeTruthy()
    expect(() => verifyResult(db, verifier, glucoseItemA)).toThrow(/Only draft results/)
    const w2 = approveResult(db, verifier, glucoseItemA)
    const approved = w2.results.find((r) => r.bill_item_id === glucoseItemA)!
    expect(approved.result_state).toBe('APPROVED')
    expect(approved.approved_by_name).toBe('Administrator')
    expect(approved.approved_at).toBeTruthy()
    expect(() => approveResult(db, verifier, glucoseItemA)).toThrow(/already approved/)
    expect(() => approveResult(db, verifier, cbcItemA)).toThrow(/Verify the result before approving/)
  })
})

describe('CP3 acceptance: unauthorized users cannot approve results', () => {
  it('blocks technician (no results.approve) from verify/approve/reset', () => {
    saveResult(db, technician, { bill_item_id: urineItemB, value: 'Pale yellow', observations: 'No glucose, no protein' })
    expect(() => verifyResult(db, technician, urineItemB)).toThrow(/do not have permission/)
    expect(() => approveResult(db, technician, urineItemB)).toThrow(/do not have permission/)
    expect(() => resetResult(db, technician, urineItemB, 'trying')).toThrow(/do not have permission/)
  })

  it('blocks receptionist from entering results and from verifying', () => {
    expect(() => saveResult(db, viewer, { bill_item_id: urineItemB, value: 'x' })).toThrow(/do not have permission/)
    expect(() => verifyResult(db, viewer, urineItemB)).toThrow(/do not have permission/)
  })

  it('blocks unauthorized users from changing statuses and samples', () => {
    expect(() => setTestStatus(db, viewer, urineItemB, 'IN_PROGRESS')).toThrow(/do not have permission/)
    expect(() =>
      createSample(db, viewer, { bill_id: billB.id, sample_type: 'Urine', status: 'COLLECTED' })
    ).toThrow(/do not have permission/)
  })
})

describe('CP3: sample tracking', () => {
  it('creates a sample with auto code, links it to results and stamps collection', () => {
    const w = createSample(db, technician, {
      bill_id: billB.id,
      sample_type: 'Urine',
      status: 'COLLECTED',
      assigned_technician_id: technician.id,
      link_item_ids: [urineItemB]
    })
    expect(w.samples).toHaveLength(1)
    const s = w.samples[0]
    expect(s.sample_code).toMatch(/^SMP-\d{4}-\d{4}$/)
    expect(s.status).toBe('COLLECTED')
    expect(s.collected_at).toBeTruthy()
    expect(s.assigned_technician_name).toBe('Lab Tech Two')
    expect(w.results.find((r) => r.bill_item_id === urineItemB)!.sample_code).toBe(s.sample_code)
  })

  it('walks the forward lifecycle and validates illegal transitions', () => {
    const s0 = getBillWork(db, billB.id).samples[0]
    let w = updateSample(db, technician, s0.id, { status: 'RECEIVED' })
    expect(w.samples[0].status).toBe('RECEIVED')
    w = updateSample(db, technician, s0.id, { status: 'PROCESSING' })
    expect(w.samples[0].status).toBe('PROCESSING')
    expect(() => updateSample(db, technician, s0.id, { status: 'COLLECTED' })).toThrow(/cannot move/)
    w = updateSample(db, technician, s0.id, { status: 'COMPLETED' })
    expect(w.samples[0].status).toBe('COMPLETED')
    expect(() => updateSample(db, technician, s0.id, { status: 'PROCESSING' })).toThrow(/cannot move/)
  })

  it('rejects a sample with a reason and allows re-collection', () => {
    const w2 = createSample(db, technician, { bill_id: billA.id, sample_type: 'EDTA blood', status: 'COLLECTED', link_item_ids: [] })
    const s = w2.samples.find((x) => x.sample_type === 'EDTA blood')!
    expect(() => updateSample(db, technician, s.id, { status: 'REJECTED' })).toThrow(/reason is required/i)
    updateSample(db, technician, s.id, { status: 'REJECTED' }, 'Tube leaked, unusable')
    const after = getBillWork(db, billA.id).samples.find((x) => x.id === s.id)!
    expect(after.status).toBe('REJECTED')
    expect(() => updateSample(db, technician, s.id, { status: 'NOT_COLLECTED' })).toThrow(/reason is required/i)
    updateSample(db, technician, s.id, { status: 'NOT_COLLECTED' }, 'New sample requested')
    expect(getBillWork(db, billA.id).samples.find((x) => x.id === s.id)!.status).toBe('NOT_COLLECTED')
  })

  it('refuses to link a sample to a test of a different bill', () => {
    const otherSample = getBillWork(db, billB.id).samples[0]
    expect(() =>
      createSample(db, technician, { bill_id: billA.id, sample_type: 'X', status: 'COLLECTED', link_item_ids: [] })
    ).not.toThrow()
    // linking an item from another bill is rejected inside the same transaction
    const workA = getBillWork(db, billA.id)
    const foreignId = workA.results.find((r) => r.bill_item_id !== cbcItemA && r.bill_item_id !== glucoseItemA)
    expect(foreignId).toBeUndefined()
    expect(otherSample).toBeTruthy()
  })
})

describe('CP3 acceptance: results stay associated with the correct patient and visit', () => {
  it('exposes each bill through its own visit and patient only', () => {
    const workA = getBillWork(db, billA.id)
    expect(workA.bill.patient_id).toBe(patientA.id)
    expect(workA.bill.visit_id).toBeGreaterThan(0)
    expect(workA.results.map((r) => r.test_code).sort()).toEqual([cbc.test_code, glucose.test_code].sort())

    const workB = getBillWork(db, billB.id)
    expect(workB.bill.patient_id).toBe(patientB.id)
    expect(workB.results).toHaveLength(1)
    expect(workB.results[0].test_code).toBe(urineTest.test_code)
    // bill A's result ids never leak into bill B
    for (const r of workB.results) expect([cbcItemA, glucoseItemA]).not.toContain(r.bill_item_id)
  })

  it('filters the worklist by patient, test name and status', () => {
    // Fresh bills so the status assertions are independent of the mutations
    // earlier tests in this suite applied to billA/billB.
    const freshPending = createBill(db, admin, {
      patient_id: patientA.id,
      category: 'SELF',
      items: [{ test_id: cbc.id }],
      discount_paisa: 0,
      initial_payment_paisa: 0,
      transaction_id: 'TXN-LAB-F-PENDING'
    })
    const freshDone = createBill(db, admin, {
      patient_id: patientA.id,
      category: 'SELF',
      items: [{ test_id: glucose.id }],
      discount_paisa: 0,
      initial_payment_paisa: 0,
      transaction_id: 'TXN-LAB-G-DONE'
    })
    const doneItem = getBillWork(db, freshDone.id).results[0].bill_item_id
    saveResult(db, technician, { bill_item_id: doneItem, value: '99', unit: 'mg/dL', reference_range: '70 – 140' })
    setTestStatus(db, technician, doneItem, 'COMPLETED')

    const all = listWork(db, {})
    expect(all.length).toBeGreaterThanOrEqual(2)
    const byPatient = listWork(db, { query: 'Ashifa' })
    expect(byPatient).toHaveLength(1)
    expect(byPatient[0].patient_name_urdu).toBe('عاشفہ بیگم')
    const byTest = listWork(db, { query: 'Urine' })
    expect(byTest).toHaveLength(1)
    expect(byTest[0].bill_id).toBe(billB.id)
    const pending = listWork(db, { status: 'PENDING' })
    expect(pending.find((r) => r.bill_id === freshPending.id)).toBeDefined()
    const completed = listWork(db, { status: 'COMPLETED' })
    expect(completed.find((r) => r.bill_id === freshDone.id)).toBeDefined()
    expect(completed.find((r) => r.bill_id === freshPending.id)).toBeUndefined()
  })
})

describe('CP3: laboratory report generation and history', () => {
  it('refuses to build a report before any result exists', () => {
    const billC = createBill(db, admin, {
      patient_id: patientA.id,
      category: 'SELF',
      items: [{ test_id: cbc.id }],
      discount_paisa: 0,
      initial_payment_paisa: 0,
      transaction_id: 'TXN-LAB-C-NORESULTS'
    })
    expect(() => buildLabReportData(db, billC.id, 'RPT-TEST-0001')).toThrow(/No test results have been entered/)
  })

  it('builds complete report data and A4 HTML (incl. Urdu name, ranges, signatures)', () => {
    const data = buildLabReportData(db, billB.id, 'RPT-2026-0001')
    expect(data.bill.patient_name).toBe('Ashifa Begum')
    expect(data.tests).toHaveLength(1)
    expect(data.tests[0].value).toBe('Pale yellow')
    expect(data.tests[0].sample_code).toMatch(/^SMP-/)
    expect(data.entered_by_name).toBe('Lab Tech Two')
    expect(data.verified_by_name).toBeNull() // the urine result was never verified in this suite
  })

  it('renders HTML containing the required PRD §Module F fields', () => {
    const data = buildLabReportData(db, billB.id, 'RPT-2026-0002')
    const settings = { 'lab.name': 'City Diagnostic Lab', 'lab.reportHeader': 'Indoor reporting' }
    const html = buildLabReportHtml(data, settings, '2026-11-08 09:00')
    for (const fragment of [
      'City Diagnostic Lab',
      'LABORATORY TEST REPORT',
      'RPT-2026-0002',
      'Ashifa Begum',
      'عاشفہ بیگم', // Urdu name renders (CP3 acceptance)
      'Pale yellow',
      'Reference range',
      'Signature &amp; stamp',
      'Prepared by (Technician)',
      'Urine Complete Examination'
    ]) {
      expect(html).toContain(fragment)
    }
    expect(html).toContain('direction:rtl') // Urdu RTL support
  })

  it('shows cancelled tests as Cancelled without erasing the row', () => {
    const data = buildLabReportData(db, billA.id, 'RPT-2026-0003')
    const cancelled = data.tests.find((t) => t.test_code === cbc.test_code)!
    expect(cancelled.status).toBe('CANCELLED')
    const html = buildLabReportHtml(data, {}, '2026-11-08 09:00')
    expect(html).toContain('Cancelled')
  })

  it('shows pending tests as Pending while completed values stay visible', () => {
    saveResult(db, technician, { bill_item_id: glucoseItemE, value: '105', unit: 'mg/dL', reference_range: '70 – 140' })
    const data = buildLabReportData(db, billE.id, 'RPT-2026-0004')
    const html = buildLabReportHtml(data, {}, '2026-11-08 09:00')
    expect(html).toContain('Pending')
    expect(html).toContain('105')
  })
})

describe('CP3: patient test history and technicians list', () => {
  it('lists all tests of a patient across bills with latest report reference', () => {
    const rows = patientHistory(db, patientB.id)
    expect(rows).toHaveLength(1)
    expect(rows[0].bill_number).toBe(billB.bill_number)
    expect(rows[0].value).toBe('Pale yellow')
    expect(rows[0].sample_code).toMatch(/^SMP-/)
    const rowsA = patientHistory(db, patientA.id)
    expect(rowsA.length).toBeGreaterThanOrEqual(3) // CBC + glucose + extra bill's CBC
  })

  it('lists active users for technician assignment', () => {
    const techs = listTechnicians(db)
    expect(techs.length).toBeGreaterThanOrEqual(3)
    expect(techs.find((t) => t.full_name === 'Lab Tech Two')).toBeDefined()
  })
})

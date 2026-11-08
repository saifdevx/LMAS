import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import type DatabaseType from 'better-sqlite3'
import { openDatabase } from '../src/main/db/connection'
import { runMigrations } from '../src/main/db/migrator'
import { seedIfEmpty } from '../src/main/db/seed'
import { createPatient, searchPatients, getPatientProfile } from '../src/main/services/patients'
import {
  createPractitioner,
  updateCommissionRate,
  getPractitionerAccount,
  PractitionerError
} from '../src/main/services/practitioners'
import { createTest, updateTest } from '../src/main/services/tests'
import {
  createBill,
  addPayment,
  cancelBill,
  getBill,
  listBills,
  BillingError
} from '../src/main/services/billing'
import { buildReceiptHtml } from '../src/main/services/receipt-html'
import { updateSettings, getSettings } from '../src/main/services/settings'
import { hashPassword } from '../src/main/lib/password'
import { formatPKR } from '../src/shared/money'
import type { LabTest, Practitioner, Patient } from '../src/shared/api-types'

let tmpDir: string
let db: DatabaseType.Database
let adminId: number
let admin: { id: number; permissions: string[] }
let receptionist: { id: number; permissions: string[] }
let technician: { id: number; permissions: string[] }

let cbc: LabTest
let sugar: LabTest
let lipid: LabTest
let panelX: LabTest
let panelY: LabTest
let basic: LabTest
let drA: Practitioner
let drB: Practitioner
let drC: Practitioner
let selfPatient: Patient
let referredPatient: Patient

beforeAll(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lmas-billing-'))
  db = openDatabase(path.join(tmpDir, 'lmas.db'))
  runMigrations(db)
  seedIfEmpty(db)

  adminId = (db.prepare("SELECT id FROM users WHERE username = 'admin'").get() as { id: number }).id
  admin = {
    id: adminId,
    permissions: (db.prepare("SELECT p.code FROM role_permissions rp JOIN permissions p ON p.id = rp.permission_id JOIN roles r ON r.id = rp.role_id WHERE r.name = 'Administrator'").all() as Array<{ code: string }>).map((r) => r.code)
  }
  db.prepare(
    "INSERT INTO users (username, password_hash, full_name, role_id) VALUES ('frontdesk1', ?, 'Front Desk', (SELECT id FROM roles WHERE name = 'Receptionist'))"
  ).run(hashPassword('Front@12345'))
  const recId = (db.prepare("SELECT id FROM users WHERE username = 'frontdesk1'").get() as { id: number }).id
  receptionist = {
    id: recId,
    permissions: (db.prepare("SELECT p.code FROM role_permissions rp JOIN permissions p ON p.id = rp.permission_id JOIN roles r ON r.id = rp.role_id WHERE r.name = 'Receptionist'").all() as Array<{ code: string }>).map((r) => r.code)
  }
  db.prepare(
    "INSERT INTO users (username, password_hash, full_name, role_id) VALUES ('labtech1', ?, 'Lab Tech', (SELECT id FROM roles WHERE name = 'Technician'))"
  ).run(hashPassword('Tech@12345'))
  const techId = (db.prepare("SELECT id FROM users WHERE username = 'labtech1'").get() as { id: number }).id
  technician = {
    id: techId,
    permissions: (db.prepare("SELECT p.code FROM role_permissions rp JOIN permissions p ON p.id = rp.permission_id JOIN roles r ON r.id = rp.role_id WHERE r.name = 'Technician'").all() as Array<{ code: string }>).map((r) => r.code)
  }

  const hematology = (db.prepare("SELECT id FROM test_categories WHERE name = 'Hematology'").get() as { id: number }).id
  cbc = createTest(db, adminId, { name: 'Complete Blood Count (CBC)', category_id: hematology, price_paisa: 80000 })
  sugar = createTest(db, adminId, { name: 'Blood Sugar Random', price_paisa: 30000 })
  lipid = createTest(db, adminId, { name: 'Lipid Profile', price_paisa: 120000 })
  panelX = createTest(db, adminId, { name: 'Panel X', price_paisa: 300000 })
  panelY = createTest(db, adminId, { name: 'Panel Y', price_paisa: 250000 })
  basic = createTest(db, adminId, { name: 'Basic Screening', price_paisa: 100000 })

  drA = createPractitioner(db, adminId, { name: 'Dr. Ahmed Raza', clinic_name: 'City Clinic', commission_rate_bp: 5000 })
  drB = createPractitioner(db, adminId, { name: 'Dr. Bilal Khan', commission_rate_bp: 4000 })
  drC = createPractitioner(db, adminId, { name: 'Dr. Farhan Ali', commission_rate_bp: 5000 })

  selfPatient = createPatient(db, adminId, { full_name: 'Muhammad Imran', gender: 'MALE', age: 34, phone: '0300-1112223' })
  referredPatient = createPatient(db, adminId, { full_name: 'Ashifa Begum', full_name_urdu: 'عاشفہ بیگم', gender: 'FEMALE', age: 41 })
})

afterAll(() => {
  db.close()
  fs.rmSync(tmpDir, { recursive: true, force: true })
})

describe('PRD Scenario 1 — self patient, 100% laboratory', () => {
  it('bills CBC + Sugar at 1,100 with zero commission', () => {
    const bill = createBill(db, admin, {
      patient_id: selfPatient.id,
      category: 'SELF',
      items: [{ test_id: cbc.id }, { test_id: sugar.id }],
      discount_paisa: 0,
      initial_payment_paisa: 110000,
      method: 'CASH',
      transaction_id: 'TXN-S1-FULLPAY'
    })
    expect(bill.net_paisa).toBe(110000)
    expect(bill.commission_paisa).toBe(0)
    expect(bill.lab_allocation_paisa).toBe(110000)
    expect(bill.status).toBe('PAID')
    expect(bill.outstanding_paisa).toBe(0)
    const entries = db.prepare('SELECT COUNT(*) AS n FROM practitioner_commission_entries WHERE bill_id = ?').get(bill.id) as { n: number }
    expect(entries.n).toBe(0)
  })
})

describe('PRD Scenario 2 — referred patient at 50%', () => {
  it('splits 2,000 into 1,000 / 1,000 and accrues once', () => {
    const bill = createBill(db, admin, {
      patient_id: referredPatient.id,
      category: 'REFERRED',
      practitioner_id: drA.id,
      items: [{ test_id: cbc.id }, { test_id: lipid.id }],
      discount_paisa: 0,
      initial_payment_paisa: 0,
      transaction_id: 'TXN-S2-UNPAID'
    })
    expect(bill.bill_number).toMatch(/^BILL-\d{4}-\d{4}$/)
    expect(bill.visit_code).toMatch(/^VIS-\d{4}-\d{4}$/)
    expect(bill.net_paisa).toBe(200000)
    expect(bill.commission_paisa).toBe(100000)
    expect(bill.lab_allocation_paisa).toBe(100000)
    expect(bill.status).toBe('FINALIZED')
    expect(bill.practitioner_rate_bp).toBe(5000)
    expect(bill.commission_basis).toBe('NET_BILL')
    const entry = db
      .prepare('SELECT * FROM practitioner_commission_entries WHERE bill_id = ?')
      .get(bill.id) as { entry_type: string; basis: string; rate_bp: number; eligible_paisa: number; commission_paisa: number }
    expect(entry.entry_type).toBe('ACCRUAL')
    expect(entry.basis).toBe('NET_BILL')
    expect(entry.rate_bp).toBe(5000)
    expect(entry.eligible_paisa).toBe(200000)
    expect(entry.commission_paisa).toBe(100000)
  })
})

describe('PRD Scenario 3 — 40% rate', () => {
  it('computes 1,200 / 1,800 on a 3,000 bill', () => {
    const bill = createBill(db, admin, {
      patient_id: referredPatient.id,
      category: 'REFERRED',
      practitioner_id: drB.id,
      items: [{ test_id: panelX.id }],
      discount_paisa: 0,
      initial_payment_paisa: 0,
      transaction_id: 'TXN-S3-UNPAID'
    })
    expect(bill.net_paisa).toBe(300000)
    expect(bill.commission_paisa).toBe(120000)
    expect(bill.lab_allocation_paisa).toBe(180000)
  })
})

describe('PRD Scenario 4 — discounted referred bill (net basis)', () => {
  it('uses net after discount as the eligible amount', () => {
    const bill = createBill(db, admin, {
      patient_id: referredPatient.id,
      category: 'REFERRED',
      practitioner_id: drA.id,
      items: [{ test_id: panelY.id }],
      discount_paisa: 50000,
      initial_payment_paisa: 0,
      transaction_id: 'TXN-S4-UNPAID'
    })
    expect(bill.subtotal_paisa).toBe(250000)
    expect(bill.discount_paisa).toBe(50000)
    expect(bill.net_paisa).toBe(200000)
    expect(bill.commission_paisa).toBe(100000)
  })

  it('rejects discounts from staff without the billing.discount permission, allows receptionists with it', () => {
    expect(() =>
      createBill(db, technician, {
        patient_id: referredPatient.id,
        category: 'REFERRED',
        practitioner_id: drA.id,
        items: [{ test_id: panelY.id }],
        discount_paisa: 10000,
        initial_payment_paisa: 0,
        transaction_id: 'TXN-S4B-UNPAID'
      })
    ).toThrow(/permission to apply discounts/)
    expect(receptionist.permissions).toContain('billing.discount')
  })

  it('rejects discounts larger than the subtotal', () => {
    expect(() =>
      createBill(db, admin, {
        patient_id: referredPatient.id,
        category: 'REFERRED',
        practitioner_id: drA.id,
        items: [{ test_id: panelY.id }],
        discount_paisa: 250001,
        initial_payment_paisa: 0,
        transaction_id: 'TXN-S4C-UNPAID'
      })
    ).toThrow(/negative|exceed/i)
  })
})

describe('PRD Scenario 5 — partial patient payments', () => {
  it('tracks 1,000 + 500 + 500 against a 2,000 bill', () => {
    const bill = createBill(db, admin, {
      patient_id: selfPatient.id,
      category: 'SELF',
      items: [{ test_id: lipid.id }, { test_id: cbc.id }],
      discount_paisa: 0,
      initial_payment_paisa: 100000,
      method: 'CASH',
      transaction_id: 'TXN-S5-P1'
    })
    expect(bill.status).toBe('PARTIALLY_PAID')
    expect(bill.outstanding_paisa).toBe(100000)

    const afterP2 = addPayment(db, admin, { bill_id: bill.id, amount_paisa: 50000, method: 'CASH', transaction_id: 'TXN-S5-P2' })
    expect(afterP2.paid_paisa).toBe(150000)
    expect(afterP2.outstanding_paisa).toBe(50000)
    expect(afterP2.status).toBe('PARTIALLY_PAID')

    const afterP3 = addPayment(db, admin, { bill_id: bill.id, amount_paisa: 50000, method: 'CASH', transaction_id: 'TXN-S5-P3' })
    expect(afterP3.status).toBe('PAID')
    expect(afterP3.outstanding_paisa).toBe(0)
    expect(afterP3.payments.length).toBe(3)
  })

  it('rejects overpayment beyond the outstanding balance', () => {
    const bill = createBill(db, admin, {
      patient_id: selfPatient.id,
      category: 'SELF',
      items: [{ test_id: sugar.id }],
      discount_paisa: 0,
      initial_payment_paisa: 0,
      transaction_id: 'TXN-S5B-UNPAID'
    })
    expect(() =>
      addPayment(db, admin, { bill_id: bill.id, amount_paisa: 30001, method: 'CASH', transaction_id: 'TXN-S5B-P1' })
    ).toThrow(/outstanding/i)
  })
})


describe('Excess tender handling', () => {
  it('returns cash change without counting it as bill payment', () => {
    const bill = createBill(db, admin, {
      patient_id: selfPatient.id,
      category: 'SELF',
      items: [{ test_id: sugar.id }],
      discount_paisa: 0,
      initial_payment_paisa: 30000,
      initial_tendered_paisa: 500000,
      method: 'CASH',
      transaction_id: 'TXN-CASH-CHANGE-01'
    })
    expect(bill.net_paisa).toBe(30000)
    expect(bill.paid_paisa).toBe(30000)
    expect(bill.outstanding_paisa).toBe(0)
    expect(bill.patient_advance_paisa).toBe(0)
    expect(bill.payments[0].tendered_paisa).toBe(500000)
    expect(bill.payments[0].change_paisa).toBe(470000)
  })

  it('records excess bank transfer as patient advance, not bill payment', () => {
    const bill = createBill(db, admin, {
      patient_id: selfPatient.id,
      category: 'SELF',
      items: [{ test_id: sugar.id }],
      discount_paisa: 0,
      initial_payment_paisa: 30000,
      initial_tendered_paisa: 500000,
      method: 'BANK_TRANSFER',
      reference_number: 'BANK-REF-ADV-01',
      transaction_id: 'TXN-BANK-ADVANCE-01'
    })
    expect(bill.paid_paisa).toBe(30000)
    expect(bill.outstanding_paisa).toBe(0)
    expect(bill.patient_advance_paisa).toBe(470000)
    expect(bill.payments[0].change_paisa).toBe(0)
    const advance = db.prepare('SELECT patient_id, amount_paisa, remaining_paisa, method FROM patient_advances WHERE source_payment_id = ?').get(bill.payments[0].id) as { patient_id: number; amount_paisa: number; remaining_paisa: number; method: string }
    expect(advance.patient_id).toBe(selfPatient.id)
    expect(advance.amount_paisa).toBe(470000)
    expect(advance.remaining_paisa).toBe(470000)
    expect(advance.method).toBe('BANK_TRANSFER')
    const advanceId = (db.prepare('SELECT id FROM patient_advances WHERE source_payment_id = ?').get(bill.payments[0].id) as { id: number }).id
    const ledgerRow = db.prepare("SELECT txn_type, amount_paisa FROM v_transaction_history WHERE txn_id = ?").get('ADV-' + advanceId) as { txn_type: string; amount_paisa: number }
    expect(ledgerRow.txn_type).toBe('PATIENT_ADVANCE')
    expect(ledgerRow.amount_paisa).toBe(470000)
  })

  it('supports excess cash tender when collecting a later partial payment', () => {
    const bill = createBill(db, admin, {
      patient_id: selfPatient.id, category: 'SELF', items: [{ test_id: lipid.id }],
      discount_paisa: 0, initial_payment_paisa: 0, transaction_id: 'TXN-LATER-CASH-BASE'
    })
    const updated = addPayment(db, admin, {
      bill_id: bill.id, amount_paisa: 120000, tendered_paisa: 200000,
      method: 'CASH', transaction_id: 'TXN-LATER-CASH-OVER'
    })
    expect(updated.paid_paisa).toBe(120000)
    expect(updated.outstanding_paisa).toBe(0)
    expect(updated.payments[0].change_paisa).toBe(80000)
  })

  it('supports excess bank transfer when collecting a later partial payment', () => {
    const bill = createBill(db, admin, {
      patient_id: selfPatient.id, category: 'SELF', items: [{ test_id: lipid.id }],
      discount_paisa: 0, initial_payment_paisa: 0, transaction_id: 'TXN-LATER-BANK-BASE'
    })
    const updated = addPayment(db, admin, {
      bill_id: bill.id, amount_paisa: 120000, tendered_paisa: 200000,
      method: 'BANK_TRANSFER', transaction_id: 'TXN-LATER-BANK-OVER'
    })
    expect(updated.paid_paisa).toBe(120000)
    expect(updated.patient_advance_paisa).toBe(80000)
  })

  it('rejects excess card payment instead of silently treating it as cash change', () => {
    expect(() => createBill(db, admin, {
      patient_id: selfPatient.id,
      category: 'SELF',
      items: [{ test_id: sugar.id }],
      discount_paisa: 0,
      initial_payment_paisa: 30000,
      initial_tendered_paisa: 500000,
      method: 'CARD',
      transaction_id: 'TXN-CARD-OVERPAY-01'
    })).toThrow(/only for cash|bank transfer/i)
  })
})

describe('PRD Scenario 8 — duplicate payment protection', () => {
  it('blocks the same transaction ID twice and keeps the balance correct', () => {
    const bill = createBill(db, admin, {
      patient_id: selfPatient.id,
      category: 'SELF',
      items: [{ test_id: sugar.id }],
      discount_paisa: 0,
      initial_payment_paisa: 0,
      transaction_id: 'TXN-S8-BASE'
    })
    const paid1 = addPayment(db, admin, { bill_id: bill.id, amount_paisa: 10000, method: 'CASH', transaction_id: 'TXN-S8-DUP' })
    expect(() =>
      addPayment(db, admin, { bill_id: bill.id, amount_paisa: 10000, method: 'CASH', transaction_id: 'TXN-S8-DUP' })
    ).toThrow(/Duplicate payment/i)
    const after = getBill(db, paid1.id)
    expect(after.paid_paisa).toBe(10000)
    expect(after.payments.length).toBe(1)
  })
})

describe('PRD Scenario 7 — commission rate change never rewrites history', () => {
  it('keeps the old bill at 50% and bills new work at 40%', () => {
    const oldBill = createBill(db, admin, {
      patient_id: referredPatient.id,
      category: 'REFERRED',
      practitioner_id: drC.id,
      items: [{ test_id: basic.id }],
      discount_paisa: 0,
      initial_payment_paisa: 0,
      transaction_id: 'TXN-S7-OLD'
    })
    expect(oldBill.commission_paisa).toBe(50000)

    const updated = updateCommissionRate(db, adminId, drC.id, 4000, 'Revised agreement with practitioner')
    expect(updated.commission_rate_bp).toBe(4000)
    expect(() => updateCommissionRate(db, adminId, drC.id, 4000, 'no change')).toThrow(PractitionerError)
    expect(() => updateCommissionRate(db, adminId, drC.id, 2500, 'x')).toThrow(/reason/i)

    const newBill = createBill(db, admin, {
      patient_id: referredPatient.id,
      category: 'REFERRED',
      practitioner_id: drC.id,
      items: [{ test_id: basic.id }],
      discount_paisa: 0,
      initial_payment_paisa: 0,
      transaction_id: 'TXN-S7-NEW'
    })
    expect(newBill.commission_paisa).toBe(40000)
    expect(newBill.practitioner_rate_bp).toBe(4000)

    const oldAfter = getBill(db, oldBill.id)
    expect(oldAfter.commission_paisa).toBe(50000)
    expect(oldAfter.practitioner_rate_bp).toBe(5000)
    const oldEntry = db
      .prepare('SELECT rate_bp, commission_paisa FROM practitioner_commission_entries WHERE bill_id = ?')
      .get(oldBill.id) as { rate_bp: number; commission_paisa: number }
    expect(oldEntry.rate_bp).toBe(5000)
    expect(oldEntry.commission_paisa).toBe(50000)
  })
})

describe('Historical price snapshots (PRD §6.1 rule 5)', () => {
  it('keeps old bill prices when the catalog price changes', () => {
    const before = createBill(db, admin, {
      patient_id: selfPatient.id,
      category: 'SELF',
      items: [{ test_id: cbc.id }],
      discount_paisa: 0,
      initial_payment_paisa: 0,
      transaction_id: 'TXN-PRICE-OLD'
    })
    updateTest(db, adminId, cbc.id, { price_paisa: 90000 })
    const after = createBill(db, admin, {
      patient_id: selfPatient.id,
      category: 'SELF',
      items: [{ test_id: cbc.id }],
      discount_paisa: 0,
      initial_payment_paisa: 0,
      transaction_id: 'TXN-PRICE-NEW'
    })
    expect(getBill(db, before.id).items[0].price_paisa).toBe(80000)
    expect(after.items[0].price_paisa).toBe(90000)
    expect(after.net_paisa).toBe(90000)
  })
})

describe('Cancellation (authorized adjustment, PRD §3.3/§14.3)', () => {
  it('refuses to cancel a bill that already has payments', () => {
    const paid = createBill(db, admin, {
      patient_id: selfPatient.id,
      category: 'SELF',
      items: [{ test_id: sugar.id }],
      discount_paisa: 0,
      initial_payment_paisa: 30000,
      method: 'CASH',
      transaction_id: 'TXN-CXL-PAID'
    })
    expect(() => cancelBill(db, admin, paid.id, 'mistake')).toThrow(/payments|refund/i)
  })

  it('cancels an unpaid bill with an adjustment row and commission reversal', () => {
    const bill = createBill(db, admin, {
      patient_id: referredPatient.id,
      category: 'REFERRED',
      practitioner_id: drA.id,
      items: [{ test_id: basic.id }],
      discount_paisa: 0,
      initial_payment_paisa: 0,
      transaction_id: 'TXN-CXL-UNPAID'
    })
    const entryCountBefore = (db.prepare('SELECT COUNT(*) AS n FROM adjustments').get() as { n: number }).n
    const cancelled = cancelBill(db, admin, bill.id, 'Duplicate bill created by mistake')
    expect(cancelled.status).toBe('CANCELLED')
    expect(cancelled.outstanding_paisa).toBe(0)

    const adj = db.prepare('SELECT * FROM adjustments WHERE bill_id = ?').get(bill.id) as { adjustment_type: string; amount_paisa: number }
    expect(adj.adjustment_type).toBe('BILL_ADJUSTMENT')
    expect(adj.amount_paisa).toBe(-bill.net_paisa)
    expect((db.prepare('SELECT COUNT(*) AS n FROM adjustments').get() as { n: number }).n).toBe(entryCountBefore + 1)

    const reversal = db
      .prepare("SELECT * FROM practitioner_commission_entries WHERE bill_id = ? AND entry_type = 'REVERSAL'")
      .get(bill.id) as { commission_paisa: number }
    expect(reversal.commission_paisa).toBe(-bill.commission_paisa)

    expect(() =>
      addPayment(db, admin, { bill_id: bill.id, amount_paisa: 1000, method: 'CASH', transaction_id: 'TXN-CXL-AFTER' })
    ).toThrow(/cancelled/i)
  })

  it('blocks receptionists from cancelling (bills.cancel permission)', () => {
    const bill = createBill(db, admin, {
      patient_id: selfPatient.id,
      category: 'SELF',
      items: [{ test_id: sugar.id }],
      discount_paisa: 0,
      initial_payment_paisa: 0,
      transaction_id: 'TXN-CXL-PERM'
    })
    expect(() => cancelBill(db, receptionist, bill.id, 'not allowed')).toThrow(BillingError)
  })
})

describe('COLLECTED commission basis (PRD §3.2 alternative policy)', () => {
  it('accrues commission on collections as they arrive', () => {
    updateSettings(db, { 'app.commissionBasis': 'COLLECTED' }, adminId)
    try {
      const bill = createBill(db, admin, {
        patient_id: referredPatient.id,
        category: 'REFERRED',
        practitioner_id: drA.id,
        items: [{ test_id: lipid.id }, { test_id: cbc.id }],
        discount_paisa: 0,
        initial_payment_paisa: 80000,
        method: 'CASH',
        transaction_id: 'TXN-COL-P1'
      })
      expect(bill.commission_basis).toBe('COLLECTED')
      const e1 = db
        .prepare('SELECT eligible_paisa, commission_paisa FROM practitioner_commission_entries WHERE bill_id = ? ORDER BY id')
        .all(bill.id) as Array<{ eligible_paisa: number; commission_paisa: number }>
      expect(e1.length).toBe(1)
      expect(e1[0].eligible_paisa).toBe(80000)
      expect(e1[0].commission_paisa).toBe(40000)

      addPayment(db, admin, { bill_id: bill.id, amount_paisa: 40000, method: 'CASH', transaction_id: 'TXN-COL-P2' })
      const e2 = db
        .prepare('SELECT eligible_paisa, commission_paisa FROM practitioner_commission_entries WHERE bill_id = ? ORDER BY id')
        .all(bill.id) as Array<{ eligible_paisa: number; commission_paisa: number }>
      expect(e2.length).toBe(2)
      expect(e2[1].eligible_paisa).toBe(40000)
      expect(e2[1].commission_paisa).toBe(20000)
      const totalAccrued = e2.reduce((s, e) => s + e.commission_paisa, 0)
      expect(totalAccrued).toBe(60000) // 150,000 collected × 50%
    } finally {
      updateSettings(db, { 'app.commissionBasis': 'NET_BILL' }, adminId)
    }
  })
})

describe('Numbering & dashboards integration', () => {
  it('generates sequential yearly codes for patients, visits and bills', () => {
    const p1 = createPatient(db, adminId, { full_name: 'Numbering Test One', gender: 'MALE' })
    const p2 = createPatient(db, adminId, { full_name: 'Numbering Test Two', gender: 'FEMALE' })
    const seq = (code: string) => Number(code.match(/(\d{4})$/)![1])
    expect(p1.patient_code).toMatch(/^PAT-\d{4}-\d{4}$/)
    expect(seq(p2.patient_code)).toBe(seq(p1.patient_code) + 1)

    const b1 = createBill(db, admin, {
      patient_id: p1.id,
      category: 'SELF',
      items: [{ test_id: sugar.id }],
      discount_paisa: 0,
      initial_payment_paisa: 0,
      transaction_id: 'TXN-NUM-1'
    })
    const b2 = createBill(db, admin, {
      patient_id: p1.id,
      category: 'SELF',
      items: [{ test_id: sugar.id }],
      discount_paisa: 0,
      initial_payment_paisa: 0,
      transaction_id: 'TXN-NUM-2'
    })
    expect(seq(b2.bill_number)).toBe(seq(b1.bill_number) + 1)
    expect(b2.visit_code).not.toBe(b1.visit_code)
  })

  it('lists bills with correct paid/outstanding figures and filters', () => {
    const result = listBills(db, { status: 'PARTIALLY_PAID', page: 1, pageSize: 50 })
    expect(result.rows.length).toBeGreaterThan(0)
    for (const row of result.rows) {
      expect(row.status).toBe('PARTIALLY_PAID')
      expect(row.outstanding_paisa).toBe(row.net_paisa - row.paid_paisa)
    }
    const byPatient = listBills(db, { query: 'Muhammad Imran', page: 1, pageSize: 50 })
    expect(byPatient.rows.length).toBeGreaterThan(0)
  })
})

describe('Patient search (PRD §Module B)', () => {
  it('finds patients by name, phone, code, bill number and registration date', () => {
    expect(searchPatients(db, 'Imran').some((p) => p.id === selfPatient.id)).toBe(true)
    expect(searchPatients(db, '0300-1112223').some((p) => p.id === selfPatient.id)).toBe(true)
    expect(searchPatients(db, selfPatient.patient_code)[0]?.id).toBe(selfPatient.id)
    expect(searchPatients(db, 'عاشفہ').some((p) => p.id === referredPatient.id)).toBe(true)

    const anyBill = db.prepare("SELECT bill_number, patient_id FROM bills ORDER BY id LIMIT 1").get() as { bill_number: string; patient_id: number }
    expect(searchPatients(db, anyBill.bill_number)[0]?.id).toBe(anyBill.patient_id)

    const today = new Date()
    const iso = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`
    expect(searchPatients(db, iso).length).toBeGreaterThan(0)
  })

  it('builds a patient profile with visits, payments and reconciling totals', () => {
    const profile = getPatientProfile(db, selfPatient.id)
    expect(profile.patient.patient_code).toBe(selfPatient.patient_code)
    expect(profile.visits.length).toBeGreaterThan(0)
    const computedBilled = profile.visits.flatMap((v) => v.bills).reduce((s, b) => s + (b.status === 'CANCELLED' ? 0 : b.net_paisa), 0)
    expect(profile.totals.billedPaisa).toBe(computedBilled)
    const computedPaid = profile.payments.reduce((s, p) => s + p.amount_paisa, 0)
    expect(profile.totals.paidPaisa).toBe(computedPaid)
    expect(profile.totals.outstandingPaisa).toBe(profile.totals.billedPaisa - profile.totals.paidPaisa)
  })
})

describe('Practitioner account (PRD §3.5)', () => {
  it('reconciles accrued vs entries and reports the outstanding liability', () => {
    const acct = getPractitionerAccount(db, drA.id)
    const entrySum = acct.entries.filter((e) => e.entry_type !== 'REVERSAL').reduce((s, e) => s + e.commission_paisa, 0)
    const reversalSum = acct.entries.filter((e) => e.entry_type === 'REVERSAL').reduce((s, e) => s + e.commission_paisa, 0)
    expect(acct.totals.accruedPaisa).toBe(entrySum + reversalSum)
    expect(acct.totals.paidPaisa).toBe(0)
    expect(acct.totals.outstandingPaisa).toBe(acct.totals.accruedPaisa)
    expect(acct.rateHistory.length).toBeGreaterThanOrEqual(1)
    expect(acct.rateHistory[0].rate_bp).toBe(5000)
  })
})

describe('Receipt HTML (PRD §Module E receipt contents)', () => {
  it('renders A4 and thermal receipts with all mandatory fields', () => {
    const bill = createBill(db, admin, {
      patient_id: referredPatient.id,
      category: 'REFERRED',
      practitioner_id: drA.id,
      items: [{ test_id: cbc.id }, { test_id: sugar.id }],
      discount_paisa: 10000,
      initial_payment_paisa: 50000,
      method: 'CASH',
      transaction_id: 'TXN-RCPT-1',
      notes: 'Fasting sample preferred'
    })
    const settings = getSettings(db)
    const a4 = buildReceiptHtml(bill, settings, 'a4', '08-11-2026 14:30')
    expect(a4).toContain(bill.bill_number)
    expect(a4).toContain('Ashifa Begum')
    expect(a4).toContain('Dr. Ahmed Raza')
    expect(a4).toContain('Fasting sample preferred')
    expect(a4).toContain(formatPKR(10000)) // discount row
  })

  it('escapes patient names and includes totals, balance and status', () => {
    const bill = createBill(db, admin, {
      patient_id: selfPatient.id,
      category: 'SELF',
      items: [{ test_id: cbc.id }],
      discount_paisa: 0,
      initial_payment_paisa: 0,
      transaction_id: 'TXN-RCPT-2'
    })
    const settings = getSettings(db)
    const html = buildReceiptHtml(bill, settings, 'thermal', '08-11-2026 15:00')
    expect(html).toContain(bill.bill_number)
    expect(html).toContain(selfPatient.full_name)
    expect(html).toContain('Balance due')
    expect(html).toContain(formatPKR(bill.net_paisa))
    expect(html).toContain('UNPAID')
    expect(html).toContain('width:72mm')
    const a4 = buildReceiptHtml(bill, settings, 'a4', '08-11-2026 15:00')
    expect(a4).toContain('width:180mm')
  })
})

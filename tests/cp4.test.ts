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
import { cancelBill, createBill, issueRefund } from '../src/main/services/billing'
import {
  getCommissionLedger,
  listCommissionAccounts,
  nextCommissionPaymentCode,
  recordCommissionPayment
} from '../src/main/services/commissions'
import {
  createExpense,
  createExpenseCategory,
  listExpenses,
  setExpenseCategoryActive
} from '../src/main/services/expenses'
import { listTransactions } from '../src/main/services/transactions'
import {
  REPORT_TITLES,
  financialSummary,
  runReport,
  type ReportSpec
} from '../src/main/services/reports'
import { buildReportHtml } from '../src/main/services/report-html'
import { buildReportWorkbook, formatPaisaForExcel, writeWorkbookFileSync } from '../src/main/services/report-export'
import {
  applyRestore,
  createBackup,
  listBackups,
  verifyBackupFile
} from '../src/main/services/backup'
import { changeUserPassword, createUser, listRoles, listUsers, setUserActive, updateUser } from '../src/main/services/users'
import { login } from '../src/main/services/auth'
import type { Actor } from '../src/main/lib/actor'
import * as XLSX from 'xlsx'

let tmpDir: string
let dataDir: string
let db: DatabaseType.Database
let admin: Actor
let adminId: number
let cbc: ReturnType<typeof createTest>
let glucose: ReturnType<typeof createTest>
let patientA: ReturnType<typeof createPatient>
let patientB: ReturnType<typeof createPatient>
let billA: ReturnType<typeof createBill> // patientA SELF, fully paid
let billB: ReturnType<typeof createBill> // patientB REFERRED with practitioner
let practitionerId: number

const spec = (kind: ReportSpec['kind'], from?: string, to?: string): ReportSpec => ({ kind, from, to })

beforeAll(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lmas-cp4-'))
  dataDir = path.join(tmpDir, 'data')
  fs.mkdirSync(dataDir, { recursive: true })
  db = openDatabase(path.join(dataDir, 'lmas.db'))
  runMigrations(db)
  seedIfEmpty(db)

  adminId = (db.prepare("SELECT id FROM users WHERE username = 'admin'").get() as { id: number }).id
  const adminPerms = (
    db
      .prepare(
        "SELECT p.code FROM role_permissions rp JOIN permissions p ON p.id = rp.permission_id JOIN roles r ON r.id = rp.role_id WHERE r.name = 'Administrator'"
      )
      .all() as Array<{ code: string }>
  ).map((r) => r.code)
  admin = { id: adminId, permissions: adminPerms }

  db.prepare(
    "INSERT INTO practitioners (practitioner_code, name, commission_rate_bp) VALUES ('DR-9001', 'Dr. CP4 Referrer', 4000)"
  ).run()
  practitionerId = (db.prepare("SELECT id FROM practitioners WHERE practitioner_code = 'DR-9001'").get() as { id: number }).id

  cbc = createTest(db, adminId, { name: 'CP4 CBC', price_paisa: 80000, direct_cost_paisa: 20000 })
  glucose = createTest(db, adminId, { name: 'CP4 Glucose', price_paisa: 30000 })

  patientA = createPatient(db, adminId, { full_name: 'CP4 Self Patient', gender: 'MALE', age: 30 })
  patientB = createPatient(db, adminId, { full_name: 'CP4 Referred Patient', full_name_urdu: 'مریض چار', gender: 'FEMALE', age: 28 })

  billA = createBill(db, admin, {
    patient_id: patientA.id,
    category: 'SELF',
    items: [{ test_id: cbc.id }, { test_id: glucose.id }],
    discount_paisa: 10000,
    initial_payment_paisa: 100000, // 110000 net → PARTIALLY_PAID
    transaction_id: 'TXN-CP4-A1'
  })
  billB = createBill(db, admin, {
    patient_id: patientB.id,
    category: 'REFERRED',
    practitioner_id: practitionerId,
    items: [{ test_id: cbc.id }],
    discount_paisa: 0,
    initial_payment_paisa: 80000, // full 80000 → PAID, commission accrued
    transaction_id: 'TXN-CP4-B1'
  })

  // Cancelled bill so the unified history contains an ADJUSTMENT entry too.
  const cancelledBill = createBill(db, admin, {
    patient_id: patientA.id,
    category: 'SELF',
    items: [{ test_id: glucose.id }],
    discount_paisa: 0,
    initial_payment_paisa: 0,
    transaction_id: 'TXN-CP4-CANCEL'
  })
  cancelBill(db, admin, cancelledBill.id, 'Patient changed mind before any payment')
})

afterAll(() => {
  db.close()
  fs.rmSync(tmpDir, { recursive: true, force: true })
})

// ---------------------------------------------------------------- refunds

describe('CP4: refund flow completes the bill lifecycle', () => {
  it('refuses refunds for bills without payments and enforces the permission', () => {
    const unpaid = createBill(db, admin, {
      patient_id: patientA.id,
      category: 'SELF',
      items: [{ test_id: glucose.id }],
      discount_paisa: 0,
      initial_payment_paisa: 0,
      transaction_id: 'TXN-CP4-UNPAID'
    })
    expect(() => issueRefund(db, admin, { bill_id: unpaid.id, amount_paisa: 1, reason: 'Nothing paid', method: 'CASH' })).toThrow(
      /no payments to refund/
    )
    const cashier: Actor = { id: adminId, permissions: ['billing.manage'] }
    expect(() => issueRefund(db, cashier, { bill_id: billA.id, amount_paisa: 1, reason: 'No permission', method: 'CASH' })).toThrow(
      /do not have permission/
    )
  })

  it('issues a partial refund then blocks over-refunding, and marks REFUNDED when fully refunded', () => {
    const paid = billA.paid_paisa // 100000
    const refunded = issueRefund(db, admin, { bill_id: billA.id, amount_paisa: 40000, reason: 'Patient left, test not needed', method: 'CASH' })
    expect(refunded.refunded_paisa).toBe(40000)
    expect(refunded.outstanding_paisa).toBe(billA.net_paisa - paid + 40000)
    expect(() =>
      issueRefund(db, admin, { bill_id: billA.id, amount_paisa: paid - 40000 + 1, reason: 'More than received', method: 'CASH' })
    ).toThrow(/exceeds the amount actually received/)
    const full = issueRefund(db, admin, { bill_id: billA.id, amount_paisa: paid - 40000, reason: 'Full refund agreed', method: 'CASH' })
    expect(full.status).toBe('REFUNDED')
    expect(full.outstanding_paisa).toBe(full.net_paisa - paid + full.refunded_paisa)
  })
})

// ---------------------------------------------------------------- commissions

describe('CP4: commission ledger, payments and outstanding', () => {
  it('shows the referred bill accrual as outstanding and reconciles after payment', () => {
    const accounts = listCommissionAccounts(db, true)
    const row = accounts.find((a) => a.practitioner_id === practitionerId)!
    expect(row.accrued_paisa).toBe(32000) // 40% of 80000
    expect(row.paid_paisa).toBe(0)
    expect(row.outstanding_paisa).toBe(32000)

    const ledger = getCommissionLedger(db, practitionerId)
    expect(ledger.entries).toHaveLength(1)
    expect(ledger.entries[0].bill_number).toBe(billB.bill_number)

    const txn = nextCommissionPaymentCode(db)
    expect(txn).toMatch(/^CMP-\d{4}-\d{4}$/)
    const after = recordCommissionPayment(db, admin, {
      practitioner_id: practitionerId,
      amount_paisa: 20000,
      method: 'CASH',
      transaction_id: txn
    })
    expect(after.paid_paisa).toBe(20000)
    expect(after.outstanding_paisa).toBe(12000)
  })

  it('blocks overpayment and duplicate transaction ids (double-count protection)', () => {
    expect(() =>
      recordCommissionPayment(db, admin, {
        practitioner_id: practitionerId,
        amount_paisa: 999999,
        method: 'CASH',
        transaction_id: 'TXN-CP4-OVER'
      })
    ).toThrow(/exceeds the outstanding commission/)
    expect(() =>
      recordCommissionPayment(db, admin, {
        practitioner_id: practitionerId,
        amount_paisa: 1000,
        method: 'CASH',
        transaction_id: 'TXN-CP4-A1' // already used by a patient payment → different table, allowed
      })
    ).not.toThrow()
    expect(() =>
      recordCommissionPayment(db, admin, {
        practitioner_id: practitionerId,
        amount_paisa: 1000,
        method: 'CASH',
        transaction_id: 'TXN-CP4-DUP'
      })
    ).not.toThrow()
    expect(() =>
      recordCommissionPayment(db, admin, {
        practitioner_id: practitionerId,
        amount_paisa: 1000,
        method: 'CASH',
        transaction_id: 'TXN-CP4-DUP'
      })
    ).toThrow(/Duplicate payment blocked/)
  })
})

// ---------------------------------------------------------------- expenses

describe('CP4: expense management', () => {
  it('creates categories and expenses with audit-safe immutability', () => {
    const cat = createExpenseCategory(db, admin, 'CP4 Utilities')
    expect(cat.is_active).toBe(1)
    expect(() => createExpenseCategory(db, admin, 'cp4 UTILITIES')).toThrow(/already exists/)

    const exp = createExpense(db, admin, {
      category_id: cat.id,
      description: 'Electricity bill',
      amount_paisa: 2500000,
      expense_date: '2026-11-01',
      method: 'CASH',
      notes: 'Electricity November invoice'
    })
    expect(exp.expense_code).toMatch(/^EXP-\d{4}-\d{4}$/)
    expect(exp.category_name).toBe('CP4 Utilities')

    const noPerm: Actor = { id: adminId, permissions: ['expenses.view'] }
    expect(() =>
      createExpense(db, noPerm, { category_id: cat.id, description: 'x test', amount_paisa: 100, expense_date: '2026-11-01', method: 'CASH' })
    ).toThrow(/do not have permission/)

    setExpenseCategoryActive(db, admin, cat.id, false)
    expect(() =>
      createExpense(db, admin, { category_id: cat.id, description: 'Deactivated category', amount_paisa: 100, expense_date: '2026-11-01', method: 'CASH' })
    ).toThrow(/deactivated/)

    const list = listExpenses(db, { from: '2026-11-01', to: '2026-11-30' })
    expect(list.total_paisa).toBeGreaterThanOrEqual(2500000)
    expect(list.rows.find((r) => r.id === exp.id)).toBeDefined()
  })
})

// ---------------------------------------------------------------- transactions

describe('CP4: unified transaction history (PRD Module H)', () => {
  it('collects patient payments, commission payments, expenses, refunds and adjustments', () => {
    const all = listTransactions(db, { pageSize: 200 })
    const types = new Set(all.rows.map((r) => r.txn_type))
    expect(types.has('PATIENT_PAYMENT')).toBe(true)
    expect(types.has('COMMISSION_PAYMENT')).toBe(true)
    expect(types.has('EXPENSE')).toBe(true)
    expect(types.has('REFUND')).toBe(true)
    expect(types.has('ADJUSTMENT')).toBe(true)

    const refunds = listTransactions(db, { type: 'REFUND' })
    expect(refunds.rows.length).toBeGreaterThanOrEqual(2)
    expect(refunds.rows.every((r) => r.amount_paisa > 0)).toBe(true)
    expect(all.inflow_paisa).toBeGreaterThan(0)
    expect(all.outflow_paisa).toBeGreaterThan(0)
  })

  it('filters by type, date range and free text', () => {
    const expenses = listTransactions(db, { type: 'EXPENSE', query: 'Electricity' })
    expect(expenses.rows.length).toBeGreaterThanOrEqual(1)
    const none = listTransactions(db, { type: 'EXPENSE', from: '2030-01-01', to: '2030-01-31' })
    expect(none.rows).toHaveLength(0)
    const byRef = listTransactions(db, { query: 'CMP-' })
    expect(byRef.rows.length).toBeGreaterThanOrEqual(1)
  })
})

// ---------------------------------------------------------------- reports

describe('CP4: financial reports reconcile with underlying transactions', () => {
  it('financial summary: outstanding = net billed - collected + refunded (all time)', () => {
    const s = financialSummary(db, '2026-01-01', '2026-12-31')
    const netBilled = s.netPaisa
    const netPaid = (
      db.prepare("SELECT COALESCE(SUM(amount_paisa), 0) AS v FROM payments p JOIN bills b ON b.id = p.bill_id WHERE b.status <> 'CANCELLED'").get() as { v: number }
    ).v
    const netRefunded = (
      db.prepare("SELECT COALESCE(SUM(amount_paisa), 0) AS v FROM refunds r JOIN bills b ON b.id = r.bill_id WHERE b.status <> 'CANCELLED'").get() as { v: number }
    ).v
    expect(s.collectedPaisa).toBe(netPaid)
    expect(s.outstandingPaisa).toBe(netBilled - netPaid + netRefunded)
    // profit identity: net - commission - direct costs - expenses
    const directCosts = (
      db.prepare("SELECT COALESCE(SUM(COALESCE(bi.direct_cost_paisa, 0)), 0) AS v FROM bill_items bi JOIN bills b ON b.id = bi.bill_id WHERE b.status <> 'CANCELLED'").get() as { v: number }
    ).v
    const expenses = (db.prepare('SELECT COALESCE(SUM(amount_paisa), 0) AS v FROM expenses').get() as { v: number }).v
    const commission = (db.prepare('SELECT COALESCE(SUM(commission_paisa), 0) AS v FROM practitioner_commission_entries').get() as { v: number }).v
    expect(s.estimatedNetProfitPaisa).toBe(netBilled - commission - directCosts - expenses)
  })

  it('daily/monthly reports: rows reconcile with summary totals', () => {
    const monthly = runReport(db, spec('MONTHLY', '2026-01-01', '2026-12-31'))
    expect(monthly.title).toBe(REPORT_TITLES.MONTHLY)
    const sum = monthly.totals
    const s = financialSummary(db, '2026-01-01', '2026-12-31')
    expect(sum.billed).toBe(s.netPaisa)
    expect(sum.expenses).toBe(s.operatingExpensesPaisa)
    expect(sum.profit).toBe(s.estimatedNetProfitPaisa)

    const daily = runReport(db, spec('DAILY', '2026-11-01', '2026-11-01'))
    expect(daily.rows.every((r) => typeof r.grp === 'string')).toBe(true)
  })

  it('self/referred reports split by category with per-bill rows', () => {
    const self = runReport(db, spec('SELF', '2026-01-01', '2026-12-31'))
    expect(self.rows.length).toBeGreaterThanOrEqual(1)
    expect(self.rows.every((r) => String(r.bill_number).length > 0)).toBe(true)
    const referred = runReport(db, spec('REFERRED', '2026-01-01', '2026-12-31'))
    expect(referred.rows.map((r) => String(r.bill_number))).toContain(billB.bill_number)
    expect(referred.rows.map((r) => String(r.bill_number))).not.toContain(billA.bill_number)
  })

  it('commissions report outstanding matches the ledger', () => {
    const rep = runReport(db, spec('COMMISSIONS', '2026-01-01', '2026-12-31'))
    const row = rep.rows.find((r) => r.practitioner === 'Dr. CP4 Referrer') as { accrued: number; paid: number; outstanding: number }
    const ledger = getCommissionLedger(db, practitionerId)
    expect(row.accrued).toBe(ledger.accrued_paisa)
    expect(row.paid).toBe(ledger.paid_paisa)
    expect(row.outstanding).toBe(ledger.outstanding_paisa)
  })

  it('expenses report groups by category and totals match', () => {
    const rep = runReport(db, spec('EXPENSES', '2026-01-01', '2026-12-31'))
    expect((rep.totals.total as number) ?? 0).toBeGreaterThan(0)
    const listTotal = listExpenses(db, { from: '2026-01-01', to: '2026-12-31' }).total_paisa
    expect(rep.totals.total).toBe(listTotal)
  })

  it('outstanding report lists only open balances and totals them', () => {
    const rep = runReport(db, spec('OUTSTANDING'))
    for (const r of rep.rows) expect(Number(r.outstanding)).toBeGreaterThan(0)
    const total = rep.rows.reduce((s, r) => s + Number(r.outstanding), 0)
    expect(rep.totals.outstanding).toBe(total)
  })

  it('cash report groups by method with per-payment rows', () => {
    const rep = runReport(db, spec('CASH', '2026-01-01', '2026-12-31'))
    expect(rep.rows.length).toBeGreaterThanOrEqual(2)
    const total = rep.rows.reduce((s, r) => s + Number(r.amount), 0)
    expect(rep.totals.amount).toBe(total)
    expect(rep.figures.some((f) => f.label.startsWith('By cash'))).toBe(true)
  })
})

// ---------------------------------------------------------------- exports

describe('CP4: PDF-ready HTML and Excel workbook exports', () => {
  it('renders the A4 report HTML with lab identity, totals and Urdu-safe cells', () => {
    const rep = runReport(db, spec('REFERRED', '2026-01-01', '2026-12-31'))
    const html = buildReportHtml(rep, { 'lab.name': 'City Diagnostic Lab' }, '2026-11-08 09:00')
    expect(html).toContain('City Diagnostic Lab')
    expect(html).toContain('Referred-patient financial report')
    expect(html).toContain('PKR')
    expect(html).toContain('dir="rtl"') // Urdu patient name
  })

  it('writes a valid .xlsx workbook that re-opens with matching totals', () => {
    const rep = runReport(db, spec('CUSTOM', '2026-01-01', '2026-12-31'))
    const sheets = buildReportWorkbook(rep, { 'lab.name': 'City Diagnostic Lab' })
    expect(sheets[0].name).toBe('Report')
    const file = path.join(tmpDir, 'cp4-report.xlsx')
    writeWorkbookFileSync(sheets, file)
    expect(fs.existsSync(file)).toBe(true)
    expect(fs.statSync(file).size).toBeGreaterThan(500)
    const wb = XLSX.readFile(file)
    expect(wb.SheetNames).toContain('Report')
    const grid = XLSX.utils.sheet_to_json<string[]>(wb.Sheets['Report'], { header: 1 })
    const flat = grid.flat().map((c) => String(c))
    expect(flat).toContain('Net billed')
    expect(formatPaisaForExcel(123456)).toBe('PKR 1,234.56')
  })
})

// ---------------------------------------------------------------- backups

describe('CP4: backup and restore', () => {
  it('creates a verified backup, records history and rejects corrupt files', () => {
    const backup = createBackup(db, dataDir, adminId, 'MANUAL')
    expect(backup.status).toBe('OK')
    expect(backup.verified).toBe(1)
    expect(fs.existsSync(backup.file_path)).toBe(true)

    const history = listBackups(db)
    expect(history.length).toBeGreaterThanOrEqual(1)
    expect(history[0].file_path).toBe(backup.file_path)

    const garbage = path.join(tmpDir, 'garbage.db')
    fs.writeFileSync(garbage, 'this is not a database')
    const v = verifyBackupFile(garbage)
    expect(v.ok).toBe(false)
    expect(verifyBackupFile(backup.file_path).ok).toBe(true)
  })

  it('restores an earlier snapshot: data modified after backup is reverted', () => {
    const backup = createBackup(db, dataDir, adminId, 'MANUAL')
    // Mutate: add a brand-new patient after the backup.
    const victim = createPatient(db, adminId, { full_name: 'Vanishing Patient', gender: 'FEMALE' })
    expect((db.prepare('SELECT COUNT(*) AS n FROM patients WHERE id = ?').get(victim.id) as { n: number }).n).toBe(1)

    db.close()
    const verification = applyRestore(openDatabase(path.join(dataDir, 'lmas.db')), path.join(dataDir, 'lmas.db'), backup.file_path)
    expect(verification.ok).toBe(true)

    db = openDatabase(path.join(dataDir, 'lmas.db'))
    expect((db.prepare('SELECT COUNT(*) AS n FROM patients WHERE id = ?').get(victim.id) as { n: number }).n).toBe(0)
    // core data survived the restore
    expect((db.prepare('SELECT COUNT(*) AS n FROM bills').get() as { n: number }).n).toBeGreaterThanOrEqual(2)
  })
})

// ---------------------------------------------------------------- users

describe('CP4: user management', () => {
  it('creates a user with role, audits it, and the user can log in', () => {
    const roles = listRoles(db)
    const techRole = roles.find((r) => r.name === 'Technician')!
    expect(roles.length).toBeGreaterThanOrEqual(3)
    expect(techRole.permission_codes).toContain('test_results.manage')

    const user = createUser(db, adminId, {
      username: 'cp4front',
      password: 'Front@45678',
      full_name: 'CP4 Front Desk',
      role_id: roles.find((r) => r.name === 'Receptionist')!.id
    })
    expect(user.must_change_password).toBe(1)
    expect(() =>
      createUser(db, adminId, { username: 'CP4FRONT', password: 'Whatever@123', full_name: 'Dup', role_id: techRole.id })
    ).toThrow(/already taken/)
    expect(() =>
      createUser(db, adminId, { username: 'shortpw', password: 'short', full_name: 'Bad', role_id: techRole.id })
    ).toThrow(/at least 8/)

    const session = login(db, 'cp4front', 'Front@45678')
    expect(session.user.roleName).toBe('Receptionist')
    expect(session.user.mustChangePassword).toBe(true)
  })

  it('updates role/name, changes passwords and enforces last-admin guards', () => {
    const roles = listRoles(db)
    const users = listUsers(db)
    const front = users.find((u) => u.username === 'cp4front')!
    const updated = updateUser(db, adminId, front.id, { role_id: roles.find((r) => r.name === 'Technician')!.id, full_name: 'CP4 Renamed' })
    expect(updated.role_name).toBe('Technician')

    changeUserPassword(db, adminId, front.id, 'Changed@45678', { mustChangePassword: false })
    const session = login(db, 'cp4front', 'Changed@45678')
    expect(session.user.mustChangePassword).toBe(false)

    const adminUser = users.find((u) => u.role_name === 'Administrator' && u.is_active === 1)!
    expect(() => setUserActive(db, adminUser.id, adminUser.id, false)).toThrow(/cannot deactivate your own/)
    const otherAdmins = users.filter((u) => u.role_name === 'Administrator' && u.is_active === 1 && u.id !== adminUser.id)
    for (const a of otherAdmins) {
      setUserActive(db, adminId, a.id, false)
      expect(() => updateUser(db, adminId, adminUser.id, { role_id: roles.find((r) => r.name === 'Technician')!.id })).toThrow(
        /last active Administrator/
      )
      setUserActive(db, adminId, a.id, true)
    }
  })

  it('deactivated users cannot log in', () => {
    const roles = listRoles(db)
    const temp = createUser(db, adminId, { username: 'cp4temp', password: 'Temp@45678', full_name: 'Temp User', role_id: roles.find((r) => r.name === 'Technician')!.id })
    setUserActive(db, adminId, temp.id, false)
    expect(() => login(db, 'cp4temp', 'Temp@45678')).toThrow(/inactive/)
  })
})

// ---------------------------------------------------------------- audit trail

describe('CP4: audit log viewer data', () => {
  it('records the important CP4 actions with users and reasons', () => {
    const actions = new Set(
      (db.prepare("SELECT action FROM audit_logs WHERE action LIKE 'USER%' OR action IN ('COMMISSION_PAYMENT','EXPENSE_CREATE','REFUND_ISSUED','BACKUP_CREATED')").all() as Array<{ action: string }>).map((r) => r.action)
    )
    for (const expected of ['COMMISSION_PAYMENT', 'EXPENSE_CREATE', 'REFUND_ISSUED', 'BACKUP_CREATED', 'USER_CREATE']) {
      expect(actions.has(expected)).toBe(true)
    }
  })
})

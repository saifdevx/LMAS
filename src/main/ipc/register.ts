import { ipcMain, dialog } from 'electron'
import fs from 'node:fs'
import path from 'node:path'
import type Database from 'better-sqlite3'
import { z, ZodError, type ZodType } from 'zod'
import type { SessionInfo } from '../../shared/api-types'
import { hasPermission } from '../../shared/permissions'
import { login, logout, verifySession, AuthError } from '../services/auth'
import { getSettings, updateSettings } from '../services/settings'
import { getDashboardOverview } from '../services/dashboard'
import { createPatient, getPatientProfile, searchPatients, updatePatient } from '../services/patients'
import {
  createPractitioner,
  getPractitionerAccount,
  listPractitioners,
  setPractitionerActive,
  updateCommissionRate,
  updatePractitioner
} from '../services/practitioners'
import { createCategory, createTest, listCategories, listTests, setTestActive, updateTest } from '../services/tests'
import { addPayment, cancelBill, createBill, getBill, issueRefund, listBills } from '../services/billing'
import { getCommissionLedger, listCommissionAccounts, nextCommissionPaymentCode, recordCommissionPayment } from '../services/commissions'
import { createExpense, createExpenseCategory, listExpenseCategories, listExpenses, setExpenseCategoryActive } from '../services/expenses'
import { listTransactions } from '../services/transactions'
import { runReport } from '../services/reports'
import { exportReportExcel, exportReportPdf } from '../services/report-export'
import { changeOwnPassword, changeUserPassword, createUser, listRoles, listUsers, setUserActive, updateUser } from '../services/users'
import { applyRestore, createBackup, listBackups, verifyBackupFile } from '../services/backup'
import {
  approveResult,
  createSample,
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
} from '../services/lab'
import { exportLabReportPdf, printLabReport } from '../services/lab-report-print'
import { exportReceiptPdf, printReceipt } from '../services/receipt-print'
import {
  activeSchema,
  addPaymentSchema,
  billCreateSchema,
  billListSchema,
  cancelBillSchema,
  categoryNameSchema,
  idSchema,
  includeInactiveSchema,
  loginSchema,
  patientCreateSchema,
  patientSearchSchema,
  patientUpdateSchema,
  practitionerCreateSchema,
  practitionerRateSchema,
  practitionerUpdateSchema,
  receiptSchema,
  testCreateSchema,
  testListSchema,
  testUpdateSchema,
  tokenSchema,
  updateSettingsSchema,
  overviewSchema,
  labBillSchema,
  labCreateSampleSchema,
  labItemSchema,
  labPatientSchema,
  labResetResultSchema,
  labSaveResultSchema,
  labTestStatusSchema,
  labUpdateSampleSchema,
  labWorklistSchema,
  refundSchema,
  commissionPaySchema,
  commissionTxnCodeSchema,
  expenseCreateSchema,
  expenseListSchema,
  reportSpecSchema,
  transactionsListSchema,
  userCreateSchema,
  userUpdateSchema,
  userPasswordSchema,
  ownPasswordSchema,
  backupRestoreSchema,
  auditListSchema
} from './schemas'

/**
 * All database access goes through these validated IPC handlers
 * (PRD §7.2: the frontend must never directly modify the SQLite database).
 * Protected channels verify the session token and check permissions; the
 * actor (id + permissions) is passed down to services for defense in depth.
 */

function requireSession(db: Database.Database, token: string): SessionInfo {
  const session = verifySession(db, token)
  if (!session) throw new Error('Your session has expired. Please sign in again.')
  return session
}

function requirePermission(session: SessionInfo, permission: string): void {
  if (!hasPermission(session.user.permissions, permission)) {
    throw new Error(`You do not have permission to perform this action (${permission}).`)
  }
}

function actorOf(session: SessionInfo): { id: number; permissions: string[] } {
  return { id: session.user.id, permissions: session.user.permissions }
}

function handle<T>(channel: string, schema: ZodType<T>, fn: (input: T) => unknown): void {
  ipcMain.handle(channel, (_event, raw: unknown) => {
    try {
      const parsed = schema.parse(raw)
      return fn(parsed)
    } catch (err) {
      if (err instanceof ZodError) {
        const first = err.issues[0]
        throw new Error(first ? first.message : 'Invalid input')
      }
      if (err instanceof AuthError) throw new Error(err.message)
      if (err instanceof Error) throw new Error(err.message)
      throw new Error('Unexpected error')
    }
  })
}

export function registerIpc(db: Database.Database, dataDir: string): void {
  // ---------- auth ----------
  handle('auth:login', loginSchema, (input) => login(db, input.username, input.password))
  handle('auth:session', tokenSchema, (input) => verifySession(db, input.token))
  handle('auth:logout', tokenSchema, (input) => logout(db, input.token))

  // ---------- settings ----------
  handle('settings:get', z.unknown(), () => getSettings(db))
  handle('settings:update', updateSettingsSchema, (input) => {
    const session = requireSession(db, input.token)
    requirePermission(session, 'settings.manage')
    return updateSettings(db, input.values, session.user.id)
  })
  handle('settings:uploadLogo', tokenSchema, async (input) => {
    const session = requireSession(db, input.token)
    requirePermission(session, 'settings.manage')
    const result = await dialog.showOpenDialog({
      title: 'Choose laboratory logo',
      properties: ['openFile'],
      filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'svg', 'webp'] }]
    })
    const file = result.filePaths[0]
    if (file) {
      const ext = path.extname(file).toLowerCase() || '.png'
      const dest = path.join(dataDir, `lab-logo${ext}`)
      try {
        fs.copyFileSync(file, dest)
        updateSettings(db, { 'lab.logoPath': dest }, session.user.id)
      } catch (err) {
        throw new Error(`Could not copy the logo file: ${err instanceof Error ? err.message : 'unknown error'}`)
      }
    }
    return getSettings(db)
  })

  // ---------- dashboard ----------
  handle('dashboard:overview', overviewSchema, (input) => {
    const session = requireSession(db, input.token)
    requirePermission(session, 'dashboard.view')
    return getDashboardOverview(db, input.period)
  })

  // ---------- patients ----------
  handle('patients:create', patientCreateSchema, (input) => {
    const session = requireSession(db, input.token)
    requirePermission(session, 'patients.manage')
    return createPatient(db, session.user.id, input.input)
  })
  handle('patients:update', patientUpdateSchema, (input) => {
    const session = requireSession(db, input.token)
    requirePermission(session, 'patients.manage')
    return updatePatient(db, session.user.id, input.id, input.input)
  })
  handle('patients:search', patientSearchSchema, (input) => {
    const session = requireSession(db, input.token)
    requirePermission(session, 'patients.view')
    return searchPatients(db, input.query)
  })
  handle('patients:get', idSchema, (input) => {
    const session = requireSession(db, input.token)
    requirePermission(session, 'patients.view')
    return getPatientProfile(db, input.id)
  })

  // ---------- practitioners ----------
  handle('practitioners:list', includeInactiveSchema, (input) => {
    const session = requireSession(db, input.token)
    requirePermission(session, 'practitioners.view')
    return listPractitioners(db, input.includeInactive)
  })
  handle('practitioners:create', practitionerCreateSchema, (input) => {
    const session = requireSession(db, input.token)
    requirePermission(session, 'practitioners.manage')
    return createPractitioner(db, session.user.id, input.input)
  })
  handle('practitioners:update', practitionerUpdateSchema, (input) => {
    const session = requireSession(db, input.token)
    requirePermission(session, 'practitioners.manage')
    return updatePractitioner(db, session.user.id, input.id, input.input)
  })
  handle('practitioners:setActive', activeSchema, (input) => {
    const session = requireSession(db, input.token)
    requirePermission(session, 'practitioners.manage')
    setPractitionerActive(db, session.user.id, input.id, input.active)
  })
  handle('practitioners:updateRate', practitionerRateSchema, (input) => {
    const session = requireSession(db, input.token)
    requirePermission(session, 'practitioners.manage')
    return updateCommissionRate(db, session.user.id, input.id, input.rate_bp, input.reason)
  })
  handle('practitioners:account', idSchema, (input) => {
    const session = requireSession(db, input.token)
    requirePermission(session, 'practitioners.view')
    return getPractitionerAccount(db, input.id)
  })

  // ---------- test catalog ----------
  handle('tests:list', testListSchema, (input) => {
    const session = requireSession(db, input.token)
    requirePermission(session, 'lab_tests.view')
    return listTests(db, { query: input.query, categoryId: input.categoryId, includeInactive: input.includeInactive })
  })
  handle('tests:create', testCreateSchema, (input) => {
    const session = requireSession(db, input.token)
    requirePermission(session, 'lab_tests.manage')
    return createTest(db, session.user.id, input.input)
  })
  handle('tests:update', testUpdateSchema, (input) => {
    const session = requireSession(db, input.token)
    requirePermission(session, 'lab_tests.manage')
    return updateTest(db, session.user.id, input.id, input.input)
  })
  handle('tests:setActive', activeSchema, (input) => {
    const session = requireSession(db, input.token)
    requirePermission(session, 'lab_tests.manage')
    setTestActive(db, session.user.id, input.id, input.active)
  })
  handle('testCategories:list', tokenSchema, (input) => {
    const session = requireSession(db, input.token)
    requirePermission(session, 'lab_tests.view')
    return listCategories(db)
  })
  handle('testCategories:create', categoryNameSchema, (input) => {
    const session = requireSession(db, input.token)
    requirePermission(session, 'lab_tests.manage')
    return createCategory(db, session.user.id, input.name)
  })

  // ---------- billing ----------
  handle('bills:create', billCreateSchema, (input) => {
    const session = requireSession(db, input.token)
    requirePermission(session, 'billing.manage')
    return createBill(db, actorOf(session), input.input)
  })
  handle('bills:get', idSchema, (input) => {
    const session = requireSession(db, input.token)
    requirePermission(session, 'billing.view')
    return getBill(db, input.id)
  })
  handle('bills:list', billListSchema, (input) => {
    const session = requireSession(db, input.token)
    requirePermission(session, 'billing.view')
    return listBills(db, input.filters)
  })
  handle('bills:cancel', cancelBillSchema, (input) => {
    const session = requireSession(db, input.token)
    requirePermission(session, 'bills.cancel')
    return cancelBill(db, actorOf(session), input.id, input.reason)
  })
  handle('bills:addPayment', addPaymentSchema, (input) => {
    const session = requireSession(db, input.token)
    requirePermission(session, 'billing.manage')
    return addPayment(db, actorOf(session), input.input)
  })

  // ---------- receipts ----------
  handle('receipt:print', receiptSchema, (input) => {
    const session = requireSession(db, input.token)
    requirePermission(session, 'billing.view')
    return printReceipt(db, dataDir, input.bill_id, input.layout)
  })
  handle('receipt:pdf', receiptSchema, (input) => {
    const session = requireSession(db, input.token)
    requirePermission(session, 'billing.view')
    return exportReceiptPdf(db, dataDir, input.bill_id, input.layout, session.user.id)
  })

  // ---------- laboratory workflow (Checkpoint 3, PRD §Module F) ----------
  handle('lab:worklist', labWorklistSchema, (input) => {
    const session = requireSession(db, input.token)
    requirePermission(session, 'test_results.view')
    return listWork(db, input.filters)
  })
  handle('lab:billWork', labBillSchema, (input) => {
    const session = requireSession(db, input.token)
    requirePermission(session, 'test_results.view')
    return getBillWork(db, input.bill_id)
  })
  handle('lab:saveResult', labSaveResultSchema, (input) => {
    const session = requireSession(db, input.token)
    requirePermission(session, 'test_results.manage')
    return saveResult(db, actorOf(session), input.input)
  })
  handle('lab:setTestStatus', labTestStatusSchema, (input) => {
    const session = requireSession(db, input.token)
    requirePermission(session, 'test_results.manage')
    return setTestStatus(db, actorOf(session), input.bill_item_id, input.status, input.reason)
  })
  handle('lab:createSample', labCreateSampleSchema, (input) => {
    const session = requireSession(db, input.token)
    requirePermission(session, 'test_results.manage')
    return createSample(db, actorOf(session), input.input)
  })
  handle('lab:updateSample', labUpdateSampleSchema, (input) => {
    const session = requireSession(db, input.token)
    requirePermission(session, 'test_results.manage')
    return updateSample(db, actorOf(session), input.sample_id, input.patch, input.reason)
  })
  handle('lab:verifyResult', labItemSchema, (input) => {
    const session = requireSession(db, input.token)
    requirePermission(session, 'results.approve')
    return verifyResult(db, actorOf(session), input.bill_item_id)
  })
  handle('lab:approveResult', labItemSchema, (input) => {
    const session = requireSession(db, input.token)
    requirePermission(session, 'results.approve')
    return approveResult(db, actorOf(session), input.bill_item_id)
  })
  handle('lab:resetResult', labResetResultSchema, (input) => {
    const session = requireSession(db, input.token)
    requirePermission(session, 'results.approve')
    return resetResult(db, actorOf(session), input.bill_item_id, input.reason)
  })
  handle('lab:revisions', labItemSchema, (input) => {
    const session = requireSession(db, input.token)
    requirePermission(session, 'test_results.view')
    return listRevisions(db, input.bill_item_id)
  })
  handle('lab:patientHistory', labPatientSchema, (input) => {
    const session = requireSession(db, input.token)
    requirePermission(session, 'test_results.view')
    return patientHistory(db, input.patient_id)
  })
  handle('lab:technicians', tokenSchema, (input) => {
    const session = requireSession(db, input.token)
    requirePermission(session, 'test_results.view')
    return listTechnicians(db)
  })
  handle('lab:reportPrint', labBillSchema, (input) => {
    const session = requireSession(db, input.token)
    requirePermission(session, 'test_results.view')
    return printLabReport(db, dataDir, input.bill_id, session.user.id)
  })
  handle('lab:reportPdf', labBillSchema, (input) => {
    const session = requireSession(db, input.token)
    requirePermission(session, 'test_results.view')
    return exportLabReportPdf(db, dataDir, input.bill_id, session.user.id)
  })

  // ---------- refunds (Checkpoint 4) ----------
  handle('bills:refund', refundSchema, (input) => {
    const session = requireSession(db, input.token)
    requirePermission(session, 'refunds.issue')
    return issueRefund(db, actorOf(session), input.input)
  })

  // ---------- commissions (Checkpoint 4, PRD §Module G) ----------
  handle('commissions:accounts', includeInactiveSchema, (input) => {
    const session = requireSession(db, input.token)
    requirePermission(session, 'commissions.view')
    return listCommissionAccounts(db, input.includeInactive)
  })
  handle('commissions:ledger', idSchema, (input) => {
    const session = requireSession(db, input.token)
    requirePermission(session, 'commissions.view')
    return getCommissionLedger(db, input.id)
  })
  handle('commissions:pay', commissionPaySchema, (input) => {
    const session = requireSession(db, input.token)
    requirePermission(session, 'commissions.manage')
    return recordCommissionPayment(db, actorOf(session), input.input)
  })
  handle('commissions:nextTxnCode', commissionTxnCodeSchema, (input) => {
    const session = requireSession(db, input.token)
    requirePermission(session, 'commissions.manage')
    return nextCommissionPaymentCode(db)
  })

  // ---------- expenses (Checkpoint 4, PRD §3.7) ----------
  handle('expenseCategories:list', includeInactiveSchema, (input) => {
    const session = requireSession(db, input.token)
    requirePermission(session, 'expenses.view')
    return listExpenseCategories(db, input.includeInactive)
  })
  handle('expenseCategories:create', categoryNameSchema, (input) => {
    const session = requireSession(db, input.token)
    return createExpenseCategory(db, actorOf(session), input.name)
  })
  handle('expenseCategories:setActive', activeSchema, (input) => {
    const session = requireSession(db, input.token)
    return setExpenseCategoryActive(db, actorOf(session), input.id, input.active)
  })
  handle('expenses:create', expenseCreateSchema, (input) => {
    const session = requireSession(db, input.token)
    requirePermission(session, 'expenses.manage')
    return createExpense(db, actorOf(session), input.input)
  })
  handle('expenses:list', expenseListSchema, (input) => {
    const session = requireSession(db, input.token)
    requirePermission(session, 'expenses.view')
    return listExpenses(db, input.filters)
  })

  // ---------- reports & exports (Checkpoint 4, PRD §Module I) ----------
  handle('reports:run', reportSpecSchema, (input) => {
    const session = requireSession(db, input.token)
    requirePermission(session, 'reports.view')
    return runReport(db, input.spec)
  })
  handle('reports:exportPdf', reportSpecSchema, async (input) => {
    const session = requireSession(db, input.token)
    return exportReportPdf(db, dataDir, actorOf(session), input.spec)
  })
  handle('reports:exportExcel', reportSpecSchema, async (input) => {
    const session = requireSession(db, input.token)
    return exportReportExcel(db, actorOf(session), input.spec)
  })

  // ---------- transaction history (Checkpoint 4, PRD §Module H) ----------
  handle('transactions:list', transactionsListSchema, (input) => {
    const session = requireSession(db, input.token)
    requirePermission(session, 'transactions.view')
    return listTransactions(db, input.filters)
  })

  // ---------- user management (Checkpoint 4, PRD §Module J) ----------
  handle('users:list', tokenSchema, (input) => {
    const session = requireSession(db, input.token)
    requirePermission(session, 'users.manage')
    return listUsers(db)
  })
  handle('roles:list', tokenSchema, (input) => {
    const session = requireSession(db, input.token)
    requirePermission(session, 'users.manage')
    return listRoles(db)
  })
  handle('users:create', userCreateSchema, (input) => {
    const session = requireSession(db, input.token)
    requirePermission(session, 'users.manage')
    return createUser(db, session.user.id, input.input)
  })
  handle('users:update', userUpdateSchema, (input) => {
    const session = requireSession(db, input.token)
    requirePermission(session, 'users.manage')
    return updateUser(db, session.user.id, input.id, input.input)
  })
  handle('users:setActive', activeSchema, (input) => {
    const session = requireSession(db, input.token)
    requirePermission(session, 'users.manage')
    return setUserActive(db, session.user.id, input.id, input.active)
  })
  handle('users:setPassword', userPasswordSchema, (input) => {
    const session = requireSession(db, input.token)
    requirePermission(session, 'users.manage')
    changeUserPassword(db, session.user.id, input.id, input.password, { mustChangePassword: input.mustChange })
  })
  handle('users:changeOwnPassword', ownPasswordSchema, (input) => {
    const session = requireSession(db, input.token)
    changeOwnPassword(db, session.user.id, input.current_password, input.new_password)
  })

  // ---------- backups (Checkpoint 4, PRD §Module J) ----------
  handle('backups:list', tokenSchema, (input) => {
    const session = requireSession(db, input.token)
    requirePermission(session, 'backup.manage')
    return listBackups(db)
  })
  handle('backups:create', tokenSchema, (input) => {
    const session = requireSession(db, input.token)
    requirePermission(session, 'backup.manage')
    return createBackup(db, dataDir, session.user.id, 'MANUAL')
  })
  handle('backups:verify', backupRestoreSchema, (input) => {
    const session = requireSession(db, input.token)
    requirePermission(session, 'backup.manage')
    return verifyBackupFile(input.filePath)
  })
  handle('backups:restore', backupRestoreSchema, (input) => {
    const session = requireSession(db, input.token)
    requirePermission(session, 'backup.manage')
    // Verifies, closes the DB, replaces the file and writes the audit row,
    // then relaunches the application so every handle reopens fresh.
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { app } = require('electron') as typeof import('electron')
    applyRestore(db, path.join(dataDir, 'lmas.db'), input.filePath)
    setTimeout(() => {
      app.relaunch()
      app.exit(0)
    }, 400)
    return true
  })

  // ---------- audit log (Checkpoint 4, PRD §8) ----------
  handle('audit:list', auditListSchema, (input) => {
    const session = requireSession(db, input.token)
    requirePermission(session, 'users.manage')
    const offset = (input.page - 1) * input.pageSize
    const q = (input.query ?? '').trim()
    const where = q
      ? "WHERE (a.action LIKE '%' || @q || '%' OR a.entity_type LIKE '%' || @q || '%' OR IFNULL(a.entity_id, '') LIKE '%' || @q || '%' OR IFNULL(u.full_name, '') LIKE '%' || @q || '%')"
      : ''
    const params = { q, limit: input.pageSize, offset }
    const total = (
      db.prepare(`SELECT COUNT(*) AS n FROM audit_logs a LEFT JOIN users u ON u.id = a.user_id ${where}`).get(params) as { n: number }
    ).n
    const rows = db
      .prepare(
        `SELECT a.id, a.action, a.entity_type, a.entity_id, a.old_value, a.new_value, a.reason, a.created_at,
                u.full_name AS user_name
         FROM audit_logs a LEFT JOIN users u ON u.id = a.user_id
         ${where}
         ORDER BY a.id DESC LIMIT @limit OFFSET @offset`
      )
      .all(params) as Array<Record<string, unknown>>
    return { rows, total }
  })
}

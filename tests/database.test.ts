import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import type DatabaseType from 'better-sqlite3'
import { openDatabase } from '../src/main/db/connection'
import { runMigrations, currentVersion } from '../src/main/db/migrator'
import { MIGRATIONS } from '../src/main/db/migrations'
import { seedIfEmpty } from '../src/main/db/seed'
import { login, verifySession, logout, AuthError } from '../src/main/services/auth'
import { getSettings, updateSettings } from '../src/main/services/settings'
import { listAudit } from '../src/main/services/audit'
import { getDashboardOverview } from '../src/main/services/dashboard'
import { hashPassword, verifyPassword } from '../src/main/lib/password'

let tmpDir: string
let db: DatabaseType.Database

beforeAll(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lmas-test-'))
  db = openDatabase(path.join(tmpDir, 'lmas.db'))
  runMigrations(db)
  seedIfEmpty(db)
})

afterAll(() => {
  db.close()
  fs.rmSync(tmpDir, { recursive: true, force: true })
})

describe('migrations & seed (Checkpoint 1 acceptance)', () => {
  it('applies the schema and records the version', () => {
    expect(currentVersion(db)).toBe(MIGRATIONS[MIGRATIONS.length - 1].version)
    const tables = (
      db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name").all() as Array<{ name: string }>
    ).map((r) => r.name)
    for (const expected of [
      'users', 'roles', 'permissions', 'role_permissions', 'patients', 'visits', 'practitioners',
      'practitioner_commission_history', 'test_categories', 'laboratory_tests', 'bills', 'bill_items',
      'samples', 'test_results', 'result_revisions', 'payments', 'practitioner_commission_entries',
      'practitioner_payments', 'expenses', 'expense_categories', 'refunds', 'adjustments',
      'audit_logs', 'application_settings', 'backup_history', 'lab_reports'
    ]) {
      expect(tables).toContain(expected)
    }
  })

  it('seeds roles, permissions, admin user and settings exactly once', () => {
    const roles = (db.prepare('SELECT COUNT(*) AS n FROM roles').get() as { n: number }).n
    const perms = (db.prepare('SELECT COUNT(*) AS n FROM permissions').get() as { n: number }).n
    const admins = db.prepare("SELECT * FROM users WHERE username = 'admin'").all().length
    expect(roles).toBe(3)
    expect(perms).toBeGreaterThanOrEqual(25)
    expect(admins).toBe(1)
    seedIfEmpty(db) // second call must be a no-op
    expect((db.prepare('SELECT COUNT(*) AS n FROM roles').get() as { n: number }).n).toBe(3)
  })

  it('enforces foreign keys (PRD §6.1 rule 3)', () => {
    expect(() =>
      db
        .prepare("INSERT INTO visits (visit_code, patient_id, category, visit_date) VALUES ('V-X', 99999, 'SELF', '2026-01-01')")
        .run()
    ).toThrow(/FOREIGN KEY/)
  })

  it('blocks duplicate payment transaction IDs (PRD Scenario 8 mechanism)', () => {
    const patientId = Number(
      (db.prepare("INSERT INTO patients (patient_code, full_name, gender) VALUES ('PAT-T1', 'Test Patient', 'MALE')").run() as { lastInsertRowid: number | bigint }).lastInsertRowid
    )
    const visitId = Number(
      (db.prepare("INSERT INTO visits (visit_code, patient_id, category, visit_date) VALUES ('VIS-T1', ?, 'SELF', '2026-01-01')").run(patientId) as { lastInsertRowid: number | bigint }).lastInsertRowid
    )
    const billId = Number(
      (db
        .prepare(
          "INSERT INTO bills (bill_number, visit_id, patient_id, category, subtotal_paisa, discount_paisa, net_paisa, commission_paisa, lab_allocation_paisa, status, bill_date) VALUES ('BILL-T1', ?, ?, 'SELF', 200000, 0, 200000, 0, 200000, 'FINALIZED', '2026-01-01')"
        )
        .run(visitId, patientId) as { lastInsertRowid: number | bigint }).lastInsertRowid
    )
    const insert = db.prepare(
      "INSERT INTO payments (transaction_id, bill_id, amount_paisa, method) VALUES ('TXN-DUP', ?, 100000, 'CASH')"
    )
    insert.run(billId)
    expect(() => insert.run(billId)).toThrow(/UNIQUE/) // duplicate posting impossible at DB level
  })

  it('enforces the net = subtotal - discount invariant on bills', () => {
    const patientId = Number(
      (db.prepare("INSERT INTO patients (patient_code, full_name, gender) VALUES ('PAT-T2', 'Test 2', 'FEMALE')").run() as { lastInsertRowid: number | bigint }).lastInsertRowid
    )
    const visitId = Number(
      (db.prepare("INSERT INTO visits (visit_code, patient_id, category, visit_date) VALUES ('VIS-T2', ?, 'SELF', '2026-01-01')").run(patientId) as { lastInsertRowid: number | bigint }).lastInsertRowid
    )
    expect(() =>
      db
        .prepare(
          "INSERT INTO bills (bill_number, visit_id, patient_id, category, subtotal_paisa, discount_paisa, net_paisa, commission_paisa, lab_allocation_paisa, status, bill_date) VALUES ('BILL-BAD', ?, ?, 'SELF', 200000, 50000, 99999, 0, 200000, 'FINALIZED', '2026-01-01')"
        )
        .run(visitId, patientId)
    ).toThrow(/CHECK/)
  })

  it('requires a practitioner for referred visits (PRD §2.2)', () => {
    const patientId = Number(
      (db.prepare("INSERT INTO patients (patient_code, full_name, gender) VALUES ('PAT-T3', 'Test 3', 'MALE')").run() as { lastInsertRowid: number | bigint }).lastInsertRowid
    )
    expect(() =>
      db
        .prepare("INSERT INTO visits (visit_code, patient_id, category, visit_date) VALUES ('VIS-T3', ?, 'REFERRED', '2026-01-01')")
        .run(patientId)
    ).toThrow(/CHECK/)
  })
})

describe('authentication (Checkpoint 1 acceptance: login works)', () => {
  it('logs in the seeded administrator with correct permissions', () => {
    const session = login(db, 'admin', 'Admin@123')
    expect(session.user.roleName).toBe('Administrator')
    expect(session.user.permissions).toContain('settings.manage')
    expect(session.user.permissions).toContain('users.manage')
    expect(session.user.mustChangePassword).toBe(true)
    logout(db, session.token)
  })

  it('rejects wrong passwords without revealing whether the user exists', () => {
    expect(() => login(db, 'admin', 'wrong-password')).toThrow(AuthError)
    expect(() => login(db, 'no-such-user', 'whatever')).toThrow(AuthError)
  })

  it('rejects inactive accounts', () => {
    db.prepare("INSERT INTO users (username, password_hash, full_name, role_id, is_active) VALUES ('tech1', ?, 'Tech One', (SELECT id FROM roles WHERE name = 'Technician'), 0)").run(
      hashPassword('Tech@12345')
    )
    expect(() => login(db, 'tech1', 'Tech@12345')).toThrow(/inactive/i)
  })

  it('verifies and expires sessions; logout invalidates the token', () => {
    const session = login(db, 'admin', 'Admin@123')
    const verified = verifySession(db, session.token)
    expect(verified?.user.username).toBe('admin')
    logout(db, session.token)
    expect(verifySession(db, session.token)).toBeNull()
  })

  it('hashes passwords with scrypt and verifies them', () => {
    const hash = hashPassword('Test@1234')
    expect(hash.startsWith('scrypt$')).toBe(true)
    expect(verifyPassword('Test@1234', hash)).toBe(true)
    expect(verifyPassword('wrong', hash)).toBe(false)
  })
})

describe('settings & audit', () => {
  it('returns merged defaults on first read', () => {
    const s = getSettings(db)
    expect(s['app.currency']).toBe('PKR')
    expect(s['app.dateFormat']).toBe('DD-MM-YYYY')
    expect(s['app.defaultCommissionRateBp']).toBe('5000')
    expect(s['app.commissionBasis']).toBe('NET_BILL')
  })

  it('updates settings and writes an audit record with old and new values', () => {
    const adminId = (db.prepare("SELECT id FROM users WHERE username = 'admin'").get() as { id: number }).id
    updateSettings(db, { 'lab.name': 'City Diagnostic Lab', 'app.commissionBasis': 'COLLECTED' }, adminId)
    const s = getSettings(db)
    expect(s['lab.name']).toBe('City Diagnostic Lab')
    expect(s['app.commissionBasis']).toBe('COLLECTED')

    const audit = listAudit(db, 10).find((r) => r.action === 'SETTINGS_UPDATED')
    expect(audit).toBeDefined()
    const newValue = JSON.parse(audit!.new_value ?? '{}') as Record<string, string>
    expect(newValue['lab.name']).toBe('City Diagnostic Lab')
  })

  it('rejects invalid setting values', () => {
    expect(() => updateSettings(db, { 'app.commissionBasis': 'MAGIC' }, null)).toThrow(/NET_BILL|COLLECTED/)
    expect(() => updateSettings(db, { 'unknown.key': 'x' }, null)).toThrow(/Unknown setting/)
  })

  it('records login events in the audit log', () => {
    const before = listAudit(db, 200).filter((r) => r.action === 'LOGIN').length
    const s = login(db, 'admin', 'Admin@123')
    const after = listAudit(db, 200).filter((r) => r.action === 'LOGIN').length
    expect(after).toBe(before + 1)
    logout(db, s.token)
  })
})

describe('dashboard aggregation service', () => {
  it('returns a complete, internally consistent overview for an empty database', () => {
    const o = getDashboardOverview(db, { type: 'today' })
    expect(o.patients.totalVisits).toBe(0)
    expect(o.financial.netPaisa).toBe(0)
    expect(o.commission.outstandingPaisa).toBe(0)
    expect(o.periodLabel).toBe('Today')
  })

  it('supports all PRD dashboard filter periods', () => {
    for (const type of ['today', 'yesterday', 'last7', 'this_month', 'custom'] as const) {
      const o = getDashboardOverview(db, { type, from: '2026-01-01', to: '2026-01-31' })
      expect(o.from).toBeTruthy()
      expect(o.to).toBeTruthy()
    }
  })

  it('aggregates real data correctly (self vs referred separation, PRD §2.3)', () => {
    const adminId = (db.prepare("SELECT id FROM users WHERE username = 'admin'").get() as { id: number }).id
    const day = '2026-02-01'
    const p1 = Number(
      (db.prepare('INSERT INTO patients (patient_code, full_name, gender) VALUES (?, ?, ?)').run('PAT-D1', 'A Patient', 'MALE') as { lastInsertRowid: number | bigint }).lastInsertRowid
    )
    const v1 = Number(
      (db.prepare("INSERT INTO visits (visit_code, patient_id, category, visit_date, created_by) VALUES ('VIS-D1', ?, 'SELF', ?, ?)").run(p1, day, adminId) as { lastInsertRowid: number | bigint }).lastInsertRowid
    )
    const practId = Number(
      (db.prepare("INSERT INTO practitioners (practitioner_code, name, commission_rate_bp) VALUES ('DR-T1', 'Dr Test', 5000)").run() as { lastInsertRowid: number | bigint }).lastInsertRowid
    )
    const p2 = Number(
      (db.prepare('INSERT INTO patients (patient_code, full_name, gender) VALUES (?, ?, ?)').run('PAT-D2', 'B Patient', 'FEMALE') as { lastInsertRowid: number | bigint }).lastInsertRowid
    )
    const v2 = Number(
      (db.prepare("INSERT INTO visits (visit_code, patient_id, category, practitioner_id, visit_date, created_by) VALUES ('VIS-D2', ?, 'REFERRED', ?, ?, ?)").run(p2, practId, day, adminId) as { lastInsertRowid: number | bigint }).lastInsertRowid
    )
    db.prepare("INSERT INTO bills (bill_number, visit_id, patient_id, category, subtotal_paisa, discount_paisa, net_paisa, commission_paisa, lab_allocation_paisa, status, bill_date) VALUES ('BILL-D1', ?, ?, 'SELF', 110000, 0, 110000, 0, 110000, 'FINALIZED', ?)").run(v1, p1, day)
    db.prepare("INSERT INTO bills (bill_number, visit_id, patient_id, category, practitioner_id, practitioner_rate_bp, subtotal_paisa, discount_paisa, net_paisa, commission_paisa, lab_allocation_paisa, status, bill_date) VALUES ('BILL-D2', ?, ?, 'REFERRED', ?, 5000, 200000, 0, 200000, 100000, 100000, 'FINALIZED', ?)").run(v2, p2, practId, day)
    db.prepare("INSERT INTO practitioner_commission_entries (bill_id, practitioner_id, entry_type, basis, rate_bp, eligible_paisa, commission_paisa, created_at, created_by) VALUES ((SELECT id FROM bills WHERE bill_number = 'BILL-D2'), ?, 'ACCRUAL', 'NET_BILL', 5000, 200000, 100000, ?, ?)").run(practId, `${day} 10:00:00`, adminId)

    const o = getDashboardOverview(db, { type: 'custom', from: day, to: day })
    expect(o.patients.totalVisits).toBe(2)
    expect(o.patients.selfVisits).toBe(1)
    expect(o.patients.referredVisits).toBe(1)
    expect(o.financial.selfBilledPaisa).toBe(110000)
    expect(o.financial.referredBilledPaisa).toBe(200000)
    expect(o.financial.netPaisa).toBe(310000)
    expect(o.commission.accruedPaisa).toBe(100000)
    expect(o.commission.outstandingPaisa).toBe(100000)
  })
})

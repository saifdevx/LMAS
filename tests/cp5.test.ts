import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import type DatabaseType from 'better-sqlite3'
import { openDatabase } from '../src/main/db/connection'
import { MIGRATIONS } from '../src/main/db/migrations'
import { runMigrations, currentVersion } from '../src/main/db/migrator'
import { seedIfEmpty } from '../src/main/db/seed'
import { changeOwnPassword, createUser, listRoles } from '../src/main/services/users'
import { login } from '../src/main/services/auth'
import { createPatient } from '../src/main/services/patients'
import { createTest } from '../src/main/services/tests'
import { createBill, listBills } from '../src/main/services/billing'
import { listWork } from '../src/main/services/lab'
import type { Actor } from '../src/main/lib/actor'

let tmpDir: string
let db: DatabaseType.Database
let admin: Actor
let adminId: number

beforeAll(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lmas-cp5-'))
  db = openDatabase(path.join(tmpDir, 'lmas.db'))
  runMigrations(db)
  seedIfEmpty(db)
  adminId = (db.prepare("SELECT id FROM users WHERE username = 'admin'").get() as { id: number }).id
  const perms = (
    db
      .prepare(
        "SELECT p.code FROM role_permissions rp JOIN permissions p ON p.id = rp.permission_id JOIN roles r ON r.id = rp.role_id WHERE r.name = 'Administrator'"
      )
      .all() as Array<{ code: string }>
  ).map((r) => r.code)
  admin = { id: adminId, permissions: perms }
  db.prepare(
    "INSERT INTO practitioners (practitioner_code, name, commission_rate_bp) VALUES ('DR-CP5', 'Dr. Perf', 3000)"
  ).run()
})

afterAll(() => {
  db.close()
  fs.rmSync(tmpDir, { recursive: true, force: true })
})

// ---------------------------------------------------------------- security review (offline)

describe('CP5: offline-first verification (no network access in the renderer)', () => {
  it('renderer sources contain no external URLs (scripts, styles, fonts, iframes)', () => {
    const rendererDir = path.resolve('src/renderer')
    const offenders: string[] = []
    const visit = (dir: string) => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const p = path.join(dir, entry.name)
        if (entry.isDirectory()) visit(p)
        else if (/\.(tsx?|html|css)$/.test(entry.name)) {
          const text = fs.readFileSync(p, 'utf-8')
          const matches = text.match(/https?:\/\/(?!localhost)[^\s"'`)]+/g) ?? []
          for (const m of matches) offenders.push(`${path.relative(rendererDir, p)}: ${m}`)
        }
      }
    }
    visit(rendererDir)
    expect(offenders).toEqual([])
  })

  it('ships a Content-Security-Policy that blocks remote content', () => {
    const html = fs.readFileSync(path.resolve('src/renderer/index.html'), 'utf-8')
    expect(html).toContain('Content-Security-Policy')
    expect(html).toContain("default-src 'self'")
    expect(html).toContain("script-src 'self'")
    expect(html).toContain("object-src 'none'")
  })
})

// ---------------------------------------------------------------- change own password

describe('CP5: users can change their own password', () => {
  it('requires the current password, clears the must-change flag and audits', () => {
    const roles = listRoles(db)
    const user = createUser(db, adminId, {
      username: 'cp5tech',
      password: 'Temp@12345',
      full_name: 'CP5 Technician',
      role_id: roles.find((r) => r.name === 'Technician')!.id
    })
    expect(user.must_change_password).toBe(1)

    expect(() => changeOwnPassword(db, user.id, 'Wrong@12345', 'NewPass@123')).toThrow(/current password is incorrect/i)
    changeOwnPassword(db, user.id, 'Temp@12345', 'NewPass@123')

    const session = login(db, 'cp5tech', 'NewPass@123')
    expect(session.user.mustChangePassword).toBe(false)
    expect(() => login(db, 'cp5tech', 'Temp@12345')).toThrow(/Invalid username or password/)

    const audited = db
      .prepare("SELECT COUNT(*) AS n FROM audit_logs WHERE action = 'USER_OWN_PASSWORD_CHANGE' AND user_id = ?")
      .get(user.id) as { n: number }
    expect(audited.n).toBe(1)
  })
})

// ---------------------------------------------------------------- migration drill (PRD CP5: updates do not erase records)

describe('CP5: database migration drill — version 1 data survives migration 002', () => {
  it('applies 001 only, stores business data, then migrates to 002 without loss', () => {
    const drill = path.join(tmpDir, 'drill.db')
    const v1 = openDatabase(drill)
    // Apply ONLY the first migration, exactly as a Checkpoint 2 install would have.
    v1.exec(MIGRATIONS[0].sql)
    v1.pragma('user_version = 1')
    expect(currentVersion(v1)).toBe(1)

    seedIfEmpty(v1)
    // v1-era data via direct SQL (current services already know v2 columns).
    const adminRow = v1.prepare("SELECT id FROM users WHERE username = 'admin'").get() as { id: number }
    v1.prepare(
      "INSERT INTO patients (patient_code, full_name, gender, age, created_by) VALUES ('PAT-2026-9999', 'Drill Patient', 'FEMALE', 40, ?)"
    ).run(adminRow.id)
    const patientId = (v1.prepare("SELECT id FROM patients WHERE patient_code = 'PAT-2026-9999'").get() as { id: number }).id
    v1.prepare("INSERT INTO visits (visit_code, patient_id, visit_date, category, created_by) VALUES ('VIS-2026-9999', ?, date('now','localtime'), 'SELF', ?)").run(patientId, adminRow.id)
    const visitId = (v1.prepare("SELECT id FROM visits WHERE visit_code = 'VIS-2026-9999'").get() as { id: number }).id
    v1.prepare(
      `INSERT INTO bills (bill_number, visit_id, patient_id, category, subtotal_paisa, discount_paisa, net_paisa, commission_paisa, lab_allocation_paisa, status, bill_date, created_by)
       VALUES ('BILL-2026-9999', ?, ?, 'SELF', 50000, 0, 50000, 0, 50000, 'PAID', date('now','localtime'), ?)`
    ).run(visitId, patientId, adminRow.id)
    const billId = (v1.prepare("SELECT id FROM bills WHERE bill_number = 'BILL-2026-9999'").get() as { id: number }).id
    v1.prepare(
      `INSERT INTO bill_items (bill_id, test_id, test_name, test_code, list_price_paisa, price_paisa, line_total_paisa)
       VALUES (?, NULL, 'Drill Test', 'DRILL-T', 50000, 50000, 50000)`
    ).run(billId)
    v1.close()

    // Reopen and run the full migration path (001 is skipped, 002 applies).
    const reopened = openDatabase(drill)
    const { from, to } = runMigrations(reopened)
    expect(from).toBe(1)
    expect(to).toBe(2)
    expect(currentVersion(reopened)).toBe(2)

    // Business data fully preserved.
    const stillThere = reopened
      .prepare('SELECT b.bill_number, b.net_paisa, p.full_name FROM bills b JOIN patients p ON p.id = b.patient_id WHERE b.id = ?')
      .get(billId) as { bill_number: string; net_paisa: number; full_name: string }
    expect(stillThere.bill_number).toBe('BILL-2026-9999')
    expect(stillThere.net_paisa).toBe(50000)
    expect(stillThere.full_name).toBe('Drill Patient')

    // New CP3 columns exist and are NULL (defaults are optional).
    const cols = (reopened.prepare("PRAGMA table_info('laboratory_tests')").all() as Array<{ name: string }>).map((c) => c.name)
    expect(cols).toContain('default_unit')
    expect(cols).toContain('default_reference_range')
    const tables = (
      reopened.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'lab_reports'").all() as Array<{ name: string }>
    ).map((t) => t.name)
    expect(tables).toContain('lab_reports')
    reopened.close()
  })
})

// ---------------------------------------------------------------- performance pass

describe('CP5: performance smoke — realistic volume stays responsive', () => {
  it('handles a few hundred bills: worklist and history queries stay fast', () => {
    const patient = createPatient(db, adminId, { full_name: 'Perf Patient', gender: 'MALE' })
    const t1 = createTest(db, adminId, { name: 'Perf CBC', price_paisa: 10000 })
    const t2 = createTest(db, adminId, { name: 'Perf Glucose', price_paisa: 8000 })
    const insertMany = db.transaction((n: number) => {
      for (let i = 0; i < n; i++) {
        createBill(db, admin, {
          patient_id: patient.id,
          category: i % 2 === 0 ? 'SELF' : 'REFERRED',
          practitioner_id: i % 2 === 0 ? undefined : (db.prepare("SELECT id FROM practitioners WHERE practitioner_code = 'DR-CP5'").get() as { id: number }).id,
          items: i % 3 === 0 ? [{ test_id: t1.id }, { test_id: t2.id }] : [{ test_id: t1.id }],
          discount_paisa: 0,
          initial_payment_paisa: 0,
          transaction_id: `TXN-PERF-${String(i).padStart(5, '0')}`
        })
      }
    })
    const started = Date.now()
    insertMany(300)
    const insertMs = Date.now() - started

    const t0 = Date.now()
    const page = listBills(db, { page: 1, pageSize: 25 })
    const billsMs = Date.now() - t0
    expect(page.rows).toHaveLength(25)
    expect(page.total).toBeGreaterThanOrEqual(300)

    const t1ms = Date.now()
    const work = listWork(db, {})
    const workMs = Date.now() - t1ms
    expect(work.length).toBeGreaterThan(0)

    // Generous bounds: correctness first, regression guard second.
    expect(billsMs).toBeLessThan(1500)
    expect(workMs).toBeLessThan(1500)
    // Bulk creation itself should be comfortably fast on a desktop machine.
    expect(insertMs).toBeLessThan(60_000)
  })
})

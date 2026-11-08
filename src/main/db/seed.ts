import type Database from 'better-sqlite3'
import { ROLE_SEED, PERMISSIONS, ROLE_PERMISSION_MATRIX } from '../../shared/permissions'
import { hashPassword } from '../lib/password'
import { DEFAULT_SETTINGS } from '../services/settings'

/**
 * First-run seed: roles, permissions, the initial administrator account,
 * default settings, and default categories. Runs only when the database
 * is empty. The initial administrator password is documented in
 * USER_GUIDE.md and must be changed after deployment (flagged via
 * must_change_password = 1).
 */
export function seedIfEmpty(db: Database.Database): void {
  const row = db.prepare('SELECT COUNT(*) AS n FROM roles').get() as { n: number }
  if (row.n > 0) return

  const tx = db.transaction(() => {
    const insRole = db.prepare('INSERT INTO roles (name, description) VALUES (?, ?)')
    const roleIds: Record<string, number> = {}
    for (const role of ROLE_SEED) {
      const info = insRole.run(role.name, role.description)
      roleIds[role.name] = Number(info.lastInsertRowid)
    }

    const insPerm = db.prepare('INSERT INTO permissions (code, module, description) VALUES (?, ?, ?)')
    const permIds: Record<string, number> = {}
    for (const perm of PERMISSIONS) {
      const info = insPerm.run(perm.code, perm.module, perm.description)
      permIds[perm.code] = Number(info.lastInsertRowid)
    }

    const insRolePerm = db.prepare('INSERT INTO role_permissions (role_id, permission_id) VALUES (?, ?)')
    for (const [roleName, codes] of Object.entries(ROLE_PERMISSION_MATRIX)) {
      const roleId = roleIds[roleName]
      if (roleId === undefined) throw new Error(`Unknown role in matrix: ${roleName}`)
      for (const code of codes) {
        const permId = permIds[code]
        if (permId === undefined) throw new Error(`Unknown permission in matrix: ${code}`)
        insRolePerm.run(roleId, permId)
      }
    }

    db.prepare(
      'INSERT INTO users (username, password_hash, full_name, role_id, must_change_password) VALUES (?, ?, ?, ?, 1)'
    ).run('admin', hashPassword('Admin@123'), 'Administrator', roleIds['Administrator'])

    const insTestCat = db.prepare('INSERT INTO test_categories (name, sort_order) VALUES (?, ?)')
    ;['Hematology', 'Biochemistry', 'Serology', 'Urine Analysis', 'Microbiology'].forEach((name, i) =>
      insTestCat.run(name, i)
    )

    const insExpCat = db.prepare('INSERT INTO expense_categories (name) VALUES (?)')
    ;[
      'Electricity',
      'Rent',
      'Staff Salaries',
      'Laboratory Supplies',
      'Reagents & Chemicals',
      'Equipment Maintenance',
      'Internet & Telephone',
      'Transportation',
      'Miscellaneous'
    ].forEach((name) => insExpCat.run(name))

    const insSetting = db.prepare('INSERT INTO application_settings (key, value) VALUES (?, ?)')
    for (const [key, value] of Object.entries(DEFAULT_SETTINGS)) insSetting.run(key, value)
  })
  tx()
}

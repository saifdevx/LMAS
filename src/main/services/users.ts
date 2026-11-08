import type Database from 'better-sqlite3'
import { writeAudit } from './audit'
import { hashPassword, verifyPassword } from '../lib/password'

/**
 * User management (PRD §Module J, CP4 deliverable): add/edit users,
 * change passwords, activate/deactivate, assign roles. Every change is
 * audited. Guards: the last active Administrator can never be deactivated
 * or demoted, and a user cannot deactivate their own account.
 */

export class UserAdminError extends Error {}

export interface UserRow {
  id: number
  username: string
  full_name: string
  role_id: number
  role_name: string
  is_active: number
  must_change_password: number
  last_login_at: string | null
  created_at: string
}

export interface RoleRow {
  id: number
  name: string
  description: string | null
  permission_codes: string[]
}

export function listUsers(db: Database.Database): UserRow[] {
  return db
    .prepare(
      `SELECT u.id, u.username, u.full_name, u.role_id, r.name AS role_name, u.is_active,
              u.must_change_password, u.last_login_at, u.created_at
       FROM users u JOIN roles r ON r.id = u.role_id
       ORDER BY u.username`
    )
    .all() as UserRow[]
}

export function listRoles(db: Database.Database): RoleRow[] {
  const roles = db.prepare('SELECT id, name, description FROM roles ORDER BY id').all() as Array<{
    id: number
    name: string
    description: string | null
  }>
  return roles.map((r) => ({
    ...r,
    permission_codes: (
      db.prepare('SELECT p.code FROM role_permissions rp JOIN permissions p ON p.id = rp.permission_id WHERE rp.role_id = ?').all(r.id) as Array<{ code: string }>
    ).map((p) => p.code)
  }))
}

export interface UserCreateInput {
  username: string
  password: string
  full_name: string
  role_id: number
  must_change_password?: boolean
}

export function createUser(db: Database.Database, actorId: number, input: UserCreateInput): UserRow {
  const username = input.username.trim()
  if (!/^[A-Za-z0-9._-]{3,32}$/.test(username)) {
    throw new UserAdminError('Username must be 3-32 characters (letters, numbers, dot, underscore or hyphen)')
  }
  const fullName = input.full_name.trim()
  if (fullName.length < 2) throw new UserAdminError('Please enter the user’s full name')
  const role = db.prepare('SELECT id, name FROM roles WHERE id = ?').get(input.role_id) as { id: number; name: string } | undefined
  if (!role) throw new UserAdminError('Selected role does not exist')
  if (db.prepare('SELECT id FROM users WHERE username = ? COLLATE NOCASE').get(username)) {
    throw new UserAdminError('This username is already taken')
  }

  const hash = hashPassword(input.password)
  const apply = db.transaction(() => {
    const result = db
      .prepare(
        `INSERT INTO users (username, password_hash, full_name, role_id, must_change_password, created_by)
         VALUES (?, ?, ?, ?, ?, ?)`
      )
      .run(username, hash, fullName, input.role_id, input.must_change_password === false ? 0 : 1, actorId)
    const id = Number(result.lastInsertRowid)
    writeAudit(db, {
      userId: actorId,
      action: 'USER_CREATE',
      entityType: 'user',
      entityId: id,
      newValue: { username, full_name: fullName, role: role.name }
    })
    return id
  })
  const id = apply()
  return getUser(db, id)
}

export function getUser(db: Database.Database, id: number): UserRow {
  const row = db
    .prepare(
      `SELECT u.id, u.username, u.full_name, u.role_id, r.name AS role_name, u.is_active,
              u.must_change_password, u.last_login_at, u.created_at
       FROM users u JOIN roles r ON r.id = u.role_id WHERE u.id = ?`
    )
    .get(id) as UserRow | undefined
  if (!row) throw new UserAdminError('User not found')
  return row
}

export interface UserUpdateInput {
  full_name?: string
  role_id?: number
}

function activeAdminCount(db: Database.Database, excludeUserId?: number): number {
  const row = db
    .prepare(
      `SELECT COUNT(*) AS n FROM users u JOIN roles r ON r.id = u.role_id
       WHERE r.name = 'Administrator' AND u.is_active = 1 ${excludeUserId ? 'AND u.id <> ?' : ''}`
    )
    .get(...(excludeUserId ? [excludeUserId] : [])) as { n: number }
  return Number(row.n)
}

export function updateUser(db: Database.Database, actorId: number, userId: number, input: UserUpdateInput): UserRow {
  const before = getUser(db, userId)
  const fullName = input.full_name?.trim()
  if (fullName !== undefined && fullName.length < 2) throw new UserAdminError('Please enter the user’s full name')

  let roleName: string | null = null
  if (input.role_id !== undefined && input.role_id !== before.role_id) {
    const role = db.prepare('SELECT id, name FROM roles WHERE id = ?').get(input.role_id) as { id: number; name: string } | undefined
    if (!role) throw new UserAdminError('Selected role does not exist')
    if (before.role_name === 'Administrator' && role.name !== 'Administrator' && activeAdminCount(db, userId) === 0) {
      throw new UserAdminError('Cannot demote the last active Administrator')
    }
    roleName = role.name
  }

  const apply = db.transaction(() => {
    db.prepare('UPDATE users SET full_name = COALESCE(?, full_name), role_id = COALESCE(?, role_id), updated_at = datetime(\'now\',\'localtime\') WHERE id = ?').run(
      fullName ?? null,
      roleName ? input.role_id! : null,
      userId
    )
    writeAudit(db, {
      userId: actorId,
      action: 'USER_UPDATE',
      entityType: 'user',
      entityId: userId,
      oldValue: { full_name: before.full_name, role: before.role_name },
      newValue: { full_name: fullName ?? before.full_name, role: roleName ?? before.role_name }
    })
  })
  apply()
  return getUser(db, userId)
}

export function setUserActive(db: Database.Database, actorId: number, userId: number, active: boolean): UserRow {
  const before = getUser(db, userId)
  if (!active) {
    if (before.id === actorId) throw new UserAdminError('You cannot deactivate your own account')
    if (before.role_name === 'Administrator' && activeAdminCount(db, userId) === 0) {
      throw new UserAdminError('Cannot deactivate the last active Administrator')
    }
  }
  db.prepare('UPDATE users SET is_active = ?, updated_at = datetime(\'now\',\'localtime\') WHERE id = ?').run(active ? 1 : 0, userId)
  writeAudit(db, {
    userId: actorId,
    action: 'USER_SET_ACTIVE',
    entityType: 'user',
    entityId: userId,
    oldValue: { is_active: before.is_active },
    newValue: { is_active: active ? 1 : 0 }
  })
  return getUser(db, userId)
}

export function changeUserPassword(
  db: Database.Database,
  actorId: number,
  userId: number,
  newPassword: string,
  opts: { requireCurrent?: boolean; currentPassword?: string; mustChangePassword?: boolean } = {}
): void {
  if (opts.requireCurrent) {
    const row = db.prepare('SELECT password_hash FROM users WHERE id = ?').get(userId) as { password_hash: string }
    if (!opts.currentPassword || !verifyPassword(opts.currentPassword, row.password_hash)) {
      throw new UserAdminError('Current password is incorrect')
    }
  }
  const hash = hashPassword(newPassword)
  db.prepare(
    `UPDATE users SET password_hash = ?, must_change_password = ?, updated_at = datetime('now','localtime') WHERE id = ?`
  ).run(hash, opts.mustChangePassword ? 1 : 0, userId)
  writeAudit(db, { userId: actorId, action: 'USER_PASSWORD_CHANGE', entityType: 'user', entityId: userId })
}

/**
 * A signed-in user changes their OWN password (Checkpoint 5 refinement):
 * requires the current password, clears the must-change flag, audited.
 */
export function changeOwnPassword(
  db: Database.Database,
  actorId: number,
  currentPassword: string,
  newPassword: string
): void {
  const row = db.prepare('SELECT password_hash FROM users WHERE id = ?').get(actorId) as
    | { password_hash: string }
    | undefined
  if (!row) throw new UserAdminError('Account not found')
  if (!verifyPassword(currentPassword, row.password_hash)) {
    throw new UserAdminError('Your current password is incorrect')
  }
  const hash = hashPassword(newPassword)
  db.prepare(
    `UPDATE users SET password_hash = ?, must_change_password = 0, updated_at = datetime('now','localtime') WHERE id = ?`
  ).run(hash, actorId)
  writeAudit(db, { userId: actorId, action: 'USER_OWN_PASSWORD_CHANGE', entityType: 'user', entityId: actorId })
}

import { randomBytes } from 'node:crypto'
import type Database from 'better-sqlite3'
import type { SessionInfo, SessionUser } from '../../shared/api-types'
import { verifyPassword } from '../lib/password'
import { writeAudit } from './audit'

/**
 * Authentication service (PRD §7.5): password-protected login, scrypt
 * hashing, role-based permissions, in-memory sessions with 12h expiry.
 * The renderer never touches the database — only this service via IPC.
 */

export class AuthError extends Error {}

const SESSION_TTL_MS = 12 * 60 * 60 * 1000

interface SessionRecord {
  userId: number
  expiresAt: number
}

const sessions = new Map<string, SessionRecord>()

export function getPermissions(db: Database.Database, roleId: number): string[] {
  const rows = db
    .prepare(
      `SELECT p.code FROM role_permissions rp
       JOIN permissions p ON p.id = rp.permission_id
       WHERE rp.role_id = ?`
    )
    .all(roleId) as Array<{ code: string }>
  return rows.map((r) => r.code)
}

function loadUser(db: Database.Database, userId: number): SessionUser | null {
  const row = db
    .prepare(
      `SELECT u.id, u.username, u.full_name, u.is_active, u.must_change_password, r.name AS role_name
       FROM users u JOIN roles r ON r.id = u.role_id WHERE u.id = ?`
    )
    .get(userId) as
    | { id: number; username: string; full_name: string; is_active: number; must_change_password: number; role_name: string }
    | undefined
  if (!row || !row.is_active) return null
  return {
    id: row.id,
    username: row.username,
    fullName: row.full_name,
    roleName: row.role_name,
    permissions: getPermissions(db, Number((db.prepare('SELECT role_id FROM users WHERE id = ?').get(userId) as { role_id: number }).role_id)),
    mustChangePassword: !!row.must_change_password
  }
}

export function login(db: Database.Database, username: string, password: string): SessionInfo {
  const trimmed = username.trim()
  if (!trimmed || !password) throw new AuthError('Username and password are required')

  const row = db
    .prepare(
      `SELECT u.id, u.username, u.full_name, u.password_hash, u.is_active, u.must_change_password, u.role_id, r.name AS role_name
       FROM users u JOIN roles r ON r.id = u.role_id
       WHERE u.username = ? COLLATE NOCASE`
    )
    .get(trimmed) as
    | { id: number; username: string; full_name: string; password_hash: string; is_active: number; must_change_password: number; role_id: number; role_name: string }
    | undefined

  if (!row || !verifyPassword(password, row.password_hash)) {
    writeAudit(db, {
      action: 'LOGIN_FAILED',
      entityType: 'user',
      entityId: row?.id ?? null,
      newValue: { username: trimmed }
    })
    throw new AuthError('Invalid username or password')
  }
  if (!row.is_active) {
    writeAudit(db, { action: 'LOGIN_BLOCKED_INACTIVE', entityType: 'user', entityId: row.id })
    throw new AuthError('This account is inactive. Please contact the administrator.')
  }

  const token = randomBytes(32).toString('hex')
  const expires = new Date(Date.now() + SESSION_TTL_MS)
  sessions.set(token, { userId: row.id, expiresAt: expires.getTime() })

  db.prepare("UPDATE users SET last_login_at = datetime('now','localtime') WHERE id = ?").run(row.id)
  writeAudit(db, { userId: row.id, action: 'LOGIN', entityType: 'user', entityId: row.id })

  return {
    token,
    expiresAt: expires.toISOString(),
    user: {
      id: row.id,
      username: row.username,
      fullName: row.full_name,
      roleName: row.role_name,
      permissions: getPermissions(db, row.role_id),
      mustChangePassword: !!row.must_change_password
    }
  }
}

export function verifySession(db: Database.Database, token: string): SessionInfo | null {
  const record = sessions.get(token)
  if (!record) return null
  if (Date.now() > record.expiresAt) {
    sessions.delete(token)
    return null
  }
  const user = loadUser(db, record.userId)
  if (!user) {
    sessions.delete(token)
    return null
  }
  return { token, expiresAt: new Date(record.expiresAt).toISOString(), user }
}

export function logout(db: Database.Database, token: string): void {
  const record = sessions.get(token)
  if (record) {
    sessions.delete(token)
    writeAudit(db, { userId: record.userId, action: 'LOGOUT', entityType: 'user', entityId: record.userId })
  }
}

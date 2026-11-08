import type Database from 'better-sqlite3'

/**
 * Audit logging service (PRD §8). Audit rows are append-only through the
 * application: no screen exposes edit or delete for audit_logs.
 */
export interface AuditEntry {
  userId?: number | null
  action: string
  entityType: string
  entityId?: string | number | null
  oldValue?: unknown
  newValue?: unknown
  reason?: string | null
}

export function writeAudit(db: Database.Database, entry: AuditEntry): void {
  db.prepare(
    `INSERT INTO audit_logs (user_id, action, entity_type, entity_id, old_value, new_value, reason)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).run(
    entry.userId ?? null,
    entry.action,
    entry.entityType,
    entry.entityId !== undefined && entry.entityId !== null ? String(entry.entityId) : null,
    entry.oldValue === undefined ? null : JSON.stringify(entry.oldValue),
    entry.newValue === undefined ? null : JSON.stringify(entry.newValue),
    entry.reason ?? null
  )
}

export interface AuditRow {
  id: number
  user_id: number | null
  action: string
  entity_type: string
  entity_id: string | null
  old_value: string | null
  new_value: string | null
  reason: string | null
  created_at: string
}

export function listAudit(db: Database.Database, limit = 100, offset = 0): AuditRow[] {
  return db
    .prepare('SELECT * FROM audit_logs ORDER BY id DESC LIMIT ? OFFSET ?')
    .all(limit, offset) as AuditRow[]
}

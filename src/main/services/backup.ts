import fs from 'node:fs'
import path from 'node:path'
import type Database from 'better-sqlite3'
import { writeAudit } from './audit'

/**
 * Backup and restore (PRD §Module J, CP4 deliverable). Backups use
 * SQLite's `VACUUM INTO` — a consistent, verified snapshot taken while
 * the application stays usable. Restores replace the live database file
 * and require an application restart (the caller relaunches the app).
 */

export class BackupError extends Error {}

export interface BackupRow {
  id: number
  file_path: string
  file_size: number | null
  backup_type: 'MANUAL' | 'AUTO'
  status: 'OK' | 'FAILED'
  verified: number
  created_by_name: string | null
  created_at: string
}

export interface BackupVerification {
  ok: boolean
  user_version: number
  integrity: string
  error?: string
}

const CORE_TABLES = ['users', 'roles', 'patients', 'bills', 'bill_items', 'payments', 'application_settings']

/** Open a candidate file and prove it is a healthy LMAS database. */
export function verifyBackupFile(filePath: string): BackupVerification {
  // Lazy require keeps the pure helpers importable from Vitest setups that
  // stub electron; better-sqlite3 is only loaded when actually verifying.
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const Database = require('better-sqlite3') as typeof import('better-sqlite3')
  let handle: import('better-sqlite3').Database | null = null
  try {
    if (!fs.existsSync(filePath)) return { ok: false, user_version: 0, integrity: 'missing', error: 'File not found' }
    handle = new Database(filePath, { readonly: true, fileMustExist: true })
    const integrity = (handle.pragma('integrity_check', { simple: true }) as string) ?? 'unknown'
    const userVersion = (handle.pragma('user_version', { simple: true }) as number) ?? 0
    if (integrity !== 'ok') {
      return { ok: false, user_version: userVersion, integrity, error: 'Database integrity check failed' }
    }
    if (userVersion < 1) {
      return { ok: false, user_version: userVersion, integrity, error: 'This file is not an LMAS database' }
    }
    for (const table of CORE_TABLES) {
      const row = handle
        .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?")
        .get(table) as { name: string } | undefined
      if (!row) {
        return { ok: false, user_version: userVersion, integrity, error: `Missing table "${table}" — not a valid LMAS backup` }
      }
    }
    return { ok: true, user_version: userVersion, integrity }
  } catch (err) {
    return {
      ok: false,
      user_version: 0,
      integrity: 'error',
      error: err instanceof Error ? err.message : 'Could not read the file'
    }
  } finally {
    handle?.close()
  }
}

export function backupsDir(dataDir: string): string {
  return path.join(dataDir, 'backups')
}

export function listBackups(db: Database.Database): BackupRow[] {
  return db
    .prepare(
      `SELECT bh.id, bh.file_path, bh.file_size, bh.backup_type, bh.status, bh.verified,
              u.full_name AS created_by_name, bh.created_at
       FROM backup_history bh
       LEFT JOIN users u ON u.id = bh.created_by
       ORDER BY bh.created_at DESC, bh.id DESC
       LIMIT 200`
    )
    .all() as BackupRow[]
}

export function createBackup(
  db: Database.Database,
  dataDir: string,
  actorId: number | null,
  backupType: 'MANUAL' | 'AUTO'
): BackupRow {
  const dir = backupsDir(dataDir)
  fs.mkdirSync(dir, { recursive: true })
  const d = new Date()
  const pad = (n: number) => n.toString().padStart(2, '0')
  const stamp = `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}-${d.getMilliseconds().toString().padStart(3, '0')}`
  const target = path.join(dir, `lmas-backup-${stamp}.db`)

  try {
    db.exec(`VACUUM INTO '${target.replace(/'/g, "''")}'`)
  } catch (err) {
    db.prepare(
      "INSERT INTO backup_history (file_path, backup_type, status, created_by) VALUES (?, ?, 'FAILED', ?)"
    ).run(target, backupType, actorId)
    writeAudit(db, {
      userId: actorId,
      action: 'BACKUP_FAILED',
      entityType: 'backup',
      newValue: { target },
      reason: err instanceof Error ? err.message : 'unknown error'
    })
    throw new BackupError(`Backup failed: ${err instanceof Error ? err.message : 'unknown error'}`)
  }

  const verification = verifyBackupFile(target)
  const size = fs.statSync(target).size
  db.prepare(
    'INSERT INTO backup_history (file_path, file_size, backup_type, status, verified, created_by) VALUES (?, ?, ?, ?, ?, ?)'
  ).run(target, size, backupType, 'OK', verification.ok ? 1 : 0, actorId)
  writeAudit(db, {
    userId: actorId,
    action: 'BACKUP_CREATED',
    entityType: 'backup',
    newValue: { file_path: target, file_size: size, backup_type: backupType, verified: verification.ok }
  })

  const row = db
    .prepare(
      `SELECT bh.id, bh.file_path, bh.file_size, bh.backup_type, bh.status, bh.verified,
              u.full_name AS created_by_name, bh.created_at
       FROM backup_history bh LEFT JOIN users u ON u.id = bh.created_by
       ORDER BY bh.id DESC LIMIT 1`
    )
    .get() as BackupRow
  return row
}

/** Automatic daily backup: runs at most once per calendar day (first launch). */
export function autoBackupIfNeeded(db: Database.Database, dataDir: string): void {
  const row = db
    .prepare(
      "SELECT date(created_at) AS day FROM backup_history WHERE backup_type = 'AUTO' AND status = 'OK' ORDER BY id DESC LIMIT 1"
    )
    .get() as { day: string } | undefined
  const today = new Date()
  const pad = (n: number) => n.toString().padStart(2, '0')
  const todayStr = `${today.getFullYear()}-${pad(today.getMonth() + 1)}-${pad(today.getDate())}`
  if (row?.day === todayStr) return
  try {
    createBackup(db, dataDir, null, 'AUTO')
  } catch {
    // Never block startup on the automatic backup; the failure is recorded.
  }
}

/**
 * Replace the live database with a verified backup. Closes the given
 * handle, copies the file over `dbPath` and returns the verification
 * result. The caller restarts the application so every handle reopens
 * against the restored data. The db handle is unusable after this call.
 */
export function applyRestore(db: Database.Database, dbPath: string, backupPath: string): BackupVerification {
  const verification = verifyBackupFile(backupPath)
  if (!verification.ok) {
    throw new BackupError(verification.error ?? 'The selected file is not a valid LMAS backup')
  }
  // Keep a safety copy of the current database before overwriting.
  const safety = `${dbPath}.pre-restore-${Date.now()}`
  db.exec(`VACUUM INTO '${safety.replace(/'/g, "''")}'`)
  db.close()
  fs.copyFileSync(backupPath, dbPath)
  writeAuditSafe(dbPath, backupPath, verification)
  return verification
}

/** The live handle is closed by the time we want to audit the restore. */
function writeAuditSafe(dbPath: string, backupPath: string, verification: BackupVerification): void {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const Database = require('better-sqlite3') as typeof import('better-sqlite3')
    const reopened = new Database(dbPath)
    reopened
      .prepare(
        `INSERT INTO audit_logs (user_id, action, entity_type, entity_id, new_value, reason)
         VALUES (NULL, 'BACKUP_RESTORED', 'backup', NULL, ?, ?)`
      )
      .run(JSON.stringify({ backup_path: backupPath, user_version: verification.user_version }), 'Database replaced from backup')
    reopened.close()
  } catch {
    // Auditing the restore must never break the restore itself.
  }
}

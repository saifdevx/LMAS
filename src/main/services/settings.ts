import type Database from 'better-sqlite3'
import { writeAudit } from './audit'

/**
 * Application settings service (PRD §Module J).
 * Values are stored as strings in application_settings; defaults are
 * merged on read so the app behaves sensibly on first run.
 */

export const DEFAULT_SETTINGS: Record<string, string> = {
  // Laboratory profile
  'lab.name': 'Diagnostic Laboratory',
  'lab.address': '',
  'lab.phone': '',
  'lab.email': '',
  'lab.reportHeader': '',
  'lab.receiptFooter': 'Thank you for choosing our laboratory.',
  'lab.logoPath': '',
  // Application settings
  'app.currency': 'PKR',
  'app.dateFormat': 'DD-MM-YYYY',
  'app.defaultCommissionRateBp': '5000', // 50% default (PRD §2.2)
  'app.commissionBasis': 'NET_BILL', // PRD §3.2 initial policy
  // Numbering
  'numbering.billPrefix': 'BILL',
  'numbering.patientPrefix': 'PAT',
  'numbering.reportPrefix': 'RPT'
}

export const EDITABLE_KEYS = Object.keys(DEFAULT_SETTINGS)

const VALIDATORS: Record<string, (v: string) => string | null> = {
  'app.defaultCommissionRateBp': (v) => {
    const n = Number(v)
    if (!Number.isInteger(n) || n < 0 || n > 10000) return 'Default commission rate must be an integer between 0 and 10000 basis points (0-100%).'
    return null
  },
  'app.commissionBasis': (v) =>
    v === 'NET_BILL' || v === 'COLLECTED' ? null : 'Commission basis must be NET_BILL or COLLECTED.',
  'lab.name': (v) => (v.trim().length === 0 ? 'Laboratory name is required.' : null)
}

function validateValue(key: string, value: string): void {
  const generic = value.length > 500 ? 'Setting value is too long (max 500 characters).' : null
  if (generic) throw new Error(generic)
  const validator = VALIDATORS[key]
  const specific = validator ? validator(value) : null
  if (specific) throw new Error(specific)
}

export function getSettings(db: Database.Database): Record<string, string> {
  const rows = db.prepare('SELECT key, value FROM application_settings').all() as Array<{ key: string; value: string }>
  const merged: Record<string, string> = { ...DEFAULT_SETTINGS }
  for (const row of rows) merged[row.key] = row.value
  return merged
}

export function updateSettings(
  db: Database.Database,
  values: Record<string, string>,
  userId: number | null
): Record<string, string> {
  const before = getSettings(db)
  const changed: Record<string, string> = {}
  for (const [key, value] of Object.entries(values)) {
    if (!EDITABLE_KEYS.includes(key)) throw new Error(`Unknown setting key: ${key}`)
    validateValue(key, value)
    changed[key] = value
  }
  const update = db.prepare(
    "UPDATE application_settings SET value = ?, updated_at = datetime('now','localtime'), updated_by = ? WHERE key = ?"
  )
  const insert = db.prepare(
    "INSERT INTO application_settings (key, value, updated_at, updated_by) VALUES (?, ?, datetime('now','localtime'), ?)"
  )
  const tx = db.transaction(() => {
    for (const [key, value] of Object.entries(changed)) {
      const res = update.run(value, userId, key)
      if (res.changes === 0) insert.run(key, value, userId)
    }
    const auditOld: Record<string, string> = {}
    const auditNew: Record<string, string> = {}
    for (const key of Object.keys(changed)) {
      auditOld[key] = before[key]
      auditNew[key] = changed[key]
    }
    writeAudit(db, {
      userId,
      action: 'SETTINGS_UPDATED',
      entityType: 'setting',
      oldValue: auditOld,
      newValue: auditNew
    })
  })
  tx()

  return getSettings(db)
}

import type Database from 'better-sqlite3'
import type {
  Practitioner,
  PractitionerAccount,
  PractitionerCreateInput
} from '../../shared/api-types'
import { nextCode } from '../lib/numbering'
import { writeAudit } from './audit'

/**
 * Practitioner management service (PRD §Module C). Commission rate changes
 * write an immutable history row; finalized bills keep their snapshot
 * (PRD §3.6, Scenario 7).
 */

export class PractitionerError extends Error {}

function text(v: string | null | undefined): string | null {
  const t = (v ?? '').trim()
  return t.length > 0 ? t : null
}

function validate(input: Partial<PractitionerCreateInput>, partial: boolean): void {
  if (!partial || input.name !== undefined) {
    const name = (input.name ?? '').trim()
    if (name.length < 2) throw new PractitionerError('Practitioner name is required (at least 2 characters).')
    if (name.length > 120) throw new PractitionerError('Practitioner name is too long.')
  }
  if (input.commission_rate_bp !== undefined) {
    const r = input.commission_rate_bp
    if (!Number.isInteger(r) || r < 0 || r > 10000) {
      throw new PractitionerError('Commission rate must be between 0% and 100%.')
    }
  }
}

function rowToPractitioner(row: Record<string, unknown>): Practitioner {
  return {
    id: Number(row.id),
    practitioner_code: String(row.practitioner_code),
    name: String(row.name),
    clinic_name: (row.clinic_name as string | null) ?? null,
    phone: (row.phone as string | null) ?? null,
    address: (row.address as string | null) ?? null,
    commission_rate_bp: Number(row.commission_rate_bp),
    is_active: Number(row.is_active),
    notes: (row.notes as string | null) ?? null,
    registered_at: String(row.registered_at)
  }
}

function getPractitioner(db: Database.Database, id: number): Practitioner {
  const row = db.prepare('SELECT * FROM practitioners WHERE id = ?').get(id) as Record<string, unknown> | undefined
  if (!row) throw new PractitionerError('Practitioner not found.')
  return rowToPractitioner(row)
}

export function listPractitioners(db: Database.Database, includeInactive: boolean): Practitioner[] {
  const rows = db
    .prepare(`SELECT * FROM practitioners ${includeInactive ? '' : 'WHERE is_active = 1'} ORDER BY name COLLATE NOCASE`)
    .all() as Array<Record<string, unknown>>
  return rows.map(rowToPractitioner)
}

export function createPractitioner(db: Database.Database, actorId: number | null, input: PractitionerCreateInput): Practitioner {
  validate(input, false)
  const tx = db.transaction(() => {
    const code = nextCode(db, { table: 'practitioners', column: 'practitioner_code', prefix: 'DR', yearly: false })
    const info = db
      .prepare(
        `INSERT INTO practitioners (practitioner_code, name, clinic_name, phone, address, commission_rate_bp, notes, created_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        code,
        input.name.trim(),
        text(input.clinic_name),
        text(input.phone),
        text(input.address),
        input.commission_rate_bp,
        text(input.notes),
        actorId
      )
    const id = Number(info.lastInsertRowid)
    db.prepare(
      'INSERT INTO practitioner_commission_history (practitioner_id, rate_bp, changed_by, reason) VALUES (?, ?, ?, ?)'
    ).run(id, input.commission_rate_bp, actorId, 'Initial rate')
    writeAudit(db, {
      userId: actorId,
      action: 'PRACTITIONER_CREATED',
      entityType: 'practitioner',
      entityId: id,
      newValue: { practitioner_code: code, name: input.name.trim(), commission_rate_bp: input.commission_rate_bp }
    })
    return id
  })
  return getPractitioner(db, tx())
}

export function updatePractitioner(
  db: Database.Database,
  actorId: number | null,
  id: number,
  patch: Partial<PractitionerCreateInput>
): Practitioner {
  const existing = getPractitioner(db, id)
  validate(patch, true)
  const merged = {
    name: patch.name !== undefined ? patch.name.trim() : existing.name,
    clinic_name: patch.clinic_name !== undefined ? text(patch.clinic_name) : existing.clinic_name,
    phone: patch.phone !== undefined ? text(patch.phone) : existing.phone,
    address: patch.address !== undefined ? text(patch.address) : existing.address,
    notes: patch.notes !== undefined ? text(patch.notes) : existing.notes
  }
  const tx = db.transaction(() => {
    db.prepare(
      'UPDATE practitioners SET name = ?, clinic_name = ?, phone = ?, address = ?, notes = ? WHERE id = ?'
    ).run(merged.name, merged.clinic_name, merged.phone, merged.address, merged.notes, id)
    writeAudit(db, {
      userId: actorId,
      action: 'PRACTITIONER_UPDATED',
      entityType: 'practitioner',
      entityId: id,
      oldValue: { name: existing.name, clinic_name: existing.clinic_name, phone: existing.phone },
      newValue: { name: merged.name, clinic_name: merged.clinic_name, phone: merged.phone }
    })
  })
  tx()
  return getPractitioner(db, id)
}

export function setPractitionerActive(db: Database.Database, actorId: number | null, id: number, active: boolean): void {
  const existing = getPractitioner(db, id)
  const tx = db.transaction(() => {
    db.prepare('UPDATE practitioners SET is_active = ? WHERE id = ?').run(active ? 1 : 0, id)
    writeAudit(db, {
      userId: actorId,
      action: active ? 'PRACTITIONER_ACTIVATED' : 'PRACTITIONER_DEACTIVATED',
      entityType: 'practitioner',
      entityId: id,
      oldValue: { is_active: existing.is_active },
      newValue: { is_active: active ? 1 : 0 }
    })
  })
  tx()
}

export function updateCommissionRate(
  db: Database.Database,
  actorId: number | null,
  id: number,
  rateBp: number,
  reason: string
): Practitioner {
  const existing = getPractitioner(db, id)
  validate({ commission_rate_bp: rateBp }, true)
  const trimmedReason = (reason ?? '').trim()
  if (trimmedReason.length < 3) throw new PractitionerError('A reason is required when changing the commission rate.')
  if (rateBp === existing.commission_rate_bp) throw new PractitionerError('The rate is unchanged — nothing to update.')
  const tx = db.transaction(() => {
    db.prepare('UPDATE practitioners SET commission_rate_bp = ? WHERE id = ?').run(rateBp, id)
    db.prepare(
      'INSERT INTO practitioner_commission_history (practitioner_id, rate_bp, changed_by, reason) VALUES (?, ?, ?, ?)'
    ).run(id, rateBp, actorId, trimmedReason)
    writeAudit(db, {
      userId: actorId,
      action: 'COMMISSION_RATE_CHANGED',
      entityType: 'practitioner',
      entityId: id,
      oldValue: { commission_rate_bp: existing.commission_rate_bp },
      newValue: { commission_rate_bp: rateBp },
      reason: trimmedReason
    })
  })
  tx()
  return getPractitioner(db, id)
}

export function getPractitionerAccount(db: Database.Database, id: number): PractitionerAccount {
  const practitioner = getPractitioner(db, id)
  const totals = db
    .prepare(
      `SELECT
         (SELECT COUNT(*) FROM visits WHERE practitioner_id = ? AND category = 'REFERRED') AS referred_visits,
         (SELECT COUNT(*) FROM bills WHERE practitioner_id = ? AND status <> 'CANCELLED') AS bills,
         (SELECT COALESCE(SUM(eligible_paisa), 0) FROM practitioner_commission_entries
           WHERE practitioner_id = ? AND entry_type IN ('ACCRUAL', 'ADJUSTMENT')) AS eligible,
         (SELECT COALESCE(SUM(commission_paisa), 0) FROM practitioner_commission_entries WHERE practitioner_id = ?) AS accrued,
         (SELECT COALESCE(SUM(amount_paisa), 0) FROM practitioner_payments WHERE practitioner_id = ?) AS paid`
    )
    .get(id, id, id, id, id) as { referred_visits: number; bills: number; eligible: number; accrued: number; paid: number }

  const entries = db
    .prepare(
      `SELECT e.id, e.bill_id, b.bill_number, e.entry_type, e.basis, e.rate_bp, e.eligible_paisa, e.commission_paisa, e.created_at
       FROM practitioner_commission_entries e JOIN bills b ON b.id = e.bill_id
       WHERE e.practitioner_id = ? ORDER BY e.id DESC LIMIT 25`
    )
    .all(id)

  const payments = db
    .prepare(
      `SELECT id, transaction_id, amount_paisa, method, reference_number, paid_at
       FROM practitioner_payments WHERE practitioner_id = ? ORDER BY id DESC LIMIT 25`
    )
    .all(id)

  const rateHistory = db
    .prepare(
      `SELECT h.id, h.rate_bp, h.effective_from, h.reason, u.full_name AS changed_by_name
       FROM practitioner_commission_history h LEFT JOIN users u ON u.id = h.changed_by
       WHERE h.practitioner_id = ? ORDER BY h.id DESC`
    )
    .all(id)

  return {
    practitioner,
    totals: {
      referredVisits: totals.referred_visits,
      bills: totals.bills,
      eligiblePaisa: totals.eligible,
      accruedPaisa: totals.accrued,
      paidPaisa: totals.paid,
      outstandingPaisa: totals.accrued - totals.paid
    },
    entries: entries as PractitionerAccount['entries'],
    payments: payments as PractitionerAccount['payments'],
    rateHistory: rateHistory as PractitionerAccount['rateHistory']
  }
}

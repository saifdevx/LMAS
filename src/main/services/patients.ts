import type Database from 'better-sqlite3'
import type { BillStatus, Gender, Patient, PatientCategory, PatientListItem, PatientPaymentRow, PatientProfile, PatientVisitRow } from '../../shared/api-types'
import { nextCode, cleanPrefix } from '../lib/numbering'
import { getSettings } from './settings'
import { writeAudit } from './audit'

/**
 * Patient management service (PRD §Module B). Urdu names supported;
 * codes generated as {prefix}-YYYY-#### inside the creating transaction.
 */

export class PatientError extends Error {}

export interface PatientWriteInput {
  full_name: string
  full_name_urdu?: string | null
  age?: number | null
  gender: Gender
  phone?: string | null
  address?: string | null
  notes?: string | null
}

function text(v: string | null | undefined): string | null {
  const t = (v ?? '').trim()
  return t.length > 0 ? t : null
}

function validate(input: PatientWriteInput): void {
  const name = (input.full_name ?? '').trim()
  if (name.length < 2) throw new PatientError('Patient name is required (at least 2 characters).')
  if (name.length > 120) throw new PatientError('Patient name is too long.')
  if (input.age != null && (!Number.isInteger(input.age) || input.age < 0 || input.age > 150)) {
    throw new PatientError('Age must be a whole number between 0 and 150.')
  }
  if (!['MALE', 'FEMALE', 'OTHER'].includes(input.gender)) throw new PatientError('Select a valid gender.')
  if (input.phone != null && text(input.phone) && input.phone.trim().length > 24) throw new PatientError('Phone number is too long.')
}

function normalize(input: PatientWriteInput): Required<Pick<PatientWriteInput, 'full_name'>> & Omit<PatientWriteInput, 'full_name'> {
  return {
    full_name: input.full_name.trim(),
    full_name_urdu: text(input.full_name_urdu),
    age: input.age ?? null,
    gender: input.gender,
    phone: text(input.phone),
    address: text(input.address),
    notes: text(input.notes)
  }
}

function rowToPatient(row: Record<string, unknown>): Patient {
  return {
    id: Number(row.id),
    patient_code: String(row.patient_code),
    full_name: String(row.full_name),
    full_name_urdu: (row.full_name_urdu as string | null) ?? null,
    age: (row.age as number | null) ?? null,
    gender: row.gender as Gender,
    phone: (row.phone as string | null) ?? null,
    address: (row.address as string | null) ?? null,
    notes: (row.notes as string | null) ?? null,
    created_at: String(row.created_at)
  }
}

function escapeLike(q: string): string {
  return q.replace(/[%_\\]/g, (c) => `\\${c}`)
}

export function createPatient(db: Database.Database, actorId: number | null, input: PatientWriteInput): Patient {
  validate(input)
  const v = normalize(input)
  const settings = getSettings(db)
  const prefix = cleanPrefix(settings['numbering.patientPrefix'], 'PAT')
  const code = nextCode(db, { table: 'patients', column: 'patient_code', prefix, yearly: true }, settings)
  const tx = db.transaction(() => {
    const info = db
      .prepare(
        `INSERT INTO patients (patient_code, full_name, full_name_urdu, age, gender, phone, address, notes, created_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(code, v.full_name, v.full_name_urdu, v.age, v.gender, v.phone, v.address, v.notes, actorId)
    writeAudit(db, {
      userId: actorId,
      action: 'PATIENT_CREATED',
      entityType: 'patient',
      entityId: Number(info.lastInsertRowid),
      newValue: { patient_code: code, full_name: v.full_name, gender: v.gender }
    })
    return Number(info.lastInsertRowid)
  })
  const id = tx()
  return getPatient(db, id)
}

export function getPatient(db: Database.Database, id: number): Patient {
  const row = db.prepare('SELECT * FROM patients WHERE id = ?').get(id) as Record<string, unknown> | undefined
  if (!row) throw new PatientError('Patient not found.')
  return rowToPatient(row)
}

export function updatePatient(db: Database.Database, actorId: number | null, id: number, patch: Partial<PatientWriteInput>): Patient {
  const existing = getPatient(db, id)
  const merged: PatientWriteInput = {
    full_name: patch.full_name ?? existing.full_name,
    full_name_urdu: patch.full_name_urdu !== undefined ? patch.full_name_urdu : existing.full_name_urdu,
    age: patch.age !== undefined ? patch.age : existing.age,
    gender: patch.gender ?? existing.gender,
    phone: patch.phone !== undefined ? patch.phone : existing.phone,
    address: patch.address !== undefined ? patch.address : existing.address,
    notes: patch.notes !== undefined ? patch.notes : existing.notes
  }
  validate(merged)
  const v = normalize(merged)
  const tx = db.transaction(() => {
    db.prepare(
      `UPDATE patients SET full_name = ?, full_name_urdu = ?, age = ?, gender = ?, phone = ?, address = ?, notes = ?,
       updated_at = datetime('now','localtime') WHERE id = ?`
    ).run(v.full_name, v.full_name_urdu, v.age, v.gender, v.phone, v.address, v.notes, id)
    writeAudit(db, {
      userId: actorId,
      action: 'PATIENT_UPDATED',
      entityType: 'patient',
      entityId: id,
      oldValue: { full_name: existing.full_name, phone: existing.phone, age: existing.age },
      newValue: { full_name: v.full_name, phone: v.phone, age: v.age }
    })
  })
  tx()
  return getPatient(db, id)
}

/**
 * Unified search (PRD §Module B): patient ID, name (EN/UR), phone, registration
 * date, or bill number — auto-detected from the query shape.
 */
export function searchPatients(db: Database.Database, rawQuery: string, limit = 20): PatientListItem[] {
  const q = rawQuery.trim()
  const base = `
    SELECT p.*, COUNT(v.id) AS visit_count, MAX(v.visit_date) AS last_visit_date
    FROM patients p LEFT JOIN visits v ON v.patient_id = p.id`
  const tail = ' GROUP BY p.id ORDER BY p.id DESC LIMIT ?'

  if (/^\d{4}-\d{2}-\d{2}$/.test(q)) {
    const rows = db.prepare(`${base} WHERE date(p.created_at) = ?${tail}`).all(q, limit) as Array<Record<string, unknown>>
    return rows.map(rowToPatientListItem)
  }
  const dmy = q.match(/^(\d{1,2})-(\d{1,2})-(\d{4})$/)
  if (dmy) {
    const iso = `${dmy[3]}-${dmy[2].padStart(2, '0')}-${dmy[1].padStart(2, '0')}`
    const rows = db.prepare(`${base} WHERE date(p.created_at) = ?${tail}`).all(iso, limit) as Array<Record<string, unknown>>
    return rows.map(rowToPatientListItem)
  }

  const like = `%${escapeLike(q)}%`
  const rows = db
    .prepare(
      `${base} WHERE p.patient_code LIKE ? ESCAPE '\\' OR p.full_name LIKE ? ESCAPE '\\'
       OR p.full_name_urdu LIKE ? ESCAPE '\\' OR p.phone LIKE ? ESCAPE '\\'
       OR p.id IN (SELECT patient_id FROM bills WHERE bill_number LIKE ? ESCAPE '\\')${tail}`
    )
    .all(like, like, like, like, like, limit) as Array<Record<string, unknown>>
  return rows.map(rowToPatientListItem)
}

function rowToPatientListItem(row: Record<string, unknown>): PatientListItem {
  return {
    ...rowToPatient(row),
    visit_count: Number(row.visit_count ?? 0),
    last_visit_date: (row.last_visit_date as string | null) ?? null
  }
}

export function getPatientProfile(db: Database.Database, id: number): PatientProfile {
  const patient = getPatient(db, id)
  const visitRows = db
    .prepare(
      `SELECT v.id, v.visit_code, v.visit_date, v.category, pr.name AS practitioner_name
       FROM visits v LEFT JOIN practitioners pr ON pr.id = v.practitioner_id
       WHERE v.patient_id = ? ORDER BY v.id DESC`
    )
    .all(id) as Array<{ id: number; visit_code: string; visit_date: string; category: PatientCategory; practitioner_name: string | null }>
  const billRows = db
    .prepare(
      `SELECT b.id AS bill_id, b.bill_number, b.status, b.net_paisa, b.visit_id,
              COALESCE((SELECT SUM(amount_paisa) FROM payments WHERE bill_id = b.id), 0) AS paid_paisa
       FROM bills b WHERE b.patient_id = ? ORDER BY b.id DESC`
    )
    .all(id) as Array<{ bill_id: number; bill_number: string; status: BillStatus; net_paisa: number; paid_paisa: number; visit_id: number }>

  const visits: PatientVisitRow[] = visitRows.map((v) => ({
    id: v.id,
    visit_code: v.visit_code,
    visit_date: v.visit_date,
    category: v.category,
    practitioner_name: v.practitioner_name,
    bills: billRows
      .filter((b) => b.visit_id === v.id)
      .map((b) => ({
        bill_id: b.bill_id,
        bill_number: b.bill_number,
        status: b.status,
        net_paisa: b.net_paisa,
        paid_paisa: b.paid_paisa,
        outstanding_paisa: b.status === 'CANCELLED' ? 0 : Math.max(0, b.net_paisa - b.paid_paisa)
      }))
  }))

  const payments = db
    .prepare(
      `SELECT p.id, p.transaction_id, p.bill_id, b.bill_number, p.amount_paisa, p.method, p.paid_at
       FROM payments p JOIN bills b ON b.id = p.bill_id
       WHERE b.patient_id = ? ORDER BY p.id DESC LIMIT 100`
    )
    .all(id) as unknown as PatientPaymentRow[]

  const totals = db
    .prepare(
      `SELECT
         COALESCE(SUM(CASE WHEN status <> 'CANCELLED' THEN net_paisa ELSE 0 END), 0) AS billed,
         COALESCE((SELECT SUM(p.amount_paisa) FROM payments p JOIN bills b2 ON b2.id = p.bill_id
                   WHERE b2.patient_id = ? AND b2.status <> 'CANCELLED'), 0) AS paid
       FROM bills WHERE patient_id = ?`
    )
    .get(id, id) as { billed: number; paid: number }

  return {
    patient,
    visits,
    payments,
    totals: {
      billedPaisa: totals.billed,
      paidPaisa: totals.paid,
      outstandingPaisa: Math.max(0, totals.billed - totals.paid)
    }
  }
}

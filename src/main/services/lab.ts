import type Database from 'better-sqlite3'
import type {
  Gender,
  LabBillWork,
  LabCreateSampleInput,
  LabReportRow,
  LabResultView,
  LabRevisionRow,
  LabSampleView,
  LabSaveResultInput,
  LabTechnician,
  LabUpdateSampleInput,
  LabWorklistFilters,
  LabWorklistRow,
  PatientCategory,
  PatientLabHistoryRow,
  ResultState,
  SampleStatus,
  TestStatus
} from '../../shared/api-types'
import { localDate } from './dashboard'
import { nextCode } from '../lib/numbering'
import { writeAudit } from './audit'
import { Actor, actorHas } from '../lib/actor'

/**
 * Laboratory workflow service (PRD §Module F).
 *
 * Every billed test (bill_items row of an active bill) owns exactly one
 * test_results row, created when the bill is finalized (or back-filled
 * lazily for bills from earlier checkpoints). Workflow:
 *
 *   test status : PENDING → IN_PROGRESS → COMPLETED, or → CANCELLED (reason)
 *   result state: DRAFT → VERIFIED → APPROVED   (reset back to DRAFT with reason)
 *
 * Every result save is snapshotted into result_revisions (PRD: "the
 * application must maintain a history of changes"), verification/approval
 * stamp the user and time, and samples track the physical specimen.
 */

export class LabError extends Error {}

const ACTIVE_BILL_STATUSES = "('FINALIZED','PARTIALLY_PAID','PAID')"

/** Forward-only sample lifecycle (PRD §Module F suggested statuses). */
const SAMPLE_ORDER: Record<SampleStatus, number> = {
  NOT_COLLECTED: 0,
  COLLECTED: 1,
  RECEIVED: 2,
  PROCESSING: 3,
  COMPLETED: 4,
  REJECTED: -1
}

function canTransitionSample(from: SampleStatus, to: SampleStatus): boolean {
  if (from === to) return false
  if (from === 'COMPLETED') return false // terminal
  if (from === 'REJECTED') return to === 'NOT_COLLECTED' // re-collection after rejection
  if (to === 'REJECTED') return true
  return SAMPLE_ORDER[to] === SAMPLE_ORDER[from] + 1
}

function text(v: string | null | undefined): string | null {
  const t = (v ?? '').trim()
  return t.length > 0 ? t : null
}

function nowStamp(): string {
  const d = new Date()
  const pad = (n: number) => n.toString().padStart(2, '0')
  return `${localDate(d)} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
}

// ---------------------------------------------------------------- results back-fill

/** Create PENDING result rows for every test line of every active bill (idempotent). */
export function ensureResultRows(db: Database.Database): void {
  db.prepare(
    `INSERT INTO test_results (bill_item_id, status, result_state)
     SELECT bi.id, 'PENDING', 'DRAFT'
     FROM bill_items bi
     JOIN bills b ON b.id = bi.bill_id
     LEFT JOIN test_results tr ON tr.bill_item_id = bi.id
     WHERE b.status IN ${ACTIVE_BILL_STATUSES} AND tr.id IS NULL`
  ).run()
}

// ---------------------------------------------------------------- worklist

export function listWork(db: Database.Database, filters: LabWorklistFilters): LabWorklistRow[] {
  ensureResultRows(db)
  const where: string[] = [`b.status IN ${ACTIVE_BILL_STATUSES}`]
  const params: Array<string | number> = []
  if (filters.from && /^\d{4}-\d{2}-\d{2}$/.test(filters.from)) {
    where.push('b.bill_date >= ?')
    params.push(filters.from)
  }
  if (filters.to && /^\d{4}-\d{2}-\d{2}$/.test(filters.to)) {
    where.push('b.bill_date <= ?')
    params.push(filters.to)
  }
  const status = (filters.status ?? 'ALL').toUpperCase()
  if (['PENDING', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED'].includes(status)) {
    where.push(
      'EXISTS (SELECT 1 FROM test_results tr2 JOIN bill_items bi2 ON bi2.id = tr2.bill_item_id WHERE bi2.bill_id = b.id AND tr2.status = ?)'
    )
    params.push(status)
  }
  const q = (filters.query ?? '').trim()
  if (q.length > 0) {
    const like = `%${q.replace(/[%_\\]/g, (c) => `\\${c}`)}%`
    where.push(
      `(b.bill_number LIKE ? ESCAPE '\\' OR v.visit_code LIKE ? ESCAPE '\\' OR p.full_name LIKE ? ESCAPE '\\'
        OR p.patient_code LIKE ? ESCAPE '\\' OR p.full_name_urdu LIKE ? ESCAPE '\\'
        OR EXISTS (SELECT 1 FROM bill_items bi3 WHERE bi3.bill_id = b.id AND bi3.test_name LIKE ? ESCAPE '\\'))`
    )
    params.push(like, like, like, like, like, like)
  }

  const rows = db
    .prepare(
      `SELECT b.id AS bill_id, b.bill_number, b.bill_date,
              v.id AS visit_id, v.visit_code, v.category,
              p.id AS patient_id, p.patient_code, p.full_name AS patient_name, p.full_name_urdu AS patient_name_urdu,
              p.age, p.gender, pr.name AS practitioner_name,
              COALESCE(r.test_count, 0) AS test_count,
              COALESCE(r.completed_count, 0) AS completed_count,
              COALESCE(r.cancelled_count, 0) AS cancelled_count,
              COALESCE(r.verified_count, 0) AS verified_count,
              COALESCE(r.approved_count, 0) AS approved_count,
              COALESCE(r.pending_count, 0) AS pending_count,
              COALESCE(r.in_progress_count, 0) AS in_progress_count,
              (SELECT GROUP_CONCAT(DISTINCT s.sample_code) FROM samples s WHERE s.visit_id = v.id) AS sample_codes
       FROM bills b
       JOIN visits v ON v.id = b.visit_id
       JOIN patients p ON p.id = b.patient_id
       LEFT JOIN practitioners pr ON pr.id = b.practitioner_id
       LEFT JOIN (
         SELECT bi.bill_id,
                COUNT(*) AS test_count,
                SUM(CASE WHEN tr.status = 'COMPLETED' THEN 1 ELSE 0 END) AS completed_count,
                SUM(CASE WHEN tr.status = 'CANCELLED' THEN 1 ELSE 0 END) AS cancelled_count,
                SUM(CASE WHEN tr.status = 'PENDING' THEN 1 ELSE 0 END) AS pending_count,
                SUM(CASE WHEN tr.status = 'IN_PROGRESS' THEN 1 ELSE 0 END) AS in_progress_count,
                SUM(CASE WHEN tr.result_state = 'VERIFIED' THEN 1 ELSE 0 END) AS verified_count,
                SUM(CASE WHEN tr.result_state = 'APPROVED' THEN 1 ELSE 0 END) AS approved_count
         FROM test_results tr JOIN bill_items bi ON bi.id = tr.bill_item_id
         GROUP BY bi.bill_id
       ) r ON r.bill_id = b.id
       WHERE ${where.join(' AND ')}
       ORDER BY b.bill_date DESC, b.id DESC
       LIMIT 300`
    )
    .all(...params) as Array<Record<string, unknown>>

  return rows.map((row) => ({
    bill_id: Number(row.bill_id),
    bill_number: String(row.bill_number),
    bill_date: String(row.bill_date),
    visit_id: Number(row.visit_id),
    visit_code: String(row.visit_code),
    patient_id: Number(row.patient_id),
    patient_code: String(row.patient_code),
    patient_name: String(row.patient_name),
    patient_name_urdu: (row.patient_name_urdu as string | null) ?? null,
    age: (row.age as number | null) ?? null,
    gender: row.gender as Gender,
    category: row.category as PatientCategory,
    practitioner_name: (row.practitioner_name as string | null) ?? null,
    test_count: Number(row.test_count),
    completed_count: Number(row.completed_count),
    cancelled_count: Number(row.cancelled_count),
    verified_count: Number(row.verified_count),
    approved_count: Number(row.approved_count),
    sample_codes: row.sample_codes ? String(row.sample_codes).split(',') : []
  }))
}

// ---------------------------------------------------------------- bill work view

function mapSample(row: Record<string, unknown>): LabSampleView {
  return {
    id: Number(row.id),
    sample_code: String(row.sample_code),
    sample_type: (row.sample_type as string | null) ?? null,
    status: row.status as SampleStatus,
    collected_at: (row.collected_at as string | null) ?? null,
    assigned_technician_id: (row.assigned_technician_id as number | null) ?? null,
    assigned_technician_name: (row.assigned_technician_name as string | null) ?? null,
    notes: (row.notes as string | null) ?? null,
    created_at: String(row.created_at)
  }
}

function mapResult(row: Record<string, unknown>): LabResultView {
  return {
    bill_item_id: Number(row.bill_item_id),
    test_id: (row.test_id as number | null) ?? null,
    test_name: String(row.test_name),
    test_code: String(row.test_code),
    status: row.status as TestStatus,
    result_state: row.result_state as ResultState,
    value: (row.value as string | null) ?? null,
    unit: (row.unit as string | null) ?? null,
    reference_range: (row.reference_range as string | null) ?? null,
    observations: (row.observations as string | null) ?? null,
    remarks: (row.remarks as string | null) ?? null,
    sample_id: (row.sample_id as number | null) ?? null,
    sample_code: (row.sample_code as string | null) ?? null,
    catalog_sample_type: (row.catalog_sample_type as string | null) ?? null,
    default_unit: (row.default_unit as string | null) ?? null,
    default_reference_range: (row.default_reference_range as string | null) ?? null,
    entered_by_name: (row.entered_by_name as string | null) ?? null,
    entered_at: (row.entered_at as string | null) ?? null,
    verified_by_name: (row.verified_by_name as string | null) ?? null,
    verified_at: (row.verified_at as string | null) ?? null,
    approved_by_name: (row.approved_by_name as string | null) ?? null,
    approved_at: (row.approved_at as string | null) ?? null,
    updated_at: String(row.updated_at ?? ''),
    revision_count: Number(row.revision_count ?? 0)
  }
}

const RESULT_SELECT = `
  SELECT tr.*, bi.test_id, bi.test_name, bi.test_code,
         lt.default_unit, lt.default_reference_range, lt.sample_type AS catalog_sample_type,
         s.sample_code,
         eu.full_name AS entered_by_name, vu.full_name AS verified_by_name, au.full_name AS approved_by_name,
         (SELECT COUNT(*) FROM result_revisions rr WHERE rr.result_id = tr.id) AS revision_count
  FROM test_results tr
  JOIN bill_items bi ON bi.id = tr.bill_item_id
  LEFT JOIN laboratory_tests lt ON lt.id = bi.test_id
  LEFT JOIN samples s ON s.id = tr.sample_id
  LEFT JOIN users eu ON eu.id = tr.entered_by
  LEFT JOIN users vu ON vu.id = tr.verified_by
  LEFT JOIN users au ON au.id = tr.approved_by`

function getBillRow(db: Database.Database, billId: number): LabBillWork['bill'] {
  const row = db
    .prepare(
      `SELECT b.id, b.bill_number, b.bill_date, b.status, b.notes,
              v.id AS visit_id, v.visit_code, v.category,
              p.id AS patient_id, p.patient_code, p.full_name AS patient_name, p.full_name_urdu AS patient_name_urdu,
              p.age, p.gender, pr.name AS practitioner_name
       FROM bills b
       JOIN visits v ON v.id = b.visit_id
       JOIN patients p ON p.id = b.patient_id
       LEFT JOIN practitioners pr ON pr.id = b.practitioner_id
       WHERE b.id = ?`
    )
    .get(billId) as Record<string, unknown> | undefined
  if (!row) throw new LabError('Bill not found.')
  return {
    id: Number(row.id),
    bill_number: String(row.bill_number),
    bill_date: String(row.bill_date),
    status: row.status as LabBillWork['bill']['status'],
    visit_id: Number(row.visit_id),
    visit_code: String(row.visit_code),
    patient_id: Number(row.patient_id),
    patient_code: String(row.patient_code),
    patient_name: String(row.patient_name),
    patient_name_urdu: (row.patient_name_urdu as string | null) ?? null,
    age: (row.age as number | null) ?? null,
    gender: row.gender as Gender,
    category: row.category as PatientCategory,
    practitioner_name: (row.practitioner_name as string | null) ?? null,
    notes: (row.notes as string | null) ?? null
  }
}

export function getBillWork(db: Database.Database, billId: number): LabBillWork {
  ensureResultRows(db)
  const bill = getBillRow(db, billId)
  const samples = (
    db
      .prepare(
        `SELECT s.*, u.full_name AS assigned_technician_name
         FROM samples s LEFT JOIN users u ON u.id = s.assigned_technician_id
         WHERE s.visit_id = ? ORDER BY s.id`
      )
      .all(bill.visit_id) as Array<Record<string, unknown>>
  ).map(mapSample)
  const results = (
    db.prepare(`${RESULT_SELECT} WHERE bi.bill_id = ? ORDER BY bi.id`).all(billId) as Array<Record<string, unknown>>
  ).map(mapResult)
  const reports = listBillReports(db, billId)
  return { bill, samples, results, reports }
}

export function listBillReports(db: Database.Database, billId: number): LabReportRow[] {
  return db
    .prepare(
      `SELECT lr.id, lr.report_code, lr.bill_id, lr.kind, lr.file_path, lr.generated_at,
              u.full_name AS generated_by_name
       FROM lab_reports lr LEFT JOIN users u ON u.id = lr.generated_by
       WHERE lr.bill_id = ? ORDER BY lr.id DESC`
    )
    .all(billId) as LabReportRow[]
}

function requireActiveBill(db: Database.Database, billId: number): void {
  const row = db.prepare('SELECT status FROM bills WHERE id = ?').get(billId) as { status: string } | undefined
  if (!row) throw new LabError('Bill not found.')
  if (!['FINALIZED', 'PARTIALLY_PAID', 'PAID'].includes(row.status)) {
    throw new LabError('Laboratory work is only available for active bills.')
  }
}

function getResultByItemId(db: Database.Database, billItemId: number): { result: Record<string, unknown>; bill_id: number } {
  const row = db
    .prepare(`${RESULT_SELECT} WHERE tr.bill_item_id = ?`)
    .get(billItemId) as Record<string, unknown> | undefined
  if (!row) throw new LabError('Test result not found — refresh the worklist.')
  const billId = Number(
    (db.prepare('SELECT bill_id FROM bill_items WHERE id = ?').get(billItemId) as { bill_id: number }).bill_id
  )
  return { result: row, bill_id: billId }
}

// ---------------------------------------------------------------- result entry (PRD §Module F)

export function saveResult(db: Database.Database, actor: Actor, input: LabSaveResultInput): LabBillWork {
  if (!actorHas(actor, 'test_results.manage')) {
    throw new LabError('You do not have permission to enter test results.')
  }
  const { result, bill_id } = getResultByItemId(db, input.bill_item_id)
  requireActiveBill(db, bill_id)
  if (result.result_state !== 'DRAFT') {
    throw new LabError('This result is already verified or approved. Reset it to draft (with a reason) before editing.')
  }
  const resultId = Number(result.id)
  const value = text(input.value)
  const unit = text(input.unit)
  const referenceRange = text(input.reference_range)
  const observations = text(input.observations)
  const remarks = text(input.remarks)

  if (input.sample_id !== undefined && input.sample_id !== null) {
    const visitId = Number(
      (db.prepare('SELECT visit_id FROM bills WHERE id = ?').get(bill_id) as { visit_id: number }).visit_id
    )
    const sample = db.prepare('SELECT id, visit_id FROM samples WHERE id = ?').get(input.sample_id) as
      | { id: number; visit_id: number }
      | undefined
    if (!sample) throw new LabError('Selected sample was not found.')
    if (sample.visit_id !== visitId) throw new LabError('The selected sample belongs to a different visit.')
  }

  const unchanged =
    result.value === value &&
    result.unit === unit &&
    result.reference_range === referenceRange &&
    result.observations === observations &&
    result.remarks === remarks &&
    (input.sample_id === undefined || result.sample_id === (input.sample_id ?? null))

  const tx = db.transaction(() => {
    let revisionNo: number | null = null
    if (!unchanged) {
      revisionNo = Number(
        (
          db.prepare('SELECT COALESCE(MAX(revision_no), 0) + 1 AS n FROM result_revisions WHERE result_id = ?').get(resultId) as { n: number }
        ).n
      )
      db.prepare(
        `INSERT INTO result_revisions (result_id, revision_no, value, unit, reference_range, observations, remarks, changed_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(resultId, revisionNo, value, unit, referenceRange, observations, remarks, actor.id)
    }

    const firstEntry = result.entered_at == null
    db.prepare(
      `UPDATE test_results SET value = ?, unit = ?, reference_range = ?, observations = ?, remarks = ?,
              sample_id = COALESCE(?, sample_id),
              entered_by = COALESCE(entered_by, ?),
              entered_at = COALESCE(entered_at, ?),
              status = CASE WHEN status = 'PENDING' THEN 'IN_PROGRESS' ELSE status END,
              updated_at = datetime('now','localtime')
       WHERE id = ?`
    ).run(
      value,
      unit,
      referenceRange,
      observations,
      remarks,
      input.sample_id !== undefined ? input.sample_id : null,
      firstEntry ? actor.id : null,
      firstEntry ? nowStamp() : null,
      resultId
    )

    writeAudit(db, {
      userId: actor.id,
      action: firstEntry ? 'RESULT_ENTERED' : 'RESULT_SAVED',
      entityType: 'test_result',
      entityId: resultId,
      newValue: {
        bill_item_id: input.bill_item_id,
        revision_no: revisionNo,
        value,
        unit,
        reference_range: referenceRange,
        test: String(result.test_name)
      }
    })
  })
  tx()
  return getBillWork(db, bill_id)
}

// ---------------------------------------------------------------- test status workflow

export function setTestStatus(db: Database.Database, actor: Actor, billItemId: number, status: TestStatus, reason?: string): LabBillWork {
  if (!actorHas(actor, 'test_results.manage')) {
    throw new LabError('You do not have permission to change test statuses.')
  }
  if (!['PENDING', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED'].includes(status)) {
    throw new LabError('Unknown test status.')
  }
  const { result, bill_id } = getResultByItemId(db, billItemId)
  requireActiveBill(db, bill_id)
  const current = result.status as TestStatus
  if (current === status) return getBillWork(db, bill_id)

  const trimmedReason = (reason ?? '').trim()
  if (status === 'CANCELLED') {
    if (current === 'COMPLETED') throw new LabError('A completed test cannot be cancelled — its result is part of the record.')
    if (current === 'CANCELLED') throw new LabError('This test is already cancelled.')
    if (trimmedReason.length < 3) throw new LabError('A reason is required to cancel a test.')
  }
  if (status === 'COMPLETED' && !text(result.value as string | null)) {
    throw new LabError('Enter a test result value before marking the test completed.')
  }
  if (status === 'PENDING' && current !== 'PENDING') {
    throw new LabError('Tests cannot move back to pending.')
  }
  if (status === 'IN_PROGRESS' && current !== 'PENDING') {
    throw new LabError('Only pending tests can be started.')
  }

  const tx = db.transaction(() => {
    db.prepare("UPDATE test_results SET status = ?, updated_at = datetime('now','localtime') WHERE id = ?").run(status, Number(result.id))
    writeAudit(db, {
      userId: actor.id,
      action: 'TEST_STATUS_CHANGED',
      entityType: 'test_result',
      entityId: Number(result.id),
      oldValue: { status: current },
      newValue: { status },
      reason: trimmedReason || undefined
    })
  })
  tx()
  return getBillWork(db, bill_id)
}

// ---------------------------------------------------------------- verification & approval (PRD §Module F)

export function verifyResult(db: Database.Database, actor: Actor, billItemId: number): LabBillWork {
  if (!actorHas(actor, 'results.approve')) {
    throw new LabError('You do not have permission to verify results.')
  }
  const { result, bill_id } = getResultByItemId(db, billItemId)
  requireActiveBill(db, bill_id)
  if (result.result_state !== 'DRAFT') throw new LabError('Only draft results can be verified.')
  if (!text(result.value as string | null)) throw new LabError('Enter a result value before verification.')
  const resultId = Number(result.id)
  const tx = db.transaction(() => {
    db.prepare(
      `UPDATE test_results
       SET result_state = 'VERIFIED', verified_by = ?, verified_at = ?,
           status = 'COMPLETED', updated_at = datetime('now','localtime')
       WHERE id = ?`
    ).run(actor.id, nowStamp(), resultId)
    writeAudit(db, {
      userId: actor.id,
      action: 'RESULT_VERIFIED',
      entityType: 'test_result',
      entityId: resultId,
      newValue: { bill_item_id: billItemId, result_state: 'VERIFIED', test: String(result.test_name) }
    })
  })
  tx()
  return getBillWork(db, bill_id)
}

export function approveResult(db: Database.Database, actor: Actor, billItemId: number): LabBillWork {
  if (!actorHas(actor, 'results.approve')) {
    throw new LabError('You do not have permission to approve results.')
  }
  const { result, bill_id } = getResultByItemId(db, billItemId)
  requireActiveBill(db, bill_id)
  if (result.result_state === 'APPROVED') throw new LabError('This result is already approved.')
  if (result.result_state === 'DRAFT') throw new LabError('Verify the result before approving it.')
  if (!text(result.value as string | null)) throw new LabError('Enter a result value before approval.')
  const resultId = Number(result.id)
  const tx = db.transaction(() => {
    db.prepare(
      `UPDATE test_results
       SET result_state = 'APPROVED', approved_by = ?, approved_at = ?, updated_at = datetime('now','localtime')
       WHERE id = ?`
    ).run(actor.id, nowStamp(), resultId)
    writeAudit(db, {
      userId: actor.id,
      action: 'RESULT_APPROVED',
      entityType: 'test_result',
      entityId: resultId,
      newValue: { bill_item_id: billItemId, result_state: 'APPROVED', test: String(result.test_name) }
    })
  })
  tx()
  return getBillWork(db, bill_id)
}

export function resetResult(db: Database.Database, actor: Actor, billItemId: number, reason: string): LabBillWork {
  if (!actorHas(actor, 'results.approve')) {
    throw new LabError('You do not have permission to reset verified results.')
  }
  const trimmed = (reason ?? '').trim()
  if (trimmed.length < 3) throw new LabError('A reason is required to reset a result to draft.')
  const { result, bill_id } = getResultByItemId(db, billItemId)
  requireActiveBill(db, bill_id)
  if (result.result_state === 'DRAFT') throw new LabError('This result is already a draft.')
  const resultId = Number(result.id)
  const previous = result.result_state as ResultState
  const tx = db.transaction(() => {
    db.prepare(
      `UPDATE test_results
       SET result_state = 'DRAFT', verified_by = NULL, verified_at = NULL,
           approved_by = NULL, approved_at = NULL, updated_at = datetime('now','localtime')
       WHERE id = ?`
    ).run(resultId)
    writeAudit(db, {
      userId: actor.id,
      action: 'RESULT_RESET',
      entityType: 'test_result',
      entityId: resultId,
      oldValue: { result_state: previous },
      newValue: { result_state: 'DRAFT' },
      reason: trimmed
    })
  })
  tx()
  return getBillWork(db, bill_id)
}

export function listRevisions(db: Database.Database, billItemId: number): LabRevisionRow[] {
  return db
    .prepare(
      `SELECT rr.id, rr.revision_no, rr.value, rr.unit, rr.reference_range, rr.observations, rr.remarks,
              rr.changed_at, u.full_name AS changed_by_name
       FROM result_revisions rr LEFT JOIN users u ON u.id = rr.changed_by
       WHERE rr.result_id = (SELECT id FROM test_results WHERE bill_item_id = ?)
       ORDER BY rr.revision_no DESC`
    )
    .all(billItemId) as LabRevisionRow[]
}

// ---------------------------------------------------------------- samples (PRD §Module F)

export function createSample(db: Database.Database, actor: Actor, input: LabCreateSampleInput): LabBillWork {
  if (!actorHas(actor, 'test_results.manage')) {
    throw new LabError('You do not have permission to manage samples.')
  }
  const billId = input.bill_id
  requireActiveBill(db, billId)
  const visit = db.prepare('SELECT id, visit_date FROM visits WHERE id = (SELECT visit_id FROM bills WHERE id = ?)').get(billId) as
    | { id: number }
    | undefined
  if (!visit) throw new LabError('Bill not found.')

  const status = (input.status ?? 'NOT_COLLECTED') as SampleStatus
  if (!Object.keys(SAMPLE_ORDER).includes(status) || status === 'COMPLETED') {
    throw new LabError('A new sample cannot start as completed.')
  }
  const collectedAt = text(input.collected_at)

  const tx = db.transaction(() => {
    const code = nextCode(db, { table: 'samples', column: 'sample_code', prefix: 'SMP', yearly: true })
    const stamp = collectedAt ?? (status !== 'NOT_COLLECTED' ? nowStamp() : null)
    const info = db
      .prepare(
        `INSERT INTO samples (sample_code, visit_id, sample_type, status, collected_at, assigned_technician_id, notes)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      )
      .run(code, visit.id, text(input.sample_type), status, stamp, input.assigned_technician_id ?? null, text(input.notes))
    const sampleId = Number(info.lastInsertRowid)

    const linkIds = (input.link_item_ids ?? []).filter((id) => Number.isInteger(id) && id > 0)
    for (const itemId of linkIds) {
      const owner = db
        .prepare('SELECT bi.bill_id FROM bill_items bi WHERE bi.id = ?')
        .get(itemId) as { bill_id: number } | undefined
      if (!owner || owner.bill_id !== billId) {
        throw new LabError('One of the selected tests does not belong to this bill.')
      }
      db.prepare(
        `UPDATE test_results SET sample_id = ?, updated_at = datetime('now','localtime')
         WHERE bill_item_id = ? AND result_state = 'DRAFT'`
      ).run(sampleId, itemId)
    }

    writeAudit(db, {
      userId: actor.id,
      action: 'SAMPLE_CREATED',
      entityType: 'sample',
      entityId: sampleId,
      newValue: { sample_code: code, bill_id: billId, status, sample_type: text(input.sample_type), linked_items: linkIds.length }
    })
  })
  tx()
  return getBillWork(db, billId)
}

export function updateSample(db: Database.Database, actor: Actor, sampleId: number, patch: LabUpdateSampleInput, reason?: string): LabBillWork {
  if (!actorHas(actor, 'test_results.manage')) {
    throw new LabError('You do not have permission to manage samples.')
  }
  const sample = db.prepare('SELECT * FROM samples WHERE id = ?').get(sampleId) as
    | (Record<string, unknown> & { visit_id: number })
    | undefined
  if (!sample) throw new LabError('Sample not found.')
  const bill = db.prepare('SELECT id FROM bills WHERE visit_id = ?').get(sample.visit_id) as { id: number } | undefined
  if (!bill) throw new LabError('No bill is linked to this sample.')

  const nextStatus = patch.status !== undefined ? (patch.status as SampleStatus) : (sample.status as SampleStatus)
  const currentStatus = sample.status as SampleStatus
  if (nextStatus !== currentStatus && !canTransitionSample(currentStatus, nextStatus)) {
    throw new LabError(`A sample cannot move from ${currentStatus} to ${nextStatus}.`)
  }
  const trimmedReason = (reason ?? '').trim()
  if (nextStatus === 'REJECTED' && trimmedReason.length < 3) {
    throw new LabError('A reason is required to reject a sample.')
  }
  if (currentStatus === 'REJECTED' && nextStatus === 'NOT_COLLECTED' && trimmedReason.length < 3) {
    throw new LabError('A reason is required to re-collect a rejected sample.')
  }

  const collectedAt = patch.collected_at !== undefined ? text(patch.collected_at) : (sample.collected_at as string | null)
  const effectiveCollectedAt =
    collectedAt ?? (nextStatus !== 'NOT_COLLECTED' && currentStatus === 'NOT_COLLECTED' ? nowStamp() : collectedAt)

  const tx = db.transaction(() => {
    db.prepare(
      `UPDATE samples SET sample_type = ?, status = ?, collected_at = ?, assigned_technician_id = ?, notes = ?
       WHERE id = ?`
    ).run(
      patch.sample_type !== undefined ? text(patch.sample_type) : (sample.sample_type as string | null),
      nextStatus,
      effectiveCollectedAt,
      patch.assigned_technician_id !== undefined ? patch.assigned_technician_id : (sample.assigned_technician_id as number | null),
      patch.notes !== undefined ? text(patch.notes) : (sample.notes as string | null),
      sampleId
    )
    if (nextStatus !== currentStatus) {
      writeAudit(db, {
        userId: actor.id,
        action: 'SAMPLE_STATUS_CHANGED',
        entityType: 'sample',
        entityId: sampleId,
        oldValue: { status: currentStatus },
        newValue: { status: nextStatus },
        reason: trimmedReason || undefined
      })
    } else {
      writeAudit(db, {
        userId: actor.id,
        action: 'SAMPLE_UPDATED',
        entityType: 'sample',
        entityId: sampleId,
        newValue: { sample_type: patch.sample_type, notes: patch.notes }
      })
    }
  })
  tx()
  return getBillWork(db, bill.id)
}

// ---------------------------------------------------------------- patient test history & technicians

export function patientHistory(db: Database.Database, patientId: number): PatientLabHistoryRow[] {
  ensureResultRows(db)
  return db
    .prepare(
      `SELECT b.id AS bill_id, b.bill_number, b.bill_date, v.visit_code,
              bi.test_name, bi.test_code,
              tr.status, tr.result_state, tr.value, tr.unit,
              s.sample_code,
              (SELECT lr.report_code FROM lab_reports lr WHERE lr.bill_id = b.id ORDER BY lr.id DESC LIMIT 1) AS latest_report_code,
              (SELECT lr.generated_at FROM lab_reports lr WHERE lr.bill_id = b.id ORDER BY lr.id DESC LIMIT 1) AS latest_report_at
       FROM bill_items bi
       JOIN test_results tr ON tr.bill_item_id = bi.id
       JOIN bills b ON b.id = bi.bill_id
       JOIN visits v ON v.id = b.visit_id
       LEFT JOIN samples s ON s.id = tr.sample_id
       WHERE b.patient_id = ? AND b.status IN ${ACTIVE_BILL_STATUSES}
       ORDER BY b.bill_date DESC, b.id DESC, bi.id`
    )
    .all(patientId) as PatientLabHistoryRow[]
}

export function listTechnicians(db: Database.Database): LabTechnician[] {
  return db
    .prepare('SELECT id, full_name FROM users WHERE is_active = 1 ORDER BY full_name COLLATE NOCASE')
    .all() as LabTechnician[]
}

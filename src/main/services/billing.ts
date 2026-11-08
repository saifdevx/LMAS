import type Database from 'better-sqlite3'
import type {
  AddPaymentInput,
  BillListFilters,
  BillListResult,
  BillStatus,
  BillView,
  CreateBillInput,
  PatientCategory,
  PaymentMethod
} from '../../shared/api-types'
import { calculateBillTotals, calculateCommission } from '../../shared/commission'
import { localDate } from './dashboard'
import { nextCode, cleanPrefix } from '../lib/numbering'
import { getSettings } from './settings'
import { writeAudit } from './audit'
import { getPatient } from './patients'
import { Actor, actorHas } from '../lib/actor'

/**
 * Billing service (PRD §Modules E, H + §3 accounting rules).
 *
 * Every bill creation runs in ONE transaction that: creates the visit, the
 * bill with price/rate/policy snapshots, the bill items, the commission
 * ACCRUAL entry (per active policy), and the initial patient payment.
 * Duplicate payment transaction IDs are rejected at DB level (Scenario 8).
 */

export class BillingError extends Error {}

interface BillRow {
  id: number
  bill_number: string
  visit_id: number
  patient_id: number
  category: PatientCategory
  practitioner_id: number | null
  practitioner_rate_bp: number | null
  commission_basis: 'NET_BILL' | 'COLLECTED' | null
  subtotal_paisa: number
  discount_paisa: number
  net_paisa: number
  commission_paisa: number
  lab_allocation_paisa: number
  status: BillStatus
  bill_date: string
  notes: string | null
  created_at: string
  finalized_at: string | null
  visit_code: string
  patient_code: string
  patient_name: string
  patient_name_urdu: string | null
  practitioner_name: string | null
  created_by_name: string | null
}

const BILL_SELECT = `
  SELECT b.*, v.visit_code, p.patient_code, p.full_name AS patient_name, p.full_name_urdu AS patient_name_urdu,
         pr.name AS practitioner_name, u.full_name AS created_by_name
  FROM bills b
  JOIN visits v ON v.id = b.visit_id
  JOIN patients p ON p.id = b.patient_id
  LEFT JOIN practitioners pr ON pr.id = b.practitioner_id
  LEFT JOIN users u ON u.id = b.created_by`

function rowToBillView(db: Database.Database, row: BillRow): BillView {
  const items = db
    .prepare('SELECT id, test_id, test_name, test_code, list_price_paisa, price_paisa, direct_cost_paisa, line_total_paisa FROM bill_items WHERE bill_id = ? ORDER BY id')
    .all(row.id) as BillView['items']
  const payments = db
    .prepare(
      `SELECT p.id, p.transaction_id, p.amount_paisa, p.method, p.reference_number, p.paid_at, u.full_name AS received_by_name
       FROM payments p LEFT JOIN users u ON u.id = p.received_by WHERE p.bill_id = ? ORDER BY p.id`
    )
    .all(row.id) as BillView['payments']
  const refunds = db
    .prepare(
      `SELECT r.id, r.refund_code, r.amount_paisa, r.method, r.reason, r.created_at, u.full_name AS issued_by_name
       FROM refunds r LEFT JOIN users u ON u.id = r.created_by WHERE r.bill_id = ? ORDER BY r.id`
    )
    .all(row.id) as BillView['refunds']
  const paid = payments.reduce((s, p) => s + p.amount_paisa, 0)
  const refunded = refunds.reduce((s, r) => s + r.amount_paisa, 0)
  const cancelled = row.status === 'CANCELLED'
  return {
    id: row.id,
    bill_number: row.bill_number,
    visit_id: row.visit_id,
    visit_code: row.visit_code,
    patient_id: row.patient_id,
    patient_code: row.patient_code,
    patient_name: row.patient_name,
    patient_name_urdu: row.patient_name_urdu,
    category: row.category,
    practitioner_id: row.practitioner_id,
    practitioner_name: row.practitioner_name,
    practitioner_rate_bp: row.practitioner_rate_bp,
    commission_basis: row.commission_basis,
    subtotal_paisa: row.subtotal_paisa,
    discount_paisa: row.discount_paisa,
    net_paisa: row.net_paisa,
    commission_paisa: row.commission_paisa,
    lab_allocation_paisa: row.lab_allocation_paisa,
    status: row.status,
    bill_date: row.bill_date,
    notes: row.notes,
    created_by_name: row.created_by_name,
    created_at: row.created_at,
    finalized_at: row.finalized_at,
    items,
    payments,
    refunds,
    paid_paisa: cancelled ? 0 : paid,
    refunded_paisa: cancelled ? 0 : refunded,
    outstanding_paisa: cancelled ? 0 : Math.max(0, row.net_paisa - paid + refunded)
  }
}

export function getBill(db: Database.Database, id: number): BillView {
  const row = db.prepare(`${BILL_SELECT} WHERE b.id = ?`).get(id) as BillRow | undefined
  if (!row) throw new BillingError('Bill not found.')
  return rowToBillView(db, row)
}

function statusForPaid(net: number, paid: number): BillStatus {
  if (paid <= 0) return 'FINALIZED'
  if (paid >= net) return 'PAID'
  return 'PARTIALLY_PAID'
}

export function createBill(db: Database.Database, actor: Actor, input: CreateBillInput): BillView {
  const settings = getSettings(db)
  const policy = settings['app.commissionBasis'] === 'COLLECTED' ? 'COLLECTED' : 'NET_BILL'

  if (!input.items || input.items.length === 0) throw new BillingError('Add at least one laboratory test to the bill.')
  if (!Number.isInteger(input.discount_paisa) || input.discount_paisa < 0) throw new BillingError('Discount must be a non-negative amount.')
  if (!Number.isInteger(input.initial_payment_paisa) || input.initial_payment_paisa < 0) throw new BillingError('Amount received must be a non-negative amount.')
  const txn = (input.transaction_id ?? '').trim()
  if (txn.length < 8) throw new BillingError('Payment transaction reference is missing or invalid.')

  const patient = getPatient(db, input.patient_id)
  const category = input.category
  if (category !== 'SELF' && category !== 'REFERRED') throw new BillingError('Select the patient category.')
  let practitionerRateBp: number | null = null
  if (category === 'REFERRED') {
    if (!input.practitioner_id) throw new BillingError('Referred patients require a referring practitioner.')
    const pr = db.prepare('SELECT id, name, commission_rate_bp, is_active FROM practitioners WHERE id = ?').get(input.practitioner_id) as
      | { id: number; name: string; commission_rate_bp: number; is_active: number }
      | undefined
    if (!pr) throw new BillingError('Selected practitioner was not found.')
    if (!pr.is_active) throw new BillingError('Selected practitioner is inactive.')
    practitionerRateBp = pr.commission_rate_bp
  }

  // Price snapshot: line total = current catalog price at billing time.
  const testRows = db
    .prepare(
      `SELECT id, name, test_code, price_paisa, direct_cost_paisa, is_active FROM laboratory_tests
       WHERE id IN (${input.items.map(() => '?').join(',')})`
    )
    .all(...input.items.map((i) => i.test_id)) as Array<{ id: number; name: string; test_code: string; price_paisa: number; direct_cost_paisa: number | null; is_active: number }>
  if (testRows.length !== input.items.length) throw new BillingError('One of the selected tests no longer exists — refresh the test list.')
  const byId = new Map(testRows.map((t) => [t.id, t]))
  for (const item of input.items) {
    const t = byId.get(item.test_id)
    if (!t) throw new BillingError('Selected test not found.')
    if (!t.is_active) throw new BillingError(`"${t.name}" is no longer in the active catalog — remove it and refresh the test list.`)
  }
  const lines = input.items.map((i) => {
    const t = byId.get(i.test_id)!
    return { test: t, lineTotalPaisa: t.price_paisa }
  })

  const totals = calculateBillTotals(lines, input.discount_paisa)
  if (totals.discountPaisa > 0 && !actorHas(actor, 'billing.discount')) {
    throw new BillingError('You do not have permission to apply discounts.')
  }
  if (input.initial_payment_paisa > totals.netPaisa) {
    throw new BillingError('Amount received cannot exceed the net bill.')
  }

  // Commission: eligible amount depends on the ACTIVE policy (PRD §3.2).
  const eligible = policy === 'COLLECTED' ? Math.min(input.initial_payment_paisa, totals.netPaisa) : totals.netPaisa
  const commission =
    category === 'REFERRED'
      ? calculateCommission({ category, eligibleAmountPaisa: eligible, rateBp: practitionerRateBp ?? 0 })
      : { commissionPaisa: 0, labAllocationPaisa: totals.netPaisa }
  // Display figure on the bill follows the net bill at the snapshot rate.
  const billLevelCommission =
    category === 'REFERRED'
      ? calculateCommission({ category, eligibleAmountPaisa: totals.netPaisa, rateBp: practitionerRateBp ?? 0 })
      : { commissionPaisa: 0, labAllocationPaisa: totals.netPaisa }

  const today = localDate(new Date())
  const status = statusForPaid(totals.netPaisa, input.initial_payment_paisa)

  const tx = db.transaction(() => {
    const visitCode = nextCode(db, { table: 'visits', column: 'visit_code', prefix: 'VIS', yearly: true })
    const visitInfo = db
      .prepare(
        'INSERT INTO visits (visit_code, patient_id, category, practitioner_id, visit_date, created_by) VALUES (?, ?, ?, ?, ?, ?)'
      )
      .run(visitCode, patient.id, category, category === 'REFERRED' ? input.practitioner_id : null, today, actor.id)
    const visitId = Number(visitInfo.lastInsertRowid)

    const billPrefix = cleanPrefix(settings['numbering.billPrefix'], 'BILL')
    const billNumber = nextCode(db, { table: 'bills', column: 'bill_number', prefix: billPrefix, yearly: true }, settings)
    const billInfo = db
      .prepare(
        `INSERT INTO bills (bill_number, visit_id, patient_id, category, practitioner_id, practitioner_rate_bp, commission_basis,
          subtotal_paisa, discount_paisa, net_paisa, commission_paisa, lab_allocation_paisa, status, bill_date, notes, created_by, finalized_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now','localtime'))`
      )
      .run(
        billNumber, visitId, patient.id, category,
        category === 'REFERRED' ? input.practitioner_id : null,
        practitionerRateBp, policy,
        totals.subtotalPaisa, totals.discountPaisa, totals.netPaisa,
        billLevelCommission.commissionPaisa, billLevelCommission.labAllocationPaisa,
        status, today, (input.notes ?? '').trim() || null, actor.id
      )
    const billId = Number(billInfo.lastInsertRowid)

    const insItem = db.prepare(
      `INSERT INTO bill_items (bill_id, test_id, test_name, test_code, list_price_paisa, price_paisa, direct_cost_paisa, line_total_paisa)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    )
    // Every billed test starts its laboratory workflow as PENDING (PRD §Module F).
    const insResult = db.prepare("INSERT INTO test_results (bill_item_id, status, result_state) VALUES (?, 'PENDING', 'DRAFT')")
    for (const line of lines) {
      const itemInfo = insItem.run(billId, line.test.id, line.test.name, line.test.test_code, line.test.price_paisa, line.test.price_paisa, line.test.direct_cost_paisa, line.lineTotalPaisa)
      insResult.run(Number(itemInfo.lastInsertRowid))
    }

    if (category === 'REFERRED' && eligible > 0) {
      db.prepare(
        `INSERT INTO practitioner_commission_entries (bill_id, practitioner_id, entry_type, basis, rate_bp, eligible_paisa, commission_paisa, created_by)
         VALUES (?, ?, 'ACCRUAL', ?, ?, ?, ?, ?)`
      ).run(billId, input.practitioner_id, policy, practitionerRateBp, eligible, commission.commissionPaisa, actor.id)
    }

    if (input.initial_payment_paisa > 0) {
      db.prepare(
        'INSERT INTO payments (transaction_id, bill_id, amount_paisa, method, reference_number, received_by, notes) VALUES (?, ?, ?, ?, ?, ?, ?)'
      ).run(txn, billId, input.initial_payment_paisa, input.method ?? 'CASH', (input.reference_number ?? '').trim() || null, actor.id, (input.notes ?? '').trim() || null)
    }

    writeAudit(db, {
      userId: actor.id,
      action: 'BILL_CREATED',
      entityType: 'bill',
      entityId: billId,
      newValue: {
        bill_number: billNumber,
        patient: patient.patient_code,
        category,
        net_paisa: totals.netPaisa,
        commission_paisa: commission.commissionPaisa,
        basis: policy,
        received: input.initial_payment_paisa
      }
    })
    return billId
  })

  const billId = tx()
  return getBill(db, billId)
}

export function addPayment(db: Database.Database, actor: Actor, input: AddPaymentInput): BillView {
  if (!Number.isInteger(input.amount_paisa) || input.amount_paisa <= 0) throw new BillingError('Payment amount must be a positive amount.')
  const txn = (input.transaction_id ?? '').trim()
  if (txn.length < 8) throw new BillingError('Payment transaction reference is missing or invalid.')
  const method: PaymentMethod = input.method ?? 'CASH'

  const row = db.prepare(`${BILL_SELECT} WHERE b.id = ?`).get(input.bill_id) as BillRow | undefined
  if (!row) throw new BillingError('Bill not found.')
  if (row.status === 'CANCELLED') throw new BillingError('This bill is cancelled — payments are not allowed.')
  if (row.status === 'REFUNDED') throw new BillingError('This bill is refunded — payments are not allowed.')

  const alreadyPaid = (db.prepare('SELECT COALESCE(SUM(amount_paisa), 0) AS s FROM payments WHERE bill_id = ?').get(row.id) as { s: number }).s
  const alreadyRefunded = (db.prepare('SELECT COALESCE(SUM(amount_paisa), 0) AS s FROM refunds WHERE bill_id = ?').get(row.id) as { s: number }).s
  const outstanding = row.net_paisa - alreadyPaid + alreadyRefunded
  if (outstanding <= 0) throw new BillingError('This bill is already fully paid.')
  if (input.amount_paisa > outstanding) {
    throw new BillingError('Payment exceeds the outstanding balance for this bill.')
  }

  const tx = db.transaction(() => {
    try {
      db.prepare(
        'INSERT INTO payments (transaction_id, bill_id, amount_paisa, method, reference_number, received_by, notes) VALUES (?, ?, ?, ?, ?, ?, ?)'
      ).run(txn, row.id, input.amount_paisa, method, (input.reference_number ?? '').trim() || null, actor.id, (input.notes ?? '').trim() || null)
    } catch (err) {
      if (err instanceof Error && /UNIQUE/.test(err.message)) {
        throw new BillingError('Duplicate payment blocked: this transaction was already recorded.')
      }
      throw err
    }

    const newPaid = alreadyPaid + input.amount_paisa
    db.prepare('UPDATE bills SET status = ? WHERE id = ?').run(statusForPaid(row.net_paisa, newPaid), row.id)

    // COLLECTED basis: commission accrues on collections as they arrive.
    if (row.category === 'REFERRED' && row.commission_basis === 'COLLECTED' && row.practitioner_id) {
      const increment = calculateCommission({
        category: 'REFERRED',
        eligibleAmountPaisa: input.amount_paisa,
        rateBp: row.practitioner_rate_bp ?? 0
      })
      db.prepare(
        `INSERT INTO practitioner_commission_entries (bill_id, practitioner_id, entry_type, basis, rate_bp, eligible_paisa, commission_paisa, created_by)
         VALUES (?, ?, 'ACCRUAL', 'COLLECTED', ?, ?, ?, ?)`
      ).run(row.id, row.practitioner_id, row.practitioner_rate_bp ?? 0, input.amount_paisa, increment.commissionPaisa, actor.id)
    }

    writeAudit(db, {
      userId: actor.id,
      action: 'PAYMENT_RECORDED',
      entityType: 'payment',
      entityId: txn,
      newValue: { bill_id: row.id, bill_number: row.bill_number, amount_paisa: input.amount_paisa, method }
    })
  })
  tx()
  return getBill(db, row.id)
}

export function cancelBill(db: Database.Database, actor: Actor, billId: number, reason: string): BillView {
  if (!actorHas(actor, 'bills.cancel')) throw new BillingError('You do not have permission to cancel bills.')
  const trimmed = (reason ?? '').trim()
  if (trimmed.length < 3) throw new BillingError('A reason is required to cancel a bill.')
  const row = db.prepare(`${BILL_SELECT} WHERE b.id = ?`).get(billId) as BillRow | undefined
  if (!row) throw new BillingError('Bill not found.')
  if (row.status === 'CANCELLED') throw new BillingError('This bill is already cancelled.')
  if (row.status === 'REFUNDED') throw new BillingError('Refunded bills cannot be cancelled.')

  const paid = (db.prepare('SELECT COALESCE(SUM(amount_paisa), 0) AS s FROM payments WHERE bill_id = ?').get(row.id) as { s: number }).s
  if (paid > 0) {
    throw new BillingError('This bill has payments recorded. Use the refund process on the bill instead of cancellation.')
  }

  const tx = db.transaction(() => {
    db.prepare("UPDATE bills SET status = 'CANCELLED' WHERE id = ?").run(row.id)

    const adjustCode = nextCode(db, { table: 'adjustments', column: 'adjustment_code', prefix: 'ADJ', yearly: true })
    db.prepare(
      'INSERT INTO adjustments (adjustment_code, bill_id, adjustment_type, amount_paisa, reason, created_by) VALUES (?, ?, ?, ?, ?, ?)'
    ).run(adjustCode, row.id, 'BILL_ADJUSTMENT', -row.net_paisa, trimmed, actor.id)

    const accrued = (db.prepare("SELECT COALESCE(SUM(commission_paisa), 0) AS s FROM practitioner_commission_entries WHERE bill_id = ? AND entry_type IN ('ACCRUAL','ADJUSTMENT')").get(row.id) as { s: number }).s
    if (accrued !== 0 && row.practitioner_id) {
      db.prepare(
        `INSERT INTO practitioner_commission_entries (bill_id, practitioner_id, entry_type, basis, rate_bp, eligible_paisa, commission_paisa, created_by, notes)
         VALUES (?, ?, 'REVERSAL', ?, ?, 0, ?, ?, ?)`
      ).run(row.id, row.practitioner_id, row.commission_basis ?? 'NET_BILL', row.practitioner_rate_bp ?? 0, -accrued, actor.id, `Bill ${row.bill_number} cancelled: ${trimmed}`)
    }

    writeAudit(db, {
      userId: actor.id,
      action: 'BILL_CANCELLED',
      entityType: 'bill',
      entityId: row.id,
      oldValue: { status: row.status, net_paisa: row.net_paisa },
      newValue: { status: 'CANCELLED' },
      reason: trimmed
    })
  })
  tx()
  return getBill(db, row.id)
}

export function listBills(db: Database.Database, filters: BillListFilters): BillListResult {
  const where: string[] = []
  const params: Array<string | number> = []
  const f = filters ?? {}
  if (f.from && /^\d{4}-\d{2}-\d{2}$/.test(f.from)) {
    where.push('b.bill_date >= ?')
    params.push(f.from)
  }
  if (f.to && /^\d{4}-\d{2}-\d{2}$/.test(f.to)) {
    where.push('b.bill_date <= ?')
    params.push(f.to)
  }
  if (f.status && f.status !== 'ALL') {
    where.push('b.status = ?')
    params.push(f.status)
  }
  if (f.category === 'SELF' || f.category === 'REFERRED') {
    where.push('b.category = ?')
    params.push(f.category)
  }
  const q = (f.query ?? '').trim()
  if (q.length > 0) {
    const like = `%${q.replace(/[%_\\]/g, (c) => `\\${c}`)}%`
    where.push("(b.bill_number LIKE ? ESCAPE '\\' OR p.full_name LIKE ? ESCAPE '\\' OR p.patient_code LIKE ? ESCAPE '\\')")
    params.push(like, like, like)
  }
  const whereSql = where.length ? 'WHERE ' + where.join(' AND ') : ''
  const total = (
    db.prepare(`SELECT COUNT(*) AS n FROM bills b JOIN patients p ON p.id = b.patient_id ${whereSql}`).get(...params) as { n: number }
  ).n

  const page = Math.max(1, Math.floor(f.page ?? 1))
  const pageSize = Math.min(100, Math.max(5, Math.floor(f.pageSize ?? 25)))
  const rows = db
    .prepare(
      `SELECT b.id, b.bill_number, b.bill_date, b.patient_id, p.patient_code, p.full_name AS patient_name,
              b.category, pr.name AS practitioner_name, b.net_paisa, b.status,
              COALESCE((SELECT SUM(amount_paisa) FROM payments WHERE bill_id = b.id), 0) AS paid_paisa,
              COALESCE((SELECT SUM(amount_paisa) FROM refunds WHERE bill_id = b.id), 0) AS refunded_paisa
       FROM bills b JOIN patients p ON p.id = b.patient_id
       LEFT JOIN practitioners pr ON pr.id = b.practitioner_id
       ${whereSql}
       ORDER BY b.id DESC LIMIT ? OFFSET ?`
    )
    .all(...params, pageSize, (page - 1) * pageSize) as Array<{
    id: number
    bill_number: string
    bill_date: string
    patient_id: number
    patient_code: string
    patient_name: string
    category: PatientCategory
    practitioner_name: string | null
    net_paisa: number
    status: BillStatus
    paid_paisa: number
    refunded_paisa: number
  }>

  return {
    rows: rows.map((r) => ({
      id: r.id,
      bill_number: r.bill_number,
      bill_date: r.bill_date,
      patient_id: r.patient_id,
      patient_code: r.patient_code,
      patient_name: r.patient_name,
      category: r.category,
      practitioner_name: r.practitioner_name,
      net_paisa: r.net_paisa,
      paid_paisa: r.status === 'CANCELLED' ? 0 : r.paid_paisa,
      outstanding_paisa: r.status === 'CANCELLED' ? 0 : Math.max(0, r.net_paisa - r.paid_paisa + r.refunded_paisa),
      status: r.status
    })),
    total,
    page,
    pageSize
  }
}

export interface IssueRefundInput {
  bill_id: number
  amount_paisa: number
  reason: string
  method: PaymentMethod
  reference_number?: string
}

/**
 * Refund flow (PRD §Module H + permission `refunds.issue`): returns money
 * to the patient for a bill that already has payments. Reduces collected
 * revenue (collected - refunded) and marks the bill REFUNDED once the
 * refunded amount reaches the amount actually received. Commission entries
 * are NOT reversed automatically — the administrator reverses via a
 * COMMISSION_REVERSAL adjustment when policy requires it.
 */
export function issueRefund(db: Database.Database, actor: Actor, input: IssueRefundInput): BillView {
  if (!actorHas(actor, 'refunds.issue')) throw new BillingError('You do not have permission to issue refunds.')
  if (!Number.isInteger(input.amount_paisa) || input.amount_paisa <= 0) {
    throw new BillingError('Refund amount must be a positive amount.')
  }
  const reason = (input.reason ?? '').trim()
  if (reason.length < 3) throw new BillingError('A reason is required to issue a refund.')

  const row = db.prepare(`${BILL_SELECT} WHERE b.id = ?`).get(input.bill_id) as BillRow | undefined
  if (!row) throw new BillingError('Bill not found.')
  if (row.status === 'CANCELLED') throw new BillingError('Cancelled bills cannot be refunded.')
  if (row.status === 'DRAFT') throw new BillingError('Draft bills cannot be refunded.')

  const paid = (db.prepare('SELECT COALESCE(SUM(amount_paisa), 0) AS s FROM payments WHERE bill_id = ?').get(row.id) as { s: number }).s
  const alreadyRefunded = (db.prepare('SELECT COALESCE(SUM(amount_paisa), 0) AS s FROM refunds WHERE bill_id = ?').get(row.id) as { s: number }).s
  if (paid <= 0) throw new BillingError('This bill has no payments to refund — cancel it instead.')
  if (input.amount_paisa > paid - alreadyRefunded) {
    throw new BillingError('Refund exceeds the amount actually received on this bill.')
  }

  const tx = db.transaction(() => {
    const code = nextCode(db, { table: 'refunds', column: 'refund_code', prefix: 'REF', yearly: true })
    db.prepare(
      'INSERT INTO refunds (refund_code, bill_id, amount_paisa, reason, method, created_by) VALUES (?, ?, ?, ?, ?, ?)'
    ).run(code, row.id, input.amount_paisa, reason, input.method ?? 'CASH', actor.id)

    const refundedTotal = alreadyRefunded + input.amount_paisa
    if (refundedTotal >= paid && row.status !== 'REFUNDED') {
      db.prepare("UPDATE bills SET status = 'REFUNDED' WHERE id = ?").run(row.id)
    }

    writeAudit(db, {
      userId: actor.id,
      action: 'REFUND_ISSUED',
      entityType: 'refund',
      entityId: code,
      newValue: { bill_id: row.id, bill_number: row.bill_number, amount_paisa: input.amount_paisa, method: input.method ?? 'CASH' },
      reason
    })
  })
  tx()
  return getBill(db, row.id)
}

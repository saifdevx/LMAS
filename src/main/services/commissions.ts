import type Database from 'better-sqlite3'
import type { Actor } from '../lib/actor'
import { actorHas } from '../lib/actor'
import { writeAudit } from './audit'
import { nextCode } from '../lib/numbering'
import { outstandingCommission } from '../../shared/commission'

/**
 * Practitioner commission ledger and payments (PRD §3.5, §Module G,
 * CP4 deliverables). Accruals already exist from billing (Checkpoint 2);
 * this service exposes the ledger, per-practitioner outstanding balances
 * and the payment workflow. Outstanding is always
 *   SUM(commission_entries.commission_paisa) - SUM(practitioner_payments.amount_paisa)
 * so payments can never double-count commission expenses (CP4 acceptance).
 */

export class CommissionError extends Error {}

export interface CommissionAccountRow {
  practitioner_id: number
  practitioner_code: string
  name: string
  clinic_name: string | null
  commission_rate_bp: number
  is_active: number
  accrued_paisa: number
  paid_paisa: number
  outstanding_paisa: number
}

export function listCommissionAccounts(db: Database.Database, includeInactive = false): CommissionAccountRow[] {
  const rows = db
    .prepare(
      `SELECT pr.id, pr.practitioner_code, pr.name, pr.clinic_name, pr.commission_rate_bp, pr.is_active,
              COALESCE(e.accrued, 0) AS accrued_paisa,
              COALESCE(p.paid, 0) AS paid_paisa
       FROM practitioners pr
       LEFT JOIN (SELECT practitioner_id, SUM(commission_paisa) AS accrued FROM practitioner_commission_entries GROUP BY practitioner_id) e
              ON e.practitioner_id = pr.id
       LEFT JOIN (SELECT practitioner_id, SUM(amount_paisa) AS paid FROM practitioner_payments GROUP BY practitioner_id) p
              ON p.practitioner_id = pr.id
       ${includeInactive ? '' : 'WHERE pr.is_active = 1'}
       ORDER BY pr.name`
    )
    .all() as Array<Record<string, unknown>>
  return rows.map((r) => ({
    practitioner_id: Number(r.id),
    practitioner_code: String(r.practitioner_code),
    name: String(r.name),
    clinic_name: (r.clinic_name as string | null) ?? null,
    commission_rate_bp: Number(r.commission_rate_bp),
    is_active: Number(r.is_active),
    accrued_paisa: Number(r.accrued_paisa),
    paid_paisa: Number(r.paid_paisa),
    outstanding_paisa: outstandingCommission(Number(r.accrued_paisa), Number(r.paid_paisa))
  }))
}

export interface CommissionLedgerEntryRow {
  id: number
  date: string
  entry_type: 'ACCRUAL' | 'ADJUSTMENT' | 'REVERSAL'
  bill_number: string | null
  basis: string
  rate_bp: number
  eligible_paisa: number
  commission_paisa: number
  notes: string | null
  created_by_name: string | null
}

export interface CommissionPaymentRow {
  id: number
  transaction_id: string
  amount_paisa: number
  method: string
  reference_number: string | null
  paid_at: string
  paid_by_name: string | null
  notes: string | null
}

export interface CommissionLedger {
  practitioner: { id: number; practitioner_code: string; name: string; commission_rate_bp: number }
  accrued_paisa: number
  paid_paisa: number
  outstanding_paisa: number
  entries: CommissionLedgerEntryRow[]
  payments: CommissionPaymentRow[]
}

export function getCommissionLedger(db: Database.Database, practitionerId: number): CommissionLedger {
  const pr = db
    .prepare('SELECT id, practitioner_code, name, commission_rate_bp FROM practitioners WHERE id = ?')
    .get(practitionerId) as { id: number; practitioner_code: string; name: string; commission_rate_bp: number } | undefined
  if (!pr) throw new CommissionError('Practitioner not found')

  const entries = db
    .prepare(
      `SELECT e.id, e.created_at, e.entry_type, b.bill_number, e.basis, e.rate_bp,
              e.eligible_paisa, e.commission_paisa, e.notes, u.full_name AS created_by_name
       FROM practitioner_commission_entries e
       JOIN bills b ON b.id = e.bill_id
       LEFT JOIN users u ON u.id = e.created_by
       WHERE e.practitioner_id = ?
       ORDER BY e.created_at DESC, e.id DESC`
    )
    .all(practitionerId) as Array<Record<string, unknown>>

  const payments = db
    .prepare(
      `SELECT pp.id, pp.transaction_id, pp.amount_paisa, pp.method, pp.reference_number,
              pp.paid_at, pp.notes, u.full_name AS paid_by_name
       FROM practitioner_payments pp
       LEFT JOIN users u ON u.id = pp.paid_by
       WHERE pp.practitioner_id = ?
       ORDER BY pp.paid_at DESC, pp.id DESC`
    )
    .all(practitionerId) as Array<Record<string, unknown>>

  const accrued = entries.reduce((s, e) => s + Number(e.commission_paisa), 0)
  const paid = payments.reduce((s, p) => s + Number(p.amount_paisa), 0)

  return {
    practitioner: pr,
    accrued_paisa: accrued,
    paid_paisa: paid,
    outstanding_paisa: outstandingCommission(accrued, paid),
    entries: entries.map((e) => ({
      id: Number(e.id),
      date: String(e.created_at),
      entry_type: e.entry_type as CommissionLedgerEntryRow['entry_type'],
      bill_number: (e.bill_number as string | null) ?? null,
      basis: String(e.basis),
      rate_bp: Number(e.rate_bp),
      eligible_paisa: Number(e.eligible_paisa),
      commission_paisa: Number(e.commission_paisa),
      notes: (e.notes as string | null) ?? null,
      created_by_name: (e.created_by_name as string | null) ?? null
    })),
    payments: payments.map((p) => ({
      id: Number(p.id),
      transaction_id: String(p.transaction_id),
      amount_paisa: Number(p.amount_paisa),
      method: String(p.method),
      reference_number: (p.reference_number as string | null) ?? null,
      paid_at: String(p.paid_at),
      paid_by_name: (p.paid_by_name as string | null) ?? null,
      notes: (p.notes as string | null) ?? null
    }))
  }
}

export interface CommissionPaymentInput {
  practitioner_id: number
  amount_paisa: number
  method: 'CASH' | 'BANK_TRANSFER' | 'CARD' | 'MOBILE_WALLET' | 'CHEQUE'
  reference_number?: string
  notes?: string
  /** Client-generated unique key; duplicate submission is rejected. */
  transaction_id: string
}

export function recordCommissionPayment(db: Database.Database, actor: Actor, input: CommissionPaymentInput): CommissionLedger {
  if (!actorHas(actor, 'commissions.manage')) {
    throw new CommissionError('You do not have permission to record commission payments')
  }
  const amount = Math.round(input.amount_paisa)
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new CommissionError('Payment amount must be greater than zero')
  }
  const txn = (input.transaction_id ?? '').trim()
  if (txn.length < 3) throw new CommissionError('A payment reference (transaction id) is required')

  const ledgerBefore = getCommissionLedger(db, input.practitioner_id)
  if (amount > ledgerBefore.outstanding_paisa) {
    throw new CommissionError(
      `Payment exceeds the outstanding commission (outstanding PKR ${(ledgerBefore.outstanding_paisa / 100).toFixed(2)})`
    )
  }

  const apply = db.transaction(() => {
    const insert = db.prepare(
      `INSERT INTO practitioner_payments (transaction_id, practitioner_id, amount_paisa, method, reference_number, paid_by, notes)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    )
    try {
      insert.run(
        txn,
        input.practitioner_id,
        amount,
        input.method,
        input.reference_number?.trim() || null,
        actor.id,
        input.notes?.trim() || null
      )
    } catch (err) {
      if (err instanceof Error && /UNIQUE constraint failed/.test(err.message)) {
        throw new CommissionError('Duplicate payment blocked: this transaction id was already recorded')
      }
      throw err
    }
    writeAudit(db, {
      userId: actor.id,
      action: 'COMMISSION_PAYMENT',
      entityType: 'practitioner',
      entityId: input.practitioner_id,
      newValue: { transaction_id: txn, amount_paisa: amount, method: input.method },
      reason: input.notes?.trim() || null
    })
  })
  apply()

  return getCommissionLedger(db, input.practitioner_id)
}

/** Next unused commission-payment transaction id (client may also supply its own). */
export function nextCommissionPaymentCode(db: Database.Database): string {
  return nextCode(db, { table: 'practitioner_payments', column: 'transaction_id', prefix: 'CMP', yearly: true })
}

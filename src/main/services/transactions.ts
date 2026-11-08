import type Database from 'better-sqlite3'

/**
 * Unified transaction history (PRD §Module H). Reads the
 * `v_transaction_history` view — patient payments, commission payments,
 * expenses, refunds and adjustments in one ledger. Read-only: the
 * application exposes no edit or delete for transactions; corrections are
 * recorded as reversals/adjustments (CP4 acceptance).
 */

export const TXN_TYPES = ['PATIENT_PAYMENT', 'COMMISSION_PAYMENT', 'EXPENSE', 'REFUND', 'ADJUSTMENT'] as const
export type TxnType = (typeof TXN_TYPES)[number]

export const TXN_TYPE_LABELS: Record<TxnType, string> = {
  PATIENT_PAYMENT: 'Patient payment',
  COMMISSION_PAYMENT: 'Commission payment',
  EXPENSE: 'Laboratory expense',
  REFUND: 'Refund',
  ADJUSTMENT: 'Adjustment'
}

export interface TransactionRow {
  txn_id: string
  txn_type: TxnType
  txn_type_label: string
  amount_paisa: number
  txn_at: string
  method: string | null
  reference_number: string | null
  related_ref: string | null
  related_name: string | null
  notes: string | null
  created_by_name: string | null
}

export interface TransactionFilters {
  type?: string
  from?: string
  to?: string
  query?: string
  page?: number
  pageSize?: number
}

export interface TransactionListResult {
  rows: TransactionRow[]
  total: number
  page: number
  pageSize: number
  inflow_paisa: number
  outflow_paisa: number
}

const INFLOW_TYPES: TxnType[] = ['PATIENT_PAYMENT']
const OUTFLOW_TYPES: TxnType[] = ['COMMISSION_PAYMENT', 'EXPENSE', 'REFUND']

export function listTransactions(db: Database.Database, filters: TransactionFilters = {}): TransactionListResult {
  const where: string[] = []
  const params: Array<string | number> = []

  const type = (filters.type ?? 'ALL').toUpperCase()
  if (type !== 'ALL' && (TXN_TYPES as readonly string[]).includes(type)) {
    where.push('t.txn_type = ?')
    params.push(type)
  }
  if (filters.from && /^\d{4}-\d{2}-\d{2}$/.test(filters.from)) {
    where.push('date(t.txn_at) >= ?')
    params.push(filters.from)
  }
  if (filters.to && /^\d{4}-\d{2}-\d{2}$/.test(filters.to)) {
    where.push('date(t.txn_at) <= ?')
    params.push(filters.to)
  }
  const q = (filters.query ?? '').trim()
  if (q.length > 0) {
    const like = `%${q.replace(/[%_\\]/g, (c) => `\\${c}`)}%`
    where.push(
      "(t.txn_id LIKE ? ESCAPE '\\' OR t.reference_number LIKE ? ESCAPE '\\' OR t.related_ref LIKE ? ESCAPE '\\' OR t.notes LIKE ? ESCAPE '\\')"
    )
    params.push(like, like, like, like)
  }
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : ''

  const base = `FROM v_transaction_history t
    LEFT JOIN users u ON u.id = t.user_id
    LEFT JOIN bills b ON t.related_ref LIKE 'bill:%' AND CAST(REPLACE(t.related_ref, 'bill:', '') AS INTEGER) = b.id
    LEFT JOIN practitioners pr ON t.related_ref LIKE 'practitioner:%' AND CAST(REPLACE(t.related_ref, 'practitioner:', '') AS INTEGER) = pr.id
    LEFT JOIN expense_categories ec ON t.related_ref LIKE 'expense_category:%' AND CAST(REPLACE(t.related_ref, 'expense_category:', '') AS INTEGER) = ec.id
    ${whereSql}`

  const countRow = db.prepare(`SELECT COUNT(*) AS n FROM v_transaction_history t ${whereSql}`).get(...params) as { n: number }
  const page = Math.max(1, filters.page ?? 1)
  const pageSize = Math.min(200, Math.max(10, filters.pageSize ?? 50))
  const rows = db
    .prepare(
      `SELECT t.txn_id, t.txn_type, t.amount_paisa, t.txn_at, t.method, t.reference_number,
              t.related_ref, t.notes, u.full_name AS created_by_name,
              b.bill_number AS bill_number, pr.name AS practitioner_name, ec.name AS category_name
       ${base}
       ORDER BY t.txn_at DESC
       LIMIT ? OFFSET ?`
    )
    .all(...params, pageSize, (page - 1) * pageSize) as Array<Record<string, unknown>>

  const totals = db
    .prepare(
      `SELECT t.txn_type, COALESCE(SUM(t.amount_paisa), 0) AS total
       ${base} GROUP BY t.txn_type`
    )
    .all(...params) as Array<{ txn_type: TxnType; total: number }>

  let inflow = 0
  let outflow = 0
  for (const t of totals) {
    if (INFLOW_TYPES.includes(t.txn_type)) inflow += Number(t.total)
    else if (OUTFLOW_TYPES.includes(t.txn_type)) outflow += Number(t.total)
  }

  return {
    rows: rows.map((r) => ({
      txn_id: String(r.txn_id),
      txn_type: r.txn_type as TxnType,
      txn_type_label: TXN_TYPE_LABELS[r.txn_type as TxnType] ?? String(r.txn_type),
      amount_paisa: Number(r.amount_paisa),
      txn_at: String(r.txn_at),
      method: (r.method as string | null) ?? null,
      reference_number: (r.reference_number as string | null) ?? null,
      related_ref: (r.related_ref as string | null) ?? null,
      related_name:
        (r.bill_number as string | null) ?? (r.practitioner_name as string | null) ?? (r.category_name as string | null),
      notes: (r.notes as string | null) ?? null,
      created_by_name: (r.created_by_name as string | null) ?? null
    })),
    total: Number(countRow.n),
    page,
    pageSize,
    inflow_paisa: inflow,
    outflow_paisa: outflow
  }
}

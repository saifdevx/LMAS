import type Database from 'better-sqlite3'
import type { DashboardOverview, PeriodSpec } from '../../shared/api-types'
import { estimateNetProfit } from '../../shared/commission'

/**
 * Dashboard aggregation service (PRD §Module A). All figures come from
 * real SQL aggregates over the database — no mock data. Until billing
 * arrives in Checkpoint 2 the financial tables are legitimately empty
 * and these queries correctly return zeros.
 */

function pad(n: number): string {
  return n.toString().padStart(2, '0')
}

export function localDate(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

export function resolveRange(period: PeriodSpec): { from: string; to: string; label: string } {
  const today = new Date()
  const y = today.getFullYear()
  const m = today.getMonth()
  const d = today.getDate()
  switch (period.type) {
    case 'today':
      return { from: localDate(today), to: localDate(today), label: 'Today' }
    case 'yesterday': {
      const yd = new Date(y, m, d - 1)
      return { from: localDate(yd), to: localDate(yd), label: 'Yesterday' }
    }
    case 'last7': {
      const from = new Date(y, m, d - 6)
      return { from: localDate(from), to: localDate(today), label: 'Last 7 days' }
    }
    case 'this_month':
      return { from: localDate(new Date(y, m, 1)), to: localDate(today), label: 'This month' }
    case 'custom': {
      const from = period.from && /^\d{4}-\d{2}-\d{2}$/.test(period.from) ? period.from : localDate(today)
      const to = period.to && /^\d{4}-\d{2}-\d{2}$/.test(period.to) ? period.to : from
      return { from, to, label: from === to ? from : `${from} to ${to}` }
    }
    default:
      return { from: localDate(today), to: localDate(today), label: 'Today' }
  }
}

function scalar(db: Database.Database, sql: string, ...params: (string | number)[]): number {
  const row = db.prepare(sql).get(...params) as { v: number | null } | undefined
  return row?.v ?? 0
}

export function getDashboardOverview(db: Database.Database, period: PeriodSpec): DashboardOverview {
  const { from, to, label } = resolveRange(period)
  const ACTIVE = "status <> 'CANCELLED'"

  // ----- Patients (visits in period) -----
  const totalVisits = scalar(
    db,
    'SELECT COUNT(*) AS v FROM visits WHERE visit_date >= ? AND visit_date <= ?',
    from,
    to
  )
  const distinctPatients = scalar(
    db,
    'SELECT COUNT(DISTINCT patient_id) AS v FROM visits WHERE visit_date >= ? AND visit_date <= ?',
    from,
    to
  )
  const selfVisits = scalar(
    db,
    "SELECT COUNT(*) AS v FROM visits WHERE visit_date >= ? AND visit_date <= ? AND category = 'SELF'",
    from,
    to
  )
  const referredVisits = totalVisits - selfVisits

  // ----- Laboratory tests (bill items in period) -----
  const booked = scalar(
    db,
    `SELECT COUNT(*) AS v FROM bill_items bi JOIN bills b ON b.id = bi.bill_id
     WHERE b.bill_date >= ? AND b.bill_date <= ? AND b.${ACTIVE}`,
    from,
    to
  )
  const statusRow = db
    .prepare(
      `SELECT
         COALESCE(SUM(CASE WHEN tr.status = 'COMPLETED' THEN 1 ELSE 0 END), 0) AS completed,
         COALESCE(SUM(CASE WHEN tr.status = 'IN_PROGRESS' THEN 1 ELSE 0 END), 0) AS in_progress,
         COALESCE(SUM(CASE WHEN tr.status = 'CANCELLED' THEN 1 ELSE 0 END), 0) AS cancelled,
         COALESCE(SUM(CASE WHEN tr.id IS NULL OR tr.status = 'PENDING' THEN 1 ELSE 0 END), 0) AS pending
       FROM bill_items bi
       JOIN bills b ON b.id = bi.bill_id
       LEFT JOIN test_results tr ON tr.bill_item_id = bi.id
       WHERE b.bill_date >= ? AND b.bill_date <= ? AND b.status <> 'CANCELLED'`
    )
    .get(from, to) as { completed: number; in_progress: number; cancelled: number; pending: number }

  // ----- Financials (billed vs collected are distinct figures, PRD §3.3) -----
  const fin = db
    .prepare(
      `SELECT
         COALESCE(SUM(subtotal_paisa), 0) AS gross,
         COALESCE(SUM(discount_paisa), 0) AS discount,
         COALESCE(SUM(net_paisa), 0) AS net,
         COALESCE(SUM(CASE WHEN category = 'SELF' THEN net_paisa ELSE 0 END), 0) AS self_billed,
         COALESCE(SUM(CASE WHEN category = 'REFERRED' THEN net_paisa ELSE 0 END), 0) AS referred_billed
       FROM bills WHERE bill_date >= ? AND bill_date <= ? AND status <> 'CANCELLED'`
    )
    .get(from, to) as { gross: number; discount: number; net: number; self_billed: number; referred_billed: number }

  const collected = scalar(
    db,
    `SELECT COALESCE(SUM(p.amount_paisa), 0) AS v
     FROM payments p JOIN bills b ON b.id = p.bill_id
     WHERE date(p.paid_at) >= ? AND date(p.paid_at) <= ? AND b.status <> 'CANCELLED'`,
    from,
    to
  )
  const expenses = scalar(
    db,
    'SELECT COALESCE(SUM(amount_paisa), 0) AS v FROM expenses WHERE expense_date >= ? AND expense_date <= ?',
    from,
    to
  )
  const commissionAccrued = scalar(
    db,
    'SELECT COALESCE(SUM(commission_paisa), 0) AS v FROM practitioner_commission_entries WHERE date(created_at) >= ? AND date(created_at) <= ?',
    from,
    to
  )
  const directCosts = scalar(
    db,
    `SELECT COALESCE(SUM(COALESCE(bi.direct_cost_paisa, 0)), 0) AS v
     FROM bill_items bi JOIN bills b ON b.id = bi.bill_id
     WHERE b.bill_date >= ? AND b.bill_date <= ? AND b.status <> 'CANCELLED'`,
    from,
    to
  )

  // ----- All-time liabilities / receivables -----
  const commissionAccruedAll = scalar(db, 'SELECT COALESCE(SUM(commission_paisa), 0) AS v FROM practitioner_commission_entries')
  const commissionPaidAll = scalar(db, 'SELECT COALESCE(SUM(amount_paisa), 0) AS v FROM practitioner_payments')
  const netBilledAll = scalar(db, "SELECT COALESCE(SUM(net_paisa), 0) AS v FROM bills WHERE status <> 'CANCELLED'")
  const collectedAll = scalar(
    db,
    "SELECT COALESCE(SUM(p.amount_paisa), 0) AS v FROM payments p JOIN bills b ON b.id = p.bill_id WHERE b.status <> 'CANCELLED'"
  )

  const estimatedProfit = estimateNetProfit({
    netBilledPaisa: fin.net,
    commissionPaisa: commissionAccrued,
    directCostsPaisa: directCosts,
    operatingExpensesPaisa: expenses
  })

  return {
    periodLabel: label,
    from,
    to,
    patients: { totalVisits, distinctPatients, selfVisits, referredVisits },
    tests: {
      booked,
      completed: statusRow.completed,
      pending: statusRow.pending,
      inProgress: statusRow.in_progress,
      cancelled: statusRow.cancelled
    },
    financial: {
      grossPaisa: fin.gross,
      discountPaisa: fin.discount,
      netPaisa: fin.net,
      collectedPaisa: collected,
      selfBilledPaisa: fin.self_billed,
      referredBilledPaisa: fin.referred_billed,
      expensesPaisa: expenses,
      estimatedProfitPaisa: estimatedProfit
    },
    commission: {
      accruedPaisa: commissionAccrued,
      paidPaisa: scalar(
        db,
        'SELECT COALESCE(SUM(amount_paisa), 0) AS v FROM practitioner_payments WHERE date(paid_at) >= ? AND date(paid_at) <= ?',
        from,
        to
      ),
      outstandingPaisa: commissionAccruedAll - commissionPaidAll,
      patientOutstandingPaisa: netBilledAll - collectedAll
    }
  }
}

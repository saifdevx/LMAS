import type Database from 'better-sqlite3'
import { resolveRange } from './dashboard'
import type { PatientCategory } from '../../shared/api-types'
import { formatPKR, formatDisplayDate } from '../../shared/money'

/**
 * Financial reporting service (PRD §Module G + §Module I, CP4 deliverables).
 * One generic table model serves every report, the UI, the PDF layout and
 * the Excel export. All figures come from real SQL aggregates — cancelled
 * bills are excluded everywhere, and "billed" vs "collected" remain
 * distinct figures (PRD §3.3).
 */

export const REPORT_KINDS = [
  'DAILY',
  'WEEKLY',
  'MONTHLY',
  'CUSTOM',
  'SELF',
  'REFERRED',
  'COMMISSIONS',
  'EXPENSES',
  'OUTSTANDING',
  'CASH',
  'PROFITABILITY'
] as const
export type ReportKind = (typeof REPORT_KINDS)[number]

export const REPORT_TITLES: Record<ReportKind, string> = {
  DAILY: 'Daily financial report',
  WEEKLY: 'Weekly financial report',
  MONTHLY: 'Monthly financial report',
  CUSTOM: 'Financial summary report',
  SELF: 'Self-patient financial report',
  REFERRED: 'Referred-patient financial report',
  COMMISSIONS: 'Practitioner commission report',
  EXPENSES: 'Expense report',
  OUTSTANDING: 'Patient outstanding balance report',
  CASH: 'Cash collection report',
  PROFITABILITY: 'Profitability report'
}

export interface ReportColumn {
  key: string
  label: string
  type: 'money' | 'number' | 'text' | 'date'
}

export interface ReportFigure {
  label: string
  paisa?: number
  text?: string
}

export interface ReportResult {
  kind: ReportKind
  title: string
  from: string
  to: string
  generated_at: string
  columns: ReportColumn[]
  rows: Array<Record<string, string | number | null>>
  totals: Record<string, number | null>
  figures: ReportFigure[]
}

export interface ReportSpec {
  kind: ReportKind
  from?: string
  to?: string
  category?: PatientCategory
}

function scalar(db: Database.Database, sql: string, ...params: Array<string | number>): number {
  const row = db.prepare(sql).get(...params) as { v: number | null } | undefined
  return row?.v ?? 0
}

function nowStamp(): string {
  const d = new Date()
  const pad = (n: number) => n.toString().padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

/** Validate the requested range (falls back to today for invalid input). */
export function reportRange(spec: ReportSpec): { from: string; to: string } {
  const valid = (v?: string) => (v && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : undefined)
  if (spec.kind === 'DAILY' || spec.kind === 'SELF' || spec.kind === 'REFERRED' || spec.kind === 'CASH') {
    const day = valid(spec.from) ?? valid(spec.to) ?? todayStr()
    return { from: spec.from && valid(spec.from) ? spec.from : day, to: spec.to && valid(spec.to) ? spec.to : day }
  }
  const from = valid(spec.from) ?? firstOfMonth()
  const to = valid(spec.to) ?? todayStr()
  return { from, to }
}

function todayStr(): string {
  return resolveRange({ type: 'today' }).from
}

function firstOfMonth(): string {
  const d = new Date()
  return `${d.getFullYear()}-${(d.getMonth() + 1).toString().padStart(2, '0')}-01`
}

const MONEY_COLS = { type: 'money' as const }

/** PRD §Module G financial summary for a date range (and optional category). */
export function financialSummary(
  db: Database.Database,
  from: string,
  to: string,
  category?: PatientCategory
): {
  grossPaisa: number
  discountPaisa: number
  netPaisa: number
  collectedPaisa: number
  refundedPaisa: number
  outstandingPaisa: number
  selfRevenuePaisa: number
  referredRevenuePaisa: number
  commissionAccruedPaisa: number
  commissionPaidPaisa: number
  commissionOutstandingPaisa: number
  directCostsPaisa: number
  operatingExpensesPaisa: number
  estimatedNetProfitPaisa: number
  billsCount: number
} {
  const catFilter = category ? ` AND b.category = '${category}'` : ''
  const gross = scalar(
    db,
    `SELECT COALESCE(SUM(subtotal_paisa), 0) AS v FROM bills b WHERE b.bill_date >= ? AND b.bill_date <= ? AND b.status <> 'CANCELLED'${catFilter}`,
    from,
    to
  )
  const discount = scalar(
    db,
    `SELECT COALESCE(SUM(discount_paisa), 0) AS v FROM bills b WHERE b.bill_date >= ? AND b.bill_date <= ? AND b.status <> 'CANCELLED'${catFilter}`,
    from,
    to
  )
  const net = scalar(
    db,
    `SELECT COALESCE(SUM(net_paisa), 0) AS v FROM bills b WHERE b.bill_date >= ? AND b.bill_date <= ? AND b.status <> 'CANCELLED'${catFilter}`,
    from,
    to
  )
  const collected = scalar(
    db,
    `SELECT COALESCE(SUM(p.amount_paisa), 0) AS v
     FROM payments p JOIN bills b ON b.id = p.bill_id
     WHERE date(p.paid_at) >= ? AND date(p.paid_at) <= ? AND b.status <> 'CANCELLED'${catFilter}`,
    from,
    to
  )
  const refunded = scalar(
    db,
    `SELECT COALESCE(SUM(r.amount_paisa), 0) AS v
     FROM refunds r JOIN bills b ON b.id = r.bill_id
     WHERE date(r.created_at) >= ? AND date(r.created_at) <= ? AND b.status <> 'CANCELLED'${catFilter}`,
    from,
    to
  )
  const commissionAccrued = scalar(
    db,
    `SELECT COALESCE(SUM(e.commission_paisa), 0) AS v
     FROM practitioner_commission_entries e JOIN bills b ON b.id = e.bill_id
     WHERE date(e.created_at) >= ? AND date(e.created_at) <= ? AND b.status <> 'CANCELLED'${catFilter}`,
    from,
    to
  )
  const commissionPaid = scalar(
    db,
    `SELECT COALESCE(SUM(pp.amount_paisa), 0) AS v
     FROM practitioner_payments pp JOIN practitioners pr ON pr.id = pp.practitioner_id
     WHERE date(pp.paid_at) >= ? AND date(pp.paid_at) <= ?`,
    from,
    to
  )
  const commissionAccruedAll = scalar(db, 'SELECT COALESCE(SUM(commission_paisa), 0) AS v FROM practitioner_commission_entries')
  const commissionPaidAll = scalar(db, 'SELECT COALESCE(SUM(amount_paisa), 0) AS v FROM practitioner_payments')
  const directCosts = scalar(
    db,
    `SELECT COALESCE(SUM(COALESCE(bi.direct_cost_paisa, 0)), 0) AS v
     FROM bill_items bi JOIN bills b ON b.id = bi.bill_id
     WHERE b.bill_date >= ? AND b.bill_date <= ? AND b.status <> 'CANCELLED'${catFilter}`,
    from,
    to
  )
  const expenses = scalar(
    db,
    'SELECT COALESCE(SUM(amount_paisa), 0) AS v FROM expenses WHERE expense_date >= ? AND expense_date <= ?',
    from,
    to
  )
  const billsCount = scalar(
    db,
    `SELECT COUNT(*) AS v FROM bills b WHERE b.bill_date >= ? AND b.bill_date <= ? AND b.status <> 'CANCELLED'${catFilter}`,
    from,
    to
  )
  // Patient outstanding is an all-time receivable position (PRD Module G).
  const netBilledAll = scalar(db, "SELECT COALESCE(SUM(net_paisa), 0) AS v FROM bills WHERE status <> 'CANCELLED'")
  const collectedAll = scalar(
    db,
    "SELECT COALESCE(SUM(p.amount_paisa), 0) AS v FROM payments p JOIN bills b ON b.id = p.bill_id WHERE b.status <> 'CANCELLED'"
  )
  const refundedAll = scalar(
    db,
    "SELECT COALESCE(SUM(r.amount_paisa), 0) AS v FROM refunds r JOIN bills b ON b.id = r.bill_id WHERE b.status <> 'CANCELLED'"
  )

  return {
    grossPaisa: gross,
    discountPaisa: discount,
    netPaisa: net,
    collectedPaisa: collected,
    refundedPaisa: refunded,
    outstandingPaisa: netBilledAll - collectedAll + refundedAll,
    selfRevenuePaisa: scalar(
      db,
      `SELECT COALESCE(SUM(net_paisa), 0) AS v FROM bills b WHERE b.bill_date >= ? AND b.bill_date <= ? AND b.status <> 'CANCELLED' AND b.category = 'SELF'`,
      from,
      to
    ),
    referredRevenuePaisa: scalar(
      db,
      `SELECT COALESCE(SUM(net_paisa), 0) AS v FROM bills b WHERE b.bill_date >= ? AND b.bill_date <= ? AND b.status <> 'CANCELLED' AND b.category = 'REFERRED'`,
      from,
      to
    ),
    commissionAccruedPaisa: commissionAccrued,
    commissionPaidPaisa: commissionPaid,
    commissionOutstandingPaisa: commissionAccruedAll - commissionPaidAll,
    directCostsPaisa: directCosts,
    operatingExpensesPaisa: expenses,
    estimatedNetProfitPaisa: net - commissionAccrued - directCosts - expenses,
    billsCount
  }
}

function summaryColumns(): ReportColumn[] {
  return [
    { key: 'billed', label: 'Billed (net)', type: 'money' },
    { key: 'collected', label: 'Collected', type: 'money' },
    { key: 'commission', label: 'Commission accrued', type: 'money' },
    { key: 'costs', label: 'Direct costs', type: 'money' },
    { key: 'expenses', label: 'Operating expenses', type: 'money' },
    { key: 'profit', label: 'Estimated net profit', type: 'money' }
  ]
}

interface DailyAgg {
  day: string
  billed: number
  collected: number
  commission: number
  costs: number
  expenses: number
}

/** One pass over the calendar range: per-day billed / collected / commission / costs / expenses. */
function dailyAggregates(db: Database.Database, from: string, to: string): DailyAgg[] {
  const billed = db
    .prepare(
      `SELECT b.bill_date AS day, SUM(b.net_paisa) AS v
       FROM bills b WHERE b.bill_date >= ? AND b.bill_date <= ? AND b.status <> 'CANCELLED'
       GROUP BY b.bill_date`
    )
    .all(from, to) as Array<{ day: string; v: number }>
  const collected = db
    .prepare(
      `SELECT date(p.paid_at) AS day, COALESCE(SUM(p.amount_paisa), 0) AS v
       FROM payments p JOIN bills b ON b.id = p.bill_id
       WHERE date(p.paid_at) >= ? AND date(p.paid_at) <= ? AND b.status <> 'CANCELLED'
       GROUP BY date(p.paid_at)`
    )
    .all(from, to) as Array<{ day: string; v: number }>
  const commission = db
    .prepare(
      `SELECT date(e.created_at) AS day, COALESCE(SUM(e.commission_paisa), 0) AS v
       FROM practitioner_commission_entries e JOIN bills b ON b.id = e.bill_id
       WHERE date(e.created_at) >= ? AND date(e.created_at) <= ? AND b.status <> 'CANCELLED'
       GROUP BY date(e.created_at)`
    )
    .all(from, to) as Array<{ day: string; v: number }>
  const costs = db
    .prepare(
      `SELECT b.bill_date AS day, COALESCE(SUM(COALESCE(bi.direct_cost_paisa, 0)), 0) AS v
       FROM bill_items bi JOIN bills b ON b.id = bi.bill_id
       WHERE b.bill_date >= ? AND b.bill_date <= ? AND b.status <> 'CANCELLED'
       GROUP BY b.bill_date`
    )
    .all(from, to) as Array<{ day: string; v: number }>
  const expenses = db
    .prepare(
      `SELECT expense_date AS day, COALESCE(SUM(amount_paisa), 0) AS v
       FROM expenses WHERE expense_date >= ? AND expense_date <= ?
       GROUP BY expense_date`
    )
    .all(from, to) as Array<{ day: string; v: number }>

  const byDay = new Map<string, DailyAgg>()
  const ensure = (day: string): DailyAgg => {
    let row = byDay.get(day)
    if (!row) {
      row = { day, billed: 0, collected: 0, commission: 0, costs: 0, expenses: 0 }
      byDay.set(day, row)
    }
    return row
  }
  for (const r of billed) ensure(r.day).billed += Number(r.v)
  for (const r of collected) ensure(r.day).collected += Number(r.v)
  for (const r of commission) ensure(r.day).commission += Number(r.v)
  for (const r of costs) ensure(r.day).costs += Number(r.v)
  for (const r of expenses) ensure(r.day).expenses += Number(r.v)
  return [...byDay.values()].sort((a, b) => a.day.localeCompare(b.day))
}

function bucketKey(day: string, kind: 'DAILY' | 'WEEKLY' | 'MONTHLY'): string {
  if (kind === 'DAILY') return day
  if (kind === 'MONTHLY') return day.slice(0, 7)
  // SQLite %W: week 00-53, Monday-based weeks; keep it stable and simple.
  const [y, m, d] = day.split('-').map((n) => parseInt(n, 10))
  const dt = new Date(Date.UTC(y, m - 1, d))
  const dayNum = (dt.getUTCDay() + 6) % 7 // Mon=0
  dt.setUTCDate(dt.getUTCDate() - dayNum) // Monday of this week
  const monday = dt.toISOString().slice(0, 10)
  return `week of ${monday}`
}

function groupedPeriodRows(
  db: Database.Database,
  from: string,
  to: string,
  kind: 'DAILY' | 'WEEKLY' | 'MONTHLY',
  keyLabel: string
): { columns: ReportColumn[]; rows: Array<Record<string, string | number | null>>; totals: Record<string, number | null> } {
  const days = dailyAggregates(db, from, to)
  const buckets = new Map<string, { billed: number; collected: number; commission: number; costs: number; expenses: number }>()
  for (const d of days) {
    const key = bucketKey(d.day, kind)
    const b = buckets.get(key) ?? { billed: 0, collected: 0, commission: 0, costs: 0, expenses: 0 }
    b.billed += d.billed
    b.collected += d.collected
    b.commission += d.commission
    b.costs += d.costs
    b.expenses += d.expenses
    buckets.set(key, b)
  }

  const columns: ReportColumn[] = [{ key: 'grp', label: keyLabel, type: 'text' }, ...summaryColumns()]
  const mapped = [...buckets.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([grp, b]) => ({
      grp,
      billed: b.billed,
      collected: b.collected,
      commission: b.commission,
      costs: b.costs,
      expenses: b.expenses,
      profit: b.billed - b.commission - b.costs - b.expenses
    }))
  const totals = mapped.reduce(
    (acc, r) => {
      acc.billed = (acc.billed ?? 0) + r.billed
      acc.collected = (acc.collected ?? 0) + r.collected
      acc.commission = (acc.commission ?? 0) + r.commission
      acc.costs = (acc.costs ?? 0) + r.costs
      acc.expenses = (acc.expenses ?? 0) + r.expenses
      acc.profit = (acc.profit ?? 0) + r.profit
      return acc
    },
    {} as Record<string, number | null>
  )
  return { columns, rows: mapped, totals }
}

function billDetailRows(db: Database.Database, from: string, to: string, category: PatientCategory) {
  return db
    .prepare(
      `SELECT b.bill_number, b.bill_date, p.full_name AS patient, p.full_name_urdu AS patient_urdu,
              pr.name AS practitioner, b.subtotal_paisa, b.discount_paisa, b.net_paisa,
              COALESCE((SELECT SUM(amount_paisa) FROM payments pp WHERE pp.bill_id = b.id), 0) AS paid,
              COALESCE((SELECT SUM(amount_paisa) FROM refunds r WHERE r.bill_id = b.id), 0) AS refunded,
              b.status
       FROM bills b
       JOIN patients p ON p.id = b.patient_id
       LEFT JOIN practitioners pr ON pr.id = b.practitioner_id
       WHERE b.bill_date >= ? AND b.bill_date <= ? AND b.status <> 'CANCELLED' AND b.category = ?
       ORDER BY b.bill_date, b.id`
    )
    .all(from, to, category) as Array<Record<string, unknown>>
}

export function runReport(db: Database.Database, spec: ReportSpec): ReportResult {
  const { kind } = spec
  const { from, to } = reportRange(spec)
  const base: Omit<ReportResult, 'columns' | 'rows' | 'totals' | 'figures'> = {
    kind,
    title: REPORT_TITLES[kind],
    from,
    to,
    generated_at: nowStamp()
  }

  // ---- Daily / Weekly / Monthly: grouped aggregates per period ----
  if (kind === 'DAILY') {
    const g = groupedPeriodRows(db, from, to, 'DAILY', 'Date')
    return { ...base, ...g, figures: periodFigures(db, from, to) }
  }
  if (kind === 'WEEKLY') {
    const g = groupedPeriodRows(db, from, to, 'WEEKLY', 'Week')
    return { ...base, ...g, figures: periodFigures(db, from, to) }
  }
  if (kind === 'MONTHLY') {
    const g = groupedPeriodRows(db, from, to, 'MONTHLY', 'Month')
    return { ...base, ...g, figures: periodFigures(db, from, to) }
  }

  // ---- CUSTOM: the Module G financial summary itself ----
  if (kind === 'CUSTOM') {
    const s = financialSummary(db, from, to)
    return {
      ...base,
      columns: summaryColumns(),
      rows: [
        {
          billed: s.netPaisa,
          collected: s.collectedPaisa,
          commission: s.commissionAccruedPaisa,
          costs: s.directCostsPaisa,
          expenses: s.operatingExpensesPaisa,
          profit: s.estimatedNetProfitPaisa
        }
      ],
      totals: {
        billed: s.netPaisa,
        collected: s.collectedPaisa,
        commission: s.commissionAccruedPaisa,
        costs: s.directCostsPaisa,
        expenses: s.operatingExpensesPaisa,
        profit: s.estimatedNetProfitPaisa
      },
      figures: [
        { label: 'Gross billed', paisa: s.grossPaisa },
        { label: 'Total discounts', paisa: s.discountPaisa },
        { label: 'Net billed', paisa: s.netPaisa },
        { label: 'Collected payments', paisa: s.collectedPaisa },
        { label: 'Refunds issued', paisa: s.refundedPaisa },
        { label: 'Outstanding patient balances', paisa: s.outstandingPaisa },
        { label: 'Self-patient revenue', paisa: s.selfRevenuePaisa },
        { label: 'Referred-patient revenue', paisa: s.referredRevenuePaisa },
        { label: 'Commission accrued', paisa: s.commissionAccruedPaisa },
        { label: 'Commission paid', paisa: s.commissionPaidPaisa },
        { label: 'Outstanding commission', paisa: s.commissionOutstandingPaisa },
        { label: 'Direct laboratory costs', paisa: s.directCostsPaisa },
        { label: 'Operating expenses', paisa: s.operatingExpensesPaisa },
        { label: 'Estimated net profit', paisa: s.estimatedNetProfitPaisa }
      ]
    }
  }

  // ---- SELF / REFERRED: per-bill rows for the category ----
  if (kind === 'SELF' || kind === 'REFERRED') {
    const category: PatientCategory = kind === 'SELF' ? 'SELF' : 'REFERRED'
    const raw = billDetailRows(db, from, to, category)
    const rows = raw.map((r) => ({
      bill_number: String(r.bill_number),
      bill_date: formatDisplayDate(String(r.bill_date)),
      patient: r.patient_urdu ? `${String(r.patient)} — ${String(r.patient_urdu)}` : String(r.patient),
      practitioner: (r.practitioner as string | null) ?? '—',
      subtotal: Number(r.subtotal_paisa),
      discount: Number(r.discount_paisa),
      net: Number(r.net_paisa),
      paid: Number(r.paid),
      refunded: Number(r.refunded),
      outstanding: Number(r.net_paisa) - Number(r.paid) + Number(r.refunded),
      status: String(r.status)
    }))
    const totals = rows.reduce(
      (acc, r) => {
        acc.subtotal = (acc.subtotal ?? 0) + r.subtotal
        acc.discount = (acc.discount ?? 0) + r.discount
        acc.net = (acc.net ?? 0) + r.net
        acc.paid = (acc.paid ?? 0) + r.paid
        acc.refunded = (acc.refunded ?? 0) + r.refunded
        acc.outstanding = (acc.outstanding ?? 0) + r.outstanding
        return acc
      },
      {} as Record<string, number | null>
    )
    return {
      ...base,
      columns: [
        { key: 'bill_number', label: 'Bill #', type: 'text' },
        { key: 'bill_date', label: 'Date', type: 'text' },
        { key: 'patient', label: 'Patient', type: 'text' },
        { key: 'practitioner', label: 'Practitioner', type: 'text' },
        { key: 'subtotal', label: 'Gross', ...MONEY_COLS },
        { key: 'discount', label: 'Discount', ...MONEY_COLS },
        { key: 'net', label: 'Net billed', ...MONEY_COLS },
        { key: 'paid', label: 'Received', ...MONEY_COLS },
        { key: 'refunded', label: 'Refunded', ...MONEY_COLS },
        { key: 'outstanding', label: 'Outstanding', ...MONEY_COLS },
        { key: 'status', label: 'Status', type: 'text' }
      ],
      rows,
      totals,
      figures: [
        { label: 'Bills', text: String(rows.length) },
        { label: 'Net billed', paisa: totals.net ?? 0 },
        { label: 'Received', paisa: totals.paid ?? 0 },
        { label: 'Outstanding', paisa: totals.outstanding ?? 0 }
      ]
    }
  }

  // ---- COMMISSIONS: per-practitioner ledger summary in range ----
  if (kind === 'COMMISSIONS') {
    const raw = db
      .prepare(
        `SELECT pr.practitioner_code, pr.name,
                COALESCE((SELECT SUM(e.commission_paisa) FROM practitioner_commission_entries e
                  JOIN bills b ON b.id = e.bill_id
                  WHERE e.practitioner_id = pr.id AND date(e.created_at) >= ? AND date(e.created_at) <= ? AND b.status <> 'CANCELLED'), 0) AS accrued,
                COALESCE((SELECT SUM(pp.amount_paisa) FROM practitioner_payments pp
                  WHERE pp.practitioner_id = pr.id AND date(pp.paid_at) >= ? AND date(pp.paid_at) <= ?), 0) AS paid
         FROM practitioners pr
         ORDER BY pr.name`
      )
      .all(from, to, from, to) as Array<Record<string, unknown>>
    const rows = raw
      .map((r) => ({
        code: String(r.practitioner_code),
        practitioner: String(r.name),
        accrued: Number(r.accrued),
        paid: Number(r.paid),
        outstanding: Number(r.accrued) - Number(r.paid)
      }))
      .filter((r) => r.accrued !== 0 || r.paid !== 0)
    const totals = rows.reduce(
      (acc, r) => {
        acc.accrued = (acc.accrued ?? 0) + r.accrued
        acc.paid = (acc.paid ?? 0) + r.paid
        acc.outstanding = (acc.outstanding ?? 0) + r.outstanding
        return acc
      },
      {} as Record<string, number | null>
    )
    return {
      ...base,
      columns: [
        { key: 'code', label: 'Code', type: 'text' },
        { key: 'practitioner', label: 'Practitioner', type: 'text' },
        { key: 'accrued', label: 'Accrued', ...MONEY_COLS },
        { key: 'paid', label: 'Paid', ...MONEY_COLS },
        { key: 'outstanding', label: 'Outstanding', ...MONEY_COLS }
      ],
      rows,
      totals,
      figures: [
        { label: 'Accrued (period)', paisa: totals.accrued ?? 0 },
        { label: 'Paid (period)', paisa: totals.paid ?? 0 },
        { label: 'Outstanding (period)', paisa: totals.outstanding ?? 0 }
      ]
    }
  }

  // ---- EXPENSES: per-category summary + totals ----
  if (kind === 'EXPENSES') {
    const raw = db
      .prepare(
        `SELECT c.name AS category, COUNT(*) AS items, COALESCE(SUM(e.amount_paisa), 0) AS total
         FROM expenses e JOIN expense_categories c ON c.id = e.category_id
         WHERE e.expense_date >= ? AND e.expense_date <= ?
         GROUP BY c.id ORDER BY total DESC`
      )
      .all(from, to) as Array<Record<string, unknown>>
    const rows = raw.map((r) => ({
      category: String(r.category),
      items: Number(r.items),
      total: Number(r.total)
    }))
    const total = rows.reduce((s, r) => s + r.total, 0)
    return {
      ...base,
      columns: [
        { key: 'category', label: 'Category', type: 'text' },
        { key: 'items', label: 'Entries', type: 'number' },
        { key: 'total', label: 'Total', ...MONEY_COLS }
      ],
      rows,
      totals: { items: rows.reduce((s, r) => s + r.items, 0), total },
      figures: [
        { label: 'Entries', text: String(rows.reduce((s, r) => s + r.items, 0)) },
        { label: 'Total expenses', paisa: total }
      ]
    }
  }

  // ---- OUTSTANDING: bills with an open balance ----
  if (kind === 'OUTSTANDING') {
    const raw = db
      .prepare(
        `SELECT b.bill_number, b.bill_date, p.full_name AS patient, p.full_name_urdu AS patient_urdu,
                p.phone, b.net_paisa, b.status,
                COALESCE((SELECT SUM(amount_paisa) FROM payments pp WHERE pp.bill_id = b.id), 0) AS paid,
                COALESCE((SELECT SUM(amount_paisa) FROM refunds r WHERE r.bill_id = b.id), 0) AS refunded
         FROM bills b
         JOIN patients p ON p.id = b.patient_id
         WHERE b.status NOT IN ('CANCELLED', 'PAID', 'DRAFT')
         ORDER BY b.bill_date, b.id`
      )
      .all() as Array<Record<string, unknown>>
    const rows = raw
      .map((r) => ({
        bill_number: String(r.bill_number),
        bill_date: formatDisplayDate(String(r.bill_date)),
        patient: r.patient_urdu ? `${String(r.patient)} — ${String(r.patient_urdu)}` : String(r.patient),
        phone: (r.phone as string | null) ?? '—',
        net: Number(r.net_paisa),
        paid: Number(r.paid),
        refunded: Number(r.refunded),
        outstanding: Number(r.net_paisa) - Number(r.paid) + Number(r.refunded),
        status: String(r.status)
      }))
      .filter((r) => r.outstanding > 0)
    const totals = rows.reduce(
      (acc, r) => {
        acc.net = (acc.net ?? 0) + r.net
        acc.paid = (acc.paid ?? 0) + r.paid
        acc.refunded = (acc.refunded ?? 0) + r.refunded
        acc.outstanding = (acc.outstanding ?? 0) + r.outstanding
        return acc
      },
      {} as Record<string, number | null>
    )
    return {
      ...base,
      columns: [
        { key: 'bill_number', label: 'Bill #', type: 'text' },
        { key: 'bill_date', label: 'Date', type: 'text' },
        { key: 'patient', label: 'Patient', type: 'text' },
        { key: 'phone', label: 'Phone', type: 'text' },
        { key: 'net', label: 'Net billed', ...MONEY_COLS },
        { key: 'paid', label: 'Received', ...MONEY_COLS },
        { key: 'refunded', label: 'Refunded', ...MONEY_COLS },
        { key: 'outstanding', label: 'Outstanding', ...MONEY_COLS },
        { key: 'status', label: 'Status', type: 'text' }
      ],
      rows,
      totals,
      figures: [
        { label: 'Open bills', text: String(rows.length) },
        { label: 'Total outstanding', paisa: totals.outstanding ?? 0 }
      ]
    }
  }

  // ---- CASH: collections received in range, per payment ----
  if (kind === 'CASH') {
    const raw = db
      .prepare(
        `SELECT p.transaction_id, p.paid_at, p.amount_paisa, p.method, p.reference_number,
                b.bill_number, pt.full_name AS patient, u.full_name AS received_by
         FROM payments p
         JOIN bills b ON b.id = p.bill_id
         JOIN patients pt ON pt.id = b.patient_id
         LEFT JOIN users u ON u.id = p.received_by
         WHERE date(p.paid_at) >= ? AND date(p.paid_at) <= ? AND b.status <> 'CANCELLED'
         ORDER BY p.paid_at, p.id`
      )
      .all(from, to) as Array<Record<string, unknown>>
    const rows = raw.map((r) => ({
      txn: String(r.transaction_id),
      paid_at: String(r.paid_at),
      bill_number: String(r.bill_number),
      patient: String(r.patient),
      method: String(r.method),
      reference: (r.reference_number as string | null) ?? '—',
      amount: Number(r.amount_paisa),
      received_by: (r.received_by as string | null) ?? '—'
    }))
    const byMethod: Record<string, number> = {}
    let total = 0
    for (const r of rows) {
      byMethod[r.method] = (byMethod[r.method] ?? 0) + r.amount
      total += r.amount
    }
    return {
      ...base,
      columns: [
        { key: 'txn', label: 'Transaction', type: 'text' },
        { key: 'paid_at', label: 'Date & time', type: 'text' },
        { key: 'bill_number', label: 'Bill #', type: 'text' },
        { key: 'patient', label: 'Patient', type: 'text' },
        { key: 'method', label: 'Method', type: 'text' },
        { key: 'reference', label: 'Reference', type: 'text' },
        { key: 'amount', label: 'Amount', ...MONEY_COLS },
        { key: 'received_by', label: 'Received by', type: 'text' }
      ],
      rows,
      totals: { amount: total },
      figures: [
        { label: 'Payments', text: String(rows.length) },
        { label: 'Total collected', paisa: total },
        ...Object.entries(byMethod).map(([m, v]) => ({ label: `By ${m.toLowerCase().replace('_', ' ')}`, paisa: v }))
      ]
    }
  }

  // ---- PROFITABILITY: per-month profit breakdown in range ----
  const g = groupedPeriodRows(db, from, to, 'MONTHLY', 'Month')
  return {
    ...base,
    ...g,
    figures: [
      { label: 'Net billed', paisa: Number(g.totals.billed ?? 0) },
      { label: 'Commission accrued', paisa: Number(g.totals.commission ?? 0) },
      { label: 'Direct costs', paisa: Number(g.totals.costs ?? 0) },
      { label: 'Operating expenses', paisa: Number(g.totals.expenses ?? 0) },
      { label: 'Estimated net profit', paisa: Number(g.totals.profit ?? 0) }
    ]
  }
}

function periodFigures(db: Database.Database, from: string, to: string): ReportFigure[] {
  const s = financialSummary(db, from, to)
  return [
    { label: 'Gross billed', paisa: s.grossPaisa },
    { label: 'Net billed', paisa: s.netPaisa },
    { label: 'Collected payments', paisa: s.collectedPaisa },
    { label: 'Refunds issued', paisa: s.refundedPaisa },
    { label: 'Commission accrued', paisa: s.commissionAccruedPaisa },
    { label: 'Commission paid', paisa: s.commissionPaidPaisa },
    { label: 'Operating expenses', paisa: s.operatingExpensesPaisa },
    { label: 'Estimated net profit', paisa: s.estimatedNetProfitPaisa }
  ]
}

/** Human-readable money formatting helper reused by exports. */
export function moneyOrText(col: ReportColumn, value: string | number | null): string | number {
  if (value === null || value === undefined) return ''
  if (col.type === 'money' && typeof value === 'number') return formatPKR(value)
  return value
}

export function reportFigureText(f: ReportFigure): string {
  if (f.text !== undefined) return f.text
  return f.paisa !== undefined ? formatPKR(f.paisa) : ''
}

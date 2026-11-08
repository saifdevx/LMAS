import { useEffect, useState } from 'react'
import { AlertTriangle, FlaskConical, Loader2, RefreshCw, Users } from 'lucide-react'
import type { DashboardOverview, PeriodSpec, SessionInfo } from '../../../shared/api-types'
import { api } from '../api'
import { formatPKR } from '../../../shared/money'
import { PeriodFilter } from '../components/PeriodFilter'
import { StatCard } from '../components/StatCard'
import { Button } from '../components/ui/button'
import { Badge } from '../components/ui/badge'

interface DashboardProps {
  session: SessionInfo
}

export function DashboardPage({ session }: DashboardProps) {
  const [period, setPeriod] = useState<PeriodSpec>({ type: 'today' })
  const [data, setData] = useState<DashboardOverview | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let alive = true
    setLoading(true)
    api
      .getDashboardOverview(session.token, period)
      .then((overview) => {
        if (alive) {
          setData(overview)
          setError('')
        }
      })
      .catch((err) => {
        if (alive) setError(err instanceof Error ? err.message : 'Failed to load dashboard')
      })
      .finally(() => {
        if (alive) setLoading(false)
      })
    return () => {
      alive = false
    }
  }, [session.token, period])

  const f = data?.financial
  const c = data?.commission

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-bold text-slate-900">Dashboard</h1>
          <p className="text-xs text-slate-500">
            {data ? `${data.periodLabel} (${data.from} to ${data.to})` : 'Loading…'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <PeriodFilter value={period} onChange={setPeriod} />
          <Button variant="outline" size="sm" onClick={() => setPeriod({ ...period })} title="Refresh">
            <RefreshCw className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-2 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 ring-1 ring-inset ring-red-200">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          {error}
        </div>
      )}

      {loading && !data && (
        <div className="flex items-center justify-center py-20 text-slate-400">
          <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Loading dashboard…
        </div>
      )}

      {data && (
        <>
          <section>
            <h2 className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-500">Today's overview</h2>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              <StatCard
                label="Patients (distinct)"
                value={data.patients.distinctPatients}
                sub={`${data.patients.totalVisits} visits`}
                icon={<Users className="h-4 w-4" />}
              />
              <StatCard label="Self visits" value={data.patients.selfVisits} sub="Direct walk-in" tone="info" />
              <StatCard label="Referred visits" value={data.patients.referredVisits} sub="Via practitioners" tone="info" />
              <StatCard label="Tests booked" value={data.tests.booked} sub="Bill items in period" icon={<FlaskConical className="h-4 w-4" />} />
            </div>
            <div className="mt-3 grid grid-cols-2 gap-3 md:grid-cols-4">
              <StatCard label="Completed tests" value={data.tests.completed} tone="success" />
              <StatCard label="Pending tests" value={data.tests.pending} tone="warning" />
              <StatCard label="In progress" value={data.tests.inProgress} tone="info" />
              <StatCard label="Cancelled" value={data.tests.cancelled} tone="danger" />
            </div>
          </section>

          <section>
            <h2 className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-500">Financial overview</h2>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              <StatCard label="Gross billed" value={formatPKR(f?.grossPaisa ?? 0)} />
              <StatCard label="Discounts" value={formatPKR(f?.discountPaisa ?? 0)} tone="warning" />
              <StatCard label="Net billed" value={formatPKR(f?.netPaisa ?? 0)} tone="info" />
              <StatCard label="Collections received" value={formatPKR(f?.collectedPaisa ?? 0)} tone="success" />
            </div>
            <div className="mt-3 grid grid-cols-2 gap-3 md:grid-cols-4">
              <StatCard label="Self-patient billed" value={formatPKR(f?.selfBilledPaisa ?? 0)} sub="Category A" />
              <StatCard label="Referred-patient billed" value={formatPKR(f?.referredBilledPaisa ?? 0)} sub="Category B" />
              <StatCard label="Expenses" value={formatPKR(f?.expensesPaisa ?? 0)} tone="danger" />
              <StatCard
                label="Estimated net profit"
                value={formatPKR(f?.estimatedProfitPaisa ?? 0)}
                tone={(f?.estimatedProfitPaisa ?? 0) >= 0 ? 'success' : 'danger'}
                sub="Management figure — see ACCOUNTING_RULES"
              />
            </div>
          </section>

          <section>
            <h2 className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-500">Commissions & balances</h2>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              <StatCard label="Commission accrued" value={formatPKR(c?.accruedPaisa ?? 0)} />
              <StatCard label="Commission paid" value={formatPKR(c?.paidPaisa ?? 0)} tone="success" />
              <StatCard
                label="Commission outstanding"
                value={formatPKR(c?.outstandingPaisa ?? 0)}
                tone={(c?.outstandingPaisa ?? 0) > 0 ? 'warning' : 'neutral'}
                sub="All-time liability"
              />
              <StatCard
                label="Patient balances outstanding"
                value={formatPKR(c?.patientOutstandingPaisa ?? 0)}
                tone={(c?.patientOutstandingPaisa ?? 0) > 0 ? 'danger' : 'neutral'}
                sub="All-time receivable"
              />
            </div>
          </section>

          <div className="flex items-center gap-2 rounded-md bg-sky-50 px-3 py-2 text-xs text-sky-800 ring-1 ring-inset ring-sky-200">
            <Badge tone="info">Checkpoint 1</Badge>
            Patient, billing, laboratory and expense modules arrive in Checkpoints 2–4; the figures above are
            computed live from the database and will populate automatically as those modules come online.
          </div>
        </>
      )}
    </div>
  )
}

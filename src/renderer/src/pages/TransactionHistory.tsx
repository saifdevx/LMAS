import { useCallback, useEffect, useState } from 'react'
import { ChevronLeft, ChevronRight, Loader2 } from 'lucide-react'
import type { SessionInfo, TransactionListResult } from '../../../shared/api-types'
import { api } from '../api'
import { formatPKR } from '../../../shared/money'
import { Badge, type BadgeTone } from '../components/ui/badge'
import { Button } from '../components/ui/button'
import { Input } from '../components/ui/input'
import { Label } from '../components/ui/label'
import { Select } from '../components/ui/select'
import { Table, THead, TH, TD, TR, EmptyRow } from '../components/ui/table'
import { addDaysStr, methodLabel, todayStr } from '../lib/format'
import { useDebounced } from '../lib/useDebounced'

interface TxPageProps {
  session: SessionInfo
}

function typeTone(t: string): BadgeTone {
  switch (t) {
    case 'PATIENT_PAYMENT':
    case 'PATIENT_ADVANCE':
      return 'success'
    case 'COMMISSION_PAYMENT':
    case 'EXPENSE':
    case 'REFUND':
      return 'warning'
    case 'ADJUSTMENT':
      return 'info'
    default:
      return 'neutral'
  }
}

/** Unified transaction history (PRD §Module H, CP4) — read-only ledger. */
export function TransactionHistoryPage({ session }: TxPageProps) {
  const [type, setType] = useState('ALL')
  const [from, setFrom] = useState(addDaysStr(-29))
  const [to, setTo] = useState(todayStr())
  const [query, setQuery] = useState('')
  const [page, setPage] = useState(1)
  const [result, setResult] = useState<TransactionListResult | null>(null)
  const [error, setError] = useState('')
  const debounced = useDebounced(query)

  const load = useCallback(() => {
    api
      .transactionsList(session.token, {
        type,
        from: from || undefined,
        to: to || undefined,
        query: debounced,
        page,
        pageSize: 50
      })
      .then((r) => (setResult(r), setError('')))
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed to load transactions'))
  }, [session.token, type, from, to, debounced, page])

  useEffect(load, [load])

  const pages = result ? Math.max(1, Math.ceil(result.total / result.pageSize)) : 1

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-lg font-bold text-slate-900">Transaction history</h1>
        <p className="text-xs text-slate-500">
          Every patient payment, commission payment, expense, refund and adjustment. Entries are never edited or deleted —
          corrections are recorded as separate reversals.
        </p>
      </div>

      <div className="grid grid-cols-2 items-end gap-3 rounded-lg border border-slate-200 bg-white p-3 shadow-sm sm:grid-cols-4">
        <div>
          <Label>Type</Label>
          <Select value={type} onChange={(e) => { setType(e.target.value); setPage(1) }}>
            <option value="ALL">All types</option>
            <option value="PATIENT_PAYMENT">Patient bill payments</option>
            <option value="PATIENT_ADVANCE">Patient advances</option>
            <option value="COMMISSION_PAYMENT">Commission payments</option>
            <option value="EXPENSE">Expenses</option>
            <option value="REFUND">Refunds</option>
            <option value="ADJUSTMENT">Adjustments</option>
          </Select>
        </div>
        <div>
          <Label>From</Label>
          <Input type="date" value={from} onChange={(e) => { setFrom(e.target.value); setPage(1) }} />
        </div>
        <div>
          <Label>To</Label>
          <Input type="date" value={to} onChange={(e) => { setTo(e.target.value); setPage(1) }} />
        </div>
        <div>
          <Label>Search</Label>
          <Input placeholder="Transaction id, reference, notes…" value={query} onChange={(e) => { setQuery(e.target.value); setPage(1) }} />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="rounded-lg border border-slate-200 bg-white px-4 py-3 shadow-sm">
          <span className="text-xs uppercase tracking-wide text-slate-500">Money in (filtered)</span>
          <span className="ml-3 text-base font-bold tabular-nums text-emerald-700">{result ? formatPKR(result.inflow_paisa) : '—'}</span>
        </div>
        <div className="rounded-lg border border-slate-200 bg-white px-4 py-3 shadow-sm">
          <span className="text-xs uppercase tracking-wide text-slate-500">Money out (filtered)</span>
          <span className="ml-3 text-base font-bold tabular-nums text-amber-700">{result ? formatPKR(result.outflow_paisa) : '—'}</span>
        </div>
      </div>

      {error && <div className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 ring-1 ring-inset ring-red-200">{error}</div>}

      {result === null ? (
        <div className="flex items-center justify-center py-16 text-slate-400">
          <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Loading transactions…
        </div>
      ) : (
        <>
          <Table>
            <THead>
              <tr>
                <TH>Date &amp; time</TH>
                <TH>Type</TH>
                <TH>Transaction</TH>
                <TH>Related</TH>
                <TH>Method</TH>
                <TH className="text-right">Amount</TH>
                <TH>By</TH>
              </tr>
            </THead>
            <tbody>
              {result.rows.length === 0 && <EmptyRow colSpan={7}>No transactions for this selection.</EmptyRow>}
              {result.rows.map((t) => (
                <TR key={`${t.txn_type}-${t.txn_id}`}>
                  <TD className="whitespace-nowrap text-xs">{t.txn_at}</TD>
                  <TD>
                    <Badge tone={typeTone(t.txn_type)}>{t.txn_type_label}</Badge>
                  </TD>
                  <TD className="font-mono text-xs">{t.txn_id}</TD>
                  <TD className="text-xs">
                    <span className="font-medium text-slate-700">{t.related_name ?? t.related_ref ?? '—'}</span>
                    {t.reference_number && <div className="text-slate-500">Ref: {t.reference_number}</div>}
                  </TD>
                  <TD className="text-xs">{t.method ? methodLabel(t.method) : '—'}</TD>
                  <TD className={`text-right font-medium tabular-nums ${t.txn_type === 'PATIENT_PAYMENT' ? 'text-emerald-700' : 'text-slate-900'}`}>
                    {formatPKR(t.amount_paisa)}
                  </TD>
                  <TD className="text-xs">{t.created_by_name ?? '—'}</TD>
                </TR>
              ))}
            </tbody>
          </Table>
          <Pagination page={page} pages={pages} total={result.total} onPage={setPage} />
        </>
      )}
    </div>
  )
}

export function Pagination({ page, pages, total, onPage }: { page: number; pages: number; total: number; onPage: (p: number) => void }) {
  return (
    <div className="flex items-center justify-between text-xs text-slate-500">
      <span>
        Page {page} of {pages} · {total} entries
      </span>
      <div className="flex gap-2">
        <Button variant="outline" disabled={page <= 1} onClick={() => onPage(page - 1)}>
          <ChevronLeft className="h-4 w-4" /> Prev
        </Button>
        <Button variant="outline" disabled={page >= pages} onClick={() => onPage(page + 1)}>
          Next <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  )
}

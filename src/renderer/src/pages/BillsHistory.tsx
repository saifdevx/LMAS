import { useCallback, useEffect, useState } from 'react'
import { ChevronLeft, ChevronRight, Loader2 } from 'lucide-react'
import type { BillListResult, PatientCategory, SessionInfo } from '../../../shared/api-types'
import { api } from '../api'
import { formatPKR } from '../../../shared/money'
import { Badge } from '../components/ui/badge'
import { Button } from '../components/ui/button'
import { Input } from '../components/ui/input'
import { Label } from '../components/ui/label'
import { Select } from '../components/ui/select'
import { Table, THead, TH, TD, TR, EmptyRow } from '../components/ui/table'
import { BillDetail } from '../components/BillDetail'
import { addDaysStr, statusLabel, statusTone, todayStr } from '../lib/format'
import { useDebounced } from '../lib/useDebounced'

interface BillsHistoryPageProps {
  session: SessionInfo
  initialBillId?: number
}

export function BillsHistoryPage({ session, initialBillId }: BillsHistoryPageProps) {
  const [from, setFrom] = useState(addDaysStr(-6))
  const [to, setTo] = useState(todayStr())
  const [status, setStatus] = useState('ALL')
  const [category, setCategory] = useState('' as '' | PatientCategory)
  const [query, setQuery] = useState('')
  const [page, setPage] = useState(1)
  const [result, setResult] = useState<BillListResult | null>(null)
  const [error, setError] = useState('')
  const [openBillId, setOpenBillId] = useState<number | null>(initialBillId ?? null)
  const debouncedQuery = useDebounced(query)

  const load = useCallback(() => {
    api
      .billsList(session.token, {
        from: from || undefined,
        to: to || undefined,
        status,
        category: category || undefined,
        query: debouncedQuery,
        page,
        pageSize: 25
      })
      .then((r) => (setResult(r), setError('')))
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed to load bills'))
  }, [session.token, from, to, status, category, debouncedQuery, page])

  useEffect(load, [load])

  const pages = result ? Math.max(1, Math.ceil(result.total / result.pageSize)) : 1

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-lg font-bold text-slate-900">Bills history</h1>
        <p className="text-xs text-slate-500">All bills with their payments and status. Open a bill to record payments, print receipts or cancel.</p>
      </div>

      <div className="grid grid-cols-2 items-end gap-3 rounded-lg border border-slate-200 bg-white p-3 shadow-sm sm:grid-cols-5">
        <div>
          <Label>From</Label>
          <Input type="date" value={from} onChange={(e) => { setFrom(e.target.value); setPage(1) }} />
        </div>
        <div>
          <Label>To</Label>
          <Input type="date" value={to} onChange={(e) => { setTo(e.target.value); setPage(1) }} />
        </div>
        <div>
          <Label>Status</Label>
          <Select value={status} onChange={(e) => { setStatus(e.target.value); setPage(1) }}>
            <option value="ALL">All statuses</option>
            <option value="FINALIZED">Unpaid</option>
            <option value="PARTIALLY_PAID">Partially paid</option>
            <option value="PAID">Paid</option>
            <option value="CANCELLED">Cancelled</option>
          </Select>
        </div>
        <div>
          <Label>Category</Label>
          <Select value={category} onChange={(e) => { setCategory(e.target.value as '' | PatientCategory); setPage(1) }}>
            <option value="">All</option>
            <option value="SELF">Self</option>
            <option value="REFERRED">Referred</option>
          </Select>
        </div>
        <div>
          <Label>Search</Label>
          <Input placeholder="Bill no, patient…" value={query} onChange={(e) => { setQuery(e.target.value); setPage(1) }} />
        </div>
      </div>

      {error && <div className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 ring-1 ring-inset ring-red-200">{error}</div>}

      {result === null ? (
        <div className="flex items-center justify-center py-16 text-slate-400">
          <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Loading bills…
        </div>
      ) : (
        <>
          <Table>
            <THead>
              <tr>
                <TH>Bill</TH>
                <TH>Date</TH>
                <TH>Patient</TH>
                <TH>Category</TH>
                <TH className="text-right">Net</TH>
                <TH className="text-right">Paid</TH>
                <TH className="text-right">Balance</TH>
                <TH>Status</TH>
                <TH></TH>
              </tr>
            </THead>
            <tbody>
              {result.rows.length === 0 && <EmptyRow colSpan={9}>No bills for these filters.</EmptyRow>}
              {result.rows.map((b) => (
                <TR key={b.id}>
                  <TD className="font-mono text-xs">{b.bill_number}</TD>
                  <TD>{b.bill_date}</TD>
                  <TD>
                    <span className="font-medium">{b.patient_name}</span>
                    <span className="block font-mono text-[10px] text-slate-400">{b.patient_code}</span>
                  </TD>
                  <TD>{b.category === 'SELF' ? 'Self' : `Referred${b.practitioner_name ? ` — ${b.practitioner_name}` : ''}`}</TD>
                  <TD className="text-right">{formatPKR(b.net_paisa)}</TD>
                  <TD className="text-right">{formatPKR(b.paid_paisa)}</TD>
                  <TD className="text-right">{formatPKR(b.outstanding_paisa)}</TD>
                  <TD><Badge tone={statusTone(b.status)}>{statusLabel(b.status)}</Badge></TD>
                  <TD className="text-right">
                    <Button variant="outline" size="sm" onClick={() => setOpenBillId(b.id)}>View</Button>
                  </TD>
                </TR>
              ))}
            </tbody>
          </Table>
          <div className="flex items-center justify-between text-xs text-slate-500">
            <span>{result.total} bill(s)</span>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
                <ChevronLeft className="h-3.5 w-3.5" /> Prev
              </Button>
              <span>Page {result.page} of {pages}</span>
              <Button variant="outline" size="sm" disabled={page >= pages} onClick={() => setPage((p) => p + 1)}>
                Next <ChevronRight className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
        </>
      )}

      {openBillId !== null && (
        <BillDetail session={session} billId={openBillId} onClose={() => setOpenBillId(null)} onChanged={load} />
      )}
    </div>
  )
}

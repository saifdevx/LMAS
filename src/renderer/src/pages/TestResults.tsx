import { useCallback, useEffect, useState } from 'react'
import { Loader2, FlaskConical } from 'lucide-react'
import type { LabWorklistRow, SessionInfo } from '../../../shared/api-types'
import { api } from '../api'
import { Alert } from '../components/ui/alert'
import { Badge } from '../components/ui/badge'
import { Button } from '../components/ui/button'
import { Input } from '../components/ui/input'
import { Label } from '../components/ui/label'
import { Select } from '../components/ui/select'
import { Table, THead, TH, TD, TR, EmptyRow } from '../components/ui/table'
import { LabWorkModal } from '../components/LabWork'
import { useDebounced } from '../lib/useDebounced'
import { addDaysStr, todayStr } from '../lib/format'

interface TestResultsPageProps {
  session: SessionInfo
}

/**
 * Laboratory worklist (PRD §Module F): every active bill awaiting
 * laboratory work, with sample tracking, result entry, verification
 * and A4 report printing behind the "Open" action.
 */
export function TestResultsPage({ session }: TestResultsPageProps) {
  const [query, setQuery] = useState('')
  const [status, setStatus] = useState('ALL')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [rows, setRows] = useState<LabWorklistRow[] | null>(null)
  const [error, setError] = useState('')
  const [openBillId, setOpenBillId] = useState<number | null>(null)
  const debounced = useDebounced(query)

  const load = useCallback(() => {
    api
      .labWorklist(session.token, {
        query: debounced,
        status,
        from: from || undefined,
        to: to || undefined
      })
      .then((r) => (setRows(r), setError('')))
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed to load the worklist'))
  }, [session.token, debounced, status, from, to])

  useEffect(load, [load])

  const canView = session.user.permissions.includes('test_results.view')
  if (!canView) {
    return <Alert kind="error" message="You do not have permission to view laboratory results." />
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="flex items-center gap-2 text-lg font-bold text-slate-900">
          <FlaskConical className="h-5 w-5 text-sky-600" /> Test results &amp; laboratory workflow
        </h1>
        <p className="text-xs text-slate-500">
          Track samples, enter results (revision-tracked), verify and approve, then print the A4 report or export it as PDF.
        </p>
      </div>

      <div className="grid grid-cols-2 items-end gap-3 rounded-lg border border-slate-200 bg-white p-3 shadow-sm sm:grid-cols-5">
        <div className="col-span-2">
          <Label>Search</Label>
          <Input
            placeholder="Patient, bill, visit or test…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <div>
          <Label>Test status</Label>
          <Select value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="ALL">All statuses</option>
            <option value="PENDING">Pending</option>
            <option value="IN_PROGRESS">In progress</option>
            <option value="COMPLETED">Completed</option>
            <option value="CANCELLED">Cancelled</option>
          </Select>
        </div>
        <div>
          <Label>From</Label>
          <Input type="date" value={from} max={to || todayStr()} onChange={(e) => setFrom(e.target.value)} />
        </div>
        <div>
          <Label>To</Label>
          <Input type="date" value={to} min={from} max={todayStr()} onChange={(e) => setTo(e.target.value)} />
        </div>
      </div>
      {(from || to) && (
        <div className="text-xs text-slate-500">
          Showing {from || 'beginning'} → {to || todayStr()}
          <button className="ml-2 text-sky-600 hover:underline" onClick={() => (setFrom(''), setTo(''))}>
            clear dates
          </button>
          {' · '}
          <button
            className="text-sky-600 hover:underline"
            onClick={() => (setFrom(addDaysStr(-6)), setTo(todayStr()))}
          >
            last 7 days
          </button>
        </div>
      )}

      <Alert kind="error" message={error} />

      {rows === null ? (
        <div className="flex items-center justify-center py-16 text-slate-400">
          <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Loading worklist…
        </div>
      ) : (
        <Table>
          <THead>
            <tr>
              <TH>Bill</TH>
              <TH>Date</TH>
              <TH>Patient</TH>
              <TH>Category</TH>
              <TH>Tests</TH>
              <TH>Samples</TH>
              <TH></TH>
            </tr>
          </THead>
          <tbody>
            {rows.length === 0 && <EmptyRow colSpan={7}>No laboratory work matches these filters.</EmptyRow>}
            {rows.map((r) => {
              const outstanding = r.test_count - r.completed_count - r.cancelled_count
              return (
                <TR key={r.bill_id}>
                  <TD>
                    <div className="font-mono text-xs font-medium">{r.bill_number}</div>
                    <div className="font-mono text-xs text-slate-400">{r.visit_code}</div>
                  </TD>
                  <TD className="text-xs">{r.bill_date}</TD>
                  <TD>
                    <div className="font-medium">{r.patient_name}</div>
                    {r.patient_name_urdu && <div className="urdu text-xs text-slate-500">{r.patient_name_urdu}</div>}
                    <div className="font-mono text-xs text-slate-400">{r.patient_code}</div>
                  </TD>
                  <TD className="text-xs">{r.category === 'SELF' ? 'Self' : `Referred — ${r.practitioner_name ?? ''}`}</TD>
                  <TD>
                    <div className="flex items-center gap-1.5">
                      <Badge tone={outstanding > 0 ? 'warning' : 'success'}>
                        {outstanding > 0 ? `${outstanding} open` : 'All done'}
                      </Badge>
                      <span className="text-xs text-slate-500">
                        {r.completed_count}/{r.test_count} complete
                      </span>
                    </div>
                    <div className="mt-0.5 flex gap-1">
                      {r.verified_count > 0 && <Badge tone="info">{r.verified_count} verified</Badge>}
                      {r.approved_count > 0 && <Badge tone="success">{r.approved_count} approved</Badge>}
                      {r.cancelled_count > 0 && <Badge tone="danger">{r.cancelled_count} cancelled</Badge>}
                    </div>
                  </TD>
                  <TD className="font-mono text-xs">{r.sample_codes.length > 0 ? r.sample_codes.join(', ') : '—'}</TD>
                  <TD className="text-right">
                    <Button size="sm" variant="outline" onClick={() => setOpenBillId(r.bill_id)}>
                      Open work
                    </Button>
                  </TD>
                </TR>
              )
            })}
          </tbody>
        </Table>
      )}

      {openBillId !== null && (
        <LabWorkModal session={session} billId={openBillId} onClose={() => (setOpenBillId(null), load())} />
      )}
    </div>
  )
}

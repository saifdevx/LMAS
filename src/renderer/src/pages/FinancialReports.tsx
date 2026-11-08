import { useCallback, useEffect, useState } from 'react'
import { FileSpreadsheet, Loader2, Printer } from 'lucide-react'
import type { ReportKind, ReportResult, SessionInfo } from '../../../shared/api-types'
import { api } from '../api'
import { formatPKR } from '../../../shared/money'
import { Button } from '../components/ui/button'
import { Input } from '../components/ui/input'
import { Label } from '../components/ui/label'
import { Select } from '../components/ui/select'
import { Table, THead, TH, TD, TR } from '../components/ui/table'
import { addDaysStr, todayStr } from '../lib/format'

interface ReportsPageProps {
  session: SessionInfo
}

const REPORT_OPTIONS: Array<{ kind: ReportKind; label: string; range: 'day' | 'period' | 'none' }> = [
  { kind: 'DAILY', label: 'Daily financial report', range: 'day' },
  { kind: 'WEEKLY', label: 'Weekly financial report', range: 'period' },
  { kind: 'MONTHLY', label: 'Monthly financial report', range: 'period' },
  { kind: 'CUSTOM', label: 'Financial summary (custom range)', range: 'period' },
  { kind: 'SELF', label: 'Self-patient financial report', range: 'period' },
  { kind: 'REFERRED', label: 'Referred-patient financial report', range: 'period' },
  { kind: 'COMMISSIONS', label: 'Practitioner commission report', range: 'period' },
  { kind: 'EXPENSES', label: 'Expense report', range: 'period' },
  { kind: 'OUTSTANDING', label: 'Patient outstanding balances', range: 'none' },
  { kind: 'CASH', label: 'Cash collection report', range: 'period' },
  { kind: 'PROFITABILITY', label: 'Profitability report', range: 'period' }
]

/** Financial reports with PDF and Excel export (PRD §Modules G & I, CP4). */
export function FinancialReportsPage({ session }: ReportsPageProps) {
  const [kind, setKind] = useState<ReportKind>('MONTHLY')
  const [from, setFrom] = useState(addDaysStr(-29))
  const [to, setTo] = useState(todayStr())
  const [result, setResult] = useState<ReportResult | null>(null)
  const [error, setError] = useState('')
  const [busyExport, setBusyExport] = useState<'' | 'pdf' | 'xlsx'>('')
  const [notice, setNotice] = useState('')

  const option = REPORT_OPTIONS.find((o) => o.kind === kind)!
  const showRange = option.range === 'period'
  const showDay = option.range === 'day'

  useEffect(() => {
    if (option.range === 'day') {
      setFrom(todayStr())
      setTo(todayStr())
    }
  }, [kind, option.range])

  const spec = useCallback(
    () => ({ kind, from: from || undefined, to: to || undefined }),
    [kind, from, to]
  )

  const load = useCallback(() => {
    api
      .reportsRun(session.token, spec())
      .then((r) => (setResult(r), setError(''), setNotice('')))
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed to build the report'))
  }, [session.token, spec])

  useEffect(load, [load])

  const exportAs = (format: 'pdf' | 'xlsx') => {
    setBusyExport(format)
    setNotice('')
    const call = format === 'pdf' ? api.reportsExportPdf(session.token, spec()) : api.reportsExportExcel(session.token, spec())
    call
      .then((file) => {
        setBusyExport('')
        setNotice(file ? `Saved to ${file}` : 'Export cancelled')
      })
      .catch((e) => (setBusyExport(''), setError(e instanceof Error ? e.message : 'Export failed')))
  }

  const cell = (colType: string, value: string | number | null) => {
    if (value === null || value === undefined) return ''
    if (colType === 'money' && typeof value === 'number') return formatPKR(value)
    return String(value)
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-lg font-bold text-slate-900">Financial reports</h1>
        <p className="text-xs text-slate-500">
          Daily, weekly, monthly and custom reports — exportable as PDF and Excel (.xlsx). Cancelled bills are always excluded.
        </p>
      </div>

      <div className="grid grid-cols-2 items-end gap-3 rounded-lg border border-slate-200 bg-white p-3 shadow-sm sm:grid-cols-4">
        <div className="col-span-2">
          <Label>Report</Label>
          <Select value={kind} onChange={(e) => setKind(e.target.value as ReportKind)}>
            {REPORT_OPTIONS.map((o) => (
              <option key={o.kind} value={o.kind}>
                {o.label}
              </option>
            ))}
          </Select>
        </div>
        {showRange && (
          <>
            <div>
              <Label>From</Label>
              <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
            </div>
            <div>
              <Label>To</Label>
              <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
            </div>
          </>
        )}
        {showDay && (
          <div>
            <Label>Date</Label>
            <Input type="date" value={from} onChange={(e) => { setFrom(e.target.value); setTo(e.target.value) }} />
          </div>
        )}
        {!showRange && !showDay && <div className="hidden sm:block sm:col-span-2" />}
      </div>

      {error && <div className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 ring-1 ring-inset ring-red-200">{error}</div>}
      {notice && <div className="rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-800 ring-1 ring-inset ring-emerald-200">{notice}</div>}

      {result === null ? (
        <div className="flex items-center justify-center py-16 text-slate-400">
          <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Building report…
        </div>
      ) : (
        <>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="text-sm font-semibold text-slate-900">{result.title}</h2>
              <p className="text-xs text-slate-500">
                Period {result.from} — {result.to} · {result.rows.length} row{result.rows.length === 1 ? '' : 's'}
              </p>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => exportAs('pdf')} disabled={busyExport !== ''}>
                {busyExport === 'pdf' ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Printer className="mr-1 h-4 w-4" />}
                Save PDF
              </Button>
              <Button variant="outline" onClick={() => exportAs('xlsx')} disabled={busyExport !== ''}>
                {busyExport === 'xlsx' ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <FileSpreadsheet className="mr-1 h-4 w-4" />}
                Save Excel
              </Button>
            </div>
          </div>

          {result.figures.length > 0 && (
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {result.figures.map((f) => (
                <div key={f.label} className="rounded-lg border border-slate-200 bg-white p-3 shadow-sm">
                  <div className="text-[11px] uppercase tracking-wide text-slate-500">{f.label}</div>
                  <div className="mt-0.5 text-sm font-bold tabular-nums text-slate-900">
                    {f.paisa !== undefined ? formatPKR(f.paisa) : f.text}
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className="max-h-[28rem] overflow-y-auto rounded-lg border border-slate-200 bg-white shadow-sm">
            <Table>
              <THead>
                <tr>
                  {result.columns.map((c) => (
                    <TH key={c.key} className={c.type === 'money' || c.type === 'number' ? 'text-right' : ''}>
                      {c.label}
                    </TH>
                  ))}
                </tr>
              </THead>
              <tbody>
                {result.rows.length === 0 && (
                  <TR>
                    <TD className="py-8 text-center text-slate-500" colSpan={result.columns.length}>
                      No records for this selection.
                    </TD>
                  </TR>
                )}
                {result.rows.map((row, i) => (
                  <TR key={i}>
                    {result.columns.map((c) => (
                      <TD key={c.key} className={c.type === 'money' || c.type === 'number' ? 'text-right tabular-nums' : ''}>
                        {cell(c.type, row[c.key])}
                      </TD>
                    ))}
                  </TR>
                ))}
                {Object.keys(result.totals).length > 0 && result.rows.length > 0 && (
                  <tr className="bg-slate-100 font-semibold">
                    {result.columns.map((c) => (
                      <td key={c.key} className={`px-3 py-2 text-sm ${c.type === 'money' || c.type === 'number' ? 'text-right tabular-nums' : ''}`}>
                        {c.key in result.totals ? cell(c.type, result.totals[c.key]) : ''}
                      </td>
                    ))}
                  </tr>
                )}
              </tbody>
            </Table>
          </div>
        </>
      )}
    </div>
  )
}

import { useCallback, useEffect, useMemo, useState } from 'react'
import { CheckCircle2, Loader2, Plus, Printer, FileDown, X, UserSearch } from 'lucide-react'
import type { BillView, LabTest, PatientCategory, PatientListItem, PaymentMethod, Practitioner, ReceiptLayout, SessionInfo } from '../../../shared/api-types'
import { api } from '../api'
import { calculateBillTotals, calculateCommission, bpToPercent } from '../../../shared/commission'
import { formatPKR, toPaisa } from '../../../shared/money'
import { Alert } from '../components/ui/alert'
import { Badge } from '../components/ui/badge'
import { Button } from '../components/ui/button'
import { Input } from '../components/ui/input'
import { Label } from '../components/ui/label'
import { Select } from '../components/ui/select'
import { Table, THead, TH, TD, TR, EmptyRow } from '../components/ui/table'
import { useDebounced } from '../lib/useDebounced'

interface BillingPageProps {
  session: SessionInfo
  initialPatientId?: number
}

export function BillingPage({ session, initialPatientId }: BillingPageProps) {
  const [patientQuery, setPatientQuery] = useState('')
  const [patientResults, setPatientResults] = useState<PatientListItem[]>([])
  const [patient, setPatient] = useState<PatientListItem | null>(null)
  const [category, setCategory] = useState<PatientCategory>('SELF')
  const [practitioners, setPractitioners] = useState<Practitioner[]>([])
  const [practitionerId, setPractitionerId] = useState<number | null>(null)
  const [testQuery, setTestQuery] = useState('')
  const [testResults, setTestResults] = useState<LabTest[]>([])
  const [lines, setLines] = useState<LabTest[]>([])
  const [discount, setDiscount] = useState('')
  const [received, setReceived] = useState('')
  const [method, setMethod] = useState<PaymentMethod>('CASH')
  const [reference, setReference] = useState('')
  const [notes, setNotes] = useState('')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const [savedBill, setSavedBill] = useState<BillView | null>(null)
  const [pdfNote, setPdfNote] = useState('')

  const debouncedPatientQuery = useDebounced(patientQuery)
  const debouncedTestQuery = useDebounced(testQuery)

  useEffect(() => {
    api.practitionersList(session.token, false).then(setPractitioners).catch(() => undefined)
  }, [session.token])

  useEffect(() => {
    if (initialPatientId) {
      api.patientsSearch(session.token, '').then((all) => {
        const found = all.find((p) => p.id === initialPatientId)
        if (found) setPatient(found)
      }).catch(() => undefined)
    }
  }, [initialPatientId, session.token])

  useEffect(() => {
    let alive = true
    const q = patient ? '' : debouncedPatientQuery
    if (debouncedPatientQuery.trim().length < 1 && !patient) {
      setPatientResults([])
      return
    }
    api
      .patientsSearch(session.token, q)
      .then((r) => alive && setPatientResults(r))
      .catch(() => undefined)
    return () => {
      alive = false
    }
  }, [debouncedPatientQuery, session.token, patient])

  useEffect(() => {
    let alive = true
    api
      .testsList(session.token, { query: debouncedTestQuery })
      .then((r) => alive && setTestResults(r.slice(0, 8)))
      .catch(() => undefined)
    return () => {
      alive = false
    }
  }, [debouncedTestQuery, session.token])

  const canDiscount = session.user.permissions.includes('billing.discount')
  const practitioner = practitioners.find((p) => p.id === practitionerId) ?? null
  const rateBp = category === 'REFERRED' ? (practitioner?.commission_rate_bp ?? 0) : 0

  const preview = useMemo(() => {
    try {
      const totals = calculateBillTotals(lines.map((l) => ({ lineTotalPaisa: l.price_paisa })), discount.trim() === '' ? 0 : toPaisa(discount))
      const commission = calculateCommission({ category, eligibleAmountPaisa: totals.netPaisa, rateBp })
      const receivedPaisa = received.trim() === '' ? 0 : toPaisa(received)
      return {
        ok: true,
        totals,
        commission,
        receivedPaisa,
        outstanding: totals.netPaisa - receivedPaisa,
        problem: receivedPaisa > totals.netPaisa ? 'Amount received cannot exceed the net bill.' : null
      }
    } catch (err) {
      return { ok: false, problem: err instanceof Error ? err.message : 'Check the amounts.' }
    }
  }, [lines, discount, category, rateBp, received])

  const canSave =
    patient !== null &&
    (category === 'SELF' || practitionerId !== null) &&
    lines.length > 0 &&
    preview.ok &&
    !preview.problem &&
    !saving

  const reset = useCallback(() => {
    setPatient(null)
    setPatientQuery('')
    setCategory('SELF')
    setPractitionerId(null)
    setLines([])
    setDiscount('')
    setReceived('')
    setMethod('CASH')
    setReference('')
    setNotes('')
    setSavedBill(null)
    setPdfNote('')
    setError('')
  }, [])

  async function save() {
    if (!session || !patient || !preview.ok) return
    setError('')
    setSaving(true)
    try {
      const bill = await api.billsCreate(session.token, {
        patient_id: patient.id,
        category,
        practitioner_id: category === 'REFERRED' ? practitionerId : null,
        items: lines.map((l) => ({ test_id: l.id })),
        discount_paisa: discount.trim() === '' ? 0 : toPaisa(discount),
        initial_payment_paisa: received.trim() === '' ? 0 : toPaisa(received),
        method,
        reference_number: reference,
        transaction_id: crypto.randomUUID(),
        notes
      })
      setSavedBill(bill)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save the bill')
    } finally {
      setSaving(false)
    }
  }

  async function printSaved(layout: ReceiptLayout) {
    if (!savedBill) return
    setError('')
    try {
      await api.receiptPrint(session.token, savedBill.id, layout)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Print failed')
    }
  }

  async function pdfSaved(layout: ReceiptLayout) {
    if (!savedBill) return
    setError('')
    try {
      const p = await api.receiptPdf(session.token, savedBill.id, layout)
      setPdfNote(p ? `PDF saved to ${p}` : 'PDF export cancelled.')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'PDF export failed')
    }
  }

  if (savedBill) {
    return (
      <div className="mx-auto max-w-2xl space-y-4">
        <div className="flex items-center gap-2">
          <CheckCircle2 className="h-6 w-6 text-emerald-600" />
          <h1 className="text-lg font-bold text-slate-900">Bill saved</h1>
        </div>
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <div className="font-mono text-sm font-semibold text-slate-900">{savedBill.bill_number}</div>
              <div className="text-xs text-slate-600">
                {savedBill.patient_name} · {savedBill.category === 'SELF' ? 'Self' : `Referred — ${savedBill.practitioner_name}`} · Visit {savedBill.visit_code}
              </div>
            </div>
            <Badge tone={savedBill.status === 'PAID' ? 'success' : savedBill.status === 'PARTIALLY_PAID' ? 'warning' : 'info'}>
              {savedBill.status === 'PAID' ? 'Paid' : savedBill.status === 'PARTIALLY_PAID' ? 'Partially paid' : 'Unpaid'}
            </Badge>
          </div>
          <div className="mt-3 grid grid-cols-2 gap-x-6 gap-y-1 text-sm sm:grid-cols-3">
            <div className="flex justify-between"><span className="text-slate-500">Net bill</span><span className="font-medium">{formatPKR(savedBill.net_paisa)}</span></div>
            <div className="flex justify-between"><span className="text-slate-500">Received</span><span className="font-medium text-emerald-700">{formatPKR(savedBill.paid_paisa)}</span></div>
            <div className="flex justify-between"><span className="text-slate-500">Balance</span><span className="font-medium text-red-700">{formatPKR(savedBill.outstanding_paisa)}</span></div>
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <Button variant="outline" size="sm" onClick={() => void printSaved('thermal')}><Printer className="h-3.5 w-3.5" /> Print thermal receipt</Button>
            <Button variant="outline" size="sm" onClick={() => void printSaved('a4')}><Printer className="h-3.5 w-3.5" /> Print A4</Button>
            <Button variant="outline" size="sm" onClick={() => void pdfSaved('a4')}><FileDown className="h-3.5 w-3.5" /> Save PDF</Button>
            <Button size="sm" onClick={reset}>New bill</Button>
          </div>
          {pdfNote && <p className="mt-2 text-xs text-slate-500">{pdfNote}</p>}
        </div>
        <Alert kind="error" message={error} />
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-lg font-bold text-slate-900">New bill</h1>
        <p className="text-xs text-slate-500">Select the patient, choose the category, add tests and record payment. Commission is calculated automatically.</p>
      </div>
      <Alert kind="error" message={error} />

      {/* Step 1 — patient */}
      <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-500">1 · Patient</h2>
          {patient && (
            <Button variant="ghost" size="sm" onClick={() => { setPatient(null); setPatientQuery('') }}>
              <X className="h-3.5 w-3.5" /> Change
            </Button>
          )}
        </div>
        {patient ? (
          <div className="flex items-center justify-between rounded-md bg-sky-50 px-3 py-2 ring-1 ring-inset ring-sky-200">
            <div>
              <span className="font-medium text-slate-900">{patient.full_name}</span>
              {patient.full_name_urdu && <span className="urdu ml-2 text-slate-500">{patient.full_name_urdu}</span>}
              <span className="ml-2 font-mono text-xs text-slate-500">{patient.patient_code}</span>
              {patient.phone && <span className="ml-2 text-xs text-slate-500">{patient.phone}</span>}
            </div>
          </div>
        ) : (
          <div>
            <div className="relative">
              <UserSearch className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <Input
                className="pl-9"
                placeholder="Search existing patient by ID, name, phone or bill number…"
                value={patientQuery}
                onChange={(e) => setPatientQuery(e.target.value)}
              />
            </div>
            {patientResults.length > 0 && (
              <ul className="mt-2 max-h-56 overflow-y-auto rounded-md border border-slate-200">
                {patientResults.map((p) => (
                  <li key={p.id}>
                    <button
                      type="button"
                      className="flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-slate-50"
                      onClick={() => { setPatient(p); setPatientQuery(''); setPatientResults([]) }}
                    >
                      <span>
                        <span className="font-medium">{p.full_name}</span>
                        {p.full_name_urdu && <span className="urdu ml-2 text-slate-500">{p.full_name_urdu}</span>}
                      </span>
                      <span className="font-mono text-xs text-slate-500">{p.patient_code}{p.phone ? ` · ${p.phone}` : ''}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
            {debouncedPatientQuery.trim().length > 0 && patientResults.length === 0 && (
              <p className="mt-2 text-xs text-slate-400">No match. Register the patient first from “New Registration”.</p>
            )}
          </div>
        )}
      </div>

      {/* Step 2 — category */}
      <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
        <h2 className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-500">2 · Patient category</h2>
        <div className="flex gap-2">
          {(['SELF', 'REFERRED'] as const).map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setCategory(c)}
              className={`flex-1 rounded-md border px-3 py-2 text-left text-sm transition-colors ${
                category === c ? 'border-sky-500 bg-sky-50 ring-1 ring-inset ring-sky-400' : 'border-slate-300 hover:bg-slate-50'
              }`}
            >
              <div className="font-medium text-slate-900">{c === 'SELF' ? 'Self patient' : 'Referred patient'}</div>
              <div className="text-xs text-slate-500">{c === 'SELF' ? 'Direct visit — laboratory receives 100%' : 'Sent by a practitioner — commission applies'}</div>
            </button>
          ))}
        </div>
        {category === 'REFERRED' && (
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <div>
              <Label>
                Referring practitioner <span className="text-red-500">*</span>
              </Label>
              <Select
                value={practitionerId ?? ''}
                onChange={(e) => setPractitionerId(e.target.value === '' ? null : Number(e.target.value))}
              >
                <option value="">Select practitioner…</option>
                {practitioners.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} — {bpToPercent(p.commission_rate_bp)}%
                  </option>
                ))}
              </Select>
            </div>
            <div className="flex items-end">
              <p className="text-xs text-slate-500">
                {practitioner
                  ? `Current rate ${bpToPercent(practitioner.commission_rate_bp)}% — it will be snapshotted on this bill.`
                  : 'Selecting a practitioner snapshots their current commission rate onto the bill.'}
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Step 3 — tests */}
      <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
        <h2 className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-500">3 · Laboratory tests</h2>
        <Input placeholder="Search active tests by name or code…" value={testQuery} onChange={(e) => setTestQuery(e.target.value)} />
        {testResults.length > 0 && (
          <ul className="mt-2 max-h-48 overflow-y-auto rounded-md border border-slate-200">
            {testResults.map((t) => {
              const added = lines.some((l) => l.id === t.id)
              return (
                <li key={t.id} className="flex items-center justify-between px-3 py-2 text-sm">
                  <span>
                    <span className="font-medium">{t.name}</span>
                    <span className="ml-2 font-mono text-[10px] text-slate-400">{t.test_code}</span>
                    {t.category_name && <span className="ml-2 text-xs text-slate-400">{t.category_name}</span>}
                  </span>
                  <span className="flex items-center gap-3">
                    <span className="font-medium">{formatPKR(t.price_paisa)}</span>
                    <Button size="sm" variant={added ? 'ghost' : 'outline'} disabled={added} onClick={() => setLines((ls) => [...ls, t])}>
                      <Plus className="h-3.5 w-3.5" /> {added ? 'Added' : 'Add'}
                    </Button>
                  </span>
                </li>
              )
            })}
          </ul>
        )}

        <div className="mt-3">
          <Table>
            <THead>
              <tr>
                <TH>Test</TH>
                <TH className="text-right">Price</TH>
                <TH></TH>
              </tr>
            </THead>
            <tbody>
              {lines.length === 0 && <EmptyRow colSpan={3}>No tests added yet.</EmptyRow>}
              {lines.map((l) => (
                <TR key={l.id}>
                  <TD>
                    {l.name}
                    <span className="block font-mono text-[10px] text-slate-400">{l.test_code}</span>
                  </TD>
                  <TD className="text-right">{formatPKR(l.price_paisa)}</TD>
                  <TD className="text-right">
                    <Button variant="ghost" size="sm" onClick={() => setLines((ls) => ls.filter((x) => x.id !== l.id))}>
                      <X className="h-3.5 w-3.5" />
                    </Button>
                  </TD>
                </TR>
              ))}
            </tbody>
          </Table>
        </div>
      </div>

      {/* Step 4 — money */}
      <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
        <h2 className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-500">4 · Discount & payment</h2>
        <div className="grid gap-4 sm:grid-cols-3">
          <div>
            <Label>Discount (PKR){!canDiscount && ' — requires permission'}</Label>
            <Input
              type="number"
              min={0}
              step="0.01"
              disabled={!canDiscount}
              value={discount}
              onChange={(e) => setDiscount(e.target.value)}
              placeholder="0.00"
            />
          </div>
          <div>
            <Label>Amount received now (PKR)</Label>
            <Input type="number" min={0} step="0.01" value={received} onChange={(e) => setReceived(e.target.value)} placeholder="0.00" />
          </div>
          <div>
            <Label>Payment method</Label>
            <Select value={method} onChange={(e) => setMethod(e.target.value as PaymentMethod)}>
              <option value="CASH">Cash</option>
              <option value="BANK_TRANSFER">Bank Transfer</option>
              <option value="CARD">Card</option>
              <option value="MOBILE_WALLET">Mobile Wallet</option>
              <option value="CHEQUE">Cheque</option>
            </Select>
          </div>
          <div className="sm:col-span-2">
            <Label>Reference / notes</Label>
            <Input value={reference} onChange={(e) => setReference(e.target.value)} placeholder="optional reference number" />
          </div>
        </div>

        <div className="mt-4 rounded-md bg-slate-50 p-3 ring-1 ring-inset ring-slate-200">
          {preview.ok ? (
            <div className="grid gap-x-8 gap-y-1 text-sm sm:grid-cols-2">
              <div className="flex justify-between"><span className="text-slate-500">Subtotal</span><span>{formatPKR(preview.totals!.subtotalPaisa)}</span></div>
              <div className="flex justify-between"><span className="text-slate-500">Discount</span><span>-{formatPKR(preview.totals!.discountPaisa)}</span></div>
              <div className="flex justify-between text-base font-semibold"><span>Net bill</span><span>{formatPKR(preview.totals!.netPaisa)}</span></div>
              {category === 'REFERRED' ? (
                <>
                  <div className="flex justify-between"><span className="text-slate-500">Practitioner commission ({bpToPercent(rateBp)}%)</span><span className="text-amber-700">{formatPKR(preview.commission!.commissionPaisa)}</span></div>
                  <div className="flex justify-between"><span className="text-slate-500">Laboratory allocation</span><span className="text-sky-700">{formatPKR(preview.commission!.labAllocationPaisa)}</span></div>
                </>
              ) : (
                <div className="flex justify-between"><span className="text-slate-500">Commission</span><span>{formatPKR(0)}</span></div>
              )}
              <div className="flex justify-between"><span className="text-slate-500">Received now</span><span className="text-emerald-700">{formatPKR(preview.receivedPaisa!)}</span></div>
              <div className="flex justify-between font-semibold"><span>Balance due after this payment</span><span className={preview.outstanding! > 0 ? 'text-red-700' : 'text-emerald-700'}>{formatPKR(Math.max(0, preview.outstanding!))}</span></div>
            </div>
          ) : (
            <p className="text-sm text-amber-700">{preview.problem}</p>
          )}
          {category === 'REFERRED' && (
            <p className="mt-2 text-[11px] text-slate-400">
              The eligible commission basis follows the active policy in Settings (net bill after discount, or collected amount).
            </p>
          )}
        </div>

        <div className="mt-4 flex items-center justify-end gap-2">
          <Button variant="ghost" onClick={reset}>Clear</Button>
          <Button disabled={!canSave || (!!preview.problem)} onClick={() => void save()}>
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
            Save bill{received.trim() !== '' && preview.ok ? ` & receive ${formatPKR(preview.receivedPaisa!)}` : ''}
          </Button>
        </div>
      </div>
    </div>
  )
}

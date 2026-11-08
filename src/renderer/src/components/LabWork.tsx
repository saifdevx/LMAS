import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react'
import {
  ClipboardList,
  FileDown,
  FlaskConical,
  History,
  Loader2,
  Pencil,
  Plus,
  Printer,
  RotateCcw,
  ShieldCheck,
  ThumbsUp
} from 'lucide-react'
import type {
  LabBillWork,
  LabResultView,
  LabSampleView,
  LabTechnician,
  SampleStatus,
  SessionInfo,
  TestStatus
} from '../../../shared/api-types'
import { api } from '../api'
import { Alert } from './ui/alert'
import { Badge } from './ui/badge'
import { Button } from './ui/button'
import { Input } from './ui/input'
import { Label } from './ui/label'
import { Modal } from './ui/modal'
import { Select } from './ui/select'
import { Textarea } from './ui/textarea'
import { Table, THead, TH, TD, TR, EmptyRow } from './ui/table'
import {
  resultStateLabel,
  resultStateTone,
  sampleStatusLabel,
  sampleStatusTone,
  statusLabel,
  statusTone,
  testStatusLabel,
  testStatusTone
} from '../lib/format'

/**
 * Laboratory workspace modals (PRD §Module F): sample tracking, result
 * entry with revisions, verification/approval and report issuing.
 * Shared by the Test Results worklist and the patient profile.
 */

const can = (session: SessionInfo, permission: string) => session.user.permissions.includes(permission)

function toDatetimeLocal(value: string | null | undefined): string {
  if (!value) return ''
  const m = value.match(/^(\d{4}-\d{2}-\d{2})[T ](\d{2}:\d{2})/)
  return m ? `${m[1]}T${m[2]}` : ''
}

function fromDatetimeLocal(value: string): string | null {
  if (!value) return null
  return `${value.replace('T', ' ')}:00`.slice(0, 19)
}

// ------------------------------------------------------------------ main modal

export function LabWorkModal({
  session,
  billId,
  onClose
}: {
  session: SessionInfo
  billId: number
  onClose: () => void
}) {
  const [work, setWork] = useState<LabBillWork | null>(null)
  const [error, setError] = useState('')
  const [busyItem, setBusyItem] = useState<number | null>(null)
  const [resultFor, setResultFor] = useState<LabResultView | null>(null)
  const [sampleModal, setSampleModal] = useState<'new' | LabSampleView | null>(null)
  const [revisionsFor, setRevisionsFor] = useState<LabResultView | null>(null)
  const [reasonFor, setReasonFor] = useState<{ kind: 'cancel-test' | 'reset-result'; item: LabResultView } | null>(null)
  const [showReports, setShowReports] = useState(false)

  const canManage = can(session, 'test_results.manage')
  const canApprove = can(session, 'results.approve')

  const reload = useCallback(() => {
    api
      .labBillWork(session.token, billId)
      .then((w) => (setWork(w), setError('')))
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed to load laboratory work'))
  }, [session.token, billId])

  useEffect(reload, [reload])

  async function runStatus(item: LabResultView, status: TestStatus, reason?: string) {
    setBusyItem(item.bill_item_id)
    setError('')
    try {
      const w = await api.labSetTestStatus(session.token, item.bill_item_id, status, reason)
      setWork(w)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed')
    } finally {
      setBusyItem(null)
    }
  }

  async function runStateAction(item: LabResultView, action: 'verify' | 'approve' | 'reset', reason?: string) {
    setBusyItem(item.bill_item_id)
    setError('')
    try {
      const w =
        action === 'verify'
          ? await api.labVerifyResult(session.token, item.bill_item_id)
          : action === 'approve'
            ? await api.labApproveResult(session.token, item.bill_item_id)
            : await api.labResetResult(session.token, item.bill_item_id, reason ?? '')
      setWork(w)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed')
    } finally {
      setBusyItem(null)
    }
  }

  async function issueReport(kind: 'print' | 'pdf') {
    setError('')
    try {
      if (kind === 'print') {
        await api.labReportPrint(session.token, billId)
        reload()
      } else {
        const filePath = await api.labReportPdf(session.token, billId)
        if (filePath) reload()
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Report failed')
    }
  }

  const b = work?.bill

  return (
    <Modal
      title={`Laboratory work — ${b?.bill_number ?? '…'}`}
      subtitle={b ? `Patient ${b.patient_name} (${b.patient_code}) · Visit ${b.visit_code} · ${b.bill_date}` : undefined}
      onClose={onClose}
      wide
    >
      {!work ? (
        <div className="flex items-center justify-center py-12 text-slate-400">
          <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Loading…
        </div>
      ) : (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-x-6 gap-y-1 rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm sm:grid-cols-4">
            <div><span className="text-slate-400">Patient ID:</span> <span className="font-mono text-xs">{b!.patient_code}</span></div>
            <div><span className="text-slate-400">Age / Sex:</span> {b!.age ?? '—'} / {b!.gender === 'MALE' ? 'Male' : b!.gender === 'FEMALE' ? 'Female' : 'Other'}</div>
            <div><span className="text-slate-400">Bill status:</span> <Badge tone={statusTone(b!.status)}>{statusLabel(b!.status)}</Badge></div>
            <div>
              <span className="text-slate-400">Category:</span>{' '}
              {b!.category === 'SELF' ? 'Self' : `Referred — ${b!.practitioner_name ?? ''}`}
            </div>
            {b!.patient_name_urdu && (
              <div className="urdu col-span-2 text-sm text-slate-600 sm:col-span-4">{b!.patient_name_urdu}</div>
            )}
          </div>

          <Alert kind="error" message={error} />

          {/* ------- samples ------- */}
          <div>
            <div className="mb-2 flex items-center justify-between">
              <h4 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-slate-500">
                <FlaskConical className="h-3.5 w-3.5" /> Samples
              </h4>
              {canManage && (
                <Button size="sm" variant="outline" onClick={() => setSampleModal('new')}>
                  <Plus className="h-3.5 w-3.5" /> New sample
                </Button>
              )}
            </div>
            <Table>
              <THead>
                <tr>
                  <TH>Sample</TH>
                  <TH>Type</TH>
                  <TH>Status</TH>
                  <TH>Collected</TH>
                  <TH>Technician</TH>
                  <TH>Notes</TH>
                  {canManage && <TH></TH>}
                </tr>
              </THead>
              <tbody>
                {work.samples.length === 0 && <EmptyRow colSpan={canManage ? 7 : 6}>No sample recorded yet.</EmptyRow>}
                {work.samples.map((s) => (
                  <TR key={s.id}>
                    <TD className="font-mono text-xs">{s.sample_code}</TD>
                    <TD>{s.sample_type ?? '—'}</TD>
                    <TD><Badge tone={sampleStatusTone(s.status)}>{sampleStatusLabel(s.status)}</Badge></TD>
                    <TD className="text-xs">{s.collected_at ?? '—'}</TD>
                    <TD className="text-xs">{s.assigned_technician_name ?? '—'}</TD>
                    <TD className="max-w-40 truncate text-xs text-slate-500" title={s.notes ?? ''}>{s.notes ?? '—'}</TD>
                    {canManage && (
                      <TD className="text-right">
                        <Button variant="outline" size="sm" onClick={() => setSampleModal(s)}>
                          <Pencil className="h-3 w-3" /> Update
                        </Button>
                      </TD>
                    )}
                  </TR>
                ))}
              </tbody>
            </Table>
          </div>

          {/* ------- tests / results ------- */}
          <div>
            <h4 className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-slate-500">
              <ClipboardList className="h-3.5 w-3.5" /> Tests &amp; results
            </h4>
            <Table>
              <THead>
                <tr>
                  <TH>Test</TH>
                  <TH>Status</TH>
                  <TH>Result</TH>
                  <TH>Sample</TH>
                  <TH>Staff</TH>
                  <TH className="text-right">Actions</TH>
                </tr>
              </THead>
              <tbody>
                {work.results.length === 0 && <EmptyRow colSpan={6}>No tests on this bill.</EmptyRow>}
                {work.results.map((r) => (
                  <TR key={r.bill_item_id}>
                    <TD>
                      <div className="font-medium">{r.test_name}</div>
                      <div className="font-mono text-xs text-slate-400">{r.test_code}</div>
                      {r.value && (
                        <div className="mt-0.5 text-xs">
                          <span className="font-semibold text-slate-900">{r.value}</span>
                          {r.unit && <span className="text-slate-500"> {r.unit}</span>}
                          {r.reference_range && <span className="text-slate-400"> (ref: {r.reference_range})</span>}
                        </div>
                      )}
                    </TD>
                    <TD>
                      <div className="flex flex-col items-start gap-1">
                        <Badge tone={testStatusTone(r.status)}>{testStatusLabel(r.status)}</Badge>
                        <Badge tone={resultStateTone(r.result_state)}>{resultStateLabel(r.result_state)}</Badge>
                      </div>
                    </TD>
                    <TD className="text-xs text-slate-500">
                      {r.revision_count > 0 && <div className="mb-1">Rev {r.revision_count}</div>}
                      {r.observations && <div title={r.observations}>Obs: {r.observations.slice(0, 40)}{r.observations.length > 40 ? '…' : ''}</div>}
                      {r.remarks && <div title={r.remarks}>Rem: {r.remarks.slice(0, 40)}{r.remarks.length > 40 ? '…' : ''}</div>}
                      {!r.observations && !r.remarks && r.revision_count === 0 && '—'}
                    </TD>
                    <TD className="font-mono text-xs">{r.sample_code ?? '—'}</TD>
                    <TD className="text-xs text-slate-500">
                      {r.entered_by_name && <div>Entered: {r.entered_by_name}</div>}
                      {r.verified_by_name && <div>Verified: {r.verified_by_name}</div>}
                      {r.approved_by_name && <div>Approved: {r.approved_by_name}</div>}
                      {!r.entered_by_name && !r.verified_by_name && !r.approved_by_name && '—'}
                    </TD>
                    <TD className="text-right">
                      <div className="flex flex-wrap justify-end gap-1">
                        {canManage && r.result_state === 'DRAFT' && r.status !== 'CANCELLED' && (
                          <Button size="sm" onClick={() => setResultFor(r)}>
                            {r.entered_at ? 'Edit result' : 'Enter result'}
                          </Button>
                        )}
                        {!canManage && (
                          <Button size="sm" variant="outline" onClick={() => setResultFor(r)}>View</Button>
                        )}
                        {r.revision_count > 0 && (
                          <Button size="sm" variant="ghost" title="Revision history" onClick={() => setRevisionsFor(r)}>
                            <History className="h-3.5 w-3.5" />
                          </Button>
                        )}
                        {canManage && r.status === 'PENDING' && (
                          <Button size="sm" variant="outline" disabled={busyItem === r.bill_item_id} onClick={() => runStatus(r, 'IN_PROGRESS')}>
                            Start
                          </Button>
                        )}
                        {canManage && r.status === 'IN_PROGRESS' && r.value && (
                          <Button size="sm" variant="outline" disabled={busyItem === r.bill_item_id} onClick={() => runStatus(r, 'COMPLETED')}>
                            Complete
                          </Button>
                        )}
                        {canApprove && r.result_state === 'DRAFT' && r.value && (
                          <Button size="sm" variant="outline" disabled={busyItem === r.bill_item_id} onClick={() => runStateAction(r, 'verify')}>
                            <ShieldCheck className="h-3.5 w-3.5" /> Verify
                          </Button>
                        )}
                        {canApprove && r.result_state === 'VERIFIED' && (
                          <Button size="sm" variant="outline" disabled={busyItem === r.bill_item_id} onClick={() => runStateAction(r, 'approve')}>
                            <ThumbsUp className="h-3.5 w-3.5" /> Approve
                          </Button>
                        )}
                        {canApprove && r.result_state !== 'DRAFT' && (
                          <Button size="sm" variant="ghost" title="Reset to draft" onClick={() => setReasonFor({ kind: 'reset-result', item: r })}>
                            <RotateCcw className="h-3.5 w-3.5" />
                          </Button>
                        )}
                        {canManage && (r.status === 'PENDING' || r.status === 'IN_PROGRESS') && (
                          <Button size="sm" variant="ghost" title="Cancel test" onClick={() => setReasonFor({ kind: 'cancel-test', item: r })}>
                            ✕
                          </Button>
                        )}
                      </div>
                    </TD>
                  </TR>
                ))}
              </tbody>
            </Table>
          </div>

          {/* ------- reports ------- */}
          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-200 pt-3">
            <div className="text-xs text-slate-500">
              {work.reports.length > 0
                ? `${work.reports.length} report${work.reports.length > 1 ? 's' : ''} issued — latest ${work.reports[0].report_code} (${work.reports[0].generated_at})`
                : 'No report issued yet.'}
            </div>
            <div className="flex gap-2">
              <Button variant="ghost" size="sm" onClick={() => setShowReports(true)} disabled={work.reports.length === 0}>
                <History className="h-4 w-4" /> History
              </Button>
              <Button variant="outline" size="sm" onClick={() => issueReport('pdf')}>
                <FileDown className="h-4 w-4" /> Save PDF
              </Button>
              <Button size="sm" onClick={() => issueReport('print')}>
                <Printer className="h-4 w-4" /> Print report (A4)
              </Button>
            </div>
          </div>
        </div>
      )}

      {resultFor && work && (
        <ResultEntryModal
          session={session}
          work={work}
          item={resultFor}
          onClose={() => setResultFor(null)}
          onSaved={() => {
            setResultFor(null)
            reload()
          }}
        />
      )}
      {sampleModal && work && (
        <SampleEntryModal
          session={session}
          work={work}
          sample={sampleModal === 'new' ? null : sampleModal}
          onClose={() => setSampleModal(null)}
          onSaved={() => {
            setSampleModal(null)
            reload()
          }}
        />
      )}
      {revisionsFor && (
        <RevisionsModal session={session} item={revisionsFor} onClose={() => setRevisionsFor(null)} />
      )}
      {reasonFor && (
        <ReasonModal
          title={reasonFor.kind === 'cancel-test' ? `Cancel test — ${reasonFor.item.test_name}` : `Reset result — ${reasonFor.item.test_name}`}
          label={
            reasonFor.kind === 'cancel-test'
              ? 'Why is this test being cancelled?'
              : 'Why is this result being reset to draft? It will require verification again.'
          }
          required
          onSubmit={(reason) => {
            const { kind, item } = reasonFor
            setReasonFor(null)
            if (kind === 'cancel-test') runStatus(item, 'CANCELLED', reason)
            else runStateAction(item, 'reset', reason)
          }}
          onClose={() => setReasonFor(null)}
        />
      )}
      {showReports && work && <ReportsModal work={work} onClose={() => setShowReports(false)} />}
    </Modal>
  )
}

// ------------------------------------------------------------------ result entry

function ResultEntryModal({
  session,
  work,
  item,
  onClose,
  onSaved
}: {
  session: SessionInfo
  work: LabBillWork
  item: LabResultView
  onClose: () => void
  onSaved: () => void
}) {
  const readOnly = item.result_state !== 'DRAFT'
  const [value, setValue] = useState(item.value ?? '')
  const [unit, setUnit] = useState(item.unit ?? item.default_unit ?? '')
  const [range, setRange] = useState(item.reference_range ?? item.default_reference_range ?? '')
  const [observations, setObservations] = useState(item.observations ?? '')
  const [remarks, setRemarks] = useState(item.remarks ?? '')
  const [sampleId, setSampleId] = useState<number | null>(item.sample_id)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [showHistory, setShowHistory] = useState(false)

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError('')
    try {
      await api.labSaveResult(session.token, {
        bill_item_id: item.bill_item_id,
        value,
        unit,
        reference_range: range,
        observations,
        remarks,
        sample_id: sampleId
      })
      onSaved()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed')
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <Modal
        title={`${readOnly ? 'Result —' : 'Enter result —'} ${item.test_name}`}
        subtitle={readOnly ? `${resultStateLabel(item.result_state)} · read-only (reset to draft to edit)` : 'Values are revision-tracked; every save is recorded.'}
        onClose={onClose}
        wide
      >
        <form onSubmit={onSubmit} className="grid gap-3 sm:grid-cols-2">
          <div>
            <Label>Result value *</Label>
            <Input
              required={!readOnly}
              value={value}
              onChange={(e) => setValue(e.target.value)}
              disabled={readOnly}
              placeholder="e.g. 7.2"
            />
          </div>
          <div>
            <Label>Unit</Label>
            <Input value={unit} onChange={(e) => setUnit(e.target.value)} disabled={readOnly} placeholder="e.g. mmol/L" />
          </div>
          <div>
            <Label>Reference range</Label>
            <Input value={range} onChange={(e) => setRange(e.target.value)} disabled={readOnly} placeholder="e.g. 4.4 – 6.1" />
          </div>
          <div>
            <Label>Sample</Label>
            <Select
              value={sampleId ?? ''}
              onChange={(e) => setSampleId(e.target.value === '' ? null : Number(e.target.value))}
              disabled={readOnly}
            >
              <option value="">— no sample linked —</option>
              {work.samples.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.sample_code} ({sampleStatusLabel(s.status)}{s.sample_type ? ` · ${s.sample_type}` : ''})
                </option>
              ))}
            </Select>
          </div>
          <div className="sm:col-span-2">
            <Label>Observations</Label>
            <Textarea rows={2} value={observations} onChange={(e) => setObservations(e.target.value)} disabled={readOnly} />
          </div>
          <div className="sm:col-span-2">
            <Label>Remarks</Label>
            <Textarea rows={2} value={remarks} onChange={(e) => setRemarks(e.target.value)} disabled={readOnly} />
          </div>
          <div className="sm:col-span-2">
            <Alert kind="error" message={error} />
            <div className="flex items-center justify-between">
              <Button type="button" variant="ghost" size="sm" onClick={() => setShowHistory(true)}>
                <History className="h-4 w-4" /> Revision history ({item.revision_count})
              </Button>
              <div className="flex gap-2">
                <Button type="button" variant="ghost" onClick={onClose}>{readOnly ? 'Close' : 'Cancel'}</Button>
                {!readOnly && (
                  <Button type="submit" disabled={busy}>
                    {busy && <Loader2 className="h-4 w-4 animate-spin" />} Save result
                  </Button>
                )}
              </div>
            </div>
          </div>
        </form>
      </Modal>
      {showHistory && <RevisionsModal session={session} item={item} onClose={() => setShowHistory(false)} />}
    </>
  )
}

// ------------------------------------------------------------------ samples

const NEXT_SAMPLE_STATUS: Partial<Record<SampleStatus, SampleStatus[]>> = {
  NOT_COLLECTED: ['COLLECTED', 'REJECTED'],
  COLLECTED: ['RECEIVED', 'REJECTED'],
  RECEIVED: ['PROCESSING', 'COMPLETED', 'REJECTED'],
  PROCESSING: ['COMPLETED', 'REJECTED'],
  REJECTED: ['NOT_COLLECTED'],
  COMPLETED: []
}

function SampleEntryModal({
  session,
  work,
  sample,
  onClose,
  onSaved
}: {
  session: SessionInfo
  work: LabBillWork
  sample: LabSampleView | null
  onClose: () => void
  onSaved: () => void
}) {
  const [technicians, setTechnicians] = useState<LabTechnician[]>([])
  const [sampleType, setSampleType] = useState(
    sample?.sample_type ??
      work.results.find((r) => (sample ? r.sample_id === sample.id : !r.sample_id))?.catalog_sample_type ??
      ''
  )
  const [status, setStatus] = useState<SampleStatus>(sample?.status ?? 'NOT_COLLECTED')
  const [collectedAt, setCollectedAt] = useState(toDatetimeLocal(sample?.collected_at))
  const [technicianId, setTechnicianId] = useState<number | null>(sample?.assigned_technician_id ?? null)
  const [notes, setNotes] = useState(sample?.notes ?? '')
  const [linkIds, setLinkIds] = useState<number[]>(
    sample ? work.results.filter((r) => r.sample_id === sample.id).map((r) => r.bill_item_id) : work.results.filter((r) => !r.sample_id && r.result_state === 'DRAFT').map((r) => r.bill_item_id)
  )
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    api.labTechnicians(session.token).then(setTechnicians).catch(() => undefined)
  }, [session.token])

  const statusOptions = useMemo(() => {
    if (sample) return [sample.status, ...(NEXT_SAMPLE_STATUS[sample.status] ?? [])]
    return (['NOT_COLLECTED', 'COLLECTED', 'RECEIVED', 'PROCESSING', 'REJECTED'] as SampleStatus[]).filter((s) => s !== 'COMPLETED')
  }, [sample])

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError('')
    try {
      if (sample) {
        await api.labUpdateSample(
          session.token,
          sample.id,
          {
            sample_type: sampleType,
            status,
            collected_at: fromDatetimeLocal(collectedAt),
            assigned_technician_id: technicianId,
            notes
          },
          notes.trim() || undefined
        )
      } else {
        await api.labCreateSample(session.token, {
          bill_id: work.bill.id,
          sample_type: sampleType,
          status,
          collected_at: fromDatetimeLocal(collectedAt),
          assigned_technician_id: technicianId,
          notes,
          link_item_ids: linkIds
        })
      }
      onSaved()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal
      title={sample ? `Update sample — ${sample.sample_code}` : 'Record new sample'}
      subtitle={sample ? undefined : `For bill ${work.bill.bill_number} · visit ${work.bill.visit_code}`}
      onClose={onClose}
    >
      <form onSubmit={onSubmit} className="grid gap-3 sm:grid-cols-2">
        <div>
          <Label>Sample type</Label>
          <Input value={sampleType} onChange={(e) => setSampleType(e.target.value)} placeholder="e.g. EDTA blood / Urine" />
        </div>
        <div>
          <Label>Status</Label>
          <Select value={status} onChange={(e) => setStatus(e.target.value as SampleStatus)}>
            {statusOptions.map((s) => (
              <option key={s} value={s}>{sampleStatusLabel(s)}</option>
            ))}
          </Select>
        </div>
        <div>
          <Label>Collection date &amp; time</Label>
          <Input type="datetime-local" value={collectedAt} onChange={(e) => setCollectedAt(e.target.value)} />
        </div>
        <div>
          <Label>Assigned technician</Label>
          <Select value={technicianId ?? ''} onChange={(e) => setTechnicianId(e.target.value === '' ? null : Number(e.target.value))}>
            <option value="">— unassigned —</option>
            {technicians.map((t) => (
              <option key={t.id} value={t.id}>{t.full_name}</option>
            ))}
          </Select>
        </div>
        <div className="sm:col-span-2">
          <Label>Notes {sample ? '(also saved as the change reason)' : ''}</Label>
          <Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
        </div>
        {!sample && (
          <div className="sm:col-span-2">
            <Label>Link tests to this sample</Label>
            <div className="space-y-1 rounded-md border border-slate-200 p-2">
              {work.results.filter((r) => r.status !== 'CANCELLED').map((r) => (
                <label key={r.bill_item_id} className="flex items-center gap-2 text-sm text-slate-700">
                  <input
                    type="checkbox"
                    checked={linkIds.includes(r.bill_item_id)}
                    onChange={(e) =>
                      setLinkIds((prev) => (e.target.checked ? [...prev, r.bill_item_id] : prev.filter((id) => id !== r.bill_item_id)))
                    }
                  />
                  {r.test_name} <span className="font-mono text-xs text-slate-400">{r.test_code}</span>
                </label>
              ))}
              {work.results.length === 0 && <div className="text-xs text-slate-400">No tests on this bill.</div>}
            </div>
          </div>
        )}
        <div className="sm:col-span-2">
          <Alert kind="error" message={error} />
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={busy}>
              {busy && <Loader2 className="h-4 w-4 animate-spin" />} {sample ? 'Save sample' : 'Record sample'}
            </Button>
          </div>
        </div>
      </form>
    </Modal>
  )
}

// ------------------------------------------------------------------ revisions

function RevisionsModal({ session, item, onClose }: { session: SessionInfo; item: LabResultView; onClose: () => void }) {
  const [rows, setRows] = useState<Awaited<ReturnType<typeof api.labRevisions>> | null>(null)

  useEffect(() => {
    api
      .labRevisions(session.token, item.bill_item_id)
      .then(setRows)
      .catch(() => setRows([]))
  }, [session.token, item.bill_item_id])

  return (
    <Modal title={`Revision history — ${item.test_name}`} subtitle="Every save of this result is recorded permanently (PRD §Module F)." onClose={onClose} wide>
      <Table>
        <THead>
          <tr>
            <TH>Rev</TH>
            <TH>Value</TH>
            <TH>Unit</TH>
            <TH>Reference range</TH>
            <TH>Observations</TH>
            <TH>Remarks</TH>
            <TH>By</TH>
            <TH>When</TH>
          </tr>
        </THead>
        <tbody>
          {rows === null && (
            <tr>
              <td colSpan={8} className="px-3 py-8 text-center text-slate-400"><Loader2 className="mr-2 inline h-4 w-4 animate-spin" />Loading…</td>
            </tr>
          )}
          {rows !== null && rows.length === 0 && <EmptyRow colSpan={8}>No revisions recorded yet.</EmptyRow>}
          {rows?.map((r) => (
            <TR key={r.id}>
              <TD className="font-mono text-xs">#{r.revision_no}</TD>
              <TD className="font-semibold">{r.value ?? '—'}</TD>
              <TD>{r.unit ?? '—'}</TD>
              <TD>{r.reference_range ?? '—'}</TD>
              <TD className="max-w-40 truncate text-xs" title={r.observations ?? ''}>{r.observations ?? '—'}</TD>
              <TD className="max-w-40 truncate text-xs" title={r.remarks ?? ''}>{r.remarks ?? '—'}</TD>
              <TD className="text-xs">{r.changed_by_name ?? '—'}</TD>
              <TD className="text-xs">{r.changed_at}</TD>
            </TR>
          ))}
        </tbody>
      </Table>
    </Modal>
  )
}

// ------------------------------------------------------------------ reports

function ReportsModal({ work, onClose }: { work: LabBillWork; onClose: () => void }) {
  return (
    <Modal title="Report history" subtitle={`All reports issued for bill ${work.bill.bill_number}`} onClose={onClose} wide>
      <Table>
        <THead>
          <tr>
            <TH>Report No</TH>
            <TH>Kind</TH>
            <TH>Issued by</TH>
            <TH>When</TH>
            <TH>File</TH>
          </tr>
        </THead>
        <tbody>
          {work.reports.length === 0 && <EmptyRow colSpan={5}>No reports issued yet.</EmptyRow>}
          {work.reports.map((r) => (
            <TR key={r.id}>
              <TD className="font-mono text-xs">{r.report_code}</TD>
              <TD><Badge tone={r.kind === 'PDF' ? 'info' : 'neutral'}>{r.kind === 'PDF' ? 'PDF export' : 'Printed'}</Badge></TD>
              <TD className="text-xs">{r.generated_by_name ?? '—'}</TD>
              <TD className="text-xs">{r.generated_at}</TD>
              <TD className="max-w-48 truncate font-mono text-xs text-slate-400" title={r.file_path ?? ''}>{r.file_path ?? '—'}</TD>
            </TR>
          ))}
        </tbody>
      </Table>
    </Modal>
  )
}

// ------------------------------------------------------------------ generic reason prompt

export function ReasonModal({
  title,
  label,
  onSubmit,
  onClose,
  required
}: {
  title: string
  label: string
  onSubmit: (reason: string) => void
  onClose: () => void
  required?: boolean
}) {
  const [reason, setReason] = useState('')
  const [touched, setTouched] = useState(false)
  const invalid = required !== false && reason.trim().length < 3

  function submit(e: FormEvent) {
    e.preventDefault()
    if (invalid) {
      setTouched(true)
      return
    }
    onSubmit(reason.trim())
  }

  return (
    <Modal title={title} onClose={onClose}>
      <form onSubmit={submit} className="space-y-3">
        <div>
          <Label>{label}</Label>
          <Textarea autoFocus rows={3} value={reason} onChange={(e) => setReason(e.target.value)} />
          {touched && invalid && <p className="mt-1 text-xs text-red-600">A reason of at least 3 characters is required.</p>}
        </div>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onClose}>Cancel</Button>
          <Button type="submit">Confirm</Button>
        </div>
      </form>
    </Modal>
  )
}

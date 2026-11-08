import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { ArrowLeft, ReceiptText, Wallet, Loader2, Pencil, FlaskConical } from 'lucide-react'
import type { Patient, PatientLabHistoryRow, PatientProfile, SessionInfo } from '../../../shared/api-types'
import { api } from '../api'
import { formatPKR } from '../../../shared/money'
import { Badge } from '../components/ui/badge'
import { Button } from '../components/ui/button'
import { Card, CardContent } from '../components/ui/card'
import { Input } from '../components/ui/input'
import { Label } from '../components/ui/label'
import { Select } from '../components/ui/select'
import { Modal } from '../components/ui/modal'
import { Table, THead, TH, TD, TR, EmptyRow } from '../components/ui/table'
import { Alert } from '../components/ui/alert'
import { LabWorkModal } from '../components/LabWork'
import { methodLabel, resultStateLabel, resultStateTone, statusLabel, statusTone, testStatusLabel, testStatusTone } from '../lib/format'

interface PatientProfilePageProps {
  session: SessionInfo
  patientId: number
  onBack: () => void
  onNewBill: (patientId: number) => void
  onOpenBill: (billId: number) => void
}

export function PatientProfilePage({ session, patientId, onBack, onNewBill, onOpenBill }: PatientProfilePageProps) {
  const [profile, setProfile] = useState<PatientProfile | null>(null)
  const [labHistory, setLabHistory] = useState<PatientLabHistoryRow[] | null>(null)
  const [error, setError] = useState('')
  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [openLabBillId, setOpenLabBillId] = useState<number | null>(null)
  const canViewLab = session.user.permissions.includes('test_results.view')

  const load = useCallback(() => {
    api
      .patientsGet(session.token, patientId)
      .then((p) => (setProfile(p), setError('')))
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed to load patient'))
  }, [session.token, patientId])

  useEffect(load, [load])

  useEffect(() => {
    if (!canViewLab) return
    api
      .labPatientHistory(session.token, patientId)
      .then(setLabHistory)
      .catch(() => setLabHistory([]))
  }, [session.token, patientId, canViewLab])

  if (error) {
    return (
      <div className="space-y-3">
        <Button variant="ghost" size="sm" onClick={onBack}>
          <ArrowLeft className="h-4 w-4" /> Back
        </Button>
        <Alert kind="error" message={error} />
      </div>
    )
  }
  if (!profile) {
    return (
      <div className="flex items-center justify-center py-20 text-slate-400">
        <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Loading patient…
      </div>
    )
  }

  const p = profile.patient
  const canManage = session.user.permissions.includes('patients.manage')
  const canBill = session.user.permissions.includes('billing.manage')

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Button variant="ghost" size="sm" onClick={onBack}>
          <ArrowLeft className="h-4 w-4" /> Back to patients
        </Button>
        <div className="flex gap-2">
          {canManage && (
            <Button variant="outline" size="sm" onClick={() => setEditing(true)}>
              <Pencil className="h-3.5 w-3.5" /> Edit
            </Button>
          )}
          {canBill && (
            <Button size="sm" onClick={() => onNewBill(p.id)}>
              <ReceiptText className="h-3.5 w-3.5" /> New bill
            </Button>
          )}
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-3">
        <Card className="md:col-span-2">
          <CardContent className="pt-4">
            <div className="flex items-start justify-between">
              <div>
                <div className="text-base font-semibold text-slate-900">{p.full_name}</div>
                {p.full_name_urdu && <div className="urdu text-sm text-slate-500">{p.full_name_urdu}</div>}
                <div className="mt-1 font-mono text-xs text-slate-500">{p.patient_code}</div>
              </div>
              <Badge tone="neutral">Registered {p.created_at.slice(0, 10)}</Badge>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-x-6 gap-y-1 text-sm text-slate-600 sm:grid-cols-3">
              <div><span className="text-slate-400">Age:</span> {p.age ?? '—'}</div>
              <div><span className="text-slate-400">Gender:</span> {p.gender === 'MALE' ? 'Male' : p.gender === 'FEMALE' ? 'Female' : 'Other'}</div>
              <div><span className="text-slate-400">Phone:</span> {p.phone ?? '—'}</div>
              {p.address && <div className="col-span-2 sm:col-span-3"><span className="text-slate-400">Address:</span> {p.address}</div>}
              {p.notes && <div className="col-span-2 sm:col-span-3"><span className="text-slate-400">Notes:</span> {p.notes}</div>}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-slate-500">
              <Wallet className="h-3.5 w-3.5" /> Financial summary
            </div>
            <div className="mt-2 space-y-1.5 text-sm">
              <div className="flex justify-between"><span className="text-slate-500">Total billed</span><span className="font-medium">{formatPKR(profile.totals.billedPaisa)}</span></div>
              <div className="flex justify-between"><span className="text-slate-500">Total paid</span><span className="font-medium text-emerald-700">{formatPKR(profile.totals.paidPaisa)}</span></div>
              <div className="flex justify-between border-t border-slate-100 pt-1.5">
                <span className="text-slate-500">Outstanding</span>
                <span className={`font-semibold ${profile.totals.outstandingPaisa > 0 ? 'text-red-700' : 'text-slate-900'}`}>
                  {formatPKR(profile.totals.outstandingPaisa)}
                </span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <div>
        <h2 className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-500">Visits & bills</h2>
        <Table>
          <THead>
            <tr>
              <TH>Visit</TH>
              <TH>Date</TH>
              <TH>Category</TH>
              <TH>Bill</TH>
              <TH className="text-right">Net</TH>
              <TH className="text-right">Paid</TH>
              <TH className="text-right">Balance</TH>
              <TH>Status</TH>
              <TH></TH>
            </tr>
          </THead>
          <tbody>
            {profile.visits.length === 0 && <EmptyRow colSpan={9}>No visits yet.</EmptyRow>}
            {profile.visits.flatMap((v) =>
              v.bills.length === 0
                ? [
                    <TR key={`v-${v.id}`}>
                      <TD className="font-mono text-xs">{v.visit_code}</TD>
                      <TD>{v.visit_date}</TD>
                      <TD>{v.category === 'SELF' ? 'Self' : `Referred — ${v.practitioner_name ?? ''}`}</TD>
                      <TD colSpan={5} className="text-slate-400">No bill on this visit</TD>
                      <TD />
                    </TR>
                  ]
                : v.bills.map((b) => (
                    <TR key={`${v.id}-${b.bill_id}`}>
                      <TD className="font-mono text-xs">{v.visit_code}</TD>
                      <TD>{v.visit_date}</TD>
                      <TD>{v.category === 'SELF' ? 'Self' : `Referred — ${v.practitioner_name ?? ''}`}</TD>
                      <TD className="font-mono text-xs">{b.bill_number}</TD>
                      <TD className="text-right">{formatPKR(b.net_paisa)}</TD>
                      <TD className="text-right">{formatPKR(b.paid_paisa)}</TD>
                      <TD className="text-right">{formatPKR(b.outstanding_paisa)}</TD>
                      <TD><Badge tone={statusTone(b.status)}>{statusLabel(b.status)}</Badge></TD>
                      <TD className="text-right">
                        <Button variant="outline" size="sm" onClick={() => onOpenBill(b.bill_id)}>View</Button>
                      </TD>
                    </TR>
                  ))
            )}
          </tbody>
        </Table>
      </div>

      <div>
        <h2 className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-500">Payment history</h2>
        <Table>
          <THead>
            <tr>
              <TH>Receipt (transaction)</TH>
              <TH>Bill</TH>
              <TH className="text-right">Amount</TH>
              <TH>Method</TH>
              <TH>When</TH>
            </tr>
          </THead>
          <tbody>
            {profile.payments.length === 0 && <EmptyRow colSpan={5}>No payments recorded.</EmptyRow>}
            {profile.payments.map((pay) => (
              <TR key={pay.id}>
                <TD className="font-mono text-xs">{pay.transaction_id}</TD>
                <TD className="font-mono text-xs">{pay.bill_number}</TD>
                <TD className="text-right font-medium">{formatPKR(pay.amount_paisa)}</TD>
                <TD>{methodLabel(pay.method)}</TD>
                <TD>{pay.paid_at}</TD>
              </TR>
            ))}
          </tbody>
        </Table>
      </div>

      {canViewLab && (
        <div>
          <h2 className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-slate-500">
            <FlaskConical className="h-3.5 w-3.5" /> Test history
          </h2>
          <Table>
            <THead>
              <tr>
                <TH>Date</TH>
                <TH>Bill / Visit</TH>
                <TH>Test</TH>
                <TH>Status</TH>
                <TH>Result</TH>
                <TH>Sample</TH>
                <TH>Report</TH>
                <TH></TH>
              </tr>
            </THead>
            <tbody>
              {labHistory === null && (
                <tr>
                  <td colSpan={8} className="px-3 py-8 text-center text-slate-400">
                    <Loader2 className="mr-2 inline h-4 w-4 animate-spin" /> Loading test history…
                  </td>
                </tr>
              )}
              {labHistory !== null && labHistory.length === 0 && <EmptyRow colSpan={8}>No laboratory tests yet.</EmptyRow>}
              {labHistory?.map((row, i) => (
                <TR key={`${row.bill_id}-${row.test_code}-${i}`}>
                  <TD className="text-xs">{row.bill_date}</TD>
                  <TD className="font-mono text-xs">{row.bill_number}<br /><span className="text-slate-400">{row.visit_code}</span></TD>
                  <TD>
                    <div className="font-medium">{row.test_name}</div>
                    <div className="font-mono text-xs text-slate-400">{row.test_code}</div>
                  </TD>
                  <TD>
                    <div className="flex flex-col items-start gap-1">
                      <Badge tone={testStatusTone(row.status)}>{testStatusLabel(row.status)}</Badge>
                      <Badge tone={resultStateTone(row.result_state)}>{resultStateLabel(row.result_state)}</Badge>
                    </div>
                  </TD>
                  <TD>
                    {row.value ? (
                      <span className="font-semibold">{row.value}{row.unit ? ` ${row.unit}` : ''}</span>
                    ) : (
                      <span className="text-slate-400">—</span>
                    )}
                  </TD>
                  <TD className="font-mono text-xs">{row.sample_code ?? '—'}</TD>
                  <TD className="font-mono text-xs">{row.latest_report_code ?? '—'}</TD>
                  <TD className="text-right">
                    <Button size="sm" variant="outline" onClick={() => setOpenLabBillId(row.bill_id)}>
                      Open
                    </Button>
                  </TD>
                </TR>
              ))}
            </tbody>
          </Table>
        </div>
      )}

      {editing && (
        <EditPatientModal
          session={session}
          patient={p}
          onClose={() => setEditing(false)}
          onSaved={() => {
            setEditing(false)
            load()
          }}
          saving={saving}
          setSaving={setSaving}
        />
      )}

      {openLabBillId !== null && (
        <LabWorkModal session={session} billId={openLabBillId} onClose={() => setOpenLabBillId(null)} />
      )}
    </div>
  )
}

function EditPatientModal({
  session,
  patient,
  onClose,
  onSaved,
  saving,
  setSaving
}: {
  session: SessionInfo
  patient: Patient
  onClose: () => void
  onSaved: () => void
  saving: boolean
  setSaving: (v: boolean) => void
}) {
  const [fullName, setFullName] = useState(patient.full_name)
  const [fullNameUrdu, setFullNameUrdu] = useState(patient.full_name_urdu ?? '')
  const [age, setAge] = useState(patient.age?.toString() ?? '')
  const [gender, setGender] = useState(patient.gender)
  const [phone, setPhone] = useState(patient.phone ?? '')
  const [address, setAddress] = useState(patient.address ?? '')
  const [notes, setNotes] = useState(patient.notes ?? '')
  const [error, setError] = useState('')

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setError('')
    setSaving(true)
    try {
      await api.patientsUpdate(session.token, patient.id, {
        full_name: fullName,
        full_name_urdu: fullNameUrdu,
        age: age.trim() === '' ? null : Number(age),
        gender,
        phone,
        address,
        notes
      })
      onSaved()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Update failed')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal title={`Edit patient — ${patient.patient_code}`} onClose={onClose} wide>
      <form onSubmit={onSubmit} className="grid gap-3 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <Label>Name (English) *</Label>
          <Input required value={fullName} onChange={(e) => setFullName(e.target.value)} />
        </div>
        <div className="sm:col-span-2">
          <Label>Name (Urdu)</Label>
          <Input className="urdu" dir="rtl" value={fullNameUrdu} onChange={(e) => setFullNameUrdu(e.target.value)} />
        </div>
        <div>
          <Label>Age</Label>
          <Input type="number" min={0} max={150} value={age} onChange={(e) => setAge(e.target.value)} />
        </div>
        <div>
          <Label>Gender</Label>
          <Select value={gender} onChange={(e) => setGender(e.target.value as typeof gender)}>
            <option value="MALE">Male</option>
            <option value="FEMALE">Female</option>
            <option value="OTHER">Other</option>
          </Select>
        </div>
        <div>
          <Label>Phone</Label>
          <Input value={phone} onChange={(e) => setPhone(e.target.value)} />
        </div>
        <div>
          <Label>Address</Label>
          <Input value={address} onChange={(e) => setAddress(e.target.value)} />
        </div>
        <div className="sm:col-span-2">
          <Label>Notes</Label>
          <Input value={notes} onChange={(e) => setNotes(e.target.value)} />
        </div>
        <div className="sm:col-span-2">
          <Alert kind="error" message={error} />
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={saving}>
              {saving && <Loader2 className="h-4 w-4 animate-spin" />} Save changes
            </Button>
          </div>
        </div>
      </form>
    </Modal>
  )
}

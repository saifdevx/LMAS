import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { ArrowLeft, Loader2, Percent, Plus, Power } from 'lucide-react'
import type { Practitioner, PractitionerAccount, SessionInfo } from '../../../shared/api-types'
import { api } from '../api'
import { formatPKR } from '../../../shared/money'
import { Alert } from '../components/ui/alert'
import { Badge } from '../components/ui/badge'
import { Button } from '../components/ui/button'
import { Input } from '../components/ui/input'
import { Label } from '../components/ui/label'
import { Modal } from '../components/ui/modal'
import { Table, THead, TH, TD, TR, EmptyRow } from '../components/ui/table'
import { methodLabel } from '../lib/format'

interface PractitionersPageProps {
  session: SessionInfo
}

export function PractitionersPage({ session }: PractitionersPageProps) {
  const [includeInactive, setIncludeInactive] = useState(true)
  const [rows, setRows] = useState<Practitioner[] | null>(null)
  const [error, setError] = useState('')
  const [editing, setEditing] = useState<Practitioner | 'new' | null>(null)
  const [rateChange, setRateChange] = useState<Practitioner | null>(null)
  const [account, setAccount] = useState<number | null>(null)
  const canManage = session.user.permissions.includes('practitioners.manage')

  const load = useCallback(() => {
    api
      .practitionersList(session.token, includeInactive)
      .then((r) => (setRows(r), setError('')))
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed to load practitioners'))
  }, [session.token, includeInactive])

  useEffect(load, [load])

  async function toggleActive(p: Practitioner) {
    try {
      await api.practitionersSetActive(session.token, p.id, !p.is_active)
      load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed')
    }
  }

  if (account !== null) {
    return <PractitionerAccountView session={session} practitionerId={account} onBack={() => { setAccount(null); load() }} />
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-lg font-bold text-slate-900">Practitioners</h1>
          <p className="text-xs text-slate-500">Doctors and clinics that refer patients. Commission rates are snapshotted onto each bill.</p>
        </div>
        {canManage && (
          <Button onClick={() => setEditing('new')}>
            <Plus className="h-4 w-4" /> Add practitioner
          </Button>
        )}
      </div>

      <label className="flex items-center gap-2 text-sm text-slate-600">
        <input type="checkbox" checked={includeInactive} onChange={(e) => setIncludeInactive(e.target.checked)} />
        Show inactive
      </label>

      <Alert kind="error" message={error} />

      {rows === null ? (
        <div className="flex items-center justify-center py-16 text-slate-400">
          <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Loading…
        </div>
      ) : (
        <Table>
          <THead>
            <tr>
              <TH>Code</TH>
              <TH>Name</TH>
              <TH>Clinic</TH>
              <TH>Phone</TH>
              <TH className="text-right">Rate</TH>
              <TH>Status</TH>
              <TH></TH>
            </tr>
          </THead>
          <tbody>
            {rows.length === 0 && <EmptyRow colSpan={7}>No practitioners yet.</EmptyRow>}
            {rows.map((p) => (
              <TR key={p.id}>
                <TD className="font-mono text-xs">{p.practitioner_code}</TD>
                <TD className="font-medium">{p.name}</TD>
                <TD>{p.clinic_name ?? '—'}</TD>
                <TD>{p.phone ?? '—'}</TD>
                <TD className="text-right">{(p.commission_rate_bp / 100).toFixed(1)}%</TD>
                <TD>{p.is_active ? <Badge tone="success">Active</Badge> : <Badge tone="danger">Inactive</Badge>}</TD>
                <TD className="text-right">
                  <div className="flex justify-end gap-1">
                    <Button variant="outline" size="sm" onClick={() => setAccount(p.id)}>Account</Button>
                    {canManage && (
                      <>
                        <Button variant="outline" size="sm" onClick={() => setEditing(p)}>Edit</Button>
                        {p.is_active && (
                          <Button variant="outline" size="sm" onClick={() => setRateChange(p)} title="Change commission rate">
                            <Percent className="h-3.5 w-3.5" />
                          </Button>
                        )}
                        <Button variant="ghost" size="sm" onClick={() => void toggleActive(p)} title={p.is_active ? 'Deactivate' : 'Activate'}>
                          <Power className={`h-3.5 w-3.5 ${p.is_active ? 'text-red-500' : 'text-emerald-600'}`} />
                        </Button>
                      </>
                    )}
                  </div>
                </TD>
              </TR>
            ))}
          </tbody>
        </Table>
      )}

      {editing && (
        <PractitionerFormModal
          session={session}
          practitioner={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null)
            load()
          }}
        />
      )}
      {rateChange && (
        <RateChangeModal
          session={session}
          practitioner={rateChange}
          onClose={() => setRateChange(null)}
          onSaved={() => {
            setRateChange(null)
            load()
          }}
        />
      )}
    </div>
  )
}

function PractitionerFormModal({
  session,
  practitioner,
  onClose,
  onSaved
}: {
  session: SessionInfo
  practitioner: Practitioner | null
  onClose: () => void
  onSaved: () => void
}) {
  const [name, setName] = useState(practitioner?.name ?? '')
  const [clinic, setClinic] = useState(practitioner?.clinic_name ?? '')
  const [phone, setPhone] = useState(practitioner?.phone ?? '')
  const [address, setAddress] = useState(practitioner?.address ?? '')
  const [ratePercent, setRatePercent] = useState(practitioner ? (practitioner.commission_rate_bp / 100).toString() : '50')
  const [notes, setNotes] = useState(practitioner?.notes ?? '')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setError('')
    setBusy(true)
    const rateBp = Math.round(Number(ratePercent) * 100)
    try {
      if (practitioner) {
        await api.practitionersUpdate(session.token, practitioner.id, {
          name,
          clinic_name: clinic,
          phone,
          address,
          notes
        })
      } else {
        await api.practitionersCreate(session.token, {
          name,
          clinic_name: clinic,
          phone,
          address,
          commission_rate_bp: rateBp,
          notes
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
    <Modal title={practitioner ? `Edit practitioner — ${practitioner.practitioner_code}` : 'Add practitioner'} onClose={onClose} wide>
      <form onSubmit={onSubmit} className="grid gap-3 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <Label>Doctor / practitioner name *</Label>
          <Input required value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Dr. Ahmed Raza" />
        </div>
        <div>
          <Label>Clinic name</Label>
          <Input value={clinic} onChange={(e) => setClinic(e.target.value)} />
        </div>
        <div>
          <Label>Contact number</Label>
          <Input value={phone} onChange={(e) => setPhone(e.target.value)} />
        </div>
        <div>
          <Label>Address</Label>
          <Input value={address} onChange={(e) => setAddress(e.target.value)} />
        </div>
        {practitioner ? (
          <div className="flex items-end pb-2 text-xs text-slate-500">
            Current rate {(practitioner.commission_rate_bp / 100).toFixed(1)}% — change it from the % button so a reason is recorded.
          </div>
        ) : (
          <div>
            <Label>Commission rate (%) *</Label>
            <Input required type="number" min={0} max={100} step="0.5" value={ratePercent} onChange={(e) => setRatePercent(e.target.value)} />
          </div>
        )}
        <div className="sm:col-span-2">
          <Label>Notes</Label>
          <Input value={notes} onChange={(e) => setNotes(e.target.value)} />
        </div>
        <div className="sm:col-span-2">
          <Alert kind="error" message={error} />
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={busy}>
              {busy && <Loader2 className="h-4 w-4 animate-spin" />} {practitioner ? 'Save changes' : 'Add practitioner'}
            </Button>
          </div>
        </div>
      </form>
    </Modal>
  )
}

function RateChangeModal({
  session,
  practitioner,
  onClose,
  onSaved
}: {
  session: SessionInfo
  practitioner: Practitioner
  onClose: () => void
  onSaved: () => void
}) {
  const [ratePercent, setRatePercent] = useState((practitioner.commission_rate_bp / 100).toString())
  const [reason, setReason] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError('')
    try {
      await api.practitionersUpdateRate(session.token, practitioner.id, Math.round(Number(ratePercent) * 100), reason)
      onSaved()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Rate change failed')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal title={`Change commission rate — ${practitioner.name}`} subtitle={`Current rate: ${(practitioner.commission_rate_bp / 100).toFixed(1)}%. Historical bills keep their original rate.`} onClose={onClose}>
      <form onSubmit={onSubmit} className="space-y-3">
        <div>
          <Label>New rate (%) *</Label>
          <Input required type="number" min={0} max={100} step="0.5" value={ratePercent} onChange={(e) => setRatePercent(e.target.value)} />
        </div>
        <div>
          <Label>Reason for change *</Label>
          <Input required value={reason} onChange={(e) => setReason(e.target.value)} placeholder="recorded in the rate history" />
        </div>
        <Alert kind="error" message={error} />
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onClose}>Cancel</Button>
          <Button type="submit" disabled={busy}>
            {busy && <Loader2 className="h-4 w-4 animate-spin" />} Update rate
          </Button>
        </div>
      </form>
    </Modal>
  )
}

function PractitionerAccountView({
  session,
  practitionerId,
  onBack
}: {
  session: SessionInfo
  practitionerId: number
  onBack: () => void
}) {
  const [account, setAccount] = useState<PractitionerAccount | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    api
      .practitionersAccount(session.token, practitionerId)
      .then(setAccount)
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed to load account'))
  }, [session.token, practitionerId])

  return (
    <div className="space-y-4">
      <Button variant="ghost" size="sm" onClick={onBack}>
        <ArrowLeft className="h-4 w-4" /> Back to practitioners
      </Button>
      {error && <Alert kind="error" message={error} />}
      {!account ? (
        <div className="flex items-center justify-center py-16 text-slate-400">
          <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Loading account…
        </div>
      ) : (
        <>
          <div>
            <h1 className="text-lg font-bold text-slate-900">{account.practitioner.name}</h1>
            <p className="text-xs text-slate-500">
              {account.practitioner.practitioner_code} · {account.practitioner.clinic_name ?? 'Independent'} · current rate {(account.practitioner.commission_rate_bp / 100).toFixed(1)}%
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
            <Stat label="Referred visits" value={account.totals.referredVisits} />
            <Stat label="Referred bills" value={account.totals.bills} />
            <Stat label="Eligible revenue" value={formatPKR(account.totals.eligiblePaisa)} />
            <Stat label="Commission accrued" value={formatPKR(account.totals.accruedPaisa)} tone="text-amber-700" />
            <Stat label="Outstanding commission" value={formatPKR(account.totals.outstandingPaisa)} tone={account.totals.outstandingPaisa > 0 ? 'text-red-700' : undefined} />
          </div>

          <p className="text-xs text-slate-400">
            Commission payments to practitioners (settling this outstanding balance) arrive with the Commission Management module in Checkpoint 4.
          </p>

          <div>
            <h2 className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-500">Commission ledger (latest)</h2>
            <Table>
              <THead>
                <tr>
                  <TH>Bill</TH>
                  <TH>Type</TH>
                  <TH>Basis</TH>
                  <TH className="text-right">Rate</TH>
                  <TH className="text-right">Eligible</TH>
                  <TH className="text-right">Commission</TH>
                  <TH>When</TH>
                </tr>
              </THead>
              <tbody>
                {account.entries.length === 0 && <EmptyRow colSpan={7}>No commission entries yet.</EmptyRow>}
                {account.entries.map((e) => (
                  <TR key={e.id}>
                    <TD className="font-mono text-xs">{e.bill_number}</TD>
                    <TD>
                      <Badge tone={e.entry_type === 'REVERSAL' ? 'danger' : e.entry_type === 'ACCRUAL' ? 'info' : 'warning'}>{e.entry_type}</Badge>
                    </TD>
                    <TD>{e.basis === 'COLLECTED' ? 'Collected' : 'Net bill'}</TD>
                    <TD className="text-right">{(e.rate_bp / 100).toFixed(1)}%</TD>
                    <TD className="text-right">{formatPKR(e.eligible_paisa)}</TD>
                    <TD className={`text-right font-medium ${e.commission_paisa < 0 ? 'text-red-700' : ''}`}>{formatPKR(e.commission_paisa)}</TD>
                    <TD>{e.created_at}</TD>
                  </TR>
                ))}
              </tbody>
            </Table>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <div>
              <h2 className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-500">Commission payments</h2>
              <Table>
                <THead>
                  <tr>
                    <TH>Transaction</TH>
                    <TH className="text-right">Amount</TH>
                    <TH>Method</TH>
                    <TH>When</TH>
                  </tr>
                </THead>
                <tbody>
                  {account.payments.length === 0 && <EmptyRow colSpan={4}>No payments recorded.</EmptyRow>}
                  {account.payments.map((p) => (
                    <TR key={p.id}>
                      <TD className="font-mono text-xs">{p.transaction_id.slice(0, 13)}…</TD>
                      <TD className="text-right font-medium">{formatPKR(p.amount_paisa)}</TD>
                      <TD>{methodLabel(p.method)}</TD>
                      <TD>{p.paid_at}</TD>
                    </TR>
                  ))}
                </tbody>
              </Table>
            </div>
            <div>
              <h2 className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-500">Rate history</h2>
              <Table>
                <THead>
                  <tr>
                    <TH className="text-right">Rate</TH>
                    <TH>Effective from</TH>
                    <TH>Changed by</TH>
                    <TH>Reason</TH>
                  </tr>
                </THead>
                <tbody>
                  {account.rateHistory.length === 0 && <EmptyRow colSpan={4}>No history.</EmptyRow>}
                  {account.rateHistory.map((h) => (
                    <TR key={h.id}>
                      <TD className="text-right font-medium">{(h.rate_bp / 100).toFixed(1)}%</TD>
                      <TD>{h.effective_from}</TD>
                      <TD>{h.changed_by_name ?? '—'}</TD>
                      <TD>{h.reason ?? '—'}</TD>
                    </TR>
                  ))}
                </tbody>
              </Table>
            </div>
          </div>
        </>
      )}
    </div>
  )
}

function Stat({ label, value, tone }: { label: string; value: string | number; tone?: string }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-3 shadow-sm">
      <div className="text-[11px] font-medium text-slate-500">{label}</div>
      <div className={`mt-0.5 text-lg font-semibold ${tone ?? 'text-slate-900'}`}>{value}</div>
    </div>
  )
}

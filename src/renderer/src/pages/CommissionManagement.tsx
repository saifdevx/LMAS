import { useCallback, useEffect, useState } from 'react'
import { HandCoins, Loader2 } from 'lucide-react'
import type { CommissionAccountRow, CommissionLedger, SessionInfo } from '../../../shared/api-types'
import { api } from '../api'
import { formatPKR } from '../../../shared/money'
import { Badge } from '../components/ui/badge'
import { Button } from '../components/ui/button'
import { Input } from '../components/ui/input'
import { Label } from '../components/ui/label'
import { Modal } from '../components/ui/modal'
import { Select } from '../components/ui/select'
import { Table, THead, TH, TD, TR, EmptyRow } from '../components/ui/table'
import { bpToPercent } from '../../../shared/commission'
import { methodLabel } from '../lib/format'

interface CommissionPageProps {
  session: SessionInfo
}

/**
 * Commission Management (PRD §Module G, CP4): per-practitioner ledger with
 * accrued / paid / outstanding, and commission payments that never exceed
 * the outstanding balance.
 */
export function CommissionManagementPage({ session }: CommissionPageProps) {
  const [accounts, setAccounts] = useState<CommissionAccountRow[] | null>(null)
  const [error, setError] = useState('')
  const [ledger, setLedger] = useState<CommissionLedger | null>(null)
  const [payFor, setPayFor] = useState<CommissionAccountRow | null>(null)

  const canManage = session.user.permissions.includes('commissions.manage')

  const load = useCallback(() => {
    api
      .commissionAccounts(session.token, true)
      .then((r) => (setAccounts(r), setError('')))
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed to load commission accounts'))
  }, [session.token])

  useEffect(load, [load])

  const openLedger = (id: number) => {
    api
      .commissionLedger(session.token, id)
      .then(setLedger)
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed to load ledger'))
  }

  const totals = (accounts ?? []).reduce(
    (acc, a) => ({ accrued: acc.accrued + a.accrued_paisa, paid: acc.paid + a.paid_paisa, outstanding: acc.outstanding + a.outstanding_paisa }),
    { accrued: 0, paid: 0, outstanding: 0 }
  )

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-lg font-bold text-slate-900">Commission management</h1>
        <p className="text-xs text-slate-500">
          Practitioner commission ledger. Outstanding = accrued − paid; payments can never exceed the outstanding amount.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <StatCard label="Commission accrued" value={formatPKR(totals.accrued)} />
        <StatCard label="Commission paid" value={formatPKR(totals.paid)} tone="success" />
        <StatCard label="Outstanding commission" value={formatPKR(totals.outstanding)} tone="warning" />
      </div>

      {error && <div className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 ring-1 ring-inset ring-red-200">{error}</div>}

      {accounts === null ? (
        <Loading />
      ) : (
        <Table>
          <THead>
            <tr>
              <TH>Code</TH>
              <TH>Practitioner</TH>
              <TH className="text-right">Rate</TH>
              <TH className="text-right">Accrued</TH>
              <TH className="text-right">Paid</TH>
              <TH className="text-right">Outstanding</TH>
              <TH>Status</TH>
              <TH />
            </tr>
          </THead>
          <tbody>
            {accounts.length === 0 && (
              <EmptyRow colSpan={8}>No commission activity yet — accruals appear as referred bills are finalized.</EmptyRow>
            )}
            {accounts.map((a) => (
              <TR key={a.practitioner_id}>
                <TD className="font-mono text-xs">{a.practitioner_code}</TD>
                <TD>
                  <div className="font-medium text-slate-900">{a.name}</div>
                  {a.clinic_name && <div className="text-xs text-slate-500">{a.clinic_name}</div>}
                </TD>
                <TD className="text-right">{bpToPercent(a.commission_rate_bp)}%</TD>
                <TD className="text-right tabular-nums">{formatPKR(a.accrued_paisa)}</TD>
                <TD className="text-right tabular-nums">{formatPKR(a.paid_paisa)}</TD>
                <TD className="text-right font-semibold tabular-nums">{formatPKR(a.outstanding_paisa)}</TD>
                <TD>
                  <Badge tone={a.is_active ? 'success' : 'neutral'}>{a.is_active ? 'Active' : 'Inactive'}</Badge>
                </TD>
                <TD className="text-right">
                  <div className="flex justify-end gap-2">
                    <Button variant="outline" onClick={() => openLedger(a.practitioner_id)}>
                      Ledger
                    </Button>
                    {canManage && a.outstanding_paisa > 0 && (
                      <Button onClick={() => setPayFor(a)}>
                        <HandCoins className="mr-1 h-4 w-4" /> Pay
                      </Button>
                    )}
                  </div>
                </TD>
              </TR>
            ))}
          </tbody>
        </Table>
      )}

      {ledger && <LedgerModal ledger={ledger} onClose={() => setLedger(null)} />}
      {payFor && (
        <PayModal
          session={session}
          account={payFor}
          onClose={() => setPayFor(null)}
          onPaid={() => {
            setPayFor(null)
            load()
          }}
        />
      )}
    </div>
  )
}

function StatCard({ label, value, tone }: { label: string; value: string; tone?: 'success' | 'warning' }) {
  const color = tone === 'success' ? 'text-emerald-700' : tone === 'warning' ? 'text-amber-700' : 'text-slate-900'
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <div className="text-xs uppercase tracking-wide text-slate-500">{label}</div>
      <div className={`mt-1 text-lg font-bold tabular-nums ${color}`}>{value}</div>
    </div>
  )
}

function Loading() {
  return (
    <div className="flex items-center justify-center py-16 text-slate-400">
      <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Loading…
    </div>
  )
}

function LedgerModal({ ledger, onClose }: { ledger: CommissionLedger; onClose: () => void }) {
  return (
    <Modal
      title={`Commission ledger — ${ledger.practitioner.name}`}
      subtitle={`${ledger.practitioner.practitioner_code} · outstanding ${formatPKR(ledger.outstanding_paisa)}`}
      onClose={onClose}
      wide
    >
      <div className="max-h-72 overflow-y-auto">
        <Table>
          <THead>
            <tr>
              <TH>Date</TH>
              <TH>Type</TH>
              <TH>Bill</TH>
              <TH className="text-right">Rate</TH>
              <TH className="text-right">Eligible</TH>
              <TH className="text-right">Commission</TH>
            </tr>
          </THead>
          <tbody>
            {ledger.entries.length === 0 && <EmptyRow colSpan={6}>No accrual entries yet.</EmptyRow>}
            {ledger.entries.map((e) => (
              <TR key={`e${e.id}`}>
                <TD className="whitespace-nowrap text-xs">{e.date}</TD>
                <TD>
                  <Badge tone={e.entry_type === 'REVERSAL' ? 'danger' : e.entry_type === 'ADJUSTMENT' ? 'warning' : 'info'}>
                    {e.entry_type}
                  </Badge>
                </TD>
                <TD className="font-mono text-xs">{e.bill_number}</TD>
                <TD className="text-right">{bpToPercent(e.rate_bp)}%</TD>
                <TD className="text-right tabular-nums">{formatPKR(e.eligible_paisa)}</TD>
                <TD className={`text-right font-medium tabular-nums ${e.commission_paisa < 0 ? 'text-red-700' : ''}`}>
                  {formatPKR(e.commission_paisa)}
                </TD>
              </TR>
            ))}
          </tbody>
        </Table>
      </div>
      <h4 className="mb-2 mt-4 text-xs font-semibold uppercase tracking-wide text-slate-500">Payments</h4>
      <div className="max-h-52 overflow-y-auto">
        <Table>
          <THead>
            <tr>
              <TH>Date</TH>
              <TH>Transaction</TH>
              <TH>Method</TH>
              <TH className="text-right">Amount</TH>
              <TH>By</TH>
            </tr>
          </THead>
          <tbody>
            {ledger.payments.length === 0 && <EmptyRow colSpan={5}>No payments recorded yet.</EmptyRow>}
            {ledger.payments.map((p) => (
              <TR key={`p${p.id}`}>
                <TD className="whitespace-nowrap text-xs">{p.paid_at}</TD>
                <TD className="font-mono text-xs">{p.transaction_id}</TD>
                <TD>{methodLabel(p.method)}</TD>
                <TD className="text-right font-medium tabular-nums">{formatPKR(p.amount_paisa)}</TD>
                <TD className="text-xs">{p.paid_by_name ?? '—'}</TD>
              </TR>
            ))}
          </tbody>
        </Table>
      </div>
    </Modal>
  )
}

function PayModal({
  session,
  account,
  onClose,
  onPaid
}: {
  session: SessionInfo
  account: CommissionAccountRow
  onClose: () => void
  onPaid: () => void
}) {
  const [amount, setAmount] = useState((account.outstanding_paisa / 100).toFixed(2))
  const [method, setMethod] = useState('CASH')
  const [reference, setReference] = useState('')
  const [notes, setNotes] = useState('')
  const [txn, setTxn] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    api
      .commissionNextTxnCode(session.token)
      .then(setTxn)
      .catch(() => setTxn(`CMP-${Date.now()}`))
  }, [session.token])

  const submit = () => {
    setBusy(true)
    setError('')
    api
      .commissionPay(session.token, {
        practitioner_id: account.practitioner_id,
        amount_paisa: Math.round(parseFloat(amount || '0') * 100),
        method: method as 'CASH',
        reference_number: reference || undefined,
        notes: notes || undefined,
        transaction_id: txn
      })
      .then(onPaid)
      .catch((e) => (setError(e instanceof Error ? e.message : 'Payment failed'), setBusy(false)))
  }

  return (
    <Modal
      title={`Pay commission — ${account.name}`}
      subtitle={`Outstanding ${formatPKR(account.outstanding_paisa)}`}
      onClose={onClose}
    >
      <div className="space-y-3">
        <div>
          <Label>Amount (PKR)</Label>
          <Input type="number" min="0" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label>Method</Label>
            <Select value={method} onChange={(e) => setMethod(e.target.value)}>
              <option value="CASH">Cash</option>
              <option value="BANK_TRANSFER">Bank Transfer</option>
              <option value="CARD">Card</option>
              <option value="MOBILE_WALLET">Mobile Wallet</option>
              <option value="CHEQUE">Cheque</option>
            </Select>
          </div>
          <div>
            <Label>Reference</Label>
            <Input value={reference} onChange={(e) => setReference(e.target.value)} placeholder="Optional" />
          </div>
        </div>
        <div>
          <Label>Transaction id</Label>
          <Input value={txn} onChange={(e) => setTxn(e.target.value)} className="font-mono text-xs" />
          <p className="mt-1 text-xs text-slate-500">Duplicate ids are rejected — this protects against double payment.</p>
        </div>
        <div>
          <Label>Notes</Label>
          <Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Optional" />
        </div>
        {error && <div className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
        <div className="flex justify-end gap-2 pt-1">
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={busy || !txn || !(parseFloat(amount) > 0)}>
            {busy ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : null} Record payment
          </Button>
        </div>
      </div>
    </Modal>
  )
}

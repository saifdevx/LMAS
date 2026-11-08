import { useCallback, useEffect, useState } from 'react'
import { Ban, Loader2, Printer, FileDown } from 'lucide-react'
import type { BillView, PaymentMethod, ReceiptLayout, SessionInfo } from '../../../shared/api-types'
import { api } from '../api'
import { formatPKR } from '../../../shared/money'
import { Alert } from './ui/alert'
import { Badge } from './ui/badge'
import { Button } from './ui/button'
import { Input } from './ui/input'
import { Label } from './ui/label'
import { Modal } from './ui/modal'
import { Select } from './ui/select'
import { Table, THead, TH, TD, TR, EmptyRow } from './ui/table'
import { methodLabel, statusLabel, statusTone } from '../lib/format'

interface BillDetailProps {
  session: SessionInfo
  billId: number
  onClose: () => void
  onChanged?: () => void
}

export function BillDetail({ session, billId, onClose, onChanged }: BillDetailProps) {
  const [bill, setBill] = useState<BillView | null>(null)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [payAmount, setPayAmount] = useState('')
  const [payMethod, setPayMethod] = useState<PaymentMethod>('CASH')
  const [payRef, setPayRef] = useState('')
  const [payError, setPayError] = useState('')
  const [payBusy, setPayBusy] = useState(false)
  const [cancelMode, setCancelMode] = useState(false)
  const [cancelReason, setCancelReason] = useState('')
  const [cancelError, setCancelError] = useState('')
  const [refundMode, setRefundMode] = useState(false)
  const [refundAmount, setRefundAmount] = useState('')
  const [refundReason, setRefundReason] = useState('')
  const [refundMethod, setRefundMethod] = useState<PaymentMethod>('CASH')
  const [refundError, setRefundError] = useState('')
  const [refundBusy, setRefundBusy] = useState(false)

  const reload = useCallback(() => {
    api
      .billsGet(session.token, billId)
      .then((b) => (setBill(b), setError('')))
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed to load bill'))
  }, [session.token, billId])

  useEffect(reload, [reload])

  const canPay = session.user.permissions.includes('billing.manage')
  const canCancel = session.user.permissions.includes('bills.cancel')
  const canRefund = session.user.permissions.includes('refunds.issue')

  async function addPayment() {
    if (!bill) return
    setPayError('')
    setPayBusy(true)
    try {
      const updated = await api.billsAddPayment(session.token, {
        bill_id: bill.id,
        amount_paisa: Math.round(Number(payAmount) * 100),
        method: payMethod,
        reference_number: payRef,
        transaction_id: crypto.randomUUID()
      })
      setBill(updated)
      setPayAmount('')
      setPayRef('')
      setNotice('Payment recorded.')
      onChanged?.()
    } catch (err) {
      setPayError(err instanceof Error ? err.message : 'Payment failed')
    } finally {
      setPayBusy(false)
    }
  }

  async function cancelBill() {
    if (!bill) return
    setCancelError('')
    try {
      const updated = await api.billsCancel(session.token, bill.id, cancelReason)
      setBill(updated)
      setCancelMode(false)
      setNotice('Bill cancelled and commission reversed where applicable.')
      onChanged?.()
    } catch (err) {
      setCancelError(err instanceof Error ? err.message : 'Cancellation failed')
    }
  }

  async function refundBill() {
    if (!bill) return
    setRefundError('')
    setRefundBusy(true)
    try {
      const updated = await api.billsRefund(session.token, {
        bill_id: bill.id,
        amount_paisa: Math.round(Number(refundAmount) * 100),
        reason: refundReason,
        method: refundMethod
      })
      setBill(updated)
      setRefundMode(false)
      setRefundAmount('')
      setRefundReason('')
      setNotice('Refund recorded. The bill is marked refunded when the refunded amount reaches the amount received.')
      onChanged?.()
    } catch (err) {
      setRefundError(err instanceof Error ? err.message : 'Refund failed')
    } finally {
      setRefundBusy(false)
    }
  }

  async function doPrint(layout: ReceiptLayout) {
    setError('')
    try {
      await api.receiptPrint(session.token, billId, layout)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Print failed')
    }
  }

  async function doPdf(layout: ReceiptLayout) {
    setError('')
    try {
      const p = await api.receiptPdf(session.token, billId, layout)
      setNotice(p ? `PDF saved to ${p}` : 'PDF export cancelled.')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'PDF export failed')
    }
  }

  if (error && !bill) {
    return (
      <Modal title="Bill" onClose={onClose}>
        <Alert kind="error" message={error} />
      </Modal>
    )
  }
  if (!bill) {
    return (
      <Modal title="Bill" onClose={onClose}>
        <div className="flex items-center justify-center py-10 text-slate-400">
          <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Loading bill…
        </div>
      </Modal>
    )
  }

  const showPayForm = canPay && bill.outstanding_paisa > 0 && !['CANCELLED', 'REFUNDED'].includes(bill.status)

  return (
    <Modal title={`Bill ${bill.bill_number}`} subtitle={`${bill.patient_name} (${bill.patient_code}) · ${bill.bill_date}`} onClose={onClose} wide>
      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
            <Badge tone={statusTone(bill.status)}>{statusLabel(bill.status)}</Badge>
            <span>{bill.category === 'SELF' ? 'Self patient' : `Referred — ${bill.practitioner_name ?? ''} @ ${((bill.practitioner_rate_bp ?? 0) / 100).toFixed(1)}%`}</span>
            <span>· Visit {bill.visit_code}</span>
            <span>· by {bill.created_by_name ?? '—'}</span>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => void doPrint('thermal')}>
              <Printer className="h-3.5 w-3.5" /> Thermal
            </Button>
            <Button variant="outline" size="sm" onClick={() => void doPrint('a4')}>
              <Printer className="h-3.5 w-3.5" /> A4
            </Button>
            <Button variant="outline" size="sm" onClick={() => void doPdf('a4')}>
              <FileDown className="h-3.5 w-3.5" /> Save PDF
            </Button>
          </div>
        </div>

        <Alert kind="error" message={error} />
        {notice && !error && <Alert kind="success" message={notice} />}

        <Table>
          <THead>
            <tr>
              <TH>Test</TH>
              <TH className="text-right">List price</TH>
              <TH className="text-right">Charged</TH>
            </tr>
          </THead>
          <tbody>
            {bill.items.map((it) => (
              <TR key={it.id}>
                <TD>
                  {it.test_name}
                  <span className="block font-mono text-[10px] text-slate-400">{it.test_code}</span>
                </TD>
                <TD className="text-right text-slate-400">{formatPKR(it.list_price_paisa)}</TD>
                <TD className="text-right">{formatPKR(it.line_total_paisa)}</TD>
              </TR>
            ))}
          </tbody>
        </Table>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1 text-sm">
            <div className="flex justify-between"><span className="text-slate-500">Subtotal</span><span>{formatPKR(bill.subtotal_paisa)}</span></div>
            <div className="flex justify-between"><span className="text-slate-500">Discount</span><span>-{formatPKR(bill.discount_paisa)}</span></div>
            <div className="flex justify-between border-t border-slate-200 pt-1 text-base font-semibold">
              <span>Net bill</span><span>{formatPKR(bill.net_paisa)}</span>
            </div>
            {bill.category === 'REFERRED' && (
              <div className="flex justify-between text-xs text-slate-500">
                <span>Commission snapshot</span>
                <span>{formatPKR(bill.commission_paisa)} · lab {formatPKR(bill.lab_allocation_paisa)} · basis {bill.commission_basis === 'COLLECTED' ? 'collected' : 'net bill'}</span>
              </div>
            )}
          </div>
          <div className="space-y-1 text-sm">
            <div className="flex justify-between"><span className="text-slate-500">Received</span><span className="text-emerald-700">{formatPKR(bill.paid_paisa)}</span></div>
            {bill.refunded_paisa > 0 && (
              <div className="flex justify-between"><span className="text-slate-500">Refunded</span><span className="text-red-700">-{formatPKR(bill.refunded_paisa)}</span></div>
            )}
            <div className="flex justify-between border-t border-slate-200 pt-1 text-base font-semibold">
              <span>Outstanding</span>
              <span className={bill.outstanding_paisa > 0 ? 'text-red-700' : ''}>{formatPKR(bill.outstanding_paisa)}</span>
            </div>
          </div>
        </div>

        <div>
          <h4 className="mb-1 text-xs font-semibold uppercase tracking-wider text-slate-500">Payments</h4>
          <Table>
            <THead>
              <tr>
                <TH>Transaction</TH>
                <TH>Method</TH>
                <TH>Reference</TH>
                <TH className="text-right">Amount</TH>
                <TH>When</TH>
                <TH>By</TH>
              </tr>
            </THead>
            <tbody>
              {bill.payments.length === 0 && <EmptyRow colSpan={6}>No payments recorded.</EmptyRow>}
              {bill.payments.map((p) => (
                <TR key={p.id}>
                  <TD className="font-mono text-xs">{p.transaction_id.slice(0, 13)}…</TD>
                  <TD>{methodLabel(p.method)}</TD>
                  <TD>{p.reference_number ?? '—'}</TD>
                  <TD className="text-right font-medium">{formatPKR(p.amount_paisa)}</TD>
                  <TD>{p.paid_at}</TD>
                  <TD>{p.received_by_name ?? '—'}</TD>
                </TR>
              ))}
            </tbody>
          </Table>
        </div>

        {showPayForm && (
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
            <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-500">Record a payment (outstanding {formatPKR(bill.outstanding_paisa)})</h4>
            <div className="grid grid-cols-2 items-end gap-2 sm:grid-cols-4">
              <div>
                <Label>Amount (PKR) *</Label>
                <Input
                  type="number"
                  min={0}
                  step="0.01"
                  value={payAmount}
                  onChange={(e) => setPayAmount(e.target.value)}
                  placeholder={(bill.outstanding_paisa / 100).toFixed(2)}
                />
              </div>
              <div>
                <Label>Method</Label>
                <Select value={payMethod} onChange={(e) => setPayMethod(e.target.value as PaymentMethod)}>
                  <option value="CASH">Cash</option>
                  <option value="BANK_TRANSFER">Bank Transfer</option>
                  <option value="CARD">Card</option>
                  <option value="MOBILE_WALLET">Mobile Wallet</option>
                  <option value="CHEQUE">Cheque</option>
                </Select>
              </div>
              <div>
                <Label>Reference</Label>
                <Input value={payRef} onChange={(e) => setPayRef(e.target.value)} placeholder="optional" />
              </div>
              <Button disabled={payBusy || !payAmount} onClick={() => void addPayment()}>
                {payBusy && <Loader2 className="h-4 w-4 animate-spin" />} Record payment
              </Button>
            </div>
            <Alert kind="error" message={payError} />
          </div>
        )}

        {canRefund && bill.paid_paisa > 0 && bill.status !== 'CANCELLED' && (
          <div className="rounded-lg border border-amber-200 bg-amber-50/60 p-3">
            {!refundMode ? (
              <div className="flex items-center justify-between">
                <span className="text-xs text-slate-600">This bill has payments — return money to the patient with an audited refund.</span>
                <Button variant="outline" size="sm" onClick={() => setRefundMode(true)}>
                  Record refund
                </Button>
              </div>
            ) : (
              <div className="space-y-2">
                <div className="grid grid-cols-2 items-end gap-2 sm:grid-cols-3">
                  <div>
                    <Label>Refund amount (PKR) *</Label>
                    <Input type="number" min={0} step="0.01" value={refundAmount} onChange={(e) => setRefundAmount(e.target.value)} placeholder={((bill.paid_paisa - bill.refunded_paisa) / 100).toFixed(2)} />
                  </div>
                  <div>
                    <Label>Method</Label>
                    <Select value={refundMethod} onChange={(e) => setRefundMethod(e.target.value as PaymentMethod)}>
                      <option value="CASH">Cash</option>
                      <option value="BANK_TRANSFER">Bank Transfer</option>
                      <option value="CARD">Card</option>
                      <option value="MOBILE_WALLET">Mobile Wallet</option>
                      <option value="CHEQUE">Cheque</option>
                    </Select>
                  </div>
                  <div>
                    <Label>Reason *</Label>
                    <Input value={refundReason} onChange={(e) => setRefundReason(e.target.value)} placeholder="e.g. duplicate payment, cancelled visit" />
                  </div>
                </div>
                <Alert kind="error" message={refundError} />
                <div className="flex justify-end gap-2">
                  <Button variant="ghost" size="sm" onClick={() => setRefundMode(false)}>Keep as is</Button>
                  <Button size="sm" disabled={refundBusy || !(Number(refundAmount) > 0) || refundReason.trim().length < 3} onClick={() => void refundBill()}>
                    {refundBusy && <Loader2 className="h-4 w-4 animate-spin" />} Confirm refund
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}

        {canCancel && bill.payments.length === 0 && bill.status !== 'CANCELLED' && (
          <div className="rounded-lg border border-red-200 bg-red-50/50 p-3">
            {!cancelMode ? (
              <div className="flex items-center justify-between">
                <span className="text-xs text-slate-600">This bill has no payments and can be cancelled with an audit record.</span>
                <Button variant="destructive" size="sm" onClick={() => setCancelMode(true)}>
                  <Ban className="h-3.5 w-3.5" /> Cancel bill
                </Button>
              </div>
            ) : (
              <div className="space-y-2">
                <Label>Cancellation reason *</Label>
                <Input value={cancelReason} onChange={(e) => setCancelReason(e.target.value)} placeholder="e.g. duplicate bill, patient cancelled tests" />
                <Alert kind="error" message={cancelError} />
                <div className="flex justify-end gap-2">
                  <Button variant="ghost" size="sm" onClick={() => setCancelMode(false)}>Keep bill</Button>
                  <Button variant="destructive" size="sm" disabled={cancelReason.trim().length < 3} onClick={() => void cancelBill()}>
                    Confirm cancellation
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </Modal>
  )
}

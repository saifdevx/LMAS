import fs from 'node:fs'
import type { BillView, ReceiptLayout, SettingsMap } from '../../shared/api-types'
import { formatDisplayDate, formatPKR } from '../../shared/money'

/**
 * Pure receipt HTML builder (PRD §Module E receipt requirements).
 * Kept free of Electron imports so it is unit-testable under Vitest.
 */

export function escapeHtml(s: string | null | undefined): string {
  return (s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

const METHOD_LABEL: Record<string, string> = {
  CASH: 'Cash',
  BANK_TRANSFER: 'Bank Transfer',
  CARD: 'Card',
  MOBILE_WALLET: 'Mobile Wallet',
  CHEQUE: 'Cheque'
}

const STATUS_LABEL: Record<string, string> = {
  DRAFT: 'DRAFT',
  FINALIZED: 'UNPAID',
  PARTIALLY_PAID: 'PARTIALLY PAID',
  PAID: 'PAID',
  CANCELLED: 'CANCELLED',
  REFUNDED: 'REFUNDED'
}

function money(paisa: number): string {
  return escapeHtml(formatPKR(paisa))
}

export function buildReceiptHtml(
  bill: BillView,
  settings: SettingsMap,
  layout: ReceiptLayout,
  generatedAt: string
): string {
  const labName = escapeHtml(settings['lab.name'] || 'Laboratory')
  const address = escapeHtml(settings['lab.address'] || '')
  const phone = escapeHtml(settings['lab.phone'] || '')
  const email = escapeHtml(settings['lab.email'] || '')
  const footer = escapeHtml(settings['lab.receiptFooter'] || '')

  let logoTag = ''
  const logoPath = settings['lab.logoPath'] || ''
  if (logoPath && fs.existsSync(logoPath)) {
    logoTag = `<img src="file://${logoPath.replace(/\\/g, '/')}" alt="logo" />`
  }

  const itemRows = bill.items
    .map(
      (item, i) => `
      <tr>
        <td class="c">${i + 1}</td>
        <td>${escapeHtml(item.test_name)}<span class="code">${escapeHtml(item.test_code)}</span></td>
        <td class="r">${money(item.line_total_paisa)}</td>
      </tr>`
    )
    .join('')

  const contactLine = [address, phone, email].filter(Boolean).map(escapeHtml).join(' &middot; ')
  const practitionerLine =
    bill.category === 'REFERRED' && bill.practitioner_name
      ? `<div class="meta-row"><span class="k">Referred by</span><span class="v">${escapeHtml(bill.practitioner_name)}</span></div>`
      : ''
  const urduLine = bill.patient_name_urdu
    ? `<div class="urdu-name">${escapeHtml(bill.patient_name_urdu)}</div>`
    : ''
  const lastPayment = bill.payments.length > 0 ? bill.payments[bill.payments.length - 1] : null
  const methodLine = lastPayment
    ? `<div class="meta-row"><span class="k">Payment method</span><span class="v">${escapeHtml(METHOD_LABEL[lastPayment.method] ?? lastPayment.method)}</span></div>`
    : ''

  const sheetStyle =
    layout === 'thermal'
      ? `.sheet{width:72mm;margin:0 auto;font:11px/1.45 'Segoe UI',sans-serif;color:#111}
         h1{font-size:14px;margin:0} .logo{max-height:11mm;max-width:24mm}
         table{width:100%;border-collapse:collapse;font-size:11px}
         th,td{padding:2px 3px} .totals td{padding:1.5px 3px}`
      : `.sheet{width:180mm;margin:0 auto;padding:12mm 0;font:12px/1.55 'Segoe UI',sans-serif;color:#111}
         h1{font-size:22px;margin:0} .logo{max-height:18mm;max-width:40mm}
         table{width:100%;border-collapse:collapse;font-size:12px}
         th,td{padding:6px 8px} .totals td{padding:4px 8px}
         th{background:#f1f5f9}`

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>Receipt ${escapeHtml(bill.bill_number)}</title>
<style>
  *{box-sizing:border-box}
  body{margin:0;background:#fff;-webkit-print-color-adjust:exact}
  ${sheetStyle}
  .head{display:flex;align-items:center;gap:10px;border-bottom:2px solid #0f172a;padding-bottom:8px;margin-bottom:8px}
  .head .name{font-weight:700;letter-spacing:.3px}
  .head .sub{color:#475569;font-size:10px}
  .meta{margin:8px 0;border:1px solid #cbd5e1;border-radius:4px;padding:6px 8px}
  .meta-row{display:flex;justify-content:space-between;gap:8px}
  .k{color:#64748b}
  .v{font-weight:600;text-align:right}
  .urdu-name{direction:rtl;text-align:right;font-size:12px;margin-top:1px}
  table th{border-bottom:1.5px solid #0f172a;text-align:left;font-weight:600}
  td.r,th.r{text-align:right}
  td.c,th.c{width:18px;text-align:center;color:#64748b}
  .code{display:block;color:#94a3b8;font-size:9px}
  .totals{margin-top:6px;width:100%}
  .totals td{border:0}
  .totals .grand td{border-top:1.5px solid #0f172a;font-weight:700;font-size:13px}
  .badge{display:inline-block;border:1px solid #0f172a;border-radius:3px;padding:1px 6px;font-weight:700;font-size:10px;letter-spacing:.5px}
  .foot{margin-top:10px;border-top:1px dashed #94a3b8;padding-top:6px;text-align:center;color:#475569;font-size:10px}
  @media print { body { margin: 0 } }
</style>
</head>
<body>
<div class="sheet">
  <div class="head">
    ${logoTag}
    <div>
      <h1 class="name">${labName}</h1>
      <div class="sub">${contactLine || 'Medical Diagnostic Laboratory'}</div>
    </div>
  </div>

  <div class="meta">
    <div class="meta-row"><span class="k">Receipt / Bill No</span><span class="v">${escapeHtml(bill.bill_number)}</span></div>
    <div class="meta-row"><span class="k">Date &amp; time</span><span class="v">${escapeHtml(formatDisplayDate(bill.bill_date))} ${escapeHtml((bill.created_at || '').slice(11, 16))}</span></div>
    <div class="meta-row"><span class="k">Patient</span><span class="v">${escapeHtml(bill.patient_name)} (${escapeHtml(bill.patient_code)})</span></div>
    ${urduLine}
    <div class="meta-row"><span class="k">Category</span><span class="v">${bill.category === 'SELF' ? 'Self (direct visit)' : 'Referred'}</span></div>
    ${practitionerLine}
    ${methodLine}
  </div>

  <table>
    <thead>
      <tr><th class="c">#</th><th>Test</th><th class="r">Amount</th></tr>
    </thead>
    <tbody>${itemRows}</tbody>
  </table>

  <table class="totals">
    <tr><td>Subtotal</td><td class="r">${money(bill.subtotal_paisa)}</td></tr>
    ${bill.discount_paisa > 0 ? `<tr><td>Discount</td><td class="r">-${money(bill.discount_paisa)}</td></tr>` : ''}
    <tr class="grand"><td>Total</td><td class="r">${money(bill.net_paisa)}</td></tr>
    <tr><td>Amount received</td><td class="r">${money(bill.paid_paisa)}</td></tr>
    <tr><td><strong>Balance due</strong></td><td class="r"><strong>${money(bill.outstanding_paisa)}</strong></td></tr>
  </table>

  <div style="margin-top:8px">
    <span class="badge">${escapeHtml(STATUS_LABEL[bill.status] ?? bill.status)}</span>
  </div>

  ${bill.notes ? `<div class="meta" style="margin-top:8px"><div class="meta-row"><span class="k">Notes</span><span class="v">${escapeHtml(bill.notes)}</span></div></div>` : ''}

  <div class="foot">
    ${footer ? `${footer}<br/>` : ''}
    Printed ${escapeHtml(generatedAt)} &middot; LMAS Laboratory Management &amp; Accounting System
  </div>
</div>
</body>
</html>`
}

import type { LabBillWork } from '../../shared/api-types'
import type { SettingsMap } from '../../shared/api-types'
import { formatDisplayDate } from '../../shared/money'

/**
 * Pure A4 laboratory report HTML builder (PRD §Module F "Laboratory
 * Reports"). Free of Electron imports so it is unit-testable under Vitest.
 * The report never invents reference ranges or diagnoses — it prints only
 * what qualified personnel entered.
 */

export interface LabReportTest {
  test_name: string
  test_code: string
  value: string | null
  unit: string | null
  reference_range: string | null
  observations: string | null
  remarks: string | null
  status: string
  result_state: string
  sample_code: string | null
  sample_type: string | null
  collected_at: string | null
}

export interface LabReportData {
  report_code: string
  report_date: string
  bill: LabBillWork['bill']
  tests: LabReportTest[]
  entered_by_name: string | null
  verified_by_name: string | null
  approved_by_name: string | null
}

export function escapeHtml(s: string | null | undefined): string {
  return (s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function displayResult(t: LabReportTest): string {
  if (t.status === 'CANCELLED') return 'Cancelled'
  if (!t.value || t.value.trim() === '') return 'Pending'
  return t.value
}

function displayState(t: LabReportTest): string {
  if (t.status === 'CANCELLED') return 'CANCELLED'
  if (!t.value || t.value.trim() === '') return 'PENDING'
  return t.result_state
}

export function buildLabReportHtml(data: LabReportData, settings: SettingsMap, generatedAt: string): string {
  const labName = escapeHtml(settings['lab.name'] || 'Laboratory')
  const address = escapeHtml(settings['lab.address'] || '')
  const phone = escapeHtml(settings['lab.phone'] || '')
  const email = escapeHtml(settings['lab.email'] || '')
  const headerLine = escapeHtml(settings['lab.reportHeader'] || '')
  const contactLine = [address, phone, email].filter(Boolean).map(escapeHtml).join(' &middot; ')

  let logoTag = ''
  const logoPath = settings['lab.logoPath'] || ''
  if (logoPath) {
    logoTag = `<img src="file://${logoPath.replace(/\\/g, '/')}" alt="logo" />`
  }

  const b = data.bill
  const urduLine = b.patient_name_urdu
    ? `<div class="urdu-name">${escapeHtml(b.patient_name_urdu)}</div>`
    : ''
  const referredLine =
    b.category === 'REFERRED' && b.practitioner_name
      ? `<div class="meta-row"><span class="k">Referred by</span><span class="v">${escapeHtml(b.practitioner_name)}</span></div>`
      : ''
  const sexAge = [b.age != null ? `${b.age} yrs` : null, b.gender ? b.gender.charAt(0) + b.gender.slice(1).toLowerCase() : null]
    .filter(Boolean)
    .join(' / ')

  const testRows = data.tests
    .map((t, i) => {
      const state = displayState(t)
      const observations = t.observations ? `<div class="obs">Observations: ${escapeHtml(t.observations)}</div>` : ''
      const sampleBits = [t.sample_code, t.sample_type, t.collected_at ? formatDisplayDate(t.collected_at.slice(0, 10)) : null]
        .filter(Boolean)
        .map(escapeHtml)
        .join('<br/>')
      return `
      <tr>
        <td class="c">${i + 1}</td>
        <td>${escapeHtml(t.test_name)}<span class="code">${escapeHtml(t.test_code)}</span>${observations}</td>
        <td class="result ${state === 'APPROVED' ? 'approved' : ''}">${escapeHtml(displayResult(t))}</td>
        <td>${escapeHtml(t.unit)}</td>
        <td>${escapeHtml(t.reference_range)}</td>
        <td class="small">${sampleBits || '—'}</td>
        <td class="small">${escapeHtml(t.remarks)}</td>
        <td><span class="badge">${escapeHtml(state)}</span></td>
      </tr>`
    })
    .join('')

  const sig = (label: string, name: string | null) => `
    <div class="sig">
      <div class="sig-label">${escapeHtml(label)}</div>
      <div class="sig-name">${escapeHtml(name)}</div>
      <div class="sig-line"></div>
      <div class="sig-caption">Signature &amp; stamp</div>
    </div>`

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>Lab Report ${escapeHtml(data.report_code)}</title>
<style>
  *{box-sizing:border-box}
  body{margin:0;background:#fff;-webkit-print-color-adjust:exact}
  .sheet{width:180mm;margin:0 auto;padding:12mm 0;font:12px/1.5 'Segoe UI',sans-serif;color:#111}
  h1{font-size:22px;margin:0}
  .head{display:flex;align-items:center;gap:10px;border-bottom:2px solid #0f172a;padding-bottom:8px;margin-bottom:6px}
  .head .name{font-weight:700;letter-spacing:.3px}
  .head .sub{color:#475569;font-size:10px}
  .logo{max-height:18mm;max-width:40mm}
  .doc-title{text-align:center;font-weight:700;font-size:15px;letter-spacing:2px;margin:8px 0 2px}
  .report-header-line{text-align:center;color:#475569;font-size:10px;margin-bottom:8px}
  .meta{display:grid;grid-template-columns:1fr 1fr;gap:2px 24px;margin:8px 0;border:1px solid #cbd5e1;border-radius:4px;padding:8px 10px}
  .meta-row{display:flex;justify-content:space-between;gap:8px}
  .k{color:#64748b}
  .v{font-weight:600;text-align:right}
  .urdu-name{direction:rtl;text-align:right;font-size:12px}
  table{width:100%;border-collapse:collapse;font-size:11.5px;margin-top:8px}
  table th{border-bottom:1.5px solid #0f172a;text-align:left;font-weight:600;background:#f1f5f9;padding:5px 6px}
  table td{border-bottom:1px solid #e2e8f0;padding:5px 6px;vertical-align:top}
  td.r,th.r{text-align:right}
  td.c,th.c{width:16px;text-align:center;color:#64748b}
  .code{display:block;color:#94a3b8;font-size:9px}
  .obs{display:block;color:#475569;font-size:10px;margin-top:2px}
  .result{font-weight:700}
  .result.approved{color:#047857}
  .small{font-size:10px;color:#475569}
  .badge{display:inline-block;border:1px solid #64748b;border-radius:3px;padding:0 5px;font-weight:700;font-size:9px;letter-spacing:.5px}
  .notes{margin-top:8px;font-size:10.5px;color:#334155}
  .signatures{display:flex;justify-content:space-between;gap:12px;margin-top:26px;page-break-inside:avoid}
  .sig{width:30%;text-align:center}
  .sig-label{font-size:10px;color:#64748b;text-transform:uppercase;letter-spacing:.5px}
  .sig-name{font-weight:600;margin-top:2px;min-height:14px}
  .sig-line{border-top:1px solid #0f172a;margin-top:26px}
  .sig-caption{font-size:9px;color:#94a3b8;margin-top:2px}
  .foot{margin-top:14px;border-top:1px dashed #94a3b8;padding-top:6px;text-align:center;color:#475569;font-size:10px}
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

  <div class="doc-title">LABORATORY TEST REPORT</div>
  ${headerLine ? `<div class="report-header-line">${headerLine}</div>` : ''}

  <div class="meta">
    <div class="meta-row"><span class="k">Report No</span><span class="v">${escapeHtml(data.report_code)}</span></div>
    <div class="meta-row"><span class="k">Report date</span><span class="v">${escapeHtml(formatDisplayDate(data.report_date))}</span></div>
    <div class="meta-row"><span class="k">Patient ID</span><span class="v">${escapeHtml(b.patient_code)}</span></div>
    <div class="meta-row"><span class="k">Patient name</span><span class="v">${escapeHtml(b.patient_name)}</span></div>
    <div class="meta-row"><span class="k">Age / Sex</span><span class="v">${escapeHtml(sexAge || '—')}</span></div>
    <div class="meta-row"><span class="k">Bill No / Visit</span><span class="v">${escapeHtml(b.bill_number)} / ${escapeHtml(b.visit_code)}</span></div>
    <div class="meta-row"><span class="k">Category</span><span class="v">${b.category === 'SELF' ? 'Self (direct visit)' : 'Referred'}</span></div>
    <div class="meta-row"><span class="k">Collection date</span><span class="v">${escapeHtml(formatDisplayDate(b.bill_date))}</span></div>
  </div>
  ${urduLine}
  ${referredLine}

  <table>
    <thead>
      <tr>
        <th class="c">#</th>
        <th style="width:26%">Test</th>
        <th>Result</th>
        <th style="width:11%">Unit</th>
        <th style="width:17%">Reference range</th>
        <th style="width:13%">Sample</th>
        <th style="width:13%">Remarks</th>
        <th style="width:11%">Status</th>
      </tr>
    </thead>
    <tbody>${testRows}</tbody>
  </table>

  ${b.notes ? `<div class="notes"><strong>Notes:</strong> ${escapeHtml(b.notes)}</div>` : ''}

  <div class="signatures">
    ${sig('Prepared by (Technician)', data.entered_by_name)}
    ${sig('Verified by', data.verified_by_name)}
    ${sig('Approved by', data.approved_by_name)}
  </div>

  <div class="foot">
    Report generated ${escapeHtml(generatedAt)} &middot; LMAS Laboratory Management &amp; Accounting System<br/>
    This report is complete and valid only with the authorized signature above.
  </div>
</div>
</body>
</html>`
}

import type { ReportResult } from './reports'
import { formatPKR } from '../../shared/money'

/**
 * Generic A4 financial-report HTML (PRD §Module I): PKR formatting,
 * DD-MM-YYYY dates, clear totals, professional print layout, Urdu-safe
 * (RTL) rendering for any Urdu content inside cells. Used for PDF export
 * via Electron's printToPDF — fully offline.
 */

function esc(v: string): string {
  return v.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

function cellValue(type: string, value: string | number | null): string {
  if (value === null || value === undefined) return ''
  if (type === 'money' && typeof value === 'number') return esc(formatPKR(value))
  return esc(String(value))
}

function displayDate(iso: string): string {
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})/)
  return m ? `${m[3]}-${m[2]}-${m[1]}` : iso
}

const URDU_RE = /[\u0600-\u06FF]/

export function buildReportHtml(
  report: ReportResult,
  settings: Record<string, string>,
  generatedStamp: string
): string {
  const labName = settings['lab.name'] || 'Laboratory'
  const header = settings['lab.reportHeader'] || ''
  const address = settings['lab.address'] || ''
  const phone = settings['lab.phone'] || ''

  const head = report.columns.map((c) => `<th${c.type === 'money' || c.type === 'number' ? ' class="num"' : ''}>${esc(c.label)}</th>`).join('')

  const body = report.rows.length
    ? report.rows
        .map((row) => {
          const tds = report.columns
            .map((c) => {
              const raw = row[c.key]
              const text = cellValue(c.type, raw)
              const rtl = typeof raw === 'string' && URDU_RE.test(raw) ? ' dir="rtl"' : ''
              const cls = c.type === 'money' || c.type === 'number' ? ' class="num"' : ''
              return `<td${cls}${rtl}>${text}</td>`
            })
            .join('')
          return `<tr>${tds}</tr>`
        })
        .join('')
    : `<tr><td colspan="${report.columns.length}" class="empty">No records for this selection</td></tr>`

  const totalsRow =
    Object.keys(report.totals).length > 0
      ? `<tr class="totals">${report.columns
          .map((c) => {
            const v = report.totals[c.key]
            if (v === null || v === undefined) return '<td></td>'
            const text = c.type === 'money' ? esc(formatPKR(Number(v))) : esc(String(v))
            return `<td${c.type === 'money' || c.type === 'number' ? ' class="num"' : ''}>${text}</td>`
          })
          .join('')}</tr>`
      : ''

  const figures = report.figures
    .map(
      (f) =>
        `<div class="figure"><span class="figure-label">${esc(f.label)}</span><span class="figure-value">${esc(
          f.paisa !== undefined ? formatPKR(f.paisa) : f.text ?? ''
        )}</span></div>`
    )
    .join('')

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>${esc(report.title)}</title>
<style>
  * { box-sizing: border-box; }
  body { font-family: 'Segoe UI', 'Noto Sans', 'Noto Nastaliq Urdu', Arial, sans-serif; color: #0f172a; margin: 24px; font-size: 12px; }
  .head { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #0f172a; padding-bottom: 10px; }
  .lab-name { font-size: 20px; font-weight: 700; }
  .lab-meta { color: #475569; font-size: 11px; margin-top: 2px; }
  h1 { font-size: 15px; margin: 14px 0 2px; letter-spacing: 0.4px; text-transform: uppercase; }
  .period { color: #475569; margin-bottom: 12px; }
  table { width: 100%; border-collapse: collapse; margin-top: 8px; }
  th, td { border: 1px solid #cbd5e1; padding: 5px 7px; text-align: left; }
  th { background: #f1f5f9; font-size: 11px; text-transform: uppercase; letter-spacing: 0.3px; }
  td.num, th.num { text-align: right; font-variant-numeric: tabular-nums; }
  tr:nth-child(even) td { background: #f8fafc; }
  tr.totals td { background: #e2e8f0; font-weight: 700; border-top: 2px solid #0f172a; }
  td.empty { text-align: center; color: #64748b; padding: 18px; }
  .figures { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; margin-top: 16px; }
  .figure { border: 1px solid #cbd5e1; border-radius: 6px; padding: 8px 10px; background: #f8fafc; }
  .figure-label { display: block; color: #475569; font-size: 10px; text-transform: uppercase; letter-spacing: 0.3px; }
  .figure-value { display: block; font-weight: 700; font-size: 13px; margin-top: 2px; font-variant-numeric: tabular-nums; }
  .foot { margin-top: 26px; color: #64748b; font-size: 10px; display: flex; justify-content: space-between; }
  @media print { body { margin: 10mm; } .figures { grid-template-columns: repeat(4, 1fr); } }
</style>
</head>
<body>
  <div class="head">
    <div>
      <div class="lab-name">${esc(labName)}</div>
      ${address ? `<div class="lab-meta">${esc(address)}</div>` : ''}
      ${phone ? `<div class="lab-meta">Phone: ${esc(phone)}</div>` : ''}
    </div>
    <div class="lab-meta">Generated<br>${esc(generatedStamp)}</div>
  </div>
  ${header ? `<div class="lab-meta" style="margin-top:6px">${esc(header)}</div>` : ''}
  <h1>${esc(report.title)}</h1>
  <div class="period">Period: ${esc(displayDate(report.from))} — ${esc(displayDate(report.to))}</div>
  <table>
    <thead><tr>${head}</tr></thead>
    <tbody>${body}${totalsRow}</tbody>
  </table>
  ${figures ? `<div class="figures">${figures}</div>` : ''}
  <div class="foot">
    <span>${esc(labName)} — financial report</span>
    <span>Currency: PKR · Dates: DD-MM-YYYY</span>
  </div>
</body>
</html>`
}

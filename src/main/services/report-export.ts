import fs from 'node:fs'
import path from 'node:path'
import { BrowserWindow, dialog } from 'electron'
import type Database from 'better-sqlite3'
import * as XLSX from 'xlsx'
import type { Actor } from '../lib/actor'
import { actorHas } from '../lib/actor'
import { runReport, reportRange, type ReportSpec } from './reports'
import { buildReportHtml } from './report-html'
import { getSettings } from './settings'
import { writeAudit } from './audit'
import { localDate } from './dashboard'
import { formatPKR } from '../../shared/money'

/**
 * Report exports (PRD §Module I): PDF via Electron's offline print engine
 * and Excel (.xlsx) via SheetJS. Both audited (REPORT_PDF_EXPORTED /
 * REPORT_EXCEL_EXPORTED). All pure logic is separated so the service stays
 * testable outside Electron.
 */

function nowStamp(): string {
  const d = new Date()
  const pad = (n: number) => n.toString().padStart(2, '0')
  return `${localDate(d)} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export function reportFileName(spec: ReportSpec, ext: string): string {
  const { from, to } = reportRange(spec)
  const stamp = `${from.replace(/-/g, '')}_${to.replace(/-/g, '')}`
  return `${spec.kind}_report_${stamp}.${ext}`
}

// ---------------------------------------------------------------- xlsx model

export interface XlsxSheet {
  name: string
  rows: Array<Array<string | number>>
}

/**
 * Build the workbook model for a report: sheet 1 "Report" (figures +
 * table with totals), prepared for SheetJS. Dates are exported as text in
 * DD-MM-YYYY, money as PKR-formatted strings so printed exports match the
 * on-screen figures exactly (PRD §Module I).
 */
export function buildReportWorkbook(
  report: ReturnType<typeof runReport>,
  settings: Record<string, string>
): XlsxSheet[] {
  const meta: Array<Array<string | number>> = [
    [settings['lab.name'] || 'Laboratory'],
    [report.title],
    [`Period: ${report.from} to ${report.to}`],
    [`Generated: ${report.generated_at}`],
    []
  ]
  for (const f of report.figures) {
    meta.push([f.label, f.paisa !== undefined ? formatPaisaForExcel(f.paisa) : f.text ?? ''])
  }
  meta.push([])

  const header = report.columns.map((c) => c.label)
  const rows: Array<Array<string | number>> = [...meta, header]
  for (const r of report.rows) {
    rows.push(report.columns.map((c) => serializeCell(c.type, r[c.key])))
  }
  if (Object.keys(report.totals).length > 0) {
    rows.push(report.columns.map((c) => (c.key in report.totals ? serializeCell(c.type, report.totals[c.key]) : '')))
  }
  return [{ name: 'Report', rows }]
}

function serializeCell(type: string, value: string | number | null | undefined): string | number {
  if (value === null || value === undefined) return ''
  if (type === 'money' && typeof value === 'number') return formatPaisaForExcel(value)
  return String(value)
}

/** Excel stores numbers; PKR formatting is applied as text for print fidelity. */
export function formatPaisaForExcel(paisa: number): string {
  return formatPKR(Math.round(paisa))
}

export function writeWorkbookFileSync(sheets: XlsxSheet[], filePath: string): void {
  const wb = XLSX.utils.book_new()
  for (const sheet of sheets) {
    const ws = XLSX.utils.aoa_to_sheet(sheet.rows)
    const widths = (sheet.rows[0] ?? []).map((_, colIdx) => ({
      wch: Math.min(40, Math.max(10, ...sheet.rows.map((r) => String(r[colIdx] ?? '').length + 2)))
    }))
    ws['!cols'] = widths
    XLSX.utils.book_append_sheet(wb, ws, sheet.name)
  }
  XLSX.writeFile(wb, filePath)
}

// ---------------------------------------------------------------- Electron flows

async function withHiddenWindow<T>(file: string, fn: (contents: Electron.WebContents) => Promise<T>): Promise<T> {
  const win = new BrowserWindow({
    show: false,
    webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true }
  })
  try {
    await win.loadFile(file)
    return await fn(win.webContents)
  } finally {
    win.destroy()
  }
}

function appDownloadsDir(): string {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { app } = require('electron') as typeof import('electron')
    return app.getPath('downloads')
  } catch {
    return process.cwd()
  }
}

export async function exportReportPdf(db: Database.Database, dataDir: string, actor: Actor, spec: ReportSpec): Promise<string> {
  if (!actorHas(actor, 'reports.view')) throw new Error('You do not have permission to export reports')
  const report = runReport(db, spec)
  const settings = getSettings(db)
  const html = buildReportHtml(report, settings, nowStamp())
  const htmlFile = path.join(dataDir, `report-${reportFileName(spec, 'html')}`)
  fs.writeFileSync(htmlFile, html, 'utf-8')

  const { canceled, filePath } = await dialog.showSaveDialog({
    title: 'Save report as PDF',
    defaultPath: path.join(appDownloadsDir(), reportFileName(spec, 'pdf')),
    filters: [{ name: 'PDF', extensions: ['pdf'] }]
  })
  if (canceled || !filePath) return ''

  const pdfBuffer = await withHiddenWindow(htmlFile, (contents) =>
    contents.printToPDF({ printBackground: true, pageSize: 'A4' })
  )
  fs.writeFileSync(filePath, pdfBuffer)
  writeAudit(db, {
    userId: actor.id,
    action: 'REPORT_PDF_EXPORTED',
    entityType: 'report',
    entityId: spec.kind,
    newValue: { kind: spec.kind, from: report.from, to: report.to, file_path: filePath }
  })
  return filePath
}

export async function exportReportExcel(db: Database.Database, actor: Actor, spec: ReportSpec): Promise<string> {
  if (!actorHas(actor, 'reports.view')) throw new Error('You do not have permission to export reports')
  const report = runReport(db, spec)
  const settings = getSettings(db)
  const sheets = buildReportWorkbook(report, settings)

  const { canceled, filePath } = await dialog.showSaveDialog({
    title: 'Save report as Excel',
    defaultPath: path.join(appDownloadsDir(), reportFileName(spec, 'xlsx')),
    filters: [{ name: 'Excel', extensions: ['xlsx'] }]
  })
  if (canceled || !filePath) return ''

  writeWorkbookFileSync(sheets, filePath)
  writeAudit(db, {
    userId: actor.id,
    action: 'REPORT_EXCEL_EXPORTED',
    entityType: 'report',
    entityId: spec.kind,
    newValue: { kind: spec.kind, from: report.from, to: report.to, file_path: filePath }
  })
  return filePath
}

import fs from 'node:fs'
import path from 'node:path'
import { dialog } from 'electron'
import type Database from 'better-sqlite3'
import { buildLabReportHtml, type LabReportData, type LabReportTest } from './lab-report-html'
import { getBillWork, LabError } from './lab'
import { getSettings } from './settings'
import { writeAudit } from './audit'
import { nextCode } from '../lib/numbering'
import { localDate } from './dashboard'
import { withReceiptWindow } from './receipt-print'

/**
 * Laboratory report issuing (PRD §Module F + §12 CP3).
 * Every print or PDF export is recorded in lab_reports, so the report
 * history is maintained (CP3 acceptance criterion). A4 only.
 */

export type LabReportKind = 'PRINT' | 'PDF'

function nowStamp(): string {
  const d = new Date()
  const pad = (n: number) => n.toString().padStart(2, '0')
  return `${localDate(d)} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

/** Assemble report data for a bill (tests, sample info, staff names). */
export function buildLabReportData(db: Database.Database, billId: number, reportCode: string): LabReportData {
  const work = getBillWork(db, billId)
  const hasValue = (r: { value: string | null }) => (r.value ?? '').trim() !== ''
  if (!work.results.some(hasValue)) {
    throw new LabError('No test results have been entered for this bill yet — there is nothing to report.')
  }

  const tests: LabReportTest[] = work.results.map((r) => ({
    test_name: r.test_name,
    test_code: r.test_code,
    value: r.value,
    unit: r.unit,
    reference_range: r.reference_range,
    observations: r.observations,
    remarks: r.remarks,
    status: r.status,
    result_state: r.result_state,
    sample_code: r.sample_code,
    sample_type: work.samples.find((s) => s.id === r.sample_id)?.sample_type ?? null,
    collected_at: work.samples.find((s) => s.id === r.sample_id)?.collected_at ?? null
  }))

  const firstNonEmpty = (values: Array<string | null>): string | null => values.find((v) => (v ?? '').trim() !== '') ?? null

  return {
    report_code: reportCode,
    report_date: localDate(new Date()),
    bill: work.bill,
    tests,
    entered_by_name: firstNonEmpty(work.results.map((r) => r.entered_by_name)),
    verified_by_name: firstNonEmpty(work.results.map((r) => r.verified_by_name)),
    approved_by_name: firstNonEmpty(work.results.map((r) => r.approved_by_name))
  }
}

function renderReportFile(db: Database.Database, dataDir: string, billId: number): { file: string; data: LabReportData; code: string } {
  const settings = getSettings(db)
  const prefix = (settings['numbering.reportPrefix'] || 'RPT').trim().replace(/-+$/, '') || 'RPT'
  const code = nextCode(db, { table: 'lab_reports', column: 'report_code', prefix, yearly: true }, settings)
  const data = buildLabReportData(db, billId, code)
  const html = buildLabReportHtml(data, settings, nowStamp())
  const file = path.join(dataDir, `lab-report-${code.replace(/[^A-Za-z0-9-]/g, '_')}.html`)
  fs.writeFileSync(file, html, 'utf-8')
  return { file, data, code }
}

/** Record an issued report in lab_reports + audit (CP3: report history is maintained). */
export function recordReportIssue(db: Database.Database, data: LabReportData, kind: LabReportKind, filePath: string | null, actorId: number): void {
  db.prepare(
    'INSERT INTO lab_reports (report_code, bill_id, kind, file_path, generated_by) VALUES (?, ?, ?, ?, ?)'
  ).run(data.report_code, data.bill.id, kind, filePath, actorId)
  writeAudit(db, {
    userId: actorId,
    action: kind === 'PDF' ? 'REPORT_PDF_EXPORTED' : 'REPORT_PRINTED',
    entityType: 'lab_report',
    entityId: data.report_code,
    newValue: {
      report_code: data.report_code,
      bill_number: data.bill.bill_number,
      patient_code: data.bill.patient_code,
      tests: data.tests.length,
      file_path: filePath
    }
  })
}

export async function printLabReport(db: Database.Database, dataDir: string, billId: number, actorId: number): Promise<string> {
  const { file, data } = renderReportFile(db, dataDir, billId)
  await withReceiptWindow(file, async (contents) => {
    await new Promise<void>((resolve) => {
      contents.print({ silent: false, printBackground: true, pageSize: 'A4' }, () => resolve())
    })
  })
  recordReportIssue(db, data, 'PRINT', null, actorId)
  return data.report_code
}

export async function exportLabReportPdf(db: Database.Database, dataDir: string, billId: number, actorId: number): Promise<string> {
  const { file, data } = renderReportFile(db, dataDir, billId)

  const { canceled, filePath } = await dialog.showSaveDialog({
    title: 'Save laboratory report as PDF',
    defaultPath: path.join(appDownloadsDir(), `LabReport-${data.report_code}.pdf`),
    filters: [{ name: 'PDF', extensions: ['pdf'] }]
  })
  if (canceled || !filePath) return ''

  const pdfBuffer = await withReceiptWindow(file, (contents) =>
    contents.printToPDF({ printBackground: true, pageSize: 'A4' })
  )
  fs.writeFileSync(filePath, pdfBuffer)
  recordReportIssue(db, data, 'PDF', filePath, actorId)
  return filePath
}

function appDownloadsDir(): string {
  try {
    const { app } = require('electron') as typeof import('electron')
    return app.getPath('downloads')
  } catch {
    return process.cwd()
  }
}

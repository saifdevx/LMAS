import fs from 'node:fs'
import path from 'node:path'
import { BrowserWindow, dialog } from 'electron'
import type Database from 'better-sqlite3'
import type { ReceiptLayout } from '../../shared/api-types'
import { buildReceiptHtml } from './receipt-html'
import { getBill } from './billing'
import { getSettings } from './settings'
import { writeAudit } from './audit'
import { localDate } from './dashboard'

/**
 * Receipt printing and PDF export using Electron's local printing engine
 * (fully offline — PRD §7.3). A hidden window loads the generated HTML;
 * printing opens the standard print dialog, PDF uses printToPDF.
 */

function nowStamp(): string {
  const d = new Date()
  const pad = (n: number) => n.toString().padStart(2, '0')
  return `${localDate(d)} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function writeReceiptFile(db: Database.Database, dataDir: string, billId: number, layout: ReceiptLayout): { file: string; billNumber: string } {
  const bill = getBill(db, billId)
  const settings = getSettings(db)
  const html = buildReceiptHtml(bill, settings, layout, nowStamp())
  const file = path.join(dataDir, `receipt-${bill.bill_number.replace(/[^A-Za-z0-9-]/g, '_')}.html`)
  fs.writeFileSync(file, html, 'utf-8')
  return { file, billNumber: bill.bill_number }
}

export async function withReceiptWindow<T>(file: string, fn: (contents: Electron.WebContents) => Promise<T>): Promise<T> {
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

export async function printReceipt(db: Database.Database, dataDir: string, billId: number, layout: ReceiptLayout): Promise<void> {
  const { file } = writeReceiptFile(db, dataDir, billId, layout)
  await withReceiptWindow(file, async (contents) => {
    await new Promise<void>((resolve) => {
      contents.print(
        {
          silent: false,
          printBackground: true,
          margins: { marginType: layout === 'thermal' ? 'none' : 'default' },
          pageSize: layout === 'thermal' ? { width: 80000, height: 297000 } : 'A4'
        },
        () => resolve()
      )
    })
  })
}

export async function exportReceiptPdf(db: Database.Database, dataDir: string, billId: number, layout: ReceiptLayout, actorId: number): Promise<string> {
  const { file, billNumber } = writeReceiptFile(db, dataDir, billId, layout)
  const bill = getBill(db, billId)

  const { canceled, filePath } = await dialog.showSaveDialog({
    title: 'Save receipt as PDF',
    defaultPath: path.join(appDownloadsDir(), `Receipt-${billNumber}.pdf`),
    filters: [{ name: 'PDF', extensions: ['pdf'] }]
  })
  if (canceled || !filePath) return ''

  const pdfBuffer = await withReceiptWindow(file, (contents) =>
    contents.printToPDF({
      printBackground: true,
      pageSize: layout === 'thermal' ? { width: 80000, height: 297000 } : 'A4'
    })
  )
  fs.writeFileSync(filePath, pdfBuffer)
  writeAudit(db, {
    userId: actorId,
    action: 'RECEIPT_PDF_EXPORTED',
    entityType: 'bill',
    entityId: bill.id,
    newValue: { bill_number: bill.bill_number, layout, file_path: filePath }
  })
  return filePath
}

function appDownloadsDir(): string {
  try {
    // Lazy import to keep this helper resilient in odd environments.
    const { app } = require('electron') as typeof import('electron')
    return app.getPath('downloads')
  } catch {
    return process.cwd()
  }
}

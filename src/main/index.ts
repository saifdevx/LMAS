import { app, BrowserWindow, Menu } from 'electron'
import path from 'node:path'
import { resolveDataDir, ensureDir } from './paths'
import { openDatabase } from './db/connection'
import { runMigrations } from './db/migrator'
import { seedIfEmpty } from './db/seed'
import { registerIpc } from './ipc/register'
import { autoBackupIfNeeded } from './services/backup'
import type Database from 'better-sqlite3'

/**
 * LMAS main process. Security posture (PRD §7.5):
 *  - contextIsolation ON, nodeIntegration OFF, sandbox ON
 *  - renderer talks to the DB only through the typed preload bridge (IPC)
 *  - window navigation and window.open are denied
 *  - single instance lock
 */

const isSmoke = process.argv.includes('--smoke')

let mainWindow: BrowserWindow | null = null

function createWindow(): void {
  const win = new BrowserWindow({
    width: 1360,
    height: 860,
    minWidth: 1100,
    minHeight: 700,
    show: false,
    backgroundColor: '#f1f5f9',
    title: 'LMAS — Laboratory Management & Accounting System',
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true
    }
  })

  win.once('ready-to-show', () => {
    if (!isSmoke) win.show()
  })

  // Deny any navigation away from the app and any popups.
  win.webContents.on('will-navigate', (event) => event.preventDefault())
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))

  if (process.env['ELECTRON_RENDERER_URL']) {
    void win.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    void win.loadFile(path.join(__dirname, '../renderer/index.html'))
  }

  mainWindow = win
}

const gotLock = app.requestSingleInstanceLock()
if (!gotLock) {
  app.quit()
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore()
      mainWindow.focus()
    }
  })

  app.whenReady().then(() => {
    if (app.isPackaged) Menu.setApplicationMenu(null)

    const dataDir = ensureDir(resolveDataDir(app))
    const db: Database.Database = openDatabase(path.join(dataDir, 'lmas.db'))
    const { from, to } = runMigrations(db)
    seedIfEmpty(db)

    registerIpc(db, dataDir)
    createWindow()

    // Automatic daily backup (PRD §Module J): first launch of each day,
    // never blocks startup — failures are recorded in backup_history.
    if (!isSmoke) autoBackupIfNeeded(db, dataDir)

    if (isSmoke) {
      // CI smoke: verify launch, DB creation/migration and IPC wiring, then exit.
      setTimeout(() => {
        const version = db.pragma('user_version', { simple: true }) as number
        const users = (db.prepare('SELECT COUNT(*) AS n FROM users').get() as { n: number }).n
        console.log(`SMOKE_OK user_version=${version} users=${users} migrated=${from}->${to} dataDir=${dataDir}`)
        app.exit(0)
      }, 1500)
    }
  })

  app.on('window-all-closed', () => {
    app.quit()
  })
}

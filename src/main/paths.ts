import path from 'node:path'
import fs from 'node:fs'

/**
 * Resolves the directory that holds lmas.db and backups.
 *
 * - Packaged app (Windows): %APPDATA%/<appName> via app.getPath('userData')
 *   — NOT the installation folder (PRD §7.4).
 * - Development: <project>/dev-data so data is visible and the repo stays
 *   self-contained.
 * - LMAS_DATA_DIR environment variable overrides both (useful for tests
 *   and portable setups).
 */
export function resolveDataDir(app: {
  isPackaged: boolean
  getPath: (name: 'userData') => string
}): string {
  const envDir = process.env.LMAS_DATA_DIR
  if (envDir && envDir.trim().length > 0) return path.resolve(envDir)
  if (app.isPackaged) return app.getPath('userData')
  return path.join(process.cwd(), 'dev-data')
}

export function ensureDir(dir: string): string {
  fs.mkdirSync(dir, { recursive: true })
  return dir
}

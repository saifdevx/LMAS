import Database from 'better-sqlite3'

/**
 * Open the application database with integrity-focused pragmas.
 * - WAL journaling keeps reads fast and protects against crash corruption.
 * - Foreign keys are ON for every connection (PRD §6.1 rule 3).
 */
export function openDatabase(file: string): Database.Database {
  const db = new Database(file)
  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')
  db.pragma('busy_timeout = 5000')
  return db
}

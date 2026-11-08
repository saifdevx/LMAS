import type Database from 'better-sqlite3'
import { MIGRATIONS } from './migrations'

export function currentVersion(db: Database.Database): number {
  return (db.pragma('user_version', { simple: true }) as number) ?? 0
}

/**
 * Apply pending migrations in order. Each migration runs inside a single
 * transaction (PRD §6.1 rule 12: migrations must preserve existing records).
 */
export function runMigrations(db: Database.Database): { from: number; to: number } {
  const from = currentVersion(db)
  let v = from
  for (const migration of MIGRATIONS) {
    if (migration.version <= v) continue
    const apply = db.transaction(() => {
      db.exec(migration.sql)
      db.pragma(`user_version = ${migration.version}`)
    })
    apply()
    v = migration.version
  }
  return { from, to: v }
}

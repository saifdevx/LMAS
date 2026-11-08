import migration001 from './migrations/001_initial_schema.sql?raw'
import migration002 from './migrations/002_lab_workflow.sql?raw'
import migration003 from './migrations/003_payment_tender_and_advances.sql?raw'

export interface Migration {
  version: number
  name: string
  sql: string
}

/**
 * Ordered, append-only migration list. Never edit an applied migration;
 * add a new entry. Each runs inside a transaction and bumps PRAGMA user_version.
 */
export const MIGRATIONS: Migration[] = [
  { version: 1, name: '001_initial_schema', sql: migration001 },
  { version: 2, name: '002_lab_workflow', sql: migration002 },
  { version: 3, name: '003_payment_tender_and_advances', sql: migration003 }
]

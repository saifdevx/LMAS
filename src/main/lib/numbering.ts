import type Database from 'better-sqlite3'
import type { SettingsMap } from '../../shared/api-types'

/**
 * Human-friendly business codes: PREFIX-YYYY-#### (yearly reset) or
 * PREFIX-#### (continuous). Sequences derive from the highest existing
 * number for the current scope — safe in this single-user desktop app
 * because codes are always generated inside the same transaction as the
 * financial write. Table/column names are internal constants only.
 */
export interface CodeOptions {
  table: string
  column: string
  prefix: string
  yearly: boolean
  width?: number
}

export function cleanPrefix(prefix: string | undefined, fallback: string): string {
  const p = (prefix ?? '').trim().replace(/-+$/, '')
  return p.length > 0 ? p : fallback
}

export function nextCode(db: Database.Database, opts: CodeOptions, settings?: SettingsMap): string {
  const prefix = cleanPrefix(settings?.[`numbering.${opts.prefix.toLowerCase()}Prefix`], opts.prefix)
  const year = new Date().getFullYear()
  const like = opts.yearly ? `${prefix}-${year}-%` : `${prefix}-%`
  const row = db
    .prepare(`SELECT ${opts.column} AS code FROM ${opts.table} WHERE ${opts.column} LIKE ? ORDER BY ${opts.column} DESC LIMIT 1`)
    .get(like) as { code: string } | undefined
  let next = 1
  if (row) {
    const m = row.code.match(/(\d+)$/)
    if (m) next = parseInt(m[1], 10) + 1
  }
  const seq = String(next).padStart(opts.width ?? 4, '0')
  return opts.yearly ? `${prefix}-${year}-${seq}` : `${prefix}-${seq}`
}

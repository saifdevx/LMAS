import type Database from 'better-sqlite3'
import type { Actor } from '../lib/actor'
import { actorHas } from '../lib/actor'
import { writeAudit } from './audit'
import { nextCode } from '../lib/numbering'
import { getSettings } from './settings'

/**
 * Laboratory expense management (PRD §3.7, §Module G, CP4 deliverable).
 * Expenses are immutable once recorded (PRD Module H: financial
 * transactions are never permanently deleted through normal screens);
 * corrections are handled by recording a counter-entry and are audited.
 */

export class ExpenseError extends Error {}

export interface ExpenseCategory {
  id: number
  name: string
  is_active: number
}

export function listExpenseCategories(db: Database.Database, includeInactive = false): ExpenseCategory[] {
  return db
    .prepare(
      `SELECT id, name, is_active FROM expense_categories
       ${includeInactive ? '' : 'WHERE is_active = 1'}
       ORDER BY name`
    )
    .all() as ExpenseCategory[]
}

export function createExpenseCategory(db: Database.Database, actor: Actor, name: string): ExpenseCategory {
  if (!actorHas(actor, 'expenses.manage')) {
    throw new ExpenseError('You do not have permission to manage expense categories')
  }
  const clean = name.trim()
  if (clean.length < 2) throw new ExpenseError('Category name must be at least 2 characters')
  const exists = db.prepare('SELECT id FROM expense_categories WHERE name = ? COLLATE NOCASE').get(clean)
  if (exists) throw new ExpenseError('A category with this name already exists')
  const result = db
    .prepare('INSERT INTO expense_categories (name) VALUES (?)')
    .run(clean)
  writeAudit(db, {
    userId: actor.id,
    action: 'EXPENSE_CATEGORY_CREATE',
    entityType: 'expense_category',
    entityId: Number(result.lastInsertRowid),
    newValue: { name: clean }
  })
  return { id: Number(result.lastInsertRowid), name: clean, is_active: 1 }
}

export function setExpenseCategoryActive(db: Database.Database, actor: Actor, id: number, active: boolean): void {
  if (!actorHas(actor, 'expenses.manage')) {
    throw new ExpenseError('You do not have permission to manage expense categories')
  }
  const row = db.prepare('SELECT id, name, is_active FROM expense_categories WHERE id = ?').get(id) as
    | { id: number; name: string; is_active: number }
    | undefined
  if (!row) throw new ExpenseError('Category not found')
  db.prepare('UPDATE expense_categories SET is_active = ? WHERE id = ?').run(active ? 1 : 0, id)
  writeAudit(db, {
    userId: actor.id,
    action: 'EXPENSE_CATEGORY_SET_ACTIVE',
    entityType: 'expense_category',
    entityId: id,
    oldValue: { is_active: row.is_active },
    newValue: { is_active: active ? 1 : 0 }
  })
}

export interface ExpenseCreateInput {
  category_id: number
  description: string
  amount_paisa: number
  expense_date: string // 'YYYY-MM-DD'
  method: 'CASH' | 'BANK_TRANSFER' | 'CARD' | 'MOBILE_WALLET' | 'CHEQUE'
  reference_number?: string
  notes?: string
}

export interface ExpenseRow {
  id: number
  expense_code: string
  category_id: number
  category_name: string
  description: string
  amount_paisa: number
  expense_date: string
  method: string
  reference_number: string | null
  notes: string | null
  created_by_name: string | null
  created_at: string
}

export function createExpense(db: Database.Database, actor: Actor, input: ExpenseCreateInput): ExpenseRow {
  if (!actorHas(actor, 'expenses.manage')) {
    throw new ExpenseError('You do not have permission to record expenses')
  }
  const amount = Math.round(input.amount_paisa)
  if (!Number.isFinite(amount) || amount <= 0) throw new ExpenseError('Expense amount must be greater than zero')
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.expense_date)) throw new ExpenseError('Expense date must be YYYY-MM-DD')
  const description = input.description.trim()
  if (description.length < 2) throw new ExpenseError('Please describe the expense')
  const cat = db
    .prepare('SELECT id, name, is_active FROM expense_categories WHERE id = ?')
    .get(input.category_id) as { id: number; name: string; is_active: number } | undefined
  if (!cat) throw new ExpenseError('Expense category not found')
  if (!cat.is_active) throw new ExpenseError('This expense category is deactivated')

  const settings = getSettings(db)
  const code = nextCode(db, { table: 'expenses', column: 'expense_code', prefix: 'EXP', yearly: true }, settings)

  const apply = db.transaction(() => {
    const result = db
      .prepare(
        `INSERT INTO expenses (expense_code, category_id, description, amount_paisa, expense_date, method, reference_number, notes, created_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        code,
        input.category_id,
        description,
        amount,
        input.expense_date,
        input.method,
        input.reference_number?.trim() || null,
        input.notes?.trim() || null,
        actor.id
      )
    writeAudit(db, {
      userId: actor.id,
      action: 'EXPENSE_CREATE',
      entityType: 'expense',
      entityId: Number(result.lastInsertRowid),
      newValue: { expense_code: code, amount_paisa: amount, category: cat.name, expense_date: input.expense_date }
    })
    return Number(result.lastInsertRowid)
  })
  const id = apply()
  return getExpense(db, id)
}

export function getExpense(db: Database.Database, id: number): ExpenseRow {
  const row = db
    .prepare(
      `SELECT e.id, e.expense_code, e.category_id, c.name AS category_name, e.description, e.amount_paisa,
              e.expense_date, e.method, e.reference_number, e.notes, u.full_name AS created_by_name, e.created_at
       FROM expenses e
       JOIN expense_categories c ON c.id = e.category_id
       LEFT JOIN users u ON u.id = e.created_by
       WHERE e.id = ?`
    )
    .get(id) as Record<string, unknown> | undefined
  if (!row) throw new ExpenseError('Expense not found')
  return mapExpenseRow(row)
}

export interface ExpenseFilters {
  from?: string
  to?: string
  category_id?: number
  query?: string
}

export interface ExpenseListResult {
  rows: ExpenseRow[]
  total_paisa: number
}

export function listExpenses(db: Database.Database, filters: ExpenseFilters = {}): ExpenseListResult {
  const where: string[] = []
  const params: Array<string | number> = []
  if (filters.from && /^\d{4}-\d{2}-\d{2}$/.test(filters.from)) {
    where.push('e.expense_date >= ?')
    params.push(filters.from)
  }
  if (filters.to && /^\d{4}-\d{2}-\d{2}$/.test(filters.to)) {
    where.push('e.expense_date <= ?')
    params.push(filters.to)
  }
  if (filters.category_id) {
    where.push('e.category_id = ?')
    params.push(filters.category_id)
  }
  const q = (filters.query ?? '').trim()
  if (q.length > 0) {
    const like = `%${q.replace(/[%_\\]/g, (c) => `\\${c}`)}%`
    where.push("(e.description LIKE ? ESCAPE '\\' OR e.expense_code LIKE ? ESCAPE '\\' OR e.notes LIKE ? ESCAPE '\\')")
    params.push(like, like, like)
  }
  const sql = `
    SELECT e.id, e.expense_code, e.category_id, c.name AS category_name, e.description, e.amount_paisa,
           e.expense_date, e.method, e.reference_number, e.notes, u.full_name AS created_by_name, e.created_at
    FROM expenses e
    JOIN expense_categories c ON c.id = e.category_id
    LEFT JOIN users u ON u.id = e.created_by
    ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
    ORDER BY e.expense_date DESC, e.id DESC
    LIMIT 500`
  const rows = db.prepare(sql).all(...params) as Array<Record<string, unknown>>
  const total = rows.reduce((s, r) => s + Number(r.amount_paisa), 0)
  return { rows: rows.map(mapExpenseRow), total_paisa: total }
}

function mapExpenseRow(r: Record<string, unknown>): ExpenseRow {
  return {
    id: Number(r.id),
    expense_code: String(r.expense_code),
    category_id: Number(r.category_id),
    category_name: String(r.category_name),
    description: String(r.description),
    amount_paisa: Number(r.amount_paisa),
    expense_date: String(r.expense_date),
    method: String(r.method),
    reference_number: (r.reference_number as string | null) ?? null,
    notes: (r.notes as string | null) ?? null,
    created_by_name: (r.created_by_name as string | null) ?? null,
    created_at: String(r.created_at)
  }
}

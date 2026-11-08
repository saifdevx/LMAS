import type Database from 'better-sqlite3'
import type { LabTest, LabTestCreateInput, TestCategory } from '../../shared/api-types'
import { nextCode } from '../lib/numbering'
import { writeAudit } from './audit'

/**
 * Laboratory test catalog service (PRD §Module D). Price changes affect
 * only future bills — historical bill_items keep their snapshots.
 */

export class TestCatalogError extends Error {}

function text(v: string | null | undefined): string | null {
  const t = (v ?? '').trim()
  return t.length > 0 ? t : null
}

function validate(input: Partial<LabTestCreateInput>, partial: boolean): void {
  if (!partial || input.name !== undefined) {
    const name = (input.name ?? '').trim()
    if (name.length < 2) throw new TestCatalogError('Test name is required (at least 2 characters).')
    if (name.length > 120) throw new TestCatalogError('Test name is too long.')
  }
  if (input.price_paisa !== undefined) {
    if (!Number.isInteger(input.price_paisa) || input.price_paisa < 0) throw new TestCatalogError('Price must be a non-negative amount.')
  }
  if (input.direct_cost_paisa !== undefined && input.direct_cost_paisa !== null) {
    if (!Number.isInteger(input.direct_cost_paisa) || input.direct_cost_paisa < 0) {
      throw new TestCatalogError('Direct cost must be a non-negative amount.')
    }
  }
  if (input.tat_hours != null && (!Number.isInteger(input.tat_hours) || input.tat_hours < 0)) {
    throw new TestCatalogError('Turnaround time must be a non-negative number of hours.')
  }
  for (const key of ['default_unit', 'default_reference_range'] as const) {
    const v = input[key]
    if (v !== undefined && (v ?? '').trim().length > 120) {
      throw new TestCatalogError(key === 'default_unit' ? 'Unit is too long.' : 'Reference range is too long.')
    }
  }
}

function rowToTest(row: Record<string, unknown>): LabTest {
  return {
    id: Number(row.id),
    test_code: String(row.test_code),
    name: String(row.name),
    category_id: (row.category_id as number | null) ?? null,
    category_name: (row.category_name as string | null) ?? null,
    price_paisa: Number(row.price_paisa),
    direct_cost_paisa: (row.direct_cost_paisa as number | null) ?? null,
    sample_type: (row.sample_type as string | null) ?? null,
    instructions: (row.instructions as string | null) ?? null,
    tat_hours: (row.tat_hours as number | null) ?? null,
    default_unit: (row.default_unit as string | null) ?? null,
    default_reference_range: (row.default_reference_range as string | null) ?? null,
    is_active: Number(row.is_active)
  }
}

function getTest(db: Database.Database, id: number): LabTest {
  const row = db
    .prepare(
      `SELECT t.*, c.name AS category_name FROM laboratory_tests t
       LEFT JOIN test_categories c ON c.id = t.category_id WHERE t.id = ?`
    )
    .get(id) as Record<string, unknown> | undefined
  if (!row) throw new TestCatalogError('Test not found.')
  return rowToTest(row)
}

export interface TestListOptions {
  query?: string
  categoryId?: number | null
  includeInactive?: boolean
}

export function listTests(db: Database.Database, opts: TestListOptions, limit = 50): LabTest[] {
  const where: string[] = []
  const params: Array<string | number> = []
  if (!opts.includeInactive) where.push('t.is_active = 1')
  if (opts.categoryId) {
    where.push('t.category_id = ?')
    params.push(opts.categoryId)
  }
  const q = (opts.query ?? '').trim()
  if (q.length > 0) {
    const like = `%${q.replace(/[%_\\]/g, (c) => `\\${c}`)}%`
    where.push("(t.name LIKE ? ESCAPE '\\' OR t.test_code LIKE ? ESCAPE '\\')")
    params.push(like, like)
  }
  const sql = `SELECT t.*, c.name AS category_name FROM laboratory_tests t
    LEFT JOIN test_categories c ON c.id = t.category_id
    ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
    ORDER BY t.name COLLATE NOCASE LIMIT ?`
  const rows = db.prepare(sql).all(...params, limit) as Array<Record<string, unknown>>
  return rows.map(rowToTest)
}

export function createTest(db: Database.Database, actorId: number | null, input: LabTestCreateInput): LabTest {
  validate(input, false)
  const tx = db.transaction(() => {
    let code = text(input.test_code)
    if (code) {
      const dup = db.prepare('SELECT id FROM laboratory_tests WHERE test_code = ?').get(code)
      if (dup) throw new TestCatalogError(`Test code "${code}" is already in use.`)
    } else {
      code = nextCode(db, { table: 'laboratory_tests', column: 'test_code', prefix: 'TST', yearly: false })
    }
    const info = db
      .prepare(
        `INSERT INTO laboratory_tests (test_code, name, category_id, price_paisa, direct_cost_paisa, sample_type, instructions, tat_hours, default_unit, default_reference_range)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(code, input.name!.trim(), input.category_id ?? null, input.price_paisa, input.direct_cost_paisa ?? null, text(input.sample_type), text(input.instructions), input.tat_hours ?? null, text(input.default_unit), text(input.default_reference_range))
    writeAudit(db, {
      userId: actorId,
      action: 'TEST_CREATED',
      entityType: 'laboratory_test',
      entityId: Number(info.lastInsertRowid),
      newValue: { test_code: code, name: input.name!.trim(), price_paisa: input.price_paisa }
    })
    return Number(info.lastInsertRowid)
  })
  return getTest(db, tx())
}

export function updateTest(db: Database.Database, actorId: number | null, id: number, patch: Partial<LabTestCreateInput>): LabTest {
  const existing = getTest(db, id)
  validate(patch, true)
  const merged = {
    name: patch.name !== undefined ? patch.name.trim() : existing.name,
    category_id: patch.category_id !== undefined ? patch.category_id : existing.category_id,
    price_paisa: patch.price_paisa !== undefined ? patch.price_paisa : existing.price_paisa,
    direct_cost_paisa: patch.direct_cost_paisa !== undefined ? patch.direct_cost_paisa : existing.direct_cost_paisa,
    sample_type: patch.sample_type !== undefined ? text(patch.sample_type) : existing.sample_type,
    instructions: patch.instructions !== undefined ? text(patch.instructions) : existing.instructions,
    tat_hours: patch.tat_hours !== undefined ? patch.tat_hours : existing.tat_hours,
    default_unit: patch.default_unit !== undefined ? text(patch.default_unit) : existing.default_unit,
    default_reference_range: patch.default_reference_range !== undefined ? text(patch.default_reference_range) : existing.default_reference_range
  }
  const tx = db.transaction(() => {
    db.prepare(
      `UPDATE laboratory_tests SET name = ?, category_id = ?, price_paisa = ?, direct_cost_paisa = ?,
       sample_type = ?, instructions = ?, tat_hours = ?, default_unit = ?, default_reference_range = ?, updated_at = datetime('now','localtime') WHERE id = ?`
    ).run(merged.name, merged.category_id, merged.price_paisa, merged.direct_cost_paisa, merged.sample_type, merged.instructions, merged.tat_hours, merged.default_unit, merged.default_reference_range, id)
    writeAudit(db, {
      userId: actorId,
      action: 'TEST_UPDATED',
      entityType: 'laboratory_test',
      entityId: id,
      oldValue: { name: existing.name, price_paisa: existing.price_paisa, direct_cost_paisa: existing.direct_cost_paisa },
      newValue: { name: merged.name, price_paisa: merged.price_paisa, direct_cost_paisa: merged.direct_cost_paisa }
    })
  })
  tx()
  return getTest(db, id)
}

export function setTestActive(db: Database.Database, actorId: number | null, id: number, active: boolean): void {
  const existing = getTest(db, id)
  const tx = db.transaction(() => {
    db.prepare('UPDATE laboratory_tests SET is_active = ?, updated_at = datetime(\'now\',\'localtime\') WHERE id = ?').run(active ? 1 : 0, id)
    writeAudit(db, {
      userId: actorId,
      action: active ? 'TEST_ACTIVATED' : 'TEST_DEACTIVATED',
      entityType: 'laboratory_test',
      entityId: id,
      oldValue: { is_active: existing.is_active },
      newValue: { is_active: active ? 1 : 0 }
    })
  })
  tx()
}

export function listCategories(db: Database.Database): TestCategory[] {
  return db.prepare('SELECT id, name, is_active FROM test_categories ORDER BY sort_order, name').all() as TestCategory[]
}

export function createCategory(db: Database.Database, actorId: number | null, name: string): TestCategory {
  const trimmed = (name ?? '').trim()
  if (trimmed.length < 2) throw new TestCatalogError('Category name is required (at least 2 characters).')
  const dup = db.prepare('SELECT id FROM test_categories WHERE name = ? COLLATE NOCASE').get(trimmed)
  if (dup) throw new TestCatalogError('A category with this name already exists.')
  const maxOrder = (db.prepare('SELECT COALESCE(MAX(sort_order), 0) AS m FROM test_categories').get() as { m: number }).m
  const info = db.prepare('INSERT INTO test_categories (name, sort_order) VALUES (?, ?)').run(trimmed, maxOrder + 1)
  writeAudit(db, { userId: actorId, action: 'TEST_CATEGORY_CREATED', entityType: 'test_category', entityId: Number(info.lastInsertRowid), newValue: { name: trimmed } })
  return { id: Number(info.lastInsertRowid), name: trimmed, is_active: 1 }
}

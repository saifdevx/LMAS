import { useCallback, useEffect, useState } from 'react'
import { Loader2, Plus } from 'lucide-react'
import type { ExpenseCategory, ExpenseListResult, SessionInfo } from '../../../shared/api-types'
import { api } from '../api'
import { formatPKR } from '../../../shared/money'
import { Badge } from '../components/ui/badge'
import { Button } from '../components/ui/button'
import { Input } from '../components/ui/input'
import { Label } from '../components/ui/label'
import { Modal } from '../components/ui/modal'
import { Select } from '../components/ui/select'
import { Table, THead, TH, TD, TR, EmptyRow } from '../components/ui/table'
import { methodLabel, todayStr, addDaysStr } from '../lib/format'
import { useDebounced } from '../lib/useDebounced'

interface ExpensesPageProps {
  session: SessionInfo
}

/** Expense management (PRD §3.7 + §Module G, CP4). */
export function ExpensesPage({ session }: ExpensesPageProps) {
  const [from, setFrom] = useState(addDaysStr(-29))
  const [to, setTo] = useState(todayStr())
  const [categoryId, setCategoryId] = useState('')
  const [query, setQuery] = useState('')
  const [categories, setCategories] = useState<ExpenseCategory[] | null>(null)
  const [result, setResult] = useState<ExpenseListResult | null>(null)
  const [error, setError] = useState('')
  const [showAdd, setShowAdd] = useState(false)
  const [showCategories, setShowCategories] = useState(false)
  const debounced = useDebounced(query)
  const canManage = session.user.permissions.includes('expenses.manage')

  const load = useCallback(() => {
    Promise.all([
      api.expensesList(session.token, {
        from: from || undefined,
        to: to || undefined,
        category_id: categoryId ? Number(categoryId) : undefined,
        query: debounced
      }),
      api.expenseCategories(session.token, false)
    ])
      .then(([list, cats]) => {
        setResult(list)
        setCategories(cats)
        setError('')
      })
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed to load expenses'))
  }, [session.token, from, to, categoryId, debounced])

  useEffect(load, [load])

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="text-lg font-bold text-slate-900">Expenses</h1>
          <p className="text-xs text-slate-500">
            Laboratory operating expenses. Entries are permanent — corrections are made with a new entry, never by deletion.
          </p>
        </div>
        {canManage && (
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setShowCategories(true)}>
              Categories
            </Button>
            <Button onClick={() => setShowAdd(true)}>
              <Plus className="mr-1 h-4 w-4" /> Record expense
            </Button>
          </div>
        )}
      </div>

      <div className="grid grid-cols-2 items-end gap-3 rounded-lg border border-slate-200 bg-white p-3 shadow-sm sm:grid-cols-4">
        <div>
          <Label>From</Label>
          <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        </div>
        <div>
          <Label>To</Label>
          <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
        </div>
        <div>
          <Label>Category</Label>
          <Select value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
            <option value="">All categories</option>
            {(categories ?? []).map((c) => (
              <option key={c.id} value={String(c.id)}>
                {c.name}
              </option>
            ))}
          </Select>
        </div>
        <div>
          <Label>Search</Label>
          <Input placeholder="Description, code, notes…" value={query} onChange={(e) => setQuery(e.target.value)} />
        </div>
      </div>

      {error && <div className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 ring-1 ring-inset ring-red-200">{error}</div>}

      <div className="rounded-lg border border-slate-200 bg-white px-4 py-3 shadow-sm">
        <span className="text-xs uppercase tracking-wide text-slate-500">Total in period</span>
        <span className="ml-3 text-lg font-bold tabular-nums text-slate-900">{result ? formatPKR(result.total_paisa) : '—'}</span>
      </div>

      {result === null ? (
        <div className="flex items-center justify-center py-16 text-slate-400">
          <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Loading expenses…
        </div>
      ) : (
        <Table>
          <THead>
            <tr>
              <TH>Code</TH>
              <TH>Date</TH>
              <TH>Category</TH>
              <TH>Description</TH>
              <TH>Method</TH>
              <TH className="text-right">Amount</TH>
              <TH>By</TH>
            </tr>
          </THead>
          <tbody>
            {result.rows.length === 0 && <EmptyRow colSpan={7}>No expenses recorded for this selection.</EmptyRow>}
            {result.rows.map((e) => (
              <TR key={e.id}>
                <TD className="font-mono text-xs">{e.expense_code}</TD>
                <TD className="whitespace-nowrap">{e.expense_date}</TD>
                <TD>
                  <Badge tone="neutral">{e.category_name}</Badge>
                </TD>
                <TD className="max-w-56">
                  <div className="truncate font-medium text-slate-900">{e.description}</div>
                  {e.notes && <div className="truncate text-xs text-slate-500">{e.notes}</div>}
                </TD>
                <TD className="text-xs">{methodLabel(e.method)}</TD>
                <TD className="text-right font-semibold tabular-nums">{formatPKR(e.amount_paisa)}</TD>
                <TD className="text-xs">{e.created_by_name ?? '—'}</TD>
              </TR>
            ))}
          </tbody>
        </Table>
      )}

      {showAdd && (
        <AddExpenseModal
          session={session}
          categories={categories ?? []}
          onClose={() => setShowAdd(false)}
          onSaved={() => {
            setShowAdd(false)
            load()
          }}
        />
      )}
      {showCategories && (
        <CategoriesModal
          session={session}
          onClose={() => setShowCategories(false)}
          onChanged={() => {
            load()
          }}
        />
      )}
    </div>
  )
}

function AddExpenseModal({
  session,
  categories,
  onClose,
  onSaved
}: {
  session: SessionInfo
  categories: ExpenseCategory[]
  onClose: () => void
  onSaved: () => void
}) {
  const [categoryId, setCategoryId] = useState(categories[0] ? String(categories[0].id) : '')
  const [description, setDescription] = useState('')
  const [amount, setAmount] = useState('')
  const [date, setDate] = useState(todayStr())
  const [method, setMethod] = useState('CASH')
  const [reference, setReference] = useState('')
  const [notes, setNotes] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const submit = () => {
    setBusy(true)
    setError('')
    api
      .expensesCreate(session.token, {
        category_id: Number(categoryId),
        description,
        amount_paisa: Math.round(parseFloat(amount || '0') * 100),
        expense_date: date,
        method: method as 'CASH',
        reference_number: reference || undefined,
        notes: notes || undefined
      })
      .then(onSaved)
      .catch((e) => (setError(e instanceof Error ? e.message : 'Could not save the expense'), setBusy(false)))
  }

  return (
    <Modal title="Record expense" onClose={onClose}>
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label>Category</Label>
            <Select value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
              {categories.map((c) => (
                <option key={c.id} value={String(c.id)}>
                  {c.name}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <Label>Date</Label>
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
        </div>
        <div>
          <Label>Description</Label>
          <Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="e.g. Generator fuel" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label>Amount (PKR)</Label>
            <Input type="number" min="0" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} />
          </div>
          <div>
            <Label>Paid by</Label>
            <Select value={method} onChange={(e) => setMethod(e.target.value)}>
              <option value="CASH">Cash</option>
              <option value="BANK_TRANSFER">Bank Transfer</option>
              <option value="CARD">Card</option>
              <option value="MOBILE_WALLET">Mobile Wallet</option>
              <option value="CHEQUE">Cheque</option>
            </Select>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label>Reference</Label>
            <Input value={reference} onChange={(e) => setReference(e.target.value)} placeholder="Optional" />
          </div>
          <div>
            <Label>Notes</Label>
            <Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Optional" />
          </div>
        </div>
        {error && <div className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
        <div className="flex justify-end gap-2 pt-1">
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={busy || !description || !(parseFloat(amount) > 0) || !categoryId}>
            {busy ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : null} Save expense
          </Button>
        </div>
      </div>
    </Modal>
  )
}

function CategoriesModal({ session, onClose, onChanged }: { session: SessionInfo; onClose: () => void; onChanged: () => void }) {
  const [cats, setCats] = useState<ExpenseCategory[]>([])
  const [name, setName] = useState('')
  const [error, setError] = useState('')

  const load = () => {
    api
      .expenseCategories(session.token, true)
      .then(setCats)
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed to load categories'))
  }
  useEffect(load, [session.token])

  const canManage = session.user.permissions.includes('expenses.manage')

  const add = () => {
    api
      .expenseCategoriesCreate(session.token, name)
      .then(() => (setName(''), load(), onChanged()))
      .catch((e) => setError(e instanceof Error ? e.message : 'Could not add the category'))
  }

  const toggle = (id: number, active: boolean) => {
    api
      .expenseCategoriesSetActive(session.token, id, active)
      .then(() => (load(), onChanged()))
      .catch((e) => setError(e instanceof Error ? e.message : 'Could not update the category'))
  }

  return (
    <Modal title="Expense categories" onClose={onClose}>
      <div className="space-y-3">
        {canManage && (
          <div className="flex gap-2">
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="New category name" />
            <Button onClick={add} disabled={name.trim().length < 2}>
              Add
            </Button>
          </div>
        )}
        {error && <div className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
        <div className="max-h-64 overflow-y-auto">
          <Table>
            <THead>
              <tr>
                <TH>Name</TH>
                <TH>Status</TH>
                {canManage && <TH />}
              </tr>
            </THead>
            <tbody>
              {cats.map((c) => (
                <TR key={c.id}>
                  <TD>{c.name}</TD>
                  <TD>
                    <Badge tone={c.is_active ? 'success' : 'neutral'}>{c.is_active ? 'Active' : 'Inactive'}</Badge>
                  </TD>
                  {canManage && (
                    <TD className="text-right">
                      <Button variant="outline" onClick={() => toggle(c.id, !c.is_active)}>
                        {c.is_active ? 'Deactivate' : 'Activate'}
                      </Button>
                    </TD>
                  )}
                </TR>
              ))}
            </tbody>
          </Table>
        </div>
      </div>
    </Modal>
  )
}

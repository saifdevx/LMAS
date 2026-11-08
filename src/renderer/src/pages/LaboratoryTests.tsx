import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { Loader2, Plus, Power } from 'lucide-react'
import type { LabTest, SessionInfo, TestCategory } from '../../../shared/api-types'
import { api } from '../api'
import { formatPKR, paisaToRupees, toPaisa } from '../../../shared/money'
import { Alert } from '../components/ui/alert'
import { Badge } from '../components/ui/badge'
import { Button } from '../components/ui/button'
import { Input } from '../components/ui/input'
import { Label } from '../components/ui/label'
import { Modal } from '../components/ui/modal'
import { Select } from '../components/ui/select'
import { Table, THead, TH, TD, TR, EmptyRow } from '../components/ui/table'
import { useDebounced } from '../lib/useDebounced'

interface LabTestsPageProps {
  session: SessionInfo
}

export function LaboratoryTestsPage({ session }: LabTestsPageProps) {
  const [query, setQuery] = useState('')
  const [categoryId, setCategoryId] = useState<number | null>(null)
  const [includeInactive, setIncludeInactive] = useState(false)
  const [tests, setTests] = useState<LabTest[] | null>(null)
  const [categories, setCategories] = useState<TestCategory[]>([])
  const [error, setError] = useState('')
  const [editing, setEditing] = useState<LabTest | 'new' | null>(null)
  const [addingCategory, setAddingCategory] = useState(false)
  const debounced = useDebounced(query)
  const canManage = session.user.permissions.includes('lab_tests.manage')

  const load = useCallback(() => {
    api
      .testsList(session.token, { query: debounced, categoryId, includeInactive })
      .then((t) => (setTests(t), setError('')))
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed to load tests'))
  }, [session.token, debounced, categoryId, includeInactive])

  useEffect(load, [load])
  useEffect(() => {
    api.testCategoriesList(session.token).then(setCategories).catch(() => undefined)
  }, [session.token])

  async function toggleActive(t: LabTest) {
    try {
      await api.testsSetActive(session.token, t.id, !t.is_active)
      load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed')
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-lg font-bold text-slate-900">Laboratory tests</h1>
          <p className="text-xs text-slate-500">Test catalog and pricing. Price changes affect only new bills — old bills keep their original prices.</p>
        </div>
        {canManage && (
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setAddingCategory(true)}>
              <Plus className="h-4 w-4" /> Category
            </Button>
            <Button onClick={() => setEditing('new')}>
              <Plus className="h-4 w-4" /> Add test
            </Button>
          </div>
        )}
      </div>

      <div className="grid grid-cols-2 items-end gap-3 rounded-lg border border-slate-200 bg-white p-3 shadow-sm sm:grid-cols-3">
        <div>
          <Label>Search</Label>
          <Input placeholder="Name or code…" value={query} onChange={(e) => setQuery(e.target.value)} />
        </div>
        <div>
          <Label>Category</Label>
          <Select value={categoryId ?? ''} onChange={(e) => setCategoryId(e.target.value === '' ? null : Number(e.target.value))}>
            <option value="">All categories</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </Select>
        </div>
        <label className="flex items-center gap-2 pb-2 text-sm text-slate-600">
          <input type="checkbox" checked={includeInactive} onChange={(e) => setIncludeInactive(e.target.checked)} />
          Show deactivated
        </label>
      </div>

      <Alert kind="error" message={error} />

      {tests === null ? (
        <div className="flex items-center justify-center py-16 text-slate-400">
          <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Loading catalog…
        </div>
      ) : (
        <Table>
          <THead>
            <tr>
              <TH>Code</TH>
              <TH>Test</TH>
              <TH>Category</TH>
              <TH className="text-right">Price</TH>
              <TH className="text-right">Direct cost</TH>
              <TH>Status</TH>
              {canManage && <TH></TH>}
            </tr>
          </THead>
          <tbody>
            {tests.length === 0 && <EmptyRow colSpan={canManage ? 7 : 6}>No tests found — add your first test to the catalog.</EmptyRow>}
            {tests.map((t) => (
              <TR key={t.id}>
                <TD className="font-mono text-xs">{t.test_code}</TD>
                <TD className="font-medium">{t.name}</TD>
                <TD>{t.category_name ?? '—'}</TD>
                <TD className="text-right">{formatPKR(t.price_paisa)}</TD>
                <TD className="text-right">{t.direct_cost_paisa != null ? formatPKR(t.direct_cost_paisa) : '—'}</TD>
                <TD>{t.is_active ? <Badge tone="success">Active</Badge> : <Badge tone="danger">Inactive</Badge>}</TD>
                {canManage && (
                  <TD className="text-right">
                    <div className="flex justify-end gap-1">
                      <Button variant="outline" size="sm" onClick={() => setEditing(t)}>Edit</Button>
                      <Button variant="ghost" size="sm" onClick={() => void toggleActive(t)} title={t.is_active ? 'Deactivate' : 'Activate'}>
                        <Power className={`h-3.5 w-3.5 ${t.is_active ? 'text-red-500' : 'text-emerald-600'}`} />
                      </Button>
                    </div>
                  </TD>
                )}
              </TR>
            ))}
          </tbody>
        </Table>
      )}

      {editing && (
        <TestFormModal
          session={session}
          categories={categories}
          test={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null)
            load()
            api.testCategoriesList(session.token).then(setCategories).catch(() => undefined)
          }}
        />
      )}
      {addingCategory && (
        <CategoryModal
          session={session}
          onClose={() => setAddingCategory(false)}
          onSaved={() => {
            setAddingCategory(false)
            api.testCategoriesList(session.token).then(setCategories).catch(() => undefined)
          }}
        />
      )}
    </div>
  )
}

function TestFormModal({
  session,
  categories,
  test,
  onClose,
  onSaved
}: {
  session: SessionInfo
  categories: TestCategory[]
  test: LabTest | null
  onClose: () => void
  onSaved: () => void
}) {
  const [name, setName] = useState(test?.name ?? '')
  const [code, setCode] = useState(test?.test_code ?? '')
  const [categoryId, setCategoryId] = useState<number | null>(test?.category_id ?? null)
  const [price, setPrice] = useState(test ? paisaToRupees(test.price_paisa).toString() : '')
  const [cost, setCost] = useState(test?.direct_cost_paisa != null ? paisaToRupees(test.direct_cost_paisa).toString() : '')
  const [sampleType, setSampleType] = useState(test?.sample_type ?? '')
  const [tat, setTat] = useState(test?.tat_hours?.toString() ?? '')
  const [instructions, setInstructions] = useState(test?.instructions ?? '')
  const [defaultUnit, setDefaultUnit] = useState(test?.default_unit ?? '')
  const [defaultRange, setDefaultRange] = useState(test?.default_reference_range ?? '')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setError('')
    setBusy(true)
    const payload = {
      name,
      test_code: code.trim() === '' ? undefined : code.trim(),
      category_id: categoryId,
      price_paisa: toPaisa(price || '0'),
      direct_cost_paisa: cost.trim() === '' ? null : toPaisa(cost),
      sample_type: sampleType,
      instructions,
      tat_hours: tat.trim() === '' ? null : Number(tat),
      default_unit: defaultUnit,
      default_reference_range: defaultRange
    }
    try {
      if (test) await api.testsUpdate(session.token, test.id, payload)
      else await api.testsCreate(session.token, payload)
      onSaved()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal title={test ? `Edit test — ${test.test_code}` : 'Add laboratory test'} onClose={onClose} wide>
      <form onSubmit={onSubmit} className="grid gap-3 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <Label>Test name *</Label>
          <Input required value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Complete Blood Count (CBC)" />
        </div>
        <div>
          <Label>Test code {test ? '' : '(blank = automatic)'}</Label>
          <Input value={code} onChange={(e) => setCode(e.target.value)} disabled={!!test} />
        </div>
        <div>
          <Label>Category</Label>
          <Select value={categoryId ?? ''} onChange={(e) => setCategoryId(e.target.value === '' ? null : Number(e.target.value))}>
            <option value="">Uncategorised</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </Select>
        </div>
        <div>
          <Label>Patient price (PKR) *</Label>
          <Input required type="number" min={0} step="0.01" value={price} onChange={(e) => setPrice(e.target.value)} />
        </div>
        <div>
          <Label>Direct laboratory cost (PKR, optional)</Label>
          <Input type="number" min={0} step="0.01" value={cost} onChange={(e) => setCost(e.target.value)} />
        </div>
        <div>
          <Label>Sample type</Label>
          <Input value={sampleType} onChange={(e) => setSampleType(e.target.value)} placeholder="e.g. EDTA blood" />
        </div>
        <div>
          <Label>Turnaround (hours)</Label>
          <Input type="number" min={0} value={tat} onChange={(e) => setTat(e.target.value)} />
        </div>
        <div className="sm:col-span-2">
          <Label>Instructions</Label>
          <Input value={instructions} onChange={(e) => setInstructions(e.target.value)} placeholder="e.g. 8–12 hours fasting preferred" />
        </div>
        <div>
          <Label>Default result unit</Label>
          <Input value={defaultUnit} onChange={(e) => setDefaultUnit(e.target.value)} placeholder="e.g. g/dL, mmol/L" />
        </div>
        <div>
          <Label>Default reference range</Label>
          <Input value={defaultRange} onChange={(e) => setDefaultRange(e.target.value)} placeholder="e.g. 12 – 16 (set by qualified staff)" />
        </div>
        <div className="sm:col-span-2">
          <Alert kind="error" message={error} />
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={busy}>
              {busy && <Loader2 className="h-4 w-4 animate-spin" />} {test ? 'Save changes' : 'Add test'}
            </Button>
          </div>
        </div>
      </form>
    </Modal>
  )
}

function CategoryModal({ session, onClose, onSaved }: { session: SessionInfo; onClose: () => void; onSaved: () => void }) {
  const [name, setName] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError('')
    try {
      await api.testCategoriesCreate(session.token, name)
      onSaved()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal title="Add test category" onClose={onClose}>
      <form onSubmit={onSubmit} className="space-y-3">
        <div>
          <Label>Category name *</Label>
          <Input required autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Hormones" />
        </div>
        <Alert kind="error" message={error} />
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onClose}>Cancel</Button>
          <Button type="submit" disabled={busy}>{busy && <Loader2 className="h-4 w-4 animate-spin" />} Add</Button>
        </div>
      </form>
    </Modal>
  )
}

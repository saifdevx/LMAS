import { useEffect, useState } from 'react'
import { Loader2, Search, UserPlus } from 'lucide-react'
import type { PatientListItem, SessionInfo } from '../../../shared/api-types'
import { api } from '../api'
import { Button } from '../components/ui/button'
import { Input } from '../components/ui/input'
import { Badge } from '../components/ui/badge'
import { Table, THead, TH, TD, TR, EmptyRow } from '../components/ui/table'
import { useDebounced } from '../lib/useDebounced'

interface PatientsPageProps {
  session: SessionInfo
  onOpenProfile: (patientId: number) => void
  onNewRegistration: () => void
}

export function PatientsPage({ session, onOpenProfile, onNewRegistration }: PatientsPageProps) {
  const [query, setQuery] = useState('')
  const [rows, setRows] = useState<PatientListItem[] | null>(null)
  const [error, setError] = useState('')
  const debounced = useDebounced(query)

  useEffect(() => {
    let alive = true
    api
      .patientsSearch(session.token, debounced)
      .then((r) => alive && (setRows(r), setError('')))
      .catch((e) => alive && setError(e instanceof Error ? e.message : 'Search failed'))
    return () => {
      alive = false
    }
  }, [session.token, debounced])

  const canRegister = session.user.permissions.includes('patients.manage')

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-bold text-slate-900">Patients</h1>
          <p className="text-xs text-slate-500">Search by patient ID, name (English or Urdu), phone, registration date (YYYY-MM-DD) or bill number.</p>
        </div>
        {canRegister && (
          <Button onClick={onNewRegistration}>
            <UserPlus className="h-4 w-4" /> Register patient
          </Button>
        )}
      </div>

      <div className="relative max-w-md">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <Input
          className="pl-9"
          placeholder="Type to search patients…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>

      {error && <div className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 ring-1 ring-inset ring-red-200">{error}</div>}

      {rows === null ? (
        <div className="flex items-center justify-center py-16 text-slate-400">
          <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Loading…
        </div>
      ) : (
        <Table>
          <THead>
            <tr>
              <TH>Patient ID</TH>
              <TH>Name</TH>
              <TH>Age / Gender</TH>
              <TH>Phone</TH>
              <TH>Visits</TH>
              <TH>Last visit</TH>
              <TH></TH>
            </tr>
          </THead>
          <tbody>
            {rows.length === 0 && <EmptyRow colSpan={7}>No patients found{query ? ' for this search' : ' yet — register the first patient'}.</EmptyRow>}
            {rows.map((p) => (
              <TR key={p.id}>
                <TD className="font-mono text-xs text-slate-500">{p.patient_code}</TD>
                <TD>
                  <div className="font-medium text-slate-900">{p.full_name}</div>
                  {p.full_name_urdu && <div className="urdu text-xs text-slate-500">{p.full_name_urdu}</div>}
                </TD>
                <TD>
                  {p.age ?? '—'} / {p.gender === 'MALE' ? 'M' : p.gender === 'FEMALE' ? 'F' : 'O'}
                </TD>
                <TD>{p.phone ?? '—'}</TD>
                <TD>{p.visit_count}</TD>
                <TD>{p.last_visit_date ?? '—'}</TD>
                <TD className="text-right">
                  <Button variant="outline" size="sm" onClick={() => onOpenProfile(p.id)}>
                    View
                  </Button>
                </TD>
              </TR>
            ))}
          </tbody>
        </Table>
      )}

      {rows && (
        <p className="text-xs text-slate-400">
          Showing {rows.length} patient{rows.length === 1 ? '' : 's'} <Badge tone="neutral">Checkpoint 2</Badge>
        </p>
      )}
    </div>
  )
}

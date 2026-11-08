import { useCallback, useEffect, useState } from 'react'
import { KeyRound, Loader2, Plus, UserPlus } from 'lucide-react'
import type { AuditLogRow, RoleRow, SessionInfo, UserRow } from '../../../shared/api-types'
import { api } from '../api'
import { Badge } from '../components/ui/badge'
import { Button } from '../components/ui/button'
import { Input } from '../components/ui/input'
import { Label } from '../components/ui/label'
import { Modal } from '../components/ui/modal'
import { Select } from '../components/ui/select'
import { Table, THead, TH, TD, TR, EmptyRow } from '../components/ui/table'
import { Pagination } from './TransactionHistory'
import { useDebounced } from '../lib/useDebounced'

interface UsersPageProps {
  session: SessionInfo
}

/** User management + audit log viewer (PRD §Module J + §8, CP4). */
export function UserManagementPage({ session }: UsersPageProps) {
  const [tab, setTab] = useState<'users' | 'audit'>('users')
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-lg font-bold text-slate-900">User management</h1>
        <p className="text-xs text-slate-500">Accounts, roles and the audit trail. The last active Administrator can never be removed.</p>
      </div>
      <div className="flex gap-2">
        <Button variant={tab === 'users' ? 'default' : 'outline'} onClick={() => setTab('users')}>
          <UserPlus className="mr-1 h-4 w-4" /> Users &amp; roles
        </Button>
        <Button variant={tab === 'audit' ? 'default' : 'outline'} onClick={() => setTab('audit')}>
          Audit log
        </Button>
      </div>
      {tab === 'users' ? <UsersTab session={session} /> : <AuditTab session={session} />}
    </div>
  )
}

function UsersTab({ session }: { session: SessionInfo }) {
  const [users, setUsers] = useState<UserRow[] | null>(null)
  const [roles, setRoles] = useState<RoleRow[]>([])
  const [error, setError] = useState('')
  const [addOpen, setAddOpen] = useState(false)
  const [pwFor, setPwFor] = useState<UserRow | null>(null)
  const [editFor, setEditFor] = useState<UserRow | null>(null)

  const load = useCallback(() => {
    Promise.all([api.usersList(session.token), api.rolesList(session.token)])
      .then(([u, r]) => (setUsers(u), setRoles(r), setError('')))
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed to load users'))
  }, [session.token])
  useEffect(load, [load])

  const toggle = (u: UserRow) => {
    const verb = u.is_active ? 'deactivate' : 'activate'
    if (!window.confirm(`${verb.charAt(0).toUpperCase() + verb.slice(1)} user "${u.username}"?`)) return
    api
      .usersSetActive(session.token, u.id, !u.is_active)
      .then(load)
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed to update the user'))
  }

  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <Button onClick={() => setAddOpen(true)}>
          <Plus className="mr-1 h-4 w-4" /> Add user
        </Button>
      </div>
      {error && <div className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 ring-1 ring-inset ring-red-200">{error}</div>}
      {users === null ? (
        <div className="flex items-center justify-center py-16 text-slate-400">
          <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Loading users…
        </div>
      ) : (
        <Table>
          <THead>
            <tr>
              <TH>Username</TH>
              <TH>Full name</TH>
              <TH>Role</TH>
              <TH>Status</TH>
              <TH>Last login</TH>
              <TH />
            </tr>
          </THead>
          <tbody>
            {users.map((u) => (
              <TR key={u.id}>
                <TD className="font-mono text-xs">{u.username}</TD>
                <TD className="font-medium text-slate-900">{u.full_name}</TD>
                <TD>{u.role_name}</TD>
                <TD>
                  <Badge tone={u.is_active ? 'success' : 'neutral'}>{u.is_active ? 'Active' : 'Inactive'}</Badge>
                  {u.must_change_password === 1 && (
                    <Badge tone="warning">
                      <span className="ml-1">Must change password</span>
                    </Badge>
                  )}
                </TD>
                <TD className="text-xs">{u.last_login_at ?? 'Never'}</TD>
                <TD className="text-right">
                  <div className="flex justify-end gap-2">
                    <Button variant="outline" onClick={() => setEditFor(u)}>
                      Edit
                    </Button>
                    <Button variant="outline" onClick={() => setPwFor(u)}>
                      <KeyRound className="h-4 w-4" />
                    </Button>
                    <Button variant="outline" onClick={() => toggle(u)}>
                      {u.is_active ? 'Deactivate' : 'Activate'}
                    </Button>
                  </div>
                </TD>
              </TR>
            ))}
          </tbody>
        </Table>
      )}

      <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
        <h3 className="text-sm font-semibold text-slate-900">Role permissions</h3>
        <div className="mt-2 grid grid-cols-1 gap-3 md:grid-cols-3">
          {roles.map((r) => (
            <div key={r.id} className="rounded-md border border-slate-200 p-3">
              <div className="text-xs font-semibold text-slate-900">{r.name}</div>
              <p className="mt-0.5 text-[11px] text-slate-500">{r.description}</p>
              <div className="mt-2 max-h-32 overflow-y-auto">
                <ul className="space-y-0.5 text-[11px] text-slate-600">
                  {r.permission_codes.map((c) => (
                    <li key={c} className="font-mono">
                      {c}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          ))}
        </div>
      </div>

      {addOpen && (
        <UserModal
          session={session}
          roles={roles}
          onClose={() => setAddOpen(false)}
          onSaved={() => {
            setAddOpen(false)
            load()
          }}
        />
      )}
      {editFor && (
        <EditUserModal
          session={session}
          user={editFor}
          roles={roles}
          onClose={() => setEditFor(null)}
          onSaved={() => {
            setEditFor(null)
            load()
          }}
        />
      )}
      {pwFor && (
        <PasswordModal
          session={session}
          user={pwFor}
          onClose={() => setPwFor(null)}
          onSaved={() => {
            setPwFor(null)
            load()
          }}
        />
      )}
    </div>
  )
}

function UserModal({
  session,
  roles,
  onClose,
  onSaved
}: {
  session: SessionInfo
  roles: RoleRow[]
  onClose: () => void
  onSaved: () => void
}) {
  const [username, setUsername] = useState('')
  const [fullName, setFullName] = useState('')
  const [roleId, setRoleId] = useState(String(roles[0]?.id ?? ''))
  const [password, setPassword] = useState('')
  const [mustChange, setMustChange] = useState(true)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const submit = () => {
    setBusy(true)
    setError('')
    api
      .usersCreate(session.token, { username, password, full_name: fullName, role_id: Number(roleId), must_change_password: mustChange })
      .then(onSaved)
      .catch((e) => (setError(e instanceof Error ? e.message : 'Could not create the user'), setBusy(false)))
  }

  return (
    <Modal title="Add user" onClose={onClose}>
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label>Username</Label>
            <Input value={username} onChange={(e) => setUsername(e.target.value)} placeholder="e.g. frontdesk2" />
          </div>
          <div>
            <Label>Role</Label>
            <Select value={roleId} onChange={(e) => setRoleId(e.target.value)}>
              {roles.map((r) => (
                <option key={r.id} value={String(r.id)}>
                  {r.name}
                </option>
              ))}
            </Select>
          </div>
        </div>
        <div>
          <Label>Full name</Label>
          <Input value={fullName} onChange={(e) => setFullName(e.target.value)} />
        </div>
        <div>
          <Label>Initial password (min 8 characters)</Label>
          <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
        </div>
        <label className="flex items-center gap-2 text-sm text-slate-700">
          <input type="checkbox" checked={mustChange} onChange={(e) => setMustChange(e.target.checked)} /> Require password change at first login
        </label>
        {error && <div className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
        <div className="flex justify-end gap-2 pt-1">
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={busy || !username || !fullName || password.length < 8 || !roleId}>
            {busy ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : null} Create user
          </Button>
        </div>
      </div>
    </Modal>
  )
}

function EditUserModal({
  session,
  user,
  roles,
  onClose,
  onSaved
}: {
  session: SessionInfo
  user: UserRow
  roles: RoleRow[]
  onClose: () => void
  onSaved: () => void
}) {
  const [fullName, setFullName] = useState(user.full_name)
  const [roleId, setRoleId] = useState(String(user.role_id))
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const submit = () => {
    setBusy(true)
    setError('')
    api
      .usersUpdate(session.token, user.id, { full_name: fullName, role_id: Number(roleId) })
      .then(onSaved)
      .catch((e) => (setError(e instanceof Error ? e.message : 'Could not update the user'), setBusy(false)))
  }

  return (
    <Modal title={`Edit user — ${user.username}`} onClose={onClose}>
      <div className="space-y-3">
        <div>
          <Label>Full name</Label>
          <Input value={fullName} onChange={(e) => setFullName(e.target.value)} />
        </div>
        <div>
          <Label>Role</Label>
          <Select value={roleId} onChange={(e) => setRoleId(e.target.value)}>
            {roles.map((r) => (
              <option key={r.id} value={String(r.id)}>
                {r.name}
              </option>
            ))}
          </Select>
        </div>
        {error && <div className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
        <div className="flex justify-end gap-2 pt-1">
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={busy}>
            {busy ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : null} Save changes
          </Button>
        </div>
      </div>
    </Modal>
  )
}

function PasswordModal({
  session,
  user,
  onClose,
  onSaved
}: {
  session: SessionInfo
  user: UserRow
  onClose: () => void
  onSaved: () => void
}) {
  const [password, setPassword] = useState('')
  const [mustChange, setMustChange] = useState(false)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const submit = () => {
    setBusy(true)
    setError('')
    api
      .usersSetPassword(session.token, user.id, password, mustChange)
      .then(onSaved)
      .catch((e) => (setError(e instanceof Error ? e.message : 'Could not change the password'), setBusy(false)))
  }

  return (
    <Modal title={`Set password — ${user.username}`} onClose={onClose}>
      <div className="space-y-3">
        <div>
          <Label>New password (min 8 characters)</Label>
          <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
        </div>
        <label className="flex items-center gap-2 text-sm text-slate-700">
          <input type="checkbox" checked={mustChange} onChange={(e) => setMustChange(e.target.checked)} /> Require change at next login
        </label>
        {error && <div className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
        <div className="flex justify-end gap-2 pt-1">
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={busy || password.length < 8}>
            {busy ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : null} Set password
          </Button>
        </div>
      </div>
    </Modal>
  )
}

function AuditTab({ session }: { session: SessionInfo }) {
  const [query, setQuery] = useState('')
  const [page, setPage] = useState(1)
  const [data, setData] = useState<{ rows: AuditLogRow[]; total: number } | null>(null)
  const [error, setError] = useState('')
  const debounced = useDebounced(query)

  const load = useCallback(() => {
    api
      .auditList(session.token, page, 50, debounced || undefined)
      .then((r) => (setData(r), setError('')))
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed to load the audit log'))
  }, [session.token, page, debounced])
  useEffect(load, [load])

  const pages = data ? Math.max(1, Math.ceil(data.total / 50)) : 1

  return (
    <div className="space-y-3">
      <div className="max-w-sm">
        <Label>Search</Label>
        <Input placeholder="Action, entity, user…" value={query} onChange={(e) => { setQuery(e.target.value); setPage(1) }} />
      </div>
      {error && <div className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 ring-1 ring-inset ring-red-200">{error}</div>}
      {data === null ? (
        <div className="flex items-center justify-center py-16 text-slate-400">
          <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Loading audit log…
        </div>
      ) : (
        <>
          <div className="max-h-[30rem] overflow-y-auto rounded-lg border border-slate-200 bg-white shadow-sm">
            <Table>
              <THead>
                <tr>
                  <TH>When</TH>
                  <TH>User</TH>
                  <TH>Action</TH>
                  <TH>Entity</TH>
                  <TH>Reason</TH>
                </tr>
              </THead>
              <tbody>
                {data.rows.length === 0 && <EmptyRow colSpan={5}>No audit entries for this search.</EmptyRow>}
                {data.rows.map((a) => (
                  <TR key={a.id}>
                    <TD className="whitespace-nowrap text-xs">{a.created_at}</TD>
                    <TD className="text-xs">{a.user_name ?? 'System'}</TD>
                    <TD>
                      <Badge tone={a.action.includes('FAIL') || a.action.includes('CANCEL') || a.action.includes('REFUND') ? 'warning' : 'info'}>
                        {a.action}
                      </Badge>
                    </TD>
                    <TD className="font-mono text-xs">
                      {a.entity_type}
                      {a.entity_id ? `#${a.entity_id}` : ''}
                    </TD>
                    <TD className="max-w-64">
                      <div className="truncate text-xs" title={a.reason ?? ''}>
                        {a.reason ?? '—'}
                      </div>
                    </TD>
                  </TR>
                ))}
              </tbody>
            </Table>
          </div>
          <Pagination page={page} pages={pages} total={data.total} onPage={setPage} />
        </>
      )}
    </div>
  )
}

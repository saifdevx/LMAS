import { useState } from 'react'
import { KeyRound, Loader2, LogOut, ShieldAlert } from 'lucide-react'
import type { SessionInfo } from '../../../shared/api-types'
import { api } from '../api'
import { Button } from './ui/button'
import { Input } from './ui/input'
import { Label } from './ui/label'
import { Modal } from './ui/modal'
import { useAuth } from '../context/AuthContext'

interface HeaderProps {
  session: SessionInfo
  labName: string
}

export function Header({ session, labName }: HeaderProps) {
  const { logout, refreshSession } = useAuth()
  const [pwOpen, setPwOpen] = useState(false)
  const initials = session.user.fullName
    .split(' ')
    .map((p) => p[0])
    .slice(0, 2)
    .join('')
    .toUpperCase()

  return (
    <header className="flex items-center justify-between border-b border-slate-200 bg-white px-6 py-3">
      <div className="min-w-0">
        <div className="truncate text-sm font-semibold text-slate-900">{labName}</div>
        <div className="text-xs text-slate-500">Laboratory Management &amp; Accounting System</div>
      </div>
      <div className="flex items-center gap-3">
        {session.user.mustChangePassword && (
          <button
            type="button"
            onClick={() => setPwOpen(true)}
            className="hidden items-center gap-1.5 rounded-md bg-amber-50 px-2.5 py-1.5 text-xs text-amber-700 ring-1 ring-inset ring-amber-200 hover:bg-amber-100 md:inline-flex"
          >
            <ShieldAlert className="h-3.5 w-3.5" />
            Default password in use — click here to change it
          </button>
        )}
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-200 text-xs font-semibold text-slate-700">
            {initials || 'U'}
          </div>
          <div className="leading-tight">
            <div className="text-xs font-semibold text-slate-900">{session.user.fullName}</div>
            <div className="text-[11px] text-slate-500">{session.user.roleName}</div>
          </div>
        </div>
        <Button variant="ghost" size="sm" onClick={() => setPwOpen(true)} title="Change your password">
          <KeyRound className="h-4 w-4" />
        </Button>
        <Button variant="ghost" size="sm" onClick={() => void logout()} title="Sign out">
          <LogOut className="h-4 w-4" />
          Sign out
        </Button>
      </div>
      {pwOpen && (
        <ChangeOwnPasswordModal
          session={session}
          onClose={() => setPwOpen(false)}
          onChanged={() => {
            setPwOpen(false)
            void refreshSession()
          }}
        />
      )}
    </header>
  )
}

function ChangeOwnPasswordModal({
  session,
  onClose,
  onChanged
}: {
  session: SessionInfo
  onClose: () => void
  onChanged: () => void
}) {
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const mismatch = confirm.length > 0 && confirm !== next

  const submit = () => {
    setBusy(true)
    setError('')
    api
      .usersChangeOwnPassword(session.token, current, next)
      .then(onChanged)
      .catch((e) => (setError(e instanceof Error ? e.message : 'Could not change the password'), setBusy(false)))
  }

  return (
    <Modal
      title="Change your password"
      subtitle={`${session.user.fullName} (${session.user.username})`}
      onClose={onClose}
    >
      <div className="space-y-3">
        <div>
          <Label>Current password</Label>
          <Input type="password" value={current} onChange={(e) => setCurrent(e.target.value)} autoFocus />
        </div>
        <div>
          <Label>New password (min 8 characters)</Label>
          <Input type="password" value={next} onChange={(e) => setNext(e.target.value)} />
        </div>
        <div>
          <Label>Repeat new password</Label>
          <Input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
          {mismatch && <p className="mt-1 text-xs text-red-600">The two passwords do not match.</p>}
        </div>
        {error && <div className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
        <div className="flex justify-end gap-2 pt-1">
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={busy || !current || next.length < 8 || next !== confirm}>
            {busy ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : null} Change password
          </Button>
        </div>
      </div>
    </Modal>
  )
}

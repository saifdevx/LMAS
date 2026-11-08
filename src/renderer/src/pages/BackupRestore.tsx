import { useCallback, useEffect, useState } from 'react'
import { DatabaseBackup, HardDriveDownload, Loader2, ShieldCheck } from 'lucide-react'
import type { BackupRow, SessionInfo } from '../../../shared/api-types'
import { api } from '../api'
import { Badge } from '../components/ui/badge'
import { Button } from '../components/ui/button'
import { Table, THead, TH, TD, TR, EmptyRow } from '../components/ui/table'

interface BackupPageProps {
  session: SessionInfo
}

/**
 * Backup & Restore (PRD §Module J, CP4): manual + automatic daily backups,
 * backup history, verification and a restore flow with an explicit warning
 * (the application restarts after a restore).
 */
export function BackupRestorePage({ session }: BackupPageProps) {
  const [backups, setBackups] = useState<BackupRow[] | null>(null)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState<'' | 'create' | 'restore'>('')

  const load = useCallback(() => {
    api
      .backupsList(session.token)
      .then((r) => (setBackups(r), setError('')))
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed to load backup history'))
  }, [session.token])
  useEffect(load, [load])

  const create = () => {
    setBusy('create')
    setNotice('')
    api
      .backupsCreate(session.token)
      .then((b) => {
        setBusy('')
        setNotice(`Backup created and verified: ${b.file_path}`)
        load()
      })
      .catch((e) => (setBusy(''), setError(e instanceof Error ? e.message : 'Backup failed')))
  }

  const restore = (b: BackupRow) => {
    const ok = window.confirm(
      `RESTORE WARNING\n\nRestoring will REPLACE the current database with the backup from\n${b.created_at}\n\nAll data entered after that backup will be lost.\nThe application will restart automatically.\n\nContinue?`
    )
    if (!ok) return
    setBusy('restore')
    setError('')
    api
      .backupsRestore(session.token, b.file_path)
      .then(() => setNotice('Restore verified — the application is restarting…'))
      .catch((e) => (setBusy(''), setError(e instanceof Error ? e.message : 'Restore failed')))
  }

  const autoToday = (backups ?? []).some((b) => b.backup_type === 'AUTO' && b.status === 'OK' && b.created_at.slice(0, 10) === new Date().toISOString().slice(0, 10))

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-lg font-bold text-slate-900">Backup &amp; restore</h1>
        <p className="text-xs text-slate-500">
          Backups are verified snapshots of the whole database. An automatic backup runs once per day on the first launch.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
            <DatabaseBackup className="h-4 w-4" /> Create a backup now
          </div>
          <p className="mt-1 text-xs text-slate-500">Saved under the data folder's <span className="font-mono">backups/</span> directory and verified with an integrity check.</p>
          <Button className="mt-3" onClick={create} disabled={busy !== ''}>
            {busy === 'create' ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <ShieldCheck className="mr-1 h-4 w-4" />}
            Back up now
          </Button>
        </div>
        <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
            <HardDriveDownload className="h-4 w-4" /> Automatic daily backup
          </div>
          <p className="mt-1 text-xs text-slate-500">Runs on the first launch of each day.</p>
          <div className="mt-3">
            <Badge tone={autoToday ? 'success' : 'warning'}>{autoToday ? 'Completed today' : 'Not run today yet'}</Badge>
          </div>
        </div>
      </div>

      {error && <div className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 ring-1 ring-inset ring-red-200">{error}</div>}
      {notice && <div className="rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-800 ring-1 ring-inset ring-emerald-200">{notice}</div>}

      {backups === null ? (
        <div className="flex items-center justify-center py-16 text-slate-400">
          <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Loading backup history…
        </div>
      ) : (
        <Table>
          <THead>
            <tr>
              <TH>Created</TH>
              <TH>Type</TH>
              <TH>Status</TH>
              <TH>Verified</TH>
              <TH className="text-right">Size</TH>
              <TH>By</TH>
              <TH />
            </tr>
          </THead>
          <tbody>
            {backups.length === 0 && <EmptyRow colSpan={7}>No backups yet — create one now.</EmptyRow>}
            {backups.map((b) => (
              <TR key={b.id}>
                <TD className="whitespace-nowrap text-xs">{b.created_at}</TD>
                <TD>
                  <Badge tone={b.backup_type === 'AUTO' ? 'info' : 'neutral'}>{b.backup_type}</Badge>
                </TD>
                <TD>
                  <Badge tone={b.status === 'OK' ? 'success' : 'danger'}>{b.status}</Badge>
                </TD>
                <TD>{b.verified ? <Badge tone="success">Yes</Badge> : <Badge tone="warning">No</Badge>}</TD>
                <TD className="text-right tabular-nums">{b.file_size !== null ? `${(b.file_size / 1024).toFixed(0)} KB` : '—'}</TD>
                <TD className="text-xs">{b.created_by_name ?? 'Automatic'}</TD>
                <TD className="text-right">
                  <Button variant="outline" onClick={() => restore(b)} disabled={busy !== ''}>
                    Restore
                  </Button>
                </TD>
              </TR>
            ))}
          </tbody>
        </Table>
      )}

      <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-xs text-amber-900">
        <strong>Before restoring:</strong> restoring replaces the current database with the selected backup. Everything recorded after that
        backup is lost. A safety copy of the current database is kept next to it (file ending in <span className="font-mono">.pre-restore-…</span>).
      </div>
    </div>
  )
}

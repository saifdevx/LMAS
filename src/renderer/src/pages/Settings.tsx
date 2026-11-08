import { useEffect, useMemo, useState } from 'react'
import { CheckCircle2, Loader2, Save, Upload } from 'lucide-react'
import type { SessionInfo, SettingsMap } from '../../../shared/api-types'
import { api } from '../api'
import { Badge } from '../components/ui/badge'
import { Button } from '../components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card'
import { Input } from '../components/ui/input'
import { Label } from '../components/ui/label'

interface SettingsPageProps {
  session: SessionInfo
}

export function SettingsPage({ session }: SettingsPageProps) {
  const [settings, setSettings] = useState<SettingsMap | null>(null)
  const [draft, setDraft] = useState<SettingsMap>({})
  const [error, setError] = useState('')
  const [saved, setSaved] = useState(false)
  const [busy, setBusy] = useState(false)
  const [logoBusy, setLogoBusy] = useState(false)

  const canManage = session.user.permissions.includes('settings.manage')

  useEffect(() => {
    api
      .getSettings()
      .then((s) => {
        setSettings(s)
        setDraft({})
      })
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load settings'))
  }, [])

  const current = useMemo<SettingsMap>(() => ({ ...(settings ?? {}), ...draft }), [settings, draft])

  function set(key: string, value: string) {
    setSaved(false)
    setDraft((d) => ({ ...d, [key]: value }))
  }

  async function onSave() {
    if (Object.keys(draft).length === 0) return
    setBusy(true)
    setError('')
    try {
      const updated = await api.updateSettings(session.token, draft)
      setSettings(updated)
      setDraft({})
      setSaved(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save settings')
    } finally {
      setBusy(false)
    }
  }

  if (!settings) {
    return (
      <div className="flex items-center justify-center py-20 text-slate-400">
        <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Loading settings…
      </div>
    )
  }

  const dirty = Object.keys(draft).length > 0
  const ratePercent = ((Number(current['app.defaultCommissionRateBp']) || 0) / 100).toString()

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-bold text-slate-900">Settings</h1>
          <p className="text-xs text-slate-500">Laboratory profile and application configuration.</p>
        </div>
        {!canManage && <Badge tone="warning">Read-only — requires settings permission</Badge>}
      </div>

      {error && (
        <div className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 ring-1 ring-inset ring-red-200">{error}</div>
      )}
      {saved && (
        <div className="flex items-center gap-2 rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-700 ring-1 ring-inset ring-emerald-200">
          <CheckCircle2 className="h-4 w-4" /> Settings saved.
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Laboratory profile</CardTitle>
          <CardDescription>Shown on receipts, reports and the application header.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <Label htmlFor="lab.name">
              Laboratory name <span className="text-red-500">*</span>
            </Label>
            <Input
              id="lab.name"
              disabled={!canManage}
              value={current['lab.name'] ?? ''}
              onChange={(e) => set('lab.name', e.target.value)}
            />
          </div>
          <div className="sm:col-span-2">
            <Label htmlFor="lab.address">Address</Label>
            <Input
              id="lab.address"
              disabled={!canManage}
              value={current['lab.address'] ?? ''}
              onChange={(e) => set('lab.address', e.target.value)}
              placeholder="Street, area, Dera Ismail Khan"
            />
          </div>
          <div>
            <Label htmlFor="lab.phone">Phone number</Label>
            <Input
              id="lab.phone"
              disabled={!canManage}
              value={current['lab.phone'] ?? ''}
              onChange={(e) => set('lab.phone', e.target.value)}
              placeholder="0966-000000"
            />
          </div>
          <div>
            <Label htmlFor="lab.email">Email (optional)</Label>
            <Input
              id="lab.email"
              disabled={!canManage}
              value={current['lab.email'] ?? ''}
              onChange={(e) => set('lab.email', e.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="lab.reportHeader">Report header</Label>
            <Input
              id="lab.reportHeader"
              disabled={!canManage}
              value={current['lab.reportHeader'] ?? ''}
              onChange={(e) => set('lab.reportHeader', e.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="lab.receiptFooter">Receipt footer</Label>
            <Input
              id="lab.receiptFooter"
              disabled={!canManage}
              value={current['lab.receiptFooter'] ?? ''}
              onChange={(e) => set('lab.receiptFooter', e.target.value)}
            />
          </div>
          <div className="sm:col-span-2">
            <Label>Laboratory logo (used on receipts)</Label>
            <div className="flex items-center gap-3">
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={!canManage || logoBusy}
                onClick={async () => {
                  setLogoBusy(true)
                  setError('')
                  try {
                    const s = await api.uploadLogo(session.token)
                    setSettings(s)
                    setDraft({})
                    setSaved(false)
                  } catch (err) {
                    setError(err instanceof Error ? err.message : 'Logo upload failed')
                  } finally {
                    setLogoBusy(false)
                  }
                }}
              >
                {logoBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />} Upload logo…
              </Button>
              <span className="text-xs text-slate-500">
                {current['lab.logoPath'] ? `Current: ${current['lab.logoPath'].split(/[\\/]/).pop()}` : 'No logo selected (PNG/JPG/SVG)'}
              </span>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Financial defaults</CardTitle>
          <CardDescription>
            The active commission policy is clearly displayed (PRD §3.2). Changing the default rate never
            affects historical bills — each finalized bill stores its own rate snapshot.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <div>
            <Label htmlFor="rate">Default commission rate (%)</Label>
            <Input
              id="rate"
              type="number"
              min={0}
              max={100}
              step="0.5"
              disabled={!canManage}
              value={ratePercent}
              onChange={(e) => {
                const pct = Number(e.target.value)
                if (!Number.isFinite(pct)) return
                set('app.defaultCommissionRateBp', String(Math.round(pct * 100)))
              }}
            />
            <p className="mt-1 text-[11px] text-slate-400">PRD default: 50% of the eligible commission amount.</p>
          </div>
          <div>
            <Label htmlFor="basis">Commission calculation policy (active)</Label>
            <select
              id="basis"
              disabled={!canManage}
              className="h-9 w-full rounded-md border border-slate-300 bg-white px-2 text-sm focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-500/30 disabled:bg-slate-50"
              value={current['app.commissionBasis'] ?? 'NET_BILL'}
              onChange={(e) => set('app.commissionBasis', e.target.value)}
            >
              <option value="NET_BILL">Net bill amount after discounts (default)</option>
              <option value="COLLECTED">Amount actually collected from the patient</option>
            </select>
            <p className="mt-1 text-[11px] text-slate-400">
              Active policy: <strong>{current['app.commissionBasis'] === 'COLLECTED' ? 'Collected amount' : 'Net bill after discount'}</strong>
            </p>
          </div>
          <div>
            <Label>Currency (fixed)</Label>
            <Input value={current['app.currency'] ?? 'PKR'} disabled />
          </div>
          <div>
            <Label>Date format (fixed)</Label>
            <Input value={current['app.dateFormat'] ?? 'DD-MM-YYYY'} disabled />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Numbering prefixes</CardTitle>
          <CardDescription>Used to generate bill, patient and report numbers.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-3">
          <div>
            <Label htmlFor="billPrefix">Bill prefix</Label>
            <Input
              id="billPrefix"
              disabled={!canManage}
              value={current['numbering.billPrefix'] ?? ''}
              onChange={(e) => set('numbering.billPrefix', e.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="patientPrefix">Patient prefix</Label>
            <Input
              id="patientPrefix"
              disabled={!canManage}
              value={current['numbering.patientPrefix'] ?? ''}
              onChange={(e) => set('numbering.patientPrefix', e.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="reportPrefix">Report prefix</Label>
            <Input
              id="reportPrefix"
              disabled={!canManage}
              value={current['numbering.reportPrefix'] ?? ''}
              onChange={(e) => set('numbering.reportPrefix', e.target.value)}
            />
          </div>
        </CardContent>
      </Card>

      {canManage && (
        <div className="flex items-center justify-end gap-3">
          <span className="text-xs text-slate-400">
            {dirty ? `${Object.keys(draft).length} unsaved change(s)` : 'No unsaved changes'}
          </span>
          <Button onClick={() => void onSave()} disabled={busy || !dirty}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Save settings
          </Button>
        </div>
      )}
    </div>
  )
}

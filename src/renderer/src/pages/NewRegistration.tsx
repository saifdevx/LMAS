import { useEffect, useState, type FormEvent } from 'react'
import { Loader2 } from 'lucide-react'
import { useNavigate } from '../lib/router'
import { api } from '../api'
import { useAuth } from '../context/AuthContext'
import { Button } from '../components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card'
import { Input } from '../components/ui/input'
import { Label } from '../components/ui/label'
import { Select } from '../components/ui/select'
import { Textarea } from '../components/ui/textarea'
import { Alert } from '../components/ui/alert'

export function NewRegistrationPage() {
  const { session } = useAuth()
  const navigate = useNavigate()
  const [fullName, setFullName] = useState('')
  const [fullNameUrdu, setFullNameUrdu] = useState('')
  const [age, setAge] = useState('')
  const [gender, setGender] = useState<'MALE' | 'FEMALE' | 'OTHER'>('MALE')
  const [phone, setPhone] = useState('')
  const [address, setAddress] = useState('')
  const [notes, setNotes] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [saved, setSaved] = useState<{ id: number; code: string; name: string } | null>(null)

  const canManage = session?.user.permissions.includes('patients.manage')

  useEffect(() => {
    if (session && !canManage) setError('You do not have permission to register patients.')
  }, [session, canManage])

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    if (!session) return
    setError('')
    setBusy(true)
    try {
      const patient = await api.patientsCreate(session.token, {
        full_name: fullName,
        full_name_urdu: fullNameUrdu,
        age: age.trim() === '' ? null : Number(age),
        gender,
        phone,
        address,
        notes
      })
      setSaved({ id: patient.id, code: patient.patient_code, name: patient.full_name })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Registration failed')
    } finally {
      setBusy(false)
    }
  }

  function resetForm() {
    setFullName('')
    setFullNameUrdu('')
    setAge('')
    setGender('MALE')
    setPhone('')
    setAddress('')
    setNotes('')
    setSaved(null)
    setError('')
  }

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="mb-1 text-lg font-bold text-slate-900">New patient registration</h1>
      <p className="mb-4 text-xs text-slate-500">Fields marked * are required. Names can be entered in English and Urdu.</p>

      {saved ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-emerald-700">Patient registered</CardTitle>
            <CardDescription>
              {saved.name} — ID <span className="font-mono">{saved.code}</span>
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            <Button onClick={() => navigate('billing', { patientId: saved.id })}>Create bill for this patient</Button>
            <Button variant="outline" onClick={() => navigate('patient-profile', { patientId: saved.id })}>
              Open patient profile
            </Button>
            <Button variant="ghost" onClick={resetForm}>
              Register another
            </Button>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="pt-4">
            <form onSubmit={onSubmit} className="grid gap-4 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <Label htmlFor="fullName">
                  Patient name (English) <span className="text-red-500">*</span>
                </Label>
                <Input id="fullName" autoFocus required value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="e.g. Muhammad Imran" />
              </div>
              <div className="sm:col-span-2">
                <Label htmlFor="fullNameUrdu">Patient name (Urdu)</Label>
                <Input id="fullNameUrdu" className="urdu" dir="rtl" value={fullNameUrdu} onChange={(e) => setFullNameUrdu(e.target.value)} placeholder="محمد عمران" />
              </div>
              <div>
                <Label htmlFor="age">Age (years)</Label>
                <Input id="age" type="number" min={0} max={150} value={age} onChange={(e) => setAge(e.target.value)} />
              </div>
              <div>
                <Label htmlFor="gender">
                  Gender <span className="text-red-500">*</span>
                </Label>
                <Select id="gender" value={gender} onChange={(e) => setGender(e.target.value as 'MALE' | 'FEMALE' | 'OTHER')}>
                  <option value="MALE">Male</option>
                  <option value="FEMALE">Female</option>
                  <option value="OTHER">Other</option>
                </Select>
              </div>
              <div>
                <Label htmlFor="phone">Contact number</Label>
                <Input id="phone" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="03xx-xxxxxxx" />
              </div>
              <div>
                <Label htmlFor="address">Address</Label>
                <Input id="address" value={address} onChange={(e) => setAddress(e.target.value)} />
              </div>
              <div className="sm:col-span-2">
                <Label htmlFor="notes">Notes</Label>
                <Textarea id="notes" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
              </div>
              <div className="sm:col-span-2">
                <Alert kind="error" message={error} />
                <div className="flex justify-end gap-2">
                  <Button type="submit" disabled={busy || !canManage}>
                    {busy && <Loader2 className="h-4 w-4 animate-spin" />}
                    Register patient
                  </Button>
                </div>
              </div>
            </form>
          </CardContent>
        </Card>
      )}
    </div>
  )
}

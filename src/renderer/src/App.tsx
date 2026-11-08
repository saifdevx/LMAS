import { useEffect, useMemo, useState } from 'react'
import { AuthProvider, useAuth } from './context/AuthContext'
import { RouterContext, type NavState } from './lib/router'
import { Sidebar } from './components/Sidebar'
import { Header } from './components/Header'
import { BillDetail } from './components/BillDetail'
import { LoginScreen } from './pages/Login'
import { DashboardPage } from './pages/Dashboard'
import { SettingsPage } from './pages/Settings'
import { PatientsPage } from './pages/Patients'
import { PatientProfilePage } from './pages/PatientProfile'
import { NewRegistrationPage } from './pages/NewRegistration'
import { BillingPage } from './pages/Billing'
import { BillsHistoryPage } from './pages/BillsHistory'
import { LaboratoryTestsPage } from './pages/LaboratoryTests'
import { TestResultsPage } from './pages/TestResults'
import { PractitionersPage } from './pages/Practitioners'
import { CommissionManagementPage } from './pages/CommissionManagement'
import { ExpensesPage } from './pages/Expenses'
import { FinancialReportsPage } from './pages/FinancialReports'
import { TransactionHistoryPage } from './pages/TransactionHistory'
import { UserManagementPage } from './pages/UserManagement'
import { BackupRestorePage } from './pages/BackupRestore'
import type { RouteId } from './lib/navigation'
import { api } from './api'

function Shell() {
  const { session, loading } = useAuth()
  const [nav, setNav] = useState<NavState>({ route: 'dashboard' })
  const [labName, setLabName] = useState('LMAS')
  const [profilePatientId, setProfilePatientId] = useState<number | null>(null)
  const [openBillId, setOpenBillId] = useState<number | null>(null)

  useEffect(() => {
    api
      .getSettings()
      .then((s) => {
        if (s['lab.name']) setLabName(s['lab.name'])
      })
      .catch(() => undefined)
  }, [])

  useEffect(() => {
    if (session) setNav({ route: 'dashboard' })
  }, [session?.user.id])

  const routerValue = useMemo(
    () => ({
      nav,
      navigate: (route: RouteId, params?: { patientId?: number }) => {
        if (route === 'patient-profile' && params?.patientId) setProfilePatientId(params.patientId)
        setNav({ route, patientId: params?.patientId })
      }
    }),
    [nav]
  )

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-slate-100 text-sm text-slate-400">
        Starting LMAS…
      </div>
    )
  }

  if (!session) return <LoginScreen />

  return (
    <RouterContext.Provider value={routerValue}>
      <div className="flex h-screen overflow-hidden">
        <Sidebar
          route={nav.route}
          onNavigate={(r) => setNav({ route: r })}
          permissions={session.user.permissions}
        />
        <div className="flex min-w-0 flex-1 flex-col">
          <Header session={session} labName={labName} />
          <main className="flex-1 overflow-y-auto bg-slate-100 p-6">
            {nav.route === 'dashboard' && <DashboardPage session={session} />}
            {nav.route === 'settings' && <SettingsPage session={session} />}
            {nav.route === 'patients' && (
              <PatientsPage
                session={session}
                onOpenProfile={(id) => routerValue.navigate('patient-profile', { patientId: id })}
                onNewRegistration={() => setNav({ route: 'new-registration' })}
              />
            )}
            {nav.route === 'patient-profile' && profilePatientId !== null && (
              <PatientProfilePage
                session={session}
                patientId={profilePatientId}
                onBack={() => setNav({ route: 'patients' })}
                onNewBill={(patientId) => setNav({ route: 'billing', patientId })}
                onOpenBill={(billId) => setOpenBillId(billId)}
              />
            )}
            {nav.route === 'new-registration' && <NewRegistrationPage />}
            {nav.route === 'billing' && <BillingPage session={session} initialPatientId={nav.patientId} />}
            {nav.route === 'bills-history' && <BillsHistoryPage session={session} />}
            {nav.route === 'laboratory-tests' && <LaboratoryTestsPage session={session} />}
            {nav.route === 'test-results' && <TestResultsPage session={session} />}
            {nav.route === 'practitioners' && <PractitionersPage session={session} />}
            {nav.route === 'commission-management' && <CommissionManagementPage session={session} />}
            {nav.route === 'expenses' && <ExpensesPage session={session} />}
            {nav.route === 'financial-reports' && <FinancialReportsPage session={session} />}
            {nav.route === 'transaction-history' && <TransactionHistoryPage session={session} />}
            {nav.route === 'user-management' && <UserManagementPage session={session} />}
            {nav.route === 'backup-restore' && <BackupRestorePage session={session} />}
          </main>
        </div>
      </div>
      {openBillId !== null && (
        <BillDetail session={session} billId={openBillId} onClose={() => setOpenBillId(null)} />
      )}
    </RouterContext.Provider>
  )
}

export default function App() {
  return (
    <AuthProvider>
      <Shell />
    </AuthProvider>
  )
}

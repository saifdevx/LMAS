import {
  LayoutDashboard,
  Users,
  UserPlus,
  ReceiptText,
  History,
  FlaskConical,
  ClipboardList,
  Stethoscope,
  HandCoins,
  Wallet,
  BarChart3,
  ArrowLeftRight,
  UserCog,
  DatabaseBackup,
  Settings,
  type LucideIcon
} from 'lucide-react'

export type RouteId =
  | 'dashboard'
  | 'patients'
  | 'patient-profile'
  | 'new-registration'
  | 'billing'
  | 'bills-history'
  | 'laboratory-tests'
  | 'test-results'
  | 'practitioners'
  | 'commission-management'
  | 'expenses'
  | 'financial-reports'
  | 'transaction-history'
  | 'user-management'
  | 'backup-restore'
  | 'settings'

export interface NavItem {
  id: RouteId
  label: string
  icon: LucideIcon
  permission: string
}

export interface NavGroup {
  label: string
  items: NavItem[]
}

/** Sidebar structure per PRD §5.2; visibility filtered by user permissions. */
export const NAV_GROUPS: NavGroup[] = [
  {
    label: 'Operations',
    items: [
      { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard, permission: 'dashboard.view' },
      { id: 'patients', label: 'Patients', icon: Users, permission: 'patients.view' },
      { id: 'new-registration', label: 'New Registration', icon: UserPlus, permission: 'patients.manage' },
      { id: 'billing', label: 'Billing', icon: ReceiptText, permission: 'billing.manage' },
      { id: 'bills-history', label: 'Bills History', icon: History, permission: 'billing.view' },
      { id: 'laboratory-tests', label: 'Laboratory Tests', icon: FlaskConical, permission: 'lab_tests.view' },
      { id: 'test-results', label: 'Test Results', icon: ClipboardList, permission: 'test_results.view' }
    ]
  },
  {
    label: 'Finance',
    items: [
      { id: 'practitioners', label: 'Practitioners', icon: Stethoscope, permission: 'practitioners.view' },
      { id: 'commission-management', label: 'Commission Management', icon: HandCoins, permission: 'commissions.view' },
      { id: 'expenses', label: 'Expenses', icon: Wallet, permission: 'expenses.view' },
      { id: 'financial-reports', label: 'Financial Reports', icon: BarChart3, permission: 'reports.view' },
      { id: 'transaction-history', label: 'Transaction History', icon: ArrowLeftRight, permission: 'transactions.view' }
    ]
  },
  {
    label: 'Administration',
    items: [
      { id: 'user-management', label: 'User Management', icon: UserCog, permission: 'users.manage' },
      { id: 'backup-restore', label: 'Backup & Restore', icon: DatabaseBackup, permission: 'backup.manage' },
      { id: 'settings', label: 'Settings', icon: Settings, permission: 'settings.view' }
    ]
  }
]

/**
 * Modules not yet implemented, shown as clearly-labelled placeholders
 * (PRD §16.17). Empty since Checkpoint 4 — all 15 navigation entries are
 * live. Kept so future scope additions fail loudly instead of silently
 * rendering a blank page.
 */
export const PLACEHOLDER_META: Partial<Record<RouteId, { checkpoint: number; features: string[] }>> = {}

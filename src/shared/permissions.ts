/**
 * Single source of truth for roles and permissions (PRD §1.3, §7.5).
 * Seeded into the database at first run and used by the renderer to
 * control navigation visibility.
 */

export interface RoleSeed {
  name: string
  description: string
}

export const ROLE_SEED: RoleSeed[] = [
  { name: 'Administrator', description: 'Full access to all modules, settings and administration' },
  { name: 'Receptionist', description: 'Front desk: patient registration, billing, payments, receipts' },
  { name: 'Technician', description: 'Laboratory workflow: samples, test results, reports' }
]

export interface PermissionDef {
  code: string
  module: string
  description: string
}

const P = (code: string, module: string, description: string): PermissionDef => ({ code, module, description })

export const PERMISSIONS: PermissionDef[] = [
  P('dashboard.view', 'dashboard', 'View the dashboard'),
  P('patients.view', 'patients', 'View patients and visit history'),
  P('patients.manage', 'patients', 'Register and edit patients'),
  P('billing.view', 'billing', 'View bills and receipts'),
  P('billing.manage', 'billing', 'Create bills and record patient payments'),
  P('billing.discount', 'billing', 'Apply discounts to bills'),
  P('bills.cancel', 'billing', 'Cancel or adjust finalized bills'),
  P('refunds.issue', 'billing', 'Issue refunds'),
  P('lab_tests.view', 'lab_tests', 'View the laboratory test catalog'),
  P('lab_tests.manage', 'lab_tests', 'Manage tests, prices and categories'),
  P('test_results.view', 'test_results', 'View test results'),
  P('test_results.manage', 'test_results', 'Enter and edit test results'),
  P('results.approve', 'test_results', 'Verify and approve laboratory reports'),
  P('practitioners.view', 'practitioners', 'View practitioners'),
  P('practitioners.manage', 'practitioners', 'Manage practitioners and their commission rates'),
  P('commissions.view', 'commissions', 'View commission ledger and balances'),
  P('commissions.manage', 'commissions', 'Record commission payments to practitioners'),
  P('expenses.view', 'expenses', 'View laboratory expenses'),
  P('expenses.manage', 'expenses', 'Record and edit expenses'),
  P('reports.view', 'reports', 'Generate and export reports'),
  P('transactions.view', 'transactions', 'View transaction history'),
  P('users.manage', 'users', 'Manage users, roles and permissions'),
  P('backup.manage', 'backup', 'Create and restore backups'),
  P('settings.view', 'settings', 'View application settings'),
  P('settings.manage', 'settings', 'Change application settings')
]

export type PermissionCode = (typeof PERMISSIONS)[number]['code']

/** Role -> permission codes. Administrator always receives everything. */
export const ROLE_PERMISSION_MATRIX: Record<string, string[]> = {
  Administrator: PERMISSIONS.map((p) => p.code),
  Receptionist: [
    'dashboard.view',
    'patients.view',
    'patients.manage',
    'billing.view',
    'billing.manage',
    'billing.discount',
    'lab_tests.view',
    'practitioners.view',
    'reports.view',
    'transactions.view',
    'settings.view'
  ],
  Technician: [
    'dashboard.view',
    'patients.view',
    'lab_tests.view',
    'test_results.view',
    'test_results.manage',
    'reports.view',
    'settings.view'
  ]
}

export function hasPermission(permissions: string[], required: string): boolean {
  return permissions.includes(required)
}

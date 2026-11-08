import { contextBridge, ipcRenderer } from 'electron'
import type {
  AddPaymentInput,
  BillListFilters,
  CommissionPaymentInput,
  CreateBillInput,
  ExpenseCreateInput,
  IssueRefundInput,
  LabCreateSampleInput,
  LabSaveResultInput,
  LabTestCreateInput,
  LabUpdateSampleInput,
  LabWorklistFilters,
  LmasApi,
  PatientCreateInput,
  PeriodSpec,
  PractitionerCreateInput,
  ReceiptLayout,
  ReportSpec,
  SettingsMap,
  TestStatus,
  UserCreateInput,
  UserUpdateInput
} from '../shared/api-types'

/**
 * Typed, minimal preload bridge. The renderer only ever sees this API —
 * it has no Node.js access (PRD §7.5). Every channel validates input in
 * the main process.
 */
const api: LmasApi = {
  login: (username, password) => ipcRenderer.invoke('auth:login', { username, password }),
  logout: (token) => ipcRenderer.invoke('auth:logout', { token }),
  getSession: (token) => ipcRenderer.invoke('auth:session', { token }),

  getSettings: () => ipcRenderer.invoke('settings:get'),
  updateSettings: (token, values: SettingsMap) => ipcRenderer.invoke('settings:update', { token, values }),
  uploadLogo: (token) => ipcRenderer.invoke('settings:uploadLogo', { token }),

  getDashboardOverview: (token, period: PeriodSpec) => ipcRenderer.invoke('dashboard:overview', { token, period }),

  patientsCreate: (token, input: PatientCreateInput) => ipcRenderer.invoke('patients:create', { token, input }),
  patientsUpdate: (token, id, input) => ipcRenderer.invoke('patients:update', { token, id, input }),
  patientsSearch: (token, query) => ipcRenderer.invoke('patients:search', { token, query }),
  patientsGet: (token, id) => ipcRenderer.invoke('patients:get', { token, id }),

  practitionersList: (token, includeInactive) => ipcRenderer.invoke('practitioners:list', { token, includeInactive }),
  practitionersCreate: (token, input: PractitionerCreateInput) => ipcRenderer.invoke('practitioners:create', { token, input }),
  practitionersUpdate: (token, id, input) => ipcRenderer.invoke('practitioners:update', { token, id, input }),
  practitionersSetActive: (token, id, active) => ipcRenderer.invoke('practitioners:setActive', { token, id, active }),
  practitionersUpdateRate: (token, id, rateBp, reason) => ipcRenderer.invoke('practitioners:updateRate', { token, id, rate_bp: rateBp, reason }),
  practitionersAccount: (token, id) => ipcRenderer.invoke('practitioners:account', { token, id }),

  testsList: (token, opts) => ipcRenderer.invoke('tests:list', { token, ...opts }),
  testsCreate: (token, input: LabTestCreateInput) => ipcRenderer.invoke('tests:create', { token, input }),
  testsUpdate: (token, id, input) => ipcRenderer.invoke('tests:update', { token, id, input }),
  testsSetActive: (token, id, active) => ipcRenderer.invoke('tests:setActive', { token, id, active }),
  testCategoriesList: (token) => ipcRenderer.invoke('testCategories:list', { token }),
  testCategoriesCreate: (token, name) => ipcRenderer.invoke('testCategories:create', { token, name }),

  billsCreate: (token, input: CreateBillInput) => ipcRenderer.invoke('bills:create', { token, input }),
  billsGet: (token, id) => ipcRenderer.invoke('bills:get', { token, id }),
  billsList: (token, filters: BillListFilters) => ipcRenderer.invoke('bills:list', { token, filters }),
  billsCancel: (token, id, reason) => ipcRenderer.invoke('bills:cancel', { token, id, reason }),
  billsAddPayment: (token, input: AddPaymentInput) => ipcRenderer.invoke('bills:addPayment', { token, input }),

  receiptPrint: (token, billId, layout: ReceiptLayout) => ipcRenderer.invoke('receipt:print', { token, bill_id: billId, layout }),
  receiptPdf: (token, billId, layout: ReceiptLayout) => ipcRenderer.invoke('receipt:pdf', { token, bill_id: billId, layout }),

  labWorklist: (token, filters: LabWorklistFilters) => ipcRenderer.invoke('lab:worklist', { token, filters }),
  labBillWork: (token, billId) => ipcRenderer.invoke('lab:billWork', { token, bill_id: billId }),
  labSaveResult: (token, input: LabSaveResultInput) => ipcRenderer.invoke('lab:saveResult', { token, input }),
  labSetTestStatus: (token, billItemId, status: TestStatus, reason?: string) =>
    ipcRenderer.invoke('lab:setTestStatus', { token, bill_item_id: billItemId, status, reason }),
  labCreateSample: (token, input: LabCreateSampleInput) => ipcRenderer.invoke('lab:createSample', { token, input }),
  labUpdateSample: (token, sampleId, patch: LabUpdateSampleInput, reason?: string) =>
    ipcRenderer.invoke('lab:updateSample', { token, sample_id: sampleId, patch, reason }),
  labVerifyResult: (token, billItemId) => ipcRenderer.invoke('lab:verifyResult', { token, bill_item_id: billItemId }),
  labApproveResult: (token, billItemId) => ipcRenderer.invoke('lab:approveResult', { token, bill_item_id: billItemId }),
  labResetResult: (token, billItemId, reason) => ipcRenderer.invoke('lab:resetResult', { token, bill_item_id: billItemId, reason }),
  labRevisions: (token, billItemId) => ipcRenderer.invoke('lab:revisions', { token, bill_item_id: billItemId }),
  labPatientHistory: (token, patientId) => ipcRenderer.invoke('lab:patientHistory', { token, patient_id: patientId }),
  labTechnicians: (token) => ipcRenderer.invoke('lab:technicians', { token }),
  labReportPrint: (token, billId) => ipcRenderer.invoke('lab:reportPrint', { token, bill_id: billId }),
  labReportPdf: (token, billId) => ipcRenderer.invoke('lab:reportPdf', { token, bill_id: billId }),

  // refunds (Checkpoint 4)
  billsRefund: (token, input: IssueRefundInput) => ipcRenderer.invoke('bills:refund', { token, input }),

  // commissions (Checkpoint 4)
  commissionAccounts: (token, includeInactive) => ipcRenderer.invoke('commissions:accounts', { token, includeInactive }),
  commissionLedger: (token, practitionerId) => ipcRenderer.invoke('commissions:ledger', { token, id: practitionerId }),
  commissionPay: (token, input: CommissionPaymentInput) => ipcRenderer.invoke('commissions:pay', { token, input }),
  commissionNextTxnCode: (token) => ipcRenderer.invoke('commissions:nextTxnCode', { token }),

  // expenses (Checkpoint 4)
  expenseCategories: (token, includeInactive) => ipcRenderer.invoke('expenseCategories:list', { token, includeInactive }),
  expenseCategoriesCreate: (token, name) => ipcRenderer.invoke('expenseCategories:create', { token, name }),
  expenseCategoriesSetActive: (token, id, active) => ipcRenderer.invoke('expenseCategories:setActive', { token, id, active }),
  expensesCreate: (token, input: ExpenseCreateInput) => ipcRenderer.invoke('expenses:create', { token, input }),
  expensesList: (token, filters) => ipcRenderer.invoke('expenses:list', { token, filters }),

  // reports & exports (Checkpoint 4)
  reportsRun: (token, spec: ReportSpec) => ipcRenderer.invoke('reports:run', { token, spec }),
  reportsExportPdf: (token, spec: ReportSpec) => ipcRenderer.invoke('reports:exportPdf', { token, spec }),
  reportsExportExcel: (token, spec: ReportSpec) => ipcRenderer.invoke('reports:exportExcel', { token, spec }),

  // transaction history (Checkpoint 4)
  transactionsList: (token, filters) => ipcRenderer.invoke('transactions:list', { token, filters }),

  // users & roles (Checkpoint 4)
  usersList: (token) => ipcRenderer.invoke('users:list', { token }),
  rolesList: (token) => ipcRenderer.invoke('roles:list', { token }),
  usersCreate: (token, input: UserCreateInput) => ipcRenderer.invoke('users:create', { token, input }),
  usersUpdate: (token, id, input: UserUpdateInput) => ipcRenderer.invoke('users:update', { token, id, input }),
  usersSetActive: (token, id, active) => ipcRenderer.invoke('users:setActive', { token, id, active }),
  usersSetPassword: (token, id, password, mustChange) =>
    ipcRenderer.invoke('users:setPassword', { token, id, password, mustChange }),
  usersChangeOwnPassword: (token, currentPassword, newPassword) =>
    ipcRenderer.invoke('users:changeOwnPassword', { token, current_password: currentPassword, new_password: newPassword }),

  // backups (Checkpoint 4)
  backupsList: (token) => ipcRenderer.invoke('backups:list', { token }),
  backupsCreate: (token) => ipcRenderer.invoke('backups:create', { token }),
  backupsRestore: (token, filePath) => ipcRenderer.invoke('backups:restore', { token, filePath }),
  backupsVerify: (token, filePath) => ipcRenderer.invoke('backups:verify', { token, filePath }),

  // audit log (Checkpoint 4)
  auditList: (token, page, pageSize, query) => ipcRenderer.invoke('audit:list', { token, page, pageSize, query })
}

contextBridge.exposeInMainWorld('lmas', api)

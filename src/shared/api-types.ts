/**
 * Shared API contract between the Electron main process and the renderer.
 * The preload bridge (window.lmas) implements LmasApi exactly.
 */

export type PeriodType = 'today' | 'yesterday' | 'last7' | 'this_month' | 'custom'

export interface PeriodSpec {
  type: PeriodType
  from?: string
  to?: string
}

export interface SessionUser {
  id: number
  username: string
  fullName: string
  roleName: string
  permissions: string[]
  mustChangePassword: boolean
}

export interface SessionInfo {
  token: string
  user: SessionUser
  expiresAt: string
}

// ---------- Dashboard ----------

export interface DashboardPatients {
  totalVisits: number
  distinctPatients: number
  selfVisits: number
  referredVisits: number
}

export interface DashboardTests {
  booked: number
  completed: number
  pending: number
  inProgress: number
  cancelled: number
}

export interface DashboardFinancial {
  grossPaisa: number
  discountPaisa: number
  netPaisa: number
  collectedPaisa: number
  selfBilledPaisa: number
  referredBilledPaisa: number
  expensesPaisa: number
  estimatedProfitPaisa: number
}

export interface DashboardCommission {
  accruedPaisa: number
  paidPaisa: number
  outstandingPaisa: number
  patientOutstandingPaisa: number
}

export interface DashboardOverview {
  periodLabel: string
  from: string
  to: string
  patients: DashboardPatients
  tests: DashboardTests
  financial: DashboardFinancial
  commission: DashboardCommission
}

// ---------- Patients (Checkpoint 2) ----------

export type Gender = 'MALE' | 'FEMALE' | 'OTHER'
export type PatientCategory = 'SELF' | 'REFERRED'
export type PaymentMethod = 'CASH' | 'BANK_TRANSFER' | 'CARD' | 'MOBILE_WALLET' | 'CHEQUE'
export type BillStatus = 'DRAFT' | 'FINALIZED' | 'PARTIALLY_PAID' | 'PAID' | 'CANCELLED' | 'REFUNDED'
export type ReceiptLayout = 'thermal' | 'a4'

export interface PatientCreateInput {
  full_name: string
  full_name_urdu?: string
  age?: number | null
  gender: Gender
  phone?: string
  address?: string
  notes?: string
}

export interface Patient {
  id: number
  patient_code: string
  full_name: string
  full_name_urdu: string | null
  age: number | null
  gender: Gender
  phone: string | null
  address: string | null
  notes: string | null
  created_at: string
}

export interface PatientListItem extends Patient {
  visit_count: number
  last_visit_date: string | null
}

export interface PatientVisitBillRow {
  bill_id: number
  bill_number: string
  status: BillStatus
  net_paisa: number
  paid_paisa: number
  outstanding_paisa: number
}

export interface PatientVisitRow {
  id: number
  visit_code: string
  visit_date: string
  category: PatientCategory
  practitioner_name: string | null
  bills: PatientVisitBillRow[]
}

export interface PatientPaymentRow {
  id: number
  transaction_id: string
  bill_id: number
  bill_number: string
  amount_paisa: number
  method: PaymentMethod
  paid_at: string
}

export interface PatientProfile {
  patient: Patient
  visits: PatientVisitRow[]
  payments: PatientPaymentRow[]
  totals: { billedPaisa: number; paidPaisa: number; outstandingPaisa: number }
}

// ---------- Practitioners (Checkpoint 2) ----------

export interface Practitioner {
  id: number
  practitioner_code: string
  name: string
  clinic_name: string | null
  phone: string | null
  address: string | null
  commission_rate_bp: number
  is_active: number
  notes: string | null
  registered_at: string
}

export interface PractitionerCreateInput {
  name: string
  clinic_name?: string
  phone?: string
  address?: string
  commission_rate_bp: number
  notes?: string
}

export interface PractitionerEntryRow {
  id: number
  bill_id: number
  bill_number: string
  entry_type: 'ACCRUAL' | 'ADJUSTMENT' | 'REVERSAL'
  basis: 'NET_BILL' | 'COLLECTED'
  rate_bp: number
  eligible_paisa: number
  commission_paisa: number
  created_at: string
}

export interface PractitionerPaymentRow {
  id: number
  transaction_id: string
  amount_paisa: number
  method: PaymentMethod
  reference_number: string | null
  paid_at: string
}

export interface PractitionerRateRow {
  id: number
  rate_bp: number
  effective_from: string
  changed_by_name: string | null
  reason: string | null
}

export interface PractitionerAccount {
  practitioner: Practitioner
  totals: {
    referredVisits: number
    bills: number
    eligiblePaisa: number
    accruedPaisa: number
    paidPaisa: number
    outstandingPaisa: number
  }
  entries: PractitionerEntryRow[]
  payments: PractitionerPaymentRow[]
  rateHistory: PractitionerRateRow[]
}

// ---------- Test catalog (Checkpoint 2) ----------

export interface TestCategory {
  id: number
  name: string
  is_active: number
}

export interface LabTest {
  id: number
  test_code: string
  name: string
  category_id: number | null
  category_name: string | null
  price_paisa: number
  direct_cost_paisa: number | null
  sample_type: string | null
  instructions: string | null
  tat_hours: number | null
  default_unit: string | null
  default_reference_range: string | null
  is_active: number
}

export interface LabTestCreateInput {
  name: string
  test_code?: string
  category_id?: number | null
  price_paisa: number
  direct_cost_paisa?: number | null
  sample_type?: string
  instructions?: string
  tat_hours?: number | null
  default_unit?: string
  default_reference_range?: string
}

export interface LabTestUpdateInput extends Partial<LabTestCreateInput> {
  id: number
}

// ---------- Billing (Checkpoint 2) ----------

export interface BillItemView {
  id: number
  test_id: number | null
  test_name: string
  test_code: string
  list_price_paisa: number
  price_paisa: number
  direct_cost_paisa: number | null
  line_total_paisa: number
}

export interface BillPaymentView {
  id: number
  transaction_id: string
  amount_paisa: number
  tendered_paisa: number
  change_paisa: number
  method: PaymentMethod
  reference_number: string | null
  paid_at: string
  received_by_name: string | null
}

export interface BillView {
  id: number
  bill_number: string
  visit_id: number
  visit_code: string
  patient_id: number
  patient_code: string
  patient_name: string
  patient_name_urdu: string | null
  category: PatientCategory
  practitioner_id: number | null
  practitioner_name: string | null
  practitioner_rate_bp: number | null
  commission_basis: 'NET_BILL' | 'COLLECTED' | null
  subtotal_paisa: number
  discount_paisa: number
  net_paisa: number
  commission_paisa: number
  lab_allocation_paisa: number
  status: BillStatus
  bill_date: string
  notes: string | null
  created_by_name: string | null
  created_at: string
  finalized_at: string | null
  items: BillItemView[]
  payments: BillPaymentView[]
  refunds: BillRefundView[]
  paid_paisa: number
  refunded_paisa: number
  outstanding_paisa: number
  patient_advance_paisa: number
}

export interface CreateBillInput {
  patient_id: number
  category: PatientCategory
  practitioner_id?: number | null
  items: Array<{ test_id: number }>
  discount_paisa: number
  /** Amount applied to the bill (not the physical tender). */
  initial_payment_paisa: number
  /** Total amount handed over/transferred by the patient. */
  initial_tendered_paisa?: number
  method?: PaymentMethod
  reference_number?: string
  /** Client-generated unique key; duplicate submission is rejected (PRD Scenario 8). */
  transaction_id: string
  notes?: string
}

export interface AddPaymentInput {
  bill_id: number
  /** Amount applied to the outstanding bill balance. */
  amount_paisa: number
  /** Total cash tendered or bank transfer amount. */
  tendered_paisa?: number
  method: PaymentMethod
  reference_number?: string
  transaction_id: string
  notes?: string
}

export interface BillListFilters {
  from?: string
  to?: string
  status?: string
  category?: PatientCategory
  query?: string
  page?: number
  pageSize?: number
}

export interface BillListRow {
  id: number
  bill_number: string
  bill_date: string
  patient_id: number
  patient_code: string
  patient_name: string
  category: PatientCategory
  practitioner_name: string | null
  net_paisa: number
  paid_paisa: number
  outstanding_paisa: number
  status: BillStatus
}

export interface BillListResult {
  rows: BillListRow[]
  total: number
  page: number
  pageSize: number
}

// ---------- Laboratory workflow (Checkpoint 3) ----------

export type TestStatus = 'PENDING' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED'
export type ResultState = 'DRAFT' | 'VERIFIED' | 'APPROVED'
export type SampleStatus = 'NOT_COLLECTED' | 'COLLECTED' | 'RECEIVED' | 'REJECTED' | 'PROCESSING' | 'COMPLETED'

export interface LabWorklistFilters {
  from?: string
  to?: string
  status?: string // 'ALL' or a TestStatus
  query?: string
}

export interface LabWorklistRow {
  bill_id: number
  bill_number: string
  bill_date: string
  visit_id: number
  visit_code: string
  patient_id: number
  patient_code: string
  patient_name: string
  patient_name_urdu: string | null
  age: number | null
  gender: Gender
  category: PatientCategory
  practitioner_name: string | null
  test_count: number
  completed_count: number
  cancelled_count: number
  verified_count: number
  approved_count: number
  sample_codes: string[]
}

export interface LabSampleView {
  id: number
  sample_code: string
  sample_type: string | null
  status: SampleStatus
  collected_at: string | null
  assigned_technician_id: number | null
  assigned_technician_name: string | null
  notes: string | null
  created_at: string
}

export interface LabResultView {
  bill_item_id: number
  test_id: number | null
  test_name: string
  test_code: string
  status: TestStatus
  result_state: ResultState
  value: string | null
  unit: string | null
  reference_range: string | null
  observations: string | null
  remarks: string | null
  sample_id: number | null
  sample_code: string | null
  catalog_sample_type: string | null
  default_unit: string | null
  default_reference_range: string | null
  entered_by_name: string | null
  entered_at: string | null
  verified_by_name: string | null
  verified_at: string | null
  approved_by_name: string | null
  approved_at: string | null
  updated_at: string
  revision_count: number
}

export interface LabReportRow {
  id: number
  report_code: string
  bill_id: number
  kind: 'PRINT' | 'PDF'
  file_path: string | null
  generated_by_name: string | null
  generated_at: string
}

export interface LabBillWork {
  bill: {
    id: number
    bill_number: string
    bill_date: string
    status: BillStatus
    visit_id: number
    visit_code: string
    patient_id: number
    patient_code: string
    patient_name: string
    patient_name_urdu: string | null
    age: number | null
    gender: Gender
    category: PatientCategory
    practitioner_name: string | null
    notes: string | null
  }
  samples: LabSampleView[]
  results: LabResultView[]
  reports: LabReportRow[]
}

export interface LabSaveResultInput {
  bill_item_id: number
  value?: string
  unit?: string
  reference_range?: string
  observations?: string
  remarks?: string
  sample_id?: number | null
}

export interface LabCreateSampleInput {
  bill_id: number
  sample_type?: string
  status?: SampleStatus
  collected_at?: string | null // 'YYYY-MM-DD HH:MM:SS'
  assigned_technician_id?: number | null
  notes?: string
  link_item_ids?: number[]
}

export interface LabUpdateSampleInput {
  sample_type?: string
  status?: SampleStatus
  collected_at?: string | null
  assigned_technician_id?: number | null
  notes?: string
}

export interface LabRevisionRow {
  id: number
  revision_no: number
  value: string | null
  unit: string | null
  reference_range: string | null
  observations: string | null
  remarks: string | null
  changed_by_name: string | null
  changed_at: string
}

export interface LabTechnician {
  id: number
  full_name: string
}

export interface PatientLabHistoryRow {
  bill_id: number
  bill_number: string
  bill_date: string
  visit_code: string
  test_name: string
  test_code: string
  status: TestStatus
  result_state: ResultState
  value: string | null
  unit: string | null
  sample_code: string | null
  latest_report_code: string | null
  latest_report_at: string | null
}

// ---------- Checkpoint 4: accounting & administration ----------

export interface CommissionAccountRow {
  practitioner_id: number
  practitioner_code: string
  name: string
  clinic_name: string | null
  commission_rate_bp: number
  is_active: number
  accrued_paisa: number
  paid_paisa: number
  outstanding_paisa: number
}

export interface CommissionLedgerEntryRow {
  id: number
  date: string
  entry_type: 'ACCRUAL' | 'ADJUSTMENT' | 'REVERSAL'
  bill_number: string | null
  basis: string
  rate_bp: number
  eligible_paisa: number
  commission_paisa: number
  notes: string | null
  created_by_name: string | null
}

export interface CommissionPaymentRow {
  id: number
  transaction_id: string
  amount_paisa: number
  method: PaymentMethod
  reference_number: string | null
  paid_at: string
  paid_by_name: string | null
  notes: string | null
}

export interface CommissionLedger {
  practitioner: { id: number; practitioner_code: string; name: string; commission_rate_bp: number }
  accrued_paisa: number
  paid_paisa: number
  outstanding_paisa: number
  entries: CommissionLedgerEntryRow[]
  payments: CommissionPaymentRow[]
}

export interface CommissionPaymentInput {
  practitioner_id: number
  amount_paisa: number
  method: PaymentMethod
  reference_number?: string
  notes?: string
  transaction_id: string
}

// ---------- Expenses (Checkpoint 4) ----------

export interface ExpenseCategory {
  id: number
  name: string
  is_active: number
}

export interface ExpenseCreateInput {
  category_id: number
  description: string
  amount_paisa: number
  expense_date: string
  method: PaymentMethod
  reference_number?: string
  notes?: string
}

export interface ExpenseRow {
  id: number
  expense_code: string
  category_id: number
  category_name: string
  description: string
  amount_paisa: number
  expense_date: string
  method: string
  reference_number: string | null
  notes: string | null
  created_by_name: string | null
  created_at: string
}

export interface ExpenseListResult {
  rows: ExpenseRow[]
  total_paisa: number
}

// ---------- Transaction history (Checkpoint 4) ----------

export type TxnType = 'PATIENT_PAYMENT' | 'COMMISSION_PAYMENT' | 'EXPENSE' | 'REFUND' | 'ADJUSTMENT'

export interface TransactionRow {
  txn_id: string
  txn_type: TxnType
  txn_type_label: string
  amount_paisa: number
  txn_at: string
  method: string | null
  reference_number: string | null
  related_ref: string | null
  related_name: string | null
  notes: string | null
  created_by_name: string | null
}

export interface TransactionListResult {
  rows: TransactionRow[]
  total: number
  page: number
  pageSize: number
  inflow_paisa: number
  outflow_paisa: number
}

// ---------- Reports (Checkpoint 4) ----------

export type ReportKind =
  | 'DAILY'
  | 'WEEKLY'
  | 'MONTHLY'
  | 'CUSTOM'
  | 'SELF'
  | 'REFERRED'
  | 'COMMISSIONS'
  | 'EXPENSES'
  | 'OUTSTANDING'
  | 'CASH'
  | 'PROFITABILITY'

export interface ReportColumn {
  key: string
  label: string
  type: 'money' | 'number' | 'text' | 'date'
}

export interface ReportFigure {
  label: string
  paisa?: number
  text?: string
}

export interface ReportResult {
  kind: ReportKind
  title: string
  from: string
  to: string
  generated_at: string
  columns: ReportColumn[]
  rows: Array<Record<string, string | number | null>>
  totals: Record<string, number | null>
  figures: ReportFigure[]
}

export interface ReportSpec {
  kind: ReportKind
  from?: string
  to?: string
  category?: PatientCategory
}

// ---------- Users & roles (Checkpoint 4) ----------

export interface UserRow {
  id: number
  username: string
  full_name: string
  role_id: number
  role_name: string
  is_active: number
  must_change_password: number
  last_login_at: string | null
  created_at: string
}

export interface RoleRow {
  id: number
  name: string
  description: string | null
  permission_codes: string[]
}

export interface UserCreateInput {
  username: string
  password: string
  full_name: string
  role_id: number
  must_change_password?: boolean
}

export interface UserUpdateInput {
  full_name?: string
  role_id?: number
}

// ---------- Backups (Checkpoint 4) ----------

export interface BackupRow {
  id: number
  file_path: string
  file_size: number | null
  backup_type: 'MANUAL' | 'AUTO'
  status: 'OK' | 'FAILED'
  verified: number
  created_by_name: string | null
  created_at: string
}

// ---------- Audit log (Checkpoint 4) ----------

export interface AuditLogRow {
  id: number
  action: string
  entity_type: string
  entity_id: string | null
  old_value: string | null
  new_value: string | null
  reason: string | null
  created_at: string
  user_name: string | null
}

// ---------- Refunds (Checkpoint 4) ----------

export interface BillRefundView {
  id: number
  refund_code: string
  amount_paisa: number
  method: PaymentMethod
  reason: string
  created_at: string
  issued_by_name: string | null
}

export interface IssueRefundInput {
  bill_id: number
  amount_paisa: number
  reason: string
  method: PaymentMethod
  reference_number?: string
}

// ---------- Full API ----------

export type SettingsMap = Record<string, string>

export interface LmasApi {
  // auth
  login(username: string, password: string): Promise<SessionInfo>
  logout(token: string): Promise<void>
  getSession(token: string): Promise<SessionInfo | null>
  // settings
  getSettings(): Promise<SettingsMap>
  updateSettings(token: string, values: SettingsMap): Promise<SettingsMap>
  uploadLogo(token: string): Promise<SettingsMap>
  // dashboard
  getDashboardOverview(token: string, period: PeriodSpec): Promise<DashboardOverview>
  // patients
  patientsCreate(token: string, input: PatientCreateInput): Promise<Patient>
  patientsUpdate(token: string, id: number, input: Partial<PatientCreateInput>): Promise<Patient>
  patientsSearch(token: string, query: string): Promise<PatientListItem[]>
  patientsGet(token: string, id: number): Promise<PatientProfile>
  // practitioners
  practitionersList(token: string, includeInactive: boolean): Promise<Practitioner[]>
  practitionersCreate(token: string, input: PractitionerCreateInput): Promise<Practitioner>
  practitionersUpdate(token: string, id: number, input: Partial<PractitionerCreateInput>): Promise<Practitioner>
  practitionersSetActive(token: string, id: number, active: boolean): Promise<void>
  practitionersUpdateRate(token: string, id: number, rateBp: number, reason: string): Promise<Practitioner>
  practitionersAccount(token: string, id: number): Promise<PractitionerAccount>
  // test catalog
  testsList(token: string, opts: { query?: string; categoryId?: number | null; includeInactive?: boolean }): Promise<LabTest[]>
  testsCreate(token: string, input: LabTestCreateInput): Promise<LabTest>
  testsUpdate(token: string, id: number, input: Partial<LabTestCreateInput>): Promise<LabTest>
  testsSetActive(token: string, id: number, active: boolean): Promise<void>
  testCategoriesList(token: string): Promise<TestCategory[]>
  testCategoriesCreate(token: string, name: string): Promise<TestCategory>
  // billing
  billsCreate(token: string, input: CreateBillInput): Promise<BillView>
  billsGet(token: string, id: number): Promise<BillView>
  billsList(token: string, filters: BillListFilters): Promise<BillListResult>
  billsCancel(token: string, id: number, reason: string): Promise<BillView>
  billsAddPayment(token: string, input: AddPaymentInput): Promise<BillView>
  // receipts
  receiptPrint(token: string, billId: number, layout: ReceiptLayout): Promise<void>
  receiptPdf(token: string, billId: number, layout: ReceiptLayout): Promise<string>
  // laboratory workflow (Checkpoint 3)
  labWorklist(token: string, filters: LabWorklistFilters): Promise<LabWorklistRow[]>
  labBillWork(token: string, billId: number): Promise<LabBillWork>
  labSaveResult(token: string, input: LabSaveResultInput): Promise<LabBillWork>
  labSetTestStatus(token: string, billItemId: number, status: TestStatus, reason?: string): Promise<LabBillWork>
  labCreateSample(token: string, input: LabCreateSampleInput): Promise<LabBillWork>
  labUpdateSample(token: string, sampleId: number, patch: LabUpdateSampleInput, reason?: string): Promise<LabBillWork>
  labVerifyResult(token: string, billItemId: number): Promise<LabBillWork>
  labApproveResult(token: string, billItemId: number): Promise<LabBillWork>
  labResetResult(token: string, billItemId: number, reason: string): Promise<LabBillWork>
  labRevisions(token: string, billItemId: number): Promise<LabRevisionRow[]>
  labPatientHistory(token: string, patientId: number): Promise<PatientLabHistoryRow[]>
  labTechnicians(token: string): Promise<LabTechnician[]>
  labReportPrint(token: string, billId: number): Promise<string>
  labReportPdf(token: string, billId: number): Promise<string>
  // refunds (Checkpoint 4)
  billsRefund(token: string, input: IssueRefundInput): Promise<BillView>
  // commissions (Checkpoint 4)
  commissionAccounts(token: string, includeInactive: boolean): Promise<CommissionAccountRow[]>
  commissionLedger(token: string, practitionerId: number): Promise<CommissionLedger>
  commissionPay(token: string, input: CommissionPaymentInput): Promise<CommissionLedger>
  commissionNextTxnCode(token: string): Promise<string>
  // expenses (Checkpoint 4)
  expenseCategories(token: string, includeInactive: boolean): Promise<ExpenseCategory[]>
  expenseCategoriesCreate(token: string, name: string): Promise<ExpenseCategory>
  expenseCategoriesSetActive(token: string, id: number, active: boolean): Promise<void>
  expensesCreate(token: string, input: ExpenseCreateInput): Promise<ExpenseRow>
  expensesList(token: string, filters: { from?: string; to?: string; category_id?: number; query?: string }): Promise<ExpenseListResult>
  // reports & exports (Checkpoint 4)
  reportsRun(token: string, spec: ReportSpec): Promise<ReportResult>
  reportsExportPdf(token: string, spec: ReportSpec): Promise<string>
  reportsExportExcel(token: string, spec: ReportSpec): Promise<string>
  // transaction history (Checkpoint 4)
  transactionsList(
    token: string,
    filters: { type?: string; from?: string; to?: string; query?: string; page?: number; pageSize?: number }
  ): Promise<TransactionListResult>
  // users & roles (Checkpoint 4)
  usersList(token: string): Promise<UserRow[]>
  rolesList(token: string): Promise<RoleRow[]>
  usersCreate(token: string, input: UserCreateInput): Promise<UserRow>
  usersUpdate(token: string, id: number, input: UserUpdateInput): Promise<UserRow>
  usersSetActive(token: string, id: number, active: boolean): Promise<UserRow>
  usersSetPassword(token: string, id: number, password: string, mustChange: boolean): Promise<void>
  usersChangeOwnPassword(token: string, currentPassword: string, newPassword: string): Promise<void>
  // backups (Checkpoint 4)
  backupsList(token: string): Promise<BackupRow[]>
  backupsCreate(token: string): Promise<BackupRow>
  backupsRestore(token: string, filePath: string): Promise<boolean>
  backupsVerify(token: string, filePath: string): Promise<{ ok: boolean; user_version: number; integrity: string; error?: string }>
  // audit log (Checkpoint 4)
  auditList(token: string, page: number, pageSize: number, query?: string): Promise<{ rows: AuditLogRow[]; total: number }>
}

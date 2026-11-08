import { z } from 'zod'

/** Zod validation for every IPC input (PRD §7.2: validated application services). */

export const loginSchema = z.object({
  username: z.string().trim().min(1, 'Username is required').max(64),
  password: z.string().min(1, 'Password is required').max(128)
})

export const tokenSchema = z.object({ token: z.string().min(10).max(128) })
export const tokenOnly = z.string().min(10).max(128)

export const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be YYYY-MM-DD')

export const periodSchema = z
  .object({
    type: z.enum(['today', 'yesterday', 'last7', 'this_month', 'custom']),
    from: isoDate.optional(),
    to: isoDate.optional()
  })
  .refine((p) => p.type !== 'custom' || (!!p.from && !!p.to), {
    message: 'Custom period requires both from and to dates'
  })

export const updateSettingsSchema = z.object({
  token: tokenOnly,
  values: z
    .record(z.string().max(500))
    .refine((obj) => Object.keys(obj).length > 0 && Object.keys(obj).length <= 50, {
      message: 'Provide between 1 and 50 setting values'
    })
})

export const overviewSchema = z.object({ token: tokenOnly, period: periodSchema })

// ---------- Patients ----------

const optionalText = (max: number) => z.string().trim().max(max).optional()

export const patientCreateSchema = z.object({
  token: tokenOnly,
  input: z.object({
    full_name: z.string().trim().min(2, 'Patient name is required').max(120),
    full_name_urdu: optionalText(120),
    age: z.number().int().min(0).max(150).nullable().optional(),
    gender: z.enum(['MALE', 'FEMALE', 'OTHER']),
    phone: optionalText(24),
    address: optionalText(300),
    notes: optionalText(500)
  })
})

export const patientUpdateSchema = z.object({
  token: tokenOnly,
  id: z.number().int().positive(),
  input: z
    .object({
      full_name: z.string().trim().min(2).max(120).optional(),
      full_name_urdu: optionalText(120),
      age: z.number().int().min(0).max(150).nullable().optional(),
      gender: z.enum(['MALE', 'FEMALE', 'OTHER']).optional(),
      phone: optionalText(24),
      address: optionalText(300),
      notes: optionalText(500)
    })
})

export const patientSearchSchema = z.object({ token: tokenOnly, query: z.string().max(120) })
export const idSchema = z.object({ token: tokenOnly, id: z.number().int().positive() })
export const activeSchema = z.object({ token: tokenOnly, id: z.number().int().positive(), active: z.boolean() })

// ---------- Practitioners ----------

export const practitionerCreateSchema = z.object({
  token: tokenOnly,
  input: z.object({
    name: z.string().trim().min(2, 'Practitioner name is required').max(120),
    clinic_name: optionalText(120),
    phone: optionalText(24),
    address: optionalText(300),
    commission_rate_bp: z.number().int().min(0).max(10000),
    notes: optionalText(500)
  })
})

export const practitionerUpdateSchema = z.object({
  token: tokenOnly,
  id: z.number().int().positive(),
  input: z.object({
    name: z.string().trim().min(2).max(120).optional(),
    clinic_name: optionalText(120),
    phone: optionalText(24),
    address: optionalText(300),
    commission_rate_bp: z.number().int().min(0).max(10000).optional(),
    notes: optionalText(500)
  })
})

export const practitionerRateSchema = z.object({
  token: tokenOnly,
  id: z.number().int().positive(),
  rate_bp: z.number().int().min(0).max(10000),
  reason: z.string().trim().min(3, 'A reason is required').max(300)
})

export const includeInactiveSchema = z.object({ token: tokenOnly, includeInactive: z.boolean() })

// ---------- Test catalog ----------

export const testCreateSchema = z.object({
  token: tokenOnly,
  input: z.object({
    name: z.string().trim().min(2, 'Test name is required').max(120),
    test_code: optionalText(40),
    category_id: z.number().int().positive().nullable().optional(),
    price_paisa: z.number().int().min(0),
    direct_cost_paisa: z.number().int().min(0).nullable().optional(),
    sample_type: optionalText(80),
    instructions: optionalText(500),
    tat_hours: z.number().int().min(0).max(8760).nullable().optional(),
    default_unit: optionalText(120),
    default_reference_range: optionalText(120)
  })
})

export const testUpdateSchema = z.object({
  token: tokenOnly,
  id: z.number().int().positive(),
  input: z.object({
    name: z.string().trim().min(2).max(120).optional(),
    test_code: optionalText(40),
    category_id: z.number().int().positive().nullable().optional(),
    price_paisa: z.number().int().min(0).optional(),
    direct_cost_paisa: z.number().int().min(0).nullable().optional(),
    sample_type: optionalText(80),
    instructions: optionalText(500),
    tat_hours: z.number().int().min(0).max(8760).nullable().optional(),
    default_unit: optionalText(120),
    default_reference_range: optionalText(120)
  })
})

export const testListSchema = z.object({
  token: tokenOnly,
  query: z.string().max(120).optional(),
  categoryId: z.number().int().positive().nullable().optional(),
  includeInactive: z.boolean().optional()
})

export const categoryNameSchema = z.object({ token: tokenOnly, name: z.string().trim().min(2).max(80) })

// ---------- Billing ----------

export const paymentMethodSchema = z.enum(['CASH', 'BANK_TRANSFER', 'CARD', 'MOBILE_WALLET', 'CHEQUE'])

export const billCreateSchema = z.object({
  token: tokenOnly,
  input: z.object({
    patient_id: z.number().int().positive(),
    category: z.enum(['SELF', 'REFERRED']),
    practitioner_id: z.number().int().positive().nullable().optional(),
    items: z.array(z.object({ test_id: z.number().int().positive() })).min(1, 'Add at least one test').max(100),
    discount_paisa: z.number().int().min(0),
    initial_payment_paisa: z.number().int().min(0),
    method: paymentMethodSchema.optional(),
    reference_number: optionalText(80),
    transaction_id: z.string().trim().min(8, 'Transaction reference missing').max(64),
    notes: optionalText(500)
  })
})

export const addPaymentSchema = z.object({
  token: tokenOnly,
  input: z.object({
    bill_id: z.number().int().positive(),
    amount_paisa: z.number().int().positive('Payment must be greater than zero'),
    method: paymentMethodSchema,
    reference_number: optionalText(80),
    transaction_id: z.string().trim().min(8).max(64),
    notes: optionalText(500)
  })
})

export const billListSchema = z.object({
  token: tokenOnly,
  filters: z.object({
    from: isoDate.optional(),
    to: isoDate.optional(),
    status: z.string().max(20).optional(),
    category: z.enum(['SELF', 'REFERRED']).optional(),
    query: z.string().max(120).optional(),
    page: z.number().int().min(1).optional(),
    pageSize: z.number().int().min(5).max(100).optional()
  })
})

export const cancelBillSchema = z.object({
  token: tokenOnly,
  id: z.number().int().positive(),
  reason: z.string().trim().min(3, 'A reason is required').max(300)
})

export const receiptSchema = z.object({
  token: tokenOnly,
  bill_id: z.number().int().positive(),
  layout: z.enum(['thermal', 'a4'])
})

// ---------- Laboratory workflow (Checkpoint 3) ----------

const sampleStatusSchema = z.enum(['NOT_COLLECTED', 'COLLECTED', 'RECEIVED', 'REJECTED', 'PROCESSING', 'COMPLETED'])
const testStatusSchema = z.enum(['PENDING', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED'])
const stampSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}([ T]\d{2}:\d{2}(:\d{2})?)?$/, 'Use YYYY-MM-DD or YYYY-MM-DD HH:MM(:SS)')

export const labWorklistSchema = z.object({
  token: tokenOnly,
  filters: z.object({
    from: isoDate.optional(),
    to: isoDate.optional(),
    status: z.string().max(20).optional(),
    query: z.string().max(120).optional()
  })
})

export const labBillSchema = z.object({ token: tokenOnly, bill_id: z.number().int().positive() })
export const labItemSchema = z.object({ token: tokenOnly, bill_item_id: z.number().int().positive() })
export const labPatientSchema = z.object({ token: tokenOnly, patient_id: z.number().int().positive() })

export const labSaveResultSchema = z.object({
  token: tokenOnly,
  input: z.object({
    bill_item_id: z.number().int().positive(),
    value: z.string().max(500).optional(),
    unit: z.string().max(120).optional(),
    reference_range: z.string().max(120).optional(),
    observations: z.string().max(1000).optional(),
    remarks: z.string().max(1000).optional(),
    sample_id: z.number().int().positive().nullable().optional()
  })
})

export const labTestStatusSchema = z.object({
  token: tokenOnly,
  bill_item_id: z.number().int().positive(),
  status: testStatusSchema,
  reason: z.string().trim().max(300).optional()
})

export const labCreateSampleSchema = z.object({
  token: tokenOnly,
  input: z.object({
    bill_id: z.number().int().positive(),
    sample_type: optionalText(80),
    status: sampleStatusSchema.optional(),
    collected_at: stampSchema.nullable().optional(),
    assigned_technician_id: z.number().int().positive().nullable().optional(),
    notes: optionalText(500),
    link_item_ids: z.array(z.number().int().positive()).max(100).optional()
  })
})

export const labUpdateSampleSchema = z.object({
  token: tokenOnly,
  sample_id: z.number().int().positive(),
  patch: z.object({
    sample_type: optionalText(80),
    status: sampleStatusSchema.optional(),
    collected_at: stampSchema.nullable().optional(),
    assigned_technician_id: z.number().int().positive().nullable().optional(),
    notes: optionalText(500)
  }),
  reason: z.string().trim().max(300).optional()
})

export const labResetResultSchema = z.object({
  token: tokenOnly,
  bill_item_id: z.number().int().positive(),
  reason: z.string().trim().min(3, 'A reason is required').max(300)
})

// ---------- Refunds (Checkpoint 4) ----------

export const refundSchema = z.object({
  token: tokenOnly,
  input: z.object({
    bill_id: z.number().int().positive(),
    amount_paisa: z.number().int().positive('Refund must be greater than zero'),
    reason: z.string().trim().min(3, 'A reason is required').max(300),
    method: paymentMethodSchema,
    reference_number: optionalText(80)
  })
})

// ---------- Commissions (Checkpoint 4) ----------

export const commissionPaySchema = z.object({
  token: tokenOnly,
  input: z.object({
    practitioner_id: z.number().int().positive(),
    amount_paisa: z.number().int().positive('Commission payment must be greater than zero'),
    method: paymentMethodSchema,
    reference_number: optionalText(80),
    notes: optionalText(300),
    transaction_id: z.string().trim().min(3).max(64)
  })
})

export const commissionTxnCodeSchema = z.object({ token: tokenOnly })

// ---------- Expenses (Checkpoint 4) ----------

export const expenseCreateSchema = z.object({
  token: tokenOnly,
  input: z.object({
    category_id: z.number().int().positive(),
    description: z.string().trim().min(2, 'Please describe the expense').max(300),
    amount_paisa: z.number().int().positive('Expense must be greater than zero'),
    expense_date: isoDate,
    method: paymentMethodSchema,
    reference_number: optionalText(80),
    notes: optionalText(300)
  })
})

export const expenseListSchema = z.object({
  token: tokenOnly,
  filters: z.object({
    from: isoDate.optional(),
    to: isoDate.optional(),
    category_id: z.number().int().positive().optional(),
    query: z.string().max(120).optional()
  })
})

// ---------- Reports (Checkpoint 4) ----------

export const reportSpecSchema = z.object({
  token: tokenOnly,
  spec: z.object({
    kind: z.enum([
      'DAILY',
      'WEEKLY',
      'MONTHLY',
      'CUSTOM',
      'SELF',
      'REFERRED',
      'COMMISSIONS',
      'EXPENSES',
      'OUTSTANDING',
      'CASH',
      'PROFITABILITY'
    ]),
    from: isoDate.optional(),
    to: isoDate.optional(),
    category: z.enum(['SELF', 'REFERRED']).optional()
  })
})

// ---------- Transactions (Checkpoint 4) ----------

export const transactionsListSchema = z.object({
  token: tokenOnly,
  filters: z.object({
    type: z.string().max(24).optional(),
    from: isoDate.optional(),
    to: isoDate.optional(),
    query: z.string().max(120).optional(),
    page: z.number().int().min(1).optional(),
    pageSize: z.number().int().min(10).max(200).optional()
  })
})

// ---------- Users (Checkpoint 4) ----------

export const userCreateSchema = z.object({
  token: tokenOnly,
  input: z.object({
    username: z.string().trim().regex(/^[A-Za-z0-9._-]{3,32}$/, 'Username must be 3-32 characters (letters, numbers, . _ -)'),
    password: z.string().min(8, 'Password must be at least 8 characters').max(128),
    full_name: z.string().trim().min(2, 'Full name is required').max(120),
    role_id: z.number().int().positive(),
    must_change_password: z.boolean().optional()
  })
})

export const userUpdateSchema = z.object({
  token: tokenOnly,
  id: z.number().int().positive(),
  input: z.object({
    full_name: z.string().trim().min(2).max(120).optional(),
    role_id: z.number().int().positive().optional()
  })
})

export const userPasswordSchema = z.object({
  token: tokenOnly,
  id: z.number().int().positive(),
  password: z.string().min(8, 'Password must be at least 8 characters').max(128),
  mustChange: z.boolean()
})

export const ownPasswordSchema = z.object({
  token: tokenOnly,
  current_password: z.string().min(1, 'Current password is required').max(128),
  new_password: z.string().min(8, 'Password must be at least 8 characters').max(128)
})

// ---------- Backups (Checkpoint 4) ----------

export const backupRestoreSchema = z.object({ token: tokenOnly, filePath: z.string().min(1).max(500) })

// ---------- Audit log (Checkpoint 4) ----------

export const auditListSchema = z.object({
  token: tokenOnly,
  page: z.number().int().min(1),
  pageSize: z.number().int().min(10).max(200),
  query: z.string().max(120).optional()
})

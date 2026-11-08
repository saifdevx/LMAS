/**
 * Central financial calculation service (pure functions).
 *
 * PRD §3: "The application must use a centralized financial calculation
 * service. Individual screens must not implement their own independent
 * commission or payment calculations." Every module MUST import from here.
 *
 * All amounts are INTEGER PAISA. All commission rates are INTEGER BASIS
 * POINTS (50% = 5000 bp) so no floats ever touch money or rates.
 */

export type PatientCategory = 'SELF' | 'REFERRED'
export type CommissionBasis = 'NET_BILL' | 'COLLECTED'

export interface CommissionResult {
  /** Practitioner commission in paisa (0 for self patients). */
  commissionPaisa: number
  /** Laboratory allocation = eligible amount - commission (remainder, PRD §3.2). */
  labAllocationPaisa: number
}

/**
 * Calculate practitioner commission and laboratory allocation.
 *
 * - Self patient  : commission 0, laboratory allocation = full eligible amount.
 * - Referred      : commission = roundHalfUp(eligible * rateBp / 10000),
 *                   allocation = eligible - commission (remainder prevents
 *                   rounding discrepancies, PRD §3.2).
 *
 * Integer-exact half-up rounding: no floating point is involved.
 */
export function calculateCommission(opts: {
  category: PatientCategory
  /** Eligible commission amount in paisa (basis per configured policy). */
  eligibleAmountPaisa: number
  /** Rate in basis points, 0..10000. */
  rateBp: number
}): CommissionResult {
  const { category, eligibleAmountPaisa, rateBp } = opts
  if (!Number.isInteger(eligibleAmountPaisa) || eligibleAmountPaisa < 0) {
    throw new Error('Eligible amount must be a non-negative integer (paisa)')
  }
  if (!Number.isInteger(rateBp) || rateBp < 0 || rateBp > 10000) {
    throw new Error('Commission rate must be an integer between 0 and 10000 basis points')
  }
  if (category === 'SELF') {
    return { commissionPaisa: 0, labAllocationPaisa: eligibleAmountPaisa }
  }
  const product = eligibleAmountPaisa * rateBp
  const commission = Math.floor(product / 10000) + (product % 10000 >= 5000 ? 1 : 0)
  return { commissionPaisa: commission, labAllocationPaisa: eligibleAmountPaisa - commission }
}

export interface BillTotals {
  subtotalPaisa: number
  discountPaisa: number
  netPaisa: number
}

/**
 * Bill totals: Net Bill = Subtotal - Discount (PRD §3.1).
 * Discounts must never produce a negative bill; violations throw.
 */
export function calculateBillTotals(
  lines: Array<{ lineTotalPaisa: number }>,
  discountPaisa: number
): BillTotals {
  let subtotal = 0
  for (const line of lines) {
    if (!Number.isInteger(line.lineTotalPaisa) || line.lineTotalPaisa < 0) {
      throw new Error('Each line total must be a non-negative integer (paisa)')
    }
    subtotal += line.lineTotalPaisa
  }
  if (!Number.isInteger(discountPaisa) || discountPaisa < 0) {
    throw new Error('Discount must be a non-negative integer (paisa)')
  }
  if (discountPaisa > subtotal) {
    throw new Error('Discount cannot exceed the subtotal - the bill can never be negative')
  }
  return { subtotalPaisa: subtotal, discountPaisa, netPaisa: subtotal - discountPaisa }
}

/** Outstanding Patient Balance = Net Bill - Total Valid Payments (PRD §3.4). */
export function outstandingPatientBalance(netPaisa: number, totalValidPaymentsPaisa: number): number {
  if (!Number.isInteger(netPaisa) || netPaisa < 0) throw new Error('Net bill must be a non-negative integer (paisa)')
  if (!Number.isInteger(totalValidPaymentsPaisa) || totalValidPaymentsPaisa < 0) {
    throw new Error('Total payments must be a non-negative integer (paisa)')
  }
  return netPaisa - totalValidPaymentsPaisa
}

/** Outstanding Commission = Commission Accrued - Valid Commission Payments (PRD §3.5). */
export function outstandingCommission(accruedPaisa: number, paidPaisa: number): number {
  if (!Number.isInteger(accruedPaisa) || accruedPaisa < 0) throw new Error('Accrued must be a non-negative integer (paisa)')
  if (!Number.isInteger(paidPaisa) || paidPaisa < 0) throw new Error('Paid must be a non-negative integer (paisa)')
  return accruedPaisa - paidPaisa
}

/**
 * Estimated management-accounting profit (PRD §3.8):
 * Net Profit = Net Billed Revenue - Practitioner Commission - Direct Test Costs - Operating Expenses.
 * This is a MANAGEMENT figure. Billed revenue must never be presented as cash received.
 */
export function estimateNetProfit(parts: {
  netBilledPaisa: number
  commissionPaisa: number
  directCostsPaisa: number
  operatingExpensesPaisa: number
}): number {
  for (const [key, value] of Object.entries(parts)) {
    if (!Number.isInteger(value)) throw new Error(`${key} must be an integer (paisa)`)
  }
  return (
    parts.netBilledPaisa - parts.commissionPaisa - parts.directCostsPaisa - parts.operatingExpensesPaisa
  )
}

/** Convert a percentage such as 50 or 12.5 into integer basis points (5000 / 1250). */
export function percentToBp(percent: number): number {
  if (!Number.isFinite(percent) || percent < 0 || percent > 100) {
    throw new Error('Percentage must be between 0 and 100')
  }
  const bp = Math.round(percent * 100)
  return bp
}

/** Convert basis points to a display percentage (5000 -> 50). */
export function bpToPercent(bp: number): number {
  return bp / 100
}

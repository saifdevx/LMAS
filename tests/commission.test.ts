import { describe, it, expect } from 'vitest'
import {
  calculateCommission,
  calculateBillTotals,
  outstandingPatientBalance,
  outstandingCommission,
  estimateNetProfit,
  percentToBp,
  bpToPercent
} from '../src/shared/commission'

/**
 * Scenarios from PRD §11 ("Important Business Scenarios to Test"),
 * validated at the calculation-service level in Checkpoint 1.
 */
describe('PRD Scenario 1 — Self patient', () => {
  it('keeps 100% for the laboratory and zero commission', () => {
    const bill = calculateBillTotals([{ lineTotalPaisa: 80000 }, { lineTotalPaisa: 30000 }], 0)
    expect(bill.netPaisa).toBe(110000) // PKR 1,100
    const result = calculateCommission({ category: 'SELF', eligibleAmountPaisa: bill.netPaisa, rateBp: 5000 })
    expect(result).toEqual({ commissionPaisa: 0, labAllocationPaisa: 110000 })
  })
})

describe('PRD Scenario 2 — Referred patient at 50%', () => {
  it('splits PKR 2,000 exactly 50/50', () => {
    const bill = calculateBillTotals([{ lineTotalPaisa: 80000 }, { lineTotalPaisa: 120000 }], 0)
    expect(bill.netPaisa).toBe(200000)
    const result = calculateCommission({ category: 'REFERRED', eligibleAmountPaisa: bill.netPaisa, rateBp: 5000 })
    expect(result).toEqual({ commissionPaisa: 100000, labAllocationPaisa: 100000 })
  })
})

describe('PRD Scenario 3 — Different commission rate (40%)', () => {
  it('computes 1,200 / 1,800 on a 3,000 bill', () => {
    const result = calculateCommission({ category: 'REFERRED', eligibleAmountPaisa: 300000, rateBp: 4000 })
    expect(result).toEqual({ commissionPaisa: 120000, labAllocationPaisa: 180000 })
  })
})

describe('PRD Scenario 4 — Discounted referred bill (basis: net after discount)', () => {
  it('uses the net bill as the eligible amount', () => {
    const bill = calculateBillTotals([{ lineTotalPaisa: 250000 }], 50000)
    expect(bill.netPaisa).toBe(200000)
    const result = calculateCommission({ category: 'REFERRED', eligibleAmountPaisa: bill.netPaisa, rateBp: 5000 })
    expect(result).toEqual({ commissionPaisa: 100000, labAllocationPaisa: 100000 })
  })
})

describe('Rounding rules (PRD §3.2)', () => {
  it('rounds commission half-up to the paisa and takes allocation as remainder', () => {
    // PKR 1,000.01 at 50% -> commission PKR 500.01 (half-up), allocation PKR 500.00
    const result = calculateCommission({ category: 'REFERRED', eligibleAmountPaisa: 100001, rateBp: 5000 })
    expect(result.commissionPaisa).toBe(50001)
    expect(result.labAllocationPaisa).toBe(50000)
    expect(result.commissionPaisa + result.labAllocationPaisa).toBe(100001) // no paisa lost
  })

  it('rounds 33.335% cases consistently', () => {
    const result = calculateCommission({ category: 'REFERRED', eligibleAmountPaisa: 100000, rateBp: 3334 })
    expect(result.commissionPaisa).toBe(33340)
    expect(result.labAllocationPaisa).toBe(66660)
  })
})

describe('Bill totals guardrails (PRD §3.1)', () => {
  it('rejects discounts larger than the subtotal', () => {
    expect(() => calculateBillTotals([{ lineTotalPaisa: 100000 }], 150000)).toThrow(/negative|exceed/i)
  })
  it('rejects negative discounts and non-integer paisa', () => {
    expect(() => calculateBillTotals([{ lineTotalPaisa: 100000 }], -1)).toThrow()
    expect(() => calculateBillTotals([{ lineTotalPaisa: 100.5 }], 0)).toThrow()
  })
})

describe('Outstanding balances (PRD §3.4 / §3.5)', () => {
  it('Scenario 5: partial patient payments leave PKR 500 outstanding', () => {
    // Net 2,000; payments 1,000 + 500 = 1,500 -> outstanding 500
    expect(outstandingPatientBalance(200000, 150000)).toBe(50000)
  })
  it('Scenario 6: partial commission payment leaves PKR 3,000 outstanding', () => {
    expect(outstandingCommission(500000, 200000)).toBe(300000)
  })
})

describe('Estimated profit (PRD §3.8)', () => {
  it('deducts commission, direct costs and expenses from net billed revenue', () => {
    const profit = estimateNetProfit({
      netBilledPaisa: 200000,
      commissionPaisa: 100000,
      directCostsPaisa: 25000,
      operatingExpensesPaisa: 30000
    })
    expect(profit).toBe(45000)
  })
})

describe('Commission rate helpers', () => {
  it('converts percentages and basis points', () => {
    expect(percentToBp(50)).toBe(5000)
    expect(percentToBp(12.5)).toBe(1250)
    expect(bpToPercent(4500)).toBe(45)
    expect(() => percentToBp(150)).toThrow()
  })
})

import { describe, it, expect } from 'vitest'
import { toPaisa, paisaToRupees, formatPKR, formatDisplayDate } from '../src/shared/money'

describe('money utilities (integer paisa storage)', () => {
  it('converts rupees to paisa', () => {
    expect(toPaisa(2000)).toBe(200000)
    expect(toPaisa(0)).toBe(0)
    expect(toPaisa(0.1)).toBe(10)
    expect(toPaisa(2.005)).toBe(201) // half-up at the paisa level
  })

  it('accepts user-typed strings with separators', () => {
    expect(toPaisa('2,000')).toBe(200000)
    expect(toPaisa(' 1,250.50 ')).toBe(125050)
    expect(toPaisa('500')).toBe(50000)
  })

  it('rejects invalid and negative amounts', () => {
    expect(() => toPaisa(-1)).toThrow()
    expect(() => toPaisa('abc')).toThrow()
    expect(() => toPaisa('12.345')).toThrow()
    expect(() => toPaisa(Number.NaN)).toThrow()
    expect(() => toPaisa(Number.POSITIVE_INFINITY)).toThrow()
  })

  it('converts back to rupees', () => {
    expect(paisaToRupees(200000)).toBe(2000)
    expect(paisaToRupees(1)).toBe(0.01)
  })

  it('formats PKR with thousands separators (PRD Module I)', () => {
    expect(formatPKR(200000)).toBe('PKR 2,000.00')
    expect(formatPKR(0)).toBe('PKR 0.00')
    expect(formatPKR(5)).toBe('PKR 0.05')
    expect(formatPKR(123456789)).toBe('PKR 1,234,567.89')
    expect(formatPKR(-50000)).toBe('-PKR 500.00')
    expect(() => formatPKR(100.5)).toThrow() // non-integer paisa is a bug
  })

  it('formats DD-MM-YYYY display dates', () => {
    expect(formatDisplayDate('2026-01-08')).toBe('08-01-2026')
  })
})

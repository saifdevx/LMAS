/**
 * Central money utilities for LMAS.
 *
 * RULE (PRD §6.1 rule 2): all monetary amounts are stored and computed as
 * INTEGER PAISA (1 PKR = 100 paisa). Floating point is never used for
 * stored amounts. These helpers are the only sanctioned way to convert
 * between user-entered rupee amounts and stored paisa values.
 */

/** Convert a rupee amount (number or user-typed string such as "2,000.50") into integer paisa. */
export function toPaisa(rupees: number | string): number {
  let value: number
  if (typeof rupees === 'string') {
    const cleaned = rupees.replace(/[,\s]/g, '')
    if (!/^-?\d+(\.\d{1,2})?$/.test(cleaned)) {
      throw new Error(`Invalid amount: "${rupees}". Use a number with up to 2 decimal places.`)
    }
    value = Number(cleaned)
  } else {
    value = rupees
  }
  if (!Number.isFinite(value)) throw new Error('Amount must be a finite number')
  const paisa = Math.round((value + Number.EPSILON) * 100)
  if (paisa < 0) throw new Error('Amount cannot be negative')
  return paisa
}

/** Convert integer paisa back to a rupee number (for display inputs). */
export function paisaToRupees(paisa: number): number {
  return paisa / 100
}

/** Format integer paisa as a PKR string, e.g. 200000 -> "PKR 2,000.00". */
export function formatPKR(paisa: number): string {
  if (!Number.isInteger(paisa)) throw new Error('formatPKR expects integer paisa')
  const negative = paisa < 0
  const abs = Math.abs(paisa)
  const rupees = Math.floor(abs / 100)
  const paise = abs % 100
  const grouped = rupees.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',')
  return `${negative ? '-' : ''}PKR ${grouped}.${paise.toString().padStart(2, '0')}`
}

/** Format a date as DD-MM-YYYY (PRD §Module I reporting convention). */
export function formatDisplayDate(isoDate: string): string {
  const [y, m, d] = isoDate.split('-')
  if (!y || !m || !d) return isoDate
  return `${d}-${m}-${y}`
}

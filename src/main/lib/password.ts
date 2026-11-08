import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto'

/**
 * Password hashing with Node's built-in scrypt (established algorithm,
 * PRD §7.5) — no extra native dependency. Stored format:
 *   scrypt$<saltHex>$<hashHex>
 */
const KEY_LENGTH = 64

export function hashPassword(password: string): string {
  if (password.length < 8) throw new Error('Password must be at least 8 characters long')
  const salt = randomBytes(16).toString('hex')
  const hash = scryptSync(password, salt, KEY_LENGTH).toString('hex')
  return `scrypt$${salt}$${hash}`
}

export function verifyPassword(password: string, stored: string): boolean {
  const parts = stored.split('$')
  if (parts.length !== 3 || parts[0] !== 'scrypt') return false
  const [, salt, expectedHex] = parts
  try {
    const expected = Buffer.from(expectedHex, 'hex')
    const actual = scryptSync(password, salt, KEY_LENGTH)
    return expected.length === actual.length && timingSafeEqual(actual, expected)
  } catch {
    return false
  }
}
